// Tests pour RequireUUIDParam — table-driven couvrant les cas
// d'input typiques + le contrat de réponse (400 + JSON shape).
package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// echoHandler de test : ne fait que retourner 200 avec le param reçu.
// Permet de vérifier que la middleware a bien appelé c.Next() (le
// handler est invoqué) ou c.Abort (le handler n'est pas invoqué).
func echoHandler(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"received": id})
}

// setupRouter monte une route GET /items/:id avec RequireUUIDParam.
func setupRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/items/:id", RequireUUIDParam("id"), echoHandler)
	return r
}

// TestRequireUUIDParam_Valide : un vrai UUID doit passer la middleware
// et atteindre le handler. C'est le "happy path" — sans lui, on
// risque de bloquer tous les appels.
func TestRequireUUIDParam_Valide(t *testing.T) {
	r := setupRouter()
	const validID = "78c278a1-8ca1-4a37-bed4-62300d7145ba"

	req := httptest.NewRequest("GET", "/items/"+validID, nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	// Le handler doit avoir reçu l'ID tel quel
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("JSON invalide : %v", err)
	}
	if body["received"] != validID {
		t.Errorf("attendu received=%q, obtenu %v", validID, body["received"])
	}
}

// TestRequireUUIDParam_Invalide : tous les inputs qui ne sont pas des
// UUID valides doivent retourner 400 SANS atteindre le handler.
// On inclut aussi le cas "UUID canonique lowercase requis" — uuid.Parse
// accepte aussi les UUID avec tirets/uppercase, mais l'important est
// qu'on valide la FORME, pas la case.
func TestRequireUUIDParam_Invalide(t *testing.T) {
	r := setupRouter()

	cases := []struct {
		name string
		id   string
	}{
		{"id numérique", "1"},
		{"id alphabétique court", "abc"},
		{"UUID tronqué", "78c278a1-8ca1-4a37-bed4"},
		{"UUID avec caractères hors plage", "ZZZZZZZZ-8ca1-4a37-bed4-62300d7145ba"},
		{"UUID avec trop de sections", "78c278a1-8ca1-4a37-bed4-62300d7145ba-extra"},
		// Note : on ne teste PAS le cas "id vide" (URL `/items/`) — Gin
		// ne match pas la route `/items/:id` si le segment est vide
		// (404 avant la middleware). Idem pour "path traversal" qui
		// contient des %2F que Gin décode en slash, changeant la
		// structure du path. Ces cas testeraient le ROUTER, pas la
		// middleware.
		{"id avec caractères spéciaux URL-encodés", "abc%21%40%23"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			url := "/items/" + tc.id
			req := httptest.NewRequest("GET", url, nil)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("attendu 400, obtenu %d (body: %s)", rec.Code, rec.Body.String())
			}
			// Le body doit mentionner "UUID"
			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("JSON invalide : %v", err)
			}
			msg, _ := body["error"].(string)
			if !strings.Contains(msg, "UUID") {
				t.Errorf("message attendu contenant 'UUID', obtenu : %v", body["error"])
			}
			// Le handler ne doit PAS avoir été appelé (sinon
			// echoHandler aurait mis un 200 et `received` dans le
			// body). On vérifie que `received` n'est pas dans le
			// body, ce qui confirme que c.Next() n'a pas été
			// invoqué.
			if _, ok := body["received"]; ok {
				t.Error("le handler ne devrait PAS être appelé pour un UUID invalide")
			}
		})
	}
}

// TestRequireUUIDParam_ParamNamePersonnalise : la middleware doit
// utiliser le nom de param fourni (pas hardcoder "id"). Teste aussi
// que le body de la réponse expose ce nom.
func TestRequireUUIDParam_ParamNamePersonnalise(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/items/:itemID", RequireUUIDParam("itemID"), echoHandler)

	req := httptest.NewRequest("GET", "/items/not-a-uuid", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("attendu 400, obtenu %d", rec.Code)
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["param_name"] != "itemID" {
		t.Errorf("attendu param_name='itemID', obtenu %v", body["param_name"])
	}
	if body["itemID"] != "not-a-uuid" {
		t.Errorf("attendu itemID='not-a-uuid' dans le body, obtenu %v", body["itemID"])
	}
}

// TestRequireUUIDParam_AbortPasNext : vérifie que la middleware
// utilise c.Abort (pas seulement c.JSON), ce qui est important
// pour les middlewares en chaîne : si une autre middleware
// downstream s'attend à voir abort=true, elle ne doit pas
// s'exécuter.
func TestRequireUUIDParam_AbortPasNext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	// Compteur pour vérifier que la 2e middleware n'est PAS appelée.
	downstreamCalled := false
	r.GET("/items/:id",
		RequireUUIDParam("id"),
		func(c *gin.Context) {
			downstreamCalled = true
			c.JSON(http.StatusOK, gin.H{"downstream": true})
		},
	)

	req := httptest.NewRequest("GET", "/items/not-a-uuid", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("attendu 400, obtenu %d", rec.Code)
	}
	if downstreamCalled {
		t.Error("la middleware doit appeler c.Abort, pas seulement écrire une réponse")
	}
}
