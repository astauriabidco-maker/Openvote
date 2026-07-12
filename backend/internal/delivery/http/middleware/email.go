// Middleware de validation email sur query param.
//
// But : factoriser la validation d'un query paramètre qui doit être
// un email. Avant : si on voulait valider ?email=foo@bar sur un
// endpoint public (ex: recherche par email, "forgot password"), on
// copiait le net/mail.ParseAddress inline. Avec RequireQueryEmail :
//   - absent          → OK (paramètre optionnel), handler décide
//   - présent + invalide → 400 avec message clair
//   - présent + valide → injecte dans le contexte
//
// Note : on ne vérifie PAS que l'email existe (ça c'est le boulot
// du handler/repo). On vérifie juste la FORME (RFC 5322 via
// net/mail.ParseAddress).

package middleware

import (
	"net/http"
	"net/mail"

	"github.com/gin-gonic/gin"
)

// Clé de contexte pour récupérer l'email validé et normalisé.
const ContextKeyEmail = "validated_email"

// RequireQueryEmail valide que ?<paramName>= est un email bien formé.
// Si le paramètre est absent : OK (c'est un filtre optionnel).
// Si présent + invalide : 400 avec détail sur la valeur.
// Si présent + valide : injecte l'adresse normalisée (lowercase + trié)
// dans le contexte sous ContextKeyEmail.
//
// Récupération côté handler : GetValidatedEmail(c) (string, bool).
func RequireQueryEmail(paramName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.Query(paramName)
		if raw == "" {
			// Pas de query param → on laisse passer, le handler
			// gère l'absence (GetValidatedEmail retourne "", false).
			c.Next()
			return
		}
		addr, err := mail.ParseAddress(raw)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":      "email invalide",
				"param":      paramName,
				"value":      raw,
				"constraint": "RFC 5322 address",
			})
			return
		}
		c.Set(ContextKeyEmail, addr.Address)
		c.Next()
	}
}

// GetValidatedEmail récupère l'email validé par RequireQueryEmail.
// Retourne (email, present) — present=false si pas de query param
// ou si la middleware n'a pas tourné.
func GetValidatedEmail(c *gin.Context) (string, bool) {
	v, ok := c.Get(ContextKeyEmail)
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}
