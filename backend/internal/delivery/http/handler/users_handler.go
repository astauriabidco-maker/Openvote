package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/delivery/http/middleware"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/service"
)

// UsersHandler regroupe la gestion des utilisateurs et la génération
// de tokens d'enrôlement. Toutes les routes sont sous /admin et
// requièrent le rôle admin (vérifié par middleware AdminOnly).
//
// RBAC scope (cf. M6 audit) :
//   - super_admin : accès total, peut opérer sur n'importe quelle région.
//   - region_admin : limité à SA région, ne peut pas promouvoir au-delà
//     de son niveau ni toucher aux super_admin.
//   - Les autres rôles ne sont pas autorisés par AdminOnly().
type UsersHandler struct {
	enrolmentService service.EnrolmentService
	userRepo         repository.UserRepository
	auditRepo        repository.AuditLogRepository
}

func NewUsersHandler(
	enrolmentService service.EnrolmentService,
	userRepo repository.UserRepository,
	auditRepo repository.AuditLogRepository,
) *UsersHandler {
	return &UsersHandler{
		enrolmentService: enrolmentService,
		userRepo:         userRepo,
		auditRepo:        auditRepo,
	}
}

// ========================================
// Génération de Token d'Enrôlement
// ========================================

func (h *UsersHandler) GenerateToken(c *gin.Context) {
	var input struct {
		Role     string `json:"role" binding:"required"`
		RegionID string `json:"region_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := entity.UserRole(input.Role)
	if !isValidRole(role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rôle invalide"})
		return
	}

	// M6 : un region_admin ne peut générer des tokens que pour SA région
	// et pour des rôles strictement inférieurs au sien.
	if !RequireSameRegionOrSuperAdmin(c, input.RegionID) {
		return
	}
	if !RequireAssignableRoleOrForbid(c, role) {
		return
	}

	token, err := h.enrolmentService.GenerateActivationToken(c.Request.Context(), role, input.RegionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	adminID, _ := c.Get("userID")
	adminName := c.GetString("username")
	logAction(c.Request.Context(), h.auditRepo, adminID.(string), adminName,
		"GENERATE_TOKEN", input.RegionID,
		"Rôle: "+input.Role+" | Admin: "+string(CallerRole(c)))

	c.JSON(http.StatusOK, gin.H{
		"activation_token": token,
		"role":             input.Role,
		"region_id":        input.RegionID,
	})
}

// ========================================
// CRUD Utilisateurs
// ========================================

// ListUsers retourne les utilisateurs, paginés. Les region_admin ne voient
// que les utilisateurs de leur région ; les super_admin voient tout.
//
// La pagination est validée par la middleware RequirePagination()
// sur la route (cf. cmd/api/main.go). On récupère les valeurs
// validées via middleware.GetPagination(c) — pas de re-parsing.
func (h *UsersHandler) ListUsers(c *gin.Context) {
	page, limit := middleware.GetPagination(c)

	all, err := h.userRepo.GetAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// M6 : filtre par région pour les region_admin.
	callerRegion := CallerRegionID(c)
	if !IsSuperAdmin(c) && callerRegion != "" {
		filtered := all[:0]
		for _, u := range all {
			if u.RegionID == callerRegion {
				filtered = append(filtered, u)
			}
		}
		all = filtered
	}

	// Pagination in-memory (M5). Volumes faibles (<10k users attendus),
	// acceptable. Si volume >100k, pousser LIMIT/OFFSET à la base.
	total := len(all)
	start := (page - 1) * limit
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}
	pageItems := all[start:end]

	type UserResponse struct {
		ID          string     `json:"id"`
		Username    string     `json:"username"`
		Role        string     `json:"role"`
		RegionID    string     `json:"region_id"`
		CreatedAt   time.Time  `json:"created_at"`
		UpdatedAt   time.Time  `json:"updated_at"`
		LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	}

	items := make([]UserResponse, 0, len(pageItems))
	for _, u := range pageItems {
		items = append(items, UserResponse{
			ID:          u.ID,
			Username:    u.Username,
			Role:        string(u.Role),
			RegionID:    u.RegionID,
			CreatedAt:   u.CreatedAt,
			UpdatedAt:   u.UpdatedAt,
			LastLoginAt: u.LastLoginAt,
		})
	}

	c.JSON(http.StatusOK, PaginatedResponse(items, Pagination{Page: page, Limit: limit}, total))
}

// UpdateUser modifie le rôle et la région d'un utilisateur.
// M6 : scope régional + empêche la promotion au-delà du rang de l'appelant.
func (h *UsersHandler) UpdateUser(c *gin.Context) {
	userID := c.Param("id")

	var input struct {
		Role     string `json:"role" binding:"required"`
		RegionID string `json:"region_id"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := entity.UserRole(input.Role)
	if !isValidRole(role) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rôle invalide"})
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Utilisateur non trouvé"})
		return
	}

	// Empêche l'auto-modification de rôle.
	currentAdminID, _ := c.Get("userID")
	if currentAdminID.(string) == userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Vous ne pouvez pas modifier votre propre rôle"})
		return
	}

	// M6 : le super_admin est intouchable sauf par un autre super_admin.
	if user.Role == entity.RoleSuperAdmin && !IsSuperAdmin(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "seul un super_admin peut modifier un super_admin"})
		return
	}

	// M6 : scope régional — l'admin régional ne peut pas sortir de SA région.
	if !RequireSameRegionOrSuperAdmin(c, user.RegionID) {
		return
	}
	// M6 : on ne peut pas promouvoir quelqu'un à un rang ≥ au sien
	// (sauf super_admin qui peut tout).
	if !RequireAssignableRoleOrForbid(c, role) {
		return
	}

	// Si on change la région de l'utilisateur, vérifier que la nouvelle
	// région est aussi dans le scope de l'appelant.
	if input.RegionID != "" && input.RegionID != user.RegionID {
		if !RequireSameRegionOrSuperAdmin(c, input.RegionID) {
			return
		}
	}

	if err := h.userRepo.UpdateRole(c.Request.Context(), userID, role, input.RegionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	adminName := c.GetString("username")
	logAction(c.Request.Context(), h.auditRepo, currentAdminID.(string), adminName,
		"UPDATE_ROLE", userID,
		"Ancien: "+string(user.Role)+" → Nouveau: "+input.Role+
			" | Région: "+user.RegionID+" → "+input.RegionID)

	c.JSON(http.StatusOK, gin.H{
		"message":  "Rôle mis à jour",
		"user_id":  userID,
		"new_role": input.Role,
	})
}

// DeleteUser supprime un utilisateur. M6 : scope régional, super_admin protégé.
func (h *UsersHandler) DeleteUser(c *gin.Context) {
	userID := c.Param("id")

	currentAdminID, _ := c.Get("userID")
	if currentAdminID.(string) == userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Vous ne pouvez pas supprimer votre propre compte"})
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Utilisateur non trouvé"})
		return
	}

	// M6 : super_admin protégé.
	if user.Role == entity.RoleSuperAdmin && !IsSuperAdmin(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "seul un super_admin peut supprimer un super_admin"})
		return
	}

	// M6 : scope régional.
	if !RequireSameRegionOrSuperAdmin(c, user.RegionID) {
		return
	}

	if err := h.userRepo.Delete(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	adminName := c.GetString("username")
	logAction(c.Request.Context(), h.auditRepo, currentAdminID.(string), adminName,
		"DELETE_USER", userID,
		"Utilisateur supprimé: "+user.Username+" ("+string(user.Role)+
			") | Région: "+user.RegionID)

	c.JSON(http.StatusOK, gin.H{"message": "Utilisateur supprimé", "user_id": userID})
}