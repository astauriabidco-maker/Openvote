package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/service"
)

type ReportHandler struct {
	reportService  service.ReportService
	storageService service.StorageService
}

func NewReportHandler(rs service.ReportService, ss service.StorageService) *ReportHandler {
	return &ReportHandler{
		reportService:  rs,
		storageService: ss,
	}
}

// CreateRequest DTO for binding
type CreateReportRequest struct {
	ObserverID   string  `json:"observer_id" binding:"required"`
	IncidentType string  `json:"incident_type" binding:"required"`
	Description  string  `json:"description"`
	Latitude     float64 `json:"latitude" binding:"required"`
	Longitude    float64 `json:"longitude" binding:"required"`
	ProofURL     string  `json:"proof_url"`
}

func (h *ReportHandler) Create(c *gin.Context) {
	var req CreateReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Mapping DTO -> Entity
	// Note: Pour PostGIS, on formatera souvent en WKT "POINT(x y)" -> "POINT(lon lat)"
	report := entity.Report{
		ID:           uuid.New().String(),
		ObserverID:   req.ObserverID,
		IncidentType: req.IncidentType,
		Description:  req.Description,
		GPSLocation:  fmt.Sprintf("POINT(%f %f)", req.Longitude, req.Latitude), // WKT Format
		Status:       entity.StatusPending,
		ProofURL:     req.ProofURL,
		CreatedAt:    time.Now(),
	}

	if err := h.reportService.CreateReport(c.Request.Context(), &report); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create report: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":  "Report created and queued",
		"id":       report.ID,
		"h3_index": report.H3Index,
	})
}

func (h *ReportHandler) GetUploadURL(c *gin.Context) {
	fileName := c.Query("file_name")
	if fileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name query param is required"})
		return
	}

	url, err := h.storageService.GenerateUploadURL(c.Request.Context(), fileName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate upload URL: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload_url": url,
	})
}

func (h *ReportHandler) List(c *gin.Context) {
	status := c.Query("status")
	reports, err := h.reportService.GetAllReports(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, reports)
}

func (h *ReportHandler) GetDetails(c *gin.Context) {
	id := c.Param("id")
	report, err := h.reportService.GetReportByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if report == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "report not found"})
		return
	}

	c.JSON(http.StatusOK, report)
}

// UpdateStatusRequest DTO pour la mise à jour de statut par un admin
type UpdateStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=verified rejected pending"`
}

func (h *ReportHandler) UpdateStatus(c *gin.Context) {
	id := c.Param("id")

	// Vérification du rôle (seuls les admins peuvent changer le statut)
	role, exists := c.Get("role")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "role not found in context"})
		return
	}

	roleStr, ok := role.(string)
	if !ok || (roleStr != string(entity.RoleSuperAdmin) && roleStr != string(entity.RoleRegionAdmin)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions: only admins can update report status"})
		return
	}

	var req UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.reportService.UpdateReportStatus(c.Request.Context(), id, entity.ReportStatus(req.Status)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update report: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Report status updated",
		"id":      id,
		"status":  req.Status,
	})
}
