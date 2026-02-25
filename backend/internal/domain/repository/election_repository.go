package repository

import (
	"context"
	"github.com/openvote/backend/internal/domain/entity"
)

type ElectionRepository interface {
	GetAll(ctx context.Context) ([]entity.Election, error)
	GetByID(ctx context.Context, id string) (*entity.Election, error)
	Create(ctx context.Context, e *entity.Election) error
	Update(ctx context.Context, e *entity.Election) error
	Delete(ctx context.Context, id string) error
	UpdateStatus(ctx context.Context, id string, status entity.ElectionStatus) error
}

type AuditLogRepository interface {
	Create(ctx context.Context, log *entity.AuditLog) error
	GetAll(ctx context.Context, limit int) ([]entity.AuditLog, error)
}

type IncidentTypeRepository interface {
	GetAll(ctx context.Context) ([]entity.IncidentType, error)
	Create(ctx context.Context, it *entity.IncidentType) error
	Update(ctx context.Context, it *entity.IncidentType) error
	Delete(ctx context.Context, id string) error
}
