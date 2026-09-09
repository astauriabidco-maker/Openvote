package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

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
			&s.H3Index, &s.SourceName, &s.CreatedAt, &s.UpdatedAt,
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
			&s.H3Index, &s.SourceName, &s.CreatedAt, &s.UpdatedAt,
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
			registered_voters, location_name, gps_location, h3_index, source_name
		)
		VALUES (
			$1, $2, $3, NULLIF($4, '')::uuid, NULLIF($5, '')::uuid, NULLIF($6, '')::uuid,
			$7, $8, CASE WHEN $9 = '' THEN NULL ELSE ST_GeomFromText($9, 4326) END, $10, $11
		)
		RETURNING id, created_at, updated_at`
	return r.db.QueryRowContext(
		queryCtx,
		query,
		station.ElectionID, station.Code, station.Name, station.RegionID, station.DepartmentID,
		station.ArrondissementID, station.RegisteredVoters, station.LocationName,
		station.GPSLocation, station.H3Index, station.SourceName,
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
	summary.Regions = regions
	summary.Observers = observers
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

	err = tx.Commit()
	return err
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
	return r.GetByID(ctx, id)
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
