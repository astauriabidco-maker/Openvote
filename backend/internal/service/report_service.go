package service

import (
	"context"
	"fmt"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/platform/queue"
	"github.com/uber/h3-go/v4"
)

type ReportService interface {
	CreateReport(ctx context.Context, report *entity.Report) error
	GetAllReports(ctx context.Context, status string) ([]entity.Report, error)
	GetReportByID(ctx context.Context, id string) (*entity.Report, error)
	UpdateReportStatus(ctx context.Context, id string, status entity.ReportStatus) error
}

type reportService struct {
	repo      repository.ReportRepository
	publisher queue.Publisher
}

func NewReportService(repo repository.ReportRepository, publisher queue.Publisher) ReportService {
	return &reportService{
		repo:      repo,
		publisher: publisher,
	}
}

func (s *reportService) CreateReport(ctx context.Context, report *entity.Report) error {
	// 1. Validation basique (Business Logic)
	if report.IncidentType == "" {
		return fmt.Errorf("incident_type is required")
	}
	if report.ObserverID == "" {
		return fmt.Errorf("observer_id is required")
	}

	// 2. Parsage de la location GPS depuis string "lat,lon" ou similaire si c'est le format d'entrée
	// Dans notre modèle 'gps_location' est une string pour PostGIS, mais pour H3 on a besoin des floates.
	// On suppose que l'entité Report reçue du handler a peut-être des champs temporaires ou qu'on la parse.
	// POUR L'EXERCICE : On va supposer qu'on reçoit Lat/Lon dans des champs séparés ou qu'on la parse.
	// Simplification : On va dire que le handler a rempli des champs Lat/Lon dans une struct DTO ou que l'entité a Lat/Lon ignorés par la DB.
	// Attendons, le modèle Go 'Report' au step 368 a `GPSLocation string`. C'est pas pratique pour le calcul H3.
	// Je vais supposer que le JSON entrant a "latitude" et "longitude" et que le handler construit l'entité.
	// Je vais ajouter une étape de calcul avant d'appeler le repo.

	// FIX: Je vais réutiliser l'entité Report telle quelle, mais je vais parser la location si possible,
	// ou mieux, tricher légèrement et utiliser des coords passées autrement.
	// Non, soyons propres. Je vais supposer que le handler a mis "POINT(lon lat)" dans GPSLocation.
	// C'est pénible à parser.
	// Mieux : Le handler devrait passer les coords brutes.
	// MODIFICATON : Je vais assumer que le DTO d'entrée avait lat/lon et qu'on les a pour le calcul.

	// Calcul H3 (Resolution 10)
	// On suppose que le handler a déjà aidé ou qu'on a un moyen.
	// Pour l'instant, disons qu'on parse simple ou qu'on a Lat/Lon dans l'entité (manquants dans le modèle précédent).
	// Je vais ajouter Lat/Lon au modèle Go (champs ignorés par GORM ou DB mais utiles en runtime).

	// Pour cet exemple, je vais recalculer Lat/Lon depuis l'input si possible, mais le modèle est strict.
	// Je vais utiliser des valeurs hardcodées si le format est "POINT(x y)" ou utiliser une lib WKT.
	// Sans lib WKT, je vais faire confiance au repository pour le PostGIS et demander au Handler de passer H3Index si possible?
	// Non, le prompt dit: "Calcule l'index H3... à partir de la latitude/longitude reçue".
	// Donc le Service LE FAIT.

	// Je vais assumer que 'report.Description' contient temporairement "lat:x;lon:y" ? Non.
	// Je vais ajouter Lat/Lon à l'entité Report en tant que champs "-" json/db ignorés temporairement, ou assumer le parse.

	// OK, je vais faire une implémentation robuste :
	// Je récupère Lat/Long depuis le contexte ou l'objet si je peux.
	// Je vais improviser : je vais parser report.GPSLocation qui est supposé être "POINT(lon lat)".

	var lat, lon float64
	var err error

	_, err = fmt.Sscanf(report.GPSLocation, "POINT(%f %f)", &lon, &lat)
	if err != nil {
		// Fallback ou erreur, on essaie de lire si c'est juste "lat,lon"
		// ...
		return fmt.Errorf("invalid gps_location format, expected POINT(lon lat): %w", err)
	}

	latLng := h3.NewLatLng(lat, lon)
	cell := h3.LatLngToCell(latLng, 10)
	report.H3Index = cell.String()

	// 3. Sauvegarde PostgreSQL
	if err := s.repo.Create(ctx, report); err != nil {
		return fmt.Errorf("failed to save report to db: %w", err)
	}

	// 4. Envoi RabbitMQ (Async)
	// On envoie l'ID ou l'objet complet
	go func() {
		// Contexte background pour ne pas être annulé par la requête HTTP
		if err := s.publisher.Publish(context.Background(), "new_reports", report); err != nil {
			// Log error (pas de logger configuré dans l'exo, fmt.Print)
			fmt.Printf("ERROR: failed to publish to rabbitmq: %v\n", err)
		}
	}()

	return nil
}

func (s *reportService) GetAllReports(ctx context.Context, status string) ([]entity.Report, error) {
	return s.repo.GetAll(ctx, status)
}

func (s *reportService) GetReportByID(ctx context.Context, id string) (*entity.Report, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *reportService) UpdateReportStatus(ctx context.Context, id string, status entity.ReportStatus) error {
	return s.repo.UpdateStatus(ctx, id, status)
}
