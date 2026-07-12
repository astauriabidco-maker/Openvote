// Migration runner (fail-fast + tracking).
//
// Réfacto 2026-07-12 : le runner passe de "warning-and-continues" à
// fail-fast. Voir bloc d'appel dans main() pour le rationale complet.
//
// Décisions de design :
//   - La table schema_migrations est créée en bootstrap (idempotent) AVANT
//     la boucle, sinon chicken-and-egg : on a besoin de la table pour
//     tracker, mais 017 la crée.
//   - Le bootstrap one-shot détecte le cas "ancien déploiement" :
//     schema_migrations vide MAIS la table 'regions' existe → on backfill
//     002-017 avec checksum 'bootstrap-2026-07' pour ne PAS re-rouler
//     les INSERT non-idempotents.
//   - Chaque migration est appliquée dans une transaction (BEGIN + EXEC
//     + INSERT + COMMIT). Toute erreur ⇒ rollback + return error ; le
//     caller fait log.Fatalf pour transformer ça en crashloop visible.
//   - La fonction prend la liste en paramètre (au lieu d'une variable
//     globale) pour permettre aux tests d'injecter des fixtures courtes.

package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"os"
)

type migration struct {
	file string
	name string
}

// allMigrations est la liste canonique des migrations 002-017. 001 vit
// dans le docker-entrypoint-initdb.d, jamais tracké.
var allMigrations = []migration{
	{"migration/002_regions_departments.sql", "régions/départements"},
	{"migration/003_elections_audit_incidents.sql", "élections/audit/incidents"},
	{"migration/004_veille_electorale.sql", "veille électorale"},
	{"migration/005_legal_cms.sql", "CMS Légal"},
	{"migration/006_departments_data_enrichment.sql", "Données Démographiques"},
	{"migration/007_document_exploitation.sql", "Exploitation Documents"},
	{"migration/008_legal_knowledge_base.sql", "Base Connaissance Juridique"},
	{"migration/009_multilingual_llm_upgrade.sql", "Upgrade Multilingue + LLM"},
	{"migration/010_demographics_2025.sql", "Démographie 2025 (INS/ELECAM)"},
	{"migration/011_arrondissements.sql", "Arrondissements (départements clés)"},
	{"migration/012_data_traceability.sql", "Traçabilité des données"},
	{"migration/013_all_arrondissements.sql", "Arrondissements complets"},
	{"migration/014_missing_arrondissements.sql", "Arrondissements manquants (360 total)"},
	{"migration/015_mfa_and_lockout.sql", "MFA TOTP + lockout par tentatives (H3 audit)"},
	{"migration/016_department_demographics_history.sql", "Historique démographique département (time series)"},
	{"migration/017_schema_migrations_tracking.sql", "Table schema_migrations (self-tracking)"},
	{"migration/018_region_demographics.sql", "Démographie BUCREP par région (2016-2025, 19 indicateurs × 3 sexes × 13 zones)"},
}

// schemaMigrationsDDL est dupliqué ici (vs lu depuis 017.sql) pour
// éviter le chicken-and-egg : la table doit exister avant qu'on lise
// quoi que ce soit de schema_migrations.
const schemaMigrationsDDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
	version TEXT PRIMARY KEY,
	applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	checksum TEXT NOT NULL
)`

func runMigrations(db *sql.DB, migrations []migration) error {
	// 1. Bootstrap idempotent de la table de tracking.
	if _, err := db.Exec(schemaMigrationsDDL); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	// 2. Bootstrap one-shot pour les déploiements existants.
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&n); err != nil {
		return fmt.Errorf("count schema_migrations: %w", err)
	}
	if n == 0 {
		var hasRegions bool
		if err := db.QueryRow(
			"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='regions')",
		).Scan(&hasRegions); err != nil {
			return fmt.Errorf("check regions: %w", err)
		}
		if hasRegions {
			log.Printf("[MIGRATION] Bootstrap : schema_migrations vide mais tables présentes, backfill %d entrées", len(migrations))
			for _, mig := range migrations {
				if mig.file == "migration/001_init_schema.sql" {
					continue
				}
				if _, err := db.Exec(
					"INSERT INTO schema_migrations (version, checksum) VALUES ($1, 'bootstrap-2026-07') ON CONFLICT (version) DO NOTHING",
					mig.file,
				); err != nil {
					return fmt.Errorf("backfill %s: %w", mig.file, err)
				}
			}
		}
	}

	// 3. Run des migrations non trackées.
	for _, mig := range migrations {
		var applied bool
		if err := db.QueryRow(
			"SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)",
			mig.file,
		).Scan(&applied); err != nil {
			return fmt.Errorf("check %s: %w", mig.file, err)
		}
		if applied {
			log.Printf("[MIGRATION] %s déjà appliquée, skip", mig.name)
			continue
		}

		// Lecture fichier — fail-fast si absent (avant on silent-skip ;
		// un fichier listé mais absent est un bug à signaler).
		data, err := os.ReadFile(mig.file)
		if err != nil {
			return fmt.Errorf("read %s: %w", mig.file, err)
		}

		// Transaction : exec + insert tracking atomiques. Si
		// l'insert échoue, on rollback pour ne pas avoir un état
		// partiel.
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("begin tx %s: %w", mig.file, err)
		}
		if _, err := tx.Exec(string(data)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("exec %s: %w", mig.name, err)
		}
		checksum := sha256.Sum256(data)
		if _, err := tx.Exec(
			"INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
			mig.file, hex.EncodeToString(checksum[:]),
		); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("track %s: %w", mig.file, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit %s: %w", mig.file, err)
		}
		log.Printf("[MIGRATION] %s appliquée avec succès", mig.name)
	}

	return nil
}
