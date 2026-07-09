// Package database : factory et configuration du pool de connexions PostgreSQL.
//
// Couvre deux audit points :
//   - H5 (perf) : pool tuning (MaxOpenConns, MaxIdleConns, ConnMaxLifetime) pour
//     éviter qu'un pic de charge n'épuise les connexions Postgres ou ne maintienne
//     des connexions zombies.
//   - H2 (sécu) : sslmode configurable via env. En production (APP_ENV=production),
//     refuser sslmode=disable (le mot de passe transiterait en clair sur le réseau).
//
// Comportement en fonction de APP_ENV :
//   - APP_ENV=production : sslmode=disable → panic immédiat au démarrage.
//     La prod DOIT utiliser au minimum `require` (chiffrement sans vérif du cert).
//   - APP_ENV=development : sslmode=disable autorisé (LAN de confiance).
package database

import (
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"time"

	_ "github.com/lib/pq"
)

// Defaults du pool — surdimensionnés pour un backend modeste mais bornés pour
// éviter d'écraser un Postgres partagé. Tous ajustables via env si besoin.
const (
	defaultMaxOpenConns    = 25              // nb max de connexions simultanées vers PG
	defaultMaxIdleConns    = 5               // nb de connexions gardées chaudes
	defaultConnMaxLifetime = 5 * time.Minute // recyclage pour éviter les coupures TCP
)

// NewPostgresDB ouvre la connexion, applique le tuning du pool, et refuse
// sslmode=disable en production.
//
// Variables d'environnement lues :
//   - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME : connexion
//   - DB_SSLMODE : "disable" (dev only), "require" (prod minimum), "verify-full" (prod durci)
//   - DB_MAX_OPEN_CONNS, DB_MAX_IDLE_CONNS, DB_CONN_MAX_LIFETIME_MIN : tuning pool
//   - APP_ENV : "production" active le fail-fast sur sslmode=disable
func NewPostgresDB() (*sql.DB, error) {
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	sslmode := os.Getenv("DB_SSLMODE")

	appEnv := os.Getenv("APP_ENV")
	if appEnv == "" {
		appEnv = "development"
	}

	// H2 audit : sslmode=disable en prod = mot de passe en clair sur le réseau.
	// On refuse en production.
	if sslmode == "disable" && appEnv == "production" {
		panic("FATAL: DB_SSLMODE=disable interdit en production (APP_ENV=production). " +
			"DB_PASSWORD transiterait en clair. Utiliser au minimum 'require' (idéalement 'verify-full').")
	}
	if sslmode == "" {
		// Défaut raisonnable par environnement :
		//   - dev : disable pour ne pas casser le docker-compose local
		//   - prod : require pour forcer TLS sans avoir à gérer le cert au boot
		if appEnv == "production" {
			sslmode = "require"
		} else {
			sslmode = "disable"
		}
	}

	dsn := fmt.Sprintf("host=%s port=%s user=%s dbname=%s sslmode=%s password=%s",
		host, port, user, dbname, sslmode, password)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("sql.Open: %w", err)
	}

	// H5 audit : tuning du pool.
	maxOpen, _ := strconv.Atoi(os.Getenv("DB_MAX_OPEN_CONNS"))
	if maxOpen <= 0 {
		maxOpen = defaultMaxOpenConns
	}
	maxIdle, _ := strconv.Atoi(os.Getenv("DB_MAX_IDLE_CONNS"))
	if maxIdle <= 0 {
		maxIdle = defaultMaxIdleConns
	}
	lifetimeMin, _ := strconv.Atoi(os.Getenv("DB_CONN_MAX_LIFETIME_MIN"))
	if lifetimeMin <= 0 {
		lifetimeMin = int(defaultConnMaxLifetime.Minutes())
	}
	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxIdle)
	db.SetConnMaxLifetime(time.Duration(lifetimeMin) * time.Minute)

	// Ping initial pour valider la chaîne complète (auth + réseau + sslmode).
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("db.Ping (host=%s sslmode=%s): %w", host, sslmode, err)
	}

	return db, nil
}