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
	// FindNearbyWithRole retourne les signalements dans la même tuile H3 (ou dans
	// un rayon PostGIS autour du point) et dans la fenêtre temporelle donnée.
	// excludeID permet d'écarter le rapport cible lui-même de ses propres voisins
	// pour éviter l'auto-vérification (cf. C3 audit).
	FindNearbyWithRole(ctx context.Context, excludeID, h3Index string, lat, lon, radius float64, start, end time.Time) ([]entity.Report, error)
	UpdateStatus(ctx context.Context, id string, status entity.ReportStatus) error
}
