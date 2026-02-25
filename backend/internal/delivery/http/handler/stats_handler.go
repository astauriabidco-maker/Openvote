package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/service"
)

type StatsHandler struct {
	reportService service.ReportService
}

func NewStatsHandler(rs service.ReportService) *StatsHandler {
	return &StatsHandler{reportService: rs}
}

// GetStats retourne les statistiques agrégées des signalements
func (h *StatsHandler) GetStats(c *gin.Context) {
	ctx := c.Request.Context()

	allReports, err := h.reportService.GetAllReports(ctx, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Compteurs par statut
	statusCounts := map[string]int{
		"verified": 0,
		"pending":  0,
		"rejected": 0,
	}

	// Compteurs par type d'incident
	incidentCounts := make(map[string]int)

	// Compteurs par heure
	hourlyCounts := make(map[int]int)

	// Compteurs par observateur
	observerCounts := make(map[string]int)

	// Traitement
	var recentReports []map[string]interface{}
	now := time.Now()
	last24h := 0

	for _, r := range allReports {
		statusCounts[string(r.Status)]++
		incidentCounts[r.IncidentType]++
		observerCounts[r.ObserverID]++

		hour := r.CreatedAt.Hour()
		hourlyCounts[hour]++

		// Dernières 24h
		if now.Sub(r.CreatedAt) < 24*time.Hour {
			last24h++
		}

		// Derniers rapports (max 10)
		if len(recentReports) < 10 {
			recentReports = append(recentReports, map[string]interface{}{
				"id":            r.ID,
				"incident_type": r.IncidentType,
				"status":        r.Status,
				"created_at":    r.CreatedAt,
			})
		}
	}

	// Top observateurs
	type observerEntry struct {
		ID    string `json:"id"`
		Count int    `json:"count"`
	}
	var topObservers []observerEntry
	for id, count := range observerCounts {
		topObservers = append(topObservers, observerEntry{ID: id, Count: count})
	}
	// Tri simple (bulle) pour les top 5
	for i := 0; i < len(topObservers); i++ {
		for j := i + 1; j < len(topObservers); j++ {
			if topObservers[j].Count > topObservers[i].Count {
				topObservers[i], topObservers[j] = topObservers[j], topObservers[i]
			}
		}
	}
	if len(topObservers) > 5 {
		topObservers = topObservers[:5]
	}

	_ = entity.StatusPending // Pour garder l'import

	c.JSON(http.StatusOK, gin.H{
		"total":            len(allReports),
		"last_24h":         last24h,
		"status_counts":    statusCounts,
		"incident_counts":  incidentCounts,
		"hourly_counts":    hourlyCounts,
		"top_observers":    topObservers,
		"recent_reports":   recentReports,
		"unique_observers": len(observerCounts),
		"generated_at":     time.Now(),
	})
}
