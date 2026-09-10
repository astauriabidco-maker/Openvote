package entity

import (
	"time"
)

// Définition des types ENUM pour garantir la sécurité du typage
type UserRole string
type ReportStatus string

const (
	RoleSuperAdmin      UserRole = "super_admin"
	RoleRegionAdmin     UserRole = "region_admin"
	RoleLocalCoord      UserRole = "local_coord"
	RoleObserver        UserRole = "observer"
	RoleCitizen         UserRole = "citizen"
	RoleVerifiedCitizen UserRole = "verified_citizen"
)

const (
	StatusPending  ReportStatus = "pending"
	StatusVerified ReportStatus = "verified"
	StatusRejected ReportStatus = "rejected"
)

// User définit l'utilisateur du système (Observateur, Admin, etc.)
type User struct {
	ID           string     `json:"id" db:"id" gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	Username     string     `json:"username" db:"username" gorm:"unique;not null"`
	Role         UserRole   `json:"role" db:"role" gorm:"type:user_role;not null"`
	PasswordHash string     `json:"-" db:"password_hash" gorm:"not null"` // Le hash ne doit jamais sortir en JSON
	RegionID     string     `json:"region_id" db:"region_id"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at" db:"updated_at"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty" db:"last_login_at"`

	// ---- H3 audit : MFA TOTP + lockout (migration 015) ----
	// MFASecret est en base32 (20 chars pour 160 bits). NULL = MFA désactivé.
	MFASecret *string `json:"-" db:"mfa_secret"` // Jamais sérialisé
	// MFABackupCodes est un JSONB : [{"hash": "...", "used": false, "used_at": null}, ...]
	MFABackupCodes []byte `json:"-" db:"mfa_backup_codes"`
	// FailedLoginAttempts : compteur incrémenté à chaque échec, reset au succès.
	FailedLoginAttempts int `json:"-" db:"failed_login_attempts"`
	// LockedUntil : timestamp de fin de lockout (NULL = pas verrouillé).
	LockedUntil *time.Time `json:"-" db:"locked_until"`
}

// IsLocked retourne true si le compte est actuellement verrouillé.
// Un compte verrouillé a locked_until > now().
func (u *User) IsLocked() bool {
	return u.LockedUntil != nil && u.LockedUntil.After(time.Now())
}

// HasMFA retourne true si la MFA est activée pour cet utilisateur.
func (u *User) HasMFA() bool {
	return u.MFASecret != nil && *u.MFASecret != ""
}

// Report représente un signalement d'incident sur le terrain
type Report struct {
	ID           string `json:"id" db:"id" gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ObserverID   string `json:"observer_id" db:"observer_id" gorm:"type:uuid;not null"`
	IncidentType string `json:"incident_type" db:"incident_type" gorm:"not null"`
	Description  string `json:"description" db:"description"`
	// GPSLocation est souvent géré comme string ou struct spécifique selon le driver PostGIS
	// Ici on le garde simple pour l'exemple, mais en prod on utiliserait un type Geometry dédié
	GPSLocation string       `json:"gps_location" db:"gps_location" gorm:"type:geometry(Point,4326)"`
	H3Index     string       `json:"h3_index" db:"h3_index" gorm:"index"`
	Status      ReportStatus `json:"status" db:"status" gorm:"type:report_status;default:'pending'"`
	ProofURL    string       `json:"proof_url" db:"proof_url"`
	CreatedAt   time.Time    `json:"created_at" db:"created_at"`

	// Fields populated via Joins
	AuthorRole UserRole `json:"author_role" db:"author_role" gorm:"-"`
}

// TableName surcharge pour GORM (optionnel mais recommandé)
func (User) TableName() string {
	return "users"
}

func (Report) TableName() string {
	return "reports"
}

// Region représente une région administrative (ex: Centre, Littoral, etc.)
type Region struct {
	ID        string    `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Code      string    `json:"code" db:"code"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

func (Region) TableName() string {
	return "regions"
}

// Department représente un département au sein d'une région
type Department struct {
	ID               string    `json:"id" db:"id"`
	Name             string    `json:"name" db:"name"`
	Code             string    `json:"code" db:"code"`
	RegionID         string    `json:"region_id" db:"region_id"`
	Population       int       `json:"population" db:"population"`
	RegisteredVoters int       `json:"registered_voters" db:"registered_voters"`
	DataSource       string    `json:"data_source" db:"data_source"`
	DataConfidence   string    `json:"data_confidence" db:"data_confidence"`
	DataYear         int       `json:"data_year" db:"data_year"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
}

func (Department) TableName() string {
	return "departments"
}

// Arrondissement représente un arrondissement au sein d'un département
type Arrondissement struct {
	ID               string    `json:"id" db:"id"`
	Name             string    `json:"name" db:"name"`
	Code             string    `json:"code" db:"code"`
	DepartmentID     string    `json:"department_id" db:"department_id"`
	Population       int       `json:"population" db:"population"`
	RegisteredVoters int       `json:"registered_voters" db:"registered_voters"`
	IsChefLieu       bool      `json:"is_chef_lieu" db:"is_chef_lieu"`
	DataSource       string    `json:"data_source" db:"data_source"`
	DataConfidence   string    `json:"data_confidence" db:"data_confidence"`
	DataYear         int       `json:"data_year" db:"data_year"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
}

func (Arrondissement) TableName() string {
	return "arrondissements"
}

// DataImport trace l'historique des importations de données
type DataImport struct {
	ID             string    `json:"id" db:"id"`
	ImportType     string    `json:"import_type" db:"import_type"`
	SourceName     string    `json:"source_name" db:"source_name"`
	FileName       string    `json:"file_name" db:"file_name"`
	RecordsUpdated int       `json:"records_updated" db:"records_updated"`
	RecordsFailed  int       `json:"records_failed" db:"records_failed"`
	ImportedBy     string    `json:"imported_by" db:"imported_by"`
	Notes          string    `json:"notes" db:"notes"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

// DepartmentDemographicsSnapshot est un point dans la série temporelle
// d'évolution démographique d'un département. Alimenté par le trigger
// SQL log_department_demographics_change (migration 016) à chaque
// UPDATE de population/registered_voters.
type DepartmentDemographicsSnapshot struct {
	ID               string    `json:"id" db:"id"`
	DepartmentID     string    `json:"department_id" db:"department_id"`
	Year             int       `json:"year" db:"year"`
	Population       int       `json:"population" db:"population"`
	RegisteredVoters int       `json:"registered_voters" db:"registered_voters"`
	DataSource       string    `json:"data_source" db:"data_source"`
	DataConfidence   string    `json:"data_confidence" db:"data_confidence"`
	SourceImportID   *string   `json:"source_import_id,omitempty" db:"source_import_id"`
	RecordedAt       time.Time `json:"recorded_at" db:"recorded_at"`
}

// ElectionStatus définit l'état d'un scrutin
type ElectionStatus string

const (
	ElectionPlanned  ElectionStatus = "planned"
	ElectionActive   ElectionStatus = "active"
	ElectionClosed   ElectionStatus = "closed"
	ElectionArchived ElectionStatus = "archived"
)

// Election représente un scrutin/élection
type Election struct {
	ID          string         `json:"id" db:"id"`
	Name        string         `json:"name" db:"name"`
	Type        string         `json:"type" db:"type"` // présidentielle, législative, municipale, référendum
	Status      ElectionStatus `json:"status" db:"status"`
	Date        time.Time      `json:"date" db:"date"`
	Description string         `json:"description" db:"description"`
	RegionIDs   string         `json:"region_ids" db:"region_ids"` // JSON array of region IDs (ou "all")
	CreatedAt   time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at" db:"updated_at"`
}

func (Election) TableName() string {
	return "elections"
}

// HistoricalElectionResult représente une statistique officielle passée
// extraite d'un rapport ELECAM archivé.
type HistoricalElectionResult struct {
	ID                  string    `json:"id" db:"id"`
	ElectionID          string    `json:"election_id" db:"election_id"`
	ElectionName        string    `json:"election_name" db:"election_name"`
	ElectionType        string    `json:"election_type" db:"election_type"`
	ElectionDate        time.Time `json:"election_date" db:"election_date"`
	SourceDocumentID    string    `json:"source_document_id" db:"source_document_id"`
	SourceDocumentSlug  string    `json:"source_document_slug" db:"source_document_slug"`
	ElectionYear        int       `json:"election_year" db:"election_year"`
	ContestType         string    `json:"contest_type" db:"contest_type"`
	ResultLevel         string    `json:"result_level" db:"result_level"`
	RegionName          string    `json:"region_name" db:"region_name"`
	DepartmentName      string    `json:"department_name" db:"department_name"`
	CommuneName         string    `json:"commune_name" db:"commune_name"`
	ActorType           string    `json:"actor_type" db:"actor_type"`
	ActorName           string    `json:"actor_name" db:"actor_name"`
	Party               string    `json:"party" db:"party"`
	MetricType          string    `json:"metric_type" db:"metric_type"`
	RegisteredVoters    *int      `json:"registered_voters,omitempty" db:"registered_voters"`
	ActualVoters        *int      `json:"actual_voters,omitempty" db:"actual_voters"`
	ValidVotes          *int      `json:"valid_votes,omitempty" db:"valid_votes"`
	BlankOrInvalidVotes *int      `json:"blank_or_invalid_votes,omitempty" db:"blank_or_invalid_votes"`
	Abstentions         *int      `json:"abstentions,omitempty" db:"abstentions"`
	PollingStations     *int      `json:"polling_stations,omitempty" db:"polling_stations"`
	Councils            *int      `json:"councils,omitempty" db:"councils"`
	ListsPresented      *int      `json:"lists_presented,omitempty" db:"lists_presented"`
	Votes               *int      `json:"votes,omitempty" db:"votes"`
	Percentage          *float64  `json:"percentage,omitempty" db:"percentage"`
	Seats               *int      `json:"seats,omitempty" db:"seats"`
	WomenSeats          *int      `json:"women_seats,omitempty" db:"women_seats"`
	CouncilsControlled  *int      `json:"councils_controlled,omitempty" db:"councils_controlled"`
	SourceLineStart     *int      `json:"source_line_start,omitempty" db:"source_line_start"`
	SourceLineEnd       *int      `json:"source_line_end,omitempty" db:"source_line_end"`
	Confidence          string    `json:"confidence" db:"confidence"`
	Status              string    `json:"status" db:"status"`
	Notes               string    `json:"notes" db:"notes"`
	CreatedAt           time.Time `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time `json:"updated_at" db:"updated_at"`
}

func (HistoricalElectionResult) TableName() string {
	return "historical_election_results"
}

// PVStatus définit l'état d'un procès-verbal terrain.
type PVStatus string

const (
	PVStatusDraft              PVStatus = "draft"
	PVStatusSubmitted          PVStatus = "submitted"
	PVStatusVerified           PVStatus = "verified"
	PVStatusDisputed           PVStatus = "disputed"
	PVStatusRejected           PVStatus = "rejected"
	PVStatusNeedsClarification PVStatus = "needs_clarification"
)

// PollingStation représente un bureau de vote rattaché à un scrutin.
type PollingStation struct {
	ID                 string    `json:"id" db:"id"`
	ElectionID         string    `json:"election_id" db:"election_id"`
	Code               string    `json:"code" db:"code"`
	Name               string    `json:"name" db:"name"`
	RegionID           string    `json:"region_id" db:"region_id"`
	DepartmentID       string    `json:"department_id" db:"department_id"`
	ArrondissementID   string    `json:"arrondissement_id" db:"arrondissement_id"`
	RegisteredVoters   int       `json:"registered_voters" db:"registered_voters"`
	LocationName       string    `json:"location_name" db:"location_name"`
	GPSLocation        string    `json:"gps_location" db:"gps_location"`
	H3Index            string    `json:"h3_index" db:"h3_index"`
	SourceName         string    `json:"source_name" db:"source_name"`
	SourceDocumentID   string    `json:"source_document_id" db:"source_document_id"`
	SourceDocumentSlug string    `json:"source_document_slug" db:"source_document_slug"`
	SourceSHA256       string    `json:"source_sha256" db:"source_sha256"`
	SourcePosition     *int      `json:"source_position,omitempty" db:"source_position"`
	SourceConfidence   string    `json:"source_confidence" db:"source_confidence"`
	CreatedAt          time.Time `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time `json:"updated_at" db:"updated_at"`
}

func (PollingStation) TableName() string {
	return "polling_stations"
}

// PollingStationAssignment lie un observateur à un bureau de vote précis.
type PollingStationAssignment struct {
	ID               string    `json:"id" db:"id"`
	ElectionID       string    `json:"election_id" db:"election_id"`
	PollingStationID string    `json:"polling_station_id" db:"polling_station_id"`
	ObserverID       string    `json:"observer_id" db:"observer_id"`
	AssignedBy       string    `json:"assigned_by" db:"assigned_by"`
	Notes            string    `json:"notes" db:"notes"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time `json:"updated_at" db:"updated_at"`
}

func (PollingStationAssignment) TableName() string {
	return "polling_station_assignments"
}

// Candidate représente un candidat ou une liste en compétition.
type Candidate struct {
	ID           string    `json:"id" db:"id"`
	ElectionID   string    `json:"election_id" db:"election_id"`
	Name         string    `json:"name" db:"name"`
	Party        string    `json:"party" db:"party"`
	BallotNumber *int      `json:"ballot_number,omitempty" db:"ballot_number"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

func (Candidate) TableName() string {
	return "candidates"
}

// PVResult représente le score d'un candidat dans un PV.
type PVResult struct {
	ID             string    `json:"id" db:"id"`
	PVSubmissionID string    `json:"pv_submission_id" db:"pv_submission_id"`
	CandidateID    string    `json:"candidate_id" db:"candidate_id"`
	Votes          int       `json:"votes" db:"votes"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`

	CandidateName string `json:"candidate_name,omitempty" db:"candidate_name"`
	Party         string `json:"party,omitempty" db:"party"`
}

func (PVResult) TableName() string {
	return "pv_results"
}

// PVSubmission représente un procès-verbal remonté depuis le terrain.
type PVSubmission struct {
	ID                   string      `json:"id" db:"id"`
	ElectionID           string      `json:"election_id" db:"election_id"`
	PollingStationID     string      `json:"polling_station_id" db:"polling_station_id"`
	ObserverID           string      `json:"observer_id" db:"observer_id"`
	Status               PVStatus    `json:"status" db:"status"`
	RegisteredVoters     int         `json:"registered_voters" db:"registered_voters"`
	VotersCount          int         `json:"voters_count" db:"voters_count"`
	NullVotes            int         `json:"null_votes" db:"null_votes"`
	BlankVotes           int         `json:"blank_votes" db:"blank_votes"`
	DisputedVotes        int         `json:"disputed_votes" db:"disputed_votes"`
	PVPhotoURL           string      `json:"pv_photo_url" db:"pv_photo_url"`
	PVHash               string      `json:"pv_hash" db:"pv_hash"`
	SignedPayloadHash    string      `json:"signed_payload_hash" db:"signed_payload_hash"`
	Signature            string      `json:"signature" db:"signature"`
	ProofManifestVersion int         `json:"proof_manifest_version" db:"proof_manifest_version"`
	ClientRecordedAt     string      `json:"client_recorded_at,omitempty" db:"client_recorded_at"`
	DeviceLatitude       float64     `json:"device_latitude,omitempty" db:"device_latitude"`
	DeviceLongitude      float64     `json:"device_longitude,omitempty" db:"device_longitude"`
	DeviceID             string      `json:"device_id,omitempty" db:"device_id"`
	ServerPayloadHash    string      `json:"server_payload_hash,omitempty" db:"server_payload_hash"`
	IntegrityStatus      string      `json:"integrity_status,omitempty" db:"integrity_status"`
	IntegrityErrors      []string    `json:"integrity_errors,omitempty" db:"-"`
	CanonicalPayload     string      `json:"canonical_payload,omitempty" db:"canonical_payload"`
	Notes                string      `json:"notes" db:"notes"`
	VerificationComment  string      `json:"verification_comment,omitempty" db:"verification_comment"`
	VerifiedBy           string      `json:"verified_by,omitempty" db:"verified_by"`
	VerifiedAt           *time.Time  `json:"verified_at,omitempty" db:"verified_at"`
	SubmittedAt          time.Time   `json:"submitted_at" db:"submitted_at"`
	CreatedAt            time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time   `json:"updated_at" db:"updated_at"`
	Results              []PVResult  `json:"results,omitempty" db:"-"`
	Anomalies            []PVAnomaly `json:"anomalies,omitempty" db:"-"`
}

func (PVSubmission) TableName() string {
	return "pv_submissions"
}

// PVAuditEvent trace une transition ou preuve critique liée à un PV.
type PVAuditEvent struct {
	ID                string    `json:"id" db:"id"`
	PVSubmissionID    string    `json:"pv_submission_id" db:"pv_submission_id"`
	ElectionID        string    `json:"election_id" db:"election_id"`
	PollingStationID  string    `json:"polling_station_id" db:"polling_station_id"`
	ActorID           string    `json:"actor_id,omitempty" db:"actor_id"`
	ActorRole         UserRole  `json:"actor_role,omitempty" db:"actor_role"`
	EventType         string    `json:"event_type" db:"event_type"`
	FromStatus        PVStatus  `json:"from_status,omitempty" db:"from_status"`
	ToStatus          PVStatus  `json:"to_status,omitempty" db:"to_status"`
	IntegrityStatus   string    `json:"integrity_status,omitempty" db:"integrity_status"`
	ServerPayloadHash string    `json:"server_payload_hash,omitempty" db:"server_payload_hash"`
	Comment           string    `json:"comment" db:"comment"`
	Metadata          string    `json:"metadata,omitempty" db:"metadata"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
}

func (PVAuditEvent) TableName() string {
	return "pv_audit_events"
}

// ObserverDeviceKey représente une clé publique d'appareil enrôlé.
type ObserverDeviceKey struct {
	ID           string    `json:"id" db:"id"`
	UserID       string    `json:"user_id" db:"user_id"`
	DeviceID     string    `json:"device_id" db:"device_id"`
	Algorithm    string    `json:"algorithm" db:"algorithm"`
	PublicKeyJWK string    `json:"public_key_jwk" db:"public_key_jwk"`
	Active       bool      `json:"active" db:"active"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// PVAnomaly décrit une incohérence calculée sur un PV.
type PVAnomaly struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
}

// CandidateResultSummary agrège les voix confirmées par candidat.
type CandidateResultSummary struct {
	CandidateID   string `json:"candidate_id" db:"candidate_id"`
	CandidateName string `json:"candidate_name" db:"candidate_name"`
	Party         string `json:"party" db:"party"`
	TotalVotes    int    `json:"total_votes" db:"total_votes"`
	PVCount       int    `json:"pv_count" db:"pv_count"`
}

// ElectionResultSummary donne une vue rapide du comptage parallèle.
type ElectionResultSummary struct {
	ElectionID         string                   `json:"election_id"`
	TotalStations      int                      `json:"total_stations"`
	SubmittedPV        int                      `json:"submitted_pv"`
	CoverageRate       float64                  `json:"coverage_rate"`
	TotalVoters        int                      `json:"total_voters"`
	TotalCandidateVote int                      `json:"total_candidate_votes"`
	Results            []CandidateResultSummary `json:"results"`
}

// RegionPVSummary agrège le comptage parallèle par région.
type RegionPVSummary struct {
	ElectionID          string  `json:"election_id" db:"election_id"`
	RegionID            string  `json:"region_id" db:"region_id"`
	RegionName          string  `json:"region_name" db:"region_name"`
	TotalStations       int     `json:"total_stations" db:"total_stations"`
	SubmittedPV         int     `json:"submitted_pv" db:"submitted_pv"`
	CoverageRate        float64 `json:"coverage_rate" db:"coverage_rate"`
	RegisteredVoters    int     `json:"registered_voters" db:"registered_voters"`
	ReportedVoters      int     `json:"reported_voters" db:"reported_voters"`
	BlankOrInvalidVotes int     `json:"blank_or_invalid_votes" db:"blank_or_invalid_votes"`
	TotalCandidateVotes int     `json:"total_candidate_votes" db:"total_candidate_votes"`
	LeaderCandidateID   string  `json:"leader_candidate_id" db:"leader_candidate_id"`
	LeaderName          string  `json:"leader_name" db:"leader_name"`
	LeaderParty         string  `json:"leader_party" db:"leader_party"`
	LeaderVotes         int     `json:"leader_votes" db:"leader_votes"`
}

// RegionalRiskRule décrit une règle ayant contribué au score régional.
type RegionalRiskRule struct {
	Code     string  `json:"code"`
	Label    string  `json:"label"`
	Severity string  `json:"severity"`
	Weight   int     `json:"weight"`
	Value    float64 `json:"value,omitempty"`
}

// RegionalRiskSnapshot journalise un calcul de risque régional.
type RegionalRiskSnapshot struct {
	ID                          string             `json:"id" db:"id"`
	ElectionID                  string             `json:"election_id" db:"election_id"`
	RegionID                    string             `json:"region_id" db:"region_id"`
	RegionName                  string             `json:"region_name" db:"region_name"`
	NormalizedRegionName        string             `json:"normalized_region_name" db:"normalized_region_name"`
	ReferenceElectionID         string             `json:"reference_election_id" db:"reference_election_id"`
	ReferenceElectionYear       *int               `json:"reference_election_year,omitempty" db:"reference_election_year"`
	ReferenceContestType        string             `json:"reference_contest_type" db:"reference_contest_type"`
	ReferenceSourceDocumentSlug string             `json:"reference_source_document_slug" db:"reference_source_document_slug"`
	TotalStations               int                `json:"total_stations" db:"total_stations"`
	SubmittedPV                 int                `json:"submitted_pv" db:"submitted_pv"`
	CoverageRate                float64            `json:"coverage_rate" db:"coverage_rate"`
	RegisteredVoters            int                `json:"registered_voters" db:"registered_voters"`
	ReportedVoters              int                `json:"reported_voters" db:"reported_voters"`
	BlankOrInvalidVotes         int                `json:"blank_or_invalid_votes" db:"blank_or_invalid_votes"`
	TurnoutRate                 *float64           `json:"turnout_rate,omitempty" db:"turnout_rate"`
	ReferenceTurnoutRate        *float64           `json:"reference_turnout_rate,omitempty" db:"reference_turnout_rate"`
	TurnoutGapPoints            *float64           `json:"turnout_gap_points,omitempty" db:"turnout_gap_points"`
	InvalidRate                 *float64           `json:"invalid_rate,omitempty" db:"invalid_rate"`
	ReferenceInvalidRate        *float64           `json:"reference_invalid_rate,omitempty" db:"reference_invalid_rate"`
	InvalidGapPoints            *float64           `json:"invalid_gap_points,omitempty" db:"invalid_gap_points"`
	LeaderCandidateID           string             `json:"leader_candidate_id" db:"leader_candidate_id"`
	LeaderName                  string             `json:"leader_name" db:"leader_name"`
	LeaderParty                 string             `json:"leader_party" db:"leader_party"`
	LeaderVotes                 int                `json:"leader_votes" db:"leader_votes"`
	RiskScore                   int                `json:"risk_score" db:"risk_score"`
	RiskStatus                  string             `json:"risk_status" db:"risk_status"`
	Rules                       []RegionalRiskRule `json:"rules" db:"rules"`
	Evidence                    []string           `json:"evidence" db:"evidence"`
	SnapshotHash                string             `json:"snapshot_hash" db:"snapshot_hash"`
	CreatedAt                   time.Time          `json:"created_at" db:"created_at"`
}

// FieldCoverageRegion synthétise la couverture opérationnelle d'une région.
type FieldCoverageRegion struct {
	RegionID         string  `json:"region_id" db:"region_id"`
	RegionName       string  `json:"region_name" db:"region_name"`
	TotalStations    int     `json:"total_stations" db:"total_stations"`
	AssignedStations int     `json:"assigned_stations" db:"assigned_stations"`
	SubmittedPV      int     `json:"submitted_pv" db:"submitted_pv"`
	ObserverCount    int     `json:"observer_count" db:"observer_count"`
	CoverageRate     float64 `json:"coverage_rate" db:"coverage_rate"`
}

// FieldCoverageObserver synthétise la couverture par observateur.
type FieldCoverageObserver struct {
	ObserverID       string  `json:"observer_id" db:"observer_id"`
	ObserverName     string  `json:"observer_name" db:"observer_name"`
	RegionID         string  `json:"region_id" db:"region_id"`
	AssignedStations int     `json:"assigned_stations" db:"assigned_stations"`
	SubmittedPV      int     `json:"submitted_pv" db:"submitted_pv"`
	CompletionRate   float64 `json:"completion_rate" db:"completion_rate"`
}

// FieldCoverageZone identifie une zone silencieuse ou prioritaire.
type FieldCoverageZone struct {
	ZoneType           string  `json:"zone_type" db:"zone_type"`
	RegionID           string  `json:"region_id" db:"region_id"`
	RegionName         string  `json:"region_name" db:"region_name"`
	DepartmentID       string  `json:"department_id" db:"department_id"`
	DepartmentName     string  `json:"department_name" db:"department_name"`
	ArrondissementID   string  `json:"arrondissement_id" db:"arrondissement_id"`
	ArrondissementName string  `json:"arrondissement_name" db:"arrondissement_name"`
	TotalStations      int     `json:"total_stations" db:"total_stations"`
	AssignedStations   int     `json:"assigned_stations" db:"assigned_stations"`
	UnassignedStations int     `json:"unassigned_stations" db:"unassigned_stations"`
	SubmittedPV        int     `json:"submitted_pv" db:"submitted_pv"`
	MissingPV          int     `json:"missing_pv" db:"missing_pv"`
	ObserverCount      int     `json:"observer_count" db:"observer_count"`
	AssignmentRate     float64 `json:"assignment_rate" db:"assignment_rate"`
	CoverageRate       float64 `json:"coverage_rate" db:"coverage_rate"`
	PriorityScore      float64 `json:"priority_score" db:"priority_score"`
	PriorityLabel      string  `json:"priority_label" db:"priority_label"`
	Silent             bool    `json:"silent" db:"silent"`
}

// FieldCoverageSummary regroupe la couverture terrain d'un scrutin.
type FieldCoverageSummary struct {
	ElectionID         string                  `json:"election_id"`
	TotalStations      int                     `json:"total_stations"`
	AssignedStations   int                     `json:"assigned_stations"`
	UnassignedStations int                     `json:"unassigned_stations"`
	SubmittedPV        int                     `json:"submitted_pv"`
	ObserverCount      int                     `json:"observer_count"`
	SilentZoneCount    int                     `json:"silent_zone_count"`
	CriticalZoneCount  int                     `json:"critical_zone_count"`
	CoverageRate       float64                 `json:"coverage_rate"`
	Regions            []FieldCoverageRegion   `json:"regions"`
	Observers          []FieldCoverageObserver `json:"observers"`
	SilentZones        []FieldCoverageZone     `json:"silent_zones"`
	PriorityZones      []FieldCoverageZone     `json:"priority_zones"`
}

// PublicPVProof expose une preuve vérifiable sans identité observateur.
type PublicPVProof struct {
	ID                   string      `json:"id" db:"id"`
	ElectionID           string      `json:"election_id" db:"election_id"`
	PollingStationID     string      `json:"polling_station_id" db:"polling_station_id"`
	PollingStationCode   string      `json:"polling_station_code" db:"polling_station_code"`
	PollingStationName   string      `json:"polling_station_name" db:"polling_station_name"`
	PollingStationRegion string      `json:"polling_station_region,omitempty" db:"polling_station_region"`
	Status               PVStatus    `json:"status" db:"status"`
	PVHash               string      `json:"pv_hash" db:"pv_hash"`
	ServerPayloadHash    string      `json:"server_payload_hash" db:"server_payload_hash"`
	IntegrityStatus      string      `json:"integrity_status" db:"integrity_status"`
	Anomalies            []PVAnomaly `json:"anomalies" db:"-"`
	SubmittedAt          time.Time   `json:"submitted_at" db:"submitted_at"`
	UpdatedAt            time.Time   `json:"updated_at" db:"updated_at"`
}

// PublicPVProofExport est le lot public signé par le backend.
type PublicPVProofExport struct {
	ProofManifestVersion int             `json:"proof_manifest_version"`
	ElectionID           string          `json:"election_id"`
	GeneratedAt          string          `json:"generated_at"`
	Total                int             `json:"total"`
	PVProofs             []PublicPVProof `json:"pv_proofs"`
}

// PublicPVExportProof signe l'empreinte canonique du lot public.
type PublicPVExportProof struct {
	Algorithm       string `json:"algorithm"`
	ExportHash      string `json:"export_hash"`
	Signature       string `json:"signature"`
	PublicKey       string `json:"public_key"`
	CanonicalExport string `json:"canonical_export,omitempty"`
}

// AuditLog représente une entrée dans le journal d'audit persistent
type AuditLog struct {
	ID        string    `json:"id" db:"id"`
	AdminID   string    `json:"admin_id" db:"admin_id"`
	AdminName string    `json:"admin_name" db:"admin_name"`
	Action    string    `json:"action" db:"action"`
	TargetID  string    `json:"target_id" db:"target_id"`
	Details   string    `json:"details" db:"details"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

// IncidentType représente un type d'incident prédéfini
type IncidentType struct {
	ID          string    `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Code        string    `json:"code" db:"code"`
	Description string    `json:"description" db:"description"`
	Severity    int       `json:"severity" db:"severity"` // 1-5
	Color       string    `json:"color" db:"color"`       // Hex color pour le frontend
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

func (IncidentType) TableName() string {
	return "incident_types"
}

// LegalDocument représente un recueil de lois ou règles
type LegalDocument struct {
	ID            string    `json:"id" db:"id"`
	Title         string    `json:"title" db:"title"`
	Description   string    `json:"description" db:"description"`
	Type          string    `json:"doc_type" db:"doc_type"`
	Version       string    `json:"version" db:"version"`
	FullText      string    `json:"full_text" db:"full_text"`
	FilePath      string    `json:"file_path" db:"file_path"`
	PublishedDate time.Time `json:"published_date" db:"published_date"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

func (LegalDocument) TableName() string {
	return "legal_documents"
}

// SourceDocument représente un document officiel archivé et vérifiable.
type SourceDocument struct {
	ID                string     `json:"id" db:"id"`
	Slug              string     `json:"slug" db:"slug"`
	Title             string     `json:"title" db:"title"`
	Publisher         string     `json:"publisher" db:"publisher"`
	SourceURL         string     `json:"source_url" db:"source_url"`
	DocumentType      string     `json:"document_type" db:"document_type"`
	Language          string     `json:"language" db:"language"`
	PublishedDate     *time.Time `json:"published_date,omitempty" db:"published_date"`
	RetrievedAt       *time.Time `json:"retrieved_at,omitempty" db:"retrieved_at"`
	LocalPath         string     `json:"local_path" db:"local_path"`
	ExtractedTextPath string     `json:"extracted_text_path" db:"extracted_text_path"`
	SHA256Checksum    string     `json:"sha256_checksum" db:"sha256_checksum"`
	MimeType          string     `json:"mime_type" db:"mime_type"`
	FileSizeBytes     int64      `json:"file_size_bytes" db:"file_size_bytes"`
	Granularity       string     `json:"granularity" db:"granularity"`
	ReferenceYear     *int       `json:"reference_year,omitempty" db:"reference_year"`
	Confidence        string     `json:"confidence" db:"confidence"`
	Status            string     `json:"status" db:"status"`
	Notes             string     `json:"notes" db:"notes"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
}

func (SourceDocument) TableName() string {
	return "source_documents"
}

// LegalArticle représente un article au sein d'un document
type LegalArticle struct {
	ID             string    `json:"id" db:"id"`
	DocumentID     string    `json:"document_id" db:"document_id"`
	ArticleNumber  string    `json:"article_number" db:"article_number"`
	Title          string    `json:"title" db:"title"`
	Content        string    `json:"content" db:"content"`
	Category       string    `json:"category" db:"category"`
	Chapter        string    `json:"chapter" db:"chapter"`
	Section        string    `json:"section" db:"section"`
	Keywords       []string  `json:"keywords" db:"keywords"`
	ViolationTypes []string  `json:"violation_types" db:"violation_types"`
	SeverityLevel  int       `json:"severity_level" db:"severity_level"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

func (LegalArticle) TableName() string {
	return "legal_framework"
}

// ReportLegalMatch représente le croisement entre un rapport terrain et un article de loi
type ReportLegalMatch struct {
	ID              string    `json:"id" db:"id"`
	ReportID        string    `json:"report_id" db:"report_id"`
	ArticleID       string    `json:"article_id" db:"article_id"`
	SimilarityScore float64   `json:"similarity_score" db:"similarity_score"`
	MatchType       string    `json:"match_type" db:"match_type"` // 'auto' = IA, 'manual' = humain
	Notes           string    `json:"notes" db:"notes"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	// Champs joints (non persistés)
	ArticleNumber  string `json:"article_number,omitempty" db:"article_number"`
	ArticleTitle   string `json:"article_title,omitempty" db:"article_title"`
	ArticleContent string `json:"article_content,omitempty" db:"article_content"`
}

func (ReportLegalMatch) TableName() string {
	return "report_legal_matches"
}

// LegalAnalysis représente l'analyse juridique d'un rapport générée par le LLM
type LegalAnalysis struct {
	ID             string    `json:"id" db:"id"`
	ReportID       string    `json:"report_id" db:"report_id"`
	Summary        string    `json:"summary" db:"summary"`
	Recommendation string    `json:"recommendation" db:"recommendation"`
	SeverityLevel  int       `json:"severity_level" db:"severity_level"`
	RawResponse    string    `json:"raw_response" db:"raw_response"`
	LLMModel       string    `json:"llm_model" db:"llm_model"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

func (LegalAnalysis) TableName() string {
	return "legal_analyses"
}
