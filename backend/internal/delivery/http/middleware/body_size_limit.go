// Body size limit middleware — rejeter les uploads > max AVANT
// qu'ils saturent la mémoire.
//
// Sans ce middleware, un client peut envoyer un body de 10 Go
// en chunked transfer-encoding (pas de Content-Length). Gin va
// l'accumuler en mémoire avant de le passer au handler → OOM
// ou ralentissement global du process.
//
// Pattern de défense (deux niveaux) :
//   1. Content-Length présent (cas le plus courant) : on lit le
//      header, et si > max → 413 Payload Too Large IMMÉDIATEMENT
//      sans lire le body.
//   2. Content-Length absent (chunked transfer-encoding, rare
//      mais légal) : on remplace c.Request.Body par un
//      http.MaxBytesReader. Quand le handler essaiera de lire
//      au-delà de max, il aura une erreur. Pour retourner un
//      413 propre AVANT que le handler tente de parser, on peut
//      aussi wrapper le body avec notre propre Reader qui
//      détecte le dépassement et écrit un 413. C'est optionnel
//      — MaxBytesReader suffit à empêcher l'OOM.
//
// Note : on NE réécrit PAS la méthode du handler pour qu'elle
// détecte le dépassement — on laisse le body wrapper faire son
// travail. Si le handler bind le body avec un JSON parseur
// (ShouldBindJSON), le parseur recevra l'erreur de lecture et
// retournera 400. C'est moins idéal qu'un 413 explicite mais
// ça suffit pour la défense. Un handler peut détecter l'erreur
// spécifique (errors.Is(err, &http.MaxBytesError{})) et retourner
// 413 si besoin.
//
// Ordre de montage : APRÈS RequestIDMiddleware (pour avoir
// l'ID dans la réponse 413) et APRÈS Recovery (pour catcher
// tout panic d'un handler). On peut le mettre sur le root
// engine pour protéger TOUTES les routes, ou sur un group
// pour ne protéger que les routes d'upload (admin, etc.).

package middleware

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// DefaultMaxBodyBytes est la limite par défaut si MaxBodyBytes()
// est appelé sans argument. 10 MB = uploads d'images/PDF
// raisonnables, au-dessus de quoi on a probablement affaire à
// une attaque ou un bug client.
const DefaultMaxBodyBytes = 10 * 1024 * 1024 // 10 MB

// MaxBodyBytes retourne une middleware Gin qui rejette les
// requêtes avec un body > maxBytes. Le défaut est 10 MB
// (DefaultMaxBodyBytes) si maxBytes <= 0.
func MaxBodyBytes(maxBytes int64) gin.HandlerFunc {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxBodyBytes
	}

	return func(c *gin.Context) {
		// Niveau 1 : check Content-Length. C'est le fast path :
		// on évite même de lire le body.
		if c.Request.ContentLength > maxBytes {
			abortTooLarge(c, maxBytes, c.Request.ContentLength)
			return
		}

		// Niveau 2 : wrap le body avec MaxBytesReader. Pour les
		// requêtes chunked (Content-Length == -1 ou 0), ça
		// catch le dépassement au moment où le handler lit.
		// On le fait aussi pour les requêtes avec
		// Content-Length <= maxBytes (sécurité en profondeur :
		// un client pourrait envoyer un Content-Length < réel,
		// MaxBytesReader catch la différence à la lecture).
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(
				c.Writer,
				c.Request.Body,
				maxBytes,
			)
		}

		c.Next()
	}
}

// abortTooLarge écrit une réponse 413 avec un message clair
// qui inclut la limite et la taille reçue (utile pour le client
// qui peut ajuster). Respecte le format JSON de tout le backend.
func abortTooLarge(c *gin.Context, max int64, received int64) {
	c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{
		"error":            "request body too large",
		"max_bytes":        max,
		"received_bytes":   received,
		"max_human":        formatHumanBytes(max),
		"received_human":   formatHumanBytes(received),
		"request_id":       GetRequestID(c),
	})
}

// formatHumanBytes convertit un nombre d'octets en string lisible
// (ex: 10485760 → "10.0 MB"). Pas de dep externe, juste une
// fonction locale.
func formatHumanBytes(b int64) string {
	const (
		KB = 1024
		MB = 1024 * 1024
		GB = 1024 * 1024 * 1024
	)
	switch {
	case b >= GB:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(GB))
	case b >= MB:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(MB))
	case b >= KB:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(KB))
	default:
		return fmt.Sprintf("%d B", b)
	}
}
