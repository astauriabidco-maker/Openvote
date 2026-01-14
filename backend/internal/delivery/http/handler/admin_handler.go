package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/service"
)

type AdminHandler struct {
	enrolmentService service.EnrolmentService
}

func NewAdminHandler(enrolmentService service.EnrolmentService) *AdminHandler {
	return &AdminHandler{enrolmentService: enrolmentService}
}

func (h *AdminHandler) GenerateToken(c *gin.Context) {
	var input struct {
		Role     string `json:"role" binding:"required"`
		RegionID string `json:"region_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Mapping string to Role enum (simplifié)
	role := entity.UserRole(input.Role)
	if role != entity.RoleObserver && role != entity.RoleRegionAdmin && role != entity.RoleSuperAdmin {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}

	token, err := h.enrolmentService.GenerateActivationToken(c.Request.Context(), role, input.RegionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"activation_token": token})
}
