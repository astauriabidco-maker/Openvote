package handler

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

// LegalHandler gère le CMS juridique : documents, articles, import en masse,
// extraction PDF. Le RAG/semantic search est dans rag_handler.go (séparé
// car nécessite embedding + LLM).
type LegalHandler struct {
	legalRepo repository.LegalRepository
}

func NewLegalHandler(legalRepo repository.LegalRepository) *LegalHandler {
	return &LegalHandler{legalRepo: legalRepo}
}

// ========================================
// Documents légaux
// ========================================

func (h *LegalHandler) GetLegalDocuments(c *gin.Context) {
	docs, err := h.legalRepo.GetAllDocuments(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, docs)
}

func (h *LegalHandler) CreateLegalDocument(c *gin.Context) {
	var input entity.LegalDocument
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.legalRepo.CreateDocument(c.Request.Context(), &input); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, input)
}

func (h *LegalHandler) DeleteLegalDocument(c *gin.Context) {
	docID := c.Param("id")
	if err := h.legalRepo.DeleteDocument(c.Request.Context(), docID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Document et articles supprimés"})
}

// DeleteDocumentArticles supprime tous les articles d'un document (sans
// supprimer le document lui-même — utile pour ré-importer proprement).
func (h *LegalHandler) DeleteDocumentArticles(c *gin.Context) {
	docID := c.Param("id")
	count, err := h.legalRepo.DeleteArticlesByDocument(c.Request.Context(), docID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("%d articles supprimés", count),
		"deleted": count,
	})
}

// ========================================
// Articles de loi
// ========================================

// GetLegalArticles liste les articles, filtrables par document_id ou category.
func (h *LegalHandler) GetLegalArticles(c *gin.Context) {
	ctx := c.Request.Context()
	docID := c.Query("document_id")
	category := c.Query("category")

	var (
		articles []entity.LegalArticle
		err      error
	)

	switch {
	case docID != "":
		articles, err = h.legalRepo.GetArticlesByDocument(ctx, docID)
	case category != "":
		articles, err = h.legalRepo.GetArticlesByCategory(ctx, category)
	default:
		articles, err = h.legalRepo.GetAllArticles(ctx)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, articles)
}

func (h *LegalHandler) CreateLegalArticle(c *gin.Context) {
	var input entity.LegalArticle
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.legalRepo.CreateArticle(c.Request.Context(), &input); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, input)
}

func (h *LegalHandler) BatchCreateLegalArticles(c *gin.Context) {
	var input struct {
		DocumentID string                `json:"document_id" binding:"required"`
		Articles   []entity.LegalArticle `json:"articles" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Force l'ID du document pour la cohérence (évite qu'un client envoie
	// un article avec un autre document_id que celui du batch parent).
	for i := range input.Articles {
		input.Articles[i].DocumentID = input.DocumentID
	}

	if err := h.legalRepo.BatchCreateArticles(c.Request.Context(), input.Articles); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"message": "Articles importés avec succès",
		"count":   len(input.Articles),
	})
}

func (h *LegalHandler) DeleteLegalArticle(c *gin.Context) {
	id := c.Param("id")
	if err := h.legalRepo.DeleteArticle(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Article supprimé"})
}

// ========================================
// Extraction PDF
// ========================================

// ExtractTextFromPDF reçoit un PDF en multipart, le sauvegarde dans /tmp,
// appelle pdftotext (poppler-utils), retourne le texte brut. Le PDF
// temporaire est nettoyé immédiatement après.
// TODO sécurité : limiter la taille d'upload + valider MIME magic bytes.
func (h *LegalHandler) ExtractTextFromPDF(c *gin.Context) {
	file, err := c.FormFile("pdf")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fichier PDF requis"})
		return
	}

	tempDir := os.TempDir()
	tempFile := filepath.Join(tempDir, file.Filename)
	if err := c.SaveUploadedFile(file, tempFile); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur lors de la sauvegarde du fichier"})
		return
	}
	defer os.Remove(tempFile)

	cmd := exec.Command("pdftotext", tempFile, "-")
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erreur lors de l'extraction du texte: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"text": string(output)})
}