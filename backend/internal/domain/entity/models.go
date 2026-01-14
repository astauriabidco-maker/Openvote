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
	RegionID     string    `json:"region_id" db:"region_id"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
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
