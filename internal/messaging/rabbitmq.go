package messaging

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const defaultPublishTimeout = 5 * time.Second

// RabbitMQPublisher publica eventos JSON persistentes en un exchange topic de RabbitMQ.
type RabbitMQPublisher struct {
	conn      *amqp.Connection
	ch        *amqp.Channel
	exchange  string
	mu        sync.Mutex
	closeOnce sync.Once
}

// NewRabbitMQPublisher conecta con RabbitMQ (con reintentos breves de arranque) y declara el exchange topic durable.
func NewRabbitMQPublisher(amqpURL, exchange string) (*RabbitMQPublisher, error) {
	if exchange == "" {
		exchange = "tickets.events"
	}

	var conn *amqp.Connection
	var err error
	for attempt := 1; attempt <= 5; attempt++ {
		conn, err = amqp.Dial(amqpURL)
		if err == nil {
			break
		}
		if attempt < 5 {
			time.Sleep(time.Duration(attempt) * time.Second)
		}
	}
	if err != nil {
		return nil, fmt.Errorf("error conectando a RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("error abriendo canal AMQP: %w", err)
	}

	if err := ch.ExchangeDeclare(
		exchange,
		"topic",
		true,  // durable
		false, // auto-deleted
		false, // internal
		false, // no-wait
		nil,
	); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, fmt.Errorf("error declarando exchange %q: %w", exchange, err)
	}

	return &RabbitMQPublisher{
		conn:     conn,
		ch:       ch,
		exchange: exchange,
	}, nil
}

// Publish serializa el payload a JSON y lo publica con DeliveryMode Persistent de forma thread-safe.
func (p *RabbitMQPublisher) Publish(ctx context.Context, routingKey string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("error serializando evento %q: %w", routingKey, err)
	}

	pubCtx, cancel := context.WithTimeout(ctx, defaultPublishTimeout)
	defer cancel()

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.ch == nil {
		return errors.New("canal RabbitMQ cerrado")
	}

	if err := p.ch.PublishWithContext(
		pubCtx,
		p.exchange,
		routingKey,
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Timestamp:    time.Now().UTC(),
			Body:         body,
		},
	); err != nil {
		return fmt.Errorf("error publicando mensaje en exchange %q (%s): %w", p.exchange, routingKey, err)
	}

	return nil
}

// Close cierra de forma idempotente el canal y la conexión AMQP.
func (p *RabbitMQPublisher) Close() error {
	var closeErr error
	p.closeOnce.Do(func() {
		p.mu.Lock()
		defer p.mu.Unlock()

		var chErr, connErr error
		if p.ch != nil {
			chErr = p.ch.Close()
			p.ch = nil
		}
		if p.conn != nil {
			connErr = p.conn.Close()
			p.conn = nil
		}
		closeErr = errors.Join(chErr, connErr)
	})
	return closeErr
}

// NoopPublisher descarta silenciosamente los eventos cuando no hay broker configurado.
type NoopPublisher struct{}

// NewNoopPublisher devuelve una implementación sin efectos secundarios de EventPublisher.
func NewNoopPublisher() *NoopPublisher {
	return &NoopPublisher{}
}

// Publish cumple la interfaz EventPublisher sin realizar operaciones de red.
func (p *NoopPublisher) Publish(_ context.Context, _ string, _ any) error {
	return nil
}
