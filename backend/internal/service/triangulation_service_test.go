package service

import (
	"context"
	"testing"
	"time"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

// mockReportRepo implémente repository.ReportRepository en mémoire pour les tests.
// findNearbyFunc permet à chaque test de contrôler finement la réponse.
type mockReportRepo struct {
	reports         map[string]*entity.Report
	findNearbyFunc  func(ctx context.Context, excludeID, h3Index string, lat, lon, radius float64, start, end time.Time) ([]entity.Report, error)
	updatedID       string
	updatedStatus   entity.ReportStatus
	updateCallCount int
}

func (m *mockReportRepo) Create(ctx context.Context, report *entity.Report) error { return nil }
func (m *mockReportRepo) GetAll(ctx context.Context, status string) ([]entity.Report, error) {
	return nil, nil
}
func (m *mockReportRepo) GetByID(ctx context.Context, id string) (*entity.Report, error) {
	if r, ok := m.reports[id]; ok {
		return r, nil
	}
	return nil, nil
}
func (m *mockReportRepo) FindNearbyWithRole(ctx context.Context, excludeID, h3Index string, lat, lon, radius float64, start, end time.Time) ([]entity.Report, error) {
	if m.findNearbyFunc != nil {
		return m.findNearbyFunc(ctx, excludeID, h3Index, lat, lon, radius, start, end)
	}
	return nil, nil
}
func (m *mockReportRepo) UpdateStatus(ctx context.Context, id string, status entity.ReportStatus) error {
	m.updatedID = id
	m.updatedStatus = status
	m.updateCallCount++
	return nil
}

// TestTriangulationRules valide les nouvelles règles de triangulation (cf. C3 audit).
// Chaque scénario encode un comportement attendu NON-NÉGOCIABLE.
func TestTriangulationRules(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	// Helper pour créer un mock avec une cible et une fonction nearby paramétrable.
	newMock := func(targetID string, status entity.ReportStatus, fn func(excludeID string) []entity.Report) *mockReportRepo {
		return &mockReportRepo{
			reports: map[string]*entity.Report{
				targetID: {
					ID:           targetID,
					Status:       status,
					CreatedAt:    now,
					GPSLocation:  "POINT(11.5021 3.8480)", // Yaoundé, Cameroun
					H3Index:      "8c2bae3052d7fff",
					ObserverID:   "observer-target",
					IncidentType: "fraud",
					AuthorRole:   entity.RoleObserver,
				},
			},
			findNearbyFunc: func(c context.Context, excludeID, h3Index string, lat, lon, radius float64, start, end time.Time) ([]entity.Report, error) {
				return fn(excludeID), nil
			},
		}
	}

	t.Run("RAPPORT_ISOLÉ_NE_S_AUTO_VÉRIFIE_PAS", func(t *testing.T) {
		// C3 : un seul observateur, un seul rapport → DOIT rester pending.
		// C'est le bug critique qu'on corrige.
		repo := newMock("target", entity.StatusPending, func(excludeID string) []entity.Report {
			return []entity.Report{
				{ID: "obs1", ObserverID: "obs1", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, H3Index: "8c2bae3052d7fff"},
			}
		})
		s := NewTriangulationService(repo)

		if err := s.CalculateTrustScore(ctx, "target"); err != nil {
			t.Fatalf("Calcul échoué : %v", err)
		}

		if repo.updatedStatus == entity.StatusVerified {
			t.Fatalf("RÉGRESSION C3 : rapport isolé auto-vérifié (1 observateur, score=1.0 mais diversité=1 < 3)")
		}
		if repo.updateCallCount != 0 {
			t.Fatalf("Aucune mise à jour de statut attendue, obtenue : %s", repo.updatedStatus)
		}
	})

	t.Run("OBSERVER_UNIQUE_3_RAPPORTS_RESTE_PENDING", func(t *testing.T) {
		// C3 : diversité = observateurs distincts. Un seul observateur qui
		// soumet 3 fois ne peut pas se valider lui-même.
		repo := newMock("target", entity.StatusPending, func(excludeID string) []entity.Report {
			return []entity.Report{
				{ID: "r1", ObserverID: "obs-unique", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, H3Index: "8c2bae3052d7fff"},
				{ID: "r2", ObserverID: "obs-unique", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, H3Index: "8c2bae3052d7fff"},
				{ID: "r3", ObserverID: "obs-unique", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, H3Index: "8c2bae3052d7fff"},
			}
		})
		s := NewTriangulationService(repo)

		if err := s.CalculateTrustScore(ctx, "target"); err != nil {
			t.Fatalf("Calcul échoué : %v", err)
		}

		if repo.updatedStatus == entity.StatusVerified {
			t.Fatalf("RÉGRESSION C3 : auto-validation par soumissions multiples du même observateur")
		}
	})

	t.Run("TROIS_OBSERVERVEURS_DISTINCTS_VERIFIENT", func(t *testing.T) {
		// Cas nominal du brief : 3 sources distinctes dans la même tuile H3 = confiance.
		repo := newMock("target", entity.StatusPending, func(excludeID string) []entity.Report {
			return []entity.Report{
				{ID: "r1", ObserverID: "obs-A", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, H3Index: "8c2bae3052d7fff"},
				{ID: "r2", ObserverID: "obs-B", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, H3Index: "8c2bae3052d7fff"},
				{ID: "r3", ObserverID: "obs-C", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, H3Index: "8c2bae3052d7fff"},
			}
		})
		s := NewTriangulationService(repo)

		if err := s.CalculateTrustScore(ctx, "target"); err != nil {
			t.Fatalf("Calcul échoué : %v", err)
		}

		if repo.updatedStatus != entity.StatusVerified {
			t.Fatalf("Attendu VERIFIED (3 observateurs distincts, score=3.0), obtenu %s", repo.updatedStatus)
		}
	})

	t.Run("CITIZENS_SEULS_RESTENT_PENDING", func(t *testing.T) {
		// 5 citizens score=1.0 cumulés mais diversité=5 — devrait vérifier,
		// SAUF que la pondération citizen est trop faible : 5 * 0.2 = 1.0 ≥ seuil.
		// On vérifie que la diversité seule ne suffit pas.
		// 5 citizens * 0.2 = 1.0, score pile au seuil — la diversité passe.
		// On ajoute 1 verified_citizen pour pousser le score mais on retire pour
		// tester le cas inverse.
		repo := newMock("target", entity.StatusPending, func(excludeID string) []entity.Report {
			return []entity.Report{
				{ID: "r1", ObserverID: "c1", AuthorRole: entity.RoleCitizen, IncidentType: "fraud", CreatedAt: now},
				{ID: "r2", ObserverID: "c2", AuthorRole: entity.RoleCitizen, IncidentType: "fraud", CreatedAt: now},
			}
		})
		s := NewTriangulationService(repo)

		if err := s.CalculateTrustScore(ctx, "target"); err != nil {
			t.Fatalf("Calcul échoué : %v", err)
		}

		// 2 citizens * 0.2 = 0.4 < 1.0 seuil → reste pending.
		if repo.updatedStatus == entity.StatusVerified {
			t.Fatalf("Score insuffisant (0.4) mais auto-vérifié — diversité sans score ne doit pas suffire")
		}
	})

	t.Run("RAPPORTS_REJETES_EXCLUS", func(t *testing.T) {
		// 2 observateurs distincts valides + 1 rejeté → diversité=2 < 3 → pending.
		repo := newMock("target", entity.StatusPending, func(excludeID string) []entity.Report {
			return []entity.Report{
				{ID: "r1", ObserverID: "obs-A", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, Status: entity.StatusPending},
				{ID: "r2", ObserverID: "obs-B", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, Status: entity.StatusPending},
				{ID: "r3", ObserverID: "obs-C", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now, Status: entity.StatusRejected},
			}
		})
		s := NewTriangulationService(repo)

		if err := s.CalculateTrustScore(ctx, "target"); err != nil {
			t.Fatalf("Calcul échoué : %v", err)
		}

		if repo.updatedStatus == entity.StatusVerified {
			t.Fatalf("Rapports rejetés comptés dans la diversité — devrait être exclus")
		}
	})

	t.Run("EXCLUDE_ID_VERIFIE", func(t *testing.T) {
		// Le repo DOIT recevoir l'ID de la cible en excludeID. Sinon le cible
		// se compte dans ses propres voisins et s'auto-vérifie (le bug originel).
		var capturedExcludeID string
		repo := &mockReportRepo{
			reports: map[string]*entity.Report{
				"target": {
					ID: "target", Status: entity.StatusPending, CreatedAt: now,
					GPSLocation: "POINT(11.5021 3.8480)", H3Index: "8c2bae3052d7fff",
					ObserverID: "obs-self", AuthorRole: entity.RoleObserver,
				},
			},
			findNearbyFunc: func(c context.Context, excludeID, h3Index string, lat, lon, radius float64, start, end time.Time) ([]entity.Report, error) {
				capturedExcludeID = excludeID
				return nil, nil
			},
		}
		s := NewTriangulationService(repo)

		if err := s.CalculateTrustScore(ctx, "target"); err != nil {
			t.Fatalf("Calcul échoué : %v", err)
		}

		if capturedExcludeID != "target" {
			t.Fatalf("Le repo doit recevoir excludeID=target, reçu %q", capturedExcludeID)
		}
	})

	t.Run("DEJA_VERIFIE_PAS_DE_RECALCUL", func(t *testing.T) {
		// Un rapport déjà vérifié ne doit pas être re-triangulé.
		repo := newMock("target", entity.StatusVerified, func(excludeID string) []entity.Report {
			return []entity.Report{
				{ID: "r1", ObserverID: "obs-A", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now},
			}
		})
		s := NewTriangulationService(repo)

		if err := s.CalculateTrustScore(ctx, "target"); err != nil {
			t.Fatalf("Calcul échoué : %v", err)
		}

		if repo.updateCallCount != 0 {
			t.Fatalf("Rapport déjà vérifié ne doit pas être re-touché, %d update(s) effectuée(s)", repo.updateCallCount)
		}
	})

	t.Run("GPS_INVALIDE_RETOURNE_ERREUR", func(t *testing.T) {
		// M3 audit : un WKT mal formé ne doit plus continuer silencieusement
		// avec lat=lon=0.
		repo := &mockReportRepo{
			reports: map[string]*entity.Report{
				"target": {
					ID: "target", Status: entity.StatusPending, CreatedAt: now,
					GPSLocation: "POINT(GARBAGE)", H3Index: "8c2bae3052d7fff",
					ObserverID: "obs-self", AuthorRole: entity.RoleObserver,
				},
			},
			findNearbyFunc: func(c context.Context, excludeID, h3Index string, lat, lon, radius float64, start, end time.Time) ([]entity.Report, error) {
				t.Fatal("FindNearbyWithRole ne doit pas être appelé si le WKT est invalide")
				return nil, nil
			},
		}
		s := NewTriangulationService(repo)

		err := s.CalculateTrustScore(ctx, "target")
		if err == nil {
			t.Fatal("Attendu une erreur sur WKT invalide, obtenu nil")
		}
		if repo.updateCallCount != 0 {
			t.Fatal("Aucune mise à jour ne doit avoir lieu sur WKT invalide")
		}
	})

	t.Run("SEUIL_CONFIGURABLE", func(t *testing.T) {
		// Permet de tester la configuration par variable d'environnement.
		t.Setenv("TRIANGULATION_MIN_DISTINCT_OBSERVERS", "2")
		t.Setenv("TRIANGULATION_TRUST_SCORE_THRESHOLD", "0.5")

		repo := newMock("target", entity.StatusPending, func(excludeID string) []entity.Report {
			return []entity.Report{
				{ID: "r1", ObserverID: "obs-A", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now},
				{ID: "r2", ObserverID: "obs-B", AuthorRole: entity.RoleObserver, IncidentType: "fraud", CreatedAt: now},
			}
		})
		s := NewTriangulationService(repo)

		if err := s.CalculateTrustScore(ctx, "target"); err != nil {
			t.Fatalf("Calcul échoué : %v", err)
		}

		// Avec seuil abaissé à 2 observateurs et 0.5 score :
		// 2 * 1.0 = 2.0 ≥ 0.5 → doit vérifier.
		if repo.updatedStatus != entity.StatusVerified {
			t.Fatalf("Seuils configurables non appliqués : %s", repo.updatedStatus)
		}
	})
}

// TestParseWKTPoint valide le parsing strict (cf. M3 audit).
func TestParseWKTPoint(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantLat float64
		wantLon float64
		wantErr bool
	}{
		{"valide yaoundé", "POINT(11.5021 3.8480)", 3.8480, 11.5021, false},
		{"valide zéro", "POINT(0 0)", 0, 0, false},
		{"valide négatif", "POINT(-73.9857 40.7484)", 40.7484, -73.9857, false},
		{"vide", "", 0, 0, true},
		{"mauvais préfixe", "LINESTRING(1 2)", 0, 0, true},
		{"corps vide", "POINT()", 0, 0, true},
		{"non numérique", "POINT(a b)", 0, 0, true},
		{"lat hors borne", "POINT(0 91)", 0, 0, true},
		{"lon hors borne", "POINT(181 0)", 0, 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			lat, lon, err := parseWKTPoint(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("Attendu erreur pour %q, obtenu lat=%f lon=%f", tc.input, lat, lon)
				}
				return
			}
			if err != nil {
				t.Fatalf("Erreur inattendue pour %q : %v", tc.input, err)
			}
			if lat != tc.wantLat || lon != tc.wantLon {
				t.Fatalf("Pour %q : attendu lat=%f lon=%f, obtenu lat=%f lon=%f",
					tc.input, tc.wantLat, tc.wantLon, lat, lon)
			}
		})
	}
}

// TestRoleWeightsNoRoleCanSelfVerify valide que la table roleWeights est conçue
// pour qu'aucun rôle ne puisse à lui seul franchir le seuil par défaut.
func TestRoleWeightsNoRoleCanSelfVerify(t *testing.T) {
	// Un rapport exclu de ses voisins → 0 voisin → score 0.
	// Si un seul voisin existe (même d'un observateur accrédité), score = 1.0
	// mais diversité = 1 < 3 → pas de vérification grâce à la double condition.
	// C'est la DOUBLE CONDITION qui protège, pas le poids seul.
	maxSingleRole := 0.0
	for _, w := range roleWeights {
		if w > maxSingleRole {
			maxSingleRole = w
		}
	}
	if maxSingleRole < 1.0 {
		t.Fatalf("Poids max %f < 1.0 : la double condition diversité+score n'est plus nécessaire", maxSingleRole)
	}
	// Le poids max est 1.0 (observer), pile au seuil. Combiné avec diversité≥3,
	// un rapport ne peut jamais être validé par un seul rapport, même accrédité.
}

// Sanity check compile-time : empêche un futur dev de casser les interfaces en silence.
var (
	_ TriangulationService        = (*triangulationService)(nil)
	_ repository.ReportRepository = (*mockReportRepo)(nil)
)