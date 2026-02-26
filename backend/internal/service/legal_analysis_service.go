package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// LegalAnalysisService analyse les rapports terrain à la lumière du droit via un LLM local
type LegalAnalysisService interface {
	AnalyzeIncident(ctx context.Context, incident IncidentContext) (*LegalAnalysis, error)
}

// IncidentContext contient toutes les informations nécessaires pour l'analyse juridique
type IncidentContext struct {
	IncidentType string
	Description  string
	Articles     []ArticleMatch
}

// ArticleMatch représente un article trouvé par la recherche sémantique
type ArticleMatch struct {
	ArticleNumber string
	Title         string
	Content       string
	Similarity    float64
}

// LegalAnalysis est le résultat de l'analyse juridique par le LLM
type LegalAnalysis struct {
	Summary        string          `json:"summary"`
	Violations     []ViolationItem `json:"violations"`
	Recommendation string          `json:"recommendation"`
	SeverityLevel  int             `json:"severity_level"` // 1-5
	RawResponse    string          `json:"raw_response"`
}

// ViolationItem détaille une violation identifiée
type ViolationItem struct {
	ArticleNumber string `json:"article_number"`
	Description   string `json:"description"`
	Severity      string `json:"severity"` // mineur, modéré, grave, critique
}

type legalAnalysisService struct {
	ollamaURL string
	model     string
	client    *http.Client
}

func NewLegalAnalysisService() LegalAnalysisService {
	url := os.Getenv("OLLAMA_URL")
	if url == "" {
		url = "http://localhost:11434"
	}

	model := os.Getenv("LLM_MODEL")
	if model == "" {
		model = "mistral"
	}

	return &legalAnalysisService{
		ollamaURL: url,
		model:     model,
		client: &http.Client{
			Timeout: 120 * time.Second, // LLM peut prendre du temps
		},
	}
}

// ollamaGenerateRequest est la requête envoyée à l'API Ollama /api/generate
type ollamaGenerateRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

// ollamaGenerateResponse est la réponse de l'API Ollama
type ollamaGenerateResponse struct {
	Response string `json:"response"`
}

func (s *legalAnalysisService) AnalyzeIncident(ctx context.Context, incident IncidentContext) (*LegalAnalysis, error) {
	prompt := buildLegalPrompt(incident)

	reqBody := ollamaGenerateRequest{
		Model:  s.model,
		Prompt: prompt,
		Stream: false,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("erreur marshalling requête LLM: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", s.ollamaURL+"/api/generate", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("erreur création requête HTTP: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	log.Printf("[LLM] Analyse juridique en cours avec %s...", s.model)
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("erreur appel Ollama LLM: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama LLM erreur %d: %s", resp.StatusCode, string(body))
	}

	var result ollamaGenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("erreur décodage réponse LLM: %w", err)
	}

	log.Printf("[LLM] Analyse terminée (%d caractères)", len(result.Response))

	// Parser la réponse du LLM
	analysis := parseLLMResponse(result.Response, incident)
	return analysis, nil
}

func buildLegalPrompt(incident IncidentContext) string {
	var sb strings.Builder

	sb.WriteString(`Tu es un juriste spécialisé en droit électoral camerounais et africain (OHADA/CEMAC).
Analyse l'incident électoral ci-dessous à la lumière des articles de loi fournis.

INCIDENT SIGNALÉ:
- Type: `)
	sb.WriteString(incident.IncidentType)
	sb.WriteString("\n- Description: ")
	sb.WriteString(incident.Description)
	sb.WriteString("\n\nARTICLES DE LOI PERTINENTS:\n")

	for i, art := range incident.Articles {
		sb.WriteString(fmt.Sprintf("\n--- Article %d (similarité: %.0f%%) ---\n", i+1, art.Similarity*100))
		sb.WriteString(fmt.Sprintf("Référence: %s\n", art.ArticleNumber))
		if art.Title != "" {
			sb.WriteString(fmt.Sprintf("Titre: %s\n", art.Title))
		}
		sb.WriteString(fmt.Sprintf("Contenu: %s\n", art.Content))
	}

	sb.WriteString(`
INSTRUCTIONS:
Réponds en français avec la structure suivante :

## RÉSUMÉ
Un paragraphe résumant la situation juridique.

## VIOLATIONS IDENTIFIÉES
Pour chaque violation :
- **[Référence article]** : Description de la violation et sa gravité (mineur/modéré/grave/critique)

## RECOMMANDATION
Les actions à entreprendre (saisine, procès-verbal, signalement à ELECAM, etc.)

## NIVEAU DE GRAVITÉ
Un chiffre de 1 à 5 (1=mineur, 5=critique pour la démocratie)
`)

	return sb.String()
}

func parseLLMResponse(response string, incident IncidentContext) *LegalAnalysis {
	analysis := &LegalAnalysis{
		RawResponse: response,
	}

	// Extraction du résumé
	if idx := strings.Index(response, "## RÉSUMÉ"); idx != -1 {
		end := strings.Index(response[idx+10:], "##")
		if end == -1 {
			end = len(response) - idx - 10
		}
		analysis.Summary = strings.TrimSpace(response[idx+10 : idx+10+end])
	} else {
		// Fallback : prendre les 300 premiers caractères
		if len(response) > 300 {
			analysis.Summary = response[:300] + "..."
		} else {
			analysis.Summary = response
		}
	}

	// Extraction des violations
	for _, art := range incident.Articles {
		if strings.Contains(response, art.ArticleNumber) {
			severity := "modéré"
			if art.Similarity > 0.7 {
				severity = "grave"
			} else if art.Similarity > 0.8 {
				severity = "critique"
			} else if art.Similarity < 0.4 {
				severity = "mineur"
			}
			analysis.Violations = append(analysis.Violations, ViolationItem{
				ArticleNumber: art.ArticleNumber,
				Description:   fmt.Sprintf("Violation potentielle identifiée (similarité %.0f%%)", art.Similarity*100),
				Severity:      severity,
			})
		}
	}

	// Extraction de la recommandation
	if idx := strings.Index(response, "## RECOMMANDATION"); idx != -1 {
		end := strings.Index(response[idx+18:], "##")
		if end == -1 {
			end = len(response) - idx - 18
		}
		analysis.Recommendation = strings.TrimSpace(response[idx+18 : idx+18+end])
	}

	// Extraction du niveau de gravité
	analysis.SeverityLevel = 3 // Default
	if idx := strings.Index(response, "## NIVEAU DE GRAVITÉ"); idx != -1 {
		section := response[idx:]
		for _, c := range section {
			if c >= '1' && c <= '5' {
				analysis.SeverityLevel = int(c - '0')
				break
			}
		}
	}

	return analysis
}
