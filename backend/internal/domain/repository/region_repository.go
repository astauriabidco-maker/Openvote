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

	GetArrondissementsByDepartment(ctx context.Context, departmentID string) ([]entity.Arrondissement, error)
	CreateArrondissement(ctx context.Context, arr *entity.Arrondissement) error
	UpdateArrondissement(ctx context.Context, id, name, code, departmentID string, population, voters int, isChefLieu bool) error
	DeleteArrondissement(ctx context.Context, id string) error

	// Import CSV
	UpdateDepartmentDemographics(ctx context.Context, code string, population, voters int, source, confidence string, year int) error
	LogDataImport(ctx context.Context, importType, sourceName, fileName, importedBy, notes string, updated, failed int) error
	// GetDataImports retourne la page `page` (1-indexed) d'historique
	// d'imports, avec `limit` lignes par page (capped à 100), plus le
	// total global pour la pagination. Trié par created_at DESC.
	GetDataImports(ctx context.Context, page, limit int) ([]entity.DataImport, int, error)
}
