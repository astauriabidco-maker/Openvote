package handler

import "github.com/openvote/backend/internal/domain/entity"

// validRoles énumère les rôles assignables par un admin.
// Note : on exclut les rôles "système" implicites (RoleSuperAdmin peut
// être créé par bootstrap, mais en pratique seul le seed initial le pose).
func validRoles() map[entity.UserRole]bool {
	return map[entity.UserRole]bool{
		entity.RoleObserver:        true,
		entity.RoleLocalCoord:      true,
		entity.RoleRegionAdmin:     true,
		entity.RoleSuperAdmin:      true,
		entity.RoleVerifiedCitizen: true,
		entity.RoleCitizen:         true,
	}
}

// isValidRole vérifie qu'un rôle est dans la liste autorisée pour création
// ou mise à jour d'utilisateur. Centralisé pour éviter la duplication.
func isValidRole(r entity.UserRole) bool {
	return validRoles()[r]
}