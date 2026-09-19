package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
)

type electionRepoStub struct {
	historical       []entity.HistoricalElectionResult
	territorial     []entity.TerritorialElectionIndicator
	historicalCalls  int
	territorialCalls int
}

func (s *electionRepoStub) GetAll(context.Context) ([]entity.Election, error) {
	return nil, nil
}

func (s *electionRepoStub) GetByID(context.Context, string) (*entity.Election, error) {
	return nil, nil
}

func (s *electionRepoStub) GetHistoricalResults(context.Context) ([]entity.HistoricalElectionResult, error) {
	s.historicalCalls++
	return s.historical, nil
}

func (s *electionRepoStub) GetTerritorialIndicators(context.Context, string) ([]entity.TerritorialElectionIndicator, error) {
	s.territorialCalls++
	return s.territorial, nil
}

func (s *electionRepoStub) Create(context.Context, *entity.Election) error {
	return nil
}

func (s *electionRepoStub) Update(context.Context, *entity.Election) error {
	return nil
}

func (s *electionRepoStub) Delete(context.Context, string) error {
	return nil
}

func (s *electionRepoStub) UpdateStatus(context.Context, string, entity.ElectionStatus) error {
	return nil
}

func TestListHistoricalResultsCanServePublicRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)

	turnout := 53.85
	registered := 6619548
	repo := &electionRepoStub{
		historical: []entity.HistoricalElectionResult{
			{
				ID:                 "historical-2018-summary",
				ElectionID:         "election-2018",
				ElectionName:       "Présidentielle Cameroun 2018",
				ElectionType:       "presidential",
				ElectionDate:       time.Date(2018, 10, 7, 0, 0, 0, 0, time.UTC),
				SourceDocumentSlug: "elecam-presidentielle-2018-rapport-fr",
				ElectionYear:       2018,
				ContestType:        "presidential",
				ResultLevel:        "national",
				ActorType:          "election",
				MetricType:         "summary",
				RegisteredVoters:   &registered,
				Percentage:         &turnout,
				Confidence:         "official_report",
				Status:             "verified",
			},
		},
	}
	handler := NewElectionHandler(repo)
	router := gin.New()
	router.GET("/public/historical-election-results", handler.ListHistoricalResults)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/public/historical-election-results", nil)
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if repo.historicalCalls != 1 {
		t.Fatalf("expected GetHistoricalResults to be called once, got %d", repo.historicalCalls)
	}
	if !strings.Contains(recorder.Body.String(), "Présidentielle Cameroun 2018") {
		t.Fatalf("expected historical result payload, got %s", recorder.Body.String())
	}
}

func TestListTerritorialIndicatorsCanServePublicRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)

	value := 88.28
	repo := &electionRepoStub{
		territorial: []entity.TerritorialElectionIndicator{
			{
				ID:                 "indicator-south-turnout",
				ElectionID:         "election-2025",
				ElectionName:       "Présidentielle Cameroun 2025",
				ElectionType:       "presidential",
				ElectionDate:       time.Date(2025, 10, 12, 0, 0, 0, 0, time.UTC),
				SourceDocumentSlug: "conseil-constitutionnel-presidentielle-2025-resultats",
				ElectionYear:       2025,
				ContestType:        "presidential",
				TerritoryLevel:     "region",
				RegionName:         "SOUTH",
				IndicatorCode:      "turnout_pct",
				IndicatorLabel:     "Participation",
				ValueNumeric:       &value,
				Unit:               "percent",
				Confidence:         "official",
				Status:             "verified",
			},
		},
	}
	handler := NewElectionHandler(repo)
	router := gin.New()
	router.GET("/public/electoral-map", handler.ListTerritorialIndicators)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/public/electoral-map?election_id=election-2025", nil)
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}
	if repo.territorialCalls != 1 {
		t.Fatalf("expected GetTerritorialIndicators to be called once, got %d", repo.territorialCalls)
	}
	if !strings.Contains(recorder.Body.String(), "turnout_pct") {
		t.Fatalf("expected territorial indicator payload, got %s", recorder.Body.String())
	}
}
