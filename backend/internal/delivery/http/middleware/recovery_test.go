// Tests pour RecoveryMiddleware (recovery.go) — vérifie que les
// panics sont catchées et retournent un 500 propre avec request ID,
// sans crasher le serveur.
package middleware

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
)

func setupRecoveryRouter(panicHandler gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware()) // nécessaire pour le test
	r.Use(RecoveryMiddleware())
	r.GET("/panic", panicHandler)
	r.GET("/normal", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	return r
}

// TestRecovery_HandlerPanic_Returns500WithRequestID : un handler
// qui panic doit retourner 500 + JSON {error, request_id} + le
// header X-Request-ID.
func TestRecovery_HandlerPanic_Returns500WithRequestID(t *testing.T) {
	// Capture les logs pour vérifier qu'on a bien loggé la stack
	var logBuf bytes.Buffer
	oldOut := log.Writer()
	log.SetOutput(&logBuf)
	defer log.SetOutput(oldOut)

	r := setupRecoveryRouter(func(c *gin.Context) {
		panic("boom — test panic from handler")
	})

	req := httptest.NewRequest("GET", "/panic", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	// 1. Status code
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("attendu 500, obtenu %d", rec.Code)
	}
	// 2. Content-Type JSON
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Errorf("Content-Type attendu JSON, obtenu %q", ct)
	}
	// 3. Body contient error + request_id
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("JSON body invalide : %v", err)
	}
	if body["error"] == "" {
		t.Error("body devrait contenir 'error'")
	}
	if body["request_id"] == "" {
		t.Error("body devrait contenir 'request_id'")
	}
	// 4. Header X-Request-ID correspond au body
	if headerID := rec.Header().Get(HeaderRequestID); headerID == "" {
		t.Error("header X-Request-ID devrait être posé")
	} else if headerID != body["request_id"] {
		t.Errorf("header (%q) != body request_id (%q)", headerID, body["request_id"])
	}
	// 5. Log contient la stack trace + le request ID
	logs := logBuf.String()
	if !strings.Contains(logs, "[PANIC]") {
		t.Errorf("log devrait contenir [PANIC], obtenu : %s", logs)
	}
	if !strings.Contains(logs, "boom") {
		t.Errorf("log devrait contenir le message de panic 'boom', obtenu : %s", logs)
	}
	if !strings.Contains(logs, body["request_id"]) {
		t.Errorf("log devrait contenir le request_id %q, obtenu : %s", body["request_id"], logs)
	}
}

// TestRecovery_ServerSurvivesPanic : après un panic, le serveur
// continue de servir les requêtes suivantes (un panic ne tue pas
// le process).
func TestRecovery_ServerSurvivesPanic(t *testing.T) {
	r := setupRecoveryRouter(func(c *gin.Context) {
		panic("first request panic")
	})

	// 1. Requête qui panic
	req := httptest.NewRequest("GET", "/panic", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("1ère requête devrait retourner 500, obtenu %d", rec.Code)
	}

	// 2. Requête normale qui suit — doit toujours fonctionner
	req = httptest.NewRequest("GET", "/normal", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("requête normale APRÈS panic devrait passer, obtenu %d (le serveur a crashé ?)", rec.Code)
	}

	// 3. Autre panic — doit aussi être catché
	req = httptest.NewRequest("GET", "/panic", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("2ème panic devrait être catché aussi, obtenu %d", rec.Code)
	}
}

// TestRecovery_NilDereference : un vrai pattern de bug Go
// (variable non init). Doit être catché comme n'importe quel panic.
func TestRecovery_NilDereference(t *testing.T) {
	r := setupRecoveryRouter(func(c *gin.Context) {
		var p *struct{ Name string }
		//nolint:staticcheck // intentional nil deref pour test
		_ = p.Name
	})

	req := httptest.NewRequest("GET", "/panic", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("nil deref devrait être catché, obtenu %d", rec.Code)
	}
}

// TestRecovery_PanicValueNotString : recover() retourne
// interface{} — peut être n'importe quoi (string, error, struct).
// On vérifie que tous les types sont gérés.
func TestRecovery_PanicValueNotString(t *testing.T) {
	cases := []struct {
		name  string
		value interface{}
	}{
		{"string", "boom"},
		{"error", &testError{msg: "structured error"}},
		{"int", 42},
		{"struct", struct{ Code int }{Code: 500}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := setupRecoveryRouter(func(c *gin.Context) {
				panic(tc.value)
			})

			req := httptest.NewRequest("GET", "/panic", nil)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusInternalServerError {
				t.Errorf("panic %v devrait être catché, obtenu %d", tc.value, rec.Code)
			}
		})
	}
}

// TestRecovery_AfterWriteWritten_Panic : si un handler écrit
// dans la response puis panic, on NE PEUT PAS changer le status
// code. La middleware doit détecter ça et juste logger (pas
// essayer d'écrire un 500 par-dessus du HTML).
func TestRecovery_AfterWriteWritten_Panic(t *testing.T) {
	// Capture log pour vérifier qu'on a bien loggé sans
	// envoyer un 500 foireux.
	var logBuf bytes.Buffer
	oldOut := log.Writer()
	log.SetOutput(&logBuf)
	defer log.SetOutput(oldOut)

	r := setupRecoveryRouter(func(c *gin.Context) {
		// Commence à écrire, puis panic
		c.Writer.WriteString("<html>partial body before panic</html>")
		c.Writer.Flush()
		panic("boom after partial write")
	})

	req := httptest.NewRequest("GET", "/panic", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	// Le status code ne peut PAS être 200 (on a écrit du HTML
	// avant), mais on ne doit PAS non plus avoir un 500 propre
	// car on a déjà commencé la réponse.
	body := rec.Body.String()
	if !strings.Contains(body, "partial body") {
		t.Errorf("body devrait contenir le HTML écrit avant le panic, obtenu : %q", body)
	}
	// Le log doit mentionner "response already written"
	if !strings.Contains(logBuf.String(), "response already written") {
		t.Errorf("log devrait mentionner 'response already written', obtenu : %s", logBuf.String())
	}
}

// TestRecovery_ConcurrentPanics : sanity check que le serveur
// peut gérer plusieurs panics en "parallèle" (via httptest.Server,
// pas via appel direct qui n'est pas thread-safe sur gin.Engine).
// 50 requêtes paniquées → 50 × 500, pas de crash.
//
// Note technique : gin.Engine n'est PAS thread-safe pour les
// appels ServeHTTP concurrents (le contexte Gin partage du state
// interne). On utilise httptest.NewServer qui spawn une vraie
// loop HTTP — c'est la façon propre de tester la concurrence.
func TestRecovery_ConcurrentPanics(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware())
	r.Use(RecoveryMiddleware())
	r.GET("/panic", func(c *gin.Context) {
		panic("concurrent boom")
	})
	srv := httptest.NewServer(r)
	defer srv.Close()

	var wg sync.WaitGroup
	var recovered, crashed int
	var mu sync.Mutex
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, err := http.Get(srv.URL + "/panic")
			if err != nil {
				mu.Lock()
				crashed++
				mu.Unlock()
				return
			}
			defer resp.Body.Close()
			mu.Lock()
			if resp.StatusCode == http.StatusInternalServerError {
				recovered++
			} else {
				crashed++
			}
			mu.Unlock()
		}()
	}
	wg.Wait()
	if recovered != 50 {
		t.Errorf("attendu 50 panics recovered, obtenu %d (crashed=%d)", recovered, crashed)
	}
}

// testError : helper pour TestRecovery_PanicValueNotString
type testError struct{ msg string }

func (e *testError) Error() string { return e.msg }

// StringifyPanic test (helper exporté)
func TestStringifyPanic(t *testing.T) {
	if got := StringifyPanic("boom"); got != "boom" {
		t.Errorf("StringifyPanic(string) = %q, want %q", got, "boom")
	}
	if got := StringifyPanic(42); got != "42" {
		t.Errorf("StringifyPanic(int) = %q, want %q", got, "42")
	}
}
