// Request ID propagation — UUID par requête, propagation via
// header HTTP + contexte Gin, logging cohérent.
//
// But : donner à chaque requête un identifiant UNIQUE qui peut être :
//   - loggué dans les logs serveur (corrélation requêtes ↔ erreurs)
//   - renvoyé au client via le header X-Request-ID
//   - propagé par le client entre services (load balancer, downstream
//     API, mobile, etc.) pour le tracing distribué
//   - exposé aux handlers via GetRequestID(c) pour les inclure
//     dans les logs applicatifs et les audit logs
//
// Convention de header : X-Request-ID (standard de-facto, utilisé
// par Heroku, Cloud Run, AWS ALB, etc.). Si le client envoie
// déjà un X-Request-ID, on le réutilise (cas du retry/proxy).
//
// Validation : on n'accepte QUE des UUIDs v4 canoniques. Si le client
// envoie autre chose (texte libre, autre format), on REGÉNÈRE un
// UUID côté serveur plutôt que de faire confiance à l'input. C'est
// de la défense contre les log injection (un X-Request-ID malicieux
// pourrait casser la lecture des logs).
//
// Ordre de montage : ce middleware doit être monté EN PREMIER,
// pour que TOUS les middlewares downstream (CORS, auth, handlers)
// aient accès au request ID et puissent l'utiliser dans leurs logs.

package middleware

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// HeaderRequestID est le nom du header HTTP standard pour le
// request ID. Constant plutôt que string inline partout.
const HeaderRequestID = "X-Request-ID"

// ContextKeyRequestID est la clé sous laquelle on stocke l'ID
// dans le contexte Gin (et que les handlers lisent via
// GetRequestID).
const ContextKeyRequestID = "request_id"

// RequestIDMiddleware génère (ou réutilise) un UUID v4 par requête,
// le stocke dans le contexte Gin, le pose dans le header de
// réponse X-Request-ID, et logge l'ID avec la méthode+path pour
// faciliter la corrélation dans les logs.
//
// Si le client envoie un X-Request-ID déjà valide (UUID v4
// canonique), on le réutilise — c'est le cas du retry client,
// d'un proxy, ou d'un load balancer. Sinon (vide, malformé, ou
// pas un UUID), on REGÉNÈRE côté serveur (defense contre log
// injection).
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Étape 1 : extraire l'ID depuis le header entrant (si valide).
		incoming := c.GetHeader(HeaderRequestID)
		id := ""
		if incoming != "" {
			if parsed, err := uuid.Parse(incoming); err == nil {
				id = parsed.String()
			}
			// Si parse échoue : on ignore et on regénère plus bas.
			// Pas de log warn ici : un client mal codé qui envoie
			// un X-Request-ID foireux est normal (lib JS, vieux
			// proxy, etc.) — pas la peine de polluer les logs.
		}

		// Étape 2 : si pas d'ID valide, générer un UUID v4.
		if id == "" {
			newID, err := uuid.NewRandom()
			if err != nil {
				// Extrêmement rare (problème crypto). On log
				// et on continue avec un ID vide — le client
				// aura un header vide mais la requête continuera.
				// Mieux que de crasher la requête sur un bug
				// crypto OS.
				log.Printf("[REQ_ID] uuid.NewRandom failed: %v", err)
				c.Next()
				return
			}
			id = newID.String()
		}

		// Étape 3 : poser l'ID dans le contexte + le header de
		// réponse. Header must be set BEFORE c.Next() so it's
		// in the response even if a downstream middleware panics.
		c.Set(ContextKeyRequestID, id)
		c.Header(HeaderRequestID, id)

		// Étape 4 : logger l'arrivée de la requête (une seule
		// ligne par requête, format lisible). Le defer dans
		// RecoveryMiddleware (ou un AccessLog middleware à
		// venir) log la fin avec status + duration.
		log.Printf("[REQ] %s id=%s %s %s",
			c.Request.RemoteAddr,
			id,
			c.Request.Method,
			c.Request.URL.Path,
		)

		c.Next()
	}
}

// GetRequestID retourne l'ID de la requête courante depuis le
// contexte Gin. Retourne "" si la middleware n'a pas tourné
// (ex: handler appelé directement dans un test sans passer par
// le router complet).
func GetRequestID(c *gin.Context) string {
	if v, ok := c.Get(ContextKeyRequestID); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
