package service

import (
	"context"
	"testing"
	"time"

	"github.com/openvote/backend/internal/domain/entity"
)

// Mock de ReportRepository pour les tests
type mockReportRepo struct {
	reports       map[string]*entity.Report
	nearbyResult  []entity.Report
	updatedID     string
	updatedStatus entity.ReportStatus
}

func (m *mockReportRepo) Create(ctx context.Context, report *entity.Report) error { return nil }
func (m *mockReportRepo) GetAll(ctx context.Context, status string) ([]entity.Report, error) {
	return nil, nil
}
func (m *mockReportRepo) GetByID(ctx context.Context, id string) (*entity.Report, error) {
	return m.reports[id], nil
}
func (m *mockReportRepo) FindNearbyWithRole(ctx context.Context, h3Index string, lat, lon, radius float64, start, end time.Time) ([]entity.Report, error) {
	return m.nearbyResult, nil
}
func (m *mockReportRepo) UpdateStatus(ctx context.Context, id string, status entity.ReportStatus) error {
	m.updatedID = id
	m.updatedStatus = status
	return nil
}

func TestTriangulationScenarios(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	t.Run("Validation Citoyenne: 5 reports (0.2 each) at same location", func(t *testing.T) {
		repo := &mockReportRepo{
			reports: map[string]*entity.Report{
				"target": {ID: "target", Status: entity.StatusPending, CreatedAt: now, GPSLocation: "POINT(2.35 48.85)", H3Index: "h3_index"},
			},
			nearbyResult: []entity.Report{
				{ID: "r1", AuthorRole: entity.RoleCitizen, IncidentType: "A", CreatedAt: now},
				{ID: "r2", AuthorRole: entity.RoleCitizen, IncidentType: "A", CreatedAt: now},
				{ID: "r3", AuthorRole: entity.RoleCitizen, IncidentType: "A", CreatedAt: now},
				{ID: "r4", AuthorRole: entity.RoleCitizen, IncidentType: "A", CreatedAt: now},
				{ID: "target", AuthorRole: entity.RoleCitizen, IncidentType: "A", CreatedAt: now}, // 5ème rapport (le cible lui-même)
			},
		}
		s := NewTriangulationService(repo)

		err := s.CalculateTrustScore(ctx, "target")
		if err != nil {
			t.Fatalf("Calculation failed: %v", err)
		}

		if repo.updatedStatus != entity.StatusVerified {
			t.Errorf("Expected status VERIFIED, got %s", repo.updatedStatus)
		}
	})

	t.Run("Observateur: 1 report (1.0) passes immediately", func(t *testing.T) {
		repo := &mockReportRepo{
			reports: map[string]*entity.Report{
				"obs": {ID: "obs", Status: entity.StatusPending, CreatedAt: now, GPSLocation: "POINT(2.35 48.85)", H3Index: "h3_index"},
			},
			nearbyResult: []entity.Report{
				{ID: "obs", AuthorRole: entity.RoleObserver, IncidentType: "B", CreatedAt: now},
			},
		}
		s := NewTriangulationService(repo)

		err := s.CalculateTrustScore(ctx, "obs")
		if err != nil {
			t.Fatalf("Calculation failed: %v", err)
		}

		if repo.updatedStatus != entity.StatusVerified {
			t.Errorf("Expected status VERIFIED for observer, got %s", repo.updatedStatus)
		}
	})

	t.Run("Insufficient: 3 regular citizens (3 * 0.2 = 0.6) stays pending", func(t *testing.T) {
		repo := &mockReportRepo{
			reports: map[string]*entity.Report{
				"target": {ID: "target", Status: entity.StatusPending, CreatedAt: now, GPSLocation: "POINT(2.35 48.85)", H3Index: "h3_index"},
			},
			nearbyResult: []entity.Report{
				{ID: "r1", AuthorRole: entity.RoleCitizen, IncidentType: "A", CreatedAt: now},
				{ID: "r2", AuthorRole: entity.RoleCitizen, IncidentType: "A", CreatedAt: now},
				{ID: "target", AuthorRole: entity.RoleCitizen, IncidentType: "A", CreatedAt: now},
			},
		}
		s := NewTriangulationService(repo)

		err := s.CalculateTrustScore(ctx, "target")
		if err != nil {
			t.Fatalf("Calculation failed: %v", err)
		}

		if repo.updatedStatus == entity.StatusVerified {
			t.Errorf("Expected status to remain PENDING, but was updated to VERIFIED")
		}
	})
}
