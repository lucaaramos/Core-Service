package usecase

import (
	"context"
	"fmt"
	"time"

	"core-service/internal/ticket/domain"

	"github.com/google/uuid"
)

// TicketUsecase define el contrato para los casos de negocio de tickets.
type TicketUsecase interface {
	CreateTicket(ctx context.Context, clienteID uuid.UUID, servicioID int, direccion, descripcion string) (*domain.Ticket, error)
	ListTickets(ctx context.Context, userID uuid.UUID, rol string, estado *string) ([]domain.Ticket, error)
	GetTicket(ctx context.Context, ticketID, userID uuid.UUID, rol string) (*domain.Ticket, error)
	GetAvailableTickets(ctx context.Context) ([]domain.AvailableTicket, error)
	AssignTicket(ctx context.Context, ticketID, operarioID uuid.UUID) error
	UpdateTicketState(ctx context.Context, ticketID, userID uuid.UUID, rol string, newState domain.TicketState) error
	FinishTicket(ctx context.Context, ticketID, userID uuid.UUID, precioFinal float64, metodoPago domain.MetodoPago, evidenciaURL string) error
	CancelTicket(ctx context.Context, ticketID, userID uuid.UUID, rol string) error
}

// ListTickets devuelve los tickets visibles para el usuario según su rol:
// CLIENTE ve solo los suyos como cliente, OPERARIO solo los asignados a él y ADMIN ve todos.
// Opcionalmente se filtra por estado (validado contra la máquina de estados).
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

type ticketUsecase struct {
	repo domain.Repository
}

// NewTicketUsecase crea una nueva instancia del caso de uso de tickets.
func NewTicketUsecase(repo domain.Repository) TicketUsecase {
	return &ticketUsecase{repo: repo}
}

// CreateTicket instancia un nuevo ticket en estado CREADO y lo persiste.
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

// GetAvailableTickets devuelve la bolsa de trabajo para los operarios (tickets CREADO sin asignar).
func (u *ticketUsecase) GetAvailableTickets(ctx context.Context) ([]domain.AvailableTicket, error) {
	tickets, err := u.repo.GetAvailable(ctx)
	if err != nil {
		return nil, fmt.Errorf("error al obtener tickets disponibles: %w", err)
	}

	return tickets, nil
}

// AssignTicket delega al repositorio la asignación segura del operario (control de concurrencia).
func (u *ticketUsecase) AssignTicket(ctx context.Context, ticketID, operarioID uuid.UUID) error {
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

// UpdateTicketState valida la máquina de estados y actualiza el estado del ticket.
// Solo permite avanzar entre ASIGNADO → EN_CAMINO → EN_PROGRESO: el cierre debe
// hacerse por FinishTicket (con precio y método de pago) y la cancelación por CancelTicket.
// El operario autenticado debe ser el asignado al ticket (evita IDOR entre operarios).
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

	// FINALIZADO y CANCELADO tienen endpoints dedicados.
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

	return u.repo.UpdateState(ctx, ticketID, newState)
}

// FinishTicket valida que el ticket esté en progreso y que el operario autenticado sea el
// asignado, y registra el precio final, el método de pago y la evidencia en una sola operación.
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

	if err := u.repo.Finish(ctx, ticketID, precioFinal, metodoPago, evidenciaURL); err != nil {
		return err
	}

	return nil
}

// CancelTicket cancela un ticket que aún no fue finalizado. Puede hacerlo el cliente dueño,
// el operario asignado o un ADMIN.
func (u *ticketUsecase) CancelTicket(ctx context.Context, ticketID, userID uuid.UUID, rol string) error {
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

	return u.repo.UpdateState(ctx, ticketID, domain.StateCancelado)
}

// isTicketMember indica si el usuario participa del ticket como cliente o como operario asignado.
func isTicketMember(ticket *domain.Ticket, userID uuid.UUID) bool {
	if ticket.ClienteID == userID {
		return true
	}
	return ticket.OperarioID != nil && *ticket.OperarioID == userID
}
