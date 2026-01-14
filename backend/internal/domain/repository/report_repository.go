package repository

import (
	"context"
	"time"

	"github.com/openvote/backend/internal/domain/entity"
)

type ReportRepository interface {
	Create(ctx context.Context, report *entity.Report) error
	GetAll(ctx context.Context, status string) ([]entity.Report, error)
	GetByID(ctx context.Context, id string) (*entity.Report, error)
	FindNearbyWithRole(ctx context.Context, h3Index string, lat, lon, radius float64, start, end time.Time) ([]entity.Report, error)
	UpdateStatus(ctx context.Context, id string, status entity.ReportStatus) error
}
