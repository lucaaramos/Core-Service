package infrastructure

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"core-service/internal/service/domain"

	"github.com/google/uuid"
)

// PostgresServiceRepository implementa domain.ServiceRepository sobre PostgreSQL.
type PostgresServiceRepository struct {
	db *sql.DB
}

// NewPostgresServiceRepository crea una nueva instancia del repositorio de servicios.
func NewPostgresServiceRepository(db *sql.DB) *PostgresServiceRepository {
	return &PostgresServiceRepository{db: db}
}

// GetAll devuelve el catálogo completo de servicios ordenado por id ascendente.
func (r *PostgresServiceRepository) GetAll(ctx context.Context) ([]domain.Service, error) {
	query := `
		SELECT id, nombre, descripcion, tarifa_base, created_at
		FROM services
		ORDER BY id ASC
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("error consultando servicios: %w", err)
	}
	defer rows.Close()

	return scanServices(rows)
}

// GetByOperarioID devuelve los servicios asociados a un operario ordenados por id ascendente.
func (r *PostgresServiceRepository) GetByOperarioID(ctx context.Context, operarioID uuid.UUID) ([]domain.Service, error) {
	query := `
		SELECT s.id, s.nombre, s.descripcion, s.tarifa_base, s.created_at
		FROM services s
		INNER JOIN operario_services os ON os.servicio_id = s.id
		WHERE os.operario_id = $1
		ORDER BY s.id ASC
	`

	rows, err := r.db.QueryContext(ctx, query, operarioID)
	if err != nil {
		return nil, fmt.Errorf("error consultando especialidades del operario: %w", err)
	}
	defer rows.Close()

	return scanServices(rows)
}

// ReplaceOperarioServices valida que todos los serviceIDs existan en services, elimina las
// especialidades previas del operario e inserta las nuevas dentro de una misma transacción SQL.
func (r *PostgresServiceRepository) ReplaceOperarioServices(ctx context.Context, operarioID uuid.UUID, serviceIDs []int) ([]domain.Service, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("error iniciando transacción de especialidades: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if len(serviceIDs) > 0 {
		placeholders := make([]string, len(serviceIDs))
		args := make([]interface{}, len(serviceIDs))
		for i, id := range serviceIDs {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
			args[i] = id
		}

		checkQuery := fmt.Sprintf(
			"SELECT COUNT(*) FROM services WHERE id IN (%s)",
			strings.Join(placeholders, ", "),
		)

		var foundCount int
		if err := tx.QueryRowContext(ctx, checkQuery, args...).Scan(&foundCount); err != nil {
			return nil, fmt.Errorf("error validando existencia de servicios: %w", err)
		}

		if foundCount != len(serviceIDs) {
			return nil, domain.ErrInvalidServiceIDs
		}
	}

	if _, err := tx.ExecContext(ctx, "DELETE FROM operario_services WHERE operario_id = $1", operarioID); err != nil {
		return nil, fmt.Errorf("error limpiando especialidades anteriores: %w", err)
	}

	if len(serviceIDs) > 0 {
		valueTuples := make([]string, len(serviceIDs))
		insertArgs := make([]interface{}, 0, len(serviceIDs)+1)
		insertArgs = append(insertArgs, operarioID)

		for i, id := range serviceIDs {
			valueTuples[i] = fmt.Sprintf("($1, $%d)", i+2)
			insertArgs = append(insertArgs, id)
		}

		insertQuery := fmt.Sprintf(
			"INSERT INTO operario_services (operario_id, servicio_id) VALUES %s",
			strings.Join(valueTuples, ", "),
		)

		if _, err := tx.ExecContext(ctx, insertQuery, insertArgs...); err != nil {
			return nil, fmt.Errorf("error insertando nuevas especialidades: %w", err)
		}
	}

	selectQuery := `
		SELECT s.id, s.nombre, s.descripcion, s.tarifa_base, s.created_at
		FROM services s
		INNER JOIN operario_services os ON os.servicio_id = s.id
		WHERE os.operario_id = $1
		ORDER BY s.id ASC
	`

	rows, err := tx.QueryContext(ctx, selectQuery, operarioID)
	if err != nil {
		return nil, fmt.Errorf("error consultando especialidades actualizadas: %w", err)
	}
	services, err := scanServices(rows)
	rows.Close()
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("error confirmando transacción de especialidades: %w", err)
	}

	return services, nil
}

func scanServices(rows *sql.Rows) ([]domain.Service, error) {
	services := make([]domain.Service, 0)
	for rows.Next() {
		var s domain.Service
		var descripcion sql.NullString

		if err := rows.Scan(&s.ID, &s.Nombre, &descripcion, &s.TarifaBase, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("error escaneando servicio: %w", err)
		}

		if descripcion.Valid {
			s.Descripcion = &descripcion.String
		}

		services = append(services, s)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterando servicios: %w", err)
	}

	return services, nil
}
