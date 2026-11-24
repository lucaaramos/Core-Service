package domain

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInvalidServiceIDs        = errors.New("uno o más servicios indicados no existen en el catálogo")
	ErrInvalidServiceData       = errors.New("datos de servicio inválidos")
	ErrServiceNotFound          = errors.New("servicio no encontrado")
	ErrServiceNameAlreadyExists = errors.New("ya existe un servicio con ese nombre")
	ErrServiceHasLinkedTickets  = errors.New("no se puede eliminar el servicio porque tiene tickets vinculados")
)

// Service representa un servicio del catálogo (tabla services).
type Service struct {
	ID          int       `json:"id"`
	Nombre      string    `json:"nombre"`
	Descripcion *string   `json:"descripcion"`
	TarifaBase  float64   `json:"tarifa_base"`
	CreatedAt   time.Time `json:"created_at"`
}

// ServiceRepository define el contrato de persistencia para el catálogo de servicios
// y las especialidades asociadas a cada operario.
type ServiceRepository interface {
	// GetAll devuelve todos los servicios del catálogo ordenados por id ascendente.
	GetAll(ctx context.Context) ([]Service, error)

	// Create inserta un nuevo servicio en el catálogo y devuelve la entidad creada.
	Create(ctx context.Context, nombre string, descripcion *string, tarifaBase float64) (*Service, error)

	// Update actualiza nombre, descripción y tarifa base de un servicio existente.
	Update(ctx context.Context, id int, nombre string, descripcion *string, tarifaBase float64) (*Service, error)

	// Delete elimina un servicio por su ID (falla si tiene tickets asociados).
	Delete(ctx context.Context, id int) error

	// GetByOperarioID devuelve los servicios asociados al operario ordenados por id ascendente.
	GetByOperarioID(ctx context.Context, operarioID uuid.UUID) ([]Service, error)

	// ReplaceOperarioServices reemplaza de forma atómica e idempotente las especialidades
	// del operario validando previamente que todos los IDs existan en services.
	ReplaceOperarioServices(ctx context.Context, operarioID uuid.UUID, serviceIDs []int) ([]Service, error)
}
