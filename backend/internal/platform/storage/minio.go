package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Storage interface {
	GetPresignedUploadURL(ctx context.Context, bucketName, objectName string, expiry time.Duration) (string, error)
	MakeBucket(ctx context.Context, bucketName string) error
	BucketExists(ctx context.Context, bucketName string) (bool, error)
	// PingContext : vérifie que le serveur MinIO est joignable. Utilisé par
	// l'endpoint /ready pour signaler aux load balancers de retirer le pod
	// si le stockage objet est down. Respecte ctx (timeout 2s côté /ready).
	PingContext(ctx context.Context) error
}

type minioStorage struct {
	client *minio.Client
}

func NewMinioStorage(endpoint, accessKey, secretKey string, useSSL bool) (Storage, error) {
	minioClient, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create minio client: %w", err)
	}

	return &minioStorage{client: minioClient}, nil
}

func (s *minioStorage) GetPresignedUploadURL(ctx context.Context, bucketName, objectName string, expiry time.Duration) (string, error) {
	presignedURL, err := s.client.PresignedPutObject(ctx, bucketName, objectName, expiry)
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned URL: %w", err)
	}

	return presignedURL.String(), nil
}

func (s *minioStorage) MakeBucket(ctx context.Context, bucketName string) error {
	err := s.client.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{})
	if err != nil {
		return fmt.Errorf("failed to create bucket: %w", err)
	}
	return nil
}

func (s *minioStorage) BucketExists(ctx context.Context, bucketName string) (bool, error) {
	exists, err := s.client.BucketExists(ctx, bucketName)
	if err != nil {
		return false, fmt.Errorf("failed to check bucket existence: %w", err)
	}
	return exists, nil
}

// PingContext vérifie que le serveur MinIO répond.
//
// Choix d'implémentation : on utilise s.client.ListBuckets(ctx) plutôt que
// s.client.HealthCheck(duration). HealthCheck du SDK minio-go v7 lance un
// *goroutine* de probing en arrière-plan (requis duration ≥ 1s, retourne un
// cancelFunc), inadapté à un one-shot ping du readiness probe. ListBuckets
// est un RPC léger qui prend directement un ctx et propage l'annulation au
// transport HTTP sous-jacent.
//
// On respecte le ctx en premier (k8s load balancer veut une réponse rapide,
// timeout 2s côté handler), puis on appelle ListBuckets. Toute erreur du SDK
// (réseau, auth, 5xx) remonte telle quelle — le handler /ready la préfixe
// avec "FAIL: " dans la réponse JSON.
func (s *minioStorage) PingContext(ctx context.Context) error {
	// Respecte le ctx en premier (cohérence avec PingContext RabbitMQ).
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	if s == nil || s.client == nil {
		return fmt.Errorf("minio storage not initialized")
	}
	if _, err := s.client.ListBuckets(ctx); err != nil {
		return fmt.Errorf("minio ping failed: %w", err)
	}
	return nil
}
