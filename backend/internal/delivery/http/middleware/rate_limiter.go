package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// rateLimiter implémente un algorithme Token Bucket par IP
type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int           // Nombre max de requêtes
	window   time.Duration // Fenêtre temporelle
}

type visitor struct {
	tokens    int
	lastReset time.Time
}

// NewRateLimiter crée un rate limiter avec un nombre max de requêtes par fenêtre
func NewRateLimiter(maxRequests int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{
		visitors: make(map[string]*visitor),
		rate:     maxRequests,
		window:   window,
	}

	// Nettoyage périodique des visiteurs expirés
	go rl.cleanup()

	return rl
}

func (rl *rateLimiter) cleanup() {
	ticker := time.NewTicker(rl.window * 2)
	defer ticker.Stop()

	for range ticker.C {
		rl.mu.Lock()
		for ip, v := range rl.visitors {
			if time.Since(v.lastReset) > rl.window*2 {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *rateLimiter) getVisitor(ip string) *visitor {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[ip]
	if !exists || time.Since(v.lastReset) > rl.window {
		v = &visitor{
			tokens:    rl.rate,
			lastReset: time.Now(),
		}
		rl.visitors[ip] = v
	}

	return v
}

// RateLimitMiddleware crée un middleware Gin de rate limiting par IP
func RateLimitMiddleware(maxRequests int, window time.Duration) gin.HandlerFunc {
	limiter := NewRateLimiter(maxRequests, window)

	return func(c *gin.Context) {
		ip := c.ClientIP()
		v := limiter.getVisitor(ip)

		limiter.mu.Lock()
		if v.tokens <= 0 {
			limiter.mu.Unlock()
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "too many requests",
				"retry_after": limiter.window.Seconds(),
			})
			c.Abort()
			return
		}
		v.tokens--
		limiter.mu.Unlock()

		c.Next()
	}
}
