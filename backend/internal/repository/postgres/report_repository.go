package postgres

import (
	"context"
	"database/sql"
	"time"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

type reportRepo struct {
	db *sql.DB
}

func NewReportRepository(db *sql.DB) repository.ReportRepository {
	return &reportRepo{db: db}
}

func (r *reportRepo) Create(ctx context.Context, report *entity.Report) error {
	// Note: on attend que report.GPSLocation soit formaté WKT "POINT(lon lat)"
	query := `INSERT INTO reports (id, observer_id, incident_type, description, gps_location, h3_index, status, proof_url, created_at) 
	          VALUES ($1, $2, $3, $4, ST_GeomFromText($5, 4326), $6, $7, $8, $9)`
	_, err := r.db.ExecContext(ctx, query,
		report.ID,
		report.ObserverID,
		report.IncidentType,
		report.Description,
		report.GPSLocation,
		report.H3Index,
		report.Status,
		report.ProofURL,
		report.CreatedAt,
	)
	return err
}

func (r *reportRepo) GetAll(ctx context.Context, status string) ([]entity.Report, error) {
	// On récupère la géométrie au format Text (WKT) pour le mapper dans le struct
	query := `SELECT id, observer_id, incident_type, COALESCE(description, '') as description, ST_AsText(gps_location) as gps_location, h3_index, status, COALESCE(proof_url, '') as proof_url, created_at FROM reports`

	var args []interface{}
	if status != "" {
		query += " WHERE status = $1"
		args = append(args, status)
	}

	query += " ORDER BY created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reports := []entity.Report{}
	for rows.Next() {
		var report entity.Report
		// PostGIS retourne parfois null si pas de géométrie, mais ici c'est requis
		err := rows.Scan(
			&report.ID,
			&report.ObserverID,
			&report.IncidentType,
			&report.Description,
			&report.GPSLocation,
			&report.H3Index,
			&report.Status,
			&report.ProofURL,
			&report.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		reports = append(reports, report)
	}
	return reports, nil
}

func (r *reportRepo) GetByID(ctx context.Context, id string) (*entity.Report, error) {
	query := `SELECT id, observer_id, incident_type, COALESCE(description, '') as description, ST_AsText(gps_location) as gps_location, h3_index, status, COALESCE(proof_url, '') as proof_url, created_at FROM reports WHERE id = $1`
	report := &entity.Report{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&report.ID,
		&report.ObserverID,
		&report.IncidentType,
		&report.Description,
		&report.GPSLocation,
		&report.H3Index,
		&report.Status,
		&report.ProofURL,
		&report.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return report, err
}

func (r *reportRepo) FindNearbyWithRole(ctx context.Context, h3Index string, lat, lon, radius float64, start, end time.Time) ([]entity.Report, error) {
	// Sélection avec jointure pour avoir le rôle
	query := `
		SELECT r.id, r.observer_id, r.incident_type, COALESCE(r.description, '') as description, ST_AsText(r.gps_location) as gps_location, r.h3_index, r.status, COALESCE(r.proof_url, '') as proof_url, r.created_at, u.role
		FROM reports r
		JOIN users u ON r.observer_id = u.id
		WHERE (r.h3_index = $1 OR ST_DWithin(r.gps_location::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4))
		AND r.created_at BETWEEN $5 AND $6
	`
	rows, err := r.db.QueryContext(ctx, query, h3Index, lon, lat, radius, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []entity.Report
	for rows.Next() {
		var report entity.Report
		var roleStr string
		err := rows.Scan(
			&report.ID,
			&report.ObserverID,
			&report.IncidentType,
			&report.Description,
			&report.GPSLocation,
			&report.H3Index,
			&report.Status,
			&report.ProofURL,
			&report.CreatedAt,
			&roleStr,
		)
		if err != nil {
			return nil, err
		}
		report.AuthorRole = entity.UserRole(roleStr)
		reports = append(reports, report)
	}
	return reports, nil
}

func (r *reportRepo) UpdateStatus(ctx context.Context, id string, status entity.ReportStatus) error {
	query := `UPDATE reports SET status = $1 WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, status, id)
	return err
}
