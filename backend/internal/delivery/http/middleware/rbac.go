package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
)

// RoleMiddleware vérifie que l'utilisateur a le rôle minimum requis
// Hiérarchie des rôles : super_admin > region_admin > local_coord > observer > verified_citizen > citizen
func RoleMiddleware(allowedRoles ...entity.UserRole) gin.HandlerFunc {
	roleSet := make(map[entity.UserRole]bool)
	for _, r := range allowedRoles {
		roleSet[r] = true
	}

	return func(c *gin.Context) {
		roleVal, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "rôle non trouvé dans le contexte"})
			c.Abort()
			return
		}

		roleStr, ok := roleVal.(string)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "format de rôle invalide"})
			c.Abort()
			return
		}

		userRole := entity.UserRole(roleStr)

		// Le super_admin a accès à tout
		if userRole == entity.RoleSuperAdmin {
			c.Next()
			return
		}

		// Vérification directe
		if !roleSet[userRole] {
			c.JSON(http.StatusForbidden, gin.H{
				"error":         "permissions insuffisantes",
				"required_role": allowedRoles,
				"current_role":  userRole,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// AdminOnly autorise uniquement les super_admin et region_admin
func AdminOnly() gin.HandlerFunc {
	return RoleMiddleware(entity.RoleSuperAdmin, entity.RoleRegionAdmin)
}

// CoordinatorAndAbove autorise les coordinateurs locaux et au-dessus
func CoordinatorAndAbove() gin.HandlerFunc {
	return RoleMiddleware(entity.RoleSuperAdmin, entity.RoleRegionAdmin, entity.RoleLocalCoord)
}

// ObserverAndAbove autorise les observateurs et au-dessus
func ObserverAndAbove() gin.HandlerFunc {
	return RoleMiddleware(entity.RoleSuperAdmin, entity.RoleRegionAdmin, entity.RoleLocalCoord, entity.RoleObserver)
}
