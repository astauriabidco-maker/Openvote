package repository

import (
	"context"
	"github.com/openvote/backend/internal/domain/entity"
)

type ElectionRepository interface {
	GetAll(ctx context.Context) ([]entity.Election, error)
	GetByID(ctx context.Context, id string) (*entity.Election, error)
	GetHistoricalResults(ctx context.Context) ([]entity.HistoricalElectionResult, error)
	Create(ctx context.Context, e *entity.Election) error
	Update(ctx context.Context, e *entity.Election) error
	Delete(ctx context.Context, id string) error
	UpdateStatus(ctx context.Context, id string, status entity.ElectionStatus) error
}

type AuditLogRepository interface {
	Create(ctx context.Context, log *entity.AuditLog) error
	GetAll(ctx context.Context, limit int) ([]entity.AuditLog, error)
}

type IncidentTypeRepository interface {
	GetAll(ctx context.Context) ([]entity.IncidentType, error)
	Create(ctx context.Context, it *entity.IncidentType) error
	Update(ctx context.Context, it *entity.IncidentType) error
	Delete(ctx context.Context, id string) error
}

type PollingStationRepository interface {
	GetByElection(ctx context.Context, electionID string) ([]entity.PollingStation, error)
	GetAssignedToObserver(ctx context.Context, electionID, observerID string) ([]entity.PollingStation, error)
	Create(ctx context.Context, station *entity.PollingStation) error
}

type CandidateRepository interface {
	GetByElection(ctx context.Context, electionID string) ([]entity.Candidate, error)
	Create(ctx context.Context, candidate *entity.Candidate) error
}

type PVRepository interface {
	Create(ctx context.Context, pv *entity.PVSubmission) error
	GetByID(ctx context.Context, id string) (*entity.PVSubmission, error)
	GetByElection(ctx context.Context, electionID string) ([]entity.PVSubmission, error)
	GetForReview(ctx context.Context, electionID, status string) ([]entity.PVSubmission, error)
	UpdateVerificationStatus(ctx context.Context, id string, status entity.PVStatus, comment, adminID string) (*entity.PVSubmission, error)
	GetSummary(ctx context.Context, electionID string) (*entity.ElectionResultSummary, error)
	GetRegionSummaries(ctx context.Context, electionID string) ([]entity.RegionPVSummary, error)
	CreateRegionalRiskSnapshot(ctx context.Context, electionID string) ([]entity.RegionalRiskSnapshot, error)
	GetRegionalRiskSnapshots(ctx context.Context, electionID string, limit int) ([]entity.RegionalRiskSnapshot, error)
	GetPublicProofs(ctx context.Context, electionID string) ([]entity.PublicPVProof, error)
}

type PVAuditRepository interface {
	Create(ctx context.Context, event *entity.PVAuditEvent) error
	GetByPV(ctx context.Context, pvID string) ([]entity.PVAuditEvent, error)
}

type ObserverDeviceKeyRepository interface {
	Upsert(ctx context.Context, key *entity.ObserverDeviceKey) error
	GetActiveByUserAndDevice(ctx context.Context, userID, deviceID string) (*entity.ObserverDeviceKey, error)
	MarkUsed(ctx context.Context, id string) error
}

type PollingStationAssignmentRepository interface {
	Create(ctx context.Context, assignment *entity.PollingStationAssignment) error
	GetByObserver(ctx context.Context, electionID, observerID string) ([]entity.PollingStationAssignment, error)
	GetCoverage(ctx context.Context, electionID string) (*entity.FieldCoverageSummary, error)
}
