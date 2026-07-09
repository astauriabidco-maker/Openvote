package middleware

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// ============================================================
// CORS strict (cf. H1 audit)
// ============================================================
// Remplace la config permissive de gin-contrib/cors par une validation
// explicite contre une whitelist chargée depuis CORS_ORIGINS.
//
// Comportement par environnement :
//   - APP_ENV=production : AUCUN default. Si CORS_ORIGINS vide → panic.
//   - APP_ENV=development : fallback localhost (5173/8888/3000) si non défini.
//
// Toujours :
//   - Origin est comparé en exact match (pas de wildcard).
//   - AllowCredentials true uniquement si l'origin est dans la whitelist.
//   - Chaque Origin refusée est loggée (utile pour détecter les scans).
// ============================================================

// allowedOrigins stocke la whitelist chargée au démarrage.
var allowedOrigins []string

// InitCORS charge la whitelist depuis l'environnement. À appeler au
// démarrage du serveur (panic en prod si la config manque).
func InitCORS() {
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "development"
	}
	raw := strings.TrimSpace(os.Getenv("CORS_ORIGINS"))

	switch {
	case raw == "" && env == "production":
		// Fail-fast : en prod, on refuse de démarrer sans whitelist explicite.
		panic("FATAL: CORS_ORIGINS non défini en production (APP_ENV=production). " +
			"Définissez la liste des origines autorisées, ex: https://openvote.example.com")

	case raw == "" && env == "development":
		// Dev : fallback explicite et loggé.
		allowedOrigins = []string{
			"http://localhost:5173",
			"http://localhost:8888",
			"http://localhost:3000",
			"http://127.0.0.1:5173",
		}
		log.Printf("[CORS] APP_ENV=development, CORS_ORIGINS absent — fallback dev: %v", allowedOrigins)

	default:
		// Production ou dev explicite : split sur virgule, trim, dédup.
		seen := make(map[string]bool, 8)
		for _, o := range strings.Split(raw, ",") {
			o = strings.TrimSpace(o)
			if o == "" || seen[o] {
				continue
			}
			seen[o] = true
			allowedOrigins = append(allowedOrigins, o)
		}
		log.Printf("[CORS] Whitelist chargée (%d origines) : %v", len(allowedOrigins), allowedOrigins)
	}
}

// CORSMiddleware applique la politique stricte. À monter AVANT les autres
// middlewares pour rejeter les origines invalides en premier.
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// Pas d'Origin = requête same-origin ou non-CORS. On laisse passer.
		if origin == "" {
			c.Next()
			return
		}

		if !isAllowedOrigin(origin) {
			log.Printf("[CORS] Origin refusée : %s (path=%s)", origin, c.Request.URL.Path)
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":  "origin not allowed",
				"origin": origin,
			})
			return
		}

		// Origin autorisée : on renvoie les headers CORS.
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Vary", "Origin")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization")
		c.Header("Access-Control-Max-Age", "43200") // 12h

		// Preflight : on répond directement sans router.
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func isAllowedOrigin(origin string) bool {
	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}