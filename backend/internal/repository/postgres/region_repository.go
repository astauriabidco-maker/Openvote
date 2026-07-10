package postgres

import (

	"context"
	"database/sql"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/platform/database"

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
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `SELECT id, name, code, created_at FROM regions ORDER BY name`
	rows, err := r.db.QueryContext(queryCtx, query)
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
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `SELECT id, name, code, created_at FROM regions WHERE id = $1`
	region := &entity.Region{}
	err := r.db.QueryRowContext(queryCtx, query, id).Scan(&region.ID, &region.Name, &region.Code, &region.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return region, err
}

func (r *regionRepo) CreateRegion(ctx context.Context, region *entity.Region) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `INSERT INTO regions (name, code) VALUES ($1, $2) RETURNING id, created_at`
	return r.db.QueryRowContext(queryCtx, query, region.Name, region.Code).Scan(&region.ID, &region.CreatedAt)
}

func (r *regionRepo) UpdateRegion(ctx context.Context, id, name, code string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `UPDATE regions SET name = $1, code = $2 WHERE id = $3`
	result, err := r.db.ExecContext(queryCtx, query, name, code, id)
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
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `DELETE FROM regions WHERE id = $1`
	_, err := r.db.ExecContext(queryCtx, query, id)
	return err
}

// ========================================
// Départements
// ========================================

func (r *regionRepo) GetAllDepartments(ctx context.Context) ([]entity.Department, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `SELECT id, name, code, region_id, population, registered_voters, COALESCE(data_source,''), COALESCE(data_confidence,'estimated'), COALESCE(data_year,2025), created_at FROM departments ORDER BY name`
	rows, err := r.db.QueryContext(queryCtx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var depts []entity.Department
	for rows.Next() {
		var dept entity.Department
		if err := rows.Scan(&dept.ID, &dept.Name, &dept.Code, &dept.RegionID, &dept.Population, &dept.RegisteredVoters, &dept.DataSource, &dept.DataConfidence, &dept.DataYear, &dept.CreatedAt); err != nil {
			return nil, err
		}
		depts = append(depts, dept)
	}
	return depts, nil
}

func (r *regionRepo) GetDepartmentsByRegion(ctx context.Context, regionID string) ([]entity.Department, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `SELECT id, name, code, region_id, population, registered_voters, COALESCE(data_source,''), COALESCE(data_confidence,'estimated'), COALESCE(data_year,2025), created_at FROM departments WHERE region_id = $1 ORDER BY name`
	rows, err := r.db.QueryContext(queryCtx, query, regionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var depts []entity.Department
	for rows.Next() {
		var dept entity.Department
		if err := rows.Scan(&dept.ID, &dept.Name, &dept.Code, &dept.RegionID, &dept.Population, &dept.RegisteredVoters, &dept.DataSource, &dept.DataConfidence, &dept.DataYear, &dept.CreatedAt); err != nil {
			return nil, err
		}
		depts = append(depts, dept)
	}
	return depts, nil
}

func (r *regionRepo) CreateDepartment(ctx context.Context, dept *entity.Department) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `INSERT INTO departments (name, code, region_id, population, registered_voters) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`
	return r.db.QueryRowContext(queryCtx, query, dept.Name, dept.Code, dept.RegionID, dept.Population, dept.RegisteredVoters).Scan(&dept.ID, &dept.CreatedAt)
}

func (r *regionRepo) UpdateDepartment(ctx context.Context, id, name, code, regionID string, population, voters int) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `UPDATE departments SET name = $1, code = $2, region_id = $3, population = $4, registered_voters = $5 WHERE id = $6`
	result, err := r.db.ExecContext(queryCtx, query, name, code, regionID, population, voters, id)
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
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `DELETE FROM departments WHERE id = $1`
	_, err := r.db.ExecContext(queryCtx, query, id)
	return err
}

// ========================================
// Arrondissements
// ========================================

func (r *regionRepo) GetArrondissementsByDepartment(ctx context.Context, departmentID string) ([]entity.Arrondissement, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `SELECT id, name, code, department_id, population, registered_voters, is_chef_lieu, COALESCE(data_source,''), COALESCE(data_confidence,'estimated'), COALESCE(data_year,2025), created_at FROM arrondissements WHERE department_id = $1 ORDER BY is_chef_lieu DESC, name`
	rows, err := r.db.QueryContext(queryCtx, query, departmentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var arrs []entity.Arrondissement
	for rows.Next() {
		var arr entity.Arrondissement
		if err := rows.Scan(&arr.ID, &arr.Name, &arr.Code, &arr.DepartmentID, &arr.Population, &arr.RegisteredVoters, &arr.IsChefLieu, &arr.DataSource, &arr.DataConfidence, &arr.DataYear, &arr.CreatedAt); err != nil {
			return nil, err
		}
		arrs = append(arrs, arr)
	}
	return arrs, nil
}

func (r *regionRepo) CreateArrondissement(ctx context.Context, arr *entity.Arrondissement) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `INSERT INTO arrondissements (name, code, department_id, population, registered_voters, is_chef_lieu) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`
	return r.db.QueryRowContext(queryCtx, query, arr.Name, arr.Code, arr.DepartmentID, arr.Population, arr.RegisteredVoters, arr.IsChefLieu).Scan(&arr.ID, &arr.CreatedAt)
}

func (r *regionRepo) UpdateArrondissement(ctx context.Context, id, name, code, departmentID string, population, voters int, isChefLieu bool) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `UPDATE arrondissements SET name = $1, code = $2, department_id = $3, population = $4, registered_voters = $5, is_chef_lieu = $6 WHERE id = $7`
	result, err := r.db.ExecContext(queryCtx, query, name, code, departmentID, population, voters, isChefLieu, id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *regionRepo) DeleteArrondissement(ctx context.Context, id string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `DELETE FROM arrondissements WHERE id = $1`
	_, err := r.db.ExecContext(queryCtx, query, id)
	return err
}

// ========================================
// Import CSV
// ========================================

func (r *regionRepo) UpdateDepartmentDemographics(ctx context.Context, code string, population, voters int, source, confidence string, year int) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `UPDATE departments SET population = $1, registered_voters = $2, data_source = $3, data_confidence = $4, data_year = $5, last_updated = NOW() WHERE code = $6`
	result, err := r.db.ExecContext(queryCtx, query, population, voters, source, confidence, year, code)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *regionRepo) LogDataImport(ctx context.Context, importType, sourceName, fileName, importedBy, notes string, updated, failed int) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `INSERT INTO data_imports (import_type, source_name, file_name, records_updated, records_failed, imported_by, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := r.db.ExecContext(queryCtx, query, importType, sourceName, fileName, updated, failed, importedBy, notes)
	return err
}

func (r *regionRepo) GetDataImports(ctx context.Context, page, limit int) ([]entity.DataImport, int, error) {
	// Clamp défensif des paramètres (cf. memory entry "Next.js pagination
	// → 500 silencieux"). On évite ainsi les skip négatifs ou les limites
	// extrêmes qui ne sont pas des erreurs SQL mais des résultats absurdes.
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	// 1) Count total (1 seule requête, COUNT(*) sur PK est O(n) sur PG mais
	//    acceptable pour < 10k imports).
	var total int
	if err := r.db.QueryRowContext(queryCtx, `SELECT COUNT(*) FROM data_imports`).Scan(&total); err != nil {
		return nil, 0, err
	}

	// 2) Page demandée.
	query := `SELECT id, import_type, source_name, COALESCE(file_name,''), records_updated, records_failed, COALESCE(imported_by,''), COALESCE(notes,''), created_at FROM data_imports ORDER BY created_at DESC LIMIT $1 OFFSET $2`
	rows, err := r.db.QueryContext(queryCtx, query, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	imports := make([]entity.DataImport, 0, limit)
	for rows.Next() {
		var di entity.DataImport
		if err := rows.Scan(&di.ID, &di.ImportType, &di.SourceName, &di.FileName, &di.RecordsUpdated, &di.RecordsFailed, &di.ImportedBy, &di.Notes, &di.CreatedAt); err != nil {
			return nil, 0, err
		}
		imports = append(imports, di)
	}
	return imports, total, nil
}
