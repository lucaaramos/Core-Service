package http

import (
	"core-service/internal/service/usecase"

	"github.com/gofiber/fiber/v2"
)

// ServiceHandler maneja las peticiones HTTP REST del catálogo de servicios.
type ServiceHandler struct {
	uc usecase.ServiceUsecase
}

// NewServiceHandler crea un handler de servicios.
func NewServiceHandler(uc usecase.ServiceUsecase) *ServiceHandler {
	return &ServiceHandler{uc: uc}
}

// ListServices devuelve el catálogo completo de servicios (200 OK, [] si está vacío).
func (h *ServiceHandler) ListServices(c *fiber.Ctx) error {
	services, err := h.uc.ListServices(c.UserContext())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "error interno del servidor",
		})
	}

	return c.Status(fiber.StatusOK).JSON(services)
}
