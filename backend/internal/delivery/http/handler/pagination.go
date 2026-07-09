package handler

import (
	"math"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Constantes de pagination — exposées pour les handlers et les tests.
const (
	DefaultPage     = 1
	DefaultLimit    = 50
	MaxLimit        = 200 // évite qu'un client demande 100k rows en une fois
)

// Pagination encapsule les paramètres de pagination validés pour une requête.
type Pagination struct {
	Page  int
	Limit int
}

// Offset calcule l'offset SQL/IDB à partir de (page, limit).
// Convention 1-indexée côté user, 0-indexée côté DB.
func (p Pagination) Offset() int {
	return (p.Page - 1) * p.Limit
}

// TotalPages calcule le nombre total de pages pour un total donné.
func (p Pagination) TotalPages(total int) int {
	if p.Limit == 0 {
		return 0
	}
	return int(math.Ceil(float64(total) / float64(p.Limit)))
}

// ParsePagination extrait et valide `?page=N&limit=M` du contexte Gin.
// Retourne la pagination par défaut si les paramètres sont absents ou invalides.
// Toute valeur hors limites est clampée (jamais d'erreur 400 sur la pagination).
func ParsePagination(c *gin.Context) Pagination {
	page := parseIntDefault(c.Query("page"), DefaultPage)
	limit := parseIntDefault(c.Query("limit"), DefaultLimit)

	if page < 1 {
		page = DefaultPage
	}
	if limit < 1 {
		limit = DefaultLimit
	}
	if limit > MaxLimit {
		limit = MaxLimit
	}
	return Pagination{Page: page, Limit: limit}
}

// PaginatedResponse construit le payload standard de réponse paginée.
// Format JSON stable : { "items": [...], "pagination": {...} }.
func PaginatedResponse(items interface{}, p Pagination, total int) gin.H {
	return gin.H{
		"items": items,
		"pagination": gin.H{
			"page":        p.Page,
			"limit":       p.Limit,
			"total":       total,
			"total_pages": p.TotalPages(total),
		},
	}
}

func parseIntDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}