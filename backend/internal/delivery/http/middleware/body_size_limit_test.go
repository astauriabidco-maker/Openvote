// Tests pour MaxBodyBytes (body_size_limit.go) — table-driven.
package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func setupBodyLimitRouter(maxBytes int64) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware())
	r.Use(MaxBodyBytes(maxBytes))
	r.POST("/echo", func(c *gin.Context) {
		// Handler qui lit le body. Si MaxBytesReader a coupé,
		// on aura une erreur de read ici.
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"read_error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"len": len(body)})
	})
	return r
}

// TestBodyLimit_ContentLengthOverLimit_413 : si le client
// annonce Content-Length > max → 413 IMMÉDIATEMENT (fast path),
// sans lire le body.
func TestBodyLimit_ContentLengthOverLimit_413(t *testing.T) {
	const max = 1024 // 1 KB
	r := setupBodyLimitRouter(max)

	body := bytes.Repeat([]byte("A"), 2048) // 2 KB, > max
	req := httptest.NewRequest("POST", "/echo", bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("attendu 413, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	// Le body de la 413 doit contenir les détails
	var body413 map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body413); err != nil {
		t.Fatalf("JSON 413 invalide : %v", err)
	}
	if body413["max_bytes"].(float64) != float64(max) {
		t.Errorf("max_bytes devrait être %d, obtenu %v", max, body413["max_bytes"])
	}
	if body413["received_bytes"].(float64) != float64(len(body)) {
		t.Errorf("received_bytes devrait être %d, obtenu %v", len(body), body413["received_bytes"])
	}
	// request_id doit être présent (propagé via RequestIDMiddleware)
	if body413["request_id"] == "" {
		t.Error("le 413 devrait inclure le request_id")
	}
}

// TestBodyLimit_ContentLengthUnderLimit_Passes : body < max →
// 200 + handler lit normalement.
func TestBodyLimit_ContentLengthUnderLimit_Passes(t *testing.T) {
	const max = 1024
	r := setupBodyLimitRouter(max)

	body := bytes.Repeat([]byte("A"), 512) // 512 B, < max
	req := httptest.NewRequest("POST", "/echo", bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	var resp map[string]int
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("JSON invalide : %v", err)
	}
	if resp["len"] != 512 {
		t.Errorf("handler devrait avoir lu 512 octets, obtenu %d", resp["len"])
	}
}

// TestBodyLimit_ContentLengthExactlyAtLimit_Passes : body = max
// (borne) → 200 (l'inégalité est stricte : <= max, pas <).
func TestBodyLimit_ContentLengthExactlyAtLimit_Passes(t *testing.T) {
	const max = 1024
	r := setupBodyLimitRouter(max)

	body := bytes.Repeat([]byte("A"), max) // exactement max
	req := httptest.NewRequest("POST", "/echo", bytes.NewReader(body))
	req.ContentLength = max
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("body = max devrait passer (borne inclusive), obtenu %d", rec.Code)
	}
}

// TestBodyLimit_NoContentLengthStreaming_Respected : chunked
// transfer (Content-Length absent, -1). Le MaxBytesReader doit
// toujours limiter côté lecture.
func TestBodyLimit_NoContentLengthStreaming_Respected(t *testing.T) {
	const max = 1024
	r := setupBodyLimitRouter(max)

	// On simule un body chunked : httptest.NewRequest met
	// ContentLength à 0 par défaut ; on force à -1 (chunked)
	body := bytes.Repeat([]byte("B"), 2048) // 2 KB
	req := httptest.NewRequest("POST", "/echo", bytes.NewReader(body))
	req.ContentLength = -1 // chunked
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	// Le handler va lire le body, MaxBytesReader va couper après
	// max octets. Le handler reçoit une erreur de read → 400.
	// C'est moins idéal qu'un 413, mais ça catch l'OOM (le vrai
	// objectif de cette middleware).
	if rec.Code != http.StatusBadRequest {
		t.Errorf("chunked > max devrait déclencher 400 du handler (read error), obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
}

// TestBodyLimit_DefaultMaxWhenZero : si on appelle MaxBodyBytes(0),
// on doit avoir DefaultMaxBodyBytes (10 MB), pas 0 (= tout
// passerait).
func TestBodyLimit_DefaultMaxWhenZero(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(MaxBodyBytes(0)) // 0 = use default
	r.POST("/echo", func(c *gin.Context) {
		_, _ = io.ReadAll(c.Request.Body)
		c.JSON(http.StatusOK, gin.H{})
	})

	// Body > DefaultMaxBodyBytes (10 MB + 1)
	// On ne peut pas allouer 10MB en test sans ramer, donc on
	// vérifie juste que la middleware utilise bien le default
	// en utilisant un Content-Length énorme.
	req := httptest.NewRequest("POST", "/echo", bytes.NewReader([]byte("A")))
	req.ContentLength = DefaultMaxBodyBytes + 1
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("Content-Length = default+1 devrait être 413, obtenu %d", rec.Code)
	}
}

// TestFormatHumanBytes : tests du helper de formatage.
func TestFormatHumanBytes(t *testing.T) {
	cases := []struct {
		bytes int64
		want string
	}{
		{0, "0 B"},
		{512, "512 B"},
		{1024, "1.0 KB"},
		{1536, "1.5 KB"},
		{1024 * 1024, "1.0 MB"},
		{10 * 1024 * 1024, "10.0 MB"},
		{1024 * 1024 * 1024, "1.0 GB"},
	}
	for _, tc := range cases {
		t.Run(tc.want, func(t *testing.T) {
			got := formatHumanBytes(tc.bytes)
			if got != tc.want {
				t.Errorf("formatHumanBytes(%d) = %q, want %q", tc.bytes, got, tc.want)
			}
		})
	}
}

// TestBodyLimit_RejectsBeforeHandler : sanity check que le
// 413 se produit AVANT que le handler soit appelé (fast path).
// On vérifie via un handler qui incrémenterait un compteur.
func TestBodyLimit_RejectsBeforeHandler(t *testing.T) {
	const max = 100
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(MaxBodyBytes(max))

	handlerCalled := false
	r.POST("/echo", func(c *gin.Context) {
		handlerCalled = true
		c.JSON(http.StatusOK, gin.H{})
	})

	body := bytes.Repeat([]byte("A"), 200) // > max
	req := httptest.NewRequest("POST", "/echo", bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("attendu 413, obtenu %d", rec.Code)
	}
	if handlerCalled {
		t.Error("le handler ne devrait PAS être appelé (fast path)")
	}
	// Vérifie qu'on a bien un message d'erreur clair (pas juste status)
	if !strings.Contains(rec.Body.String(), "request body too large") {
		t.Errorf("body devrait contenir 'request body too large', obtenu : %s", rec.Body.String())
	}
}
