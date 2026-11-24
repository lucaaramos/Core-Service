package http

import (
	authDomain "core-service/internal/auth/domain"
	"core-service/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

func RegisterRoutes(router fiber.Router, handler *TicketHandler, jwtSecret string) {
	tickets := router.Group("/tickets", middleware.JWTProtected(jwtSecret))

	// GET /tickets/disponibles -> bolsa de trabajo, solo OPERARIO
	tickets.Get("/disponibles",
		middleware.RequireRole(string(authDomain.RoleOperario)),
		handler.GetAvailableTickets,
	)

	// GET /tickets/:id -> detalle (cliente dueño, operario asignado o ADMIN)
	tickets.Get("/:id",
		middleware.RequireRole(string(authDomain.RoleCliente), string(authDomain.RoleOperario), string(authDomain.RoleAdmin)),
		handler.GetTicket,
	)

	tickets.Post("",
		middleware.RequireRole(string(authDomain.RoleCliente)),
		handler.CreateTicket,
	)

	tickets.Get("",
		middleware.RequireRole(string(authDomain.RoleCliente), string(authDomain.RoleOperario), string(authDomain.RoleAdmin)),
		handler.ListTickets,
	)

	tickets.Patch("/:id/asignar",
		middleware.RequireRole(string(authDomain.RoleOperario)),
		handler.AssignTicket,
	)

	tickets.Patch("/:id/estado",
		middleware.RequireRole(string(authDomain.RoleOperario), string(authDomain.RoleAdmin)),
		handler.UpdateState,
	)

	// PATCH /tickets/:id/cancelar -> cliente dueño, operario asignado o ADMIN
	tickets.Patch("/:id/cancelar",
		middleware.RequireRole(string(authDomain.RoleCliente), string(authDomain.RoleOperario), string(authDomain.RoleAdmin)),
		handler.CancelTicket,
	)

	tickets.Post("/:id/evidencia/upload-url",
		middleware.RequireRole(string(authDomain.RoleOperario)),
		handler.GenerateEvidenceUploadURL,
	)

	tickets.Post("/:id/finalizar",
		middleware.RequireRole(string(authDomain.RoleOperario)),
		handler.FinishTicket,
	)

	// POST /tickets/:id/calificar -> reseña sobre ticket finalizado, exclusivo CLIENTE
	tickets.Post("/:id/calificar",
		middleware.RequireRole(string(authDomain.RoleCliente)),
		handler.RateTicket,
	)

	// GET /operarios/me/rating -> reputación y reseñas recibidas, exclusivo OPERARIO
	router.Get("/operarios/me/rating",
		middleware.JWTProtected(jwtSecret),
		middleware.RequireRole(string(authDomain.RoleOperario)),
		handler.GetMyRating,
	)
}
