package service

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

// TriangulationService calcule le score de confiance d'un rapport en croisant
// les observations voisines (même tuile H3 + même fenêtre temporelle).
//
// Règle de validation (cf. instruction.md §3.C) :
//
//	Un rapport est auto-vérifié SI ET SEULEMENT SI
//	  (a) au moins N observateurs DISTINCTS l'ont corroboré dans la fenêtre
//	      temporelle et la tuile H3,
//	  (b) ET le score pondéré cumulé est au-dessus du seuil.
//
// Conséquences :
//   - Un rapport isolé ne peut JAMAIS s'auto-vérifier (cf. C3 audit).
//   - Le rapport cible est exclu de ses propres voisins (évite le self-match).
//   - La diversité des sources (distinct observer_id) est non-négociable.
//   - Les rôles sont pondérés mais aucun rôle ne peut valider seul.
//
// Les seuils sont paramétrables par variables d'environnement pour permettre
// un ajustement par déploiement (ex : phase pilote à 2 sources, prod à 3).
type TriangulationService interface {
	CalculateTrustScore(ctx context.Context, reportID string) error
}

type triangulationService struct {
	reportRepo             repository.ReportRepository
	minDistinctObservers   int
	trustScoreThreshold    float64
	timeWindowMinutes      int
	spatialRadiusMeters    float64
}

// roleWeights associe un score à chaque rôle. Aucun rôle n'a un poids suffisant
// pour valider seul un rapport (max = 1.0 pour observer < seuil par défaut 1.0
// quand combiné avec la règle de diversité).
var roleWeights = map[entity.UserRole]float64{
	entity.RoleSuperAdmin:      0.0, // Les admins ne postent pas de rapports terrain.
	entity.RoleRegionAdmin:     0.0, // Idem.
	entity.RoleLocalCoord:      0.0, // Coordination, pas observation directe.
	entity.RoleObserver:        1.0, // Observateur accrédité = source de référence.
	entity.RoleVerifiedCitizen: 0.35,
	entity.RoleCitizen:         0.2,
}

func NewTriangulationService(reportRepo repository.ReportRepository) TriangulationService {
	return &triangulationService{
		reportRepo:           reportRepo,
		minDistinctObservers: getEnvInt("TRIANGULATION_MIN_DISTINCT_OBSERVERS", 3),
		trustScoreThreshold:  getEnvFloat("TRIANGULATION_TRUST_SCORE_THRESHOLD", 1.0),
		timeWindowMinutes:    getEnvInt("TRIANGULATION_TIME_WINDOW_MINUTES", 30),
		spatialRadiusMeters:  getEnvFloat("TRIANGULATION_SPATIAL_RADIUS_METERS", 500.0),
	}
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
		log.Printf("[TRIANGULATION] %s invalide, fallback sur défaut %d", key, def)
	}
	return def
}

func getEnvFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			return f
		}
		log.Printf("[TRIANGULATION] %s invalide, fallback sur défaut %v", key, def)
	}
	return def
}

func (s *triangulationService) CalculateTrustScore(ctx context.Context, reportID string) error {
	// 1. Récupère le signalement cible.
	target, err := s.reportRepo.GetByID(ctx, reportID)
	if err != nil {
		return fmt.Errorf("failed to get target report: %w", err)
	}
	if target == nil {
		return fmt.Errorf("report not found: %s", reportID)
	}

	// Si déjà vérifié ou rejeté, on ne recalcule pas.
	if target.Status != entity.StatusPending {
		return nil
	}

	// 2. Parse les coordonnées GPS depuis le WKT "POINT(lon lat)".
	// Échec du parsing = on ne peut pas faire de requête spatiale fiable ;
	// on retourne une erreur au worker pour retry plus tard (mieux que continuer
	// avec lat=lon=0 et risquer des faux positifs autour du méridien zéro, cf. M3 audit).
	lat, lon, err := parseWKTPoint(target.GPSLocation)
	if err != nil {
		return fmt.Errorf("invalid GPS WKT for report %s: %w", reportID, err)
	}

	// 3. Fenêtre temporelle symétrique autour de l'incident.
	start := target.CreatedAt.Add(-time.Duration(s.timeWindowMinutes) * time.Minute)
	end := target.CreatedAt.Add(time.Duration(s.timeWindowMinutes) * time.Minute)

	// 4. Requête spatiale et temporelle, EN EXCLUANT le rapport cible.
	nearbyReports, err := s.reportRepo.FindNearbyWithRole(
		ctx,
		target.ID,        // excludeID : évite l'auto-match (cf. C3 audit)
		target.H3Index,
		lat, lon,
		s.spatialRadiusMeters,
		start, end,
	)
	if err != nil {
		return fmt.Errorf("failed to fetch nearby reports: %w", err)
	}

	// 5. Calcul du score pondéré ET comptage des observateurs distincts.
	var (
		totalScore       float64
		distinctObserver = make(map[string]struct{})
		incidentTypes    = make(map[string]int)
	)

	for _, r := range nearbyReports {
		// Ignore les rapports rejetés.
		if r.Status == entity.StatusRejected {
			continue
		}

		weight, ok := roleWeights[r.AuthorRole]
		if !ok {
			weight = 0.1 // Rôle inconnu = score minimal, force le doute.
		}
		totalScore += weight
		distinctObserver[r.ObserverID] = struct{}{}
		incidentTypes[r.IncidentType]++
	}

	distinctCount := len(distinctObserver)
	log.Printf(
		"[TRIANGULATION] Report %s: neighbors=%d, distinct_observers=%d, total_score=%.2f",
		reportID, len(nearbyReports), distinctCount, totalScore,
	)

	// 6. Détection de conflit : plusieurs types d'incidents dans la même zone/temps.
	// On log seulement — c'est une information pour l'opérateur, pas une raison
	// de rejet automatique (différents observateurs peuvent rapporter des
	// aspects différents du même événement).
	if len(incidentTypes) > 1 {
		log.Printf(
			"[TRIANGULATION] Diversité de types pour %s : %v (à examiner manuellement)",
			reportID, incidentTypes,
		)
	}

	// 7. Décision : double condition, diversité ET score.
	//    C'est ici que le bug C3 est corrigé : aucun rapport isolé ne peut
	//    passer, même avec un score suffisant, parce que la diversité n'est
	//    jamais atteinte avec un seul rapport (le cible est exclu).
	switch {
	case distinctCount >= s.minDistinctObservers && totalScore >= s.trustScoreThreshold:
		log.Printf(
			"[TRIANGULATION] Report %s VERIFIED (distinct=%d >= %d, score=%.2f >= %.2f)",
			reportID, distinctCount, s.minDistinctObservers, totalScore, s.trustScoreThreshold,
		)
		return s.reportRepo.UpdateStatus(ctx, reportID, entity.StatusVerified)

	case distinctCount < s.minDistinctObservers:
		log.Printf(
			"[TRIANGULATION] Report %s stays PENDING (distinct=%d < %d requis) — en attente d'autres corroborations",
			reportID, distinctCount, s.minDistinctObservers,
		)

	default:
		log.Printf(
			"[TRIANGULATION] Report %s stays PENDING (score=%.2f < %.2f) — score insuffisant malgré diversité",
			reportID, totalScore, s.trustScoreThreshold,
		)
	}

	return nil
}

// parseWKTPoint extrait lat/lon d'un WKT "POINT(lon lat)".
// Validation stricte : refuse tout format malformé pour éviter les fallbacks
// silencieux sur (0,0) qui causaient des requêtes autour du méridien zéro.
func parseWKTPoint(wkt string) (lat, lon float64, err error) {
	const prefix = "POINT("
	const suffix = ")"
	if len(wkt) < len(prefix)+len(suffix)+1 {
		return 0, 0, fmt.Errorf("WKT trop court: %q", wkt)
	}
	if wkt[:len(prefix)] != prefix || wkt[len(wkt)-len(suffix):] != suffix {
		return 0, 0, fmt.Errorf("WKT mal formé (attendu POINT(lon lat)): %q", wkt)
	}
	body := wkt[len(prefix) : len(wkt)-len(suffix)]
	n, err := fmt.Sscanf(body, "%f %f", &lon, &lat)
	if err != nil || n != 2 {
		return 0, 0, fmt.Errorf("impossible de parser lon/lat dans %q: %v", body, err)
	}
	if lat < -90 || lat > 90 || lon < -180 || lon > 180 {
		return 0, 0, fmt.Errorf("coordonnées hors bornes: lat=%f lon=%f", lat, lon)
	}
	return lat, lon, nil
}