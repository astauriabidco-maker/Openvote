package service

import (
	"context"
	"errors"
	"time"
	"os"

	"github.com/golang-jwt/jwt/v5"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"golang.org/x/crypto/bcrypt"
	"github.com/google/uuid"
)

type EnrolmentService interface {
	GenerateActivationToken(ctx context.Context, role entity.UserRole, regionID string) (string, error)
	Enroll(ctx context.Context, activationToken, pin string) (*entity.User, string, string, error) // Returns User, AccessToken, RefreshToken
}

type enrolmentService struct {
	userRepo   repository.UserRepository
	jwtSecret  []byte
}

// Claims pour le token d'activation (longue durée, usage unique idéalement, ou par lots)
type ActivationClaims struct {
	Role     entity.UserRole `json:"role"`
	RegionID string          `json:"region_id"`
	jwt.RegisteredClaims
}

func NewEnrolmentService(userRepo repository.UserRepository) EnrolmentService {
    secret := os.Getenv("JWT_SECRET")
    if secret == "" {
        secret = "default-secret-change-me"
    }
	return &enrolmentService{
		userRepo:  userRepo,
		jwtSecret: []byte(secret),
	}
}

func (s *enrolmentService) GenerateActivationToken(ctx context.Context, role entity.UserRole, regionID string) (string, error) {
	claims := ActivationClaims{
		Role:     role,
		RegionID: regionID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * 365 * time.Hour)), // Valide 1 an pour les QR codes imprimés
			Issuer:    "openvote-admin",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *enrolmentService) Enroll(ctx context.Context, activationToken, pin string) (*entity.User, string, string, error) {
	// 1. Valider le token d'activation
	token, err := jwt.ParseWithClaims(activationToken, &ActivationClaims{}, func(token *jwt.Token) (interface{}, error) {
		return s.jwtSecret, nil
	})

	if err != nil || !token.Valid {
		return nil, "", "", errors.New("invalid activation token")
	}

	claims, ok := token.Claims.(*ActivationClaims)
	if !ok {
		return nil, "", "", errors.New("invalid token claims")
	}

	// 2. Créer l'utilisateur
	// Username = UUID généré automatiquement pour l'anonymat (ou dérivé du device ID plus tard)
	username := uuid.New().String()
	
	// Password = Hash du PIN
	hashedPin, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", "", err
	}

	user := &entity.User{
		Username:     username,
		Role:         claims.Role,
		RegionID:     claims.RegionID,
		PasswordHash: string(hashedPin),
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, "", "", err
	}

	// 3. Générer les tokens de session (Access + Refresh)
	// (Simplification ici, on utilise le même secret)
	accessToken, err := s.generateAccessToken(user)
	if err != nil {
		return nil, "", "", err
	}
	
	refreshToken, err := s.generateRefreshToken(user)
	if err != nil {
		return nil, "", "", err
	}

	return user, accessToken, refreshToken, nil
}

func (s *enrolmentService) generateAccessToken(user *entity.User) (string, error) {
	claims := jwt.MapClaims{
		"sub":  user.ID,
		"role": user.Role,
		"exp":  time.Now().Add(15 * time.Minute).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *enrolmentService) generateRefreshToken(user *entity.User) (string, error) {
	claims := jwt.MapClaims{
		"sub": user.ID,
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}
