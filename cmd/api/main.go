package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	authDelivery "core-service/internal/auth/delivery/http"
	authRepo "core-service/internal/auth/infrastructure"
	authUsecase "core-service/internal/auth/usecase"
	"core-service/internal/config"
	"core-service/internal/messaging"
	serviceDelivery "core-service/internal/service/delivery/http"
	serviceRepo "core-service/internal/service/infrastructure"
	serviceUsecase "core-service/internal/service/usecase"
	"core-service/internal/storage"
	ticketDelivery "core-service/internal/ticket/delivery/http"
	ticketRepo "core-service/internal/ticket/infrastructure"
	ticketUsecase "core-service/internal/ticket/usecase"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	// Cargar variables de entorno desde .env si existe
	if err := godotenv.Load(); err != nil {
		log.Println("Aviso: no se pudo cargar .env (se usarán variables del sistema o defaults)")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET no está definido en las variables de entorno")
	}

	cfg := config.Load()

	// Cadena de conexión a PostgreSQL
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dbUser := envOr("POSTGRES_USER", "postgres")
		dbPass := envOr("POSTGRES_PASSWORD", "postgressecurepassword")
		dbHost := envOr("POSTGRES_HOST", "localhost")
		dbPort := envOr("POSTGRES_PORT", "5432")
		dbName := envOr("POSTGRES_DB", "core_service_db")
		dsn = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", dbUser, dbPass, dbHost, dbPort, dbName)
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Error abriendo la conexión a la base de datos: %v", err)
	}

	if err := db.Ping(); err != nil {
		log.Fatalf("Error haciendo ping a la base de datos: %v", err)
	}
	log.Println("Conexión exitosa a la base de datos PostgreSQL")

	// Wiring (Clean Architecture)
	s3Storage, err := storage.NewS3Storage(context.Background(), cfg)
	if err != nil {
		log.Fatalf("Error inicializando almacenamiento S3: %v", err)
	}

	var eventPublisher messaging.EventPublisher
	var rmqPublisher *messaging.RabbitMQPublisher
	if cfg.RabbitMQURL == "" {
		log.Println("Aviso: RABBITMQ_URL vacío; usando NoopPublisher (sin broker)")
		eventPublisher = messaging.NewNoopPublisher()
	} else {
		rmqPublisher, err = messaging.NewRabbitMQPublisher(cfg.RabbitMQURL, cfg.RabbitMQExchange)
		if err != nil {
			log.Fatalf("Error inicializando RabbitMQPublisher: %v", err)
		}
		defer func() {
			if closeErr := rmqPublisher.Close(); closeErr != nil {
				log.Printf("Error cerrando RabbitMQPublisher: %v", closeErr)
			}
		}()
		eventPublisher = rmqPublisher
		log.Printf("Conectado a RabbitMQ (exchange=%s)", cfg.RabbitMQExchange)
	}

	authRepoInstance := authRepo.NewPostgresAuthRepository(db)
	authUC := authUsecase.NewAuthUsecase(authRepoInstance)

	ticketRepoInstance := ticketRepo.NewPostgresTicketRepository(db)
	ticketUC := ticketUsecase.NewTicketUsecase(ticketRepoInstance, s3Storage, eventPublisher)

	serviceRepoInstance := serviceRepo.NewPostgresServiceRepository(db)
	serviceUC := serviceUsecase.NewServiceUsecase(serviceRepoInstance)

	app := fiber.New(fiber.Config{AppName: "Core-Service API (MVP)"})
	app.Use(logger.New())

	// CORS: permite el frontend local. Con AllowCredentials=true los orígenes deben ser
	// explícitos (nunca "*"), por eso config.Load garantiza una lista concreta.
	app.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowOrigins,
		AllowMethods:     "GET,POST,PATCH,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		AllowCredentials: true,
	}))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"status": "UP"})
	})

	v1 := app.Group("/api/v1")

	// Rutas públicas de autenticación y protegidas de perfil (/users/me) y admin (/admin/operarios)
	authDelivery.NewAuthHandler(v1, authUC, jwtSecret)

	// Rutas del catálogo de servicios y especialidades
	serviceHandler := serviceDelivery.NewServiceHandler(serviceUC)
	serviceDelivery.RegisterRoutes(v1, serviceHandler, jwtSecret)

	// Rutas protegidas de tickets
	ticketHandler := ticketDelivery.NewTicketHandler(ticketUC)
	ticketDelivery.RegisterRoutes(v1, ticketHandler, jwtSecret)

	port := envOr("PORT", "8080")

	// Graceful shutdown: escucha SIGINT/SIGTERM (docker compose down) y cierra
	// ordenadamente el servidor HTTP, RabbitMQ y la conexión a PostgreSQL.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("Iniciando servidor Core-Service en el puerto %s...", port)
		if err := app.Listen(":" + port); err != nil {
			log.Printf("Servidor Fiber detenido: %v", err)
		}
	}()

	<-quit
	log.Println("Señal de apagado recibida, cerrando servidor...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Printf("Error al apagar el servidor HTTP: %v", err)
	}

	if rmqPublisher != nil {
		if err := rmqPublisher.Close(); err != nil {
			log.Printf("Error al cerrar conexión a RabbitMQ: %v", err)
		}
	}

	if err := db.Close(); err != nil {
		log.Printf("Error al cerrar la conexión a PostgreSQL: %v", err)
	}

	log.Println("Apagado completo")
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
