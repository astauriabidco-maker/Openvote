// Access log middleware — logger la FIN de chaque requête.
//
// Complément du RequestIDMiddleware qui logge le DÉBUT. Avec les
// deux, on a une trace complète par requête :
//
//   [REQ] 192.168.1.1 id=abc-123 GET /x              ← début
//   [ACCESS] 200 12ms 12B id=abc-123 GET /x          ← fin
//
// Format aligné avec la convention access log d'Apache/Nginx
// (status duration size method path) + le request_id Openvote
// pour la corrélation avec les autres logs.
//
// Performance : on utilise un time.Now() defer pour mesurer la
// durée sans overhead. Pas de buffering — on logge sur stdout
// (le log aggregateur externe le récupère, ex: Loki, Datadog).
// Pour de la prod à fort traffic, on switchera sur un logger
// asynchrone (uber-go/zap avec sampling). Pas critique pour
// l'admin backoffice.

package middleware

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// AccessLogMiddleware log chaque requête à la fin, avec status,
// durée, taille de la réponse, méthode, path et request_id.
//
// Le log est dans un defer pour qu'il s'exécute MÊME si un
// middleware upstream a abort (rate limit, auth, CORS refusé...).
// C'est important : on veut voir les 429 (rate limit) et 403
// (Origin refusée) dans les logs, pas seulement les 2xx.
//
// Format de la ligne :
//   [ACCESS] <status> <duration_ms> <response_size> <request_id> <method> <path> <ip>
//
// Exemple :
//   [ACCESS] 200 12ms 142B id=abc-123 GET /x 192.168.1.1
func AccessLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Path avec placeholder pour les path params (ex: /users/:id
		// au lieu de /users/abc-123-uuid) — plus lisible dans les
		// logs, et évite de polluer les logs avec des UUIDs uniques.
		// Note : FullPath() retourne la route template, c.Request.URL.Path
		// retourne le path réel. On préfère FullPath() pour les agrégations.
		path := c.FullPath()
		if path == "" {
			// Pas de route matchée (404) — on log le path brut
			path = c.Request.URL.Path
		}

		defer func() {
			// Calculs post-handler
			duration := time.Since(start)
			status := c.Writer.Status()
			size := c.Writer.Size()
			reqID := GetRequestID(c)
			method := c.Request.Method
			ip := c.ClientIP()

			log.Printf("[ACCESS] %d %s %dB id=%s %s %s %s",
				status,
				formatDuration(duration),
				size,
				reqID,
				method,
				path,
				ip,
			)
		}()

		c.Next()
	}
}

// formatDuration formate une durée pour le log : "12ms" pour les
// sub-second, "1.23s" pour les > 1s, "1m23s" pour les > 1min.
// Compact pour rester lisible dans une ligne d'access log.
func formatDuration(d time.Duration) string {
	switch {
	case d < time.Second:
		// Millisecondes sans décimales : "12ms", "234ms"
		return formatMS(d)
	case d < time.Minute:
		// Secondes avec 2 décimales : "1.23s"
		return formatFloat(float64(d)/float64(time.Second), 2) + "s"
	default:
		// Minutes-secondes : "1m23s"
		m := int(d / time.Minute)
		s := int((d % time.Minute) / time.Second)
		return formatInt(m) + "m" + formatInt(s) + "s"
	}
}

// formatMS, formatFloat, formatInt : helpers strconv sans
// importer strconv (qui tirerait des deps dans le binaire final
// pour juste 3 calls). Le pattern est inline pour rester simple.
func formatMS(d time.Duration) string {
	ms := d.Milliseconds()
	return formatInt(int(ms)) + "ms"
}

func formatFloat(f float64, prec int) string {
	// Arrondi (pas troncature) pour éviter les artefacts de
	// précision float. Ex: 0.34 en float64 ≈ 0.33999... qu'on
	// veut afficher "0.34", pas "0.33".
	whole := int(f)
	frac := f - float64(whole)
	if frac < 0 {
		frac = -frac
	}
	// multiplier pour obtenir la précision
	mul := 1
	for i := 0; i < prec; i++ {
		mul *= 10
	}
	// Arrondi : +0.5 avant truncate
	fracInt := int(frac*float64(mul) + 0.5)
	// Gérer le débordement (ex: 0.999 arrondi à 2 dec → 1.00)
	if fracInt >= mul {
		whole++
		fracInt -= mul
	}
	// Padding leading zeros (ex: 0.05 → "0.05" pas "0.5")
	pad := ""
	for v := fracInt; v < mul/10 && mul/10 > 0; v *= 10 {
		pad += "0"
	}
	return formatInt(whole) + "." + pad + formatInt(fracInt)
}

func formatInt(n int) string {
	if n == 0 {
		return "0"
	}
	negative := n < 0
	if negative {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if negative {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
