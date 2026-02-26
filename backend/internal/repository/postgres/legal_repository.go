package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

type legalRepo struct {
	db *sql.DB
}

func NewLegalRepository(db *sql.DB) repository.LegalRepository {
	return &legalRepo{db: db}
}

// Documents
func (r *legalRepo) GetAllDocuments(ctx context.Context) ([]entity.LegalDocument, error) {
	query := `SELECT id, title, description, doc_type, version, full_text, file_path, created_at FROM legal_documents ORDER BY title`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []entity.LegalDocument
	for rows.Next() {
		var d entity.LegalDocument
		if err := rows.Scan(&d.ID, &d.Title, &d.Description, &d.Type, &d.Version, &d.FullText, &d.FilePath, &d.CreatedAt); err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	return docs, nil
}

func (r *legalRepo) CreateDocument(ctx context.Context, d *entity.LegalDocument) error {
	query := `INSERT INTO legal_documents (title, description, doc_type, version, full_text, file_path) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query, d.Title, d.Description, d.Type, d.Version, d.FullText, d.FilePath).Scan(&d.ID, &d.CreatedAt)
}

func (r *legalRepo) UpdateDocumentFullText(ctx context.Context, docID string, text string) error {
	query := `UPDATE legal_documents SET full_text = $1 WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, text, docID)
	return err
}

// Articles
func (r *legalRepo) GetAllArticles(ctx context.Context) ([]entity.LegalArticle, error) {
	query := `SELECT id, document_id, article_number, title, content, category, created_at FROM legal_framework ORDER BY article_number`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []entity.LegalArticle
	for rows.Next() {
		var art entity.LegalArticle
		if err := rows.Scan(&art.ID, &art.DocumentID, &art.ArticleNumber, &art.Title, &art.Content, &art.Category, &art.CreatedAt); err != nil {
			return nil, err
		}
		articles = append(articles, art)
	}
	return articles, nil
}

func (r *legalRepo) GetArticlesByDocument(ctx context.Context, docID string) ([]entity.LegalArticle, error) {
	query := `SELECT id, document_id, article_number, title, content, category, created_at FROM legal_framework WHERE document_id = $1 ORDER BY article_number`
	rows, err := r.db.QueryContext(ctx, query, docID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []entity.LegalArticle
	for rows.Next() {
		var art entity.LegalArticle
		if err := rows.Scan(&art.ID, &art.DocumentID, &art.ArticleNumber, &art.Title, &art.Content, &art.Category, &art.CreatedAt); err != nil {
			return nil, err
		}
		articles = append(articles, art)
	}
	return articles, nil
}

func (r *legalRepo) GetArticlesByCategory(ctx context.Context, category string) ([]entity.LegalArticle, error) {
	query := `SELECT id, document_id, article_number, title, content, category, created_at FROM legal_framework WHERE category = $1 ORDER BY article_number`
	rows, err := r.db.QueryContext(ctx, query, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []entity.LegalArticle
	for rows.Next() {
		var art entity.LegalArticle
		if err := rows.Scan(&art.ID, &art.DocumentID, &art.ArticleNumber, &art.Title, &art.Content, &art.Category, &art.CreatedAt); err != nil {
			return nil, err
		}
		articles = append(articles, art)
	}
	return articles, nil
}

func (r *legalRepo) CreateArticle(ctx context.Context, art *entity.LegalArticle) error {
	query := `INSERT INTO legal_framework (article_number, title, content, category, document_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query, art.ArticleNumber, art.Title, art.Content, art.Category, art.DocumentID).Scan(&art.ID, &art.CreatedAt)
}

func (r *legalRepo) BatchCreateArticles(ctx context.Context, articles []entity.LegalArticle) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	query := `INSERT INTO legal_framework (article_number, title, content, category, document_id) 
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (document_id, article_number) 
              DO UPDATE SET 
                title = EXCLUDED.title, 
                content = EXCLUDED.content, 
                category = EXCLUDED.category`
	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, art := range articles {
		if _, err := stmt.ExecContext(ctx, art.ArticleNumber, art.Title, art.Content, art.Category, art.DocumentID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *legalRepo) DeleteArticle(ctx context.Context, id string) error {
	query := `DELETE FROM legal_framework WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// ========================================
// Recherche Sémantique (RAG / pgvector)
// ========================================

func (r *legalRepo) UpdateArticleEmbedding(ctx context.Context, articleID string, embedding []float32) error {
	// Convertir le slice en format pgvector string
	vecStr := float32SliceToPostgresVector(embedding)
	query := `UPDATE legal_framework SET embedding = $1::vector WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, vecStr, articleID)
	return err
}

func (r *legalRepo) SemanticSearch(ctx context.Context, queryEmbedding []float32, limit int) ([]entity.LegalArticle, []float64, error) {
	vecStr := float32SliceToPostgresVector(queryEmbedding)
	query := `
		SELECT id, document_id, article_number, title, content, category, created_at,
		       1 - (embedding <=> $1::vector) AS similarity
		FROM legal_framework
		WHERE embedding IS NOT NULL
		ORDER BY embedding <=> $1::vector
		LIMIT $2
	`
	rows, err := r.db.QueryContext(ctx, query, vecStr, limit)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var articles []entity.LegalArticle
	var scores []float64
	for rows.Next() {
		var art entity.LegalArticle
		var score float64
		if err := rows.Scan(&art.ID, &art.DocumentID, &art.ArticleNumber, &art.Title, &art.Content, &art.Category, &art.CreatedAt, &score); err != nil {
			return nil, nil, err
		}
		articles = append(articles, art)
		scores = append(scores, score)
	}
	return articles, scores, nil
}

func (r *legalRepo) GetArticlesWithoutEmbedding(ctx context.Context) ([]entity.LegalArticle, error) {
	query := `SELECT id, document_id, article_number, title, content, category, created_at FROM legal_framework WHERE embedding IS NULL ORDER BY created_at`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []entity.LegalArticle
	for rows.Next() {
		var art entity.LegalArticle
		if err := rows.Scan(&art.ID, &art.DocumentID, &art.ArticleNumber, &art.Title, &art.Content, &art.Category, &art.CreatedAt); err != nil {
			return nil, err
		}
		articles = append(articles, art)
	}
	return articles, nil
}

// ========================================
// Croisement Terrain / Droit
// ========================================

func (r *legalRepo) CreateReportMatch(ctx context.Context, match *entity.ReportLegalMatch) error {
	query := `INSERT INTO report_legal_matches (report_id, article_id, similarity_score, match_type, notes) 
	          VALUES ($1, $2, $3, $4, $5) 
	          ON CONFLICT (report_id, article_id) DO UPDATE SET similarity_score = EXCLUDED.similarity_score, notes = EXCLUDED.notes
	          RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query, match.ReportID, match.ArticleID, match.SimilarityScore, match.MatchType, match.Notes).Scan(&match.ID, &match.CreatedAt)
}

func (r *legalRepo) GetMatchesByReport(ctx context.Context, reportID string) ([]entity.ReportLegalMatch, error) {
	query := `SELECT m.id, m.report_id, m.article_id, m.similarity_score, m.match_type, m.notes, m.created_at,
	                 a.article_number, a.title, a.content
	          FROM report_legal_matches m
	          JOIN legal_framework a ON a.id = m.article_id
	          WHERE m.report_id = $1
	          ORDER BY m.similarity_score DESC`
	rows, err := r.db.QueryContext(ctx, query, reportID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var matches []entity.ReportLegalMatch
	for rows.Next() {
		var m entity.ReportLegalMatch
		if err := rows.Scan(&m.ID, &m.ReportID, &m.ArticleID, &m.SimilarityScore, &m.MatchType, &m.Notes, &m.CreatedAt,
			&m.ArticleNumber, &m.ArticleTitle, &m.ArticleContent); err != nil {
			return nil, err
		}
		matches = append(matches, m)
	}
	return matches, nil
}

func (r *legalRepo) GetMatchesByArticle(ctx context.Context, articleID string) ([]entity.ReportLegalMatch, error) {
	query := `SELECT m.id, m.report_id, m.article_id, m.similarity_score, m.match_type, m.notes, m.created_at
	          FROM report_legal_matches m
	          WHERE m.article_id = $1
	          ORDER BY m.similarity_score DESC`
	rows, err := r.db.QueryContext(ctx, query, articleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var matches []entity.ReportLegalMatch
	for rows.Next() {
		var m entity.ReportLegalMatch
		if err := rows.Scan(&m.ID, &m.ReportID, &m.ArticleID, &m.SimilarityScore, &m.MatchType, &m.Notes, &m.CreatedAt); err != nil {
			return nil, err
		}
		matches = append(matches, m)
	}
	return matches, nil
}

// float32SliceToPostgresVector convertit un slice Go en format string pgvector
func float32SliceToPostgresVector(v []float32) string {
	buf := make([]byte, 0, len(v)*12+2)
	buf = append(buf, '[')
	for i, f := range v {
		if i > 0 {
			buf = append(buf, ',')
		}
		buf = append(buf, []byte(fmt.Sprintf("%g", f))...)
	}
	buf = append(buf, ']')
	return string(buf)
}

// ========================================
// Analyses Juridiques LLM
// ========================================

func (r *legalRepo) SaveAnalysis(ctx context.Context, analysis *entity.LegalAnalysis) error {
	query := `INSERT INTO legal_analyses (report_id, summary, recommendation, severity_level, raw_response, llm_model) 
	          VALUES ($1, $2, $3, $4, $5, $6)
	          ON CONFLICT (report_id) DO UPDATE SET 
	            summary = EXCLUDED.summary, 
	            recommendation = EXCLUDED.recommendation, 
	            severity_level = EXCLUDED.severity_level,
	            raw_response = EXCLUDED.raw_response,
	            llm_model = EXCLUDED.llm_model,
	            created_at = NOW()
	          RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query, analysis.ReportID, analysis.Summary, analysis.Recommendation, analysis.SeverityLevel, analysis.RawResponse, analysis.LLMModel).Scan(&analysis.ID, &analysis.CreatedAt)
}

func (r *legalRepo) GetAnalysisByReport(ctx context.Context, reportID string) (*entity.LegalAnalysis, error) {
	query := `SELECT id, report_id, summary, recommendation, severity_level, raw_response, llm_model, created_at
	          FROM legal_analyses WHERE report_id = $1`
	var a entity.LegalAnalysis
	err := r.db.QueryRowContext(ctx, query, reportID).Scan(&a.ID, &a.ReportID, &a.Summary, &a.Recommendation, &a.SeverityLevel, &a.RawResponse, &a.LLMModel, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}
