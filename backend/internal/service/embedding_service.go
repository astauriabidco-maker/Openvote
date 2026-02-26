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
	GetDimension() int
}

type embeddingService struct {
	ollamaURL string
	model     string
	dimension int
	client    *http.Client
}

func NewEmbeddingService() EmbeddingService {
	url := os.Getenv("OLLAMA_URL")
	if url == "" {
		url = "http://localhost:11434"
	}

	// Modèle multilingue pour un meilleur support du français juridique
	model := os.Getenv("EMBEDDING_MODEL")
	if model == "" {
		model = "snowflake-arctic-embed2"
	}

	return &embeddingService{
		ollamaURL: url,
		model:     model,
		dimension: 1024, // snowflake-arctic-embed2 produit des vecteurs 1024D
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

func (s *embeddingService) GetDimension() int {
	return s.dimension
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
