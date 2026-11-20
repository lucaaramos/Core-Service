package domain

import (
	"context"
	"time"
)

// Service representa un servicio del catálogo (tabla services).
type Service struct {
	ID          int       `json:"id"`
	Nombre      string    `json:"nombre"`
	Descripcion *string   `json:"descripcion"`
	TarifaBase  float64   `json:"tarifa_base"`
	CreatedAt   time.Time `json:"created_at"`
}

// ServiceRepository define el contrato de persistencia para el catálogo de servicios.
type ServiceRepository interface {
	// GetAll devuelve todos los servicios del catálogo ordenados por id ascendente.
	GetAll(ctx context.Context) ([]Service, error)
}
