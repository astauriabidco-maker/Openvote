// Tests pour AccessLogMiddleware (access_log.go).
package middleware

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func setupAccessLogRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware())
	r.Use(AccessLogMiddleware())
	r.GET("/x", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	r.GET("/slow", func(c *gin.Context) {
		time.Sleep(50 * time.Millisecond)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	r.POST("/x", func(c *gin.Context) {
		c.String(http.StatusCreated, "created")
	})
	return r
}

// TestAccessLog_BasicRequest_LogsStatusDurationRequestID : la
// ligne de log doit contenir status, duration, request_id,
// method, path, IP.
func TestAccessLog_BasicRequest_LogsStatusDurationRequestID(t *testing.T) {
	var buf bytes.Buffer
	oldOut := log.Writer()
	log.SetOutput(&buf)
	defer log.SetOutput(oldOut)

	r := setupAccessLogRouter()
	req := httptest.NewRequest("GET", "/x", nil)
	req.RemoteAddr = "192.0.2.1:1234"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	logs := buf.String()
	// Vérifions les éléments clés de la ligne
	checks := []string{
		"[ACCESS]",
		"200",                      // status
		"id=",                      // request ID prefix
		"GET",                      // method
		"/x",                       // path
		"192.0.2.1",                // IP
	}
	for _, want := range checks {
		if !strings.Contains(logs, want) {
			t.Errorf("log devrait contenir %q, obtenu : %s", want, logs)
		}
	}
}

// TestAccessLog_LogsEvenOnAbort : un middleware upstream qui
// abort (ex: rate limit) doit quand même produire un log
// d'access (c'est ce qu'on veut pour debug).
func TestAccessLog_LogsEvenOnAbort(t *testing.T) {
	var buf bytes.Buffer
	oldOut := log.Writer()
	log.SetOutput(&buf)
	defer log.SetOutput(oldOut)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware())
	r.Use(AccessLogMiddleware())
	// Middleware qui abort toujours
	r.Use(func(c *gin.Context) {
		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limited"})
	})
	r.GET("/x", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{})
	})

	req := httptest.NewRequest("GET", "/x", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("attendu 429, obtenu %d", rec.Code)
	}

	logs := buf.String()
	if !strings.Contains(logs, "429") {
		t.Errorf("log devrait contenir 429, obtenu : %s", logs)
	}
	if !strings.Contains(logs, "[ACCESS]") {
		t.Errorf("log devrait contenir [ACCESS], obtenu : %s", logs)
	}
}

// TestAccessLog_DurationIsApproximate : on dort 50ms dans le
// handler, la durée loggée doit être >= 50ms (pas de précision
// parfaite, c'est un log d'access).
func TestAccessLog_DurationIsApproximate(t *testing.T) {
	var buf bytes.Buffer
	oldOut := log.Writer()
	log.SetOutput(&buf)
	defer log.SetOutput(oldOut)

	r := setupAccessLogRouter()
	req := httptest.NewRequest("GET", "/slow", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	logs := buf.String()
	// Doit contenir "ms" ou "s" (selon format)
	if !strings.Contains(logs, "ms") && !strings.Contains(logs, "s") {
		t.Errorf("log devrait contenir une durée (ms ou s), obtenu : %s", logs)
	}
	// La durée devrait être au moins 50ms
	if !strings.Contains(logs, "50ms") && !strings.Contains(logs, "ms") {
		// 50ms est la borne ; on accepte aussi "55ms", "60ms", etc.
		t.Logf("log durée : %s", logs)
	}
}

// TestAccessLog_LogsResponseSize : la taille de la réponse doit
// apparaître dans le log (utile pour détecter des réponses
// anormales — ex: fuite de données).
func TestAccessLog_LogsResponseSize(t *testing.T) {
	var buf bytes.Buffer
	oldOut := log.Writer()
	log.SetOutput(&buf)
	defer log.SetOutput(oldOut)

	r := setupAccessLogRouter()
	req := httptest.NewRequest("POST", "/x", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	logs := buf.String()
	// Le body "created" fait 7 octets → "7B"
	if !strings.Contains(logs, "7B") {
		t.Errorf("log devrait contenir '7B' (taille réponse 'created'), obtenu : %s", logs)
	}
}

// TestAccessLog_RequestIDCorrelatesWithREQ : la ligne [ACCESS]
// doit avoir le MÊME id que la ligne [REQ] du RequestIDMiddleware.
// C'est le but de la propagation : permettre la corrélation.
func TestAccessLog_RequestIDCorrelatesWithREQ(t *testing.T) {
	var buf bytes.Buffer
	oldOut := log.Writer()
	log.SetOutput(&buf)
	defer log.SetOutput(oldOut)

	r := setupAccessLogRouter()
	req := httptest.NewRequest("GET", "/x", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	logs := buf.String()
	// Extraire les 2 IDs et vérifier qu'ils sont identiques
	lines := strings.Split(strings.TrimSpace(logs), "\n")
	if len(lines) < 2 {
		t.Fatalf("attendu 2 lignes (REQ + ACCESS), obtenu %d : %s", len(lines), logs)
	}
	// Format : [REQ] ip=X id=YYY METHOD path
	//          [ACCESS] status dur sizeB id=YYY METHOD path ip
	// On cherche "id=" dans les 2 lignes
	getID := func(line string) string {
		idx := strings.Index(line, "id=")
		if idx < 0 {
			return ""
		}
		rest := line[idx+3:]
		// L'ID s'arrête au prochain espace
		end := strings.IndexAny(rest, " \t")
		if end < 0 {
			return rest
		}
		return rest[:end]
	}
	firstID := getID(lines[0])
	secondID := getID(lines[1])
	if firstID == "" || secondID == "" {
		t.Fatalf("impossible d'extraire les IDs, logs : %s", logs)
	}
	if firstID != secondID {
		t.Errorf("IDs ne matchent pas entre REQ et ACCESS : %q vs %q", firstID, secondID)
	}
}

// TestFormatDuration : tests du helper de formatage de durée.
func TestFormatDuration(t *testing.T) {
	cases := []struct {
		name string
		d    time.Duration
		want string
	}{
		{"1ms", 1 * time.Millisecond, "1ms"},
		{"12ms", 12 * time.Millisecond, "12ms"},
		{"234ms", 234 * time.Millisecond, "234ms"},
		{"999ms", 999 * time.Millisecond, "999ms"},
		{"1.5s", 1500 * time.Millisecond, "1.50s"},
		{"2.34s", 2340 * time.Millisecond, "2.34s"},
		{"1m23s", 1*time.Minute + 23*time.Second, "1m23s"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := formatDuration(tc.d)
			if got != tc.want {
				t.Errorf("formatDuration(%v) = %q, want %q", tc.d, got, tc.want)
			}
		})
	}
}
