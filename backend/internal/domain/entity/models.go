package entity

import (
	"time"
)

// Définition des types ENUM pour garantir la sécurité du typage
type UserRole string
type ReportStatus string

const (
	RoleSuperAdmin  UserRole = "super_admin"
	RoleRegionAdmin UserRole = "region_admin"
	RoleLocalCoord    UserRole = "local_coord"
	RoleObserver      UserRole = "observer"
	RoleCitizen       UserRole = "citizen"
	RoleVerifiedCitizen UserRole = "verified_citizen"
)

const (
	StatusPending  ReportStatus = "pending"
	StatusVerified ReportStatus = "verified"
	StatusRejected ReportStatus = "rejected"
)

// User définit l'utilisateur du système (Observateur, Admin, etc.)
type User struct {
	ID           string    `json:"id" db:"id" gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	Username     string    `json:"username" db:"username" gorm:"unique;not null"`
	Role         UserRole  `json:"role" db:"role" gorm:"type:user_role;not null"`
	PasswordHash string    `json:"-" db:"password_hash" gorm:"not null"` // Le hash ne doit jamais sortir en JSON
	RegionID     string     `json:"region_id" db:"region_id"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at" db:"updated_at"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty" db:"last_login_at"`
}

// Report représente un signalement d'incident sur le terrain
type Report struct {
	ID           string       `json:"id" db:"id" gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ObserverID   string       `json:"observer_id" db:"observer_id" gorm:"type:uuid;not null"`
	IncidentType string       `json:"incident_type" db:"incident_type" gorm:"not null"`
	Description  string       `json:"description" db:"description"`
	// GPSLocation est souvent géré comme string ou struct spécifique selon le driver PostGIS
	// Ici on le garde simple pour l'exemple, mais en prod on utiliserait un type Geometry dédié
	GPSLocation  string       `json:"gps_location" db:"gps_location" gorm:"type:geometry(Point,4326)"` 
	H3Index      string       `json:"h3_index" db:"h3_index" gorm:"index"`
	Status       ReportStatus `json:"status" db:"status" gorm:"type:report_status;default:'pending'"`
	ProofURL     string       `json:"proof_url" db:"proof_url"`
	CreatedAt    time.Time    `json:"created_at" db:"created_at"`
	
	// Fields populated via Joins
	AuthorRole   UserRole     `json:"author_role" db:"author_role" gorm:"-"`
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
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
}

func (Department) TableName() string {
	return "departments"
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
	Type        string         `json:"type" db:"type"`           // présidentielle, législative, municipale, référendum
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
	ArticleNumber string `json:"article_number,omitempty" db:"article_number"`
	ArticleTitle  string `json:"article_title,omitempty" db:"article_title"`
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
