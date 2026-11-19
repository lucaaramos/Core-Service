package infrastructure

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"core-service/internal/ticket/domain"

	"github.com/google/uuid"
)

// PostgresTicketRepository implementa domain.Repository utilizando database/sql con PostgreSQL.
type PostgresTicketRepository struct {
	db *sql.DB
}

// NewPostgresTicketRepository crea una nueva instancia de PostgresTicketRepository.
func NewPostgresTicketRepository(db *sql.DB) *PostgresTicketRepository {
	return &PostgresTicketRepository{db: db}
}

// ticketModel es una estructura auxiliar para el mapeo seguro desde y hacia sql.Rows.
type ticketModel struct {
	ID                  uuid.UUID
	ClienteID           uuid.UUID
	OperarioID          sql.NullString
	ServicioID          int
	Estado              string
	Direccion           string
	DescripcionProblema string
	PrecioFinal         sql.NullFloat64
	MetodoPago          sql.NullString
	EvidenciaURL        sql.NullString
	CreatedAt           sql.NullTime
	UpdatedAt           sql.NullTime
}

func (m *ticketModel) toDomain() (*domain.Ticket, error) {
	t := &domain.Ticket{
		ID:                  m.ID,
		ClienteID:           m.ClienteID,
		ServicioID:          m.ServicioID,
		Estado:              domain.TicketState(m.Estado),
		Direccion:           m.Direccion,
		DescripcionProblema: m.DescripcionProblema,
		CreatedAt:           m.CreatedAt.Time,
		UpdatedAt:           m.UpdatedAt.Time,
	}

	if m.OperarioID.Valid {
		opID, err := uuid.Parse(m.OperarioID.String)
		if err != nil {
			return nil, fmt.Errorf("error parseando operario_id UUID: %w", err)
		}
		t.OperarioID = &opID
	}

	if m.PrecioFinal.Valid {
		precio := m.PrecioFinal.Float64
		t.PrecioFinal = &precio
	}

	if m.MetodoPago.Valid {
		mp := domain.MetodoPago(m.MetodoPago.String)
		t.MetodoPago = &mp
	}

	if m.EvidenciaURL.Valid {
		ev := m.EvidenciaURL.String
		t.EvidenciaURL = &ev
	}

	return t, nil
}

// Create persiste un nuevo ticket en la base de datos PostgreSQL.
func (r *PostgresTicketRepository) Create(ctx context.Context, t *domain.Ticket) error {
	query := `
		INSERT INTO tickets (id, cliente_id, operario_id, servicio_id, estado, direccion, descripcion_problema, precio_final, metodo_pago, evidencia_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`

	var operarioIDVal interface{}
	if t.OperarioID != nil {
		operarioIDVal = *t.OperarioID
	}

	var precioFinalVal interface{}
	if t.PrecioFinal != nil {
		precioFinalVal = *t.PrecioFinal
	}

	var metodoPagoVal interface{}
	if t.MetodoPago != nil {
		metodoPagoVal = string(*t.MetodoPago)
	}

	var evidenciaURLVal interface{}
	if t.EvidenciaURL != nil {
		evidenciaURLVal = *t.EvidenciaURL
	}

	_, err := r.db.ExecContext(
		ctx,
		query,
		t.ID,
		t.ClienteID,
		operarioIDVal,
		t.ServicioID,
		string(t.Estado),
		t.Direccion,
		t.DescripcionProblema,
		precioFinalVal,
		metodoPagoVal,
		evidenciaURLVal,
		t.CreatedAt,
		t.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("error creando ticket en postgres: %w", err)
	}

	return nil
}

// FindByID busca un ticket por su ID único UUID.
func (r *PostgresTicketRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Ticket, error) {
	query := `
		SELECT id, cliente_id, operario_id, servicio_id, estado, direccion, descripcion_problema, precio_final, metodo_pago, evidencia_url, created_at, updated_at
		FROM tickets
		WHERE id = $1
	`

	row := r.db.QueryRowContext(ctx, query, id)

	var m ticketModel
	err := row.Scan(
		&m.ID,
		&m.ClienteID,
		&m.OperarioID,
		&m.ServicioID,
		&m.Estado,
		&m.Direccion,
		&m.DescripcionProblema,
		&m.PrecioFinal,
		&m.MetodoPago,
		&m.EvidenciaURL,
		&m.CreatedAt,
		&m.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrTicketNotFound
		}
		return nil, fmt.Errorf("error consultando ticket por id: %w", err)
	}

	return m.toDomain()
}

// GetAvailable devuelve los tickets disponibles en la bolsa de trabajo (CREADO y sin operario).
func (r *PostgresTicketRepository) GetAvailable(ctx context.Context) ([]domain.AvailableTicket, error) {
	query := `
		SELECT t.id, s.nombre, t.direccion, t.descripcion_problema, s.tarifa_base, t.created_at
		FROM tickets t
		INNER JOIN services s ON s.id = t.servicio_id
		WHERE t.estado = $1 AND t.operario_id IS NULL
		ORDER BY t.created_at ASC
	`

	rows, err := r.db.QueryContext(ctx, query, string(domain.StateCreado))
	if err != nil {
		return nil, fmt.Errorf("error consultando tickets disponibles: %w", err)
	}
	defer rows.Close()

	available := make([]domain.AvailableTicket, 0)
	for rows.Next() {
		var t domain.AvailableTicket
		if err := rows.Scan(
			&t.ID,
			&t.Servicio,
			&t.Direccion,
			&t.DescripcionProblema,
			&t.TarifaBase,
			&t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("error escaneando ticket disponible: %w", err)
		}
		available = append(available, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterando tickets disponibles: %w", err)
	}

	return available, nil
}

// GetTicketsByUser devuelve todos los tickets donde el usuario participa como cliente u operario,
// ordenados por fecha de creación descendente.
func (r *PostgresTicketRepository) GetTicketsByUser(ctx context.Context, userID uuid.UUID) ([]domain.Ticket, error) {
	query := `
		SELECT id, cliente_id, operario_id, servicio_id, estado, direccion, descripcion_problema, precio_final, metodo_pago, evidencia_url, created_at, updated_at
		FROM tickets
		WHERE cliente_id = $1 OR operario_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("error consultando tickets del usuario: %w", err)
	}
	defer rows.Close()

	tickets := make([]domain.Ticket, 0)
	for rows.Next() {
		var m ticketModel
		if err := rows.Scan(
			&m.ID,
			&m.ClienteID,
			&m.OperarioID,
			&m.ServicioID,
			&m.Estado,
			&m.Direccion,
			&m.DescripcionProblema,
			&m.PrecioFinal,
			&m.MetodoPago,
			&m.EvidenciaURL,
			&m.CreatedAt,
			&m.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("error escaneando ticket del usuario: %w", err)
		}

		ticket, err := m.toDomain()
		if err != nil {
			return nil, err
		}
		tickets = append(tickets, *ticket)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterando tickets del usuario: %w", err)
	}

	return tickets, nil
}

// AssignOperario maneja la concurrencia al aceptar un ticket mediante la cláusula WHERE estado = 'CREADO'.
func (r *PostgresTicketRepository) AssignOperario(ctx context.Context, ticketID uuid.UUID, operarioID uuid.UUID) error {
	query := `
		UPDATE tickets
		SET operario_id = $1, estado = $2, updated_at = NOW()
		WHERE id = $3 AND estado = $4
	`

	result, err := r.db.ExecContext(ctx, query, operarioID, string(domain.StateAsignado), ticketID, string(domain.StateCreado))
	if err != nil {
		return fmt.Errorf("error ejecutando asignación de operario: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error obteniendo filas afectadas en asignación: %w", err)
	}

	if rowsAffected == 0 {
		// Validar si el ticket existe o si ya fue tomado por otro operario (no está en CREADO)
		var exists bool
		checkQuery := `SELECT EXISTS(SELECT 1 FROM tickets WHERE id = $1)`
		if err := r.db.QueryRowContext(ctx, checkQuery, ticketID).Scan(&exists); err != nil {
			return fmt.Errorf("error verificando existencia del ticket: %w", err)
		}

		if !exists {
			return domain.ErrTicketNotFound
		}

		return domain.ErrTicketAlreadyAssigned
	}

	return nil
}

// UpdateState actualiza el estado del ticket en la máquina de estados.
func (r *PostgresTicketRepository) UpdateState(ctx context.Context, ticketID uuid.UUID, newState domain.TicketState) error {
	query := `
		UPDATE tickets
		SET estado = $1, updated_at = NOW()
		WHERE id = $2
	`

	result, err := r.db.ExecContext(ctx, query, string(newState), ticketID)
	if err != nil {
		return fmt.Errorf("error actualizando estado del ticket: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error obteniendo filas afectadas en actualización de estado: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrTicketNotFound
	}

	return nil
}
