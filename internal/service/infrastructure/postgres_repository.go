package infrastructure

import (
	"context"
	"database/sql"
	"fmt"

	"core-service/internal/service/domain"
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
