package postgres

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strings"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/platform/database"
)

type pollingStationRepo struct{ db *sql.DB }

func NewPollingStationRepository(db *sql.DB) repository.PollingStationRepository {
	return &pollingStationRepo{db: db}
}

type observerDeviceKeyRepo struct{ db *sql.DB }

func NewObserverDeviceKeyRepository(db *sql.DB) repository.ObserverDeviceKeyRepository {
	return &observerDeviceKeyRepo{db: db}
}

func (r *observerDeviceKeyRepo) Upsert(ctx context.Context, key *entity.ObserverDeviceKey) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	if key.Algorithm == "" {
		key.Algorithm = "ECDSA_P256_SHA256"
	}
	return r.db.QueryRowContext(queryCtx, `
		INSERT INTO observer_device_keys (user_id, device_id, algorithm, public_key_jwk, active)
		VALUES ($1, $2, $3, $4::jsonb, TRUE)
		ON CONFLICT (user_id, device_id)
		DO UPDATE SET algorithm = EXCLUDED.algorithm,
		              public_key_jwk = EXCLUDED.public_key_jwk,
		              active = TRUE,
		              updated_at = NOW()
		RETURNING id, created_at, updated_at`,
		key.UserID, key.DeviceID, key.Algorithm, key.PublicKeyJWK,
	).Scan(&key.ID, &key.CreatedAt, &key.UpdatedAt)
}

func (r *observerDeviceKeyRepo) GetActiveByUserAndDevice(ctx context.Context, userID, deviceID string) (*entity.ObserverDeviceKey, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	key := &entity.ObserverDeviceKey{}
	err := r.db.QueryRowContext(queryCtx, `
		SELECT id, user_id, device_id, algorithm, public_key_jwk::text, active, created_at, updated_at
		FROM observer_device_keys
		WHERE user_id = $1 AND device_id = $2 AND active = TRUE`,
		userID, deviceID,
	).Scan(&key.ID, &key.UserID, &key.DeviceID, &key.Algorithm, &key.PublicKeyJWK, &key.Active, &key.CreatedAt, &key.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return key, nil
}

func (r *observerDeviceKeyRepo) MarkUsed(ctx context.Context, id string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	_, err := r.db.ExecContext(queryCtx, `UPDATE observer_device_keys SET last_used_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *pollingStationRepo) GetByElection(ctx context.Context, electionID string) ([]entity.PollingStation, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `
		SELECT id, election_id, code, name,
		       COALESCE(region_id::text, ''), COALESCE(department_id::text, ''),
		       COALESCE(arrondissement_id::text, ''), registered_voters,
		       COALESCE(location_name, ''), COALESCE(ST_AsText(gps_location), ''),
		       COALESCE(h3_index, ''), COALESCE(source_name, ''),
		       COALESCE(source_document_id::text, ''), COALESCE(source_document_slug, ''),
		       COALESCE(source_sha256, ''), source_position, COALESCE(source_confidence, ''),
		       created_at, updated_at
		FROM polling_stations
		WHERE election_id = $1
		ORDER BY code, name`
	rows, err := r.db.QueryContext(queryCtx, query, electionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stations []entity.PollingStation
	for rows.Next() {
		var s entity.PollingStation
		if err := rows.Scan(
			&s.ID, &s.ElectionID, &s.Code, &s.Name, &s.RegionID, &s.DepartmentID,
			&s.ArrondissementID, &s.RegisteredVoters, &s.LocationName, &s.GPSLocation,
			&s.H3Index, &s.SourceName, &s.SourceDocumentID, &s.SourceDocumentSlug,
			&s.SourceSHA256, &s.SourcePosition, &s.SourceConfidence, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		stations = append(stations, s)
	}
	return stations, rows.Err()
}

func (r *pollingStationRepo) GetAssignedToObserver(ctx context.Context, electionID, observerID string) ([]entity.PollingStation, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `
		SELECT ps.id, ps.election_id, ps.code, ps.name,
		       COALESCE(ps.region_id::text, ''), COALESCE(ps.department_id::text, ''),
		       COALESCE(ps.arrondissement_id::text, ''), ps.registered_voters,
		       COALESCE(ps.location_name, ''), COALESCE(ST_AsText(ps.gps_location), ''),
		       COALESCE(ps.h3_index, ''), COALESCE(ps.source_name, ''),
		       COALESCE(ps.source_document_id::text, ''), COALESCE(ps.source_document_slug, ''),
		       COALESCE(ps.source_sha256, ''), ps.source_position, COALESCE(ps.source_confidence, ''),
		       ps.created_at, ps.updated_at
		FROM polling_stations ps
		JOIN polling_station_assignments a ON a.polling_station_id = ps.id
		WHERE a.election_id = $1 AND a.observer_id = $2
		ORDER BY ps.code, ps.name`
	rows, err := r.db.QueryContext(queryCtx, query, electionID, observerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stations []entity.PollingStation
	for rows.Next() {
		var s entity.PollingStation
		if err := rows.Scan(
			&s.ID, &s.ElectionID, &s.Code, &s.Name, &s.RegionID, &s.DepartmentID,
			&s.ArrondissementID, &s.RegisteredVoters, &s.LocationName, &s.GPSLocation,
			&s.H3Index, &s.SourceName, &s.SourceDocumentID, &s.SourceDocumentSlug,
			&s.SourceSHA256, &s.SourcePosition, &s.SourceConfidence, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		stations = append(stations, s)
	}
	return stations, rows.Err()
}

func (r *pollingStationRepo) Create(ctx context.Context, station *entity.PollingStation) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `
		INSERT INTO polling_stations (
			election_id, code, name, region_id, department_id, arrondissement_id,
			registered_voters, location_name, gps_location, h3_index, source_name,
			source_document_id, source_document_slug, source_sha256, source_position, source_confidence
		)
		VALUES (
			$1, $2, $3, NULLIF($4, '')::uuid, NULLIF($5, '')::uuid, NULLIF($6, '')::uuid,
			$7, $8, CASE WHEN $9 = '' THEN NULL ELSE ST_GeomFromText($9, 4326) END, $10, $11,
			NULLIF($12, '')::uuid, $13, $14, $15, $16
		)
		RETURNING id, created_at, updated_at`
	return r.db.QueryRowContext(
		queryCtx,
		query,
		station.ElectionID, station.Code, station.Name, station.RegionID, station.DepartmentID,
		station.ArrondissementID, station.RegisteredVoters, station.LocationName,
		station.GPSLocation, station.H3Index, station.SourceName, station.SourceDocumentID,
		station.SourceDocumentSlug, station.SourceSHA256, station.SourcePosition, station.SourceConfidence,
	).Scan(&station.ID, &station.CreatedAt, &station.UpdatedAt)
}

type pollingStationAssignmentRepo struct{ db *sql.DB }

func NewPollingStationAssignmentRepository(db *sql.DB) repository.PollingStationAssignmentRepository {
	return &pollingStationAssignmentRepo{db: db}
}

func (r *pollingStationAssignmentRepo) Create(ctx context.Context, assignment *entity.PollingStationAssignment) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `
		INSERT INTO polling_station_assignments (
			election_id, polling_station_id, observer_id, assigned_by, notes
		)
		VALUES ($1, $2, $3, NULLIF($4, '')::uuid, $5)
		ON CONFLICT (election_id, polling_station_id, observer_id)
		DO UPDATE SET assigned_by = EXCLUDED.assigned_by, notes = EXCLUDED.notes, updated_at = NOW()
		RETURNING id, created_at, updated_at`
	return r.db.QueryRowContext(
		queryCtx,
		query,
		assignment.ElectionID, assignment.PollingStationID, assignment.ObserverID,
		assignment.AssignedBy, assignment.Notes,
	).Scan(&assignment.ID, &assignment.CreatedAt, &assignment.UpdatedAt)
}

func (r *pollingStationAssignmentRepo) GetByObserver(ctx context.Context, electionID, observerID string) ([]entity.PollingStationAssignment, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `
		SELECT id, election_id, polling_station_id, observer_id,
		       COALESCE(assigned_by::text, ''), COALESCE(notes, ''), created_at, updated_at
		FROM polling_station_assignments
		WHERE election_id = $1 AND observer_id = $2
		ORDER BY created_at DESC`
	rows, err := r.db.QueryContext(queryCtx, query, electionID, observerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assignments []entity.PollingStationAssignment
	for rows.Next() {
		var assignment entity.PollingStationAssignment
		if err := rows.Scan(
			&assignment.ID, &assignment.ElectionID, &assignment.PollingStationID,
			&assignment.ObserverID, &assignment.AssignedBy, &assignment.Notes,
			&assignment.CreatedAt, &assignment.UpdatedAt,
		); err != nil {
			return nil, err
		}
		assignments = append(assignments, assignment)
	}
	return assignments, rows.Err()
}

func (r *pollingStationAssignmentRepo) GetCoverage(ctx context.Context, electionID string) (*entity.FieldCoverageSummary, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	summary := &entity.FieldCoverageSummary{ElectionID: electionID}
	err := r.db.QueryRowContext(queryCtx, `
		SELECT
			(SELECT COUNT(*) FROM polling_stations WHERE election_id = $1),
			(SELECT COUNT(DISTINCT polling_station_id) FROM polling_station_assignments WHERE election_id = $1),
			(SELECT COUNT(DISTINCT polling_station_id) FROM pv_submissions WHERE election_id = $1 AND status IN ('submitted', 'verified', 'disputed')),
			(SELECT COUNT(DISTINCT observer_id) FROM polling_station_assignments WHERE election_id = $1)
	`, electionID).Scan(&summary.TotalStations, &summary.AssignedStations, &summary.SubmittedPV, &summary.ObserverCount)
	if err != nil {
		return nil, err
	}
	summary.UnassignedStations = summary.TotalStations - summary.AssignedStations
	if summary.TotalStations > 0 {
		summary.CoverageRate = float64(summary.SubmittedPV) / float64(summary.TotalStations)
	}

	regions, err := r.coverageByRegion(queryCtx, electionID)
	if err != nil {
		return nil, err
	}
	observers, err := r.coverageByObserver(queryCtx, electionID)
	if err != nil {
		return nil, err
	}
	priorityZones, err := r.coveragePriorityZones(queryCtx, electionID)
	if err != nil {
		return nil, err
	}
	summary.Regions = regions
	summary.Observers = observers
	summary.PriorityZones = priorityZones
	for _, zone := range priorityZones {
		if zone.Silent {
			summary.SilentZones = append(summary.SilentZones, zone)
			summary.SilentZoneCount++
		}
		if zone.PriorityLabel == "critique" {
			summary.CriticalZoneCount++
		}
	}
	if summary.SilentZones == nil {
		summary.SilentZones = []entity.FieldCoverageZone{}
	}
	return summary, nil
}

func (r *pollingStationAssignmentRepo) coverageByRegion(ctx context.Context, electionID string) ([]entity.FieldCoverageRegion, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			COALESCE(reg.id::text, '') AS region_id,
			COALESCE(reg.name, 'Sans région') AS region_name,
			COUNT(DISTINCT ps.id) AS total_stations,
			COUNT(DISTINCT a.polling_station_id) AS assigned_stations,
			COUNT(DISTINCT pv.polling_station_id) AS submitted_pv,
			COUNT(DISTINCT a.observer_id) AS observer_count
		FROM polling_stations ps
		LEFT JOIN regions reg ON reg.id = ps.region_id
		LEFT JOIN polling_station_assignments a ON a.polling_station_id = ps.id
		LEFT JOIN pv_submissions pv ON pv.polling_station_id = ps.id AND pv.status IN ('submitted', 'verified', 'disputed')
		WHERE ps.election_id = $1
		GROUP BY reg.id, reg.name
		ORDER BY region_name
	`, electionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var regions []entity.FieldCoverageRegion
	for rows.Next() {
		var region entity.FieldCoverageRegion
		if err := rows.Scan(
			&region.RegionID, &region.RegionName, &region.TotalStations,
			&region.AssignedStations, &region.SubmittedPV, &region.ObserverCount,
		); err != nil {
			return nil, err
		}
		if region.TotalStations > 0 {
			region.CoverageRate = float64(region.SubmittedPV) / float64(region.TotalStations)
		}
		regions = append(regions, region)
	}
	if regions == nil {
		regions = []entity.FieldCoverageRegion{}
	}
	return regions, rows.Err()
}

func (r *pollingStationAssignmentRepo) coverageByObserver(ctx context.Context, electionID string) ([]entity.FieldCoverageObserver, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			u.id,
			u.username,
			COALESCE(u.region_id, '') AS region_id,
			COUNT(DISTINCT a.polling_station_id) AS assigned_stations,
			COUNT(DISTINCT pv.polling_station_id) AS submitted_pv
		FROM polling_station_assignments a
		JOIN users u ON u.id = a.observer_id
		LEFT JOIN pv_submissions pv
			ON pv.polling_station_id = a.polling_station_id
			AND pv.observer_id = a.observer_id
			AND pv.status IN ('submitted', 'verified', 'disputed')
		WHERE a.election_id = $1
		GROUP BY u.id, u.username, u.region_id
		ORDER BY submitted_pv DESC, assigned_stations DESC, u.username
	`, electionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var observers []entity.FieldCoverageObserver
	for rows.Next() {
		var observer entity.FieldCoverageObserver
		if err := rows.Scan(
			&observer.ObserverID, &observer.ObserverName, &observer.RegionID,
			&observer.AssignedStations, &observer.SubmittedPV,
		); err != nil {
			return nil, err
		}
		if observer.AssignedStations > 0 {
			observer.CompletionRate = float64(observer.SubmittedPV) / float64(observer.AssignedStations)
		}
		observers = append(observers, observer)
	}
	if observers == nil {
		observers = []entity.FieldCoverageObserver{}
	}
	return observers, rows.Err()
}

func (r *pollingStationAssignmentRepo) coveragePriorityZones(ctx context.Context, electionID string) ([]entity.FieldCoverageZone, error) {
	rows, err := r.db.QueryContext(ctx, `
		WITH zone_stats AS (
			SELECT
				'region' AS zone_type,
				COALESCE(reg.id::text, '') AS region_id,
				COALESCE(reg.name, 'Sans région') AS region_name,
				'' AS department_id,
				'' AS department_name,
				'' AS arrondissement_id,
				'' AS arrondissement_name,
				COUNT(DISTINCT ps.id) AS total_stations,
				COUNT(DISTINCT a.polling_station_id) AS assigned_stations,
				COUNT(DISTINCT pv.polling_station_id) AS submitted_pv,
				COUNT(DISTINCT a.observer_id) AS observer_count
			FROM polling_stations ps
			LEFT JOIN regions reg ON reg.id = ps.region_id
			LEFT JOIN polling_station_assignments a ON a.polling_station_id = ps.id AND a.election_id = ps.election_id
			LEFT JOIN pv_submissions pv ON pv.polling_station_id = ps.id AND pv.election_id = ps.election_id AND pv.status IN ('submitted', 'verified', 'disputed')
			WHERE ps.election_id = $1
			GROUP BY reg.id, reg.name

			UNION ALL

			SELECT
				'department' AS zone_type,
				COALESCE(reg.id::text, '') AS region_id,
				COALESCE(reg.name, 'Sans région') AS region_name,
				COALESCE(dep.id::text, '') AS department_id,
				COALESCE(dep.name, 'Sans département') AS department_name,
				'' AS arrondissement_id,
				'' AS arrondissement_name,
				COUNT(DISTINCT ps.id) AS total_stations,
				COUNT(DISTINCT a.polling_station_id) AS assigned_stations,
				COUNT(DISTINCT pv.polling_station_id) AS submitted_pv,
				COUNT(DISTINCT a.observer_id) AS observer_count
			FROM polling_stations ps
			LEFT JOIN regions reg ON reg.id = ps.region_id
			LEFT JOIN departments dep ON dep.id = ps.department_id
			LEFT JOIN polling_station_assignments a ON a.polling_station_id = ps.id AND a.election_id = ps.election_id
			LEFT JOIN pv_submissions pv ON pv.polling_station_id = ps.id AND pv.election_id = ps.election_id AND pv.status IN ('submitted', 'verified', 'disputed')
			WHERE ps.election_id = $1
			GROUP BY reg.id, reg.name, dep.id, dep.name

			UNION ALL

			SELECT
				'arrondissement' AS zone_type,
				COALESCE(reg.id::text, '') AS region_id,
				COALESCE(reg.name, 'Sans région') AS region_name,
				COALESCE(dep.id::text, '') AS department_id,
				COALESCE(dep.name, 'Sans département') AS department_name,
				COALESCE(arr.id::text, '') AS arrondissement_id,
				COALESCE(arr.name, 'Sans arrondissement') AS arrondissement_name,
				COUNT(DISTINCT ps.id) AS total_stations,
				COUNT(DISTINCT a.polling_station_id) AS assigned_stations,
				COUNT(DISTINCT pv.polling_station_id) AS submitted_pv,
				COUNT(DISTINCT a.observer_id) AS observer_count
			FROM polling_stations ps
			LEFT JOIN regions reg ON reg.id = ps.region_id
			LEFT JOIN departments dep ON dep.id = ps.department_id
			LEFT JOIN arrondissements arr ON arr.id = ps.arrondissement_id
			LEFT JOIN polling_station_assignments a ON a.polling_station_id = ps.id AND a.election_id = ps.election_id
			LEFT JOIN pv_submissions pv ON pv.polling_station_id = ps.id AND pv.election_id = ps.election_id AND pv.status IN ('submitted', 'verified', 'disputed')
			WHERE ps.election_id = $1
			GROUP BY reg.id, reg.name, dep.id, dep.name, arr.id, arr.name
		)
		SELECT
			zone_type,
			region_id,
			region_name,
			department_id,
			department_name,
			arrondissement_id,
			arrondissement_name,
			total_stations,
			assigned_stations,
			submitted_pv,
			observer_count
		FROM zone_stats
		WHERE total_stations > 0
		ORDER BY
			CASE WHEN submitted_pv = 0 THEN 0 ELSE 1 END,
			((total_stations - submitted_pv) + ((total_stations - assigned_stations) * 0.5)) DESC,
			total_stations DESC,
			assigned_stations ASC,
			region_name,
			department_name,
			arrondissement_name
		LIMIT 80
	`, electionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	zones := []entity.FieldCoverageZone{}
	for rows.Next() {
		var zone entity.FieldCoverageZone
		if err := rows.Scan(
			&zone.ZoneType, &zone.RegionID, &zone.RegionName,
			&zone.DepartmentID, &zone.DepartmentName, &zone.ArrondissementID,
			&zone.ArrondissementName, &zone.TotalStations, &zone.AssignedStations,
			&zone.SubmittedPV, &zone.ObserverCount,
		); err != nil {
			return nil, err
		}
		if zone.TotalStations > 0 {
			zone.AssignmentRate = roundCoverageRate(float64(zone.AssignedStations) / float64(zone.TotalStations))
			zone.CoverageRate = roundCoverageRate(float64(zone.SubmittedPV) / float64(zone.TotalStations))
		}
		zone.UnassignedStations = zone.TotalStations - zone.AssignedStations
		if zone.UnassignedStations < 0 {
			zone.UnassignedStations = 0
		}
		zone.MissingPV = zone.TotalStations - zone.SubmittedPV
		if zone.MissingPV < 0 {
			zone.MissingPV = 0
		}
		zone.Silent = zone.TotalStations > 0 && zone.SubmittedPV == 0
		zone.PriorityScore = float64(zone.MissingPV) + float64(zone.UnassignedStations)*0.5
		switch {
		case zone.Silent && zone.TotalStations >= 100:
			zone.PriorityLabel = "critique"
		case zone.Silent:
			zone.PriorityLabel = "silencieuse"
		case zone.CoverageRate < 0.05:
			zone.PriorityLabel = "haute"
		default:
			zone.PriorityLabel = "à surveiller"
		}
		zones = append(zones, zone)
	}
	return zones, rows.Err()
}

func roundCoverageRate(value float64) float64 {
	return math.Round(value*10000) / 10000
}

type candidateRepo struct{ db *sql.DB }

func NewCandidateRepository(db *sql.DB) repository.CandidateRepository {
	return &candidateRepo{db: db}
}

func (r *candidateRepo) GetByElection(ctx context.Context, electionID string) ([]entity.Candidate, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `
		SELECT id, election_id, name, COALESCE(party, ''), ballot_number, created_at
		FROM candidates
		WHERE election_id = $1
		ORDER BY ballot_number NULLS LAST, name`
	rows, err := r.db.QueryContext(queryCtx, query, electionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var candidates []entity.Candidate
	for rows.Next() {
		var c entity.Candidate
		if err := rows.Scan(&c.ID, &c.ElectionID, &c.Name, &c.Party, &c.BallotNumber, &c.CreatedAt); err != nil {
			return nil, err
		}
		candidates = append(candidates, c)
	}
	return candidates, rows.Err()
}

func (r *candidateRepo) Create(ctx context.Context, candidate *entity.Candidate) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `
		INSERT INTO candidates (election_id, name, party, ballot_number)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at`
	return r.db.QueryRowContext(
		queryCtx,
		query,
		candidate.ElectionID, candidate.Name, candidate.Party, candidate.BallotNumber,
	).Scan(&candidate.ID, &candidate.CreatedAt)
}

type pvRepo struct{ db *sql.DB }

func NewPVRepository(db *sql.DB) repository.PVRepository {
	return &pvRepo{db: db}
}

type pvAuditRepo struct{ db *sql.DB }

func NewPVAuditRepository(db *sql.DB) repository.PVAuditRepository {
	return &pvAuditRepo{db: db}
}

func (r *pvAuditRepo) Create(ctx context.Context, event *entity.PVAuditEvent) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	var actorID any
	if event.ActorID != "" {
		actorID = event.ActorID
	}
	var actorRole any
	if event.ActorRole != "" {
		actorRole = event.ActorRole
	}
	var fromStatus any
	if event.FromStatus != "" {
		fromStatus = event.FromStatus
	}
	var toStatus any
	if event.ToStatus != "" {
		toStatus = event.ToStatus
	}
	metadata := event.Metadata
	if metadata == "" {
		metadata = "{}"
	}

	return r.db.QueryRowContext(queryCtx, `
		INSERT INTO pv_audit_events (
			pv_submission_id, election_id, polling_station_id, actor_id, actor_role,
			event_type, from_status, to_status, integrity_status, server_payload_hash,
			comment, metadata
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
		RETURNING id, created_at`,
		event.PVSubmissionID, event.ElectionID, event.PollingStationID, actorID, actorRole,
		event.EventType, fromStatus, toStatus, event.IntegrityStatus, event.ServerPayloadHash,
		event.Comment, metadata,
	).Scan(&event.ID, &event.CreatedAt)
}

func (r *pvAuditRepo) GetByPV(ctx context.Context, pvID string) ([]entity.PVAuditEvent, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	rows, err := r.db.QueryContext(queryCtx, `
		SELECT id, pv_submission_id, election_id, polling_station_id,
		       actor_id::text, actor_role::text, event_type,
		       from_status::text, to_status::text,
		       COALESCE(integrity_status, ''), COALESCE(server_payload_hash, ''),
		       COALESCE(comment, ''), COALESCE(metadata::text, '{}'), created_at
		FROM pv_audit_events
		WHERE pv_submission_id = $1
		ORDER BY created_at ASC`, pvID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []entity.PVAuditEvent{}
	for rows.Next() {
		var event entity.PVAuditEvent
		var actorID, actorRole, fromStatus, toStatus sql.NullString
		if err := rows.Scan(
			&event.ID, &event.PVSubmissionID, &event.ElectionID, &event.PollingStationID,
			&actorID, &actorRole, &event.EventType, &fromStatus, &toStatus,
			&event.IntegrityStatus, &event.ServerPayloadHash, &event.Comment,
			&event.Metadata, &event.CreatedAt,
		); err != nil {
			return nil, err
		}
		if actorID.Valid {
			event.ActorID = actorID.String
		}
		if actorRole.Valid {
			event.ActorRole = entity.UserRole(actorRole.String)
		}
		if fromStatus.Valid {
			event.FromStatus = entity.PVStatus(fromStatus.String)
		}
		if toStatus.Valid {
			event.ToStatus = entity.PVStatus(toStatus.String)
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func (r *pvRepo) Create(ctx context.Context, pv *entity.PVSubmission) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	tx, err := r.db.BeginTx(queryCtx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	query := `
		INSERT INTO pv_submissions (
			election_id, polling_station_id, observer_id, status, registered_voters,
			voters_count, null_votes, blank_votes, disputed_votes, pv_photo_url,
			pv_hash, signed_payload_hash, signature, proof_manifest_version,
			client_recorded_at, device_latitude, device_longitude, device_id, server_payload_hash,
			integrity_status, integrity_errors, canonical_payload, notes
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULLIF($15,'')::timestamptz,$16,$17,$18,$19,$20,$21::jsonb,$22::jsonb,$23)
		RETURNING id, submitted_at, created_at, updated_at`
	integrityErrors, err := json.Marshal(pv.IntegrityErrors)
	if err != nil {
		return fmt.Errorf("encode integrity errors: %w", err)
	}
	err = tx.QueryRowContext(
		queryCtx,
		query,
		pv.ElectionID, pv.PollingStationID, pv.ObserverID, pv.Status, pv.RegisteredVoters,
		pv.VotersCount, pv.NullVotes, pv.BlankVotes, pv.DisputedVotes, pv.PVPhotoURL,
		pv.PVHash, pv.SignedPayloadHash, pv.Signature, pv.ProofManifestVersion,
		pv.ClientRecordedAt, pv.DeviceLatitude, pv.DeviceLongitude, pv.DeviceID, pv.ServerPayloadHash,
		pv.IntegrityStatus, string(integrityErrors), pv.CanonicalPayload, pv.Notes,
	).Scan(&pv.ID, &pv.SubmittedAt, &pv.CreatedAt, &pv.UpdatedAt)
	if err != nil {
		return err
	}

	for i := range pv.Results {
		result := &pv.Results[i]
		err = tx.QueryRowContext(
			queryCtx,
			`INSERT INTO pv_results (pv_submission_id, candidate_id, votes)
			 VALUES ($1, $2, $3)
			 RETURNING id, created_at`,
			pv.ID, result.CandidateID, result.Votes,
		).Scan(&result.ID, &result.CreatedAt)
		if err != nil {
			return err
		}
		result.PVSubmissionID = pv.ID
	}

	if err = tx.Commit(); err != nil {
		return err
	}
	r.createRegionalRiskSnapshotBestEffort(ctx, pv.ElectionID)
	return nil
}

func (r *pvRepo) GetByID(ctx context.Context, id string) (*entity.PVSubmission, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `
		SELECT id, election_id, polling_station_id, observer_id, status,
		       registered_voters, voters_count, null_votes, blank_votes, disputed_votes,
		       COALESCE(pv_photo_url, ''), COALESCE(pv_hash, ''),
		       COALESCE(signed_payload_hash, ''), COALESCE(signature, ''),
		       COALESCE(proof_manifest_version, 1), COALESCE(client_recorded_at::text, ''),
		       COALESCE(device_latitude, 0), COALESCE(device_longitude, 0),
		       COALESCE(device_id, ''), COALESCE(server_payload_hash, ''), COALESCE(integrity_status, ''),
		       COALESCE(integrity_errors, '[]'::jsonb), COALESCE(canonical_payload::text, '{}'),
		       COALESCE(notes, ''),
		       COALESCE(verification_comment, ''), COALESCE(verified_by::text, ''), verified_at,
		       submitted_at, created_at, updated_at
		FROM pv_submissions
		WHERE id = $1`
	pv := &entity.PVSubmission{}
	var verifiedAt sql.NullTime
	var integrityErrors []byte
	err := r.db.QueryRowContext(queryCtx, query, id).Scan(
		&pv.ID, &pv.ElectionID, &pv.PollingStationID, &pv.ObserverID, &pv.Status,
		&pv.RegisteredVoters, &pv.VotersCount, &pv.NullVotes, &pv.BlankVotes, &pv.DisputedVotes,
		&pv.PVPhotoURL, &pv.PVHash, &pv.SignedPayloadHash, &pv.Signature,
		&pv.ProofManifestVersion, &pv.ClientRecordedAt, &pv.DeviceLatitude, &pv.DeviceLongitude,
		&pv.DeviceID, &pv.ServerPayloadHash, &pv.IntegrityStatus, &integrityErrors, &pv.CanonicalPayload,
		&pv.Notes,
		&pv.VerificationComment, &pv.VerifiedBy, &verifiedAt,
		&pv.SubmittedAt, &pv.CreatedAt, &pv.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	results, err := r.getResults(queryCtx, pv.ID)
	if err != nil {
		return nil, err
	}
	pv.Results = results
	if verifiedAt.Valid {
		pv.VerifiedAt = &verifiedAt.Time
	}
	pv.IntegrityErrors = decodeIntegrityErrors(integrityErrors)
	pv.Anomalies = r.detectAnomalies(queryCtx, pv, results)
	return pv, nil
}

func (r *pvRepo) GetByElection(ctx context.Context, electionID string) ([]entity.PVSubmission, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `
		SELECT id, election_id, polling_station_id, observer_id, status,
		       registered_voters, voters_count, null_votes, blank_votes, disputed_votes,
		       COALESCE(pv_photo_url, ''), COALESCE(pv_hash, ''),
		       COALESCE(signed_payload_hash, ''), COALESCE(signature, ''),
		       COALESCE(proof_manifest_version, 1), COALESCE(client_recorded_at::text, ''),
		       COALESCE(device_latitude, 0), COALESCE(device_longitude, 0),
		       COALESCE(device_id, ''), COALESCE(server_payload_hash, ''), COALESCE(integrity_status, ''),
		       COALESCE(integrity_errors, '[]'::jsonb), COALESCE(canonical_payload::text, '{}'),
		       COALESCE(notes, ''),
		       COALESCE(verification_comment, ''), COALESCE(verified_by::text, ''), verified_at,
		       submitted_at, created_at, updated_at
		FROM pv_submissions
		WHERE election_id = $1
		ORDER BY submitted_at DESC`
	rows, err := r.db.QueryContext(queryCtx, query, electionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var submissions []entity.PVSubmission
	for rows.Next() {
		var pv entity.PVSubmission
		var verifiedAt sql.NullTime
		var integrityErrors []byte
		if err := rows.Scan(
			&pv.ID, &pv.ElectionID, &pv.PollingStationID, &pv.ObserverID, &pv.Status,
			&pv.RegisteredVoters, &pv.VotersCount, &pv.NullVotes, &pv.BlankVotes, &pv.DisputedVotes,
			&pv.PVPhotoURL, &pv.PVHash, &pv.SignedPayloadHash, &pv.Signature,
			&pv.ProofManifestVersion, &pv.ClientRecordedAt, &pv.DeviceLatitude, &pv.DeviceLongitude,
			&pv.DeviceID, &pv.ServerPayloadHash, &pv.IntegrityStatus, &integrityErrors, &pv.CanonicalPayload,
			&pv.Notes,
			&pv.VerificationComment, &pv.VerifiedBy, &verifiedAt,
			&pv.SubmittedAt, &pv.CreatedAt, &pv.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if verifiedAt.Valid {
			pv.VerifiedAt = &verifiedAt.Time
		}
		pv.IntegrityErrors = decodeIntegrityErrors(integrityErrors)
		submissions = append(submissions, pv)
	}
	return submissions, rows.Err()
}

func (r *pvRepo) GetForReview(ctx context.Context, electionID, status string) ([]entity.PVSubmission, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	args := []any{electionID}
	statusFilter := ""
	if status != "" {
		args = append(args, status)
		statusFilter = "AND ps.status = $2"
	}
	query := fmt.Sprintf(`
		SELECT ps.id, ps.election_id, ps.polling_station_id, ps.observer_id, ps.status,
		       ps.registered_voters, ps.voters_count, ps.null_votes, ps.blank_votes, ps.disputed_votes,
		       COALESCE(ps.pv_photo_url, ''), COALESCE(ps.pv_hash, ''),
		       COALESCE(ps.signed_payload_hash, ''), COALESCE(ps.signature, ''),
		       COALESCE(ps.proof_manifest_version, 1), COALESCE(ps.client_recorded_at::text, ''),
		       COALESCE(ps.device_latitude, 0), COALESCE(ps.device_longitude, 0),
		       COALESCE(ps.device_id, ''), COALESCE(ps.server_payload_hash, ''), COALESCE(ps.integrity_status, ''),
		       COALESCE(ps.integrity_errors, '[]'::jsonb), COALESCE(ps.canonical_payload::text, '{}'),
		       COALESCE(ps.notes, ''),
		       COALESCE(ps.verification_comment, ''), COALESCE(ps.verified_by::text, ''), ps.verified_at,
		       ps.submitted_at, ps.created_at, ps.updated_at
		FROM pv_submissions ps
		WHERE ps.election_id = $1 %s
		ORDER BY
			CASE ps.status
				WHEN 'submitted' THEN 0
				WHEN 'needs_clarification' THEN 1
				WHEN 'disputed' THEN 2
				WHEN 'rejected' THEN 3
				WHEN 'verified' THEN 4
				ELSE 5
			END,
			ps.submitted_at DESC`, statusFilter)

	rows, err := r.db.QueryContext(queryCtx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	submissions := []entity.PVSubmission{}
	for rows.Next() {
		var pv entity.PVSubmission
		var verifiedAt sql.NullTime
		var integrityErrors []byte
		if err := rows.Scan(
			&pv.ID, &pv.ElectionID, &pv.PollingStationID, &pv.ObserverID, &pv.Status,
			&pv.RegisteredVoters, &pv.VotersCount, &pv.NullVotes, &pv.BlankVotes, &pv.DisputedVotes,
			&pv.PVPhotoURL, &pv.PVHash, &pv.SignedPayloadHash, &pv.Signature,
			&pv.ProofManifestVersion, &pv.ClientRecordedAt, &pv.DeviceLatitude, &pv.DeviceLongitude,
			&pv.DeviceID, &pv.ServerPayloadHash, &pv.IntegrityStatus, &integrityErrors, &pv.CanonicalPayload,
			&pv.Notes,
			&pv.VerificationComment, &pv.VerifiedBy, &verifiedAt,
			&pv.SubmittedAt, &pv.CreatedAt, &pv.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if verifiedAt.Valid {
			pv.VerifiedAt = &verifiedAt.Time
		}
		pv.IntegrityErrors = decodeIntegrityErrors(integrityErrors)
		results, err := r.getResults(queryCtx, pv.ID)
		if err != nil {
			return nil, err
		}
		pv.Results = results
		pv.Anomalies = r.detectAnomalies(queryCtx, &pv, results)
		submissions = append(submissions, pv)
	}
	return submissions, rows.Err()
}

func (r *pvRepo) UpdateVerificationStatus(ctx context.Context, id string, status entity.PVStatus, comment, adminID string) (*entity.PVSubmission, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	var verifiedBy any
	if adminID != "" {
		verifiedBy = adminID
	}
	_, err := r.db.ExecContext(queryCtx, `
		UPDATE pv_submissions
		SET status = $2,
		    verification_comment = $3,
		    verified_by = $4,
		    verified_at = NOW(),
		    updated_at = NOW()
		WHERE id = $1`,
		id, status, comment, verifiedBy,
	)
	if err != nil {
		return nil, err
	}
	pv, err := r.GetByID(ctx, id)
	if err != nil || pv == nil {
		return pv, err
	}
	r.createRegionalRiskSnapshotBestEffort(ctx, pv.ElectionID)
	return pv, nil
}

func (r *pvRepo) GetSummary(ctx context.Context, electionID string) (*entity.ElectionResultSummary, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	summary := &entity.ElectionResultSummary{ElectionID: electionID}
	err := r.db.QueryRowContext(queryCtx, `
		SELECT
			(SELECT COUNT(*) FROM polling_stations WHERE election_id = $1),
			(SELECT COUNT(*) FROM pv_submissions WHERE election_id = $1 AND status IN ('submitted', 'verified', 'disputed')),
			COALESCE((SELECT SUM(voters_count) FROM pv_submissions WHERE election_id = $1 AND status IN ('submitted', 'verified')), 0)
	`, electionID).Scan(&summary.TotalStations, &summary.SubmittedPV, &summary.TotalVoters)
	if err != nil {
		return nil, err
	}
	if summary.TotalStations > 0 {
		summary.CoverageRate = float64(summary.SubmittedPV) / float64(summary.TotalStations)
	}

	rows, err := r.db.QueryContext(queryCtx, `
		SELECT c.id, c.name, COALESCE(c.party, ''),
		       COALESCE(SUM(CASE WHEN ps.id IS NOT NULL THEN pr.votes ELSE 0 END), 0),
		       COUNT(DISTINCT ps.id)
		FROM candidates c
		LEFT JOIN pv_results pr ON pr.candidate_id = c.id
		LEFT JOIN pv_submissions ps ON ps.id = pr.pv_submission_id AND ps.status IN ('submitted', 'verified')
		WHERE c.election_id = $1
		GROUP BY c.id, c.name, c.party
		ORDER BY COALESCE(SUM(pr.votes), 0) DESC, c.name
	`, electionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var item entity.CandidateResultSummary
		if err := rows.Scan(&item.CandidateID, &item.CandidateName, &item.Party, &item.TotalVotes, &item.PVCount); err != nil {
			return nil, err
		}
		summary.TotalCandidateVote += item.TotalVotes
		summary.Results = append(summary.Results, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if summary.Results == nil {
		summary.Results = []entity.CandidateResultSummary{}
	}
	return summary, nil
}

func (r *pvRepo) GetRegionSummaries(ctx context.Context, electionID string) ([]entity.RegionPVSummary, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	rows, err := r.db.QueryContext(queryCtx, `
		WITH station_regions AS (
			SELECT
				ps.id AS station_id,
				ps.election_id,
				COALESCE(rg.id::text, '') AS region_id,
				COALESCE(rg.name, 'Non renseignée') AS region_name,
				ps.registered_voters
			FROM polling_stations ps
			LEFT JOIN regions rg ON rg.id = ps.region_id
			WHERE ps.election_id = $1
		),
		pv_base AS (
			SELECT
				sr.election_id,
				sr.region_id,
				sr.region_name,
				COUNT(DISTINCT sr.station_id) AS total_stations,
				COUNT(DISTINCT pv.id) FILTER (WHERE pv.status IN ('submitted', 'verified', 'disputed')) AS submitted_pv,
				COALESCE(SUM(sr.registered_voters) FILTER (WHERE pv.status IN ('submitted', 'verified')), 0) AS registered_voters,
				COALESCE(SUM(pv.voters_count) FILTER (WHERE pv.status IN ('submitted', 'verified')), 0) AS reported_voters,
				COALESCE(SUM(pv.null_votes + pv.blank_votes) FILTER (WHERE pv.status IN ('submitted', 'verified')), 0) AS blank_or_invalid_votes
			FROM station_regions sr
			LEFT JOIN pv_submissions pv ON pv.polling_station_id = sr.station_id
			GROUP BY sr.election_id, sr.region_id, sr.region_name
		),
		candidate_totals AS (
			SELECT
				sr.region_id,
				c.id::text AS candidate_id,
				c.name AS candidate_name,
				COALESCE(c.party, '') AS party,
				SUM(pr.votes) AS votes,
				ROW_NUMBER() OVER (PARTITION BY sr.region_id ORDER BY SUM(pr.votes) DESC, c.name) AS rank
			FROM station_regions sr
			JOIN pv_submissions pv ON pv.polling_station_id = sr.station_id AND pv.status IN ('submitted', 'verified')
			JOIN pv_results pr ON pr.pv_submission_id = pv.id
			JOIN candidates c ON c.id = pr.candidate_id
			GROUP BY sr.region_id, c.id, c.name, c.party
		),
		candidate_region_sum AS (
			SELECT sr.region_id, COALESCE(SUM(pr.votes), 0) AS total_candidate_votes
			FROM station_regions sr
			JOIN pv_submissions pv ON pv.polling_station_id = sr.station_id AND pv.status IN ('submitted', 'verified')
			JOIN pv_results pr ON pr.pv_submission_id = pv.id
			GROUP BY sr.region_id
		)
		SELECT
			pb.election_id::text,
			pb.region_id,
			pb.region_name,
			pb.total_stations,
			pb.submitted_pv,
			CASE WHEN pb.total_stations > 0 THEN pb.submitted_pv::float / pb.total_stations::float ELSE 0 END AS coverage_rate,
			pb.registered_voters,
			pb.reported_voters,
			pb.blank_or_invalid_votes,
			COALESCE(crs.total_candidate_votes, 0) AS total_candidate_votes,
			COALESCE(ct.candidate_id, '') AS leader_candidate_id,
			COALESCE(ct.candidate_name, '') AS leader_name,
			COALESCE(ct.party, '') AS leader_party,
			COALESCE(ct.votes, 0) AS leader_votes
		FROM pv_base pb
		LEFT JOIN candidate_region_sum crs ON crs.region_id = pb.region_id
		LEFT JOIN candidate_totals ct ON ct.region_id = pb.region_id AND ct.rank = 1
		ORDER BY coverage_rate ASC, pb.region_name
	`, electionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summaries := []entity.RegionPVSummary{}
	for rows.Next() {
		var item entity.RegionPVSummary
		if err := rows.Scan(
			&item.ElectionID, &item.RegionID, &item.RegionName, &item.TotalStations,
			&item.SubmittedPV, &item.CoverageRate, &item.RegisteredVoters,
			&item.ReportedVoters, &item.BlankOrInvalidVotes, &item.TotalCandidateVotes,
			&item.LeaderCandidateID, &item.LeaderName, &item.LeaderParty, &item.LeaderVotes,
		); err != nil {
			return nil, err
		}
		summaries = append(summaries, item)
	}
	return summaries, rows.Err()
}

type historicalRegionReference struct {
	ElectionID          string
	ElectionYear        int
	ContestType         string
	SourceDocumentSlug  string
	TurnoutRate         *float64
	InvalidRate         *float64
	NormalizedRegionKey string
}

func (r *pvRepo) CreateRegionalRiskSnapshot(ctx context.Context, electionID string) ([]entity.RegionalRiskSnapshot, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	regions, err := r.GetRegionSummaries(queryCtx, electionID)
	if err != nil {
		return nil, err
	}
	references, err := r.latestHistoricalRegionReferences(queryCtx)
	if err != nil {
		return nil, err
	}

	snapshots := make([]entity.RegionalRiskSnapshot, 0, len(regions))
	for _, region := range regions {
		snapshot := buildRegionalRiskSnapshot(electionID, region, references[normalizeCameroonRegion(region.RegionName)])
		inserted, err := r.insertRegionalRiskSnapshot(queryCtx, &snapshot)
		if err != nil {
			return nil, err
		}
		if inserted {
			snapshots = append(snapshots, snapshot)
		}
	}
	return snapshots, nil
}

func (r *pvRepo) createRegionalRiskSnapshotBestEffort(ctx context.Context, electionID string) {
	if electionID == "" {
		return
	}
	if _, err := r.CreateRegionalRiskSnapshot(context.WithoutCancel(ctx), electionID); err != nil {
		log.Printf("[REGIONAL_RISK] snapshot automatique échoué election_id=%s: %v", electionID, err)
	}
}

func (r *pvRepo) GetRegionalRiskSnapshots(ctx context.Context, electionID string, limit int) ([]entity.RegionalRiskSnapshot, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	if limit <= 0 || limit > 500 {
		limit = 120
	}

	rows, err := r.db.QueryContext(queryCtx, `
		SELECT id::text, election_id::text, COALESCE(region_id::text, ''), region_name,
		       normalized_region_name, COALESCE(reference_election_id::text, ''),
		       reference_election_year, reference_contest_type, reference_source_document_slug,
		       total_stations, submitted_pv, coverage_rate::float, registered_voters,
		       reported_voters, blank_or_invalid_votes, turnout_rate::float,
		       reference_turnout_rate::float, turnout_gap_points::float, invalid_rate::float,
		       reference_invalid_rate::float, invalid_gap_points::float,
		       COALESCE(leader_candidate_id::text, ''), leader_name, leader_party,
		       leader_votes, risk_score, risk_status, rules, evidence, snapshot_hash, created_at
		FROM regional_risk_snapshots
		WHERE election_id = $1
		ORDER BY created_at DESC, risk_score DESC, region_name
		LIMIT $2
	`, electionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	snapshots := []entity.RegionalRiskSnapshot{}
	for rows.Next() {
		snapshot, err := scanRegionalRiskSnapshot(rows)
		if err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots, rows.Err()
}

func (r *pvRepo) latestHistoricalRegionReferences(ctx context.Context) (map[string]historicalRegionReference, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT election_id::text, election_year, contest_type, source_document_slug,
		       percentage::float,
		       CASE WHEN actual_voters > 0 AND blank_or_invalid_votes IS NOT NULL
		            THEN (blank_or_invalid_votes::float / actual_voters::float) * 100
		            ELSE NULL
		       END AS invalid_rate,
		       region_name
		FROM historical_election_results
		WHERE result_level = 'region'
		  AND actor_type = 'election'
		  AND metric_type = 'summary'
		ORDER BY election_year DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	references := map[string]historicalRegionReference{}
	for rows.Next() {
		var ref historicalRegionReference
		var turnout, invalid sql.NullFloat64
		var regionName string
		if err := rows.Scan(
			&ref.ElectionID, &ref.ElectionYear, &ref.ContestType, &ref.SourceDocumentSlug,
			&turnout, &invalid, &regionName,
		); err != nil {
			return nil, err
		}
		ref.TurnoutRate = floatPtrFromNull(turnout)
		ref.InvalidRate = floatPtrFromNull(invalid)
		ref.NormalizedRegionKey = normalizeCameroonRegion(regionName)
		if _, exists := references[ref.NormalizedRegionKey]; !exists {
			references[ref.NormalizedRegionKey] = ref
		}
	}
	return references, rows.Err()
}

type regionalRiskScanner interface {
	Scan(dest ...any) error
}

func scanRegionalRiskSnapshot(scanner regionalRiskScanner) (entity.RegionalRiskSnapshot, error) {
	var snapshot entity.RegionalRiskSnapshot
	var referenceYear sql.NullInt64
	var turnoutRate, referenceTurnoutRate, turnoutGap sql.NullFloat64
	var invalidRate, referenceInvalidRate, invalidGap sql.NullFloat64
	var rulesJSON, evidenceJSON []byte

	if err := scanner.Scan(
		&snapshot.ID, &snapshot.ElectionID, &snapshot.RegionID, &snapshot.RegionName,
		&snapshot.NormalizedRegionName, &snapshot.ReferenceElectionID, &referenceYear,
		&snapshot.ReferenceContestType, &snapshot.ReferenceSourceDocumentSlug,
		&snapshot.TotalStations, &snapshot.SubmittedPV, &snapshot.CoverageRate,
		&snapshot.RegisteredVoters, &snapshot.ReportedVoters, &snapshot.BlankOrInvalidVotes,
		&turnoutRate, &referenceTurnoutRate, &turnoutGap, &invalidRate,
		&referenceInvalidRate, &invalidGap, &snapshot.LeaderCandidateID,
		&snapshot.LeaderName, &snapshot.LeaderParty, &snapshot.LeaderVotes,
		&snapshot.RiskScore, &snapshot.RiskStatus, &rulesJSON, &evidenceJSON,
		&snapshot.SnapshotHash, &snapshot.CreatedAt,
	); err != nil {
		return snapshot, err
	}

	if referenceYear.Valid {
		year := int(referenceYear.Int64)
		snapshot.ReferenceElectionYear = &year
	}
	snapshot.TurnoutRate = floatPtrFromNull(turnoutRate)
	snapshot.ReferenceTurnoutRate = floatPtrFromNull(referenceTurnoutRate)
	snapshot.TurnoutGapPoints = floatPtrFromNull(turnoutGap)
	snapshot.InvalidRate = floatPtrFromNull(invalidRate)
	snapshot.ReferenceInvalidRate = floatPtrFromNull(referenceInvalidRate)
	snapshot.InvalidGapPoints = floatPtrFromNull(invalidGap)
	if err := json.Unmarshal(rulesJSON, &snapshot.Rules); err != nil {
		return snapshot, err
	}
	if err := json.Unmarshal(evidenceJSON, &snapshot.Evidence); err != nil {
		return snapshot, err
	}
	return snapshot, nil
}

func (r *pvRepo) insertRegionalRiskSnapshot(ctx context.Context, snapshot *entity.RegionalRiskSnapshot) (bool, error) {
	rulesJSON, err := json.Marshal(snapshot.Rules)
	if err != nil {
		return false, err
	}
	evidenceJSON, err := json.Marshal(snapshot.Evidence)
	if err != nil {
		return false, err
	}

	var regionID any
	if snapshot.RegionID != "" {
		regionID = snapshot.RegionID
	}
	var referenceElectionID any
	if snapshot.ReferenceElectionID != "" {
		referenceElectionID = snapshot.ReferenceElectionID
	}
	var leaderCandidateID any
	if snapshot.LeaderCandidateID != "" {
		leaderCandidateID = snapshot.LeaderCandidateID
	}

	err = r.db.QueryRowContext(ctx, `
		WITH latest AS (
			SELECT snapshot_hash
			FROM regional_risk_snapshots
			WHERE election_id = $1
			  AND normalized_region_name = $4
			ORDER BY created_at DESC
			LIMIT 1
		),
		inserted AS (
			INSERT INTO regional_risk_snapshots (
			election_id, region_id, region_name, normalized_region_name, reference_election_id,
			reference_election_year, reference_contest_type, reference_source_document_slug,
			total_stations, submitted_pv, coverage_rate, registered_voters, reported_voters,
			blank_or_invalid_votes, turnout_rate, reference_turnout_rate, turnout_gap_points,
			invalid_rate, reference_invalid_rate, invalid_gap_points, leader_candidate_id,
			leader_name, leader_party, leader_votes, risk_score, risk_status, rules, evidence,
			snapshot_hash
			)
			SELECT
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
			$27::jsonb, $28::jsonb, $29
			WHERE NOT EXISTS (SELECT 1 FROM latest WHERE snapshot_hash = $29)
			RETURNING id::text, created_at
		)
		SELECT id, created_at FROM inserted
	`, snapshot.ElectionID, regionID, snapshot.RegionName, snapshot.NormalizedRegionName,
		referenceElectionID, snapshot.ReferenceElectionYear, snapshot.ReferenceContestType,
		snapshot.ReferenceSourceDocumentSlug, snapshot.TotalStations, snapshot.SubmittedPV,
		snapshot.CoverageRate, snapshot.RegisteredVoters, snapshot.ReportedVoters,
		snapshot.BlankOrInvalidVotes, snapshot.TurnoutRate, snapshot.ReferenceTurnoutRate,
		snapshot.TurnoutGapPoints, snapshot.InvalidRate, snapshot.ReferenceInvalidRate,
		snapshot.InvalidGapPoints, leaderCandidateID, snapshot.LeaderName, snapshot.LeaderParty,
		snapshot.LeaderVotes, snapshot.RiskScore, snapshot.RiskStatus, string(rulesJSON),
		string(evidenceJSON), snapshot.SnapshotHash,
	).Scan(&snapshot.ID, &snapshot.CreatedAt)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func buildRegionalRiskSnapshot(electionID string, region entity.RegionPVSummary, ref historicalRegionReference) entity.RegionalRiskSnapshot {
	turnout := percent(region.ReportedVoters, region.RegisteredVoters)
	invalid := percent(region.BlankOrInvalidVotes, region.ReportedVoters)
	turnoutGap := diffPtr(turnout, ref.TurnoutRate)
	invalidGap := diffPtr(invalid, ref.InvalidRate)
	rules := regionalRiskRules(region, turnoutGap, invalidGap)
	score := 0
	for _, rule := range rules {
		score += rule.Weight
	}
	if score > 100 {
		score = 100
	}
	status := regionalRiskStatus(score, region.CoverageRate)
	evidence := []string{
		fmt.Sprintf("%d/%d PV reçus", region.SubmittedPV, region.TotalStations),
		fmt.Sprintf("Couverture %.1f%%", region.CoverageRate*100),
	}
	if turnoutGap != nil {
		evidence = append(evidence, fmt.Sprintf("Écart participation %+.1f pts", *turnoutGap))
	}
	if invalidGap != nil {
		evidence = append(evidence, fmt.Sprintf("Écart invalides %+.1f pts", *invalidGap))
	}
	if ref.SourceDocumentSlug != "" {
		evidence = append(evidence, "Source historique "+ref.SourceDocumentSlug)
	}

	snapshot := entity.RegionalRiskSnapshot{
		ElectionID:                  electionID,
		RegionID:                    region.RegionID,
		RegionName:                  region.RegionName,
		NormalizedRegionName:        normalizeCameroonRegion(region.RegionName),
		ReferenceElectionID:         ref.ElectionID,
		ReferenceElectionYear:       intPtrIfNonZero(ref.ElectionYear),
		ReferenceContestType:        ref.ContestType,
		ReferenceSourceDocumentSlug: ref.SourceDocumentSlug,
		TotalStations:               region.TotalStations,
		SubmittedPV:                 region.SubmittedPV,
		CoverageRate:                roundFloat(region.CoverageRate, 6),
		RegisteredVoters:            region.RegisteredVoters,
		ReportedVoters:              region.ReportedVoters,
		BlankOrInvalidVotes:         region.BlankOrInvalidVotes,
		TurnoutRate:                 roundFloatPtr(turnout, 3),
		ReferenceTurnoutRate:        roundFloatPtr(ref.TurnoutRate, 3),
		TurnoutGapPoints:            roundFloatPtr(turnoutGap, 3),
		InvalidRate:                 roundFloatPtr(invalid, 3),
		ReferenceInvalidRate:        roundFloatPtr(ref.InvalidRate, 3),
		InvalidGapPoints:            roundFloatPtr(invalidGap, 3),
		LeaderCandidateID:           region.LeaderCandidateID,
		LeaderName:                  region.LeaderName,
		LeaderParty:                 region.LeaderParty,
		LeaderVotes:                 region.LeaderVotes,
		RiskScore:                   score,
		RiskStatus:                  status,
		Rules:                       rules,
		Evidence:                    evidence,
	}
	snapshot.SnapshotHash = hashRegionalRiskSnapshot(snapshot)
	return snapshot
}

func regionalRiskRules(region entity.RegionPVSummary, turnoutGap, invalidGap *float64) []entity.RegionalRiskRule {
	rules := []entity.RegionalRiskRule{}
	if region.CoverageRate < 0.1 {
		rules = append(rules, entity.RegionalRiskRule{Code: "coverage_low", Label: "Couverture PV trop faible pour conclure", Severity: "weak", Weight: 5, Value: region.CoverageRate * 100})
	}
	if turnoutGap != nil && math.Abs(*turnoutGap) >= 15 {
		rules = append(rules, entity.RegionalRiskRule{Code: "turnout_gap_high", Label: "Écart de participation très élevé", Severity: "high", Weight: 45, Value: *turnoutGap})
	} else if turnoutGap != nil && math.Abs(*turnoutGap) >= 8 {
		rules = append(rules, entity.RegionalRiskRule{Code: "turnout_gap_medium", Label: "Écart de participation notable", Severity: "medium", Weight: 25, Value: *turnoutGap})
	}
	if invalidGap != nil && math.Abs(*invalidGap) >= 3 {
		rules = append(rules, entity.RegionalRiskRule{Code: "invalid_gap_high", Label: "Écart de bulletins blancs/invalides élevé", Severity: "high", Weight: 30, Value: *invalidGap})
	} else if invalidGap != nil && math.Abs(*invalidGap) >= 1.5 {
		rules = append(rules, entity.RegionalRiskRule{Code: "invalid_gap_medium", Label: "Écart de bulletins blancs/invalides notable", Severity: "medium", Weight: 15, Value: *invalidGap})
	}
	if region.LeaderVotes == 0 && region.SubmittedPV > 0 {
		rules = append(rules, entity.RegionalRiskRule{Code: "leader_missing", Label: "PV reçus sans leader candidat consolidé", Severity: "medium", Weight: 10})
	}
	if len(rules) == 0 {
		rules = append(rules, entity.RegionalRiskRule{Code: "within_expected_range", Label: "Aucun écart majeur détecté", Severity: "low", Weight: 0})
	}
	return rules
}

func regionalRiskStatus(score int, coverageRate float64) string {
	if coverageRate < 0.1 {
		return "signal_faible"
	}
	if score >= 70 {
		return "prioritaire"
	}
	if score >= 35 {
		return "a_surveiller"
	}
	return "stable"
}

func normalizeCameroonRegion(regionName string) string {
	normalized := strings.ToUpper(strings.TrimSpace(regionName))
	replacer := strings.NewReplacer("É", "E", "È", "E", "Ê", "E", "-", " ")
	normalized = replacer.Replace(normalized)
	normalized = strings.Join(strings.Fields(normalized), " ")
	aliases := map[string]string{
		"ADAMAWA":      "ADAMAOUA",
		"ADAMAOUA":     "ADAMAOUA",
		"CENTER":       "CENTRE",
		"CENTRE":       "CENTRE",
		"EAST":         "EST",
		"EST":          "EST",
		"FAR NORTH":    "EXTREME NORD",
		"EXTREME NORD": "EXTREME NORD",
		"LITTORAL":     "LITTORAL",
		"NORTH":        "NORD",
		"NORD":         "NORD",
		"NORTH WEST":   "NORD OUEST",
		"NORD OUEST":   "NORD OUEST",
		"WEST":         "OUEST",
		"OUEST":        "OUEST",
		"SOUTH":        "SUD",
		"SUD":          "SUD",
		"SOUTH WEST":   "SUD OUEST",
		"SUD OUEST":    "SUD OUEST",
	}
	if alias, ok := aliases[normalized]; ok {
		return alias
	}
	return normalized
}

func percent(value, total int) *float64 {
	if total <= 0 {
		return nil
	}
	rate := (float64(value) / float64(total)) * 100
	return &rate
}

func diffPtr(value, reference *float64) *float64 {
	if value == nil || reference == nil {
		return nil
	}
	diff := *value - *reference
	return &diff
}

func roundFloat(value float64, decimals int) float64 {
	factor := math.Pow(10, float64(decimals))
	return math.Round(value*factor) / factor
}

func roundFloatPtr(value *float64, decimals int) *float64 {
	if value == nil {
		return nil
	}
	rounded := roundFloat(*value, decimals)
	return &rounded
}

func intPtrIfNonZero(value int) *int {
	if value == 0 {
		return nil
	}
	return &value
}

func floatPtrFromNull(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	return &value.Float64
}

func hashRegionalRiskSnapshot(snapshot entity.RegionalRiskSnapshot) string {
	payload := fmt.Sprintf("%s|%s|%s|%d|%d|%.6f|%d|%d|%d|%d",
		snapshot.ElectionID,
		snapshot.NormalizedRegionName,
		snapshot.ReferenceElectionID,
		snapshot.TotalStations,
		snapshot.SubmittedPV,
		snapshot.CoverageRate,
		snapshot.ReportedVoters,
		snapshot.BlankOrInvalidVotes,
		snapshot.LeaderVotes,
		snapshot.RiskScore,
	)
	sum := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(sum[:])
}

func (r *pvRepo) GetPublicProofs(ctx context.Context, electionID string) ([]entity.PublicPVProof, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()

	rows, err := r.db.QueryContext(queryCtx, `
		SELECT ps.id, ps.election_id, ps.polling_station_id,
		       COALESCE(st.code, ''), COALESCE(st.name, ''), COALESCE(st.region_id::text, ''),
		       ps.status, ps.registered_voters, ps.voters_count, ps.null_votes,
		       ps.blank_votes, ps.disputed_votes, COALESCE(ps.pv_hash, ''),
		       COALESCE(ps.server_payload_hash, ''), COALESCE(ps.integrity_status, ''),
		       COALESCE(ps.integrity_errors, '[]'::jsonb),
		       ps.submitted_at, ps.updated_at
		FROM pv_submissions ps
		LEFT JOIN polling_stations st ON st.id = ps.polling_station_id
		WHERE ps.election_id = $1
		  AND ps.status IN ('submitted', 'verified', 'disputed', 'rejected', 'needs_clarification')
		ORDER BY st.code, ps.submitted_at DESC`, electionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	proofs := []entity.PublicPVProof{}
	for rows.Next() {
		var proof entity.PublicPVProof
		var pv entity.PVSubmission
		var integrityErrors []byte
		if err := rows.Scan(
			&proof.ID, &proof.ElectionID, &proof.PollingStationID,
			&proof.PollingStationCode, &proof.PollingStationName, &proof.PollingStationRegion,
			&proof.Status, &pv.RegisteredVoters, &pv.VotersCount, &pv.NullVotes,
			&pv.BlankVotes, &pv.DisputedVotes, &proof.PVHash,
			&proof.ServerPayloadHash, &proof.IntegrityStatus, &integrityErrors,
			&proof.SubmittedAt, &proof.UpdatedAt,
		); err != nil {
			return nil, err
		}
		pv.ID = proof.ID
		pv.ElectionID = proof.ElectionID
		pv.PollingStationID = proof.PollingStationID
		pv.Status = proof.Status
		pv.PVHash = proof.PVHash
		pv.ServerPayloadHash = proof.ServerPayloadHash
		pv.IntegrityStatus = proof.IntegrityStatus
		pv.IntegrityErrors = decodeIntegrityErrors(integrityErrors)
		results, err := r.getResults(queryCtx, proof.ID)
		if err != nil {
			return nil, err
		}
		proof.Anomalies = r.detectAnomalies(queryCtx, &pv, results)
		if proof.Anomalies == nil {
			proof.Anomalies = []entity.PVAnomaly{}
		}
		proofs = append(proofs, proof)
	}
	return proofs, rows.Err()
}

func (r *pvRepo) getResults(ctx context.Context, pvID string) ([]entity.PVResult, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT pr.id, pr.pv_submission_id, pr.candidate_id, pr.votes, pr.created_at,
		       c.name, COALESCE(c.party, '')
		FROM pv_results pr
		JOIN candidates c ON c.id = pr.candidate_id
		WHERE pr.pv_submission_id = $1
		ORDER BY c.ballot_number NULLS LAST, c.name
	`, pvID)
	if err != nil {
		return nil, fmt.Errorf("list pv results: %w", err)
	}
	defer rows.Close()

	var results []entity.PVResult
	for rows.Next() {
		var result entity.PVResult
		if err := rows.Scan(
			&result.ID, &result.PVSubmissionID, &result.CandidateID,
			&result.Votes, &result.CreatedAt, &result.CandidateName, &result.Party,
		); err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, rows.Err()
}

func (r *pvRepo) detectAnomalies(ctx context.Context, pv *entity.PVSubmission, results []entity.PVResult) []entity.PVAnomaly {
	var duplicateCount int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM pv_submissions
		WHERE election_id = $1 AND polling_station_id = $2`,
		pv.ElectionID, pv.PollingStationID,
	).Scan(&duplicateCount)
	if err != nil {
		duplicateCount = 0
	}

	return buildPVAnomalies(pv, results, duplicateCount)
}

func buildPVAnomalies(pv *entity.PVSubmission, results []entity.PVResult, duplicateCount int) []entity.PVAnomaly {
	anomalies := []entity.PVAnomaly{}
	for _, integrityError := range pv.IntegrityErrors {
		anomalies = append(anomalies, entity.PVAnomaly{
			Code:     "integrity_" + integrityError,
			Severity: integritySeverity(integrityError),
			Message:  integrityMessage(integrityError),
		})
	}
	if pv.RegisteredVoters > 0 && pv.VotersCount > pv.RegisteredVoters {
		anomalies = append(anomalies, entity.PVAnomaly{
			Code:     "voters_above_registered",
			Severity: "high",
			Message:  "Le nombre de votants dépasse le nombre d'inscrits.",
		})
	}

	totalResults := 0
	for _, result := range results {
		totalResults += result.Votes
	}
	if totalResults+pv.BlankVotes+pv.NullVotes+pv.DisputedVotes != pv.VotersCount {
		anomalies = append(anomalies, entity.PVAnomaly{
			Code:     "vote_totals_mismatch",
			Severity: "high",
			Message:  "La somme candidats + blancs + nuls + contestés ne correspond pas aux votants.",
		})
	}

	if pv.RegisteredVoters > 0 && float64(pv.VotersCount)/float64(pv.RegisteredVoters) > 0.95 {
		anomalies = append(anomalies, entity.PVAnomaly{
			Code:     "high_turnout",
			Severity: "medium",
			Message:  "Le taux de participation dépasse 95%.",
		})
	}

	if duplicateCount > 1 {
		anomalies = append(anomalies, entity.PVAnomaly{
			Code:     "duplicate_polling_station_pv",
			Severity: "medium",
			Message:  "Plusieurs PV existent pour le même bureau de vote.",
		})
	}
	return anomalies
}

func decodeIntegrityErrors(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var errors []string
	if err := json.Unmarshal(raw, &errors); err != nil {
		return []string{"integrity_errors_unreadable"}
	}
	return errors
}

func integritySeverity(code string) string {
	switch code {
	case "payload_hash_mismatch", "invalid_signature", "unregistered_device":
		return "critical"
	case "missing_payload_hash", "missing_photo_hash", "missing_photo_url", "missing_device_id":
		return "high"
	case "missing_signature", "missing_client_recorded_at":
		return "medium"
	default:
		return "low"
	}
}

func integrityMessage(code string) string {
	switch code {
	case "payload_hash_mismatch":
		return "L'empreinte recalculée par le serveur ne correspond pas à l'empreinte transmise."
	case "missing_payload_hash":
		return "Le PV n'a pas transmis d'empreinte canonique locale."
	case "missing_photo_hash":
		return "La preuve photo du PV n'a pas d'empreinte locale."
	case "missing_photo_url":
		return "La preuve photo du PV est hashée mais le fichier n'est pas lié au stockage."
	case "missing_signature":
		return "Le PV n'a pas encore de signature cryptographique vérifiable."
	case "missing_device_id":
		return "La signature est présente mais l'identifiant appareil est absent."
	case "unregistered_device":
		return "La signature provient d'un appareil non enrôlé pour cet observateur."
	case "invalid_signature":
		return "La signature cryptographique du PV est invalide."
	case "device_key_registry_unavailable":
		return "Le registre des clés appareil est indisponible."
	case "device_key_lookup_failed":
		return "La clé publique appareil n'a pas pu être vérifiée."
	case "invalid_registered_public_key":
		return "La clé publique enregistrée pour l'appareil est invalide."
	case "unsupported_signature_algorithm":
		return "L'algorithme de signature appareil n'est pas supporté."
	case "missing_client_recorded_at":
		return "L'horodatage local de capture du PV est absent."
	default:
		return "Contrôle d'intégrité PV à examiner."
	}
}
