package infrastructure

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"core-service/internal/auth/domain"

	"github.com/google/uuid"
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
		SELECT id, nombre, email, password_hash, rol, telefono, created_at
		FROM users
		WHERE email = $1
	`

	u := &domain.User{}
	var rol string
	var telefono sql.NullString

	err := r.db.QueryRowContext(ctx, query, email).
		Scan(&u.ID, &u.Nombre, &u.Email, &u.PasswordHash, &rol, &telefono, &u.CreatedAt)
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

// GetByID busca un usuario por su UUID primario.
func (r *PostgresAuthRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	query := `
		SELECT id, nombre, email, password_hash, rol, telefono, created_at
		FROM users
		WHERE id = $1
	`

	u := &domain.User{}
	var rol string
	var telefono sql.NullString

	err := r.db.QueryRowContext(ctx, query, id).
		Scan(&u.ID, &u.Nombre, &u.Email, &u.PasswordHash, &rol, &telefono, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("error consultando usuario por id: %w", err)
	}

	u.Rol = domain.UserRole(rol)
	if telefono.Valid {
		u.Telefono = telefono.String
	}

	return u, nil
}

// UpdateProfile actualiza nombre y teléfono del usuario y devuelve su perfil actualizado.
func (r *PostgresAuthRepository) UpdateProfile(ctx context.Context, id uuid.UUID, nombre, telefono string) (*domain.User, error) {
	query := `
		UPDATE users
		SET nombre = $1, telefono = $2, updated_at = NOW()
		WHERE id = $3
		RETURNING id, nombre, email, rol, telefono, created_at
	`

	u := &domain.User{}
	var rol string
	var tel sql.NullString

	err := r.db.QueryRowContext(ctx, query, nombre, telefono, id).
		Scan(&u.ID, &u.Nombre, &u.Email, &rol, &tel, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("error actualizando perfil de usuario: %w", err)
	}

	u.Rol = domain.UserRole(rol)
	if tel.Valid {
		u.Telefono = tel.String
	}

	return u, nil
}

// UpdatePassword reemplaza el hash bcrypt de la contraseña del usuario.
func (r *PostgresAuthRepository) UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error {
	query := `
		UPDATE users
		SET password_hash = $1, updated_at = NOW()
		WHERE id = $2
	`

	result, err := r.db.ExecContext(ctx, query, passwordHash, id)
	if err != nil {
		return fmt.Errorf("error actualizando contraseña de usuario: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error verificando filas afectadas al actualizar contraseña: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrUserNotFound
	}

	return nil
}
