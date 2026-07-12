// CORS strict (cf. H1 audit) — defense in depth.
//
// Ce package fournit DEUX middlewares Gin, à monter dans cet ordre
// (avant les middlewares métier) :
//
//	r.Use(middleware.OriginCheckMiddleware())  // 1. valide l'origine
//	r.Use(middleware.PreflightMiddleware())     // 2. gère les OPTIONS
//
// Pourquoi deux middlewares séparés :
//   - OriginCheckMiddleware : s'exécute sur CHAQUE requête, fail-fast
//     (403) si l'Origin n'est pas dans la whitelist. C'est la
//     première ligne de défense.
//   - PreflightMiddleware : s'exécute APRÈS, et short-circuit
//     les OPTIONS (réponse 204 avec headers CORS) avant qu'ils
//     n'atteignent les handlers métier. C'est la deuxième ligne.
//
// Comportement par environnement :
//   - APP_ENV=production : AUCUN default. Si CORS_ORIGINS vide → panic.
//   - APP_ENV=development : fallback localhost (5173/8888/3000) si non défini.
//
// Toujours :
//   - Origin est comparé en exact match (pas de wildcard, pas de regex).
//   - AllowCredentials true uniquement si l'origin est dans la whitelist.
//   - Chaque Origin refusée est loggée (utile pour détecter les scans).
//   - Preflight invalide (méthode/header demandé不在 la liste) → 403.
//   - Same-origin et requêtes sans Origin : passent (server-to-server OK).
package middleware

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// allowedOrigins stocke la whitelist chargée au démarrage.
var allowedOrigins []string

// allowedMethods est la liste des méthodes HTTP qu'on accepte dans
// Access-Control-Request-Method. Le serveur n'autorise que ces
// méthodes dans le preflight ; une autre méthode demandée par le
// client est rejetée en 403.
var allowedMethods = map[string]bool{
	"GET":     true,
	"POST":    true,
	"PUT":     true,
	"PATCH":   true,
	"DELETE":  true,
	"OPTIONS": true,
}

// allowedHeaders est la liste des headers qu'on accepte dans
// Access-Control-Request-Headers. Demander un autre header → 403
// sur le preflight. On autorise Authorization (JWT) et Content-Type
// (JSON) qui sont les deux utilisés par notre frontend.
var allowedHeaders = map[string]bool{
	"authorization": true,
	"content-type":  true,
	"accept":        true,
	"origin":        true,
	"x-request-id":  true,
}

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

// IsAllowedOrigin expose isAllowedOrigin pour les tests et les
// helpers externes (ex: check dans un handler custom).
func IsAllowedOrigin(origin string) bool {
	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

// OriginCheckMiddleware valide que l'Origin (si présent) est dans
// la whitelist. Réponse 403 sur refus, logguée pour détecter les
// scans.
//
// Cas "no Origin" : on laisse passer. Une requête sans Origin
// peut être :
//   - same-origin (le navigateur omet Origin)
//   - server-to-server (curl, backend interne)
//   - un script non-browser (rare, mais possible)
//
// Ces cas sont tous légitimes pour une API — la sécurité CORS est
// uniquement pour les requêtes cross-origin browser. Bloquer les
// no-Origin casserait les clients serveur.
//
// Si l'Origin est autorisé, on pose les headers CORS standard :
//   - Access-Control-Allow-Origin: <origin>   (echo de l'Origin, pas "*")
//   - Access-Control-Allow-Credentials: true  (JWT en cookie/header)
//   - Vary: Origin                            (cache CDN safe)
//   - Access-Control-Expose-Headers            (headers visibles par le JS client)
func OriginCheckMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// Pas d'Origin = requête same-origin ou non-CORS. On laisse
		// passer SANS poser les headers CORS (qui ne s'appliquent
		// pas). C'est le browser qui décide de l'applicabilité.
		if origin == "" {
			c.Next()
			return
		}

		if !IsAllowedOrigin(origin) {
			log.Printf("[CORS] Origin refusée : %s (path=%s, method=%s)",
				origin, c.Request.URL.Path, c.Request.Method)
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":  "origin not allowed",
				"origin": origin,
			})
			return
		}

		// Origin autorisée : on renvoie les headers CORS. Echo de
		// l'Origin (pas de "*") pour permettre AllowCredentials.
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Vary", "Origin")
		// Headers que le JS client peut lire (par défaut, XHR ne
		// peut lire que les 7 "CORS-safelisted" headers). On
		// expose X-Request-ID pour permettre au front de logger
		// l'ID de la requête dans les reports d'erreur.
		c.Header("Access-Control-Expose-Headers", "X-Request-ID, Retry-After")

		c.Next()
	}
}

// PreflightMiddleware gère les requêtes OPTIONS (preflight CORS).
// À monter APRÈS OriginCheckMiddleware : si l'Origin n'est pas
// autorisée, le preflight ne sera pas atteint (déjà 403).
//
// Le preflight CORS contient deux headers spéciaux côté requête :
//   - Access-Control-Request-Method : la méthode que le client
//     compte utiliser (POST, PUT, etc.)
//   - Access-Control-Request-Headers : les headers custom qu'il
//     compte envoyer (Authorization, etc.)
//
// On valide ces deux là contre nos allowedMethods / allowedHeaders.
// Si le client demande un truc qu'on n'autorise pas → 403 sur le
// preflight (= le browser ne tentera même pas la vraie requête).
//
// Réponse 204 No Content avec les headers CORS standards pour que
// le browser autorise la vraie requête qui suit.
func PreflightMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodOptions {
			c.Next()
			return
		}

		// À ce stade, Origin a déjà été validée par
		// OriginCheckMiddleware. On peut donc poser les headers
		// CORS en toute sécurité.

		// Validation Access-Control-Request-Method
		reqMethod := strings.ToUpper(c.GetHeader("Access-Control-Request-Method"))
		if reqMethod != "" && !allowedMethods[reqMethod] {
			log.Printf("[CORS] Preflight refusé : méthode %q non autorisée", reqMethod)
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":   "method not allowed in preflight",
				"method":  reqMethod,
				"allowed": methodList(),
			})
			return
		}

		// Validation Access-Control-Request-Headers (liste CSV)
		reqHeaders := c.GetHeader("Access-Control-Request-Headers")
		if reqHeaders != "" {
			for _, h := range strings.Split(reqHeaders, ",") {
				h = strings.ToLower(strings.TrimSpace(h))
				if h == "" {
					continue
				}
				if !allowedHeaders[h] {
					log.Printf("[CORS] Preflight refusé : header %q non autorisé", h)
					c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
						"error":   "header not allowed in preflight",
						"header":  h,
						"allowed": headerList(),
					})
					return
				}
			}
		}

		// Preflight valide : on renvoie les headers CORS et 204.
		origin := c.GetHeader("Origin")
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Vary", "Origin")
		c.Header("Access-Control-Allow-Methods", strings.Join(methodList(), ", "))
		c.Header("Access-Control-Allow-Headers", strings.Join(headerList(), ", "))
		c.Header("Access-Control-Max-Age", "43200") // 12h
		c.AbortWithStatus(http.StatusNoContent)
	}
}

// methodList retourne les méthodes autorisées sous forme de slice
// (pour les réponses JSON d'erreur + l'enum Access-Control-Allow-Methods).
func methodList() []string {
	out := make([]string, 0, len(allowedMethods))
	for m := range allowedMethods {
		out = append(out, m)
	}
	return out
}

func headerList() []string {
	out := make([]string, 0, len(allowedHeaders))
	for h := range allowedHeaders {
		out = append(out, h)
	}
	return out
}
