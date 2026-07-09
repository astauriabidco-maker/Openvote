package handler

import (
	"context"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/service"
)

// RAGHandler regroupe toutes les routes liées à la Base de Connaissance
// Juridique augmentée : génération d'embeddings, recherche sémantique,
// qualification automatique de rapports, analyse LLM.
//
// Dépendances lourdes (Ollama embedding + LLM) : les timeouts réseau sont
// critiques. Le timeout par défaut de Gin est respecté.
type RAGHandler struct {
	legalRepo            repository.LegalRepository
	reportService        service.ReportService
	embeddingService     service.EmbeddingService
	legalAnalysisService service.LegalAnalysisService
}

func NewRAGHandler(
	legalRepo repository.LegalRepository,
	reportService service.ReportService,
	embeddingService service.EmbeddingService,
	legalAnalysisService service.LegalAnalysisService,
) *RAGHandler {
	return &RAGHandler{
		legalRepo:            legalRepo,
		reportService:        reportService,
		embeddingService:     embeddingService,
		legalAnalysisService: legalAnalysisService,
	}
}

// seuilCorrespondanceMin marque le seuil en-dessous duquel une correspondance
// sémantique est considérée comme du bruit et n'est pas persistée.
const seuilCorrespondanceMin = 0.3

// ========================================
// Génération d'embeddings
// ========================================

// GenerateEmbeddings indexe tous les articles qui n'ont pas encore de vecteur.
// Long-running : peut prendre plusieurs minutes sur un grand corpus.
func (h *RAGHandler) GenerateEmbeddings(c *gin.Context) {
	ctx := c.Request.Context()

	articles, err := h.legalRepo.GetArticlesWithoutEmbedding(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(articles) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"message":   "Tous les articles ont déjà un embedding",
			"processed": 0,
		})
		return
	}

	processed := 0
	errCount := 0
	for _, art := range articles {
		// Texte enrichi pour un meilleur embedding.
		text := art.ArticleNumber + " - " + art.Title + "\n" + art.Content
		if art.Category != "" {
			text = "[" + art.Category + "] " + text
		}

		embedding, err := h.embeddingService.GenerateEmbedding(ctx, text)
		if err != nil {
			log.Printf("[EMBEDDING] Erreur pour %s: %v", art.ArticleNumber, err)
			errCount++
			continue
		}

		if err := h.legalRepo.UpdateArticleEmbedding(ctx, art.ID, embedding); err != nil {
			log.Printf("[EMBEDDING] Erreur DB pour %s: %v", art.ArticleNumber, err)
			errCount++
			continue
		}

		processed++
		log.Printf("[EMBEDDING] ✓ %s - %s", art.ArticleNumber, art.Title)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Génération d'embeddings terminée",
		"processed": processed,
		"errors":    errCount,
		"total":     len(articles),
	})
}

// ========================================
// Recherche sémantique
// ========================================

// SemanticSearchArticles trouve les N articles les plus proches d'une requête libre.
func (h *RAGHandler) SemanticSearchArticles(c *gin.Context) {
	var input struct {
		Query string `json:"query" binding:"required"`
		Limit int    `json:"limit"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Limit <= 0 || input.Limit > 20 {
		input.Limit = 5
	}

	ctx := c.Request.Context()

	queryEmbedding, err := h.embeddingService.GenerateEmbedding(ctx, input.Query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur génération embedding: " + err.Error()})
		return
	}

	articles, scores, err := h.legalRepo.SemanticSearch(ctx, queryEmbedding, input.Limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type SearchResult struct {
		Article    entity.LegalArticle `json:"article"`
		Similarity float64             `json:"similarity"`
	}
	results := make([]SearchResult, 0, len(articles))
	for i, art := range articles {
		results = append(results, SearchResult{Article: art, Similarity: scores[i]})
	}

	c.JSON(http.StatusOK, gin.H{"query": input.Query, "results": results})
}

// ========================================
// Qualification de rapports
// ========================================

// QualifyReport identifie les articles de loi potentiellement violés pour un
// rapport donné et persiste les correspondances au-dessus du seuil.
func (h *RAGHandler) QualifyReport(c *gin.Context) {
	reportID := c.Param("id")
	ctx := c.Request.Context()

	targetReport, err := h.findReport(ctx, reportID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if targetReport == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rapport non trouvé"})
		return
	}

	searchText := targetReport.IncidentType + ": " + targetReport.Description
	queryEmbedding, err := h.embeddingService.GenerateEmbedding(ctx, searchText)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur embedding: " + err.Error()})
		return
	}

	articles, scores, err := h.legalRepo.SemanticSearch(ctx, queryEmbedding, 5)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	matches := make([]entity.ReportLegalMatch, 0)
	for i, art := range articles {
		if scores[i] < seuilCorrespondanceMin {
			continue
		}
		match := &entity.ReportLegalMatch{
			ReportID:        reportID,
			ArticleID:       art.ID,
			SimilarityScore: scores[i],
			MatchType:       "auto",
		}
		if err := h.legalRepo.CreateReportMatch(ctx, match); err != nil {
			log.Printf("[QUALIFY] Erreur sauvegarde match: %v", err)
			continue
		}
		match.ArticleNumber = art.ArticleNumber
		match.ArticleTitle = art.Title
		match.ArticleContent = art.Content
		matches = append(matches, *match)
	}

	c.JSON(http.StatusOK, gin.H{
		"report_id": reportID,
		"incident":  targetReport.IncidentType,
		"matches":   matches,
		"total":     len(matches),
	})
}

// GetReportMatches retourne les articles de loi déjà associés à un rapport.
func (h *RAGHandler) GetReportMatches(c *gin.Context) {
	reportID := c.Param("id")
	matches, err := h.legalRepo.GetMatchesByReport(c.Request.Context(), reportID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, matches)
}

// ========================================
// Analyse LLM
// ========================================

// AnalyzeReport combine RAG + LLM : trouve les articles pertinents puis
// demande à Mistral (via Ollama) une synthèse juridique.
// Si le LLM échoue, on retourne quand même les résultats RAG (graceful degradation).
func (h *RAGHandler) AnalyzeReport(c *gin.Context) {
	reportID := c.Param("id")
	ctx := c.Request.Context()

	targetReport, err := h.findReport(ctx, reportID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if targetReport == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rapport non trouvé"})
		return
	}

	// RAG : retrouve les articles pertinents.
	searchText := targetReport.IncidentType + ": " + targetReport.Description
	queryEmbedding, err := h.embeddingService.GenerateEmbedding(ctx, searchText)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur embedding: " + err.Error()})
		return
	}

	articles, scores, err := h.legalRepo.SemanticSearch(ctx, queryEmbedding, 5)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Persiste les correspondances au-dessus du seuil.
	for i, art := range articles {
		if scores[i] < seuilCorrespondanceMin {
			continue
		}
		match := &entity.ReportLegalMatch{
			ReportID:        reportID,
			ArticleID:       art.ID,
			SimilarityScore: scores[i],
			MatchType:       "auto",
		}
		_ = h.legalRepo.CreateReportMatch(ctx, match) // best-effort
	}

	// LLM : prépare le contexte et demande l'analyse.
	articleMatches := make([]service.ArticleMatch, 0, len(articles))
	for i, art := range articles {
		articleMatches = append(articleMatches, service.ArticleMatch{
			ArticleNumber: art.ArticleNumber,
			Title:         art.Title,
			Content:       art.Content,
			Similarity:    scores[i],
		})
	}

	incident := service.IncidentContext{
		IncidentType: targetReport.IncidentType,
		Description:  targetReport.Description,
		Articles:     articleMatches,
	}

	llmAnalysis, err := h.legalAnalysisService.AnalyzeIncident(ctx, incident)
	if err != nil {
		log.Printf("[LLM] Erreur analyse: %v", err)
		c.JSON(http.StatusOK, gin.H{
			"report_id":    reportID,
			"matches":      len(articles),
			"llm_error":    err.Error(),
			"articles":     articleMatches,
		})
		return
	}

	dbAnalysis := &entity.LegalAnalysis{
		ReportID:       reportID,
		Summary:        llmAnalysis.Summary,
		Recommendation: llmAnalysis.Recommendation,
		SeverityLevel:  llmAnalysis.SeverityLevel,
		RawResponse:    llmAnalysis.RawResponse,
		LLMModel:       "mistral",
	}
	if err := h.legalRepo.SaveAnalysis(ctx, dbAnalysis); err != nil {
		log.Printf("[LLM] Erreur sauvegarde analyse: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"report_id":        reportID,
		"incident":         targetReport.IncidentType,
		"analysis":         llmAnalysis,
		"matched_articles": len(articles),
	})
}

// GetReportAnalysis retourne l'analyse juridique déjà générée pour un rapport.
// Renvoie 404 si aucune analyse n'existe.
func (h *RAGHandler) GetReportAnalysis(c *gin.Context) {
	reportID := c.Param("id")
	analysis, err := h.legalRepo.GetAnalysisByReport(c.Request.Context(), reportID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Aucune analyse trouvée"})
		return
	}
	matches, _ := h.legalRepo.GetMatchesByReport(c.Request.Context(), reportID)
	c.JSON(http.StatusOK, gin.H{"analysis": analysis, "matches": matches})
}

// ========================================
// Helpers
// ========================================

// findReport cherche un rapport par ID. Retourne (nil, nil) si non trouvé.
// TODO optimisation : index direct en base au lieu de scan linéaire GetAllReports.
func (h *RAGHandler) findReport(ctx context.Context, reportID string) (*entity.Report, error) {
	reports, err := h.reportService.GetAllReports(ctx, "")
	if err != nil {
		return nil, err
	}
	for i, r := range reports {
		if r.ID == reportID {
			return &reports[i], nil
		}
	}
	return nil, nil
}