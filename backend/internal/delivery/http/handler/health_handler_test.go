// Tests pour le health handler (H5 audit : liveness vs readiness).
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// mockChecker implémente ReadinessChecker pour les tests.
type mockChecker struct {
	pingErr error
	delay   time.Duration
}

func (m *mockChecker) PingContext(ctx context.Context) error {
	if m.delay > 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(m.delay):
		}
	}
	return m.pingErr
}

// setupRouter minimal pour tester les handlers Gin sans DB.
func setupRouter(h *HealthHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/health", h.Liveness)
	r.GET("/ready", h.Readiness)
	return r
}

// TestLivenessToujours200 : la liveness probe répond 200 tant que Gin route.
// C'est le comportement attendu par k8s (pas de check DB, pas de restart inutile).
func TestLivenessToujours200(t *testing.T) {
	h := NewHealthHandler(nil, nil)
	r := setupRouter(h)

	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("attendu 200, obtenu %d", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("réponse non-JSON : %v", err)
	}
	if body["status"] != "alive" {
		t.Errorf("status attendu 'alive', obtenu %q", body["status"])
	}
}

// TestReadinessPasDeDeps : avec db=nil et extra=nil, le status est "ready"
// (DB marquée "skipped" car on est en mode dev dégradé).
func TestReadinessPasDeDeps(t *testing.T) {
	h := NewHealthHandler(nil, nil)
	r := setupRouter(h)

	req := httptest.NewRequest("GET", "/ready", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("attendu 200 (no deps to check), obtenu %d", rec.Code)
	}
	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("réponse non-JSON : %v", err)
	}
	if body["status"] != "ready" {
		t.Errorf("status attendu 'ready', obtenu %v", body["status"])
	}
	checks := body["checks"].(map[string]interface{})
	if checks["database"] != "skipped (degraded mode)" {
		t.Errorf("DB devrait être skipped, obtenu %q", checks["database"])
	}
}

// TestReadinessDBCheckerOK : mockChecker OK → status "ready", 200.
func TestReadinessDBCheckerOK(t *testing.T) {
	db := &mockChecker{pingErr: nil}
	h := NewHealthHandler(nil, []NamedChecker{{Name: "database", Check: db}})
	r := setupRouter(h)

	req := httptest.NewRequest("GET", "/ready", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("attendu 200, obtenu %d", rec.Code)
	}
	var body map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["status"] != "ready" {
		t.Errorf("status attendu 'ready', obtenu %v", body["status"])
	}
	checks := body["checks"].(map[string]interface{})
	if checks["database"] != "ok" {
		t.Errorf("database devrait être 'ok', obtenu %q", checks["database"])
	}
}

// TestReadinessDBCheckerKO : mockChecker retourne une erreur → status "not_ready", 503.
func TestReadinessDBCheckerKO(t *testing.T) {
	db := &mockChecker{pingErr: errors.New("connection refused")}
	h := NewHealthHandler(nil, []NamedChecker{{Name: "database", Check: db}})
	r := setupRouter(h)

	req := httptest.NewRequest("GET", "/ready", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("attendu 503, obtenu %d", rec.Code)
	}
	var body map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["status"] != "not_ready" {
		t.Errorf("status attendu 'not_ready', obtenu %v", body["status"])
	}
	checks := body["checks"].(map[string]interface{})
	dbStatus, _ := checks["database"].(string)
	if dbStatus == "ok" || dbStatus == "" {
		t.Errorf("database devrait indiquer FAIL, obtenu %q", dbStatus)
	}
}

// TestReadinessUnEchecSuffit : si UNE dep tombe parmi plusieurs, status "not_ready".
func TestReadinessUnEchecSuffit(t *testing.T) {
	db := &mockChecker{pingErr: nil}
	rabbit := &mockChecker{pingErr: errors.New("broker down")}
	h := NewHealthHandler(nil, []NamedChecker{
		{Name: "database", Check: db},
		{Name: "rabbitmq", Check: rabbit},
	})
	r := setupRouter(h)

	req := httptest.NewRequest("GET", "/ready", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("attendu 503 dès qu'une dep tombe, obtenu %d", rec.Code)
	}
}

// TestReadinessExtraCheckerKO : un ReadinessChecker arbitraire (nommé ici
// "minio" pour refléter le wiring prod) qui retourne une erreur fait passer
// /ready en 503 avec le nom du checker dans le payload JSON.
//
// Couvre la branche ajoutée par le wiring MinIO : même si *sql.DB est nil et
// que les checkers RabbitMQ sont absents, un seul extra checker en échec
// doit suffire à signaler not_ready. Ce test est volontairement indépendant
// de *sql.DB pour isoler la logique des extraCheckers.
func TestReadinessExtraCheckerKO(t *testing.T) {
	minio := &mockChecker{pingErr: errors.New("minio unreachable: connection refused")}
	h := NewHealthHandler(nil, []NamedChecker{
		{Name: "minio", Check: minio},
	})
	r := setupRouter(h)

	req := httptest.NewRequest("GET", "/ready", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("attendu 503 quand un extra checker échoue, obtenu %d", rec.Code)
	}
	var body map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("réponse non-JSON : %v", err)
	}
	if body["status"] != "not_ready" {
		t.Errorf("status attendu 'not_ready', obtenu %v", body["status"])
	}
	checks := body["checks"].(map[string]interface{})
	minioStatus, _ := checks["minio"].(string)
	if minioStatus == "ok" || minioStatus == "" {
		t.Errorf("checks['minio'] devrait indiquer FAIL, obtenu %q", minioStatus)
	}
	// Et la DB doit rester "skipped" puisqu'on a db=nil.
	if checks["database"] != "skipped (degraded mode)" {
		t.Errorf("database devrait rester 'skipped (degraded mode)', obtenu %q", checks["database"])
	}
}

// TestReadinessTimeout : checker qui prend 5s + pingTimeout 2s → ctx.Err() → 503.
// Important : on évite que le /ready bloque le load balancer pendant des
// minutes si une dep est injoignable.
func TestReadinessTimeout(t *testing.T) {
	slow := &mockChecker{delay: 5 * time.Second}
	h := NewHealthHandler(nil, []NamedChecker{{Name: "slow_dep", Check: slow}})
	h.pingTimeout = 100 * time.Millisecond // override pour test rapide
	r := setupRouter(h)

	start := time.Now()
	req := httptest.NewRequest("GET", "/ready", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	elapsed := time.Since(start)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("attendu 503 sur timeout, obtenu %d", rec.Code)
	}
	if elapsed > 500*time.Millisecond {
		t.Errorf("handler a pris %v, attendu <500ms (timeout était 100ms)", elapsed)
	}
}