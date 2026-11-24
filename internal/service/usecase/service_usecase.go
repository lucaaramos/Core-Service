package usecase

import (
	"context"
	"fmt"

	"core-service/internal/service/domain"

	"github.com/google/uuid"
)

// ServiceUsecase define los casos de uso del catálogo de servicios y especialidades de operarios.
type ServiceUsecase interface {
	ListServices(ctx context.Context) ([]domain.Service, error)
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
