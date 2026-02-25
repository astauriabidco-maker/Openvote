package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

type IncidentTypeHandler struct {
	repo repository.IncidentTypeRepository
}

func NewIncidentTypeHandler(repo repository.IncidentTypeRepository) *IncidentTypeHandler {
	return &IncidentTypeHandler{repo: repo}
}

func (h *IncidentTypeHandler) List(c *gin.Context) {
	types, err := h.repo.GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"incident_types": types, "total": len(types)})
}

func (h *IncidentTypeHandler) Create(c *gin.Context) {
	var input struct {
		Name        string `json:"name" binding:"required"`
		Code        string `json:"code" binding:"required"`
		Description string `json:"description"`
		Severity    int    `json:"severity" binding:"required"`
		Color       string `json:"color"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Severity < 1 || input.Severity > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Sévérité entre 1 et 5"})
		return
	}
	if input.Color == "" {
		input.Color = "#8b949e"
	}

	it := &entity.IncidentType{Name: input.Name, Code: input.Code, Description: input.Description, Severity: input.Severity, Color: input.Color}
	if err := h.repo.Create(c.Request.Context(), it); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"incident_type": it})
}

func (h *IncidentTypeHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Type d'incident supprimé"})
}
