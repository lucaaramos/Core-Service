package usecase

import (
	"context"
	"fmt"
	"time"

	"core-service/internal/auth/domain"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

const tokenTTL = 24 * time.Hour

// AuthUsecase define los casos de uso de registro y autenticación.
type AuthUsecase interface {
	Register(ctx context.Context, nombre, email, password, telefono string, rol domain.UserRole) (*domain.User, error)
	Login(ctx context.Context, email, password, secret string) (string, error)
}

type authUsecase struct {
	repo domain.AuthRepository
}

// NewAuthUsecase crea una nueva instancia de los casos de uso de autenticación.
func NewAuthUsecase(repo domain.AuthRepository) AuthUsecase {
	return &authUsecase{repo: repo}
}

// Register valida el rol, hashea la contraseña con bcrypt y persiste el usuario.
func (u *authUsecase) Register(ctx context.Context, nombre, email, password, telefono string, rol domain.UserRole) (*domain.User, error) {
	if rol != domain.RoleCliente && rol != domain.RoleOperario {
		return nil, fmt.Errorf("%w: solo se permite CLIENTE u OPERARIO", domain.ErrInvalidRole)
	}
	if email == "" || password == "" || nombre == "" {
		return nil, domain.ErrInvalidInput
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("error hasheando contraseña: %w", err)
	}

	user := &domain.User{
		ID:           uuid.New(),
		Nombre:       nombre,
		Email:        email,
		PasswordHash: string(hashed),
		Rol:          rol,
		Telefono:     telefono,
	}

	if err := u.repo.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

// Login valida las credenciales y genera un JWT firmado con expiración de 24 horas.
func (u *authUsecase) Login(ctx context.Context, email, password, secret string) (string, error) {
	user, err := u.repo.GetByEmail(ctx, email)
	if err != nil {
		// No revelar si el email existe o no.
		return "", domain.ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", domain.ErrInvalidCredentials
	}

	claims := jwt.MapClaims{
		"user_id": user.ID.String(),
		"rol":     string(user.Rol),
		"iat":     time.Now().Unix(),
		"exp":     time.Now().Add(tokenTTL).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("error firmando token JWT: %w", err)
	}

	return signed, nil
}
