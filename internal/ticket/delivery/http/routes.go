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

	tickets.Post("",
		middleware.RequireRole(string(authDomain.RoleCliente)),
		handler.CreateTicket,
	)

	tickets.Get("",
		middleware.RequireRole(string(authDomain.RoleCliente), string(authDomain.RoleOperario), string(authDomain.RoleAdmin)),
		handler.GetTickets,
	)

	tickets.Patch("/:id/asignar",
		middleware.RequireRole(string(authDomain.RoleOperario)),
		handler.AssignTicket,
	)

	tickets.Patch("/:id/estado",
		middleware.RequireRole(string(authDomain.RoleOperario), string(authDomain.RoleAdmin)),
		handler.UpdateState,
	)

	tickets.Post("/:id/finalizar",
		middleware.RequireRole(string(authDomain.RoleOperario)),
		handler.FinishTicket,
	)
}
