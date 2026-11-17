package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	delivery "core-service/internal/ticket/delivery/http"
	"core-service/internal/ticket/infrastructure"
	"core-service/internal/ticket/usecase"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	// Cargar variables de entorno desde el archivo .env si existe
	if err := godotenv.Load(); err != nil {
		log.Println("Aviso: No se pudo cargar el archivo .env (se usarán variables del sistema o defaults)")
	}

	// Obtener la cadena de conexión de la variable de entorno o construirla
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dbUser := os.Getenv("POSTGRES_USER")
		dbPass := os.Getenv("POSTGRES_PASSWORD")
		dbHost := os.Getenv("POSTGRES_HOST")
		if dbHost == "" {
			dbHost = "localhost"
		} // Fallback local
		dbPort := os.Getenv("POSTGRES_PORT")
		if dbPort == "" {
			dbPort = "5432"
		} // Fallback local
		dbName := os.Getenv("POSTGRES_DB")

		// Formato correcto que entiende Go: postgres://usuario:password@host:puerto/bd?sslmode=disable
		dsn = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
			dbUser, dbPass, dbHost, dbPort, dbName)
	}

	// 2. Conexión a la base de datos PostgreSQL
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Error abriendo la conexión a la base de datos: %v", err)
	}
	defer db.Close()

	// 3. Verificar que la base de datos esté viva
	if err := db.Ping(); err != nil {
		log.Fatalf("Error haciendo ping a la base de datos: %v", err)
	}
	log.Println("Conexión exitosa a la base de datos PostgreSQL")

	// 4. Inyección de Dependencias (Wiring Clean Architecture)
	ticketRepo := infrastructure.NewPostgresTicketRepository(db)
	ticketUC := usecase.NewTicketUsecase(ticketRepo)

	// 5. Inicialización de Fiber
	app := fiber.New(fiber.Config{
		AppName: "Core-Service API (MVP)",
	})

	// Middleware de Logger para visualizar solicitudes HTTP en consola
	app.Use(logger.New())

	// Health check endpoint
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status": "UP",
		})
	})

	// 6. Registro de Rutas API v1
	v1 := app.Group("/api/v1")
	delivery.NewTicketHandler(v1, ticketUC)

	// 7. Arranque del servidor HTTP en el puerto configurado
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Iniciando servidor Core-Service en el puerto %s...", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Error al iniciar el servidor Fiber: %v", err)
	}
}
