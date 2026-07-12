// Tests pour RequestIDMiddleware (request_id.go).
package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func setupRequestIDRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware())
	r.GET("/x", func(c *gin.Context) {
		id := GetRequestID(c)
		c.JSON(http.StatusOK, gin.H{"id": id})
	})
	return r
}

// TestRequestID_NoIncomingHeader : si le client n'envoie pas
// X-Request-ID, on en génère un nouveau (UUID v4).
func TestRequestID_NoIncomingHeader(t *testing.T) {
	r := setupRequestIDRouter()

	req := httptest.NewRequest("GET", "/x", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d", rec.Code)
	}
	// Header X-Request-ID doit être posé
	headerID := rec.Header().Get(HeaderRequestID)
	if headerID == "" {
		t.Fatal("X-Request-ID header devrait être posé en réponse")
	}
	// Et c'est un UUID v4 valide
	if _, err := uuid.Parse(headerID); err != nil {
		t.Errorf("X-Request-ID devrait être un UUID valide, obtenu %q (%v)", headerID, err)
	}
	// Et le handler a récupéré le MÊME id via GetRequestID
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("JSON invalide : %v", err)
	}
	if body["id"] != headerID {
		t.Errorf("handler ID (%q) != header ID (%q)", body["id"], headerID)
	}
}

// TestRequestID_ValidIncomingHeader : si le client envoie un
// X-Request-ID UUID v4 valide, on le réutilise (cas du retry/proxy).
func TestRequestID_ValidIncomingHeader(t *testing.T) {
	r := setupRequestIDRouter()

	const incoming = "550e8400-e29b-41d4-a716-446655440000"
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set(HeaderRequestID, incoming)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if got := rec.Header().Get(HeaderRequestID); got != incoming {
		t.Errorf("attendu réutilisation de %q, obtenu %q", incoming, got)
	}
	var body map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["id"] != incoming {
		t.Errorf("handler ID devrait être %q, obtenu %q", incoming, body["id"])
	}
}

// TestRequestID_InvalidIncomingHeader : si le client envoie un
// X-Request-ID malformé, on REGÉNÈRE un UUID (defense contre
// log injection).
//
// Note : un UUID v1 (vs v4) est techniquement valide au sens RFC
// 4122 — uuid.Parse l'accepte. Notre middleware l'accepte aussi,
// parce qu'on n'a pas besoin de discriminer v1 vs v4, juste de
// valider la FORME. Le test v1 est donc retiré (c'est un cas
// valide). On garde les inputs vraiment malformés ou dangereux.
func TestRequestID_InvalidIncomingHeader(t *testing.T) {
	r := setupRequestIDRouter()

	cases := []struct {
		name   string
		header string
	}{
		{"texte libre", "mon-id-custom"},
		{"presque-UUID avec caractères invalides", "ZZZZZZZZ-e29b-41d4-a716-446655440000"},
		{"SQL injection attempt", "1' OR '1'='1"},
		{"log injection attempt", "panic req_id=GENUINE\n[FAKE] system compromised"},
		{"vide (≠ absent)", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/x", nil)
			if tc.header != "" {
				req.Header.Set(HeaderRequestID, tc.header)
			}
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			got := rec.Header().Get(HeaderRequestID)
			// On doit avoir regénéré un UUID, PAS réutilisé l'input
			if got == tc.header && tc.header != "" {
				t.Errorf("header malicieux %q aurait dû être ignoré, mais a été réutilisé", tc.header)
			}
			if got == "" {
				t.Error("devrait avoir regénéré un UUID, header vide")
			}
			if _, err := uuid.Parse(got); err != nil {
				t.Errorf("devrait être un UUID valide, obtenu %q (%v)", got, err)
			}
		})
	}
}

// TestRequestID_AcceptsAllUUIDVersions : on accepte v1, v3, v4, v5
// — n'importe quel UUID bien formé. Le client upstream décide
// quelle version ; on valide juste la FORME.
func TestRequestID_AcceptsAllUUIDVersions(t *testing.T) {
	r := setupRequestIDRouter()

	cases := []string{
		"550e8400-e29b-41d4-a716-446655440000", // v4 random
		"550e8400-e29b-11d4-a716-446655440000", // v1 (time-based)
		"6ba7b810-9dad-11d1-80b4-00c04fd430c8", // v1 namespace
	}
	for _, incoming := range cases {
		t.Run(incoming, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/x", nil)
			req.Header.Set(HeaderRequestID, incoming)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if got := rec.Header().Get(HeaderRequestID); got != incoming {
				t.Errorf("UUID %q devrait être réutilisé, mais regénéré en %q", incoming, got)
			}
		})
	}
}

// TestRequestID_UniquePerRequest : deux requêtes consécutives
// ont des IDs différents (pas de state partagé foireux).
func TestRequestID_UniquePerRequest(t *testing.T) {
	r := setupRequestIDRouter()

	seen := make(map[string]bool, 5)
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest("GET", "/x", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		id := rec.Header().Get(HeaderRequestID)
		if seen[id] {
			t.Errorf("duplicate ID %q à la requête #%d", id, i)
		}
		seen[id] = true
	}
}

// TestGetRequestID_NoMiddleware : si la middleware n'a pas
// tourné (handler appelé directement), GetRequestID retourne "".
func TestGetRequestID_NoMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	if got := GetRequestID(c); got != "" {
		t.Errorf("attendu '' sans middleware, obtenu %q", got)
	}
}
