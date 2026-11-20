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

// NewTicketHandler crea un handler de tickets. El registro de rutas (con sus
// middlewares de autenticación y roles) se realiza en cmd/api/main.go.
func NewTicketHandler(uc usecase.TicketUsecase) *TicketHandler {
	return &TicketHandler{uc: uc}
}

// DTOs para solicitudes HTTP
type createTicketRequest struct {
	ServicioID          int    `json:"servicio_id"`
	Direccion           string `json:"direccion"`
	DescripcionProblema string `json:"descripcion_problema"`
}

type updateStateRequest struct {
	NuevoEstado string `json:"nuevo_estado"`
}

type finishTicketRequest struct {
	PrecioFinal  float64 `json:"precio_final"`
	MetodoPago   string  `json:"metodo_pago"`
	EvidenciaURL string  `json:"evidencia_url"`
}

// ListTickets lista los tickets visibles según el rol del usuario autenticado.
// Acepta el query param opcional ?estado=CREADO|ASIGNADO|EN_CAMINO|EN_PROGRESO|FINALIZADO|CANCELADO.
func (h *TicketHandler) ListTickets(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "usuario no autenticado"})
	}

	rol, ok := c.Locals("rol").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "rol no disponible en el token"})
	}

	var estado *string
	if q := c.Query("estado"); q != "" {
		estado = &q
	}

	tickets, err := h.uc.ListTickets(c.UserContext(), userID, rol, estado)
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(tickets)
}

// GetAvailableTickets lista la bolsa de trabajo para los operarios.
func (h *TicketHandler) GetAvailableTickets(c *fiber.Ctx) error {
	tickets, err := h.uc.GetAvailableTickets(c.UserContext())
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(tickets)
}

// CreateTicket crea una solicitud de servicio usando el cliente_id del JWT.
func (h *TicketHandler) CreateTicket(c *fiber.Ctx) error {
	clienteUUID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "usuario no autenticado"})
	}

	var req createTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
	}

	ticket, err := h.uc.CreateTicket(c.UserContext(), clienteUUID, req.ServicioID, req.Direccion, req.DescripcionProblema)
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(ticket)
}

// AssignTicket asigna el ticket al operario autenticado (operario_id del JWT).
func (h *TicketHandler) AssignTicket(c *fiber.Ctx) error {
	ticketUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id de ticket con formato UUID inválido"})
	}

	operarioUUID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "operario no autenticado"})
	}

	if err := h.uc.AssignTicket(c.UserContext(), ticketUUID, operarioUUID); err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "ticket asignado exitosamente"})
}

// UpdateState avanza el ticket en la máquina de estados.
func (h *TicketHandler) UpdateState(c *fiber.Ctx) error {
	ticketUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id de ticket con formato UUID inválido"})
	}

	var req updateStateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
	}

	newState := domain.TicketState(req.NuevoEstado)
	if err := h.uc.UpdateTicketState(c.UserContext(), ticketUUID, newState); err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "estado actualizado exitosamente"})
}

// FinishTicket registra el cobro y la evidencia, y finaliza el ticket.
func (h *TicketHandler) FinishTicket(c *fiber.Ctx) error {
	ticketUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id de ticket con formato UUID inválido"})
	}

	var req finishTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
	}

	metodoPago := domain.MetodoPago(req.MetodoPago)
	if err := h.uc.FinishTicket(c.UserContext(), ticketUUID, req.PrecioFinal, metodoPago, req.EvidenciaURL); err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "trabajo finalizado exitosamente"})
}

// handleError traduce los errores de dominio a códigos de respuesta HTTP adecuados.
func (h *TicketHandler) handleError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, domain.ErrTicketNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrTicketAlreadyAssigned):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrInvalidStateTransition), errors.Is(err, domain.ErrInvalidTicketState):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "error interno del servidor"})
	}
}
