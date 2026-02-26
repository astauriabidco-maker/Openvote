package repository

import (
	"context"
	"github.com/openvote/backend/internal/domain/entity"
)

type LegalRepository interface {
	// Documents
	GetAllDocuments(ctx context.Context) ([]entity.LegalDocument, error)
	CreateDocument(ctx context.Context, doc *entity.LegalDocument) error
	
	// Articles
	GetAllArticles(ctx context.Context) ([]entity.LegalArticle, error)
	GetArticlesByDocument(ctx context.Context, docID string) ([]entity.LegalArticle, error)
	GetArticlesByCategory(ctx context.Context, category string) ([]entity.LegalArticle, error)
	CreateArticle(ctx context.Context, article *entity.LegalArticle) error
	BatchCreateArticles(ctx context.Context, articles []entity.LegalArticle) error
	UpdateDocumentFullText(ctx context.Context, docID string, text string) error
	DeleteArticle(ctx context.Context, id string) error

	// Recherche sémantique (RAG)
	UpdateArticleEmbedding(ctx context.Context, articleID string, embedding []float32) error
	SemanticSearch(ctx context.Context, queryEmbedding []float32, limit int) ([]entity.LegalArticle, []float64, error)
	GetArticlesWithoutEmbedding(ctx context.Context) ([]entity.LegalArticle, error)

	// Croisement terrain/droit
	CreateReportMatch(ctx context.Context, match *entity.ReportLegalMatch) error
	GetMatchesByReport(ctx context.Context, reportID string) ([]entity.ReportLegalMatch, error)
	GetMatchesByArticle(ctx context.Context, articleID string) ([]entity.ReportLegalMatch, error)

	// Analyses juridiques LLM
	SaveAnalysis(ctx context.Context, analysis *entity.LegalAnalysis) error
	GetAnalysisByReport(ctx context.Context, reportID string) (*entity.LegalAnalysis, error)
}
