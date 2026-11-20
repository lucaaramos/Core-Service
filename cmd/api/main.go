package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	authDelivery "core-service/internal/auth/delivery/http"
	authRepo "core-service/internal/auth/infrastructure"
	authUsecase "core-service/internal/auth/usecase"
	serviceDelivery "core-service/internal/service/delivery/http"
	serviceRepo "core-service/internal/service/infrastructure"
	serviceUsecase "core-service/internal/service/usecase"
	ticketDelivery "core-service/internal/ticket/delivery/http"
	ticketRepo "core-service/internal/ticket/infrastructure"
	ticketUsecase "core-service/internal/ticket/usecase"

	"github.com/gofiber/fiber/v2"
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
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Error haciendo ping a la base de datos: %v", err)
	}
	log.Println("Conexión exitosa a la base de datos PostgreSQL")

	// Wiring (Clean Architecture)
	authRepoInstance := authRepo.NewPostgresAuthRepository(db)
	authUC := authUsecase.NewAuthUsecase(authRepoInstance)

	ticketRepoInstance := ticketRepo.NewPostgresTicketRepository(db)
	ticketUC := ticketUsecase.NewTicketUsecase(ticketRepoInstance)

	serviceRepoInstance := serviceRepo.NewPostgresServiceRepository(db)
	serviceUC := serviceUsecase.NewServiceUsecase(serviceRepoInstance)

	app := fiber.New(fiber.Config{AppName: "Core-Service API (MVP)"})
	app.Use(logger.New())

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"status": "UP"})
	})

	v1 := app.Group("/api/v1")

	// Rutas públicas de autenticación
	authDelivery.NewAuthHandler(v1, authUC)

	// Rutas del catálogo de servicios (requieren autenticación)
	serviceHandler := serviceDelivery.NewServiceHandler(serviceUC)
	serviceDelivery.RegisterRoutes(v1, serviceHandler, jwtSecret)

	// Rutas protegidas de tickets
	ticketHandler := ticketDelivery.NewTicketHandler(ticketUC)
	ticketDelivery.RegisterRoutes(v1, ticketHandler, jwtSecret)

	port := envOr("PORT", "8080")
	log.Printf("Iniciando servidor Core-Service en el puerto %s...", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Error al iniciar el servidor Fiber: %v", err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
