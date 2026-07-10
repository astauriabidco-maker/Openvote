package handler

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

type RegionHandler struct {
	regionRepo repository.RegionRepository
}

func NewRegionHandler(repo repository.RegionRepository) *RegionHandler {
	return &RegionHandler{regionRepo: repo}
}

// ========================================
// Régions
// ========================================

// ListRegions retourne toutes les régions avec leurs départements et arrondissements
func (h *RegionHandler) ListRegions(c *gin.Context) {
	regions, err := h.regionRepo.GetAllRegions(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type DeptWithArrs struct {
		entity.Department
		Arrondissements []entity.Arrondissement `json:"arrondissements"`
		ArrCount        int                     `json:"arr_count"`
	}

	type RegionWithDepts struct {
		entity.Region
		Departments []DeptWithArrs `json:"departments"`
		DeptCount   int            `json:"dept_count"`
	}

	var result []RegionWithDepts
	for _, r := range regions {
		depts, err := h.regionRepo.GetDepartmentsByRegion(c.Request.Context(), r.ID)
		if err != nil {
			depts = []entity.Department{}
		}

		var deptsWithArrs []DeptWithArrs
		for _, d := range depts {
			arrs, err := h.regionRepo.GetArrondissementsByDepartment(c.Request.Context(), d.ID)
			if err != nil {
				arrs = []entity.Arrondissement{}
			}
			if arrs == nil {
				arrs = []entity.Arrondissement{}
			}
			deptsWithArrs = append(deptsWithArrs, DeptWithArrs{
				Department:      d,
				Arrondissements: arrs,
				ArrCount:        len(arrs),
			})
		}

		result = append(result, RegionWithDepts{
			Region:      r,
			Departments: deptsWithArrs,
			DeptCount:   len(deptsWithArrs),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"regions": result,
		"total":   len(result),
	})
}

// CreateRegion crée une nouvelle région
func (h *RegionHandler) CreateRegion(c *gin.Context) {
	var input struct {
		Name string `json:"name" binding:"required"`
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	region := &entity.Region{Name: input.Name, Code: input.Code}
	if err := h.regionRepo.CreateRegion(c.Request.Context(), region); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur création région: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"region": region})
}

// UpdateRegion modifie une région existante
func (h *RegionHandler) UpdateRegion(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Name string `json:"name" binding:"required"`
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.regionRepo.UpdateRegion(c.Request.Context(), id, input.Name, input.Code); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Région non trouvée"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Région mise à jour"})
}

// DeleteRegion supprime une région et ses départements (CASCADE)
func (h *RegionHandler) DeleteRegion(c *gin.Context) {
	id := c.Param("id")
	if err := h.regionRepo.DeleteRegion(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Région et départements supprimés"})
}

// ========================================
// Départements
// ========================================

// ListDepartments retourne tous les départements
func (h *RegionHandler) ListDepartments(c *gin.Context) {
	regionID := c.Query("region_id")

	var depts []entity.Department
	var err error

	if regionID != "" {
		depts, err = h.regionRepo.GetDepartmentsByRegion(c.Request.Context(), regionID)
	} else {
		depts, err = h.regionRepo.GetAllDepartments(c.Request.Context())
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"departments": depts,
		"total":       len(depts),
	})
}

// CreateDepartment crée un nouveau département
func (h *RegionHandler) CreateDepartment(c *gin.Context) {
	var input struct {
		Name     string `json:"name" binding:"required"`
		Code     string `json:"code" binding:"required"`
		RegionID string `json:"region_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Vérifier que la région existe
	region, err := h.regionRepo.GetRegionByID(c.Request.Context(), input.RegionID)
	if err != nil || region == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Région introuvable"})
		return
	}

	dept := &entity.Department{Name: input.Name, Code: input.Code, RegionID: input.RegionID}
	if err := h.regionRepo.CreateDepartment(c.Request.Context(), dept); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur création département: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"department": dept})
}

// UpdateDepartment modifie un département
func (h *RegionHandler) UpdateDepartment(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Name             string `json:"name" binding:"required"`
		Code             string `json:"code" binding:"required"`
		RegionID         string `json:"region_id" binding:"required"`
		Population       int    `json:"population"`
		RegisteredVoters int    `json:"registered_voters"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.regionRepo.UpdateDepartment(c.Request.Context(), id, input.Name, input.Code, input.RegionID, input.Population, input.RegisteredVoters); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Département non trouvé"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Département mis à jour"})
}

// DeleteDepartment supprime un département
func (h *RegionHandler) DeleteDepartment(c *gin.Context) {
	id := c.Param("id")
	if err := h.regionRepo.DeleteDepartment(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Département supprimé"})
}

// ========================================
// Arrondissements
// ========================================

// ListArrondissements retourne les arrondissements d'un département
func (h *RegionHandler) ListArrondissements(c *gin.Context) {
	deptID := c.Query("department_id")
	if deptID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "department_id requis"})
		return
	}

	arrs, err := h.regionRepo.GetArrondissementsByDepartment(c.Request.Context(), deptID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if arrs == nil {
		arrs = []entity.Arrondissement{}
	}

	c.JSON(http.StatusOK, gin.H{
		"arrondissements": arrs,
		"total":           len(arrs),
	})
}

// CreateArrondissement crée un nouvel arrondissement
func (h *RegionHandler) CreateArrondissement(c *gin.Context) {
	var input struct {
		Name             string `json:"name" binding:"required"`
		Code             string `json:"code" binding:"required"`
		DepartmentID     string `json:"department_id" binding:"required"`
		Population       int    `json:"population"`
		RegisteredVoters int    `json:"registered_voters"`
		IsChefLieu       bool   `json:"is_chef_lieu"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	arr := &entity.Arrondissement{
		Name: input.Name, Code: input.Code, DepartmentID: input.DepartmentID,
		Population: input.Population, RegisteredVoters: input.RegisteredVoters, IsChefLieu: input.IsChefLieu,
	}
	if err := h.regionRepo.CreateArrondissement(c.Request.Context(), arr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur création arrondissement: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"arrondissement": arr})
}

// UpdateArrondissement modifie un arrondissement
func (h *RegionHandler) UpdateArrondissement(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Name             string `json:"name" binding:"required"`
		Code             string `json:"code" binding:"required"`
		DepartmentID     string `json:"department_id" binding:"required"`
		Population       int    `json:"population"`
		RegisteredVoters int    `json:"registered_voters"`
		IsChefLieu       bool   `json:"is_chef_lieu"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.regionRepo.UpdateArrondissement(c.Request.Context(), id, input.Name, input.Code, input.DepartmentID, input.Population, input.RegisteredVoters, input.IsChefLieu); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Arrondissement non trouvé"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Arrondissement mis à jour"})
}

// DeleteArrondissement supprime un arrondissement
func (h *RegionHandler) DeleteArrondissement(c *gin.Context) {
	id := c.Param("id")
	if err := h.regionRepo.DeleteArrondissement(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Arrondissement supprimé"})
}

// ========================================
// Import CSV
// ========================================

// ImportCSV importe des données démographiques depuis un fichier CSV
// Format CSV attendu : code,population,registered_voters,data_source
// Exemple : CE-MF,3400000,850000,BUCREP 2023
func (h *RegionHandler) ImportCSV(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fichier CSV requis"})
		return
	}
	defer file.Close()

	sourceName := c.PostForm("source_name")
	if sourceName == "" {
		sourceName = "Import CSV"
	}
	dataYear := 2025
	if y := c.PostForm("data_year"); y != "" {
		if parsed, err := strconv.Atoi(y); err == nil {
			dataYear = parsed
		}
	}
	confidence := c.PostForm("data_confidence")
	if confidence == "" {
		confidence = "official"
	}

	reader := csv.NewReader(file)
	reader.Comma = ','
	reader.TrimLeadingSpace = true
	reader.LazyQuotes = true

	// Lire le header
	headerRow, err := reader.Read()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Impossible de lire le fichier CSV"})
		return
	}

	// Identifier les colonnes
	colIdx := map[string]int{}
	for i, col := range headerRow {
		clean := strings.TrimSpace(strings.ToLower(col))
		clean = strings.Trim(clean, "\ufeff") // BOM
		colIdx[clean] = i
	}

	codCol, hasCode := colIdx["code"]
	popCol, hasPop := colIdx["population"]
	votersCol, hasVoters := colIdx["registered_voters"]
	if !hasVoters {
		votersCol, hasVoters = colIdx["inscrits"]
	}
	sourceCol, hasSource := colIdx["data_source"]
	if !hasSource {
		sourceCol, hasSource = colIdx["source"]
	}

	if !hasCode || (!hasPop && !hasVoters) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":          "Colonnes requises : code, population ou registered_voters (inscrits)",
			"colonnes_trouvees": headerRow,
			"format_attendu": "code,population,registered_voters,data_source",
		})
		return
	}

	updated := 0
	failed := 0
	var errors []string
	lineNum := 1

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			lineNum++
			continue
		}
		lineNum++

		code := strings.TrimSpace(record[codCol])
		if code == "" {
			continue
		}

		pop := 0
		if hasPop && popCol < len(record) {
			p, _ := strconv.Atoi(strings.TrimSpace(strings.ReplaceAll(record[popCol], " ", "")))
			pop = p
		}
		voters := 0
		if hasVoters && votersCol < len(record) {
			v, _ := strconv.Atoi(strings.TrimSpace(strings.ReplaceAll(record[votersCol], " ", "")))
			voters = v
		}
		rowSource := sourceName
		if hasSource && sourceCol < len(record) && strings.TrimSpace(record[sourceCol]) != "" {
			rowSource = strings.TrimSpace(record[sourceCol])
		}

		if err := h.regionRepo.UpdateDepartmentDemographics(c.Request.Context(), code, pop, voters, rowSource, confidence, dataYear); err != nil {
			failed++
			errors = append(errors, fmt.Sprintf("Ligne %d: code '%s' non trouvé", lineNum, code))
		} else {
			updated++
		}
	}

	// Logger l'import
	notes := fmt.Sprintf("%d mis à jour, %d échoués", updated, failed)
	if len(errors) > 0 && len(errors) <= 10 {
		notes += ". Erreurs: " + strings.Join(errors, "; ")
	}
	_ = h.regionRepo.LogDataImport(c.Request.Context(), "demographics", sourceName, header.Filename, "admin", notes, updated, failed)

	c.JSON(http.StatusOK, gin.H{
		"message":  fmt.Sprintf("%d départements mis à jour", updated),
		"updated":  updated,
		"failed":   failed,
		"errors":   errors,
		"filename": header.Filename,
	})
}

// GetDataImports retourne l'historique des importations, paginé
// server-side (?page=N&limit=M). Renvoie aussi `total` (count global)
// pour permettre la pagination côté client.
func (h *RegionHandler) GetDataImports(c *gin.Context) {
	page := 1
	limit := 20
	if p := c.Query("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	imports, total, err := h.regionRepo.GetDataImports(c.Request.Context(), page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if imports == nil {
		imports = []entity.DataImport{}
	}
	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}
	c.JSON(http.StatusOK, gin.H{
		"imports":     imports,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

// DownloadCSVTemplate retourne un fichier CSV modèle
func (h *RegionHandler) DownloadCSVTemplate(c *gin.Context) {
	depts, err := h.regionRepo.GetAllDepartments(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=openvote_departments_template.csv")

	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{"code", "name", "population", "registered_voters", "data_source"})
	for _, d := range depts {
		_ = writer.Write([]string{
			d.Code,
			d.Name,
			strconv.Itoa(d.Population),
			strconv.Itoa(d.RegisteredVoters),
			d.DataSource,
		})
	}
	writer.Flush()
}
