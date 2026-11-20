package usecase

import (
	"context"
	"fmt"

	"core-service/internal/service/domain"
)

// ServiceUsecase define los casos de uso del catálogo de servicios.
type ServiceUsecase interface {
	ListServices(ctx context.Context) ([]domain.Service, error)
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
