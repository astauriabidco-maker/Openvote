package repository

import (
	"context"
	"time"

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

	// H3 audit : lockout par tentatives échouées.
	IncrementFailedAttempts(ctx context.Context, id string) (int, error)
	ResetFailedAttempts(ctx context.Context, id string) error
	LockUser(ctx context.Context, id string, until time.Time) error

	// H3 audit : MFA TOTP.
	SetMFASecret(ctx context.Context, id string, secret string, backupCodesJSON []byte) error
	DisableMFA(ctx context.Context, id string) error
	ConsumeBackupCode(ctx context.Context, id string, codeIndex int) error
}
