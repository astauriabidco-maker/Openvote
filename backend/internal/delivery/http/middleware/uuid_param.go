// Middleware de validation UUID pour les path params Gin.
//
// But : factoriser la validation `uuid.Parse(c.Param("id"))` qui était
// sinon dupliquée dans chaque handler acceptant un :id en URL. Sans
// cette validation, un ID non-UUID (ex: "1", "abc") passait la regexp
// Gin, atterrissait dans la query SQL, et le driver postgres renvoyait
// "invalid input syntax for type uuid" → 500. Avec la middleware, on
// retourne 400 BadRequest avec un message explicite AVANT d'atteindre
// le handler.
//
// Pattern d'usage (côté router) :
//
//	admin.PATCH("/users/:id", middleware.RequireUUIDParam("id"), usersHandler.UpdateUser)
//
// Ou en groupe (DRY pour un groupe de routes qui partagent le même
// path param) :
//
//	users := admin.Group("/users", middleware.RequireUUIDParam("id"))
//	users.PATCH("/:id", usersHandler.UpdateUser)  // pas besoin de re-spécifier
//
// Note : la middleware abort la request via c.AbortWithStatusJSON si
// la validation échoue. Les handlers en aval peuvent faire confiance
// à c.Param("id") et skipper leur propre check UUID (DRY).
package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RequireUUIDParam retourne un middleware Gin qui valide que le path
// param `paramName` est un UUID valide. Réponse :
//   - 400 BadRequest si absent ou invalide
//   - appelle c.Next() si OK
//
// Convention de message d'erreur : on inclut le nom du param + la
// valeur reçue pour faciliter le debug côté client. C'est aussi le
// format aligné avec l'ancien check inline de
// GetDepartmentDemographicsHistory (rétro-compatible).
func RequireUUIDParam(paramName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.Param(paramName)
		if raw == "" {
			// Devrait jamais arriver en pratique : si la route a
			// `:id`, Gin remplit le param (même avec une string
			// vide si l'URL finit par /). Mais on garde le check
			// pour les routes catch-all.
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error": "paramètre " + paramName + " requis",
			})
			return
		}
		if _, err := uuid.Parse(raw); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"error":      "ID invalide (UUID attendu)",
				paramName:    raw,
				"param_name": paramName,
			})
			return
		}
		c.Next()
	}
}
