// Package main — point d'entrée du backend Openvote.
//
// Couvre trois audit points :
//   - M3 (opérationnel) : graceful shutdown. Le serveur HTTP ET le worker
//     de triangulation sont arrêtés proprement sur SIGINT/SIGTERM. Les
//     requêtes en cours ont 30s pour finir, le worker finit de traiter
//     le message en cours puis rend la main.
//   - M4 (fiabilité) : fail-fast en production. Si DB ou RabbitMQ ne
//     répondent pas au boot, l'app refuse de démarrer (= crashloop visible
//     dans k8s/Cloud Run) au lieu de démarrer à moitié mort avec des
//     nil pointers. En dev, on garde le warning + continue pour ne pas
//     casser le workflow des devs locaux qui n'ont pas toujours Docker.
//   - H2/H5 : la config DB (sslmode, pool) est centralisée dans
//     platform/database — voir postgres.go pour le détail.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/delivery/http/handler"
	"github.com/openvote/backend/internal/delivery/http/middleware"
	"github.com/openvote/backend/internal/platform/database"
	"github.com/openvote/backend/internal/platform/queue"
	"github.com/openvote/backend/internal/platform/storage"
	"github.com/openvote/backend/internal/repository/postgres"
	"github.com/openvote/backend/internal/service"
	"github.com/openvote/backend/internal/worker"
)

// appEnv lit APP_ENV avec un défaut "development" si non défini.
func appEnv() string {
	if v := os.Getenv("APP_ENV"); v != "" {
		return v
	}
	return "development"
}

// isProd retourne true si on tourne en production (fail-fast activé).
func isProd() bool {
	return appEnv() == "production"
}

func main() {
	// ============================================================
	// Contexte racine + signal handling (M3 audit)
	// ============================================================
	// signal.NotifyContext retourne un ctx qui est annulé dès qu'un
	// SIGINT (Ctrl+C) ou SIGTERM (k8s rolling deploy) arrive. Tous les
	// workers lancés depuis main() doivent recevoir CE ctx pour pouvoir
	// s'arrêter proprement.
	rootCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// ============================================================
	// Initialisation DB (H2 + H5)
	// ============================================================
	db, err := database.NewPostgresDB()
	if err != nil {
		// M4 audit : en prod on refuse de démarrer avec une DB HS
		// (crashloop visible > API à moitié morte avec nil pointers).
		// En dev on continue pour ne pas casser les devs qui n'ont pas
		// forcément Postgres qui tourne localement.
		if isProd() {
			log.Fatalf("FATAL: DB indisponible au boot (APP_ENV=production) : %v", err)
		}
		log.Printf("Warning: Could not connect to database: %v. Running in degraded mode.", err)
	}
	if db != nil {
		defer func() {
			if cerr := db.Close(); cerr != nil {
				log.Printf("[DB] close: %v", cerr)
			}
		}()
	}

	// ============================================================
	// Initialisation RabbitMQ
	// ============================================================
	rabbitURL := os.Getenv("RABBITMQ_URL")
	if rabbitURL == "" {
		rabbitURL = "amqp://user:password@localhost:5672/"
	}
	publisher, err := queue.NewRabbitPublisher(rabbitURL)
	if err != nil {
		if isProd() {
			log.Fatalf("FATAL: RabbitMQ publisher indisponible au boot (APP_ENV=production) : %v", err)
		}
		log.Printf("Warning: Could not connect to RabbitMQ: %v. Async features disabled.", err)
	} else {
		defer publisher.Close()
	}

	consumer, err := queue.NewRabbitConsumer(rabbitURL)
	if err != nil {
		if isProd() {
			log.Fatalf("FATAL: RabbitMQ consumer indisponible au boot (APP_ENV=production) : %v", err)
		}
		log.Printf("Warning: Could not connect RabbitMQ Consumer: %v", err)
	} else {
		defer consumer.Close()
	}

	// ============================================================
	// Initialisation MinIO
	// ============================================================
	// MinIO héberge les photos des signalements. Si HS au boot, l'API
	// reste fonctionnelle pour la lecture (auth, MFA, KPIs) mais les
	// uploads échouent. On garde le warning + continue en dev (les devs
	// n'ont pas toujours MinIO qui tourne localement), et on fail-fast
	// en prod : si le stockage objet est down au boot, l'API doit refuser
	// de démarrer plutôt que d'accepter du trafic qu'elle ne pourra pas
	// servir correctement (= crashloop visible > 503 silencieux sur
	// /ready). Cf. M4 audit (même politique que DB et RabbitMQ).
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	if minioEndpoint == "" {
		minioEndpoint = "minio:9000"
	}
	minioAccessKey := os.Getenv("MINIO_ACCESS_KEY")
	if minioAccessKey == "" {
		if isProd() {
			log.Fatalf("FATAL: MINIO_ACCESS_KEY non défini en production")
		}
		log.Printf("Warning: MINIO_ACCESS_KEY non défini — fallback 'minioadmin' (DANGER EN PROD)")
		minioAccessKey = "minioadmin"
	}
	minioSecretKey := os.Getenv("MINIO_SECRET_KEY")
	if minioSecretKey == "" {
		if isProd() {
			log.Fatalf("FATAL: MINIO_SECRET_KEY non défini en production")
		}
		log.Printf("Warning: MINIO_SECRET_KEY non défini — fallback 'minioadmin' (DANGER EN PROD)")
		minioSecretKey = "minioadmin"
	}
	storagePlatform, err := storage.NewMinioStorage(minioEndpoint, minioAccessKey, minioSecretKey, false)
	if err != nil {
		// M4 audit : fail-fast en prod si MinIO est injoignable au boot.
		if isProd() {
			log.Fatalf("FATAL: MinIO indisponible au boot (APP_ENV=production) : %v", err)
		}
		log.Printf("Warning: Could not connect to MinIO: %v. Running with uploads disabled.", err)
	}
	if storagePlatform == nil && isProd() {
		// Filet de sécurité : NewMinioStorage ne retourne (nil, nil) qu'en cas
		// de bug interne. En prod on préfère crashloop que de servir du
		// trafic avec un storage nil qui NPE au premier upload.
		log.Fatalf("FATAL: MinIO storage non initialisé en production (nil sans erreur)")
	}
	storageService := service.NewStorageService(storagePlatform, "evidence")
	if storagePlatform != nil {
		if err := storageService.Initialize(context.Background()); err != nil {
			log.Printf("Warning: Could not initialize storage bucket: %v", err)
		}
	}

	// ============================================================
	// Injection des dépendances
	// ============================================================
	if db == nil {
		// En dev dégradé, on NE PEUT PAS continuer : les repos vont NPE
		// au premier appel. On log et on exit (≠ prod où on a déjà crashé).
		if !isProd() {
			log.Fatalf("DB indisponible — impossible d'initialiser les repositories (même en dev dégradé).")
		}
	}
	userRepo := postgres.NewUserRepository(db)
	reportRepo := postgres.NewReportRepository(db)
	regionRepo := postgres.NewRegionRepository(db)
	electionRepo := postgres.NewElectionRepository(db)
	auditLogRepo := postgres.NewAuditLogRepository(db)
	incidentTypeRepo := postgres.NewIncidentTypeRepository(db)
	legalRepo := postgres.NewLegalRepository(db)

	// ============================================================
	// Exécution des migrations (refonte fail-fast, 2026-07-12)
	// ============================================================
	// Voir cmd/api/migrations.go pour le détail de l'implémentation
	// (runMigrations). En bref : tracking via schema_migrations,
	// transaction par migration, log.Fatalf sur toute erreur.
	if err := runMigrations(db, allMigrations); err != nil {
		log.Fatalf("[MIGRATION] Échec — arrêt du backend : %v", err)
	}

	enrolmentService := service.NewEnrolmentService(userRepo)
	reportService := service.NewReportService(reportRepo, publisher)

	// Service d'embedding (connexion Ollama)
	embeddingService := service.NewEmbeddingService()

	// Service d'analyse juridique LLM (Mistral via Ollama)
	legalAnalysisService := service.NewLegalAnalysisService()

	// Service MFA TOTP (H3 audit) — utilisé par authService pour vérifier les codes.
	mfaService := service.NewMFAService()

	// Audit log repo (H3) — passé à authService pour tracer les événements d'auth.
	authService := service.NewAuthService(userRepo, mfaService, auditLogRepo)

	authHandler := handler.NewAuthHandler(authService, enrolmentService)
	reportHandler := handler.NewReportHandler(reportService, storageService)
	statsHandler := handler.NewStatsHandler(reportService)
	regionHandler := handler.NewRegionHandler(regionRepo)
	electionHandler := handler.NewElectionHandler(electionRepo)
	incidentTypeHandler := handler.NewIncidentTypeHandler(incidentTypeRepo)

	// Handlers admin découpés par domaine (cf. M1 audit).
	usersHandler := handler.NewUsersHandler(enrolmentService, userRepo, auditLogRepo)
	auditHandler := handler.NewAuditHandler(auditLogRepo)
	configHandler := handler.NewConfigHandler(auditLogRepo)
	kpisHandler := handler.NewKPIsHandler(userRepo, reportService, electionRepo)
	legalHandler := handler.NewLegalHandler(legalRepo)
	ragHandler := handler.NewRAGHandler(legalRepo, reportService, embeddingService, legalAnalysisService)

	// ============================================================
	// Worker de triangulation (M3 audit : ctx annulable)
	// ============================================================
	// On passe rootCtx pour que le worker s'arrête sur SIGTERM au lieu
	// d'être tué brutalement. Le ctx est aussi propagé au handler de
	// message pour respecter une annulation en cours de traitement.
	triangulationService := service.NewTriangulationService(reportRepo)
	var reportConsumer *worker.ReportConsumer
	if consumer != nil {
		reportConsumer = worker.NewReportConsumer(consumer, triangulationService)
		go func() {
			if err := reportConsumer.Start(rootCtx); err != nil && !errors.Is(err, context.Canceled) {
				log.Printf("[WORKER] Start returned: %v", err)
			}
		}()
	}

	// ============================================================
	// Configuration du routeur (inchangé)
	// ============================================================
	r := gin.Default()

	// CORS strict (H1 audit) : whitelist explicite, fail-fast en prod.
	middleware.InitCORS()
	r.Use(middleware.CORSMiddleware())

	// Middleware
	authMiddleware := middleware.AuthMiddleware(authService, userRepo)
	rateLimiter := middleware.RateLimitMiddleware(100, time.Minute)              // 100 req/min global
	authRateLimiter := middleware.RateLimitMiddleware(10, time.Minute)           // 10 req/min auth (anti brute-force)
	tokenGenRateLimiter := middleware.RateLimitMiddleware(5, time.Minute)        // H6 : 5 génération tokens/min
	userMgmtRateLimiter := middleware.RateLimitMiddleware(30, time.Minute)       // 30 ops CRUD users/min

	// Routes API Versioning
	api := r.Group("/api/v1")
	api.Use(rateLimiter) // Rate limiting global
	{
		// Auth (rate limiting strict anti brute-force)
		auth := api.Group("/auth")
		auth.Use(authRateLimiter)
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/enroll", authHandler.Enroll)

			// MFA (H3) — /mfa/verify et /mfa/backup n'ont PAS besoin du authMiddleware
			// car ils consomment un challenge token (aud=mfa) déjà signé.
			// /mfa/setup et /mfa/disable exigent un JWT d'accès normal.
			auth.POST("/mfa/setup", authMiddleware, authHandler.SetupMFA)
			auth.POST("/mfa/verify", authHandler.VerifyMFA)
			auth.POST("/mfa/backup", authHandler.VerifyMFABackup)
			auth.POST("/mfa/disable", authMiddleware, authHandler.DisableMFA)
			auth.POST("/mfa/confirm-setup", authMiddleware, authHandler.ConfirmMFASetup)
			auth.GET("/mfa/status", authMiddleware, authHandler.GetMFAStatus)
		}

		// Régions & Départements (lecture pour tous les utilisateurs authentifiés)
		api.GET("/regions", authMiddleware, regionHandler.ListRegions)
		api.GET("/departments", authMiddleware, regionHandler.ListDepartments)
		api.GET("/incident-types", authMiddleware, incidentTypeHandler.List)

		// Rapports
		reports := api.Group("/reports")
		reports.Use(authMiddleware)
		{
			reports.POST("", reportHandler.Create)
			reports.GET("", reportHandler.List)
			reports.GET("/upload-url", reportHandler.GetUploadURL)
			// UUID middleware : refuse les IDs non-UUID (ex: "1", "abc")
			// avec un 400 propre avant d'atteindre le handler. Sans
			// ça, le driver postgres renverrait "invalid input syntax
			// for type uuid" → 500.
			reports.GET("/:id", middleware.RequireUUIDParam("id"), reportHandler.GetDetails)
			reports.PATCH("/:id", middleware.RequireUUIDParam("id"), reportHandler.UpdateStatus) // RBAC dans le handler
		}

		// Statistiques agrégées
		api.GET("/stats", authMiddleware, statsHandler.GetStats)

		// Routes admin — authentifié + rôle admin requis (M6)
		admin := api.Group("/admin")
		admin.Use(authMiddleware, middleware.AdminOnly())
		{
			// Utilisateurs & enrôlement — rate-limits dédiés (H6 audit).
			admin.POST("/generate-token", tokenGenRateLimiter, usersHandler.GenerateToken)
			admin.GET("/users", userMgmtRateLimiter, usersHandler.ListUsers)
			admin.PATCH("/users/:id", userMgmtRateLimiter, middleware.RequireUUIDParam("id"), usersHandler.UpdateUser)
			admin.DELETE("/users/:id", userMgmtRateLimiter, middleware.RequireUUIDParam("id"), usersHandler.DeleteUser)

			// Audit
			admin.GET("/audit-logs", auditHandler.GetAuditLogs)

			// Configuration runtime
			admin.GET("/config", configHandler.GetConfig)
			admin.PATCH("/config", configHandler.UpdateConfig)

			// KPIs dashboard
			admin.GET("/kpis", kpisHandler.GetKPIs)

			// Cadre légal — CMS
			admin.GET("/legal", legalHandler.GetLegalArticles)
			admin.POST("/legal", legalHandler.CreateLegalArticle)
			admin.POST("/legal/batch", legalHandler.BatchCreateLegalArticles)
			admin.POST("/legal/extract-pdf", legalHandler.ExtractTextFromPDF)
			admin.DELETE("/legal/:id", middleware.RequireUUIDParam("id"), legalHandler.DeleteLegalArticle)
			admin.GET("/legal-documents", legalHandler.GetLegalDocuments)
			admin.POST("/legal-documents", legalHandler.CreateLegalDocument)
			admin.DELETE("/legal-documents/:id", middleware.RequireUUIDParam("id"), legalHandler.DeleteLegalDocument)

			// Base de Connaissance Juridique (RAG) — split rag_handler (M1)
			admin.POST("/legal/search", ragHandler.SemanticSearchArticles)
			admin.POST("/legal/embeddings", ragHandler.GenerateEmbeddings)
			admin.POST("/reports/:id/qualify", middleware.RequireUUIDParam("id"), ragHandler.QualifyReport)
			admin.POST("/reports/:id/analyze", middleware.RequireUUIDParam("id"), ragHandler.AnalyzeReport)
			admin.GET("/reports/:id/legal-matches", middleware.RequireUUIDParam("id"), ragHandler.GetReportMatches)
			admin.GET("/reports/:id/analysis", middleware.RequireUUIDParam("id"), ragHandler.GetReportAnalysis)

			// Régions & Départements (admin CRUD)
			admin.POST("/regions", regionHandler.CreateRegion)
			admin.PATCH("/regions/:id", middleware.RequireUUIDParam("id"), regionHandler.UpdateRegion)
			admin.DELETE("/regions/:id", middleware.RequireUUIDParam("id"), regionHandler.DeleteRegion)
			admin.POST("/departments", regionHandler.CreateDepartment)
			admin.PATCH("/departments/:id", middleware.RequireUUIDParam("id"), regionHandler.UpdateDepartment)
			admin.DELETE("/departments/:id", middleware.RequireUUIDParam("id"), regionHandler.DeleteDepartment)

			// Import CSV démographie (admin) — handlers existants depuis
			// backend/internal/delivery/http/handler/region_handler.go
			admin.POST("/regions/import-csv", regionHandler.ImportCSV)
			admin.GET("/regions/import-csv/template", regionHandler.DownloadCSVTemplate)
			admin.GET("/regions/import-csv/history", regionHandler.GetDataImports)
			// Évolution démographique d'un département (time series pour graphique)
			admin.GET("/departments/:id/demographics-history", middleware.RequireUUIDParam("id"), regionHandler.GetDepartmentDemographicsHistory)

			// Arrondissements (admin CRUD)
			admin.POST("/arrondissements", regionHandler.CreateArrondissement)
			admin.PATCH("/arrondissements/:id", middleware.RequireUUIDParam("id"), regionHandler.UpdateArrondissement)
			admin.DELETE("/arrondissements/:id", middleware.RequireUUIDParam("id"), regionHandler.DeleteArrondissement)

			// Élections (admin CRUD)
			admin.GET("/elections", electionHandler.List)
			admin.POST("/elections", electionHandler.Create)
			admin.PATCH("/elections/:id", middleware.RequireUUIDParam("id"), electionHandler.Update)
			admin.PATCH("/elections/:id/status", middleware.RequireUUIDParam("id"), electionHandler.UpdateStatus)
			admin.DELETE("/elections/:id", middleware.RequireUUIDParam("id"), electionHandler.Delete)

			// Types d'incidents (admin CRUD)
			admin.POST("/incident-types", incidentTypeHandler.Create)
			admin.DELETE("/incident-types/:id", middleware.RequireUUIDParam("id"), incidentTypeHandler.Delete)
		}
	}

	// ============================================================
	// Health check (public)
	// ============================================================
	// H5 audit : on sépare liveness et readiness.
	//   - /health (liveness) : "le process tourne". k8s restart si KO.
	//   - /ready  (readiness) : "DB dispo + RabbitMQ up + MinIO up".
	//                          k8s retire du LB si KO.
	// Sans cette séparation, un blip DB de 5s redémarre tous les pods.
	var extraCheckers []handler.NamedChecker
	if publisher != nil {
		extraCheckers = append(extraCheckers, handler.NamedChecker{Name: "rabbitmq_publisher", Check: publisher})
	}
	if consumer != nil {
		extraCheckers = append(extraCheckers, handler.NamedChecker{Name: "rabbitmq_consumer", Check: consumer})
	}
	if storagePlatform != nil {
		// Ajoute MinIO au readiness probe : si le serveur d'objets tombe,
		// k8s/Cloud Run retire ce pod du load balancer (les uploads échouent
		// sinon en cascade). Le PingContext respecte le timeout 2s du handler.
		extraCheckers = append(extraCheckers, handler.NamedChecker{Name: "minio", Check: storagePlatform})
	}
	healthHandler := handler.NewHealthHandler(db, extraCheckers)

	r.GET("/health", healthHandler.Liveness)
	r.GET("/ready", healthHandler.Readiness)

	// ============================================================
	// Démarrage HTTP + graceful shutdown (M3 audit)
	// ============================================================
	port := os.Getenv("PORT")
	if port == "" {
		port = "8095"
	}

	// Timeouts durs sur le serveur HTTP. Sans ça, des connexions lentes
	// (Slowloris, header attacks) peuvent épuiser les FD du process.
	// ReadHeaderTimeout 5s bloque le pire ; ReadTimeout 30s protège le
	// body ; WriteTimeout 30s force l'envoi d'une réponse même bloquée.
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Lance le serveur dans une goroutine pour ne PAS bloquer main().
	// On capture aussi les erreurs de démarrage (port déjà pris, etc.).
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("[HTTP] Server starting on port %s (APP_ENV=%s)", port, appEnv())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
		close(serverErr)
	}()

	// Bloque jusqu'à : signal d'arrêt OU erreur fatale du serveur.
	select {
	case err := <-serverErr:
		if err != nil {
			log.Fatalf("[HTTP] Server failed: %v", err)
		}
	case <-rootCtx.Done():
		log.Printf("[HTTP] Signal reçu, arrêt en cours (timeout 30s)…")
	}

	// ============================================================
	// Phase d'arrêt (graceful shutdown)
	// ============================================================
	// 1. Arrête d'accepter de nouvelles connexions HTTP et attend
	//    que les requêtes en cours finissent (max 30s).
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[HTTP] Shutdown error: %v", err)
	} else {
		log.Printf("[HTTP] HTTP server stopped cleanly")
	}

	// 2. Le rootCtx est déjà annulé par signal.NotifyContext — le worker
	//    de triangulation le voit et termine son message en cours.
	//    On attend le canal Done() exposé par ReportConsumer (1-shot, fermé
	//    par le goroutine interne quand la boucle de messages sort).
	//    Garde-fou 10s : si le worker freeze (handler bloqué non interruptible),
	//    on log et on rend la main au process plutôt que d'attendre un message
	//    qui ne viendra jamais.
	if reportConsumer != nil {
		select {
		case <-reportConsumer.Done():
			log.Printf("[WORKER] Worker stopped")
		case <-time.After(10 * time.Second):
			log.Printf("[WORKER] Worker stop timeout (10s) — kill probable")
		}
	}

	log.Printf("[MAIN] Openvote backend stopped")
}
