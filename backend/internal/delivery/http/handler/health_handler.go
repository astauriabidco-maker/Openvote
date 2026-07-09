// Package handler — endpoints de santé (liveness + readiness).
//
// Couvre H5 audit (perf) : un blip DB ne doit PAS redémarrer les pods k8s.
// Solution : séparer liveness (le process tourne) et readiness (les deps
// critiques répondent). Sans ça, un timeout DB momentané fait perdre 30s
// de trafic sur tous les pods jusqu'à ce que k8s les redémarre.
//
// Sémantique k8s attendue :
//   - GET /health  (liveness)  : 200 tant que le process répond. Pas de check DB.
//                              Si cette probe échoue, k8s redémarre le pod.
//   - GET /ready   (readiness) : 200 si toutes les deps critiques OK.
//                              Si cette probe échoue, k8s RETIRE le pod du
//                              load balancer (pas de restart) jusqu'à recovery.
//
// Convention : on ne retourne JAMAIS 503 sur /health. Toujours 200 sauf si
// le serveur HTTP lui-même est dans un état catastrophique (panic, deadlock).
package handler

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ReadinessChecker expose une méthode Ping avec timeout court pour vérifier
// qu'une dépendance externe est joignable. Implémentée par sql.DB et peut
// être mockée en test.
type ReadinessChecker interface {
	PingContext(ctx context.Context) error
}

// HealthHandler regroupe les endpoints de santé.
type HealthHandler struct {
	db        *sql.DB       // peut être nil en dev dégradé
	extra     []NamedChecker // checks additionnels (RabbitMQ, MinIO, etc.)
	pingTimeout time.Duration // timeout par check (défaut 2s)
}

// NamedChecker = readiness checker + nom pour la réponse JSON.
type NamedChecker struct {
	Name  string
	Check ReadinessChecker
}

// NewHealthHandler crée le handler.
// db peut être nil : on l'ignore alors dans la réponse (mode dev dégradé).
// extra peut être nil : pas de checks additionnels.
func NewHealthHandler(db *sql.DB, extra []NamedChecker) *HealthHandler {
	return &HealthHandler{
		db:          db,
		extra:       extra,
		pingTimeout: 2 * time.Second,
	}
}

// Liveness : probe "le process est-il vivant ?"
// Retourne 200 tant que Gin peut router la requête. Pas de check DB.
func (h *HealthHandler) Liveness(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "alive",
	})
}

// Readiness : probe "puis-je accepter du trafic ?"
// Ping la DB + chaque extra checker avec un timeout 2s.
//   - 200 + {"status":"ready","checks":{...}} si tout OK
//   - 503 + {"status":"not_ready","checks":{...}} si une dep tombe
func (h *HealthHandler) Readiness(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), h.pingTimeout)
	defer cancel()

	checks := map[string]string{}
	allOK := true

	// DB check (skip si nil — mode dev dégradé).
	if h.db != nil {
		if err := h.db.PingContext(ctx); err != nil {
			checks["database"] = "FAIL: " + err.Error()
			allOK = false
		} else {
			checks["database"] = "ok"
		}
	} else {
		checks["database"] = "skipped (degraded mode)"
	}

	// Checks additionnels (RabbitMQ, MinIO, etc.).
	for _, nc := range h.extra {
		if nc.Check == nil {
			checks[nc.Name] = "skipped (not configured)"
			continue
		}
		if err := nc.Check.PingContext(ctx); err != nil {
			checks[nc.Name] = "FAIL: " + err.Error()
			allOK = false
		} else {
			checks[nc.Name] = "ok"
		}
	}

	status := "ready"
	httpCode := http.StatusOK
	if !allOK {
		status = "not_ready"
		httpCode = http.StatusServiceUnavailable
	}

	c.JSON(httpCode, gin.H{
		"status": status,
		"checks": checks,
	})
}