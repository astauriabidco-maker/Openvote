package service

import (
	"context"
	"fmt"
	"time"

	"github.com/openvote/backend/internal/platform/storage"
)

type StorageService interface {
	GenerateUploadURL(ctx context.Context, fileName string) (string, error)
	Initialize(ctx context.Context) error
}

type storageService struct {
	storage    storage.Storage
	bucketName string
}

func NewStorageService(s storage.Storage, bucketName string) StorageService {
	return &storageService{
		storage:    s,
		bucketName: bucketName,
	}
}

func (s *storageService) Initialize(ctx context.Context) error {
	exists, err := s.storage.BucketExists(ctx, s.bucketName)
	if err != nil {
		return err
	}
	if !exists {
		return s.storage.MakeBucket(ctx, s.bucketName)
	}
	return nil
}

func (s *storageService) GenerateUploadURL(ctx context.Context, fileName string) (string, error) {
	// URL valable 15 minutes
	expiry := 15 * time.Minute
	url, err := s.storage.GetPresignedUploadURL(ctx, s.bucketName, fileName, expiry)
	if err != nil {
		return "", fmt.Errorf("failed to generate upload URL: %w", err)
	}
	return url, nil
}
