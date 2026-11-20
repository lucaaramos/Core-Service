package http

import (
	"core-service/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

// RegisterRoutes registra las rutas del catálogo de servicios bajo /api/v1.
// GET /services requiere un usuario autenticado (cualquier rol).
func RegisterRoutes(router fiber.Router, handler *ServiceHandler, jwtSecret string) {
	services := router.Group("/services", middleware.JWTProtected(jwtSecret))
	services.Get("", handler.ListServices)
}
