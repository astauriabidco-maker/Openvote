package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/repository"
)

// ConfigHandler gère la configuration runtime du système (triangulation,
// rate-limiting, storage). Les overrides sont stockés en mémoire et
// reset au redémarrage du backend (volontaire : un redeploy doit pouvoir
// annuler toute modification manuelle).
type ConfigHandler struct {
	auditRepo repository.AuditLogRepository
}

func NewConfigHandler(auditRepo repository.AuditLogRepository) *ConfigHandler {
	return &ConfigHandler{auditRepo: auditRepo}
}

// configOverrides stocke les personnalisations faites via PATCH /admin/config.
// Variable package-level : partagée entre Get et Update, reset au redémarrage.
var configOverrides = make(map[string]interface{})

// GetConfig retourne la configuration par défaut mergée avec les overrides.
func (h *ConfigHandler) GetConfig(c *gin.Context) {
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
		"roles": []string{
			"super_admin", "region_admin", "local_coord",
			"observer", "verified_citizen", "citizen",
		},
	}

	// Merge runtime overrides.
	for k, v := range configOverrides {
		config[k] = v
	}

	c.JSON(http.StatusOK, config)
}

// UpdateConfig remplace ou ajoute des clés de configuration runtime.
// Accepte un objet JSON libre — la validation est minimale (la config
// runtime est lue par les services qui connaissent leur propre schéma).
func (h *ConfigHandler) UpdateConfig(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for k, v := range input {
		configOverrides[k] = v
	}

	adminName := c.GetString("username")
	adminID, _ := c.Get("userID")
	logAction(c.Request.Context(), h.auditRepo, adminID.(string), adminName,
		"UPDATE_CONFIG", "", "Configuration mise à jour")

	c.JSON(http.StatusOK, gin.H{
		"message":   "Configuration mise à jour",
		"overrides": configOverrides,
	})
}