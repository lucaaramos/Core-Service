package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"core-service/internal/config"
	"core-service/internal/messaging"

	"github.com/joho/godotenv"
	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	notificationsQueueName = "notifications.tickets"
	bindingPattern         = "ticket.*"
	consumerTag            = "core-service-notification-worker"
	prefetchCount          = 10
	maxConnectAttempts     = 15
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()
	amqpURL := cfg.RabbitMQURL
	if amqpURL == "" {
		amqpURL = "amqp://guest:guest@localhost:5672/"
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	conn, err := connectWithRetry(ctx, amqpURL)
	if err != nil {
		log.Fatalf("[WORKER] No se pudo conectar a RabbitMQ: %v", err)
	}
	defer func() {
		_ = conn.Close()
	}()

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("[WORKER] Error abriendo canal AMQP: %v", err)
	}
	defer func() {
		_ = ch.Close()
	}()

	if err := ch.ExchangeDeclare(
		cfg.RabbitMQExchange,
		"topic",
		true,  // durable
		false, // auto-deleted
		false, // internal
		false, // no-wait
		nil,
	); err != nil {
		log.Fatalf("[WORKER] Error declarando exchange %q: %v", cfg.RabbitMQExchange, err)
	}

	queue, err := ch.QueueDeclare(
		notificationsQueueName,
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,
	)
	if err != nil {
		log.Fatalf("[WORKER] Error declarando cola %q: %v", notificationsQueueName, err)
	}

	if err := ch.QueueBind(
		queue.Name,
		bindingPattern,
		cfg.RabbitMQExchange,
		false,
		nil,
	); err != nil {
		log.Fatalf("[WORKER] Error enlazando cola %q con %q (%s): %v", queue.Name, cfg.RabbitMQExchange, bindingPattern, err)
	}

	if err := ch.Qos(prefetchCount, 0, false); err != nil {
		log.Fatalf("[WORKER] Error configurando QoS: %v", err)
	}

	deliveries, err := ch.Consume(
		queue.Name,
		consumerTag,
		false, // autoAck = false
		false, // exclusive
		false, // noLocal
		false, // noWait
		nil,
	)
	if err != nil {
		log.Fatalf("[WORKER] Error iniciando consumo de %q: %v", queue.Name, err)
	}

	log.Printf(
		"[WORKER] Escuchando eventos en cola=%s exchange=%s pattern=%s (prefetch=%d)",
		queue.Name,
		cfg.RabbitMQExchange,
		bindingPattern,
		prefetchCount,
	)

	for {
		select {
		case <-ctx.Done():
			log.Println("[WORKER] Señal de apagado recibida, deteniendo consumidor…")
			_ = ch.Cancel(consumerTag, false)
			log.Println("[WORKER] Apagado completo")
			return

		case msg, ok := <-deliveries:
			if !ok {
				log.Println("[WORKER] Canal de entregas cerrado por el broker; terminando proceso")
				os.Exit(1)
			}
			handleDelivery(msg)
		}
	}
}

func connectWithRetry(ctx context.Context, amqpURL string) (*amqp.Connection, error) {
	var lastErr error
	for attempt := 1; attempt <= maxConnectAttempts; attempt++ {
		conn, err := amqp.Dial(amqpURL)
		if err == nil {
			log.Printf("[WORKER] Conectado a RabbitMQ en el intento %d", attempt)
			return conn, nil
		}

		lastErr = err
		wait := time.Duration(attempt) * time.Second
		if wait > 5*time.Second {
			wait = 5 * time.Second
		}
		log.Printf("[WORKER] Intento %d/%d fallido conectando a RabbitMQ (%v); reintentando en %s…", attempt, maxConnectAttempts, err, wait)

		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("cancelado por señal de apagado: %w", ctx.Err())
		case <-time.After(wait):
		}
	}

	return nil, fmt.Errorf("agotados %d intentos: %w", maxConnectAttempts, lastErr)
}

func handleDelivery(msg amqp.Delivery) {
	var event messaging.TicketEvent
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		log.Printf("[WORKER] [ERROR] JSON inválido en routing_key=%s: %v (descartando con Nack sin requeue)", msg.RoutingKey, err)
		if nackErr := msg.Nack(false, false); nackErr != nil {
			log.Printf("[WORKER] [ERROR] Falló Nack del mensaje corrupto: %v", nackErr)
		}
		return
	}

	operarioStr := "sin_asignar"
	if event.OperarioID != nil {
		operarioStr = event.OperarioID.String()
	}

	switch event.EventType {
	case messaging.EventTicketCreated:
		log.Printf(
			"[NOTIF] %s | ticket=%s servicio_id=%d cliente=%s estado=%s | Notificando nueva solicitud disponible",
			event.EventType,
			event.TicketID,
			event.ServicioID,
			event.ClienteID,
			event.Estado,
		)
	case messaging.EventTicketAssigned:
		log.Printf(
			"[NOTIF] %s | ticket=%s operario=%s cliente=%s servicio_id=%d | Notificando al cliente que su solicitud fue asignada",
			event.EventType,
			event.TicketID,
			operarioStr,
			event.ClienteID,
			event.ServicioID,
		)
	case messaging.EventTicketFinished:
		log.Printf(
			"[NOTIF] %s | ticket=%s operario=%s cliente=%s servicio_id=%d | Notificando al cliente el cierre del trabajo e invitando a calificar",
			event.EventType,
			event.TicketID,
			operarioStr,
			event.ClienteID,
			event.ServicioID,
		)
	default:
		log.Printf(
			"[NOTIF] %s | ticket=%s operario=%s cliente=%s estado=%s",
			event.EventType,
			event.TicketID,
			operarioStr,
			event.ClienteID,
			event.Estado,
		)
	}

	if err := msg.Ack(false); err != nil {
		log.Printf("[WORKER] [ERROR] Falló Ack para ticket=%s (%s): %v", event.TicketID, event.EventType, err)
	}
}
