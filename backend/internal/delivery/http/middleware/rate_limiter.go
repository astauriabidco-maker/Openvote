// Rate limiters (token bucket) — IP-based et user-based.
//
// Le même algorithme Token Bucket est utilisé pour deux cas :
//   1. RateLimitMiddleware    : par IP (c.ClientIP()) — pour les
//      routes non-auth (anti brute-force) ou globales.
//   2. UserRateLimitMiddleware : par userID (depuis le contexte
//      posé par AuthMiddleware) — pour les routes admin sensibles
//      où on veut limiter un utilisateur précis, pas une IP
//      partagée (NAT, CGNAT, VPN d'entreprise, wifi public).
//
// Le token bucket est partagé entre les deux : on généralise sur
// la clé (`visitor map[string]*visitor`) et la fonction qui extrait
// la clé depuis le contexte.
//
// Comportement commun :
//   - Fenêtre glissante : si on a fait N requêtes dans la fenêtre,
//     on renvoie 429 avec retry_after.
//   - Cleanup périodique des visiteurs expirés (2x la fenêtre).
//   - Map partagée via sync.Mutex (single-process). Pour un scale
//     multi-pod, on remplacerait par Redis. Pour l'instant, c'est
//     suffisant (chaque pod a son propre bucket par userID).
package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// tokenBucket est l'algo Token Bucket partagé entre les middlewares
// IP et user. Clé = string (IP ou userID).
type tokenBucket struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int
	window   time.Duration
}

type visitor struct {
	tokens    int
	lastReset time.Time
}

func newTokenBucket(maxRequests int, window time.Duration) *tokenBucket {
	tb := &tokenBucket{
		visitors: make(map[string]*visitor),
		rate:     maxRequests,
		window:   window,
	}
	go tb.cleanup()
	return tb
}

func (tb *tokenBucket) cleanup() {
	ticker := time.NewTicker(tb.window * 2)
	defer ticker.Stop()
	for range ticker.C {
		tb.mu.Lock()
		for key, v := range tb.visitors {
			if time.Since(v.lastReset) > tb.window*2 {
				delete(tb.visitors, key)
			}
		}
		tb.mu.Unlock()
	}
}

// allow teste + décrémente le bucket pour la clé. Retourne true
// si la requête passe, false si rate-limited. retryAfter est
// rempli avec la fenêtre en secondes (pour le body de réponse).
func (tb *tokenBucket) allow(key string) (ok bool, retryAfter time.Duration) {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	v, exists := tb.visitors[key]
	if !exists || time.Since(v.lastReset) > tb.window {
		v = &visitor{
			tokens:    tb.rate,
			lastReset: time.Now(),
		}
		tb.visitors[key] = v
	}
	if v.tokens <= 0 {
		return false, tb.window
	}
	v.tokens--
	return true, 0
}

// rateLimitByKey crée un middleware Gin qui rate-limite par la clé
// extraite via keyFn(c). Si keyFn retourne "" (ex: pas d'auth
// posée), on log et on laisse passer (fail-open) — c'est au caller
// de mettre la middleware APRÈS AuthMiddleware si la clé est
// user-based.
func rateLimitByKey(maxRequests int, window time.Duration, keyFn func(c *gin.Context) string) gin.HandlerFunc {
	tb := newTokenBucket(maxRequests, window)
	return func(c *gin.Context) {
		key := keyFn(c)
		if key == "" {
			// Fail-open : pas de clé identifiable, on log
			// mais on laisse passer. Ça permet de chaîner
			// UserRateLimitMiddleware sur un endpoint
			// accessible en guest (rare) sans crasher.
			// Alternative : fail-closed (429). À activer
			// explicitement si on veut cette garantie.
			c.Next()
			return
		}
		ok, retryAfter := tb.allow(key)
		if !ok {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "too many requests",
				"retry_after": retryAfter.Seconds(),
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RateLimitMiddleware = rate limit par IP (c.ClientIP()).
// Usage typique : anti brute-force sur /auth/login, ou rate
// limit global d'API. Pour les routes admin sensibles, préférer
// UserRateLimitMiddleware (un attaquant derrière un NAT ne
// bloque pas les autres utilisateurs du même réseau).
func RateLimitMiddleware(maxRequests int, window time.Duration) gin.HandlerFunc {
	return rateLimitByKey(maxRequests, window, func(c *gin.Context) string {
		return c.ClientIP()
	})
}

// UserRateLimitMiddleware = rate limit par userID (extrait du
// contexte posé par AuthMiddleware sous la clé "userID").
//
// Pourquoi userID plutôt que IP :
//   - Plusieurs users derrière un même NAT (bureau, campus) ne se
//     bloquent pas mutuellement avec un rate limit IP
//   - Un attaquant qui change d'IP (VPN, Tor) reste bloqué parce
//     son userID est stable
//   - Le quota est attribué à l'utilisateur métier, pas à la
//     machine cliente
//
// IMPORTANT : cette middleware doit être montée APRÈS AuthMiddleware
// (sinon userID n'est pas dans le contexte, et on fail-open via
// le test `if key == ""`).
func UserRateLimitMiddleware(maxRequests int, window time.Duration) gin.HandlerFunc {
	return rateLimitByKey(maxRequests, window, func(c *gin.Context) string {
		if v, ok := c.Get("userID"); ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
		return ""
	})
}
