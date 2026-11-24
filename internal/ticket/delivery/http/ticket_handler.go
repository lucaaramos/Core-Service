package http

import (
	"bytes"
	"errors"

	"core-service/internal/ticket/domain"
	"core-service/internal/ticket/usecase"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// TicketHandler maneja las peticiones HTTP REST para los tickets, auditoría y calificaciones utilizando Fiber.
type TicketHandler struct {
	uc usecase.TicketUsecase
}

// NewTicketHandler crea un handler de tickets.
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

type cancelTicketRequest struct {
	Motivo string `json:"motivo"`
}

type finishTicketRequest struct {
	PrecioFinal  float64 `json:"precio_final"`
	MetodoPago   string  `json:"metodo_pago"`
	EvidenciaURL string  `json:"evidencia_url"`
}

type evidenceUploadURLRequest struct {
	ContentType string `json:"content_type"`
}

type rateTicketRequest struct {
	Puntuacion int    `json:"puntuacion"`
	Comentario string `json:"comentario"`
}

// ListTickets lista los tickets visibles según el rol del usuario autenticado.
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

// GetAvailableTickets lista la bolsa de trabajo filtrada según las especialidades del operario.
func (h *TicketHandler) GetAvailableTickets(c *fiber.Ctx) error {
	operarioID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "operario no autenticado"})
	}

	tickets, err := h.uc.GetAvailableTickets(c.UserContext(), operarioID)
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(tickets)
}

// GetTicket devuelve el detalle de un ticket si el usuario participa en él (o es ADMIN).
func (h *TicketHandler) GetTicket(c *fiber.Ctx) error {
	ticketUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id de ticket con formato UUID inválido"})
	}

	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "usuario no autenticado"})
	}

	rol, _ := c.Locals("rol").(string)

	ticket, err := h.uc.GetTicket(c.UserContext(), ticketUUID, userID, rol)
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(ticket)
}

// GetTicketHistory devuelve la línea de tiempo de auditoría de estados de un ticket (exclusivo ADMIN).
func (h *TicketHandler) GetTicketHistory(c *fiber.Ctx) error {
	ticketUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id de ticket con formato UUID inválido"})
	}

	entries, err := h.uc.GetTicketHistory(c.UserContext(), ticketUUID)
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(entries)
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

	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "usuario no autenticado"})
	}

	rol, _ := c.Locals("rol").(string)

	if err := h.uc.UpdateTicketState(c.UserContext(), ticketUUID, userID, rol, newState); err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "estado actualizado exitosamente"})
}

// GenerateEvidenceUploadURL genera una Presigned PUT URL para subir la foto de evidencia a S3.
func (h *TicketHandler) GenerateEvidenceUploadURL(c *fiber.Ctx) error {
	ticketUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id de ticket con formato UUID inválido"})
	}

	var req evidenceUploadURLRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
	}

	operarioID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "operario no autenticado"})
	}

	uploadURL, publicURL, err := h.uc.GenerateEvidenceUploadURL(c.UserContext(), ticketUUID, operarioID, req.ContentType)
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"upload_url": uploadURL,
		"public_url": publicURL,
	})
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

	operarioID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "operario no autenticado"})
	}

	if err := h.uc.FinishTicket(c.UserContext(), ticketUUID, operarioID, req.PrecioFinal, metodoPago, req.EvidenciaURL); err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "trabajo finalizado exitosamente"})
}

// CancelTicket cancela un ticket que aún no fue finalizado (aceptando motivo JSON opcional).
func (h *TicketHandler) CancelTicket(c *fiber.Ctx) error {
	ticketUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id de ticket con formato UUID inválido"})
	}

	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "usuario no autenticado"})
	}

	rol, _ := c.Locals("rol").(string)

	var req cancelTicketRequest
	if len(bytes.TrimSpace(c.Body())) > 0 {
		if err := c.BodyParser(&req); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
		}
	}

	if err := h.uc.CancelTicket(c.UserContext(), ticketUUID, userID, rol, req.Motivo); err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "ticket cancelado exitosamente"})
}

// RateTicket registra la calificación (1..5) y comentario opcional del cliente sobre un ticket finalizado.
func (h *TicketHandler) RateTicket(c *fiber.Ctx) error {
	ticketUUID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id de ticket con formato UUID inválido"})
	}

	clienteID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "cliente no autenticado"})
	}

	var req rateTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
	}

	review, err := h.uc.RateTicket(c.UserContext(), ticketUUID, clienteID, req.Puntuacion, req.Comentario)
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(review)
}

// GetMyRating devuelve el promedio, total y listado de reseñas del operario autenticado.
func (h *TicketHandler) GetMyRating(c *fiber.Ctx) error {
	operarioID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "operario no autenticado"})
	}

	rating, err := h.uc.GetOperarioRating(c.UserContext(), operarioID)
	if err != nil {
		return h.handleError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(rating)
}

// handleError traduce los errores de dominio a códigos de respuesta HTTP adecuados.
func (h *TicketHandler) handleError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, domain.ErrTicketNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrTicketAccessDenied),
		errors.Is(err, domain.ErrOperarioPendingApproval),
		errors.Is(err, domain.ErrOperarioRejected),
		errors.Is(err, domain.ErrOperarioMissingSpecialty):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrTicketAlreadyAssigned),
		errors.Is(err, domain.ErrReviewAlreadyExists):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrInvalidStateTransition),
		errors.Is(err, domain.ErrInvalidTicketState),
		errors.Is(err, domain.ErrInvalidEvidenceType),
		errors.Is(err, domain.ErrInvalidReviewInput),
		errors.Is(err, domain.ErrInvalidCancelReason):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "error interno del servidor"})
	}
}
