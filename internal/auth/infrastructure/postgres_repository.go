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
		INSERT INTO users (id, nombre, email, password_hash, rol, telefono, estado_aprobacion)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING created_at
	`

	estadoAprobacion := u.EstadoAprobacion
	if estadoAprobacion == "" {
		estadoAprobacion = domain.ApprovalAprobado
	}

	err := r.db.QueryRowContext(
		ctx,
		query,
		u.ID,
		u.Nombre,
		u.Email,
		u.PasswordHash,
		string(u.Rol),
		u.Telefono,
		string(estadoAprobacion),
	).Scan(&u.CreatedAt)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" { // unique_violation
			return domain.ErrEmailAlreadyExists
		}
		return fmt.Errorf("error creando usuario: %w", err)
	}

	u.EstadoAprobacion = estadoAprobacion
	return nil
}

// GetByEmail busca un usuario por su email.
func (r *PostgresAuthRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	query := `
		SELECT id, nombre, email, password_hash, rol, telefono, estado_aprobacion, created_at
		FROM users
		WHERE email = $1
	`

	u := &domain.User{}
	var rol string
	var estadoAprob string
	var telefono sql.NullString

	err := r.db.QueryRowContext(ctx, query, email).
		Scan(&u.ID, &u.Nombre, &u.Email, &u.PasswordHash, &rol, &telefono, &estadoAprob, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("error consultando usuario por email: %w", err)
	}

	u.Rol = domain.UserRole(rol)
	u.EstadoAprobacion = domain.ApprovalStatus(estadoAprob)
	if telefono.Valid {
		u.Telefono = telefono.String
	}

	return u, nil
}

// GetByID busca un usuario por su UUID primario.
func (r *PostgresAuthRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	query := `
		SELECT id, nombre, email, password_hash, rol, telefono, estado_aprobacion, created_at
		FROM users
		WHERE id = $1
	`

	u := &domain.User{}
	var rol string
	var estadoAprob string
	var telefono sql.NullString

	err := r.db.QueryRowContext(ctx, query, id).
		Scan(&u.ID, &u.Nombre, &u.Email, &u.PasswordHash, &rol, &telefono, &estadoAprob, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("error consultando usuario por id: %w", err)
	}

	u.Rol = domain.UserRole(rol)
	u.EstadoAprobacion = domain.ApprovalStatus(estadoAprob)
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
		RETURNING id, nombre, email, rol, telefono, estado_aprobacion, created_at
	`

	u := &domain.User{}
	var rol string
	var estadoAprob string
	var tel sql.NullString

	err := r.db.QueryRowContext(ctx, query, nombre, telefono, id).
		Scan(&u.ID, &u.Nombre, &u.Email, &rol, &tel, &estadoAprob, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("error actualizando perfil de usuario: %w", err)
	}

	u.Rol = domain.UserRole(rol)
	u.EstadoAprobacion = domain.ApprovalStatus(estadoAprob)
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

// ListOperarios devuelve todos los usuarios con rol OPERARIO (con filtro opcional por estado_aprobacion)
// ordenados por fecha de creación descendente.
func (r *PostgresAuthRepository) ListOperarios(ctx context.Context, estado *domain.ApprovalStatus) ([]domain.User, error) {
	query := `
		SELECT id, nombre, email, rol, telefono, estado_aprobacion, created_at
		FROM users
		WHERE rol = $1
	`
	args := []interface{}{string(domain.RoleOperario)}

	if estado != nil {
		args = append(args, string(*estado))
		query += " AND estado_aprobacion = $2"
	}

	query += " ORDER BY created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("error listando operarios: %w", err)
	}
	defer rows.Close()

	operarios := make([]domain.User, 0)
	for rows.Next() {
		var u domain.User
		var rol string
		var estadoAprob string
		var tel sql.NullString

		if err := rows.Scan(&u.ID, &u.Nombre, &u.Email, &rol, &tel, &estadoAprob, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("error escaneando operario: %w", err)
		}

		u.Rol = domain.UserRole(rol)
		u.EstadoAprobacion = domain.ApprovalStatus(estadoAprob)
		if tel.Valid {
			u.Telefono = tel.String
		}

		operarios = append(operarios, u)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterando operarios: %w", err)
	}

	return operarios, nil
}

// UpdateOperarioApproval actualiza el estado_aprobacion de un usuario con rol OPERARIO.
func (r *PostgresAuthRepository) UpdateOperarioApproval(ctx context.Context, operarioID uuid.UUID, estado domain.ApprovalStatus) (*domain.User, error) {
	query := `
		UPDATE users
		SET estado_aprobacion = $1, updated_at = NOW()
		WHERE id = $2 AND rol = $3
		RETURNING id, nombre, email, rol, telefono, estado_aprobacion, created_at
	`

	u := &domain.User{}
	var rol string
	var estadoAprob string
	var tel sql.NullString

	err := r.db.QueryRowContext(ctx, query, string(estado), operarioID, string(domain.RoleOperario)).
		Scan(&u.ID, &u.Nombre, &u.Email, &rol, &tel, &estadoAprob, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			var existingRol string
			checkErr := r.db.QueryRowContext(ctx, "SELECT rol FROM users WHERE id = $1", operarioID).Scan(&existingRol)
			if errors.Is(checkErr, sql.ErrNoRows) {
				return nil, domain.ErrUserNotFound
			}
			if checkErr != nil {
				return nil, fmt.Errorf("error verificando rol de usuario: %w", checkErr)
			}
			return nil, domain.ErrTargetNotOperario
		}
		return nil, fmt.Errorf("error actualizando aprobación de operario: %w", err)
	}

	u.Rol = domain.UserRole(rol)
	u.EstadoAprobacion = domain.ApprovalStatus(estadoAprob)
	if tel.Valid {
		u.Telefono = tel.String
	}

	return u, nil
}
