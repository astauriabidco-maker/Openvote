package repository

import (
	"context"
	"github.com/openvote/backend/internal/domain/entity"
)

type UserRepository interface {
	Create(ctx context.Context, user *entity.User) error
	GetByID(ctx context.Context, id string) (*entity.User, error)
	GetByUsername(ctx context.Context, username string) (*entity.User, error)
	GetAll(ctx context.Context) ([]entity.User, error)
	UpdateRole(ctx context.Context, id string, role entity.UserRole, regionID string) error
	UpdateLastLogin(ctx context.Context, id string) error
	Delete(ctx context.Context, id string) error
}
