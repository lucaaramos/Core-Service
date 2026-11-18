package http

import (
	"errors"
	"os"

	"core-service/internal/auth/domain"
	"core-service/internal/auth/usecase"

	"github.com/gofiber/fiber/v2"
)

// AuthHandler expone los endpoints públicos de registro y login.
type AuthHandler struct {
	uc usecase.AuthUsecase
}

// NewAuthHandler registra las rutas públicas /auth/register y /auth/login.
func NewAuthHandler(router fiber.Router, uc usecase.AuthUsecase) {
	h := &AuthHandler{uc: uc}
	auth := router.Group("/auth")
	auth.Post("/register", h.Register)
	auth.Post("/login", h.Login)
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

	token, err := h.uc.Login(c.UserContext(), req.Email, req.Password, os.Getenv("JWT_SECRET"))
	if err != nil {
		return handleAuthError(c, err)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"token": token})
}

func handleAuthError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, domain.ErrInvalidCredentials):
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrEmailAlreadyExists):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, domain.ErrInvalidRole), errors.Is(err, domain.ErrInvalidInput):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "error interno del servidor"})
	}
}
