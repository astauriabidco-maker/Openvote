package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
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
func (h *AuditHandler) GetAuditLogs(c *gin.Context) {
	p := ParsePagination(c)

	const hardCap = 1000 // garde-fou : un admin ne peut pas dumper > 1000 lignes
	effectiveLimit := hardCap
	if effectiveLimit > p.Limit {
		effectiveLimit = p.Limit
	}

	all, err := h.auditRepo.GetAll(c.Request.Context(), hardCap)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	total := len(all)
	start := p.Offset()
	if start > total {
		start = total
	}
	end := start + effectiveLimit
	if end > total {
		end = total
	}
	page := all[start:end]

	c.JSON(http.StatusOK, PaginatedResponse(page, p, total))
}