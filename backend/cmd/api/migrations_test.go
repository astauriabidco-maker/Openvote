// Tests du migration runner (cmd/api/migrations.go).
//
// runMigrations est la pièce critique du boot : il tracke dans
// schema_migrations ce qui a été appliqué pour ne PAS re-rouler les
// INSERT non-idempotents des migrations 002/003/005 sur un 2e boot.
//
// On utilise sqlmock pour tester sans vraie DB — les chemins
// testés couvrent les 5 cas qui peuvent casser en prod :
//
//   1. "déjà-appliquée" : version présente dans schema_migrations → skip
//   2. "nouvelle"       : version absente → BEGIN + EXEC + INSERT + COMMIT
//   3. "exec fails"     : l'EXEQ de la migration retourne une erreur
//                         → rollback + return error (pas de commit)
//   4. "insert fails"   : l'INSERT dans schema_migrations échoue
//                         → rollback + return error
//   5. "backfill state" : schema_migrations vide MAIS regions existe
//                         → on backfill toutes les versions
//
// Chaque cas vérifie à la fois le retour (nil/error) ET les queries
// SQL émises (via sqlmock Expectations) — c'est le seul moyen de
// s'assurer qu'on a bien :
//   - appelé le SELECT EXISTS avant d'agir
//   - ouvert une transaction
//   - rollbacké en cas d'échec (pas de commit)

package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

// newMockDB retourne un *sql.DB alimenté par sqlmock + le mock lui-même.
// Les tests setup les expectations sur le mock AVANT d'appeler
// runMigrations, puis appellent mock.ExpectationsWereMet() pour vérifier
// que toutes les queries attendues ont été émises.
func newMockDB(t *testing.T) (*sql.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, mock
}

// writeMigrationFile crée un fichier SQL temporaire contenant le contenu
// donné, et retourne son chemin. Utile pour les tests qui veulent qu'un
// fichier de migration existe (sinon runMigrations retourne "read X: no
// such file" avant même d'attaquer la DB).
func writeMigrationFile(t *testing.T, name, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
	return path
}

// ============================================================
// Cas 1 : migration "déjà-appliquée" → skip silencieux
// ============================================================
// Scénario : on redémarre le backend, schema_migrations contient déjà
// la version. runMigrations doit skipper SANS rouvrir de transaction.
func TestRunMigrations_DejaAppliquee_Skip(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectExec(schemaMigrationsDDL).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT COUNT(*) FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	// 'applied' = true → on lit la table pour vérifier, on n'exécute rien
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)").
		WithArgs("migration/002_regions_departments.sql").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	migs := []migration{{file: "migration/002_regions_departments.sql", name: "régions/départements"}}
	if err := runMigrations(db, migs); err != nil {
		t.Fatalf("attendu nil, obtenu %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("queries attendues non émises : %v", err)
	}
}

// ============================================================
// Cas 2 : migration "nouvelle" → EXEC + INSERT en transaction
// ============================================================
// Scénario : DB fraîche, schema_migrations vide, regions absent
// (donc pas de bootstrap), la version est absente → on doit lire le
// fichier, BEGIN, EXEC, INSERT tracking, COMMIT.
func TestRunMigrations_Nouvelle_ExecEtInsertCommit(t *testing.T) {
	db, mock := newMockDB(t)

	sqlContent := "CREATE TABLE foo (id INT);"
	migFile := writeMigrationFile(t, "099_test_foo.sql", sqlContent)

	mock.ExpectExec(schemaMigrationsDDL).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT COUNT(*) FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	// Bootstrap check : regions absent → pas de backfill
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='regions')").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	// Check version : absente (on utilise le path complet, c'est ce
	// que le runner passe à QueryRow).
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)").
		WithArgs(migFile).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	// Transaction
	mock.ExpectBegin()
	mock.ExpectExec(sqlContent).WillReturnResult(sqlmock.NewResult(0, 0))
	// On vérifie l'INSERT avec le bon checksum (sha256 du contenu)
	checksum := sha256.Sum256([]byte(sqlContent))
	mock.ExpectExec("INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)").
		WithArgs(migFile, hex.EncodeToString(checksum[:])).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	migs := []migration{{file: migFile, name: "test foo"}}
	if err := runMigrations(db, migs); err != nil {
		t.Fatalf("attendu nil, obtenu %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("queries attendues non émises : %v", err)
	}
}

// ============================================================
// Cas 3 : EXEC fail → rollback + return error
// ============================================================
// Scénario : la migration contient un SQL invalide (ex: ALTER TABLE
// sur une table inexistante). Le runner doit rollback la transaction
// (pas de commit) et retourner l'erreur.
func TestRunMigrations_ExecFail_Rollback(t *testing.T) {
	db, mock := newMockDB(t)

	sqlContent := "ALTER TABLE nonexistent_xyz ADD COLUMN foo INT;"
	migFile := writeMigrationFile(t, "098_broken.sql", sqlContent)
	execErr := errors.New("relation \"nonexistent_xyz\" does not exist")

	mock.ExpectExec(schemaMigrationsDDL).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT COUNT(*) FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='regions')").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)").
		WithArgs(migFile).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectBegin()
	mock.ExpectExec(sqlContent).WillReturnError(execErr)
	// ATTENDU : rollback explicite (pas de commit, pas d'insert).
	// sqlmock considère une tx sans Commit comme "pending" si on
	// n'exprime pas le Rollback explicitement ; on le déclare pour
	// qu'ExpectationsWereMet passe.
	mock.ExpectRollback()

	migs := []migration{{file: migFile, name: "broken"}}
	err := runMigrations(db, migs)
	if err == nil {
		t.Fatal("attendu erreur, obtenu nil")
	}
	// Le message doit contenir "exec" + le nom de la migration
	// pour qu'on puisse debug depuis les logs.
	if !contains(err.Error(), "exec broken") {
		t.Errorf("message d'erreur inattendu : %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("queries attendues non émises : %v", err)
	}
}

// ============================================================
// Cas 4 : INSERT tracking fail → rollback + return error
// ============================================================
// Scénario : l'EXEQ passe (le SQL est valide) mais l'INSERT dans
// schema_migrations échoue (ex: contrainte UNIQUE sur version,
// problème de connexion, etc.). Le runner doit rollback pour ne
// PAS avoir un état partiel.
func TestRunMigrations_InsertFail_Rollback(t *testing.T) {
	db, mock := newMockDB(t)

	sqlContent := "SELECT 1;"
	migFile := writeMigrationFile(t, "097_tracking_fail.sql", sqlContent)
	insertErr := errors.New("duplicate key value violates unique constraint")

	mock.ExpectExec(schemaMigrationsDDL).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT COUNT(*) FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='regions')").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)").
		WithArgs(migFile).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectBegin()
	mock.ExpectExec(sqlContent).WillReturnResult(sqlmock.NewResult(0, 0))
	checksum := sha256.Sum256([]byte(sqlContent))
	mock.ExpectExec("INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)").
		WithArgs(migFile, hex.EncodeToString(checksum[:])).
		WillReturnError(insertErr)
	mock.ExpectRollback()

	migs := []migration{{file: migFile, name: "tracking fail"}}
	err := runMigrations(db, migs)
	if err == nil {
		t.Fatal("attendu erreur, obtenu nil")
	}
	if !contains(err.Error(), "track") {
		t.Errorf("message d'erreur attendu 'track ...', obtenu : %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("queries attendues non émises : %v", err)
	}
}

// ============================================================
// Cas 5 : bootstrap "ancien déploiement" — schema_migrations
//         vide MAIS regions existe → backfill de TOUTES les versions
// ============================================================
// Scénario : on déploie le nouveau code fail-fast sur une DB qui a
// déjà son schéma (déploiement existant). Sans bootstrap, le runner
// re-roulerait les INSERT non-idempotents de 002/003/005 et crash.
// Le bootstrap détecte ça et marque 002-017 comme déjà appliquées.
func TestRunMigrations_Bootstrap_BackfillSurAncienDeploiement(t *testing.T) {
	db, mock := newMockDB(t)

	migs := []migration{
		{file: "migration/002_regions_departments.sql", name: "régions/départements"},
		{file: "migration/003_elections_audit_incidents.sql", name: "élections/audit/incidents"},
		{file: "migration/017_schema_migrations_tracking.sql", name: "self-tracking"},
	}

	mock.ExpectExec(schemaMigrationsDDL).WillReturnResult(sqlmock.NewResult(0, 0))
	// schema_migrations vide
	mock.ExpectQuery("SELECT COUNT(*) FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	// regions EXISTE → on est dans le cas bootstrap
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='regions')").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	// Backfill : 3 INSERT ON CONFLICT DO NOTHING
	for i, mig := range migs {
		mock.ExpectExec(
			"INSERT INTO schema_migrations (version, checksum) VALUES ($1, 'bootstrap-2026-07') ON CONFLICT (version) DO NOTHING",
		).WithArgs(mig.file).
			WillReturnResult(sqlmock.NewResult(0, 1)).
			WillReturnResult(sqlmock.NewResult(0, 1)).
			WillReturnResult(sqlmock.NewResult(0, 1)) // dummy ; sqlmock ne compte pas
		_ = i
	}
	// Ensuite, chaque version est "déjà appliquée" (on vient de la backfiller)
	// → 3 SELECT EXISTS qui retournent true → skip → aucun EXEC
	for _, mig := range migs {
		mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)").
			WithArgs(mig.file).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	}

	if err := runMigrations(db, migs); err != nil {
		t.Fatalf("attendu nil, obtenu %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("queries attendues non émises : %v", err)
	}
}

// ============================================================
// Cas bonus : read fail — fichier listé mais absent
// ============================================================
// Avant le fail-fast, on silent-skippait un fichier manquant. C'est
// un bug (le runner prétend avoir tout appliqué alors qu'il a
// skipé un fichier) — le nouveau runner retourne une erreur.
func TestRunMigrations_ReadFail_FichierAbsent(t *testing.T) {
	db, mock := newMockDB(t)

	// Path qui n'existe pas sur le FS. Le test ne crée pas le
	// fichier exprès — c'est tout l'intérêt du cas.
	missingPath := filepath.Join(t.TempDir(), "does_not_exist.sql")

	mock.ExpectExec(schemaMigrationsDDL).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT COUNT(*) FROM schema_migrations").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='regions')").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)").
		WithArgs(missingPath).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	// Pas de Begin attendu : on retourne AVANT la transaction,
	// dès os.ReadFile qui échoue sur le fichier inexistant.

	migs := []migration{{file: missingPath, name: "missing"}}
	err := runMigrations(db, migs)
	if err == nil {
		t.Fatal("attendu erreur, obtenu nil")
	}
	if !contains(err.Error(), "read "+missingPath) {
		t.Errorf("message d'erreur attendu 'read ...', obtenu : %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("queries attendues non émises : %v", err)
	}
}

// ============================================================
// Helper : contains(s, sub) — strings.Contains sans importer
// strings (qui tirerait des deps en plus dans le binaire final).
// ============================================================
func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
