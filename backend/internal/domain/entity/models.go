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
	ID               string    `json:"id" db:"id"`
	ElectionID       string    `json:"election_id" db:"election_id"`
	Code             string    `json:"code" db:"code"`
	Name             string    `json:"name" db:"name"`
	RegionID         string    `json:"region_id" db:"region_id"`
	DepartmentID     string    `json:"department_id" db:"department_id"`
	ArrondissementID string    `json:"arrondissement_id" db:"arrondissement_id"`
	RegisteredVoters int       `json:"registered_voters" db:"registered_voters"`
	LocationName     string    `json:"location_name" db:"location_name"`
	GPSLocation      string    `json:"gps_location" db:"gps_location"`
	H3Index          string    `json:"h3_index" db:"h3_index"`
	SourceName       string    `json:"source_name" db:"source_name"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time `json:"updated_at" db:"updated_at"`
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

// FieldCoverageSummary regroupe la couverture terrain d'un scrutin.
type FieldCoverageSummary struct {
	ElectionID         string                  `json:"election_id"`
	TotalStations      int                     `json:"total_stations"`
	AssignedStations   int                     `json:"assigned_stations"`
	UnassignedStations int                     `json:"unassigned_stations"`
	SubmittedPV        int                     `json:"submitted_pv"`
	ObserverCount      int                     `json:"observer_count"`
	CoverageRate       float64                 `json:"coverage_rate"`
	Regions            []FieldCoverageRegion   `json:"regions"`
	Observers          []FieldCoverageObserver `json:"observers"`
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
