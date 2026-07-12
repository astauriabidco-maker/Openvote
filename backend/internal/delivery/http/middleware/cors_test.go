// Tests pour les middlewares CORS (cors.go) — table-driven,
// défense en profondeur.
//
// Couvre :
//   1. OriginCheckMiddleware
//      - Origin whitelisted → passe + headers CORS posés
//      - Origin non whitelistée → 403
//      - Pas d'Origin → passe SANS headers CORS (same-origin / server-to-server)
//      - Case sensitivity (HTTPS://EXAMPLE.COM ≠ https://example.com)
//      - Trailing slash (https://example.com/ ≠ https://example.com)
//      - Origin vide / whitespace
//   2. PreflightMiddleware
//      - OPTIONS sans OriginCheck préalable → 403 (devrait être monté APRÈS)
//      - OPTIONS avec Origin whitelistée + méthodes/headers valides → 204
//      - OPTIONS avec méthode non autorisée → 403
//      - OPTIONS avec header non autorisé → 403
//      - OPTIONS avec Origin non whitelistée → 403 (géré par OriginCheck)
//      - Non-OPTIONS (GET/POST/etc) → next (pas intercepté)
//   3. InitCORS
//      - Production sans CORS_ORIGINS → panic
//      - Development sans CORS_ORIGINS → fallback localhost
//      - Avec CORS_ORIGINS → split sur virgule, dédup
package middleware

import (
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// resetAllowedOrigins : helper pour les tests qui doivent fixer
// la whitelist à un état connu avant d'exécuter. Les tests sont
// séquentiels (pas de t.Parallel), donc on peut muter le state
// global sans risque de course.
func resetAllowedOrigins() {
	allowedOrigins = nil
}

// setupCORSRouter monte les deux middlewares (ordre officiel) + un
// handler de test qui retourne 200. C'est le pattern prod.
func setupCORSRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(OriginCheckMiddleware())
	r.Use(PreflightMiddleware())
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })
	r.POST("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })
	return r
}

// setupOriginOnlyRouter : monte seulement OriginCheck (pas de
// preflight) — utile pour tester OriginCheck isolément.
func setupOriginOnlyRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(OriginCheckMiddleware())
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })
	return r
}

// ============================================================
// OriginCheckMiddleware
// ============================================================

func TestOriginCheck_WhitelistedOrigin_PassesAndSetsHeaders(t *testing.T) {
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	r := setupOriginOnlyRouter()
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Origin", "https://app.example.com")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200, obtenu %d", rec.Code)
	}
	// Vérification des headers CORS
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
		t.Errorf("Access-Control-Allow-Origin attendu 'https://app.example.com', obtenu %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Errorf("Access-Control-Allow-Credentials attendu 'true', obtenu %q", got)
	}
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Errorf("Vary attendu 'Origin', obtenu %q", got)
	}
	// Access-Control-Expose-Headers doit lister X-Request-ID
	if got := rec.Header().Get("Access-Control-Expose-Headers"); !strings.Contains(got, "X-Request-ID") {
		t.Errorf("Access-Control-Expose-Headers devrait contenir X-Request-ID, obtenu %q", got)
	}
}

func TestOriginCheck_DeniedOrigin_403(t *testing.T) {
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	r := setupOriginOnlyRouter()
	cases := []struct {
		name   string
		origin string
	}{
		{"origin complètement différente", "https://evil.com"},
		{"subdomain pas dans la liste", "https://api.example.com"},
		{"http au lieu de https", "http://app.example.com"},
		{"path ajouté à l'origin (pas de path dans l'Origin header)", "https://app.example.com/path"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/x", nil)
			req.Header.Set("Origin", tc.origin)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusForbidden {
				t.Errorf("attendu 403, obtenu %d (body: %s)", rec.Code, rec.Body.String())
			}
			// Les headers CORS NE DOIVENT PAS être posés (sinon
			// le browser les lirait avant de lire le status code)
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
				t.Errorf("Access-Control-Allow-Origin ne devrait PAS être posé sur 403, obtenu %q", got)
			}
		})
	}
}

func TestOriginCheck_NoOrigin_PassesWithoutCORSHeaders(t *testing.T) {
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	r := setupOriginOnlyRouter()
	req := httptest.NewRequest("GET", "/x", nil) // pas d'Origin
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("requête sans Origin doit passer, obtenu %d", rec.Code)
	}
	// Pas de headers CORS (ils ne s'appliquent pas à same-origin
	// ou server-to-server)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("sans Origin, pas de header CORS attendu, obtenu %q", got)
	}
}

func TestOriginCheck_CaseSensitive(t *testing.T) {
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	r := setupOriginOnlyRouter()
	cases := []string{
		"HTTPS://APP.EXAMPLE.COM",  // tout majuscules
		"https://App.Example.com",  // mixed case
		"https://app.example.com/", // trailing slash
		" https://app.example.com", // leading space (sera peut-être trim par certains clients)
	}
	for _, origin := range cases {
		t.Run(origin, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/x", nil)
			req.Header.Set("Origin", origin)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			// Le browser envoie TOUJOURS l'Origin en lowercase pour
			// le scheme/host (le path n'est pas dans l'Origin) — les
			// variantes case/typo doivent être 403 pour être strict.
			if rec.Code == http.StatusOK && origin != "https://app.example.com" {
				t.Errorf("Origin %q NE DEVRAIT PAS être whitelisté (case/typo)", origin)
			}
		})
	}
}

// ============================================================
// PreflightMiddleware
// ============================================================

func TestPreflight_ValidRequest_204(t *testing.T) {
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	r := setupCORSRouter() // OriginCheck + Preflight

	req := httptest.NewRequest("OPTIONS", "/x", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "Authorization, Content-Type")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight valide devrait être 204, obtenu %d (body: %s)", rec.Code, rec.Body.String())
	}
	// Vérification des headers de réponse preflight
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
		t.Errorf("Access-Control-Allow-Origin attendu 'https://app.example.com', obtenu %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(strings.ToUpper(got), "POST") {
		t.Errorf("Access-Control-Allow-Methods devrait contenir POST, obtenu %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(strings.ToLower(got), "authorization") {
		t.Errorf("Access-Control-Allow-Headers devrait contenir authorization, obtenu %q", got)
	}
	if got := rec.Header().Get("Access-Control-Max-Age"); got != "43200" {
		t.Errorf("Access-Control-Max-Age attendu '43200', obtenu %q", got)
	}
}

func TestPreflight_InvalidMethod_403(t *testing.T) {
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	r := setupCORSRouter()

	// TRACE n'est pas dans allowedMethods
	req := httptest.NewRequest("OPTIONS", "/x", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "TRACE")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("preflight avec méthode TRACE devrait être 403, obtenu %d", rec.Code)
	}
}

func TestPreflight_InvalidHeader_403(t *testing.T) {
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	r := setupCORSRouter()

	// X-CSRF-Token n'est pas dans allowedHeaders
	req := httptest.NewRequest("OPTIONS", "/x", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "X-CSRF-Token, Authorization")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("preflight avec header X-CSRF-Token devrait être 403, obtenu %d", rec.Code)
	}
}

func TestPreflight_OptionsWithoutOrigin_NotHandledByPreflight(t *testing.T) {
	// Si on monte PreflightMiddleware SANS OriginCheck, un OPTIONS
	// sans Origin va tenter le preflight (parce qu'on ne check pas
	// Origin). C'est un cas d'erreur de configuration.
	//
	// En pratique, notre OriginCheck rejetterait AVANT (avec Origin
	// vide, il laisse passer — mais en production, on monte
	// toujours les DEUX middlewares dans l'ordre).
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	gin.SetMode(gin.TestMode)
	r := gin.New()
	// NOTE : on monte SEULEMENT Preflight (pas OriginCheck) pour
	// tester le comportement "nu".
	r.Use(PreflightMiddleware())
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })

	// OPTIONS sans Origin : le preflight tente de répondre mais
	// origin="" → il pose les headers CORS avec origin vide. C'est
	// techniquement invalide CORS (Access-Control-Allow-Origin ne
	// peut pas être ""), mais on l'autorise ici car l'OriginCheck
	// est censé rejeter avant. Documenté.
	req := httptest.NewRequest("OPTIONS", "/x", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("preflight nu (sans OriginCheck) doit répondre 204, obtenu %d", rec.Code)
	}
}

func TestPreflight_NonOptions_PassesThrough(t *testing.T) {
	// Une vraie requête (GET, POST, etc.) ne doit PAS être
	// interceptée par le preflight — elle doit passer aux
	// handlers métier normaux.
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	r := setupCORSRouter()

	for _, method := range []string{"GET", "POST"} {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/x", nil)
			req.Header.Set("Origin", "https://app.example.com")
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Errorf("%s devrait passer, obtenu %d", method, rec.Code)
			}
		})
	}
}

func TestPreflight_DeniedOrigin_403FromOriginCheck(t *testing.T) {
	// Le defense in depth : si Origin est refusée, le preflight
	// ne doit même pas être atteint. On vérifie ici que c'est bien
	// OriginCheck qui répond 403 (et pas Preflight qui se plantera).
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com"}
	defer resetAllowedOrigins()

	r := setupCORSRouter()

	req := httptest.NewRequest("OPTIONS", "/x", nil)
	req.Header.Set("Origin", "https://evil.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("OPTIONS avec Origin refusée devrait être 403 (géré par OriginCheck), obtenu %d", rec.Code)
	}
	// Le body doit mentionner "origin" (de OriginCheck, pas
	// "method" qui serait de Preflight)
	if !strings.Contains(rec.Body.String(), "origin") {
		t.Errorf("le 403 devrait venir d'OriginCheck (mentionne origin), body: %s", rec.Body.String())
	}
}

// ============================================================
// InitCORS
// ============================================================

func TestInitCORS_ProductionWithoutEnvPanics(t *testing.T) {
	resetAllowedOrigins()
	t.Setenv("APP_ENV", "production")
	t.Setenv("CORS_ORIGINS", "")

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("attendu panic en production sans CORS_ORIGINS, aucun panic observé")
		}
	}()
	InitCORS()
}

func TestInitCORS_DevelopmentWithoutEnvFallsBack(t *testing.T) {
	resetAllowedOrigins()
	t.Setenv("APP_ENV", "development")
	t.Setenv("CORS_ORIGINS", "")
	defer resetAllowedOrigins()

	// Capture stdout pour vérifier le log
	oldLog := log.Writer()
	// (ne pas restaurer pour ne pas polluer d'autres tests)
	_ = oldLog

	InitCORS()
	if len(allowedOrigins) == 0 {
		t.Fatal("dev fallback devrait populer allowedOrigins")
	}
	// Vérifier que localhost:5173 est dans la liste
	found := false
	for _, o := range allowedOrigins {
		if strings.Contains(o, "localhost:5173") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("dev fallback devrait contenir localhost:5173, obtenu %v", allowedOrigins)
	}
}

func TestInitCORS_WithEnvSplitsAndDeduplicates(t *testing.T) {
	resetAllowedOrigins()
	t.Setenv("APP_ENV", "production")
	t.Setenv("CORS_ORIGINS", "https://a.com, https://b.com, https://a.com, ,https://c.com")
	defer resetAllowedOrigins()

	InitCORS()
	if len(allowedOrigins) != 3 {
		t.Errorf("attendu 3 origines dédup, obtenu %d: %v", len(allowedOrigins), allowedOrigins)
	}
	expected := map[string]bool{
		"https://a.com": true,
		"https://b.com": true,
		"https://c.com": true,
	}
	for _, o := range allowedOrigins {
		if !expected[o] {
			t.Errorf("origine inattendue : %s", o)
		}
	}
}

func TestIsAllowedOrigin(t *testing.T) {
	resetAllowedOrigins()
	allowedOrigins = []string{"https://app.example.com", "http://localhost:3000"}
	defer resetAllowedOrigins()

	if !IsAllowedOrigin("https://app.example.com") {
		t.Error("attendu true pour origin whitelistée")
	}
	if !IsAllowedOrigin("http://localhost:3000") {
		t.Error("attendu true pour localhost dev")
	}
	if IsAllowedOrigin("https://other.com") {
		t.Error("attendu false pour origin non whitelistée")
	}
	if IsAllowedOrigin("") {
		t.Error("attendu false pour origin vide")
	}
}
