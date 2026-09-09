package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
)

// roleLevel associe chaque rôle à un niveau numérique pour les comparaisons.
// Plus le niveau est élevé, plus le rôle a de privilèges.
// Note : super_admin est le seul qui peut créer d'autres super_admin.
//
//	region_admin peut gérer les users SAUF super_admin et SAUF hors région.
var roleLevel = map[entity.UserRole]int{
	entity.RoleCitizen:         0,
	entity.RoleVerifiedCitizen: 1,
	entity.RoleObserver:        2,
	entity.RoleLocalCoord:      3,
	entity.RoleRegionAdmin:     4,
	entity.RoleSuperAdmin:      5,
}

// roleRank retourne le niveau d'un rôle, 0 par défaut (citizen).
func roleRank(r entity.UserRole) int {
	if v, ok := roleLevel[r]; ok {
		return v
	}
	return 0
}

// IsSuperAdmin teste si le rôle de l'appelant est super_admin.
// Utilisé comme passe-droit pour les opérations qui doivent être scopées
// uniquement pour les admins régionaux.
func IsSuperAdmin(c *gin.Context) bool {
	role, _ := c.Get("role")
	return role == string(entity.RoleSuperAdmin)
}

// CallerRole retourne le rôle de l'appelant. Vide si absent (anormal).
func CallerRole(c *gin.Context) entity.UserRole {
	role, _ := c.Get("role")
	return entity.UserRole(toString(role))
}

// CallerUserID retourne l'identifiant utilisateur extrait du JWT.
func CallerUserID(c *gin.Context) string {
	userID, _ := c.Get("userID")
	return toString(userID)
}

// CallerRegionID retourne la région de l'appelant. Vide si non défini.
// Important : super_admin a accès à toutes les régions ; son region_id
// peut être vide ou "all".
func CallerRegionID(c *gin.Context) string {
	region, _ := c.Get("regionID")
	return toString(region)
}

// RequireRoleLevelOrForbid renvoie 403 si le rôle de l'appelant a un niveau
// inférieur à `minLevel`. Centralise la hiérarchie.
func RequireRoleLevelOrForbid(c *gin.Context, minLevel int) bool {
	if roleRank(CallerRole(c)) < minLevel {
		c.JSON(http.StatusForbidden, gin.H{
			"error":         "permissions insuffisantes",
			"required_rank": minLevel,
			"current_rank":  roleRank(CallerRole(c)),
		})
		c.Abort()
		return false
	}
	return true
}

// RequireAssignableRole refuse la création d'un rôle supérieur ou égal
// à celui de l'appelant (sauf super_admin qui peut tout faire).
// Empêche un region_admin de créer un super_admin.
func RequireAssignableRoleOrForbid(c *gin.Context, target entity.UserRole) bool {
	if IsSuperAdmin(c) {
		return true
	}
	if roleRank(target) >= roleRank(CallerRole(c)) {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "vous ne pouvez pas attribuer un rôle de niveau égal ou supérieur au vôtre",
			"target":  string(target),
			"current": string(CallerRole(c)),
		})
		c.Abort()
		return false
	}
	return true
}

// RequireSameRegionOrSuperAdmin refuse si la région cible est différente
// de celle de l'appelant. super_admin passe toujours.
// Si adminRegional n'a pas de region_id (anormal), on refuse par défaut.
func RequireSameRegionOrSuperAdmin(c *gin.Context, targetRegionID string) bool {
	if IsSuperAdmin(c) {
		return true
	}
	callerRegion := CallerRegionID(c)
	if callerRegion == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "votre compte n'est pas associé à une région"})
		c.Abort()
		return false
	}
	if targetRegionID != callerRegion {
		c.JSON(http.StatusForbidden, gin.H{
			"error":         "action interdite hors de votre région",
			"caller_region": callerRegion,
			"target_region": targetRegionID,
		})
		c.Abort()
		return false
	}
	return true
}

// RequireSameRegionOrEmpty est une variante permissive : si la cible n'a
// pas de region_id assignée, on laisse passer (cas des super_admin sans région,
// ou des comptes fraîchement créés). À utiliser avec prudence.
func RequireSameRegionOrEmpty(c *gin.Context, targetRegionID string) bool {
	if IsSuperAdmin(c) {
		return true
	}
	if targetRegionID == "" {
		return true
	}
	return RequireSameRegionOrSuperAdmin(c, targetRegionID)
}

func toString(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
