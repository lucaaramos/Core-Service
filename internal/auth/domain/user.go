package domain

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

// UserRole representa los roles permitidos por el sistema.
type UserRole string

const (
	RoleCliente  UserRole = "CLIENTE"
	RoleOperario UserRole = "OPERARIO"
	RoleAdmin    UserRole = "ADMIN"
)

var (
	ErrInvalidCredentials = errors.New("credenciales inválidas")
	ErrEmailAlreadyExists = errors.New("el email ya está registrado")
	ErrUserNotFound       = errors.New("usuario no encontrado")
	ErrInvalidRole        = errors.New("rol inválido")
	ErrInvalidInput       = errors.New("datos de registro inválidos")
)

// User representa un usuario de la plataforma (tabla users).
type User struct {
	ID           uuid.UUID
	Nombre       string
	Email        string
	PasswordHash string
	Rol          UserRole
	Telefono     string
}

// AuthRepository define el contrato de persistencia para usuarios.
type AuthRepository interface {
	CreateUser(ctx context.Context, u *User) error
	GetByEmail(ctx context.Context, email string) (*User, error)
}
