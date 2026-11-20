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
	StateCreado     TicketState = "CREADO"
	StateAsignado   TicketState = "ASIGNADO"
	StateEnCamino   TicketState = "EN_CAMINO"
	StateEnProgreso TicketState = "EN_PROGRESO"
	StateFinalizado TicketState = "FINALIZADO"
	StateCancelado  TicketState = "CANCELADO"
)

// MetodoPago representa los métodos de pago aceptados al finalizar un ticket.
type MetodoPago string

const (
	PagoEfectivo      MetodoPago = "EFECTIVO"
	PagoQR            MetodoPago = "QR"
	PagoTransferencia MetodoPago = "TRANSFERENCIA"
)

var (
	ErrTicketNotFound         = errors.New("ticket no encontrado")
	ErrTicketAlreadyAssigned  = errors.New("el ticket ya fue asignado a otro operario")
	ErrInvalidStateTransition = errors.New("transición de estado inválida")
)

// Ticket representa la entidad de dominio para una solicitud de servicio.
type Ticket struct {
	ID                  uuid.UUID   `json:"id"`
	ClienteID           uuid.UUID   `json:"cliente_id"`
	OperarioID          *uuid.UUID  `json:"operario_id"` // Puntero ya que puede ser nulo al inicio (CREADO)
	ServicioID          int         `json:"servicio_id"`
	Estado              TicketState `json:"estado"`
	Direccion           string      `json:"direccion"`
	DescripcionProblema string      `json:"descripcion_problema"`
	PrecioFinal         *float64    `json:"precio_final"`  // Puntero ya que es nulo hasta finalizar
	MetodoPago          *MetodoPago `json:"metodo_pago"`   // Puntero ya que es nulo hasta finalizar
	EvidenciaURL        *string     `json:"evidencia_url"` // Puntero ya que es nulo hasta finalizar
	CreatedAt           time.Time   `json:"created_at"`
	UpdatedAt           time.Time   `json:"updated_at"`
}

// AvailableTicket representa un ticket en la bolsa de trabajo (estado CREADO y sin operario),
// enriquecido con los datos del servicio para mostrarlo al operario.
type AvailableTicket struct {
	ID                  uuid.UUID `json:"id"`
	Servicio            string    `json:"servicio"`
	Direccion           string    `json:"direccion"`
	DescripcionProblema string    `json:"descripcion_problema"`
	TarifaBase          float64   `json:"tarifa_base"`
	CreatedAt           time.Time `json:"created_at"`
}

// Repository define el contrato de persistencia para el dominio Ticket.
// Siguiendo Clean Architecture, el dominio define la interfaz que la infraestructura implementará.
type Repository interface {
	// Create persiste un nuevo ticket en la base de datos.
	Create(ctx context.Context, t *Ticket) error

	// Get all tickets for a specific user (cliente or operario) by their UUID.
	GetTicketsByUser(ctx context.Context, userID uuid.UUID) ([]Ticket, error)

	// GetAvailable devuelve los tickets en estado CREADO y sin operario (bolsa de trabajo).
	GetAvailable(ctx context.Context) ([]AvailableTicket, error)

	// FindByID busca un ticket por su identificador único UUID.
	FindByID(ctx context.Context, id uuid.UUID) (*Ticket, error)

	// AssignOperario intenta asignar un operario al ticket aplicando bloqueo por concurrencia (Row-level lock).
	// Retorna error si el ticket ya fue tomado por otro operario o no está en estado CREADO.
	AssignOperario(ctx context.Context, ticketID uuid.UUID, operarioID uuid.UUID) error

	// UpdateState actualiza el estado actual del ticket en la máquina de estados.
	UpdateState(ctx context.Context, ticketID uuid.UUID, newState TicketState) error
}
