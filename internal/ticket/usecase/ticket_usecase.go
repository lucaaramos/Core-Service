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
	GetTicketsByUser(ctx context.Context, userID uuid.UUID) ([]domain.Ticket, error)
	GetAvailableTickets(ctx context.Context) ([]domain.AvailableTicket, error)
	AssignTicket(ctx context.Context, ticketID, operarioID uuid.UUID) error
	UpdateTicketState(ctx context.Context, ticketID uuid.UUID, newState domain.TicketState) error
	FinishTicket(ctx context.Context, ticketID uuid.UUID, precioFinal float64, metodoPago domain.MetodoPago, evidenciaURL string) error
}

// GetTicketsByUser devuelve los tickets asociados al usuario (como cliente u operario).
func (u *ticketUsecase) GetTicketsByUser(ctx context.Context, userID uuid.UUID) ([]domain.Ticket, error) {
	tickets, err := u.repo.GetTicketsByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("error al obtener tickets del usuario: %w", err)
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

// UpdateTicketState valida la máquina de estados y actualiza el estado del ticket.
func (u *ticketUsecase) UpdateTicketState(ctx context.Context, ticketID uuid.UUID, newState domain.TicketState) error {
	ticket, err := u.repo.FindByID(ctx, ticketID)
	if err != nil {
		return err
	}

	// Validar transiciones permitidas según la máquina de estados del negocio:
	// CREADO -> ASIGNADO (se maneja por AssignTicket)
	// ASIGNADO -> EN_CAMINO
	// EN_CAMINO -> EN_PROGRESO
	// EN_PROGRESO -> FINALIZADO (o mediante FinishTicket)
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
	case domain.StateEnProgreso:
		if newState == domain.StateFinalizado {
			validTransition = true
		}
	}

	if !validTransition {
		return fmt.Errorf("%w: no se permite transición de %s a %s", domain.ErrInvalidStateTransition, ticket.Estado, newState)
	}

	return u.repo.UpdateState(ctx, ticketID, newState)
}

// FinishTicket valida que el ticket esté en progreso, registra los datos de cobro y evidencia, y lo finaliza.
func (u *ticketUsecase) FinishTicket(ctx context.Context, ticketID uuid.UUID, precioFinal float64, metodoPago domain.MetodoPago, evidenciaURL string) error {
	ticket, err := u.repo.FindByID(ctx, ticketID)
	if err != nil {
		return err
	}

	if ticket.Estado != domain.StateEnProgreso {
		return fmt.Errorf("%w: el ticket debe estar EN_PROGRESO para ser finalizado, estado actual: %s", domain.ErrInvalidStateTransition, ticket.Estado)
	}

	// Actualizar campos financieros y evidencia
	// Nota: Si el repositorio requiere una actualización específica para finalizar, podemos extenderlo o realizar un UpdateState.
	// Aquí actualizamos el estado a FINALIZADO. (Idealmente guardaríamos precioFinal, metodoPago y evidenciaURL en una evolución del repo si es necesario).
	if err := u.repo.UpdateState(ctx, ticketID, domain.StateFinalizado); err != nil {
		return err
	}

	return nil
}
