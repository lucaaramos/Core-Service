package domain

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// TicketState representa los estados posibles en la máquina de estados del Ticket.
type TicketState string

const (
	StateCreado      TicketState = "CREADO"
	StateAsignado    TicketState = "ASIGNADO"
	StateEnCamino    TicketState = "EN_CAMINO"
	StateEnProgreso  TicketState = "EN_PROGRESO"
	StateFinalizado  TicketState = "FINALIZADO"
	StateCancelado   TicketState = "CANCELADO"
)

// MetodoPago representa los métodos de pago aceptados al finalizar un ticket.
type MetodoPago string

const (
	PagoEfectivo      MetodoPago = "EFECTIVO"
	PagoQR            MetodoPago = "QR"
	PagoTransferencia MetodoPago = "TRANSFERENCIA"
)

var (
	ErrTicketNotFound      = errors.New("ticket no encontrado")
	ErrTicketAlreadyAssigned = errors.New("el ticket ya fue asignado a otro operario")
	ErrInvalidStateTransition = errors.New("transición de estado inválida")
)

// Ticket representa la entidad de dominio para una solicitud de servicio.
type Ticket struct {
	ID                  uuid.UUID
	ClienteID           uuid.UUID
	OperarioID          *uuid.UUID // Puntero ya que puede ser nulo al inicio (CREADO)
	ServicioID          int
	Estado              TicketState
	Direccion           string
	DescripcionProblema string
	PrecioFinal         *float64 // Puntero ya que es nulo hasta finalizar
	MetodoPago          *MetodoPago // Puntero ya que es nulo hasta finalizar
	EvidenciaURL        *string // Puntero ya que es nulo hasta finalizar
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// Repository define el contrato de persistencia para el dominio Ticket.
// Siguiendo Clean Architecture, el dominio define la interfaz que la infraestructura implementará.
type Repository interface {
	// Create persiste un nuevo ticket en la base de datos.
	Create(ctx context.Context, t *Ticket) error

	// FindByID busca un ticket por su identificador único UUID.
	FindByID(ctx context.Context, id uuid.UUID) (*Ticket, error)

	// AssignOperario intenta asignar un operario al ticket aplicando bloqueo por concurrencia (Row-level lock).
	// Retorna error si el ticket ya fue tomado por otro operario o no está en estado CREADO.
	AssignOperario(ctx context.Context, ticketID uuid.UUID, operarioID uuid.UUID) error

	// UpdateState actualiza el estado actual del ticket en la máquina de estados.
	UpdateState(ctx context.Context, ticketID uuid.UUID, newState TicketState) error
}
