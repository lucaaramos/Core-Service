package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"core-service/internal/storage"
	"core-service/internal/ticket/domain"

	"github.com/google/uuid"
)

// TicketUsecase define el contrato para los casos de negocio de tickets, historial y reseñas.
type TicketUsecase interface {
	CreateTicket(ctx context.Context, clienteID uuid.UUID, servicioID int, direccion, descripcion string) (*domain.Ticket, error)
	ListTickets(ctx context.Context, userID uuid.UUID, rol string, estado *string) ([]domain.Ticket, error)
	GetTicket(ctx context.Context, ticketID, userID uuid.UUID, rol string) (*domain.Ticket, error)
	GetTicketHistory(ctx context.Context, ticketID uuid.UUID) ([]domain.TicketHistoryEntry, error)
	GetAvailableTickets(ctx context.Context, operarioID uuid.UUID) ([]domain.AvailableTicket, error)
	AssignTicket(ctx context.Context, ticketID, operarioID uuid.UUID) error
	UpdateTicketState(ctx context.Context, ticketID, userID uuid.UUID, rol string, newState domain.TicketState) error
	GenerateEvidenceUploadURL(ctx context.Context, ticketID, userID uuid.UUID, contentType string) (uploadURL string, publicURL string, err error)
	FinishTicket(ctx context.Context, ticketID, userID uuid.UUID, precioFinal float64, metodoPago domain.MetodoPago, evidenciaURL string) error
	CancelTicket(ctx context.Context, ticketID, userID uuid.UUID, rol, motivo string) error
	RateTicket(ctx context.Context, ticketID, clienteID uuid.UUID, puntuacion int, comentario string) (*domain.TicketReview, error)
	GetOperarioRating(ctx context.Context, operarioID uuid.UUID) (*domain.OperarioRating, error)
}

type ticketUsecase struct {
	repo    domain.Repository
	storage storage.ObjectStorage
}

// NewTicketUsecase crea una nueva instancia del caso de uso de tickets.
func NewTicketUsecase(repo domain.Repository, objectStorage storage.ObjectStorage) TicketUsecase {
	return &ticketUsecase{
		repo:    repo,
		storage: objectStorage,
	}
}

// ListTickets devuelve los tickets visibles para el usuario según su rol.
func (u *ticketUsecase) ListTickets(ctx context.Context, userID uuid.UUID, rol string, estado *string) ([]domain.Ticket, error) {
	if estado != nil && !domain.IsValidTicketState(*estado) {
		return nil, fmt.Errorf("%w: %s", domain.ErrInvalidTicketState, *estado)
	}

	filter := domain.TicketFilter{Estado: estado}

	switch rol {
	case "CLIENTE":
		filter.ClienteID = &userID
	case "OPERARIO":
		filter.OperarioID = &userID
	case "ADMIN":
		// Sin filtro de usuario: ve todos los tickets.
	default:
		return nil, fmt.Errorf("rol no autorizado para listar tickets: %s", rol)
	}

	tickets, err := u.repo.List(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("error al listar tickets: %w", err)
	}

	return tickets, nil
}

// CreateTicket instancia un nuevo ticket en estado CREADO y lo persiste junto con su auditoría inicial.
func (u *ticketUsecase) CreateTicket(ctx context.Context, clienteID uuid.UUID, servicioID int, direccion, descripcion string) (*domain.Ticket, error) {
	now := time.Now()
	t := &domain.Ticket{
		ID:                  uuid.New(),
		ClienteID:           clienteID,
		ServicioID:          servicioID,
		Estado:              domain.StateCreado,
		Direccion:           direccion,
		DescripcionProblema: descripcion,
		CreatedAt:           now,
		UpdatedAt:           now,
	}

	if err := u.repo.Create(ctx, t); err != nil {
		return nil, fmt.Errorf("error al crear el ticket en el repositorio: %w", err)
	}

	return t, nil
}

func (u *ticketUsecase) ensureOperarioApproved(ctx context.Context, operarioID uuid.UUID) error {
	status, err := u.repo.GetOperarioApprovalStatus(ctx, operarioID)
	if err != nil {
		return err
	}

	switch status {
	case "APROBADO":
		return nil
	case "RECHAZADO":
		return domain.ErrOperarioRejected
	default:
		return domain.ErrOperarioPendingApproval
	}
}

// GetAvailableTickets devuelve la bolsa de trabajo para el operario autenticado (si está APROBADO),
// filtrando tickets CREADO sin asignar según sus especialidades registradas.
func (u *ticketUsecase) GetAvailableTickets(ctx context.Context, operarioID uuid.UUID) ([]domain.AvailableTicket, error) {
	if err := u.ensureOperarioApproved(ctx, operarioID); err != nil {
		return nil, err
	}

	tickets, err := u.repo.GetAvailable(ctx, operarioID)
	if err != nil {
		return nil, fmt.Errorf("error al obtener tickets disponibles: %w", err)
	}

	return tickets, nil
}

// AssignTicket valida que el operario esté APROBADO, que el ticket exista y que posea la especialidad requerida,
// y delega al repositorio la asignación segura con auditoría.
func (u *ticketUsecase) AssignTicket(ctx context.Context, ticketID, operarioID uuid.UUID) error {
	if err := u.ensureOperarioApproved(ctx, operarioID); err != nil {
		return err
	}

	ticket, err := u.repo.FindByID(ctx, ticketID)
	if err != nil {
		return err
	}

	hasSpecialty, err := u.repo.HasOperarioSpecialty(ctx, operarioID, ticket.ServicioID)
	if err != nil {
		return fmt.Errorf("error verificando especialidad del operario: %w", err)
	}
	if !hasSpecialty {
		return domain.ErrOperarioMissingSpecialty
	}

	if err := u.repo.AssignOperario(ctx, ticketID, operarioID); err != nil {
		return err
	}
	return nil
}

// GetTicket devuelve el detalle de un ticket validando que el usuario sea el cliente dueño,
// el operario asignado o un ADMIN.
func (u *ticketUsecase) GetTicket(ctx context.Context, ticketID, userID uuid.UUID, rol string) (*domain.Ticket, error) {
	ticket, err := u.repo.FindByID(ctx, ticketID)
	if err != nil {
		return nil, err
	}

	if rol != "ADMIN" && !isTicketMember(ticket, userID) {
		return nil, domain.ErrTicketAccessDenied
	}

	return ticket, nil
}

// GetTicketHistory verifica que el ticket exista y devuelve su línea de tiempo de estados (exclusivo ADMIN).
func (u *ticketUsecase) GetTicketHistory(ctx context.Context, ticketID uuid.UUID) ([]domain.TicketHistoryEntry, error) {
	if _, err := u.repo.FindByID(ctx, ticketID); err != nil {
		return nil, err
	}

	entries, err := u.repo.GetHistoryByTicketID(ctx, ticketID)
	if err != nil {
		return nil, fmt.Errorf("error obteniendo historial del ticket: %w", err)
	}

	return entries, nil
}

// UpdateTicketState valida la máquina de estados y actualiza el estado del ticket con auditoría.
func (u *ticketUsecase) UpdateTicketState(ctx context.Context, ticketID, userID uuid.UUID, rol string, newState domain.TicketState) error {
	ticket, err := u.repo.FindByID(ctx, ticketID)
	if err != nil {
		return err
	}

	if rol != "ADMIN" {
		if ticket.OperarioID == nil || *ticket.OperarioID != userID {
			return domain.ErrTicketAccessDenied
		}
	}

	if newState == domain.StateFinalizado || newState == domain.StateCancelado {
		return fmt.Errorf("%w: %s debe gestionarse con su endpoint específico", domain.ErrInvalidStateTransition, newState)
	}

	validTransition := false
	switch ticket.Estado {
	case domain.StateAsignado:
		if newState == domain.StateEnCamino {
			validTransition = true
		}
	case domain.StateEnCamino:
		if newState == domain.StateEnProgreso {
			validTransition = true
		}
	}

	if !validTransition {
		return fmt.Errorf("%w: no se permite transición de %s a %s", domain.ErrInvalidStateTransition, ticket.Estado, newState)
	}

	return u.repo.UpdateState(ctx, ticketID, ticket.Estado, newState, userID, "")
}

// GenerateEvidenceUploadURL genera una Presigned PUT URL con clave única para subir la foto de evidencia a S3.
func (u *ticketUsecase) GenerateEvidenceUploadURL(ctx context.Context, ticketID, userID uuid.UUID, contentType string) (string, string, error) {
	normalizedType := strings.TrimSpace(strings.ToLower(contentType))

	var ext string
	switch normalizedType {
	case "image/jpeg":
		ext = "jpg"
	case "image/png":
		ext = "png"
	case "image/webp":
		ext = "webp"
	default:
		return "", "", domain.ErrInvalidEvidenceType
	}

	ticket, err := u.repo.FindByID(ctx, ticketID)
	if err != nil {
		return "", "", err
	}

	if ticket.OperarioID == nil || *ticket.OperarioID != userID {
		return "", "", domain.ErrTicketAccessDenied
	}

	if ticket.Estado != domain.StateEnProgreso {
		return "", "", fmt.Errorf("%w: el ticket debe estar EN_PROGRESO para subir evidencia, estado actual: %s", domain.ErrInvalidStateTransition, ticket.Estado)
	}

	key := fmt.Sprintf("tickets/%s/%s.%s", ticketID.String(), uuid.NewString(), ext)
	uploadURL, publicURL, err := u.storage.GenerateUploadURL(ctx, key, normalizedType)
	if err != nil {
		return "", "", fmt.Errorf("error generando URL de subida de evidencia: %w", err)
	}

	return uploadURL, publicURL, nil
}

// FinishTicket registra el precio final, el método de pago y la evidencia pasando el ticket a FINALIZADO con auditoría.
func (u *ticketUsecase) FinishTicket(ctx context.Context, ticketID, userID uuid.UUID, precioFinal float64, metodoPago domain.MetodoPago, evidenciaURL string) error {
	ticket, err := u.repo.FindByID(ctx, ticketID)
	if err != nil {
		return err
	}

	if ticket.OperarioID == nil || *ticket.OperarioID != userID {
		return domain.ErrTicketAccessDenied
	}

	if ticket.Estado != domain.StateEnProgreso {
		return fmt.Errorf("%w: el ticket debe estar EN_PROGRESO para ser finalizado, estado actual: %s", domain.ErrInvalidStateTransition, ticket.Estado)
	}

	switch metodoPago {
	case domain.PagoEfectivo, domain.PagoQR, domain.PagoTransferencia:
		// válido
	default:
		return fmt.Errorf("%w: método de pago inválido: %s", domain.ErrInvalidStateTransition, metodoPago)
	}

	if err := u.repo.Finish(ctx, ticketID, userID, precioFinal, metodoPago, evidenciaURL); err != nil {
		return err
	}

	return nil
}

// CancelTicket cancela un ticket que aún no fue finalizado registrando el motivo opcional en ticket_history.
func (u *ticketUsecase) CancelTicket(ctx context.Context, ticketID, userID uuid.UUID, rol, motivo string) error {
	cleanMotivo := strings.TrimSpace(motivo)
	if utf8.RuneCountInString(cleanMotivo) > 500 {
		return domain.ErrInvalidCancelReason
	}

	ticket, err := u.repo.FindByID(ctx, ticketID)
	if err != nil {
		return err
	}

	if rol != "ADMIN" && !isTicketMember(ticket, userID) {
		return domain.ErrTicketAccessDenied
	}

	if ticket.Estado == domain.StateFinalizado || ticket.Estado == domain.StateCancelado {
		return fmt.Errorf("%w: no se puede cancelar un ticket en estado %s", domain.ErrInvalidStateTransition, ticket.Estado)
	}

	return u.repo.UpdateState(ctx, ticketID, ticket.Estado, domain.StateCancelado, userID, cleanMotivo)
}

// RateTicket valida la puntuación (1..5), el comentario (<= 500 chars), la propiedad del cliente,
// el estado FINALIZADO y que aún no exista reseña, y persiste la calificación.
func (u *ticketUsecase) RateTicket(ctx context.Context, ticketID, clienteID uuid.UUID, puntuacion int, comentario string) (*domain.TicketReview, error) {
	if puntuacion < 1 || puntuacion > 5 {
		return nil, fmt.Errorf("%w: la puntuación debe estar entre 1 y 5", domain.ErrInvalidReviewInput)
	}

	cleanComentario := strings.TrimSpace(comentario)
	if utf8.RuneCountInString(cleanComentario) > 500 {
		return nil, fmt.Errorf("%w: el comentario no puede superar los 500 caracteres", domain.ErrInvalidReviewInput)
	}

	ticket, err := u.repo.FindByID(ctx, ticketID)
	if err != nil {
		return nil, err
	}

	if ticket.ClienteID != clienteID {
		return nil, domain.ErrTicketAccessDenied
	}

	if ticket.Estado != domain.StateFinalizado {
		return nil, fmt.Errorf("%w: solo se pueden calificar tickets en estado FINALIZADO", domain.ErrInvalidStateTransition)
	}

	if ticket.Resena != nil {
		return nil, domain.ErrReviewAlreadyExists
	}

	if ticket.OperarioID == nil {
		return nil, fmt.Errorf("%w: el ticket no tiene un operario asignado", domain.ErrInvalidReviewInput)
	}

	review := &domain.TicketReview{
		ID:         uuid.New(),
		TicketID:   ticket.ID,
		ClienteID:  clienteID,
		OperarioID: *ticket.OperarioID,
		Puntuacion: puntuacion,
		Comentario: cleanComentario,
		CreatedAt:  time.Now(),
	}

	return u.repo.CreateReview(ctx, review)
}

// GetOperarioRating devuelve el promedio, cantidad y listado de reseñas recibidas por el operario.
func (u *ticketUsecase) GetOperarioRating(ctx context.Context, operarioID uuid.UUID) (*domain.OperarioRating, error) {
	rating, err := u.repo.GetOperarioRating(ctx, operarioID)
	if err != nil {
		return nil, fmt.Errorf("error obteniendo reputación del operario: %w", err)
	}

	return rating, nil
}

// isTicketMember indica si el usuario participa del ticket como cliente o como operario asignado.
func isTicketMember(ticket *domain.Ticket, userID uuid.UUID) bool {
	if ticket.ClienteID == userID {
		return true
	}
	return ticket.OperarioID != nil && *ticket.OperarioID == userID
}
