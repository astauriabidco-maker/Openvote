package postgres

import (
	"context"
	"database/sql"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

type regionRepo struct {
	db *sql.DB
}

func NewRegionRepository(db *sql.DB) repository.RegionRepository {
	return &regionRepo{db: db}
}

// ========================================
// Régions
// ========================================

func (r *regionRepo) GetAllRegions(ctx context.Context) ([]entity.Region, error) {
	query := `SELECT id, name, code, created_at FROM regions ORDER BY name`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var regions []entity.Region
	for rows.Next() {
		var region entity.Region
		if err := rows.Scan(&region.ID, &region.Name, &region.Code, &region.CreatedAt); err != nil {
			return nil, err
		}
		regions = append(regions, region)
	}
	return regions, nil
}

func (r *regionRepo) GetRegionByID(ctx context.Context, id string) (*entity.Region, error) {
	query := `SELECT id, name, code, created_at FROM regions WHERE id = $1`
	region := &entity.Region{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(&region.ID, &region.Name, &region.Code, &region.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return region, err
}

func (r *regionRepo) CreateRegion(ctx context.Context, region *entity.Region) error {
	query := `INSERT INTO regions (name, code) VALUES ($1, $2) RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query, region.Name, region.Code).Scan(&region.ID, &region.CreatedAt)
}

func (r *regionRepo) UpdateRegion(ctx context.Context, id, name, code string) error {
	query := `UPDATE regions SET name = $1, code = $2 WHERE id = $3`
	result, err := r.db.ExecContext(ctx, query, name, code, id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *regionRepo) DeleteRegion(ctx context.Context, id string) error {
	query := `DELETE FROM regions WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// ========================================
// Départements
// ========================================

func (r *regionRepo) GetAllDepartments(ctx context.Context) ([]entity.Department, error) {
	query := `SELECT id, name, code, region_id, population, registered_voters, created_at FROM departments ORDER BY name`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var depts []entity.Department
	for rows.Next() {
		var dept entity.Department
		if err := rows.Scan(&dept.ID, &dept.Name, &dept.Code, &dept.RegionID, &dept.Population, &dept.RegisteredVoters, &dept.CreatedAt); err != nil {
			return nil, err
		}
		depts = append(depts, dept)
	}
	return depts, nil
}

func (r *regionRepo) GetDepartmentsByRegion(ctx context.Context, regionID string) ([]entity.Department, error) {
	query := `SELECT id, name, code, region_id, population, registered_voters, created_at FROM departments WHERE region_id = $1 ORDER BY name`
	rows, err := r.db.QueryContext(ctx, query, regionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var depts []entity.Department
	for rows.Next() {
		var dept entity.Department
		if err := rows.Scan(&dept.ID, &dept.Name, &dept.Code, &dept.RegionID, &dept.Population, &dept.RegisteredVoters, &dept.CreatedAt); err != nil {
			return nil, err
		}
		depts = append(depts, dept)
	}
	return depts, nil
}

func (r *regionRepo) CreateDepartment(ctx context.Context, dept *entity.Department) error {
	query := `INSERT INTO departments (name, code, region_id, population, registered_voters) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query, dept.Name, dept.Code, dept.RegionID, dept.Population, dept.RegisteredVoters).Scan(&dept.ID, &dept.CreatedAt)
}

func (r *regionRepo) UpdateDepartment(ctx context.Context, id, name, code, regionID string, population, voters int) error {
	query := `UPDATE departments SET name = $1, code = $2, region_id = $3, population = $4, registered_voters = $5 WHERE id = $6`
	result, err := r.db.ExecContext(ctx, query, name, code, regionID, population, voters, id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *regionRepo) DeleteDepartment(ctx context.Context, id string) error {
	query := `DELETE FROM departments WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}
