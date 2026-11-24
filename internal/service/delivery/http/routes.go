package http

import (
	authDomain "core-service/internal/auth/domain"
	"core-service/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

// RegisterRoutes registra las rutas del catálogo de servicios (lectura y ABM Admin)
// y las rutas de especialidades de operarios bajo /api/v1.
func RegisterRoutes(router fiber.Router, handler *ServiceHandler, jwtSecret string) {
	// /services requiere autenticación JWT; POST/PATCH/DELETE están restringidos a ADMIN.
	services := router.Group("/services", middleware.JWTProtected(jwtSecret))
	services.Get("", handler.ListServices)
	services.Post("", middleware.RequireRole(string(authDomain.RoleAdmin)), handler.CreateService)
	services.Patch("/:id", middleware.RequireRole(string(authDomain.RoleAdmin)), handler.UpdateService)
	services.Delete("/:id", middleware.RequireRole(string(authDomain.RoleAdmin)), handler.DeleteService)

	// GET/PUT /operarios/me/servicios requiere exclusivamente rol OPERARIO.
	operarioServices := router.Group("/operarios/me/servicios",
		middleware.JWTProtected(jwtSecret),
		middleware.RequireRole(string(authDomain.RoleOperario)),
	)
	operarioServices.Get("", handler.GetMyServices)
	operarioServices.Put("", handler.UpdateMyServices)
}
