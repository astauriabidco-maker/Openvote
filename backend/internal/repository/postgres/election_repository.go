package postgres

import (
	"context"
	"database/sql"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/platform/database"
)

// ========================================
// Election Repository
// ========================================
type electionRepo struct{ db *sql.DB }

func NewElectionRepository(db *sql.DB) repository.ElectionRepository {
	return &electionRepo{db: db}
}

func (r *electionRepo) GetAll(ctx context.Context) ([]entity.Election, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `SELECT id, name, type, status, date, COALESCE(description,'') , COALESCE(region_ids,'all'), created_at, updated_at FROM elections ORDER BY date DESC`
	rows, err := r.db.QueryContext(queryCtx, query)
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
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `SELECT id, name, type, status, date, COALESCE(description,''), COALESCE(region_ids,'all'), created_at, updated_at FROM elections WHERE id = $1`
	e := &entity.Election{}
	err := r.db.QueryRowContext(queryCtx, query, id).Scan(&e.ID, &e.Name, &e.Type, &e.Status, &e.Date, &e.Description, &e.RegionIDs, &e.CreatedAt, &e.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return e, err
}

func (r *electionRepo) GetHistoricalResults(ctx context.Context) ([]entity.HistoricalElectionResult, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	query := `
		SELECT h.id, h.election_id, e.name, e.type, e.date,
		       COALESCE(h.source_document_id::text, ''), h.source_document_slug,
		       h.election_year, h.contest_type, h.result_level, h.region_name,
		       h.department_name, h.commune_name, h.actor_type, h.actor_name,
		       h.party, h.metric_type, h.registered_voters,
		       h.actual_voters, h.valid_votes, h.blank_or_invalid_votes,
		       h.abstentions, h.polling_stations, h.councils, h.lists_presented,
		       h.votes, h.percentage, h.seats, h.women_seats,
		       h.councils_controlled, h.source_line_start, h.source_line_end,
		       h.confidence, h.status, h.notes, h.created_at, h.updated_at
		FROM historical_election_results h
		JOIN elections e ON e.id = h.election_id
		ORDER BY h.election_year DESC, h.contest_type, h.metric_type, COALESCE(h.seats, h.votes, h.councils_controlled, 0) DESC, h.actor_name`

	rows, err := r.db.QueryContext(queryCtx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []entity.HistoricalElectionResult
	for rows.Next() {
		var item entity.HistoricalElectionResult
		var registeredVoters, actualVoters, validVotes, blankOrInvalidVotes sql.NullInt64
		var abstentions, pollingStations, councils, listsPresented sql.NullInt64
		var votes, seats, womenSeats, councilsControlled sql.NullInt64
		var sourceLineStart, sourceLineEnd sql.NullInt64
		var percentage sql.NullFloat64

		if err := rows.Scan(
			&item.ID, &item.ElectionID, &item.ElectionName, &item.ElectionType,
			&item.ElectionDate, &item.SourceDocumentID, &item.SourceDocumentSlug,
			&item.ElectionYear, &item.ContestType, &item.ResultLevel,
			&item.RegionName, &item.DepartmentName, &item.CommuneName,
			&item.ActorType, &item.ActorName, &item.Party, &item.MetricType,
			&registeredVoters, &actualVoters, &validVotes, &blankOrInvalidVotes,
			&abstentions, &pollingStations, &councils, &listsPresented, &votes,
			&percentage, &seats, &womenSeats, &councilsControlled, &sourceLineStart,
			&sourceLineEnd, &item.Confidence, &item.Status, &item.Notes, &item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}

		item.RegisteredVoters = nullableInt(registeredVoters)
		item.ActualVoters = nullableInt(actualVoters)
		item.ValidVotes = nullableInt(validVotes)
		item.BlankOrInvalidVotes = nullableInt(blankOrInvalidVotes)
		item.Abstentions = nullableInt(abstentions)
		item.PollingStations = nullableInt(pollingStations)
		item.Councils = nullableInt(councils)
		item.ListsPresented = nullableInt(listsPresented)
		item.Votes = nullableInt(votes)
		item.Percentage = nullableFloat(percentage)
		item.Seats = nullableInt(seats)
		item.WomenSeats = nullableInt(womenSeats)
		item.CouncilsControlled = nullableInt(councilsControlled)
		item.SourceLineStart = nullableInt(sourceLineStart)
		item.SourceLineEnd = nullableInt(sourceLineEnd)
		results = append(results, item)
	}
	return results, rows.Err()
}

func nullableInt(v sql.NullInt64) *int {
	if !v.Valid {
		return nil
	}
	n := int(v.Int64)
	return &n
}

func nullableFloat(v sql.NullFloat64) *float64 {
	if !v.Valid {
		return nil
	}
	n := v.Float64
	return &n
}

func (r *electionRepo) Create(ctx context.Context, e *entity.Election) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `INSERT INTO elections (name, type, status, date, description, region_ids) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at, updated_at`
	return r.db.QueryRowContext(queryCtx, query, e.Name, e.Type, e.Status, e.Date, e.Description, e.RegionIDs).Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
}

func (r *electionRepo) Update(ctx context.Context, e *entity.Election) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `UPDATE elections SET name=$1, type=$2, date=$3, description=$4, region_ids=$5, updated_at=NOW() WHERE id=$6`
	_, err := r.db.ExecContext(queryCtx, query, e.Name, e.Type, e.Date, e.Description, e.RegionIDs, e.ID)
	return err
}

func (r *electionRepo) UpdateStatus(ctx context.Context, id string, status entity.ElectionStatus) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `UPDATE elections SET status=$1, updated_at=NOW() WHERE id=$2`
	_, err := r.db.ExecContext(queryCtx, query, status, id)
	return err
}

func (r *electionRepo) Delete(ctx context.Context, id string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	_, err := r.db.ExecContext(queryCtx, `DELETE FROM elections WHERE id=$1`, id)
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
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `INSERT INTO audit_logs (admin_id, admin_name, action, target_id, details) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`
	return r.db.QueryRowContext(queryCtx, query, log.AdminID, log.AdminName, log.Action, log.TargetID, log.Details).Scan(&log.ID, &log.CreatedAt)
}

func (r *auditLogRepo) GetAll(ctx context.Context, limit int) ([]entity.AuditLog, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `SELECT id, admin_id, COALESCE(admin_name,''), action, COALESCE(target_id,''), COALESCE(details,''), created_at FROM audit_logs ORDER BY created_at DESC LIMIT $1`
	rows, err := r.db.QueryContext(queryCtx, query, limit)
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
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `SELECT id, name, code, COALESCE(description,''), severity, COALESCE(color,'#8b949e'), created_at FROM incident_types ORDER BY severity DESC, name`
	rows, err := r.db.QueryContext(queryCtx, query)
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
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `INSERT INTO incident_types (name, code, description, severity, color) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`
	return r.db.QueryRowContext(queryCtx, query, it.Name, it.Code, it.Description, it.Severity, it.Color).Scan(&it.ID, &it.CreatedAt)
}

func (r *incidentTypeRepo) Update(ctx context.Context, it *entity.IncidentType) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `UPDATE incident_types SET name=$1, code=$2, description=$3, severity=$4, color=$5 WHERE id=$6`
	_, err := r.db.ExecContext(queryCtx, query, it.Name, it.Code, it.Description, it.Severity, it.Color, it.ID)
	return err
}

func (r *incidentTypeRepo) Delete(ctx context.Context, id string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	_, err := r.db.ExecContext(queryCtx, `DELETE FROM incident_types WHERE id=$1`, id)
	return err
}
