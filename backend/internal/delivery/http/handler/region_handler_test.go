// Tests pour GetDepartmentDemographicsHistory — focus sur le
// contrat handler + interaction avec la middleware RequireUUIDParam.
//
// Note : la validation UUID a été extraite du handler vers la
// middleware (cf. middleware/uuid_param.go) qui est appliquée sur
// la route dans cmd/api/main.go. Les tests handler ne testent
// plus la validation UUID directement (c'est dans uuid_param_test.go)
// — ici on vérifie que le handler fait confiance à la middleware
// et :
//   - pour un UUID valide, appelle le repo avec le bon ID/limit
//   - propage les erreurs repo en 500 (ne masque pas)
//   - parse correctement le query param ?limit=N
//
// La cohabitation handler + middleware est testée dans
// uuid_param_test.go (qui monte la route avec RequireUUIDParam).
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

// mockRegionRepo implémente RegionRepository en n'overridant QUE la
// méthode qu'on teste. Les autres méthodes sont nil (l'embedding
// d'interface fournit les valeurs par défaut) et paniqueront si
// jamais appelées — ce qui est exactement le contrat souhaité :
// "si on appelle autre chose que GetDepartmentDemographicsHistory,
// c'est un bug du test".
type mockRegionRepo struct {
	repository.RegionRepository
	// Si non-nil, retournée par GetDepartmentDemographicsHistory.
	historyErr error
	// Si historyErr est nil, on retourne cette liste.
	historyOut []entity.DepartmentDemographicsSnapshot
	// Compteur d'appels pour vérifier que le repo est/n't pas appelé.
	historyCalls int
	// Dernier departmentID reçu par le repo.
	lastDeptID string
	// Dernier limit reçu.
	lastLimit int
}

func (m *mockRegionRepo) GetDepartmentDemographicsHistory(
	ctx context.Context, departmentID string, limit int,
) ([]entity.DepartmentDemographicsSnapshot, error) {
	m.historyCalls++
	m.lastDeptID = departmentID
	m.lastLimit = limit
	if m.historyErr != nil {
		return nil, m.historyErr
	}
	return m.historyOut, nil
}

// setupRouterRegion monte uniquement la route demographics-history,
// SANS la middleware RequireUUIDParam — les tests handler ne
// testent pas la validation UUID (c'est dans uuid_param_test.go).
// On assume donc que l'ID passé aux tests est un UUID valide.
func setupRouterRegion(h *RegionHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/admin/departments/:id/demographics-history", h.GetDepartmentDemographicsHistory)
	return r
}

// TestDemographicsHistory_UUIDValide_200 : un vrai UUID doit
// appeler le repo et retourner 200 avec les snapshots.
func TestDemographicsHistory_UUIDValide_200(t *testing.T) {
	repo := &mockRegionRepo{
		historyOut: []entity.DepartmentDemographicsSnapshot{
			{
				ID:              "snap-1",
				DepartmentID:    "78c278a1-8ca1-4a37-bed4-62300d7145ba",
				Year:            2025,
				Population:      355000,
				RegisteredVoters: 91000,
				DataSource:      "BUCREP 2023",
				DataConfidence:  "estimated",
			},
		},
	}
	h := NewRegionHandler(repo)
	r := setupRouterRegion(h)

	const validID = "78c278a1-8ca1-4a37-bed4-62300d7145ba"
	req := httptest.NewRequest("GET", "/admin/departments/"+validID+"/demographics-history", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if repo.historyCalls != 1 {
		t.Errorf("attendu 1 appel repo, obtenu %d", repo.historyCalls)
	}
	if repo.lastDeptID != validID {
		t.Errorf("repo appelé avec deptID=%q, attendu %q", repo.lastDeptID, validID)
	}
	if repo.lastLimit != 100 {
		t.Errorf("limit par défaut attendu 100, obtenu %d", repo.lastLimit)
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("JSON invalide : %v", err)
	}
	if total, _ := body["total"].(float64); total != 1 {
		t.Errorf("total attendu 1, obtenu %v", body["total"])
	}
}

// TestDemographicsHistory_RepoError_500 : si le repo échoue (ex:
// DB down), on doit retourner 500, PAS 400 (l'erreur est interne,
// pas un input invalide).
func TestDemographicsHistory_RepoError_500(t *testing.T) {
	repo := &mockRegionRepo{
		historyErr: errors.New("connection refused"),
	}
	h := NewRegionHandler(repo)
	r := setupRouterRegion(h)

	req := httptest.NewRequest("GET", "/admin/departments/78c278a1-8ca1-4a37-bed4-62300d7145ba/demographics-history", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("attendu 500, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	if repo.historyCalls != 1 {
		t.Errorf("le repo doit être appelé pour un UUID valide, %d appels", repo.historyCalls)
	}
}

// TestDemographicsHistory_LimitQueryParam : vérifie que le param
// ?limit=N est bien parsé et passé au repo.
func TestDemographicsHistory_LimitQueryParam(t *testing.T) {
	repo := &mockRegionRepo{}
	h := NewRegionHandler(repo)
	r := setupRouterRegion(h)

	req := httptest.NewRequest("GET",
		"/admin/departments/78c278a1-8ca1-4a37-bed4-62300d7145ba/demographics-history?limit=42",
		nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d", rec.Code)
	}
	if repo.lastLimit != 42 {
		t.Errorf("attendu limit=42, obtenu %d", repo.lastLimit)
	}
}
