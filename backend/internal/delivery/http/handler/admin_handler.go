package handler

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/service"
)

type AdminHandler struct {
	enrolmentService service.EnrolmentService
	userRepo         repository.UserRepository
	auditRepo        repository.AuditLogRepository
	reportService    service.ReportService
	electionRepo     repository.ElectionRepository
	legalRepo        repository.LegalRepository
}

func NewAdminHandler(enrolmentService service.EnrolmentService, userRepo repository.UserRepository, auditRepo repository.AuditLogRepository, reportService service.ReportService, electionRepo repository.ElectionRepository, legalRepo repository.LegalRepository) *AdminHandler {
	return &AdminHandler{
		enrolmentService: enrolmentService,
		userRepo:         userRepo,
		auditRepo:        auditRepo,
		reportService:    reportService,
		electionRepo:     electionRepo,
		legalRepo:        legalRepo,
	}
}

// logAction persiste un log d'audit en base
func (h *AdminHandler) logAction(ctx context.Context, adminID, adminName, action, targetID, details string) {
	entry := &entity.AuditLog{
		AdminID:   adminID,
		AdminName: adminName,
		Action:    action,
		TargetID:  targetID,
		Details:   details,
	}
	if err := h.auditRepo.Create(ctx, entry); err != nil {
		log.Printf("[AUDIT] Error persisting log: %v", err)
	}
	log.Printf("[AUDIT] %s | %s | cible: %s | %s", action, adminName, targetID, details)
}

// ========================================
// Génération de Token d'Enrôlement
// ========================================
func (h *AdminHandler) GenerateToken(c *gin.Context) {
	var input struct {
		Role     string `json:"role" binding:"required"`
		RegionID string `json:"region_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := entity.UserRole(input.Role)
	validRoles := map[entity.UserRole]bool{
		entity.RoleObserver:        true,
		entity.RoleLocalCoord:      true,
		entity.RoleRegionAdmin:     true,
		entity.RoleSuperAdmin:      true,
		entity.RoleVerifiedCitizen: true,
		entity.RoleCitizen:         true,
	}
	if !validRoles[role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rôle invalide"})
		return
	}

	token, err := h.enrolmentService.GenerateActivationToken(c.Request.Context(), role, input.RegionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Log d'audit
	adminID, _ := c.Get("userID")
	adminName := c.GetString("username")
	h.logAction(c.Request.Context(), adminID.(string), adminName, "GENERATE_TOKEN", input.RegionID, "Rôle: "+input.Role)

	c.JSON(http.StatusOK, gin.H{
		"activation_token": token,
		"role":             input.Role,
		"region_id":        input.RegionID,
	})
}

// ========================================
// Gestion des Utilisateurs
// ========================================

// ListUsers retourne la liste de tous les utilisateurs
func (h *AdminHandler) ListUsers(c *gin.Context) {
	users, err := h.userRepo.GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Enrichir avec des stats basiques
	type UserResponse struct {
		ID          string     `json:"id"`
		Username    string     `json:"username"`
		Role        string     `json:"role"`
		RegionID    string     `json:"region_id"`
		CreatedAt   time.Time  `json:"created_at"`
		UpdatedAt   time.Time  `json:"updated_at"`
		LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	}

	var response []UserResponse
	for _, u := range users {
		response = append(response, UserResponse{
			ID:          u.ID,
			Username:    u.Username,
			Role:        string(u.Role),
			RegionID:    u.RegionID,
			CreatedAt:   u.CreatedAt,
			UpdatedAt:   u.UpdatedAt,
			LastLoginAt: u.LastLoginAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"users": response,
		"total": len(response),
	})
}

// UpdateUser modifie le rôle et la région d'un utilisateur
func (h *AdminHandler) UpdateUser(c *gin.Context) {
	userID := c.Param("id")

	var input struct {
		Role     string `json:"role" binding:"required"`
		RegionID string `json:"region_id"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validation du rôle
	role := entity.UserRole(input.Role)
	validRoles := map[entity.UserRole]bool{
		entity.RoleObserver:        true,
		entity.RoleLocalCoord:      true,
		entity.RoleRegionAdmin:     true,
		entity.RoleSuperAdmin:      true,
		entity.RoleVerifiedCitizen: true,
		entity.RoleCitizen:         true,
	}
	if !validRoles[role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rôle invalide"})
		return
	}

	// Vérifier que l'utilisateur existe
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Utilisateur non trouvé"})
		return
	}

	// Empêcher de modifier son propre rôle
	currentAdminID, _ := c.Get("userID")
	if currentAdminID.(string) == userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Vous ne pouvez pas modifier votre propre rôle"})
		return
	}

	// Effectuer la mise à jour
	if err := h.userRepo.UpdateRole(c.Request.Context(), userID, role, input.RegionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Log d'audit
	adminName := c.GetString("username")
	h.logAction(c.Request.Context(), currentAdminID.(string), adminName, "UPDATE_ROLE",
		userID, "Ancien: "+string(user.Role)+" → Nouveau: "+input.Role)

	c.JSON(http.StatusOK, gin.H{
		"message":  "Rôle mis à jour",
		"user_id":  userID,
		"new_role": input.Role,
	})
}

// DeleteUser supprime un utilisateur
func (h *AdminHandler) DeleteUser(c *gin.Context) {
	userID := c.Param("id")

	// Empêcher l'auto-suppression
	currentAdminID, _ := c.Get("userID")
	if currentAdminID.(string) == userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Vous ne pouvez pas supprimer votre propre compte"})
		return
	}

	// Vérifier l'existence
	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Utilisateur non trouvé"})
		return
	}

	if err := h.userRepo.Delete(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Log d'audit
	adminName := c.GetString("username")
	h.logAction(c.Request.Context(), currentAdminID.(string), adminName, "DELETE_USER",
		userID, "Utilisateur supprimé: "+user.Username+" ("+string(user.Role)+")")

	c.JSON(http.StatusOK, gin.H{"message": "Utilisateur supprimé", "user_id": userID})
}

// ========================================
// Logs d'Audit
// ========================================

// GetAuditLogs retourne les logs d'audit depuis PostgreSQL
func (h *AdminHandler) GetAuditLogs(c *gin.Context) {
	logs, err := h.auditRepo.GetAll(c.Request.Context(), 200)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs, "total": len(logs)})
}

// ========================================
// Configuration Système
// ========================================
func (h *AdminHandler) GetConfig(c *gin.Context) {
	config := gin.H{
		"triangulation": gin.H{
			"threshold":           1.0,
			"radius_meters":       500,
			"time_window_minutes": 30,
			"weights": gin.H{
				"observer":         1.0,
				"verified_citizen": 0.35,
				"citizen":          0.2,
				"other":            0.1,
			},
		},
		"rate_limiting": gin.H{"global_per_minute": 100, "auth_per_minute": 10},
		"storage":       gin.H{"bucket_name": "evidence", "upload_expiry_min": 15},
		"roles":         []string{"super_admin", "region_admin", "local_coord", "observer", "verified_citizen", "citizen"},
	}

	// Merge overrides
	for k, v := range configOverrides {
		config[k] = v
	}

	c.JSON(http.StatusOK, config)
}

// configOverrides stocke les personnalisations de config
var configOverrides = make(map[string]interface{})

// UpdateConfig met à jour la configuration système
func (h *AdminHandler) UpdateConfig(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for k, v := range input {
		configOverrides[k] = v
	}
	// Log d'audit
	adminName := c.GetString("username")
	adminID, _ := c.Get("userID")
	h.logAction(c.Request.Context(), adminID.(string), adminName, "UPDATE_CONFIG", "", "Configuration mise à jour")
	c.JSON(http.StatusOK, gin.H{"message": "Configuration mise à jour", "overrides": configOverrides})
}

// ========================================
// KPIs Dashboard
// ========================================
func (h *AdminHandler) GetKPIs(c *gin.Context) {
	ctx := c.Request.Context()

	// Comptage utilisateurs
	users, _ := h.userRepo.GetAll(ctx)
	roleCount := make(map[string]int)
	for _, u := range users {
		roleCount[string(u.Role)]++
	}

	// Comptage rapports
	allReports, _ := h.reportService.GetAllReports(ctx, "")
	verifiedReports, _ := h.reportService.GetAllReports(ctx, "verified")
	pendingReports, _ := h.reportService.GetAllReports(ctx, "pending")

	// Comptage élections
	elections, _ := h.electionRepo.GetAll(ctx)
	activeElections := 0
	for _, e := range elections {
		if e.Status == entity.ElectionActive {
			activeElections++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"users": gin.H{
			"total":    len(users),
			"by_role":  roleCount,
		},
		"reports": gin.H{
			"total":    len(allReports),
			"verified": len(verifiedReports),
			"pending":  len(pendingReports),
			"rejected": len(allReports) - len(verifiedReports) - len(pendingReports),
		},
		"elections": gin.H{
			"total":  len(elections),
			"active": activeElections,
		},
	})
}

// ========================================
// Veille Électorale (Intelligence & CMS)
// ========================================

func (h *AdminHandler) GetLegalDocuments(c *gin.Context) {
	docs, err := h.legalRepo.GetAllDocuments(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, docs)
}

func (h *AdminHandler) CreateLegalDocument(c *gin.Context) {
	var input entity.LegalDocument
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.legalRepo.CreateDocument(c.Request.Context(), &input); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, input)
}

func (h *AdminHandler) GetLegalArticles(c *gin.Context) {
	ctx := c.Request.Context()
	docID := c.Query("document_id")
	category := c.Query("category")
	
	var articles []entity.LegalArticle
	var err error

	if docID != "" {
		articles, err = h.legalRepo.GetArticlesByDocument(ctx, docID)
	} else if category != "" {
		articles, err = h.legalRepo.GetArticlesByCategory(ctx, category)
	} else {
		articles, err = h.legalRepo.GetAllArticles(ctx)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, articles)
}

func (h *AdminHandler) CreateLegalArticle(c *gin.Context) {
	var input entity.LegalArticle
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.legalRepo.CreateArticle(c.Request.Context(), &input); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, input)
}

func (h *AdminHandler) BatchCreateLegalArticles(c *gin.Context) {
	var input struct {
		DocumentID string                `json:"document_id" binding:"required"`
		Articles   []entity.LegalArticle `json:"articles" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Force document ID for consistency
	for i := range input.Articles {
		input.Articles[i].DocumentID = input.DocumentID
	}

	if err := h.legalRepo.BatchCreateArticles(c.Request.Context(), input.Articles); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "Articles importés avec succès", "count": len(input.Articles)})
}

func (h *AdminHandler) DeleteLegalArticle(c *gin.Context) {
	id := c.Param("id")
	if err := h.legalRepo.DeleteArticle(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Article supprimé"})
}

func (h *AdminHandler) ExtractTextFromPDF(c *gin.Context) {
	file, err := c.FormFile("pdf")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fichier PDF requis"})
		return
	}

	// Création d'un fichier temporaire
	tempDir := os.TempDir()
	tempFile := filepath.Join(tempDir, file.Filename)
	if err := c.SaveUploadedFile(file, tempFile); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur lors de la sauvegarde du fichier"})
		return
	}
	defer os.Remove(tempFile)

	// Exécution de pdftotext
	cmd := exec.Command("pdftotext", tempFile, "-")
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur lors de l'extraction du texte: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"text": string(output)})
}
