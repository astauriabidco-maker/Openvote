// Recovery middleware — catch les panics et retourne un 500 propre
// avec le request ID, au lieu de laisser le serveur crasher.
//
// Sans ce middleware, un panic dans un handler (nil deref, division
// par zéro, etc.) remonte dans la stack Go et tue le worker
// process. Avec gin.Default(), Gin a un Recovery() intégré qui
// log le panic et retourne 500, mais :
//   - il retourne du plain text, pas du JSON
//   - il n'inclut pas le request ID
//   - il ne re-set pas le header X-Request-ID s'il a été perdu
//
// Ce middleware est un REPLACEMENT du gin.Recovery() par défaut.
// Il doit être monté EN DERNIER (juste avant les handlers) pour
// catcher les panics de tous les middlewares précédents ET des
// handlers eux-mêmes.
//
// C'est la "ceinture + bretelles" du backend : si une migration
// plante un handler, l'utilisateur voit un 500 propre avec un
// request ID, les logs ont la stack trace complète, et le serveur
// continue de servir les autres requêtes.

package middleware

import (
	"fmt"
	"log"
	"net/http"
	"runtime/debug"

	"github.com/gin-gonic/gin"
)

// RecoveryMiddleware catch les panics avec defer+recover. Si une
// panic survient, on :
//   1. Log la stack trace complète AVEC le request ID
//   2. Retourne 500 + JSON {"error":"internal server error",
//      "request_id":"..."} — le request_id permet au client de
//      rapporter l'incident ("j'ai eu un 500 avec req-id XYZ")
//      et l'opérateur de retrouver les logs
//   3. Le serveur continue de tourner pour les autres requêtes
//
// On NE réinitialise PAS le header X-Request-ID : si la middleware
// RequestIDMiddleware a tourné avant (ce qui devrait toujours être
// le cas en prod), le header est déjà dans le response writer.
// Si elle n'a pas tourné (ex: test unitaire), le header sera absent
// — c'est OK, le request_id sera quand même dans le body JSON.
func RecoveryMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Defer qui s'exécute juste avant que Gin retourne la
		// réponse. Si une panic survient dans c.Next() ou
		// après, on la catch ici.
		defer func() {
			if r := recover(); r != nil {
				// Récupère le request ID. Si RequestIDMiddleware
				// n'a pas tourné, ce sera "" — on log quand
				// même (le log est notre seul espoir de
				// corréler).
				reqID := GetRequestID(c)

				// Log structuré avec stack trace complète.
				// runtime/debug.Stack() inclut le panic + toute
				// la stack — c'est ce qu'on veut pour debug.
				log.Printf("[PANIC] req_id=%s panic=%v\n%s",
					reqID,
					r,
					debug.Stack(),
				)

				// Si la response writer n'a pas encore été
				// committed (aucun byte écrit), on peut
				// renvoyer un JSON propre. Sinon, on ne peut
				// plus changer le status code — on log et on
				// abandonne.
				if c.Writer.Written() {
					log.Printf("[PANIC] req_id=%s response already written, can't send 500", reqID)
					return
				}

				// 500 + JSON. On inclut le request_id dans
				// le body pour permettre au client de
				// rapporter l'incident.
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"error":      "internal server error",
					"request_id": reqID,
				})
			}
		}()

		c.Next()
	}
}

// StringifyPanic convertit une valeur recover() en string lisible.
// Principalement pour les logs structurés quand on n'utilise pas
// runtime/debug.Stack(). Helper exporté pour les tests.
func StringifyPanic(r interface{}) string {
	return fmt.Sprintf("%v", r)
}
