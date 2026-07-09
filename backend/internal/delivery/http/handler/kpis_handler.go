package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/service"
)

// KPIsHandler agrège les compteurs temps-réel pour le dashboard admin.
// Toutes les requêtes sont best-effort : un échec d'un sous-count ne
// bloque pas les autres.
type KPIsHandler struct {
	userRepo      repository.UserRepository
	reportService service.ReportService
	electionRepo  repository.ElectionRepository
}

func NewKPIsHandler(
	userRepo repository.UserRepository,
	reportService service.ReportService,
	electionRepo repository.ElectionRepository,
) *KPIsHandler {
	return &KPIsHandler{
		userRepo:      userRepo,
		reportService: reportService,
		electionRepo:  electionRepo,
	}
}

// GetKPIs retourne les compteurs principaux pour le dashboard.
func (h *KPIsHandler) GetKPIs(c *gin.Context) {
	ctx := c.Request.Context()

	// Comptage utilisateurs par rôle.
	users, _ := h.userRepo.GetAll(ctx)
	roleCount := make(map[string]int)
	for _, u := range users {
		roleCount[string(u.Role)]++
	}

	// Comptage rapports par statut.
	allReports, _ := h.reportService.GetAllReports(ctx, "")
	verifiedReports, _ := h.reportService.GetAllReports(ctx, "verified")
	pendingReports, _ := h.reportService.GetAllReports(ctx, "pending")
	rejectedCount := len(allReports) - len(verifiedReports) - len(pendingReports)

	// Comptage élections.
	elections, _ := h.electionRepo.GetAll(ctx)
	activeElections := 0
	for _, e := range elections {
		if e.Status == entity.ElectionActive {
			activeElections++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"users": gin.H{
			"total":   len(users),
			"by_role": roleCount,
		},
		"reports": gin.H{
			"total":    len(allReports),
			"verified": len(verifiedReports),
			"pending":  len(pendingReports),
			"rejected": rejectedCount,
		},
		"elections": gin.H{
			"total":  len(elections),
			"active": activeElections,
		},
	})
}