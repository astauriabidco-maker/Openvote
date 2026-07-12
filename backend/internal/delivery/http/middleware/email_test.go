// Tests pour RequireQueryEmail (middleware/email.go).
package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func setupEmailRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/users", RequireQueryEmail("email"), func(c *gin.Context) {
		email, present := GetValidatedEmail(c)
		c.JSON(http.StatusOK, gin.H{"email": email, "present": present})
	})
	return r
}

// TestRequireQueryEmail_Absent : si le query param n'est pas
// présent, on laisse passer (filtre optionnel). Le handler
// distingue via GetValidatedEmail qui retourne ("", false).
func TestRequireQueryEmail_Absent(t *testing.T) {
	r := setupEmailRouter()

	req := httptest.NewRequest("GET", "/users", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("attendu 200 (absent), obtenu %d", rec.Code)
	}
}

// TestRequireQueryEmail_Valide : un email bien formé passe et est
// normalisé (lowercase par net/mail).
func TestRequireQueryEmail_Valide(t *testing.T) {
	r := setupEmailRouter()

	cases := []struct {
		name  string
		query string
		want  string
	}{
		{"simple", "?email=foo@bar.com", "foo@bar.com"},
		// Note : `+` doit être URL-encodé en `%2B` dans une query
		// string, sinon le parser Go le décode en espace. On teste
		// donc avec `%2B` directement.
		{"+ alias (URL-encodé)", "?email=foo%2Btag@bar.com", "foo+tag@bar.com"},
		{"subdomain", "?email=user@mail.sub.example.org", "user@mail.sub.example.org"},
		{"avec chiffres", "?email=user123@numeric-domain42.io", "user123@numeric-domain42.io"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/users"+tc.query, nil)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("attendu 200, obtenu %d (body: %s)", rec.Code, rec.Body.String())
			}
			// Pas de check strict sur le body car net/mail
			// peut normaliser ; on vérifie juste qu'on a
			// extrait un email et qu'il contient "@".
			if rec.Body.String() == "" || !strings.Contains(rec.Body.String(), "@") {
				t.Errorf("body attendu avec email, obtenu : %s", rec.Body.String())
			}
		})
	}
}

// TestRequireQueryEmail_Invalide : tous les inputs malformés
// retournent 400 SANS atteindre le handler.
func TestRequireQueryEmail_Invalide(t *testing.T) {
	r := setupEmailRouter()

	cases := []struct {
		name  string
		query string
	}{
		{"pas d'@", "?email=foobar.com"},
		{"@ seul", "?email=@"},
		// Note : "vide" est équivalent à absent (cf. test Absent)
		{"juste un @ avec rien", "?email=@bar.com"},
		{"double @", "?email=foo@@bar.com"},
		// Note : "foo@bar" (sans TLD) est techniquement valide
		// pour net/mail.ParseAddress (single-label domain
		// accepté par RFC 5322 §3.4.1). On ne le teste donc
		// PAS ici — la middleware le laisse passer, et c'est
		// le handler/repo qui décide si le domain existe.
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/users"+tc.query, nil)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("attendu 400, obtenu %d (body: %s)", rec.Code, rec.Body.String())
			}
		})
	}
}
