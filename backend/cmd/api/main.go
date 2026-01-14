package main

import (
	"log"
	"net/http"
	"os"
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

	// Initialisation MinIO
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	if minioEndpoint == "" {
		minioEndpoint = "localhost:9095"
	}
	storagePlatform, err := storage.NewMinioStorage(minioEndpoint, "minioadmin", "minioadmin", false)
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

	authService := service.NewAuthService(userRepo)
	enrolmentService := service.NewEnrolmentService(userRepo)
	// Injecte le publisher
	reportService := service.NewReportService(reportRepo, publisher)

	authHandler := handler.NewAuthHandler(authService, enrolmentService)
	reportHandler := handler.NewReportHandler(reportService, storageService)
	adminHandler := handler.NewAdminHandler(enrolmentService)

	// Démarrage du Worker de Triangulation
	triangulationService := service.NewTriangulationService(reportRepo)
	if consumer != nil {
		reportConsumer := worker.NewReportConsumer(consumer, triangulationService)
		go reportConsumer.Start(context.Background())
	}

	// Configuration du routeur
	r := gin.Default()

	// ... CORS ...

	// Configuration CORS (Permissif pour le dev)
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"}, // À restreindre en prod ex: "http://localhost:5173"
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Middleware
	authMiddleware := middleware.AuthMiddleware(authService)

	// Routes API Versioning
	api := r.Group("/api/v1")
	{
		// Auth
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/enroll", authHandler.Enroll)
		}

		// Admin
		admin := api.Group("/admin")
		admin.Use(authMiddleware) // Protect Admin
		{
			admin.POST("/generate-token", adminHandler.GenerateToken)
		}

		// Rapports
		reports := api.Group("/reports")
		reports.Use(authMiddleware) // Protect Reports
		{
			reports.POST("", reportHandler.Create)
			reports.GET("", reportHandler.List)
			reports.GET("/upload-url", reportHandler.GetUploadURL)
			reports.GET("/:id", reportHandler.GetDetails)
		}
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
