package usecase

import (
	"context"
	"fmt"
	"math"
	"strings"
	"unicode/utf8"

	"core-service/internal/service/domain"

	"github.com/google/uuid"
)

// ServiceUsecase define los casos de uso del catálogo de servicios (ABM Admin) y especialidades de operarios.
type ServiceUsecase interface {
	ListServices(ctx context.Context) ([]domain.Service, error)
	CreateService(ctx context.Context, nombre string, descripcion *string, tarifaBase float64) (*domain.Service, error)
	UpdateService(ctx context.Context, id int, nombre string, descripcion *string, tarifaBase float64) (*domain.Service, error)
	DeleteService(ctx context.Context, id int) error
	GetOperarioServices(ctx context.Context, operarioID uuid.UUID) ([]domain.Service, error)
	UpdateOperarioServices(ctx context.Context, operarioID uuid.UUID, serviceIDs []int) ([]domain.Service, error)
}

type serviceUsecase struct {
	repo domain.ServiceRepository
}

// NewServiceUsecase crea una nueva instancia de los casos de uso de servicios.
func NewServiceUsecase(repo domain.ServiceRepository) ServiceUsecase {
	return &serviceUsecase{repo: repo}
}

// ListServices devuelve el catálogo de servicios disponibles.
func (u *serviceUsecase) ListServices(ctx context.Context) ([]domain.Service, error) {
	services, err := u.repo.GetAll(ctx)
	if err != nil {
		return nil, fmt.Errorf("error al listar servicios: %w", err)
	}

	return services, nil
}

// CreateService valida los campos de entrada y crea un nuevo servicio en el catálogo.
func (u *serviceUsecase) CreateService(ctx context.Context, nombre string, descripcion *string, tarifaBase float64) (*domain.Service, error) {
	cleanNombre, cleanDesc, err := validateServicePayload(nombre, descripcion, tarifaBase)
	if err != nil {
		return nil, err
	}

	return u.repo.Create(ctx, cleanNombre, cleanDesc, tarifaBase)
}

// UpdateService valida el ID y los campos de entrada y actualiza un servicio existente.
func (u *serviceUsecase) UpdateService(ctx context.Context, id int, nombre string, descripcion *string, tarifaBase float64) (*domain.Service, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: el id de servicio debe ser mayor a 0", domain.ErrInvalidServiceData)
	}

	cleanNombre, cleanDesc, err := validateServicePayload(nombre, descripcion, tarifaBase)
	if err != nil {
		return nil, err
	}

	return u.repo.Update(ctx, id, cleanNombre, cleanDesc, tarifaBase)
}

// DeleteService elimina un servicio por su ID.
func (u *serviceUsecase) DeleteService(ctx context.Context, id int) error {
	if id <= 0 {
		return fmt.Errorf("%w: el id de servicio debe ser mayor a 0", domain.ErrInvalidServiceData)
	}

	return u.repo.Delete(ctx, id)
}

// GetOperarioServices devuelve las especialidades configuradas por el operario ([] si no tiene ninguna).
func (u *serviceUsecase) GetOperarioServices(ctx context.Context, operarioID uuid.UUID) ([]domain.Service, error) {
	services, err := u.repo.GetByOperarioID(ctx, operarioID)
	if err != nil {
		return nil, fmt.Errorf("error al obtener especialidades del operario: %w", err)
	}

	return services, nil
}

// UpdateOperarioServices normaliza (deduplica) y reemplaza las especialidades del operario.
func (u *serviceUsecase) UpdateOperarioServices(ctx context.Context, operarioID uuid.UUID, serviceIDs []int) ([]domain.Service, error) {
	seen := make(map[int]struct{}, len(serviceIDs))
	uniqueIDs := make([]int, 0, len(serviceIDs))

	for _, id := range serviceIDs {
		if id <= 0 {
			return nil, domain.ErrInvalidServiceIDs
		}
		if _, exists := seen[id]; !exists {
			seen[id] = struct{}{}
			uniqueIDs = append(uniqueIDs, id)
		}
	}

	services, err := u.repo.ReplaceOperarioServices(ctx, operarioID, uniqueIDs)
	if err != nil {
		return nil, err
	}

	return services, nil
}

func validateServicePayload(nombre string, descripcion *string, tarifaBase float64) (string, *string, error) {
	cleanNombre := strings.TrimSpace(nombre)
	if cleanNombre == "" {
		return "", nil, fmt.Errorf("%w: el nombre no puede estar vacío", domain.ErrInvalidServiceData)
	}
	if utf8.RuneCountInString(cleanNombre) > 100 {
		return "", nil, fmt.Errorf("%w: el nombre no puede superar los 100 caracteres", domain.ErrInvalidServiceData)
	}
	if math.IsNaN(tarifaBase) || math.IsInf(tarifaBase, 0) || tarifaBase <= 0 {
		return "", nil, fmt.Errorf("%w: la tarifa base debe ser mayor a 0", domain.ErrInvalidServiceData)
	}
	if tarifaBase >= 100000000 {
		return "", nil, fmt.Errorf("%w: la tarifa base supera el máximo permitido", domain.ErrInvalidServiceData)
	}

	var cleanDesc *string
	if descripcion != nil {
		trimmed := strings.TrimSpace(*descripcion)
		if trimmed != "" {
			cleanDesc = &trimmed
		}
	}

	return cleanNombre, cleanDesc, nil
}
