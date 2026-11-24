package messaging

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Routing keys de eventos de dominio de tickets.
const (
	EventTicketCreated  = "ticket.created"
	EventTicketAssigned = "ticket.assigned"
	EventTicketFinished = "ticket.finished"
)

// TicketEvent representa el mensaje de evento publicado en el exchange de tickets.
type TicketEvent struct {
	EventType  string     `json:"event_type"`
	TicketID   uuid.UUID  `json:"ticket_id"`
	ServicioID int        `json:"servicio_id"`
	ClienteID  uuid.UUID  `json:"cliente_id"`
	OperarioID *uuid.UUID `json:"operario_id,omitempty"`
	Estado     string     `json:"estado"`
	OccurredAt time.Time  `json:"occurred_at"`
}

// EventPublisher abstrae la publicación de eventos de dominio hacia un broker de mensajería.
type EventPublisher interface {
	Publish(ctx context.Context, routingKey string, payload any) error
}
