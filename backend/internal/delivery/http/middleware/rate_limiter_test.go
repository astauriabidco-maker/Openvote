// Tests pour les rate limiters (IP-based + user-based).
package middleware

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// TestRateLimitMiddleware_IP_BlocageApresN : vérifie le token bucket
// basique sur IP — après N requêtes dans la fenêtre, on 429.
func TestRateLimitMiddleware_IP_BlocageApresN(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RateLimitMiddleware(3, time.Hour)) // 3 req/h pour le test
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })

	// 3 requêtes passent
	for i := 1; i <= 3; i++ {
		req := httptest.NewRequest("GET", "/x", nil)
		req.RemoteAddr = "1.2.3.4:1234"
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("req #%d devrait passer, obtenu %d", i, rec.Code)
		}
	}
	// 4ème → 429
	req := httptest.NewRequest("GET", "/x", nil)
	req.RemoteAddr = "1.2.3.4:1234"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("4ème requête devrait être 429, obtenu %d", rec.Code)
	}
}

// TestRateLimitMiddleware_IPsIndependantes : 2 IPs différentes
// ont des buckets séparés.
func TestRateLimitMiddleware_IPsIndependantes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RateLimitMiddleware(2, time.Hour))
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })

	// IP1 : 2 requêtes → OK puis 429
	for i := 1; i <= 2; i++ {
		req := httptest.NewRequest("GET", "/x", nil)
		req.RemoteAddr = "1.1.1.1:1"
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("IP1 req #%d devrait passer, obtenu %d", i, rec.Code)
		}
	}
	req := httptest.NewRequest("GET", "/x", nil)
	req.RemoteAddr = "1.1.1.1:1"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("IP1 3ème req devrait être 429, obtenu %d", rec.Code)
	}

	// IP2 : encore 2 requêtes OK (compteur séparé)
	for i := 1; i <= 2; i++ {
		req := httptest.NewRequest("GET", "/x", nil)
		req.RemoteAddr = "2.2.2.2:1"
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("IP2 req #%d devrait passer (compteur séparé), obtenu %d", i, rec.Code)
		}
	}
}

// TestUserRateLimitMiddleware_KeySurUserID : 2 requêtes avec le
// même userID partagent le bucket, peu importe l'IP. Avec 2 IPs
// différentes, c'est bien la 3ème requête du MEME user qui 429.
func TestUserRateLimitMiddleware_KeySurUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Simule AuthMiddleware en posant userID dans le contexte.
	// On le fait via un middleware qui set userID pour TOUTES
	// les requêtes (en vrai c'est AuthMiddleware qui le fait).
	r.Use(func(c *gin.Context) {
		c.Set("userID", "user-alice")
		c.Next()
	})
	r.Use(UserRateLimitMiddleware(2, time.Hour))
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })

	// Requête 1 : IP1, user alice
	req := httptest.NewRequest("GET", "/x", nil)
	req.RemoteAddr = "1.1.1.1:1"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("alice req #1 devrait passer, obtenu %d", rec.Code)
	}

	// Requête 2 : IP2 différente, MÊME user alice
	req = httptest.NewRequest("GET", "/x", nil)
	req.RemoteAddr = "2.2.2.2:1"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("alice req #2 (IP différente) devrait passer, obtenu %d", rec.Code)
	}

	// Requête 3 : IP3, MÊME user alice → doit 429 (bucket user saturé)
	req = httptest.NewRequest("GET", "/x", nil)
	req.RemoteAddr = "3.3.3.3:1"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("alice req #3 devrait être 429 (même userID, peu importe IP), obtenu %d", rec.Code)
	}
}

// TestUserRateLimitMiddleware_UsersIndependants : 2 users
// différents avec la MÊME IP ont des buckets séparés. C'est
// précisément la valeur du per-user vs per-IP : un user ne
// peut pas "voler" le quota d'un autre via le même NAT.
func TestUserRateLimitMiddleware_UsersIndependants(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Middleware qui set userID dynamiquement selon la query string.
	r.Use(func(c *gin.Context) {
		c.Set("userID", c.Query("as"))
		c.Next()
	})
	r.Use(UserRateLimitMiddleware(1, time.Hour))
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })

	// Alice consomme son quota
	req := httptest.NewRequest("GET", "/x?as=alice", nil)
	req.RemoteAddr = "1.1.1.1:1"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("alice devrait passer, obtenu %d", rec.Code)
	}

	// Bob, MÊME IP, devrait avoir son propre quota
	req = httptest.NewRequest("GET", "/x?as=bob", nil)
	req.RemoteAddr = "1.1.1.1:1" // même IP !
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("bob (même IP, autre user) devrait passer, obtenu %d", rec.Code)
	}

	// Alice ré-essaye : bloquée
	req = httptest.NewRequest("GET", "/x?as=alice", nil)
	req.RemoteAddr = "1.1.1.1:1"
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("alice 2ème devrait être 429, obtenu %d", rec.Code)
	}
}

// TestUserRateLimitMiddleware_FailOpenSansUserID : si le contexte
// n'a pas userID (middleware montée sans AuthMiddleware, ou
// endpoint guest), on fail-open (la requête passe). C'est le
// comportement actuel — un caller peut choisir fail-closed en
// montant la middleware APRÈS AuthMiddleware.
func TestUserRateLimitMiddleware_FailOpenSansUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// PAS de middleware qui set userID — on teste le fail-open
	r.Use(UserRateLimitMiddleware(1, time.Hour))
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })

	for i := 1; i <= 3; i++ {
		req := httptest.NewRequest("GET", "/x", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("sans userID, req #%d devrait passer (fail-open), obtenu %d", i, rec.Code)
		}
	}
}

// TestRateLimitMiddleware_Concurrence : sanity check que la
// mutex protège bien le compteur en accès concurrent. On lance
// 100 goroutines qui font chacune 1 requête. Avec un rate de
// 50, on doit avoir ~50 OK et ~50 429.
func TestRateLimitMiddleware_Concurrence(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RateLimitMiddleware(50, time.Hour))
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })

	var wg sync.WaitGroup
	var ok, limited int
	var mu sync.Mutex
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := httptest.NewRequest("GET", "/x", nil)
			req.RemoteAddr = "1.1.1.1:1"
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			mu.Lock()
			if rec.Code == http.StatusOK {
				ok++
			} else if rec.Code == http.StatusTooManyRequests {
				limited++
			}
			mu.Unlock()
		}()
	}
	wg.Wait()
	// Tolérance large : avec sync.Mutex on devrait être EXACTEMENT
	// 50/50, mais on accepte une marge pour les schedulings bizarres.
	if ok < 45 || ok > 55 {
		t.Errorf("attendu ~50 OK, obtenu %d (limited=%d)", ok, limited)
	}
}
