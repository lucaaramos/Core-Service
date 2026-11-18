package infrastructure

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"core-service/internal/auth/domain"

	"github.com/lib/pq"
)

// PostgresAuthRepository implementa domain.AuthRepository sobre PostgreSQL.
type PostgresAuthRepository struct {
	db *sql.DB
}

// NewPostgresAuthRepository crea una nueva instancia del repositorio de usuarios.
func NewPostgresAuthRepository(db *sql.DB) *PostgresAuthRepository {
	return &PostgresAuthRepository{db: db}
}

// CreateUser persiste un nuevo usuario. Traduce la violación de unicidad a domain.ErrEmailAlreadyExists.
func (r *PostgresAuthRepository) CreateUser(ctx context.Context, u *domain.User) error {
	query := `
		INSERT INTO users (id, nombre, email, password_hash, rol, telefono)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err := r.db.ExecContext(ctx, query, u.ID, u.Nombre, u.Email, u.PasswordHash, string(u.Rol), u.Telefono)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" { // unique_violation
			return domain.ErrEmailAlreadyExists
		}
		return fmt.Errorf("error creando usuario: %w", err)
	}

	return nil
}

// GetByEmail busca un usuario por su email.
func (r *PostgresAuthRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	query := `
		SELECT id, nombre, email, password_hash, rol, telefono
		FROM users
		WHERE email = $1
	`

	u := &domain.User{}
	var rol string
	var telefono sql.NullString

	err := r.db.QueryRowContext(ctx, query, email).
		Scan(&u.ID, &u.Nombre, &u.Email, &u.PasswordHash, &rol, &telefono)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("error consultando usuario por email: %w", err)
	}

	u.Rol = domain.UserRole(rol)
	if telefono.Valid {
		u.Telefono = telefono.String
	}

	return u, nil
}
