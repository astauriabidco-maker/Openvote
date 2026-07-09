package handler

import (
	"context"
	"log"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

// logAction persiste une entrée dans audit_logs. Best-effort : une erreur de
// log ne doit jamais bloquer l'opération métier (mais elle est loggée).
// Fonction partagée entre users_handler, config_handler, legal_handler, etc.
func logAction(
	ctx context.Context,
	repo repository.AuditLogRepository,
	adminID, adminName, action, targetID, details string,
) {
	if repo == nil {
		return
	}
	entry := &entity.AuditLog{
		AdminID:   adminID,
		AdminName: adminName,
		Action:    action,
		TargetID:  targetID,
		Details:   details,
	}
	if err := repo.Create(ctx, entry); err != nil {
		log.Printf("[AUDIT] Error persisting log: %v", err)
	}
	log.Printf("[AUDIT] %s | %s | cible: %s | %s", action, adminName, targetID, details)
}