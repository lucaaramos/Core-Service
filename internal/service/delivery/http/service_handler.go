package http

import (
	"errors"
	"strconv"

	"core-service/internal/service/domain"
	"core-service/internal/service/usecase"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// ServiceHandler maneja las peticiones HTTP REST del catálogo de servicios (consulta y ABM Admin)
// y la configuración de especialidades de operarios.
type ServiceHandler struct {
	uc usecase.ServiceUsecase
}

// NewServiceHandler crea un handler de servicios.
func NewServiceHandler(uc usecase.ServiceUsecase) *ServiceHandler {
	return &ServiceHandler{uc: uc}
}

type servicePayloadRequest struct {
	Nombre      string  `json:"nombre"`
	Descripcion *string `json:"descripcion"`
	TarifaBase  float64 `json:"tarifa_base"`
}

type updateOperarioServicesRequest struct {
	ServicioIDs []int `json:"servicio_ids"`
}

// ListServices devuelve el catálogo completo de servicios (200 OK, [] si está vacío).
func (h *ServiceHandler) ListServices(c *fiber.Ctx) error {
	services, err := h.uc.ListServices(c.UserContext())
	if err != nil {
		return handleServiceError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(services)
}

// CreateService crea un nuevo servicio en el catálogo (exclusivo ADMIN).
func (h *ServiceHandler) CreateService(c *fiber.Ctx) error {
	var req servicePayloadRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cuerpo de solicitud inválido",
		})
	}

	created, err := h.uc.CreateService(c.UserContext(), req.Nombre, req.Descripcion, req.TarifaBase)
	if err != nil {
		return handleServiceError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(created)
}

// UpdateService actualiza un servicio existente por ID numérico (exclusivo ADMIN).
func (h *ServiceHandler) UpdateService(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id de servicio inválido",
		})
	}

	var req servicePayloadRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cuerpo de solicitud inválido",
		})
	}

	updated, err := h.uc.UpdateService(c.UserContext(), id, req.Nombre, req.Descripcion, req.TarifaBase)
	if err != nil {
		return handleServiceError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(updated)
}

// DeleteService elimina un servicio por ID numérico (exclusivo ADMIN).
func (h *ServiceHandler) DeleteService(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id de servicio inválido",
		})
	}

	if err := h.uc.DeleteService(c.UserContext(), id); err != nil {
		return handleServiceError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "servicio eliminado correctamente",
	})
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
		return handleServiceError(c, err)
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
		return handleServiceError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(services)
}

func handleServiceError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, domain.ErrInvalidServiceData),
		errors.Is(err, domain.ErrInvalidServiceIDs):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrServiceNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrServiceNameAlreadyExists),
		errors.Is(err, domain.ErrServiceHasLinkedTickets):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "error interno del servidor"})
	}
}
