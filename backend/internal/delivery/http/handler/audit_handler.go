package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/delivery/http/middleware"
	"github.com/openvote/backend/internal/domain/repository"
)

// AuditHandler expose le journal d'audit persisté en base.
// Les autres handlers écrivent dans ce journal via logAction().
//
// M5 : pagination via ?page=N&limit=M (M5 audit).
type AuditHandler struct {
	auditRepo repository.AuditLogRepository
}

func NewAuditHandler(auditRepo repository.AuditLogRepository) *AuditHandler {
	return &AuditHandler{auditRepo: auditRepo}
}

// GetAuditLogs retourne les entrées du journal d'audit paginées.
// Note : l'implémentation actuelle charge tout en mémoire puis slice.
// Volumes attendus < 100k entrées ; au-delà, pousser LIMIT/OFFSET au repo.
//
// La pagination est validée par la middleware RequirePagination()
// sur la route (cf. cmd/api/main.go). On récupère les valeurs
// validées via middleware.GetPagination(c) — pas de re-parsing.
func (h *AuditHandler) GetAuditLogs(c *gin.Context) {
	page, limit := middleware.GetPagination(c)

	const hardCap = 1000 // garde-fou : un admin ne peut pas dumper > 1000 lignes
	effectiveLimit := hardCap
	if effectiveLimit > limit {
		effectiveLimit = limit
	}

	all, err := h.auditRepo.GetAll(c.Request.Context(), hardCap)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	total := len(all)
	start := (page - 1) * limit
	if start > total {
		start = total
	}
	end := start + effectiveLimit
	if end > total {
		end = total
	}
	pageItems := all[start:end]

	c.JSON(http.StatusOK, PaginatedResponse(pageItems, Pagination{Page: page, Limit: limit}, total))
}