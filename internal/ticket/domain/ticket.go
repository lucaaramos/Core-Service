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
	ErrTicketNotFound           = errors.New("ticket no encontrado")
	ErrTicketAlreadyAssigned    = errors.New("el ticket ya fue asignado a otro operario")
	ErrInvalidStateTransition   = errors.New("transición de estado inválida")
	ErrInvalidTicketState       = errors.New("estado de ticket inválido")
	ErrTicketAccessDenied       = errors.New("no tenés permiso para acceder a este ticket")
	ErrOperarioPendingApproval  = errors.New("tu cuenta de operario aún no fue aprobada por un administrador")
	ErrOperarioRejected         = errors.New("tu solicitud de operario fue rechazada por un administrador")
	ErrOperarioMissingSpecialty = errors.New("no tenés registrada la especialidad requerida para aceptar este trabajo")
	ErrInvalidEvidenceType      = errors.New("tipo de archivo inválido: solo se permite image/jpeg, image/png o image/webp")
	ErrReviewAlreadyExists      = errors.New("este ticket ya fue calificado")
	ErrInvalidReviewInput       = errors.New("datos de calificación inválidos")
	ErrInvalidCancelReason      = errors.New("el motivo de cancelación no puede superar los 500 caracteres")
)

// IsValidTicketState indica si el string corresponde a un estado válido de la máquina de estados.
func IsValidTicketState(s string) bool {
	switch TicketState(s) {
	case StateCreado, StateAsignado, StateEnCamino, StateEnProgreso, StateFinalizado, StateCancelado:
		return true
	default:
		return false
	}
}

// TicketFilter agrupa los filtros opcionales para listar tickets.
// Los campos en nil no se aplican a la consulta.
type TicketFilter struct {
	ClienteID  *uuid.UUID
	OperarioID *uuid.UUID
	Estado     *string
}

// TicketReview representa la calificación y reseña emitida por el cliente sobre un ticket finalizado.
type TicketReview struct {
	ID         uuid.UUID `json:"id"`
	TicketID   uuid.UUID `json:"ticket_id"`
	ClienteID  uuid.UUID `json:"cliente_id"`
	OperarioID uuid.UUID `json:"operario_id"`
	Puntuacion int       `json:"puntuacion"`
	Comentario string    `json:"comentario"`
	CreatedAt  time.Time `json:"created_at"`
}

// OperarioRating agrupa la reputación promedio y el historial de reseñas de un operario.
type OperarioRating struct {
	Promedio     float64        `json:"promedio"`
	TotalResenas int            `json:"total_resenas"`
	Resenas      []TicketReview `json:"resenas"`
}

// TicketHistoryEntry representa un evento en la línea de tiempo de auditoría de un ticket.
type TicketHistoryEntry struct {
	ID             uuid.UUID    `json:"id"`
	TicketID       uuid.UUID    `json:"ticket_id"`
	EstadoAnterior *TicketState `json:"estado_anterior"`
	EstadoNuevo    TicketState  `json:"estado_nuevo"`
	UsuarioID      uuid.UUID    `json:"usuario_id"`
	UsuarioNombre  string       `json:"usuario_nombre"`
	UsuarioRol     string       `json:"usuario_rol"`
	Motivo         string       `json:"motivo"`
	CreatedAt      time.Time    `json:"created_at"`
}

// Ticket representa la entidad de dominio para una solicitud de servicio.
type Ticket struct {
	ID                  uuid.UUID     `json:"id"`
	ClienteID           uuid.UUID     `json:"cliente_id"`
	OperarioID          *uuid.UUID    `json:"operario_id"` // Puntero ya que puede ser nulo al inicio (CREADO)
	ServicioID          int           `json:"servicio_id"`
	Estado              TicketState   `json:"estado"`
	Direccion           string        `json:"direccion"`
	DescripcionProblema string        `json:"descripcion_problema"`
	PrecioFinal         *float64      `json:"precio_final"`     // Puntero ya que es nulo hasta finalizar
	MetodoPago          *MetodoPago   `json:"metodo_pago"`      // Puntero ya que es nulo hasta finalizar
	EvidenciaURL        *string       `json:"evidencia_url"`    // Puntero ya que es nulo hasta finalizar
	Resena              *TicketReview `json:"resena,omitempty"` // Presente si el ticket finalizado ya fue calificado
	CreatedAt           time.Time     `json:"created_at"`
	UpdatedAt           time.Time     `json:"updated_at"`
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
type Repository interface {
	// Create persiste un nuevo ticket y su registro inicial en ticket_history de forma atómica.
	Create(ctx context.Context, t *Ticket) error

	// List devuelve los tickets que cumplen con los filtros indicados, ordenados por created_at DESC.
	List(ctx context.Context, filter TicketFilter) ([]Ticket, error)

	// GetAvailable devuelve los tickets en estado CREADO y sin operario filtrados por especialidades.
	GetAvailable(ctx context.Context, operarioID uuid.UUID) ([]AvailableTicket, error)

	// HasOperarioSpecialty indica si el operario tiene registrada la especialidad servicioID.
	HasOperarioSpecialty(ctx context.Context, operarioID uuid.UUID, servicioID int) (bool, error)

	// GetOperarioApprovalStatus devuelve el estado_aprobacion actual del operario en users.
	GetOperarioApprovalStatus(ctx context.Context, operarioID uuid.UUID) (string, error)

	// FindByID busca un ticket por su identificador único UUID.
	FindByID(ctx context.Context, id uuid.UUID) (*Ticket, error)

	// AssignOperario asigna atómicamente el operario y registra la transición CREADO -> ASIGNADO.
	AssignOperario(ctx context.Context, ticketID uuid.UUID, operarioID uuid.UUID) error

	// UpdateState actualiza el estado del ticket condicionado a prevState y registra la auditoría en ticket_history.
	UpdateState(ctx context.Context, ticketID uuid.UUID, prevState, newState TicketState, usuarioID uuid.UUID, motivo string) error

	// Finish registra precio final, método de pago y evidencia pasando a FINALIZADO junto con su auditoría.
	Finish(ctx context.Context, ticketID uuid.UUID, operarioID uuid.UUID, precioFinal float64, metodoPago MetodoPago, evidenciaURL string) error

	// GetHistoryByTicketID devuelve la línea de tiempo cronológica de auditoría de un ticket.
	GetHistoryByTicketID(ctx context.Context, ticketID uuid.UUID) ([]TicketHistoryEntry, error)

	// CreateReview persiste la reseña de un ticket finalizado (traduce 23505 a ErrReviewAlreadyExists).
	CreateReview(ctx context.Context, review *TicketReview) (*TicketReview, error)

	// GetOperarioRating calcula el promedio, total y listado de reseñas de un operario.
	GetOperarioRating(ctx context.Context, operarioID uuid.UUID) (*OperarioRating, error)
}
