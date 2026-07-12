// Middleware de validation de pagination (?page=N&limit=M).
//
// But : factoriser la validation des query params de pagination.
// Avant : chaque handler faisait sa propre cuisine (helper
// handler.ParsePagination silencieux + defaults, ou inline
// strconv.Atoi avec valeurs magiques). Avec RequirePagination :
//   - STRICT : un ?page=abc ou ?page=-1 → 400 propre (au lieu de
//     silently default à 1 et potentiellement masquer un bug
//     client)
//   - INJECTÉ : on pose page et limit dans le contexte Gin pour
//     que les handlers les récupèrent via GetPagination(c) sans
//     re-parser la query
//
// Convention : page >= 1, limit dans [1, MaxLimit]. Les valeurs
// valides sont clampées (limit > MaxLimit → MaxLimit) ; les
// valeurs invalides (non-int, hors range) → 400.
//
// Distinction avec handler.ParsePagination (qui existe toujours) :
//   - ParsePagination(c) → helper forgiving, default à 1/50 si
//     invalide. Pour les routes historiques qui dépendent de ce
//     comportement.
//   - RequirePagination(...) → middleware strict, 400 sur invalide.
//     Pour les nouvelles routes ou les routes où un input mal
//     formé est un bug à signaler, pas à ignorer.

package middleware

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

const (
	// DefaultPage est la valeur par défaut si ?page= est absent.
	// Aligné sur handler.DefaultPage pour rétro-compatibilité.
	DefaultPage = 1
	// DefaultLimit est la valeur par défaut si ?limit= est absent.
	DefaultLimit = 50
	// MaxLimit évite qu'un client demande 100k rows en une fois
	// (= déni de service trivial).
	MaxLimit = 200
)

// Clés de contexte pour récupérer la pagination validée.
const (
	ContextKeyPage  = "validated_page"
	ContextKeyLimit = "validated_limit"
)

// PaginationOptions configure le middleware. Champs zéro = défauts.
type PaginationOptions struct {
	// DefaultLimit si ?limit= est absent. 0 → DefaultLimit (50).
	DefaultLimit int
	// MaxLimit borne supérieure. 0 → MaxLimit (200).
	MaxLimit int
}

// RequirePagination valide et injecte les query params ?page et
// ?limit. Comportement :
//   - absent             → defaults (DefaultPage=1, DefaultLimit=50)
//   - entier hors range  → 400 (page < 1, limit < 1, limit > MaxLimit)
//   - non-entier         → 400
//   - valide             → injecte et appelle c.Next()
//
// Récupération côté handler : GetPagination(c) retourne (page, limit).
func RequirePagination(opts ...PaginationOptions) gin.HandlerFunc {
	var o PaginationOptions
	if len(opts) > 0 {
		o = opts[0]
	}
	if o.DefaultLimit == 0 {
		o.DefaultLimit = DefaultLimit
	}
	if o.MaxLimit == 0 {
		o.MaxLimit = MaxLimit
	}

	return func(c *gin.Context) {
		page := DefaultPage
		limit := o.DefaultLimit

		if raw := c.Query("page"); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error":      "page doit être un entier",
					"param":      "page",
					"value":      raw,
					"constraint": "integer",
				})
				return
			}
			if n < 1 {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error":      "page doit être >= 1",
					"param":      "page",
					"value":      n,
					"constraint": "min=1",
				})
				return
			}
			page = n
		}

		if raw := c.Query("limit"); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error":      "limit doit être un entier",
					"param":      "limit",
					"value":      raw,
					"constraint": "integer",
				})
				return
			}
			if n < 1 {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error":      "limit doit être >= 1",
					"param":      "limit",
					"value":      n,
					"constraint": "min=1",
				})
				return
			}
			if n > o.MaxLimit {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error":      "limit dépasse le maximum autorisé",
					"param":      "limit",
					"value":      n,
					"max":        o.MaxLimit,
					"constraint": "max=" + strconv.Itoa(o.MaxLimit),
				})
				return
			}
			limit = n
		}

		c.Set(ContextKeyPage, page)
		c.Set(ContextKeyLimit, limit)
		c.Next()
	}
}

// GetPagination récupère la pagination validée par RequirePagination.
// Si la middleware n'a pas tourné (handler appelé sans elle), retourne
// les défauts — comme handler.ParsePagination, mais en lecture seule.
func GetPagination(c *gin.Context) (page, limit int) {
	if v, ok := c.Get(ContextKeyPage); ok {
		if n, ok := v.(int); ok {
			page = n
		} else {
			page = DefaultPage
		}
	} else {
		page = DefaultPage
	}
	if v, ok := c.Get(ContextKeyLimit); ok {
		if n, ok := v.(int); ok {
			limit = n
		} else {
			limit = DefaultLimit
		}
	} else {
		limit = DefaultLimit
	}
	return page, limit
}
