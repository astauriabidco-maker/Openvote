package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

type TriangulationService interface {
	CalculateTrustScore(ctx context.Context, reportID string) error
}

type triangulationService struct {
	reportRepo repository.ReportRepository
}

func NewTriangulationService(reportRepo repository.ReportRepository) TriangulationService {
	return &triangulationService{
		reportRepo: reportRepo,
	}
}

func (s *triangulationService) CalculateTrustScore(ctx context.Context, reportID string) error {
	// 1. Récupère le signalement cible
	target, err := s.reportRepo.GetByID(ctx, reportID)
	if err != nil {
		return fmt.Errorf("failed to get target report: %w", err)
	}
	if target == nil {
		return fmt.Errorf("report not found: %s", reportID)
	}

	// Si déjà vérifié ou rejeté, on ignore
	if target.Status != entity.StatusPending {
		return nil
	}

	// Parsing de la position GPS (Format WKT: POINT(lon lat))
	var lat, lon float64
	_, err = fmt.Sscanf(target.GPSLocation, "POINT(%f %f)", &lon, &lat)
	if err != nil {
		log.Printf("[TRIANGULATION] Warning: Could not parse GPS location for report %s: %v", reportID, err)
	}

	// Fenêtre temporelle +/- 30 minutes
	start := target.CreatedAt.Add(-30 * time.Minute)
	end := target.CreatedAt.Add(30 * time.Minute)

	// 2. Requête Spatiale & Temporelle
	// Rayon de 500m
	nearbyReports, err := s.reportRepo.FindNearbyWithRole(ctx, target.H3Index, lat, lon, 500.0, start, end)
	if err != nil {
		return fmt.Errorf("failed to fetch nearby reports: %w", err)
	}

	// 3. Calcul du Score & Détection de Conflits
	totalScore := 0.0
	incidentTypes := make(map[string]int)

	for _, r := range nearbyReports {
		// On ne compte que les signalements qui ne sont PAS rejetés
		if r.Status == entity.StatusRejected {
			continue
		}

		// Ajout du poids selon le rôle
		score := 0.0
		switch r.AuthorRole {
		case entity.RoleObserver:
			score = 1.0
		case entity.RoleVerifiedCitizen:
			score = 0.35
		case entity.RoleCitizen:
			score = 0.2
		default:
			score = 0.1 // Hors rôle spécifié
		}
		totalScore += score

		// Détection de conflit (simple: compte les types d'incidents)
		incidentTypes[r.IncidentType]++
	}

	log.Printf("[TRIANGULATION] Report %s: Neighbors: %d, Total Score: %.2f", reportID, len(nearbyReports), totalScore)

	// Gestion des conflits
	if len(incidentTypes) > 1 {
		// Logique simpliste: si plus d'un type d'incident est reporté dans la même zone/temps
		log.Printf("[TRIANGULATION] CONFLIT détecté pour le signalement %s (Types variés: %v)", reportID, incidentTypes)
	}

	// 4. Prise de Décision
	if totalScore >= 1.0 {
		log.Printf("[TRIANGULATION] Report %s VERIFIED (Score: %.2f)", reportID, totalScore)
		return s.reportRepo.UpdateStatus(ctx, reportID, entity.StatusVerified)
	}

	return nil
}
