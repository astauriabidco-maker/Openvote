package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

type ElectionHandler struct {
	electionRepo repository.ElectionRepository
}

func NewElectionHandler(repo repository.ElectionRepository) *ElectionHandler {
	return &ElectionHandler{electionRepo: repo}
}

func (h *ElectionHandler) List(c *gin.Context) {
	elections, err := h.electionRepo.GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"elections": elections, "total": len(elections)})
}

func (h *ElectionHandler) Create(c *gin.Context) {
	var input struct {
		Name        string `json:"name" binding:"required"`
		Type        string `json:"type" binding:"required"`
		Date        string `json:"date" binding:"required"`
		Description string `json:"description"`
		RegionIDs   string `json:"region_ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	date, err := time.Parse(time.RFC3339, input.Date)
	if err != nil {
		date, err = time.Parse("2006-01-02", input.Date)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Format de date invalide (YYYY-MM-DD ou RFC3339)"})
			return
		}
	}

	regionIDs := input.RegionIDs
	if regionIDs == "" {
		regionIDs = "all"
	}

	election := &entity.Election{
		Name:        input.Name,
		Type:        input.Type,
		Status:      entity.ElectionPlanned,
		Date:        date,
		Description: input.Description,
		RegionIDs:   regionIDs,
	}

	if err := h.electionRepo.Create(c.Request.Context(), election); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"election": election})
}

func (h *ElectionHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Name        string `json:"name" binding:"required"`
		Type        string `json:"type" binding:"required"`
		Date        string `json:"date" binding:"required"`
		Description string `json:"description"`
		RegionIDs   string `json:"region_ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	date, err := time.Parse(time.RFC3339, input.Date)
	if err != nil {
		date, _ = time.Parse("2006-01-02", input.Date)
	}

	election := &entity.Election{
		ID:          id,
		Name:        input.Name,
		Type:        input.Type,
		Date:        date,
		Description: input.Description,
		RegionIDs:   input.RegionIDs,
	}
	if err := h.electionRepo.Update(c.Request.Context(), election); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Scrutin mis à jour"})
}

func (h *ElectionHandler) UpdateStatus(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	validStatuses := map[string]bool{"planned": true, "active": true, "closed": true, "archived": true}
	if !validStatuses[input.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Statut invalide"})
		return
	}

	if err := h.electionRepo.UpdateStatus(c.Request.Context(), id, entity.ElectionStatus(input.Status)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Statut mis à jour"})
}

func (h *ElectionHandler) Delete(c *gin.Context) {
	if err := h.electionRepo.Delete(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Scrutin supprimé"})
}
