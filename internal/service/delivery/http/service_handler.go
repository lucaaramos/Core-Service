package http

import (
	"errors"

	"core-service/internal/service/domain"
	"core-service/internal/service/usecase"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// ServiceHandler maneja las peticiones HTTP REST del catálogo de servicios
// y la configuración de especialidades de operarios.
type ServiceHandler struct {
	uc usecase.ServiceUsecase
}

// NewServiceHandler crea un handler de servicios.
func NewServiceHandler(uc usecase.ServiceUsecase) *ServiceHandler {
	return &ServiceHandler{uc: uc}
}

type updateOperarioServicesRequest struct {
	ServicioIDs []int `json:"servicio_ids"`
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

// GetMyServices devuelve las especialidades asociadas al operario autenticado (200 OK, [] si no tiene).
func (h *ServiceHandler) GetMyServices(c *fiber.Ctx) error {
	operarioID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "operario no autenticado",
		})
	}

	services, err := h.uc.GetOperarioServices(c.UserContext(), operarioID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "error interno del servidor",
		})
	}

	return c.Status(fiber.StatusOK).JSON(services)
}

// UpdateMyServices reemplaza las especialidades asociadas al operario autenticado.
func (h *ServiceHandler) UpdateMyServices(c *fiber.Ctx) error {
	operarioID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "operario no autenticado",
		})
	}

	var req updateOperarioServicesRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cuerpo de solicitud inválido",
		})
	}

	if req.ServicioIDs == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "el campo servicio_ids es requerido",
		})
	}

	services, err := h.uc.UpdateOperarioServices(c.UserContext(), operarioID, req.ServicioIDs)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidServiceIDs) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "error interno del servidor",
		})
	}

	return c.Status(fiber.StatusOK).JSON(services)
}
