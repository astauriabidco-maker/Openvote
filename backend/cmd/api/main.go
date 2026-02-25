package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"context"

	"github.com/gin-contrib/cors"
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

func main() {
	// Initialisation de la base de données
	db, err := database.NewPostgresDB()
	if err != nil {
		log.Printf("Warning: Could not connect to database: %v. Running in degraded mode.", err)
	} else {
		defer db.Close()
	}

	// Initialisation RabbitMQ (connection string par défaut pour Docker)
	rabbitURL := os.Getenv("RABBITMQ_URL")
	if rabbitURL == "" {
		rabbitURL = "amqp://user:password@localhost:5672/"
	}
	publisher, err := queue.NewRabbitPublisher(rabbitURL)
	if err != nil {
		log.Printf("Warning: Could not connect to RabbitMQ: %v. Async features disabled.", err)
		// On pourrait utiliser un mock publisher ici pour ne pas crasher
	} else {
		defer publisher.Close()
	}

	consumer, err := queue.NewRabbitConsumer(rabbitURL)
	if err != nil {
		log.Printf("Warning: Could not connect RabbitMQ Consumer: %v", err)
	} else {
		defer consumer.Close()
	}

	// Initialisation MinIO (utilise le réseau Docker interne par défaut)
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	if minioEndpoint == "" {
		minioEndpoint = "minio:9000"
	}
	// Credentials MinIO depuis les variables d'environnement
	minioAccessKey := os.Getenv("MINIO_ACCESS_KEY")
	if minioAccessKey == "" {
		minioAccessKey = "minioadmin"
	}
	minioSecretKey := os.Getenv("MINIO_SECRET_KEY")
	if minioSecretKey == "" {
		minioSecretKey = "minioadmin"
	}
	storagePlatform, err := storage.NewMinioStorage(minioEndpoint, minioAccessKey, minioSecretKey, false)
	if err != nil {
		log.Printf("Warning: Could not connect to MinIO: %v", err)
	}
	storageService := service.NewStorageService(storagePlatform, "evidence")
	if storagePlatform != nil {
		if err := storageService.Initialize(context.Background()); err != nil {
			log.Printf("Warning: Could not initialize storage bucket: %v", err)
		}
	}

	// Injection des dépendances
	userRepo := postgres.NewUserRepository(db)
	reportRepo := postgres.NewReportRepository(db)
	regionRepo := postgres.NewRegionRepository(db)
	electionRepo := postgres.NewElectionRepository(db)
	auditLogRepo := postgres.NewAuditLogRepository(db)
	incidentTypeRepo := postgres.NewIncidentTypeRepository(db)
	legalRepo := postgres.NewLegalRepository(db)

	// Exécution des migrations
	for _, mig := range []struct{ file, name string }{
		{"migration/002_regions_departments.sql", "régions/départements"},
		{"migration/003_elections_audit_incidents.sql", "élections/audit/incidents"},
		{"migration/004_veille_electorale.sql", "veille électorale"},
		{"migration/005_legal_cms.sql", "CMS Légal"},
		{"migration/006_departments_data_enrichment.sql", "Données Démographiques"},
		{"migration/007_document_exploitation.sql", "Exploitation Documents"},
	} {
		data, err := os.ReadFile(mig.file)
		if err == nil {
			if _, err := db.Exec(string(data)); err != nil {
				log.Printf("[MIGRATION] Warning %s: %v", mig.name, err)
			} else {
				log.Printf("[MIGRATION] %s exécutée", mig.name)
			}
		}
	}

	authService := service.NewAuthService(userRepo)
	enrolmentService := service.NewEnrolmentService(userRepo)
	reportService := service.NewReportService(reportRepo, publisher)

	authHandler := handler.NewAuthHandler(authService, enrolmentService)
	reportHandler := handler.NewReportHandler(reportService, storageService)
	adminHandler := handler.NewAdminHandler(enrolmentService, userRepo, auditLogRepo, reportService, electionRepo, legalRepo)
	statsHandler := handler.NewStatsHandler(reportService)
	regionHandler := handler.NewRegionHandler(regionRepo)
	electionHandler := handler.NewElectionHandler(electionRepo)
	incidentTypeHandler := handler.NewIncidentTypeHandler(incidentTypeRepo)

	// Démarrage du Worker de Triangulation
	triangulationService := service.NewTriangulationService(reportRepo)
	if consumer != nil {
		reportConsumer := worker.NewReportConsumer(consumer, triangulationService)
		go reportConsumer.Start(context.Background())
	}

	// Configuration du routeur
	r := gin.Default()

	// ... CORS ...

	// Configuration CORS sécurisée (origines autorisées via env var)
	allowedOrigins := os.Getenv("CORS_ORIGINS")
	var origins []string
	if allowedOrigins != "" {
		origins = strings.Split(allowedOrigins, ",")
	} else {
		// Valeurs par défaut pour le développement local
		origins = []string{"http://localhost:8888", "http://localhost:5173", "http://localhost:3000"}
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Middleware
	authMiddleware := middleware.AuthMiddleware(authService, userRepo)
	rateLimiter := middleware.RateLimitMiddleware(100, time.Minute)       // 100 req/min
	authRateLimiter := middleware.RateLimitMiddleware(10, time.Minute)    // 10 req/min pour auth (anti brute-force)

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
		}

		// Admin (authentifié + rôle admin requis)
		admin := api.Group("/admin")
		admin.Use(authMiddleware, middleware.AdminOnly())
		{
			admin.POST("/generate-token", adminHandler.GenerateToken)
			admin.GET("/users", adminHandler.ListUsers)
			admin.PATCH("/users/:id", adminHandler.UpdateUser)
			admin.DELETE("/users/:id", adminHandler.DeleteUser)
			admin.GET("/audit-logs", adminHandler.GetAuditLogs)
			admin.GET("/config", adminHandler.GetConfig)
			admin.PATCH("/config", adminHandler.UpdateConfig)
			admin.GET("/kpis", adminHandler.GetKPIs)
			admin.GET("/legal", adminHandler.GetLegalArticles)
			admin.POST("/legal", adminHandler.CreateLegalArticle)
			admin.POST("/legal/batch", adminHandler.BatchCreateLegalArticles)
			admin.POST("/legal/extract-pdf", adminHandler.ExtractTextFromPDF)
			admin.DELETE("/legal/:id", adminHandler.DeleteLegalArticle)
			admin.GET("/legal-documents", adminHandler.GetLegalDocuments)
			admin.POST("/legal-documents", adminHandler.CreateLegalDocument)

			// Régions & Départements (admin CRUD)
			admin.POST("/regions", regionHandler.CreateRegion)
			admin.PATCH("/regions/:id", regionHandler.UpdateRegion)
			admin.DELETE("/regions/:id", regionHandler.DeleteRegion)
			admin.POST("/departments", regionHandler.CreateDepartment)
			admin.PATCH("/departments/:id", regionHandler.UpdateDepartment)
			admin.DELETE("/departments/:id", regionHandler.DeleteDepartment)

			// Elections (admin CRUD)
			admin.GET("/elections", electionHandler.List)
			admin.POST("/elections", electionHandler.Create)
			admin.PATCH("/elections/:id", electionHandler.Update)
			admin.PATCH("/elections/:id/status", electionHandler.UpdateStatus)
			admin.DELETE("/elections/:id", electionHandler.Delete)

			// Types d'incidents (admin CRUD)
			admin.POST("/incident-types", incidentTypeHandler.Create)
			admin.DELETE("/incident-types/:id", incidentTypeHandler.Delete)
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
			reports.GET("/:id", reportHandler.GetDetails)
			reports.PATCH("/:id", reportHandler.UpdateStatus) // Vérification RBAC dans le handler
		}

		// Statistiques agrégées (admin)
		api.GET("/stats", authMiddleware, statsHandler.GetStats)
	}

	// Santé
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8095"
	}

	log.Printf("Server starting on port %s", port)
	r.Run(":" + port)
}
