package http

import (
	"errors"
	"time"

	"core-service/internal/auth/domain"
	"core-service/internal/auth/usecase"
	"core-service/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// AuthHandler expone los endpoints públicos de autenticación y las rutas protegidas de perfil (/users/me).
type AuthHandler struct {
	uc        usecase.AuthUsecase
	jwtSecret string
}

// NewAuthHandler registra las rutas públicas (/auth/*) y las rutas protegidas de perfil (/users/me*).
func NewAuthHandler(router fiber.Router, uc usecase.AuthUsecase, jwtSecret string) {
	h := &AuthHandler{
		uc:        uc,
		jwtSecret: jwtSecret,
	}

	auth := router.Group("/auth")
	auth.Post("/register", h.Register)
	auth.Post("/login", h.Login)

	users := router.Group("/users",
		middleware.JWTProtected(jwtSecret),
		middleware.RequireRole(
			string(domain.RoleCliente),
			string(domain.RoleOperario),
			string(domain.RoleAdmin),
		),
	)
	users.Get("/me", h.GetMe)
	users.Patch("/me", h.UpdateMe)
	users.Patch("/me/password", h.ChangePassword)
}

type registerRequest struct {
	Nombre   string `json:"nombre"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Telefono string `json:"telefono"`
	Rol      string `json:"rol"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type updateProfileRequest struct {
	Nombre   string `json:"nombre"`
	Telefono string `json:"telefono"`
}

type changePasswordRequest struct {
	PasswordActual string `json:"password_actual"`
	PasswordNueva  string `json:"password_nueva"`
}

type userProfileResponse struct {
	ID        uuid.UUID       `json:"id"`
	Nombre    string          `json:"nombre"`
	Email     string          `json:"email"`
	Telefono  string          `json:"telefono"`
	Rol       domain.UserRole `json:"rol"`
	CreatedAt time.Time       `json:"created_at"`
}

func toUserProfileResponse(u *domain.User) userProfileResponse {
	return userProfileResponse{
		ID:        u.ID,
		Nombre:    u.Nombre,
		Email:     u.Email,
		Telefono:  u.Telefono,
		Rol:       u.Rol,
		CreatedAt: u.CreatedAt,
	}
}

// Register crea un usuario CLIENTE u OPERARIO.
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req registerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
	}

	user, err := h.uc.Register(c.UserContext(), req.Nombre, req.Email, req.Password, req.Telefono, domain.UserRole(req.Rol))
	if err != nil {
		return handleAuthError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":     user.ID,
		"nombre": user.Nombre,
		"email":  user.Email,
		"rol":    user.Rol,
	})
}

// Login valida credenciales y devuelve un JWT.
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req loginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
	}

	token, err := h.uc.Login(c.UserContext(), req.Email, req.Password, h.jwtSecret)
	if err != nil {
		return handleAuthError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"token": token})
}

// GetMe devuelve los datos del perfil del usuario autenticado (nunca password_hash).
func (h *AuthHandler) GetMe(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "usuario no autenticado"})
	}

	user, err := h.uc.GetProfile(c.UserContext(), userID)
	if err != nil {
		return handleAuthError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(toUserProfileResponse(user))
}

// UpdateMe actualiza nombre y teléfono del usuario autenticado.
func (h *AuthHandler) UpdateMe(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "usuario no autenticado"})
	}

	var req updateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
	}

	user, err := h.uc.UpdateProfile(c.UserContext(), userID, req.Nombre, req.Telefono)
	if err != nil {
		return handleAuthError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(toUserProfileResponse(user))
}

// ChangePassword verifica la contraseña actual y actualiza el hash con la nueva contraseña.
func (h *AuthHandler) ChangePassword(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "usuario no autenticado"})
	}

	var req changePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud inválido"})
	}

	if err := h.uc.ChangePassword(c.UserContext(), userID, req.PasswordActual, req.PasswordNueva); err != nil {
		return handleAuthError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "contraseña actualizada correctamente"})
}

func handleAuthError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, domain.ErrInvalidCredentials),
		errors.Is(err, domain.ErrInvalidCurrentPassword):
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrUserNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrEmailAlreadyExists):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrInvalidRole),
		errors.Is(err, domain.ErrInvalidInput),
		errors.Is(err, domain.ErrEmptyName),
		errors.Is(err, domain.ErrWeakPassword):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "error interno del servidor"})
	}
}
