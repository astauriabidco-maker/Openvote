package repository

import (
	"context"
	"github.com/openvote/backend/internal/domain/entity"
)

// RegionRepository gère l'accès aux données géographiques
type RegionRepository interface {
	GetAllRegions(ctx context.Context) ([]entity.Region, error)
	GetRegionByID(ctx context.Context, id string) (*entity.Region, error)
	CreateRegion(ctx context.Context, region *entity.Region) error
	UpdateRegion(ctx context.Context, id, name, code string) error
	DeleteRegion(ctx context.Context, id string) error

	GetAllDepartments(ctx context.Context) ([]entity.Department, error)
	GetDepartmentsByRegion(ctx context.Context, regionID string) ([]entity.Department, error)
	CreateDepartment(ctx context.Context, dept *entity.Department) error
	UpdateDepartment(ctx context.Context, id, name, code, regionID string, population, voters int) error
	DeleteDepartment(ctx context.Context, id string) error
}
