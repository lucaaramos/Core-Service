package infrastructure

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"

	"core-service/internal/ticket/domain"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// PostgresTicketRepository implementa domain.Repository utilizando database/sql con PostgreSQL.
type PostgresTicketRepository struct {
	db *sql.DB
}

// NewPostgresTicketRepository crea una nueva instancia de PostgresTicketRepository.
func NewPostgresTicketRepository(db *sql.DB) *PostgresTicketRepository {
	return &PostgresTicketRepository{db: db}
}

// ticketModel es una estructura auxiliar para el mapeo seguro desde y hacia sql.Rows,
// incluyendo los campos opcionales provenientes del LEFT JOIN con ticket_reviews.
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
	ReviewID            sql.NullString
	ReviewClienteID     sql.NullString
	ReviewOperarioID    sql.NullString
	ReviewPuntuacion    sql.NullInt64
	ReviewComentario    sql.NullString
	ReviewCreatedAt     sql.NullTime
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

	if m.ReviewID.Valid {
		revID, err := uuid.Parse(m.ReviewID.String)
		if err != nil {
			return nil, fmt.Errorf("error parseando review id UUID: %w", err)
		}
		revClienteID, err := uuid.Parse(m.ReviewClienteID.String)
		if err != nil {
			return nil, fmt.Errorf("error parseando review cliente_id UUID: %w", err)
		}
		revOperarioID, err := uuid.Parse(m.ReviewOperarioID.String)
		if err != nil {
			return nil, fmt.Errorf("error parseando review operario_id UUID: %w", err)
		}

		t.Resena = &domain.TicketReview{
			ID:         revID,
			TicketID:   m.ID,
			ClienteID:  revClienteID,
			OperarioID: revOperarioID,
			Puntuacion: int(m.ReviewPuntuacion.Int64),
			Comentario: m.ReviewComentario.String,
			CreatedAt:  m.ReviewCreatedAt.Time,
		}
	}

	return t, nil
}

func insertHistoryTx(
	ctx context.Context,
	tx *sql.Tx,
	ticketID uuid.UUID,
	estadoAnterior *domain.TicketState,
	estadoNuevo domain.TicketState,
	usuarioID uuid.UUID,
	motivo string,
) error {
	query := `
		INSERT INTO ticket_history (id, ticket_id, estado_anterior, estado_nuevo, usuario_id, motivo, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`

	var prevVal interface{}
	if estadoAnterior != nil {
		prevVal = string(*estadoAnterior)
	}

	if _, err := tx.ExecContext(
		ctx,
		query,
		uuid.New(),
		ticketID,
		prevVal,
		string(estadoNuevo),
		usuarioID,
		motivo,
	); err != nil {
		return fmt.Errorf("error registrando auditoría en ticket_history: %w", err)
	}

	return nil
}

// Create persiste un nuevo ticket y registra atómicamente su creación en ticket_history.
func (r *PostgresTicketRepository) Create(ctx context.Context, t *domain.Ticket) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("error iniciando transacción al crear ticket: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

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

	if _, err := tx.ExecContext(
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
	); err != nil {
		return fmt.Errorf("error creando ticket en postgres: %w", err)
	}

	if err := insertHistoryTx(ctx, tx, t.ID, nil, t.Estado, t.ClienteID, ""); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("error confirmando creación de ticket: %w", err)
	}

	return nil
}

// FindByID busca un ticket por su ID único UUID junto con su reseña opcional.
func (r *PostgresTicketRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Ticket, error) {
	query := `
		SELECT
			t.id, t.cliente_id, t.operario_id, t.servicio_id, t.estado,
			t.direccion, t.descripcion_problema, t.precio_final, t.metodo_pago,
			t.evidencia_url, t.created_at, t.updated_at,
			r.id, r.cliente_id, r.operario_id, r.puntuacion, r.comentario, r.created_at
		FROM tickets t
		LEFT JOIN ticket_reviews r ON r.ticket_id = t.id
		WHERE t.id = $1
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
		&m.ReviewID,
		&m.ReviewClienteID,
		&m.ReviewOperarioID,
		&m.ReviewPuntuacion,
		&m.ReviewComentario,
		&m.ReviewCreatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrTicketNotFound
		}
		return nil, fmt.Errorf("error consultando ticket por id: %w", err)
	}

	return m.toDomain()
}

// GetAvailable devuelve los tickets disponibles en la bolsa de trabajo (CREADO y sin operario)
// filtrados por las especialidades registradas del operario.
func (r *PostgresTicketRepository) GetAvailable(ctx context.Context, operarioID uuid.UUID) ([]domain.AvailableTicket, error) {
	query := `
		SELECT t.id, s.nombre, t.direccion, t.descripcion_problema, s.tarifa_base, t.created_at
		FROM tickets t
		INNER JOIN services s ON s.id = t.servicio_id
		INNER JOIN operario_services os ON os.servicio_id = t.servicio_id AND os.operario_id = $1
		WHERE t.estado = $2 AND t.operario_id IS NULL
		ORDER BY t.created_at ASC
	`

	rows, err := r.db.QueryContext(ctx, query, operarioID, string(domain.StateCreado))
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

// List devuelve los tickets que cumplen con los filtros opcionales indicados (incluyendo reseña si existe),
// aplicando solo los que están presentes y ordenando por fecha de creación descendente.
func (r *PostgresTicketRepository) List(ctx context.Context, filter domain.TicketFilter) ([]domain.Ticket, error) {
	query := `
		SELECT
			t.id, t.cliente_id, t.operario_id, t.servicio_id, t.estado,
			t.direccion, t.descripcion_problema, t.precio_final, t.metodo_pago,
			t.evidencia_url, t.created_at, t.updated_at,
			r.id, r.cliente_id, r.operario_id, r.puntuacion, r.comentario, r.created_at
		FROM tickets t
		LEFT JOIN ticket_reviews r ON r.ticket_id = t.id
		WHERE 1 = 1
	`
	args := make([]interface{}, 0, 3)

	if filter.ClienteID != nil {
		args = append(args, *filter.ClienteID)
		query += fmt.Sprintf(" AND t.cliente_id = $%d", len(args))
	}

	if filter.OperarioID != nil {
		args = append(args, *filter.OperarioID)
		query += fmt.Sprintf(" AND t.operario_id = $%d", len(args))
	}

	if filter.Estado != nil {
		args = append(args, *filter.Estado)
		query += fmt.Sprintf(" AND t.estado = $%d", len(args))
	}

	query += " ORDER BY t.created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("error consultando tickets: %w", err)
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
			&m.ReviewID,
			&m.ReviewClienteID,
			&m.ReviewOperarioID,
			&m.ReviewPuntuacion,
			&m.ReviewComentario,
			&m.ReviewCreatedAt,
		); err != nil {
			return nil, fmt.Errorf("error escaneando ticket: %w", err)
		}

		ticket, err := m.toDomain()
		if err != nil {
			return nil, err
		}
		tickets = append(tickets, *ticket)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterando tickets: %w", err)
	}

	return tickets, nil
}

// HasOperarioSpecialty verifica si el operario tiene asignado el servicio indicado en operario_services.
func (r *PostgresTicketRepository) HasOperarioSpecialty(ctx context.Context, operarioID uuid.UUID, servicioID int) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1
			FROM operario_services
			WHERE operario_id = $1 AND servicio_id = $2
		)
	`

	var exists bool
	if err := r.db.QueryRowContext(ctx, query, operarioID, servicioID).Scan(&exists); err != nil {
		return false, fmt.Errorf("error consultando especialidad de operario: %w", err)
	}

	return exists, nil
}

// AssignOperario maneja la concurrencia al aceptar un ticket (WHERE estado = 'CREADO'),
// asegura la especialidad y registra atómicamente CREADO -> ASIGNADO en ticket_history.
func (r *PostgresTicketRepository) AssignOperario(ctx context.Context, ticketID uuid.UUID, operarioID uuid.UUID) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("error iniciando transacción en asignación: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	query := `
		UPDATE tickets
		SET operario_id = $1, estado = $2, updated_at = NOW()
		WHERE id = $3 AND estado = $4
		  AND EXISTS (
			SELECT 1
			FROM operario_services os
			WHERE os.operario_id = $1 AND os.servicio_id = tickets.servicio_id
		  )
	`

	result, err := tx.ExecContext(ctx, query, operarioID, string(domain.StateAsignado), ticketID, string(domain.StateCreado))
	if err != nil {
		return fmt.Errorf("error ejecutando asignación de operario: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error obteniendo filas afectadas en asignación: %w", err)
	}

	if rowsAffected == 0 {
		var servicioID int
		checkQuery := `SELECT servicio_id FROM tickets WHERE id = $1`
		if err := tx.QueryRowContext(ctx, checkQuery, ticketID).Scan(&servicioID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrTicketNotFound
			}
			return fmt.Errorf("error verificando existencia del ticket: %w", err)
		}

		var hasSpecialty bool
		specQuery := `SELECT EXISTS(SELECT 1 FROM operario_services WHERE operario_id = $1 AND servicio_id = $2)`
		if err := tx.QueryRowContext(ctx, specQuery, operarioID, servicioID).Scan(&hasSpecialty); err != nil {
			return fmt.Errorf("error consultando especialidad de operario: %w", err)
		}
		if !hasSpecialty {
			return domain.ErrOperarioMissingSpecialty
		}

		return domain.ErrTicketAlreadyAssigned
	}

	prev := domain.StateCreado
	if err := insertHistoryTx(ctx, tx, ticketID, &prev, domain.StateAsignado, operarioID, ""); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("error confirmando transacción de asignación: %w", err)
	}

	return nil
}

// UpdateState actualiza el estado del ticket verificando que continúe en prevState
// y registra atómicamente la transición en ticket_history.
func (r *PostgresTicketRepository) UpdateState(
	ctx context.Context,
	ticketID uuid.UUID,
	prevState, newState domain.TicketState,
	usuarioID uuid.UUID,
	motivo string,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("error iniciando transacción de actualización de estado: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	query := `
		UPDATE tickets
		SET estado = $1, updated_at = NOW()
		WHERE id = $2 AND estado = $3
	`

	result, err := tx.ExecContext(ctx, query, string(newState), ticketID, string(prevState))
	if err != nil {
		return fmt.Errorf("error actualizando estado del ticket: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error obteniendo filas afectadas en actualización de estado: %w", err)
	}

	if rowsAffected == 0 {
		var exists bool
		if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM tickets WHERE id = $1)", ticketID).Scan(&exists); err != nil {
			return fmt.Errorf("error verificando existencia del ticket: %w", err)
		}
		if !exists {
			return domain.ErrTicketNotFound
		}
		return domain.ErrInvalidStateTransition
	}

	if err := insertHistoryTx(ctx, tx, ticketID, &prevState, newState, usuarioID, motivo); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("error confirmando cambio de estado del ticket: %w", err)
	}

	return nil
}

// Finish registra el cierre del trabajo (EN_PROGRESO -> FINALIZADO) junto con su auditoría en una sola transacción.
func (r *PostgresTicketRepository) Finish(
	ctx context.Context,
	ticketID uuid.UUID,
	operarioID uuid.UUID,
	precioFinal float64,
	metodoPago domain.MetodoPago,
	evidenciaURL string,
) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("error iniciando transacción de finalización: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	query := `
		UPDATE tickets
		SET precio_final = $1, metodo_pago = $2, evidencia_url = $3, estado = $4, updated_at = NOW()
		WHERE id = $5 AND estado = $6
	`

	var evidencia interface{}
	if evidenciaURL != "" {
		evidencia = evidenciaURL
	}

	result, err := tx.ExecContext(ctx, query,
		precioFinal,
		string(metodoPago),
		evidencia,
		string(domain.StateFinalizado),
		ticketID,
		string(domain.StateEnProgreso),
	)
	if err != nil {
		return fmt.Errorf("error finalizando ticket: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error obteniendo filas afectadas al finalizar: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrInvalidStateTransition
	}

	prev := domain.StateEnProgreso
	if err := insertHistoryTx(ctx, tx, ticketID, &prev, domain.StateFinalizado, operarioID, ""); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("error confirmando finalización de ticket: %w", err)
	}

	return nil
}

// GetHistoryByTicketID consulta la línea de tiempo de auditoría de un ticket junto con los datos del usuario autor.
func (r *PostgresTicketRepository) GetHistoryByTicketID(ctx context.Context, ticketID uuid.UUID) ([]domain.TicketHistoryEntry, error) {
	query := `
		SELECT
			th.id, th.ticket_id, th.estado_anterior, th.estado_nuevo,
			th.usuario_id, u.nombre, u.rol, th.motivo, th.created_at
		FROM ticket_history th
		INNER JOIN users u ON u.id = th.usuario_id
		WHERE th.ticket_id = $1
		ORDER BY th.created_at ASC, th.id ASC
	`

	rows, err := r.db.QueryContext(ctx, query, ticketID)
	if err != nil {
		return nil, fmt.Errorf("error consultando historial del ticket: %w", err)
	}
	defer rows.Close()

	entries := make([]domain.TicketHistoryEntry, 0)
	for rows.Next() {
		var entry domain.TicketHistoryEntry
		var estadoAnt sql.NullString
		var estadoNuevo string

		if err := rows.Scan(
			&entry.ID,
			&entry.TicketID,
			&estadoAnt,
			&estadoNuevo,
			&entry.UsuarioID,
			&entry.UsuarioNombre,
			&entry.UsuarioRol,
			&entry.Motivo,
			&entry.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("error escaneando registro de historial: %w", err)
		}

		if estadoAnt.Valid {
			prev := domain.TicketState(estadoAnt.String)
			entry.EstadoAnterior = &prev
		}
		entry.EstadoNuevo = domain.TicketState(estadoNuevo)
		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterando historial del ticket: %w", err)
	}

	return entries, nil
}

// CreateReview inserta una nueva reseña sobre un ticket finalizado (traduce 23505 a ErrReviewAlreadyExists).
func (r *PostgresTicketRepository) CreateReview(ctx context.Context, review *domain.TicketReview) (*domain.TicketReview, error) {
	query := `
		INSERT INTO ticket_reviews (id, ticket_id, cliente_id, operario_id, puntuacion, comentario, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, ticket_id, cliente_id, operario_id, puntuacion, comentario, created_at
	`

	created := &domain.TicketReview{}
	err := r.db.QueryRowContext(
		ctx,
		query,
		review.ID,
		review.TicketID,
		review.ClienteID,
		review.OperarioID,
		review.Puntuacion,
		review.Comentario,
		review.CreatedAt,
	).Scan(
		&created.ID,
		&created.TicketID,
		&created.ClienteID,
		&created.OperarioID,
		&created.Puntuacion,
		&created.Comentario,
		&created.CreatedAt,
	)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			return nil, domain.ErrReviewAlreadyExists
		}
		return nil, fmt.Errorf("error creando reseña de ticket: %w", err)
	}

	return created, nil
}

// GetOperarioRating devuelve el promedio, total de reseñas y listado ordenado por created_at DESC.
func (r *PostgresTicketRepository) GetOperarioRating(ctx context.Context, operarioID uuid.UUID) (*domain.OperarioRating, error) {
	query := `
		SELECT id, ticket_id, cliente_id, operario_id, puntuacion, comentario, created_at
		FROM ticket_reviews
		WHERE operario_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query, operarioID)
	if err != nil {
		return nil, fmt.Errorf("error consultando reseñas del operario: %w", err)
	}
	defer rows.Close()

	resenas := make([]domain.TicketReview, 0)
	totalPuntos := 0

	for rows.Next() {
		var rev domain.TicketReview
		if err := rows.Scan(
			&rev.ID,
			&rev.TicketID,
			&rev.ClienteID,
			&rev.OperarioID,
			&rev.Puntuacion,
			&rev.Comentario,
			&rev.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("error escaneando reseña de operario: %w", err)
		}
		totalPuntos += rev.Puntuacion
		resenas = append(resenas, rev)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterando reseñas del operario: %w", err)
	}

	promedio := 0.0
	if len(resenas) > 0 {
		promedio = math.Round((float64(totalPuntos)/float64(len(resenas)))*100) / 100
	}

	return &domain.OperarioRating{
		Promedio:     promedio,
		TotalResenas: len(resenas),
		Resenas:      resenas,
	}, nil
}
