// Package database — helpers de timeout pour les requêtes SQL.
//
// H5 audit (perf) : un handler qui passe un context.Background() à un repo peut
// bloquer indéfiniment si Postgres ne répond pas (lock contention, network
// partition, requête mal optimisée). Le pool finit par saturer, les requêtes
// légitimes sont en file d'attente, et l'API devient latente jusqu'à timeout
// côté load balancer (= erreur 502 visible par les utilisateurs).
//
// Solution : chaque appel repo DOIT passer par WithQueryTimeout() pour obtenir
// un context avec un deadline dur. Si une requête dépasse, le driver coupe
// proprement et le handler peut logger + renvoyer une 503.
//
// Politique de deadline (cf. doc) :
//   - Si le parent a un deadline PLUS COURT que le timeout par défaut, on
//     respecte le parent (déjà restrictif, pas besoin d'en ajouter).
//   - Si le parent a un deadline PLUS LONG ou pas de deadline, on applique
//     le timeout par défaut (30s) pour éviter qu'une requête passe
//     inaperçue dans un ctx à 24h.
//   - Si le parent a un deadline PLUS COURT, deadline = parent.
package database

import (
	"context"
	"os"
	"strconv"
	"time"
)

const defaultQueryTimeout = 30 * time.Second

// WithQueryTimeout retourne un context dérivé avec un timeout dur pour
// une requête SQL. À utiliser dans tous les repositories AVANT d'appeler
// QueryContext / ExecContext.
//
// Exemple :
//   ctx, cancel := database.WithQueryTimeout(c.Request.Context())
//   defer cancel()
//   rows, err := db.QueryContext(ctx, query, args...)
//
// Le cancel retourné DOIT être defer-cancel par l'appelant (best practice
// context). Si le parent ctx est déjà annulé, le ctx enfant l'est aussi.
func WithQueryTimeout(parent context.Context) (context.Context, context.CancelFunc) {
	timeoutSec, _ := strconv.Atoi(os.Getenv("DB_QUERY_TIMEOUT_SEC"))
	if timeoutSec <= 0 {
		timeoutSec = int(defaultQueryTimeout.Seconds())
	}
	desired := time.Duration(timeoutSec) * time.Second

	// Si le parent a déjà un deadline, on garde le MIN des deux
	// (parent vs desired). Cela garantit qu'on ne rallonge JAMAIS un
	// deadline déjà restrictif (ex: timeout HTTP 10s en cours).
	if parentDeadline, ok := parent.Deadline(); ok {
		remaining := time.Until(parentDeadline)
		if remaining < desired {
			// Parent plus restrictif → on le réutilise tel quel.
			// On crée un ctx dérivé avec le deadline du parent pour
			// pouvoir quand même respecter un cancel() explicite.
			return context.WithDeadline(parent, parentDeadline)
		}
		// Parent plus large → on applique desired.
		return context.WithTimeout(parent, desired)
	}

	// Pas de deadline parent → on applique desired.
	return context.WithTimeout(parent, desired)
}