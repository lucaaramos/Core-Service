package http

import (
	authDomain "core-service/internal/auth/domain"
	"core-service/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

// RegisterRoutes registra las rutas del catálogo de servicios y especialidades bajo /api/v1.
func RegisterRoutes(router fiber.Router, handler *ServiceHandler, jwtSecret string) {
	// GET /services requiere un usuario autenticado (cualquier rol).
	services := router.Group("/services", middleware.JWTProtected(jwtSecret))
	services.Get("", handler.ListServices)

	// GET/PUT /operarios/me/servicios requiere exclusivamente rol OPERARIO.
	operarioServices := router.Group("/operarios/me/servicios",
		middleware.JWTProtected(jwtSecret),
		middleware.RequireRole(string(authDomain.RoleOperario)),
	)
	operarioServices.Get("", handler.GetMyServices)
	operarioServices.Put("", handler.UpdateMyServices)
}
