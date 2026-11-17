package http

import (
	"errors"

	"core-service/internal/ticket/domain"
	"core-service/internal/ticket/usecase"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// TicketHandler maneja las peticiones HTTP REST para los tickets utilizando Fiber.
type TicketHandler struct {
	uc usecase.TicketUsecase
}

// NewTicketHandler registra las rutas de tickets en el router de Fiber proporcionado.
func NewTicketHandler(router fiber.Router, uc usecase.TicketUsecase) {
	handler := &TicketHandler{uc: uc}

	tickets := router.Group("/tickets")
	tickets.Post("", handler.CreateTicket)
	tickets.Patch("/:id/asignar", handler.AssignTicket)
	tickets.Patch("/:id/estado", handler.UpdateState)
	tickets.Post("/:id/finalizar", handler.FinishTicket)
}

// DTOs para solicitudes HTTP
type createTicketRequest struct {
	ClienteID           string `json:"cliente_id"`
	ServicioID          int    `json:"servicio_id"`
	Direccion           string `json:"direccion"`
	DescripcionProblema string `json:"descripcion_problema"`
}

type assignTicketRequest struct {
	OperarioID string `json:"operario_id"`
}

type updateStateRequest struct {
	NuevoEstado string `json:"nuevo_estado"`
}

type finishTicketRequest struct {
	PrecioFinal  float64 `json:"precio_final"`
	MetodoPago   string  `json:"metodo_pago"`
	EvidenciaURL string  `json:"evidencia_url"`
}

// CreateTicket maneja la creación de una solicitud de servicio.
func (h *TicketHandler) CreateTicket(c *fiber.Ctx) error {
	var req createTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cuerpo de solicitud inválido",
		})
	}

	clienteUUID, err := uuid.Parse(req.ClienteID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cliente_id con formato UUID inválido",
		})
	}

	ticket, err := h.uc.CreateTicket(c.UserContext(), clienteUUID, req.ServicioID, req.Direccion, req.DescripcionProblema)
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(ticket)
}

// AssignTicket maneja la aceptación del trabajo por parte de un operario.
func (h *TicketHandler) AssignTicket(c *fiber.Ctx) error {
	idParam := c.Params("id")
	ticketUUID, err := uuid.Parse(idParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id de ticket con formato UUID inválido",
		})
	}

	var req assignTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cuerpo de solicitud inválido",
		})
	}

	operarioUUID, err := uuid.Parse(req.OperarioID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "operario_id con formato UUID inválido",
		})
	}

	if err := h.uc.AssignTicket(c.UserContext(), ticketUUID, operarioUUID); err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "ticket asignado exitosamente",
	})
}

// UpdateState maneja el cambio de estado en la máquina de estados.
func (h *TicketHandler) UpdateState(c *fiber.Ctx) error {
	idParam := c.Params("id")
	ticketUUID, err := uuid.Parse(idParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id de ticket con formato UUID inválido",
		})
	}

	var req updateStateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cuerpo de solicitud inválido",
		})
	}

	newState := domain.TicketState(req.NuevoEstado)
	if err := h.uc.UpdateTicketState(c.UserContext(), ticketUUID, newState); err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "estado actualizado exitosamente",
	})
}

// FinishTicket maneja la finalización de un trabajo operativo.
func (h *TicketHandler) FinishTicket(c *fiber.Ctx) error {
	idParam := c.Params("id")
	ticketUUID, err := uuid.Parse(idParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id de ticket con formato UUID inválido",
		})
	}

	var req finishTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cuerpo de solicitud inválido",
		})
	}

	metodoPago := domain.MetodoPago(req.MetodoPago)
	if err := h.uc.FinishTicket(c.UserContext(), ticketUUID, req.PrecioFinal, metodoPago, req.EvidenciaURL); err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "trabajo finalizado exitosamente",
	})
}

// handleError traduce los errores de dominio a códigos de respuesta HTTP adecuados.
func (h *TicketHandler) handleError(c *fiber.Ctx, err error) error {
	if errors.Is(err, domain.ErrTicketNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	if errors.Is(err, domain.ErrTicketAlreadyAssigned) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	if errors.Is(err, domain.ErrInvalidStateTransition) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
		"error": "error interno del servidor",
	})
}
