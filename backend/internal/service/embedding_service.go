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
	"time"
)

// EmbeddingService gère la communication avec Ollama pour générer des embeddings vectoriels
type EmbeddingService interface {
	GenerateEmbedding(ctx context.Context, text string) ([]float32, error)
	GetModel() string
}

type embeddingService struct {
	ollamaURL string
	model     string
	client    *http.Client
}

func NewEmbeddingService() EmbeddingService {
	url := os.Getenv("OLLAMA_URL")
	if url == "" {
		url = "http://localhost:11434"
	}

	// Ordre de préférence : variable d'env > snowflake multilingue > nomic fallback
	model := os.Getenv("EMBEDDING_MODEL")
	if model == "" {
		// Tester si snowflake est disponible
		if isModelAvailable(url, "snowflake-arctic-embed2") {
			model = "snowflake-arctic-embed2"
			log.Printf("[EMBEDDING] Modèle multilingue snowflake-arctic-embed2 détecté ✓")
		} else {
			model = "nomic-embed-text"
			log.Printf("[EMBEDDING] Fallback sur nomic-embed-text (snowflake pas encore disponible)")
		}
	}

	return &embeddingService{
		ollamaURL: url,
		model:     model,
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

func (s *embeddingService) GetModel() string {
	return s.model
}

// isModelAvailable vérifie si un modèle est installé dans Ollama
func isModelAvailable(ollamaURL, modelName string) bool {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(ollamaURL + "/api/tags")
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	for _, m := range result.Models {
		if m.Name == modelName || m.Name == modelName+":latest" {
			return true
		}
	}
	return false
}

// ollamaEmbedRequest est la requête envoyée à l'API Ollama
type ollamaEmbedRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

// ollamaEmbedResponse est la réponse de l'API Ollama
type ollamaEmbedResponse struct {
	Embedding []float32 `json:"embedding"`
}

func (s *embeddingService) GenerateEmbedding(ctx context.Context, text string) ([]float32, error) {
	reqBody := ollamaEmbedRequest{
		Model:  s.model,
		Prompt: text,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("erreur marshalling requête embedding: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", s.ollamaURL+"/api/embeddings", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("erreur création requête HTTP: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("erreur appel Ollama: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama erreur %d: %s", resp.StatusCode, string(body))
	}

	var result ollamaEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("erreur décodage réponse Ollama: %w", err)
	}

	if len(result.Embedding) == 0 {
		return nil, fmt.Errorf("embedding vide retourné par Ollama")
	}

	log.Printf("[EMBEDDING] Modèle %s → %d chars → vecteur %dD", s.model, len(text), len(result.Embedding))
	return result.Embedding, nil
}
