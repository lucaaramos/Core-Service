package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// JWTProtected valida el header "Authorization: Bearer <token>", verifica la
// firma y expiración, y expone user_id (uuid.UUID) y rol (string) en Locals.
func JWTProtected(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "token de autorización ausente o mal formado",
			})
		}

		tokenStr := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))

		token, err := jwt.Parse(
			tokenStr,
			func(token *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			},
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		)
		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "token inválido o expirado",
			})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "claims del token inválidos",
			})
		}

		userIDStr, ok := claims["user_id"].(string)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "claim user_id inválido",
			})
		}

		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "claim user_id con formato inválido",
			})
		}

		rol, ok := claims["rol"].(string)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "claim rol inválido",
			})
		}

		c.Locals("user_id", userID)
		c.Locals("rol", rol)

		return c.Next()
	}
}

// RequireRole permite el paso únicamente si el rol del token está en la lista.
func RequireRole(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRol, ok := c.Locals("rol").(string)
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "acceso denegado",
			})
		}

		for _, r := range roles {
			if userRol == r {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "permisos insuficientes",
		})
	}
}
