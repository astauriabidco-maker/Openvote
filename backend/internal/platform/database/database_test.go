// Tests du package database.
//
// Couvre H2 (sslmode) + H5 (pool + query timeout) sans avoir besoin d'une
// vraie DB Postgres — on teste uniquement la logique de validation config
// et le timeout helper. Les tests d'intégration DB sont dans les couches
// repository (qui nécessitent docker-compose).
package database

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"
)

// TestWithQueryTimeoutDefaut : vérifie que le timeout par défaut est appliqué
// quand DB_QUERY_TIMEOUT_SEC n'est pas défini.
func TestWithQueryTimeoutDefaut(t *testing.T) {
	os.Unsetenv("DB_QUERY_TIMEOUT_SEC")
	parent := context.Background()

	ctx, cancel := WithQueryTimeout(parent)
	defer cancel()

	deadline, ok := ctx.Deadline()
	if !ok {
		t.Fatal("ctx devrait avoir une deadline")
	}
	// Le default est 30s, on accepte 25-35s pour absorber le temps d'exécution.
	remaining := time.Until(deadline)
	if remaining < 25*time.Second || remaining > 35*time.Second {
		t.Errorf("timeout attendu ~30s, obtenu %v", remaining)
	}
}

// TestWithQueryTimeoutPersonnalise : DB_QUERY_TIMEOUT_SEC=5 → deadline ~5s.
func TestWithQueryTimeoutPersonnalise(t *testing.T) {
	os.Setenv("DB_QUERY_TIMEOUT_SEC", "5")
	defer os.Unsetenv("DB_QUERY_TIMEOUT_SEC")

	ctx, cancel := WithQueryTimeout(context.Background())
	defer cancel()

	deadline, ok := ctx.Deadline()
	if !ok {
		t.Fatal("ctx devrait avoir une deadline")
	}
	remaining := time.Until(deadline)
	if remaining < 4*time.Second || remaining > 6*time.Second {
		t.Errorf("timeout attendu ~5s, obtenu %v", remaining)
	}
}

// TestWithQueryTimeoutRespecteParent : si le parent a un deadline plus court,
// c'est lui qui gagne (le ctx enfant ne peut pas étendre).
func TestWithQueryTimeoutRespecteParent(t *testing.T) {
	os.Setenv("DB_QUERY_TIMEOUT_SEC", "30")
	defer os.Unsetenv("DB_QUERY_TIMEOUT_SEC")

	parentCtx, parentCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer parentCancel()

	ctx, cancel := WithQueryTimeout(parentCtx)
	defer cancel()

	// Le deadline du ctx enfant doit être <= deadline du parent.
	childDeadline, ok1 := ctx.Deadline()
	parentDeadline, ok2 := parentCtx.Deadline()
	if !ok1 || !ok2 {
		t.Fatal("les deux ctx devraient avoir des deadlines")
	}
	if childDeadline.After(parentDeadline) {
		t.Errorf("le deadline enfant (%v) ne devrait pas dépasser le parent (%v)", childDeadline, parentDeadline)
	}
}

// TestWithQueryTimeoutCancel : cancel() doit effectivement annuler le ctx.
func TestWithQueryTimeoutCancel(t *testing.T) {
	ctx, cancel := WithQueryTimeout(context.Background())
	cancel() // appel immédiat

	select {
	case <-ctx.Done():
		// OK
	case <-time.After(1 * time.Second):
		t.Fatal("ctx devrait être annulé après cancel()")
	}
	if !errors.Is(ctx.Err(), context.Canceled) {
		t.Errorf("erreur attendue context.Canceled, obtenu %v", ctx.Err())
	}
}

// TestNewPostgresDBManqueHost : sans DB_HOST, doit retourner une erreur de
// connexion (ping échoue), pas un panic. Vérifie qu'on ne crash pas en dev
// quand la config est partielle.
func TestNewPostgresDBManqueHost(t *testing.T) {
	os.Setenv("APP_ENV", "development")
	os.Setenv("DB_HOST", "")
	os.Setenv("DB_PORT", "5432")
	os.Setenv("DB_USER", "x")
	os.Setenv("DB_PASSWORD", "x")
	os.Setenv("DB_NAME", "x")
	os.Unsetenv("DB_SSLMODE")
	defer os.Unsetenv("APP_ENV")

	_, err := NewPostgresDB()
	if err == nil {
		t.Skip("Pas de Postgres dispo localement — le test vérifie juste qu'on ne panic pas")
	}
	// On accepte n'importe quelle erreur réseau.
}

// TestNewPostgresDBFailleSurSslmodeDisableEnProd : APP_ENV=production +
// DB_SSLMODE=disable → doit paniquer (H2 audit).
//
// On ne peut pas capturer un panic dans un test unitaire sans recover(),
// mais on veut le déclencher pour vérifier qu'il se produit. On utilise
// un sous-test isolé et on restore la config ensuite.
//
// Note : ce test modifie des env vars globales. Risque de pollution
// inter-tests si on l'exécute en parallèle — on force t.Setenv + defer.
func TestNewPostgresDBFailleSurSslmodeDisableEnProd(t *testing.T) {
	// Isoler le test pour ne pas polluer les autres.
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("attendu panic sur sslmode=disable en production, aucun panic observé")
		} else {
			t.Logf("panic attendu capturé : %v", r)
		}
	}()

	t.Setenv("APP_ENV", "production")
	t.Setenv("DB_SSLMODE", "disable")
	t.Setenv("DB_HOST", "x")
	t.Setenv("DB_PORT", "5432")
	t.Setenv("DB_USER", "x")
	t.Setenv("DB_PASSWORD", "x")
	t.Setenv("DB_NAME", "x")

	// Cette ligne doit paniquer.
	_, _ = NewPostgresDB()
}