package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

type RegionHandler struct {
	regionRepo repository.RegionRepository
}

func NewRegionHandler(repo repository.RegionRepository) *RegionHandler {
	return &RegionHandler{regionRepo: repo}
}

// ========================================
// Régions
// ========================================

// ListRegions retourne toutes les régions avec leurs départements
func (h *RegionHandler) ListRegions(c *gin.Context) {
	regions, err := h.regionRepo.GetAllRegions(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Pour chaque région, charger ses départements
	type RegionWithDepts struct {
		entity.Region
		Departments []entity.Department `json:"departments"`
		DeptCount   int                 `json:"dept_count"`
	}

	var result []RegionWithDepts
	for _, r := range regions {
		depts, err := h.regionRepo.GetDepartmentsByRegion(c.Request.Context(), r.ID)
		if err != nil {
			depts = []entity.Department{}
		}
		result = append(result, RegionWithDepts{
			Region:      r,
			Departments: depts,
			DeptCount:   len(depts),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"regions": result,
		"total":   len(result),
	})
}

// CreateRegion crée une nouvelle région
func (h *RegionHandler) CreateRegion(c *gin.Context) {
	var input struct {
		Name string `json:"name" binding:"required"`
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	region := &entity.Region{Name: input.Name, Code: input.Code}
	if err := h.regionRepo.CreateRegion(c.Request.Context(), region); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur création région: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"region": region})
}

// UpdateRegion modifie une région existante
func (h *RegionHandler) UpdateRegion(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Name string `json:"name" binding:"required"`
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.regionRepo.UpdateRegion(c.Request.Context(), id, input.Name, input.Code); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Région non trouvée"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Région mise à jour"})
}

// DeleteRegion supprime une région et ses départements (CASCADE)
func (h *RegionHandler) DeleteRegion(c *gin.Context) {
	id := c.Param("id")
	if err := h.regionRepo.DeleteRegion(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Région et départements supprimés"})
}

// ========================================
// Départements
// ========================================

// ListDepartments retourne tous les départements
func (h *RegionHandler) ListDepartments(c *gin.Context) {
	regionID := c.Query("region_id")

	var depts []entity.Department
	var err error

	if regionID != "" {
		depts, err = h.regionRepo.GetDepartmentsByRegion(c.Request.Context(), regionID)
	} else {
		depts, err = h.regionRepo.GetAllDepartments(c.Request.Context())
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"departments": depts,
		"total":       len(depts),
	})
}

// CreateDepartment crée un nouveau département
func (h *RegionHandler) CreateDepartment(c *gin.Context) {
	var input struct {
		Name     string `json:"name" binding:"required"`
		Code     string `json:"code" binding:"required"`
		RegionID string `json:"region_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Vérifier que la région existe
	region, err := h.regionRepo.GetRegionByID(c.Request.Context(), input.RegionID)
	if err != nil || region == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Région introuvable"})
		return
	}

	dept := &entity.Department{Name: input.Name, Code: input.Code, RegionID: input.RegionID}
	if err := h.regionRepo.CreateDepartment(c.Request.Context(), dept); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur création département: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"department": dept})
}

// UpdateDepartment modifie un département
func (h *RegionHandler) UpdateDepartment(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Name             string `json:"name" binding:"required"`
		Code             string `json:"code" binding:"required"`
		RegionID         string `json:"region_id" binding:"required"`
		Population       int    `json:"population"`
		RegisteredVoters int    `json:"registered_voters"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.regionRepo.UpdateDepartment(c.Request.Context(), id, input.Name, input.Code, input.RegionID, input.Population, input.RegisteredVoters); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Département non trouvé"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Département mis à jour"})
}

// DeleteDepartment supprime un département
func (h *RegionHandler) DeleteDepartment(c *gin.Context) {
	id := c.Param("id")
	if err := h.regionRepo.DeleteDepartment(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Département supprimé"})
}
