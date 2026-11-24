package domain

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// UserRole representa los roles permitidos por el sistema.
type UserRole string

const (
	RoleCliente  UserRole = "CLIENTE"
	RoleOperario UserRole = "OPERARIO"
	RoleAdmin    UserRole = "ADMIN"
)

// ApprovalStatus representa el estado de habilitación administrativa de un usuario (especialmente OPERARIO).
type ApprovalStatus string

const (
	ApprovalPendiente ApprovalStatus = "PENDIENTE"
	ApprovalAprobado  ApprovalStatus = "APROBADO"
	ApprovalRechazado ApprovalStatus = "RECHAZADO"
)

// IsValidApprovalStatus indica si el string corresponde a un estado de aprobación válido.
func IsValidApprovalStatus(s string) bool {
	switch ApprovalStatus(s) {
	case ApprovalPendiente, ApprovalAprobado, ApprovalRechazado:
		return true
	default:
		return false
	}
}

var (
	ErrInvalidCredentials     = errors.New("credenciales inválidas")
	ErrInvalidCurrentPassword = errors.New("la contraseña actual es incorrecta")
	ErrEmailAlreadyExists     = errors.New("el email ya está registrado")
	ErrUserNotFound           = errors.New("usuario no encontrado")
	ErrInvalidRole            = errors.New("rol inválido")
	ErrInvalidInput           = errors.New("datos de solicitud inválidos")
	ErrEmptyName              = errors.New("el nombre no puede estar vacío")
	ErrWeakPassword           = errors.New("la nueva contraseña debe tener al menos 6 caracteres")
	ErrInvalidApprovalStatus  = errors.New("estado de aprobación inválido")
	ErrTargetNotOperario      = errors.New("el usuario indicado no tiene rol OPERARIO")
)

// User representa un usuario de la plataforma (tabla users).
type User struct {
	ID               uuid.UUID      `json:"id"`
	Nombre           string         `json:"nombre"`
	Email            string         `json:"email"`
	PasswordHash     string         `json:"-"`
	Rol              UserRole       `json:"rol"`
	Telefono         string         `json:"telefono"`
	EstadoAprobacion ApprovalStatus `json:"estado_aprobacion"`
	CreatedAt        time.Time      `json:"created_at"`
}

// AuthRepository define el contrato de persistencia para usuarios, perfil y aprobación de operarios.
type AuthRepository interface {
	CreateUser(ctx context.Context, u *User) error
	GetByEmail(ctx context.Context, email string) (*User, error)
	GetByID(ctx context.Context, id uuid.UUID) (*User, error)
	UpdateProfile(ctx context.Context, id uuid.UUID, nombre, telefono string) (*User, error)
	UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error
	ListOperarios(ctx context.Context, estado *ApprovalStatus) ([]User, error)
	UpdateOperarioApproval(ctx context.Context, operarioID uuid.UUID, estado ApprovalStatus) (*User, error)
}
