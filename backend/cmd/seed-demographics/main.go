// Package main : seeder pour la table region_demographics (migration 018).
//
// Lit data/geo/bucrep-demographics.csv (BUCREP 2016-2025, 19 indicateurs,
// 3 sexes, 13 zones géographiques) et insère les 2860 lignes en bulk
// avec ON CONFLICT DO NOTHING (idempotent — ré-exécutable sans dupliquer).
//
// Mapping GeoArea → region_id :
//   - Cameroun       → region_id NULL (national aggregate)
//   - Adamaoua       → AD
//   - Centre (Sans Yaoundé) → CE, city_label = '(Sans Yaoundé)'
//   - Est            → ES
//   - Extrême-Nord   → EN
//   - Littoral (Sans Douala) → LT, city_label = '(Sans Douala)'
//   - Nord           → NO
//   - Nord-Ouest     → NW
//   - Ouest          → OU
//   - Sud            → SU
//   - Sud-Ouest      → SW
//   - Douala         → LT, city_label = 'Douala' (rattachée à Littoral)
//   - Yaoundé        → CE, city_label = 'Yaoundé' (rattachée à Centre)
//
// Le programme est volontairement simple — pas de flag, pas de dépendance
// exotique. On l'invoque après la migration 018 :
//   go run ./cmd/seed-demographics
//
// Idempotent : relancer le binaire ne duplique rien (UNIQUE constraint +
// ON CONFLICT DO NOTHING).
package main

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/openvote/backend/internal/platform/database"
)

type geoMap struct {
	regionCode string
	cityLabel  string
}

var geoToRegion = map[string]geoMap{
	"Cameroun":               {regionCode: "", cityLabel: ""},
	"Adamaoua":               {regionCode: "AD", cityLabel: ""},
	"Centre (Sans Yaoundé)":  {regionCode: "CE", cityLabel: "(Sans Yaoundé)"},
	"Est":                    {regionCode: "ES", cityLabel: ""},
	"Extrême-Nord":           {regionCode: "EN", cityLabel: ""},
	"Littoral (Sans Douala)": {regionCode: "LT", cityLabel: "(Sans Douala)"},
	"Nord":                   {regionCode: "NO", cityLabel: ""},
	"Nord-Ouest":             {regionCode: "NW", cityLabel: ""},
	"Ouest":                  {regionCode: "OU", cityLabel: ""},
	"Sud":                    {regionCode: "SU", cityLabel: ""},
	"Sud-Ouest":              {regionCode: "SW", cityLabel: ""},
	"Douala":                 {regionCode: "LT", cityLabel: "Douala"},
	"Yaoundé":                {regionCode: "CE", cityLabel: "Yaoundé"},
}

func main() {
	if err := run(); err != nil {
		log.Fatalf("[seed-demographics] %v", err)
	}
}

func run() error {
	ctx := context.Background()

	db, err := database.NewPostgresDB()
	if err != nil {
		return fmt.Errorf("connexion DB : %w", err)
	}
	defer db.Close()

	// Charger le mapping region_code → region_id depuis la DB.
	regionIDs, err := loadRegionIDs(ctx, db)
	if err != nil {
		return fmt.Errorf("chargement des régions : %w", err)
	}
	if len(regionIDs) != 10 {
		return fmt.Errorf("attendu 10 régions, trouvé %d (migrations 002 pas appliquées ?)", len(regionIDs))
	}

	// Trouver le CSV. Deux chemins acceptés :
	//   1. SEED_CSV env var (chemin absolu explicite)
	//   2. ../data/geo/bucrep-demographics.csv (relatif au binaire dans backend/)
	csvPath := os.Getenv("SEED_CSV")
	if csvPath == "" {
		csvPath = "../data/geo/bucrep-demographics.csv"
	}
	f, err := os.Open(csvPath)
	if err != nil {
		return fmt.Errorf("ouverture %s : %w", csvPath, err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1 // tolerant
	header, err := r.Read()
	if err != nil {
		return fmt.Errorf("lecture header : %w", err)
	}
	// header attendu : indicator, sex, geo_area, 2016, 2017, ..., 2025
	years := header[3:]
	if len(years) != 10 {
		return fmt.Errorf("attendu 10 colonnes année, trouvé %d", len(years))
	}

	inserted := 0
	skipped := 0
	unknownGeo := map[string]int{}

	// Transaction pour atomicité (un seul commit sur les 2860 lignes).
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx : %w", err)
	}
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO region_demographics
			(region_id, city_label, indicator, sex, year, value, source)
		VALUES ($1, $2, $3, $4, $5, $6, 'BUCREP')
		ON CONFLICT (region_id, city_label, indicator, sex, year) DO NOTHING
	`)
	if err != nil {
		return fmt.Errorf("prepare : %w", err)
	}
	defer stmt.Close()

	rowNum := 1
	for {
		row, err := r.Read()
		if err != nil {
			if strings.Contains(err.Error(), "EOF") {
				break
			}
			return fmt.Errorf("lecture ligne %d : %w", rowNum, err)
		}
		rowNum++
		indicator := strings.TrimSpace(row[0])
		sex := strings.TrimSpace(row[1])
		geo := strings.TrimSpace(row[2])
		if indicator == "" || geo == "" {
			continue
		}
		mapping, ok := geoToRegion[geo]
		if !ok {
			unknownGeo[geo]++
			continue
		}
		var regionID *string
		if mapping.regionCode != "" {
			id := regionIDs[mapping.regionCode]
			regionID = &id
		}
		for i, yearStr := range years {
			year, err := strconv.Atoi(yearStr)
			if err != nil {
				return fmt.Errorf("année invalide %q : %w", yearStr, err)
			}
			valStr := strings.TrimSpace(row[3+i])
			if valStr == "" {
				continue
			}
			val, err := strconv.ParseInt(valStr, 10, 64)
			if err != nil {
				return fmt.Errorf("valeur invalide ligne %d col %d (%q) : %w", rowNum, 3+i, valStr, err)
			}
			res, err := stmt.ExecContext(ctx, regionID, mapping.cityLabel, indicator, sex, year, val)
			if err != nil {
				return fmt.Errorf("insert ligne %d : %w", rowNum, err)
			}
			n, _ := res.RowsAffected()
			if n == 1 {
				inserted++
			} else {
				skipped++
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit : %w", err)
	}

	log.Printf("[seed-demographics] OK — %d lignes insérées, %d ignorées (conflit), %d zones géo inconnues",
		inserted, skipped, len(unknownGeo))
	for g, n := range unknownGeo {
		log.Printf("  ⚠️  GeoArea inconnue: %q (%d lignes)", g, n)
	}
	return nil
}

func loadRegionIDs(ctx context.Context, db *sql.DB) (map[string]string, error) {
	rows, err := db.QueryContext(ctx, "SELECT code, id::text FROM regions")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]string, 10)
	for rows.Next() {
		var code, id string
		if err := rows.Scan(&code, &id); err != nil {
			return nil, err
		}
		out[code] = id
	}
	return out, rows.Err()
}
