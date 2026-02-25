package postgres

import (
	"context"
	"database/sql"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

// ========================================
// Election Repository
// ========================================
type electionRepo struct{ db *sql.DB }

func NewElectionRepository(db *sql.DB) repository.ElectionRepository {
	return &electionRepo{db: db}
}

func (r *electionRepo) GetAll(ctx context.Context) ([]entity.Election, error) {
	query := `SELECT id, name, type, status, date, COALESCE(description,'') , COALESCE(region_ids,'all'), created_at, updated_at FROM elections ORDER BY date DESC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []entity.Election
	for rows.Next() {
		var e entity.Election
		if err := rows.Scan(&e.ID, &e.Name, &e.Type, &e.Status, &e.Date, &e.Description, &e.RegionIDs, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		results = append(results, e)
	}
	return results, nil
}

func (r *electionRepo) GetByID(ctx context.Context, id string) (*entity.Election, error) {
	query := `SELECT id, name, type, status, date, COALESCE(description,''), COALESCE(region_ids,'all'), created_at, updated_at FROM elections WHERE id = $1`
	e := &entity.Election{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(&e.ID, &e.Name, &e.Type, &e.Status, &e.Date, &e.Description, &e.RegionIDs, &e.CreatedAt, &e.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return e, err
}

func (r *electionRepo) Create(ctx context.Context, e *entity.Election) error {
	query := `INSERT INTO elections (name, type, status, date, description, region_ids) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at, updated_at`
	return r.db.QueryRowContext(ctx, query, e.Name, e.Type, e.Status, e.Date, e.Description, e.RegionIDs).Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
}

func (r *electionRepo) Update(ctx context.Context, e *entity.Election) error {
	query := `UPDATE elections SET name=$1, type=$2, date=$3, description=$4, region_ids=$5, updated_at=NOW() WHERE id=$6`
	_, err := r.db.ExecContext(ctx, query, e.Name, e.Type, e.Date, e.Description, e.RegionIDs, e.ID)
	return err
}

func (r *electionRepo) UpdateStatus(ctx context.Context, id string, status entity.ElectionStatus) error {
	query := `UPDATE elections SET status=$1, updated_at=NOW() WHERE id=$2`
	_, err := r.db.ExecContext(ctx, query, status, id)
	return err
}

func (r *electionRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM elections WHERE id=$1`, id)
	return err
}

// ========================================
// Audit Log Repository
// ========================================
type auditLogRepo struct{ db *sql.DB }

func NewAuditLogRepository(db *sql.DB) repository.AuditLogRepository {
	return &auditLogRepo{db: db}
}

func (r *auditLogRepo) Create(ctx context.Context, log *entity.AuditLog) error {
	query := `INSERT INTO audit_logs (admin_id, admin_name, action, target_id, details) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query, log.AdminID, log.AdminName, log.Action, log.TargetID, log.Details).Scan(&log.ID, &log.CreatedAt)
}

func (r *auditLogRepo) GetAll(ctx context.Context, limit int) ([]entity.AuditLog, error) {
	query := `SELECT id, admin_id, COALESCE(admin_name,''), action, COALESCE(target_id,''), COALESCE(details,''), created_at FROM audit_logs ORDER BY created_at DESC LIMIT $1`
	rows, err := r.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []entity.AuditLog
	for rows.Next() {
		var l entity.AuditLog
		if err := rows.Scan(&l.ID, &l.AdminID, &l.AdminName, &l.Action, &l.TargetID, &l.Details, &l.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, l)
	}
	return results, nil
}

// ========================================
// Incident Type Repository
// ========================================
type incidentTypeRepo struct{ db *sql.DB }

func NewIncidentTypeRepository(db *sql.DB) repository.IncidentTypeRepository {
	return &incidentTypeRepo{db: db}
}

func (r *incidentTypeRepo) GetAll(ctx context.Context) ([]entity.IncidentType, error) {
	query := `SELECT id, name, code, COALESCE(description,''), severity, COALESCE(color,'#8b949e'), created_at FROM incident_types ORDER BY severity DESC, name`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []entity.IncidentType
	for rows.Next() {
		var it entity.IncidentType
		if err := rows.Scan(&it.ID, &it.Name, &it.Code, &it.Description, &it.Severity, &it.Color, &it.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, it)
	}
	return results, nil
}

func (r *incidentTypeRepo) Create(ctx context.Context, it *entity.IncidentType) error {
	query := `INSERT INTO incident_types (name, code, description, severity, color) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query, it.Name, it.Code, it.Description, it.Severity, it.Color).Scan(&it.ID, &it.CreatedAt)
}

func (r *incidentTypeRepo) Update(ctx context.Context, it *entity.IncidentType) error {
	query := `UPDATE incident_types SET name=$1, code=$2, description=$3, severity=$4, color=$5 WHERE id=$6`
	_, err := r.db.ExecContext(ctx, query, it.Name, it.Code, it.Description, it.Severity, it.Color, it.ID)
	return err
}

func (r *incidentTypeRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM incident_types WHERE id=$1`, id)
	return err
}
