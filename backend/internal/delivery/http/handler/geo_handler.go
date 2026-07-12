package handler

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GeoHandler expose les données de référence géographique (régions +
// démographie BUCREP). Toutes les routes sont best-effort : on lit
// directement Postgres sans ORM, c'est read-only.
type GeoHandler struct {
	db *sql.DB
}

func NewGeoHandler(db *sql.DB) *GeoHandler {
	return &GeoHandler{db: db}
}

// ListRegions retourne les 10 régions du Cameroun avec compteurs
// démographiques (population 2025 total) pour le header de page.
func (h *GeoHandler) ListRegions(c *gin.Context) {
	rows, err := h.db.QueryContext(c.Request.Context(), `
		SELECT r.id::text, r.code, r.name,
		       COALESCE(SUM(CASE WHEN d.year = 2025 AND d.indicator = 'Population estimée' AND d.sex = 'Total' THEN d.value END), 0) AS pop_2025
		FROM regions r
		LEFT JOIN region_demographics d ON d.region_id = r.id
		GROUP BY r.id, r.code, r.name
		ORDER BY r.code
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query régions"})
		return
	}
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var id, code, name string
		var pop int64
		if err := rows.Scan(&id, &code, &name, &pop); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "scan région"})
			return
		}
		out = append(out, gin.H{
			"id":      id,
			"code":    code,
			"name":    name,
			"pop2025": pop,
		})
	}
	c.JSON(http.StatusOK, gin.H{"regions": out})
}

// ListIndicators retourne la liste des 19 indicateurs BUCREP disponibles
// (utilisé pour peupler le sélecteur frontend).
func (h *GeoHandler) ListIndicators(c *gin.Context) {
	rows, err := h.db.QueryContext(c.Request.Context(), `
		SELECT DISTINCT indicator FROM region_demographics ORDER BY indicator
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query indicateurs"})
		return
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err == nil {
			out = append(out, s)
		}
	}
	c.JSON(http.StatusOK, gin.H{"indicators": out})
}

// ListYears retourne la plage d'années disponibles (2016-2025).
func (h *GeoHandler) ListYears(c *gin.Context) {
	rows, err := h.db.QueryContext(c.Request.Context(), `
		SELECT MIN(year), MAX(year) FROM region_demographics
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query années"})
		return
	}
	defer rows.Close()
	if !rows.Next() {
		c.JSON(http.StatusOK, gin.H{"years": []int{}})
		return
	}
	var minY, maxY int
	rows.Scan(&minY, &maxY)
	years := []int{}
	for y := minY; y <= maxY; y++ {
		years = append(years, y)
	}
	c.JSON(http.StatusOK, gin.H{"years": years, "min": minY, "max": maxY})
}

// GetDemographicsParams query params supportés :
//   - region : code région (AD, CE, ...) ou 'all' pour Cameroun entier
//   - indicator : nom indicateur (défaut 'Population estimée')
//   - year : année (défaut 2025)
//   - sex : Féminin | Masculin | Total (optionnel, défaut = tous)
type DemographicsRow struct {
	RegionCode string  `json:"region_code"`
	RegionName string  `json:"region_name"`
	CityLabel  string  `json:"city_label"`
	Indicator  string  `json:"indicator"`
	Sex        string  `json:"sex"`
	Year       int     `json:"year"`
	Value      int64   `json:"value"`
}

// GetDemographics retourne les valeurs filtrées. C'est la route principale
// consommée par la pyramide des âges + tableau de cohortes du frontend.
//
// Convention des query params :
//   - region    : code région (AD, CE, ...) ou 'all' pour Cameroun entier.
//                 Défaut : 'all'.
//   - indicator : nom indicateur, ou 'all' pour tous. Défaut : 'all'.
//                 (Le frontend n'a pas toujours un indicateur sélectionné —
//                 par exemple pour charger toutes les cohortes d'âge en bulk
//                 et calculer la pyramide.)
//   - sex       : Féminin | Masculin | Total. Vide = tous. Défaut : ''.
//   - year      : entier. Défaut : 2025 (dernière année disponible).
func (h *GeoHandler) GetDemographics(c *gin.Context) {
	regionCode := c.DefaultQuery("region", "all")
	indicator := c.DefaultQuery("indicator", "all")
	sex := c.Query("sex") // optionnel
	yearStr := c.DefaultQuery("year", "2025")
	year, err := strconv.Atoi(yearStr)
	if err != nil || year < 1900 || year > 2100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "year invalide"})
		return
	}

	// Construction dynamique de la clause WHERE selon les filtres.
	// On évite les paramètres NULL en utilisant COALESCE côté SQL.
	q := `
		SELECT COALESCE(r.code, 'XX') AS region_code,
		       COALESCE(r.name, 'Cameroun (national)') AS region_name,
		       d.city_label, d.indicator, d.sex, d.year, d.value
		FROM region_demographics d
		LEFT JOIN regions r ON r.id = d.region_id
		WHERE d.year = $1
		  AND ($2 = 'all' OR d.indicator = $2)
		  AND ($3 = '' OR d.sex = $3)
		  AND ($4 = 'all' OR r.code = $4)
		ORDER BY r.code NULLS FIRST, d.city_label, d.indicator, d.sex
	`
	rows, err := h.db.QueryContext(c.Request.Context(), q, year, indicator, sex, regionCode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query: " + err.Error()})
		return
	}
	defer rows.Close()
	out := []DemographicsRow{}
	for rows.Next() {
		var r DemographicsRow
		if err := rows.Scan(&r.RegionCode, &r.RegionName, &r.CityLabel, &r.Indicator, &r.Sex, &r.Year, &r.Value); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "scan: " + err.Error()})
			return
		}
		out = append(out, r)
	}
	c.JSON(http.StatusOK, gin.H{
		"data": out,
		"filters": gin.H{
			"region":    regionCode,
			"indicator": indicator,
			"sex":       sex,
			"year":      year,
		},
	})
}
