// Tests pour RequirePagination (middleware/pagination.go) — table-driven
// couvrant les cas de query param invalides + le contrat d'injection
// (page/limit dans le contexte).
package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// echoPaginationHandler de test : récupère la pagination injectée
// et la retourne dans le body, pour vérifier que la middleware a
// bien posé les valeurs.
func echoPaginationHandler(c *gin.Context) {
	page, limit := GetPagination(c)
	c.JSON(http.StatusOK, gin.H{"page": page, "limit": limit})
}

func setupPaginationRouter(o ...PaginationOptions) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	var mw gin.HandlerFunc
	if len(o) > 0 {
		mw = RequirePagination(o[0])
	} else {
		mw = RequirePagination()
	}
	r.GET("/items", mw, echoPaginationHandler)
	return r
}

// TestRequirePagination_Valide : les valeurs acceptables passent et
// sont injectées telles quelles (ou clampées au MaxLimit).
func TestRequirePagination_Valide(t *testing.T) {
	r := setupPaginationRouter()

	cases := []struct {
		name     string
		url      string
		wantPage int
		wantLim  int
	}{
		{"absent → defaults", "/items", DefaultPage, DefaultLimit},
		{"page=2 limit=20", "/items?page=2&limit=20", 2, 20},
		{"limit = MaxLimit (borne OK)", "/items?limit=200", 1, 200},
		{"seul page", "/items?page=5", 5, DefaultLimit},
		{"seul limit", "/items?limit=10", 1, 10},
		{"page=1 limit=1 (min)", "/items?page=1&limit=1", 1, 1},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tc.url, nil)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
			}
			var body map[string]int
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("JSON invalide : %v", err)
			}
			if body["page"] != tc.wantPage {
				t.Errorf("page attendu %d, obtenu %d", tc.wantPage, body["page"])
			}
			if body["limit"] != tc.wantLim {
				t.Errorf("limit attendu %d, obtenu %d", tc.wantLim, body["limit"])
			}
		})
	}
}

// TestRequirePagination_Invalide : tous les inputs hors range
// retournent 400 AVANT d'atteindre le handler. Le handler ne doit
// pas être appelé (sinon echoPaginationHandler aurait mis un 200).
func TestRequirePagination_Invalide(t *testing.T) {
	r := setupPaginationRouter()

	cases := []struct {
		name string
		url  string
	}{
		{"page non-entier", "/items?page=abc"},
		{"limit non-entier", "/items?limit=xyz"},
		{"page = 0", "/items?page=0"},
		{"page négatif", "/items?page=-1"},
		{"limit = 0", "/items?limit=0"},
		{"limit négatif", "/items?limit=-10"},
		{"limit > MaxLimit (201)", "/items?limit=201"},
		{"limit = 1000 (très gros)", "/items?limit=1000"},
		{"page = 1.5 (décimal)", "/items?page=1.5"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tc.url, nil)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("attendu 400, obtenu %d (body: %s)", rec.Code, rec.Body.String())
			}
			// Vérifie que le body contient bien le nom du param
			// en erreur (pour que le client debug)
			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("JSON invalide : %v", err)
			}
			if body["param"] == nil {
				t.Errorf("body devrait inclure le param en erreur, obtenu : %v", body)
			}
		})
	}
}

// TestRequirePagination_VideEquivalentAbsence : ?page= et ?limit=
// sont équivalents à "param absent" (per HTTP spec : ?foo= est
// équivalent à ?foo). On doit retourner les defaults, PAS 400.
func TestRequirePagination_VideEquivalentAbsence(t *testing.T) {
	r := setupPaginationRouter()

	cases := []string{"/items?page=", "/items?limit=", "/items?page=&limit="}
	for _, url := range cases {
		t.Run(url, func(t *testing.T) {
			req := httptest.NewRequest("GET", url, nil)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Errorf("attendu 200 (vide = absent), obtenu %d (body: %s)", rec.Code, rec.Body.String())
			}
		})
	}
}

// TestRequirePagination_CustomMaxLimit : on peut overrider le
// MaxLimit via PaginationOptions{MaxLimit: 5}.
func TestRequirePagination_CustomMaxLimit(t *testing.T) {
	r := setupPaginationRouter(PaginationOptions{MaxLimit: 5})

	// limit=5 OK
	req := httptest.NewRequest("GET", "/items?limit=5", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("limit=5 devrait passer, obtenu %d", rec.Code)
	}

	// limit=6 → 400
	req = httptest.NewRequest("GET", "/items?limit=6", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("limit=6 devrait être 400 (MaxLimit=5), obtenu %d", rec.Code)
	}
}

// TestRequirePagination_AbortPasNext : vérifie que la middleware
// utilise c.Abort (pas seulement c.JSON), pour stopper les
// middlewares downstream. On monte un second handler qui ne
// doit PAS être appelé sur input invalide.
func TestRequirePagination_AbortPasNext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	downstreamCalled := false
	r.GET("/items",
		RequirePagination(),
		func(c *gin.Context) {
			downstreamCalled = true
			c.JSON(http.StatusOK, gin.H{"downstream": true})
		},
	)

	req := httptest.NewRequest("GET", "/items?page=abc", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("attendu 400, obtenu %d", rec.Code)
	}
	if downstreamCalled {
		t.Error("la middleware doit appeler c.Abort, pas seulement écrire une réponse")
	}
}
