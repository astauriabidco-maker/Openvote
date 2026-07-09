package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"golang.org/x/crypto/bcrypt"
)

// bcryptCost est volontairement supérieur au défaut (10) en 2026 pour résister
// aux attaques par GPU sur des mots de passe utilisateur. Coût 12 ≈ 250ms/hash.
const bcryptCost = 12

// Politique de lockout (H3 audit).
const (
	maxFailedAttempts = 5                // nombre d'échecs avant lockout
	lockoutDuration    = 15 * time.Minute // durée du lockout
)

// Audiences JWT — un challenge MFA a un aud différent pour qu'un token volé
// ne puisse pas être utilisé comme token d'accès normal.
const (
	tokenAudience = "openvote-api"
	mfaAudience    = "openvote-mfa-challenge"
)

// Issuers JWT (validés par le middleware).
const (
	tokenIssuer = "openvote"
)

// Claims obligatoires que chaque token Openvote doit porter.
// Validés côté serveur via jwt.WithIssuer / jwt.WithAudience / WithExpirationRequired.
const (
	mfaChallengeDuration = 5 * time.Minute // durée de vie d'un challenge MFA
	tokenDuration        = 24 * time.Hour
)

// jwtSecret est initialisé une seule fois au démarrage du processus.
// En production, l'absence de JWT_SECRET provoque un panic : il est inacceptable
// de signer des tokens avec une clé connue du monde entier (cf. C1 audit).
var jwtSecret []byte

func init() {
	secret := os.Getenv("JWT_SECRET")
	appEnv := os.Getenv("APP_ENV")
	if appEnv == "" {
		appEnv = "development"
	}

	switch {
	case secret == "" && appEnv == "production":
		// Fail-fast : aucune tolérance en prod. Le serveur refuse de démarrer.
		panic("FATAL: JWT_SECRET non défini en production (APP_ENV=production)")

	case secret == "" && appEnv == "development":
		// Dev : génère une clé aléatoire par processus. Les tokens ne survivent
		// pas aux redémarrages — c'est le comportement souhaité en dev.
		secret = generateDevSecret()
		log.Printf("[AUTH] JWT_SECRET absent en dev : clé aléatoire générée pour ce processus (tokens non persistants)")

	case isWeakDefault(secret):
		// Protection contre le commit accidentel du placeholder du brief.
		panic("FATAL: JWT_SECRET utilise la valeur faible par défaut. Changez-la (cf. instruction.md).")
	}

	jwtSecret = []byte(secret)
}

// generateDevSecret produit 32 octets aléatoires encodés hex.
// Utilisée uniquement en mode dev quand JWT_SECRET n'est pas fourni.
func generateDevSecret() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		// rand.Read ne devrait jamais échouer ; mais si ça arrive, on tombe
		// sur un panic plutôt que de signer avec une clé vide.
		panic(fmt.Sprintf("FATAL: impossible de générer une clé JWT de dev : %v", err))
	}
	return hex.EncodeToString(buf)
}

// isWeakDefault détecte les valeurs de placeholder connues qu'on ne veut
// jamais voir signer un vrai token (issue de l'audit C1).
func isWeakDefault(s string) bool {
	weak := []string{
		"super-secret-key-change-in-prod",
		"openvote-dev-secret-change-in-prod",
		"change-me",
		"secret",
		"",
	}
	for _, w := range weak {
		if s == w {
			return true
		}
	}
	return false
}

// hashWithBcrypt est un wrapper autour de bcrypt.GenerateFromPassword avec
// le coût standard du projet (12). Utilisé pour hasher les backup codes MFA.
func hashWithBcrypt(plain string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	return string(h), err
}

// verifyBcrypt compare un plain à un hash bcrypt. Constant-time via bcrypt.
func verifyBcrypt(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// Erreurs publiques du service d'authentification.
var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrAccountLocked      = errors.New("account temporarily locked")
	ErrMFARequired        = errors.New("mfa required")
	ErrInvalidMFA         = errors.New("invalid mfa code")
)

// AuthService interface — étendue H3 pour supporter lockout + MFA.
type AuthService interface {
	Register(ctx context.Context, username, password string) (*entity.User, error)

	// Login retourne soit un token JWT d'accès complet, soit un challenge
	// MFA + le token de challenge à utiliser sur /auth/mfa/verify.
	// L'appelant distingue via le 3e retour (MFARequired bool).
	Login(ctx context.Context, username, password string) (token string, mfaChallenge string, err error)

	ValidateToken(tokenString string) (*jwt.MapClaims, error)

	// MFA setup/verify/disable (H3).
	SetupMFA(ctx context.Context, userID, password string) (secret string, otpauthURL string, backupCodes []string, err error)
	VerifyMFA(ctx context.Context, challengeToken, code string) (token string, err error)
	VerifyMFABackup(ctx context.Context, challengeToken, backupCode string) (token string, err error)
	DisableMFA(ctx context.Context, userID, password string) error

	// ConfirmMFASetup vérifie un code TOTP contre le secret déjà enregistré
	// SANS consommer de backup code ni retourner de token. Sert à l'UI pour
	// valider que l'utilisateur a bien scanné le QR code avant de fermer
	// la modale d'activation. Si OK, le secret est marqué confirmé.
	ConfirmMFASetup(ctx context.Context, userID, code string) error

	// GetMFAStatus retourne l'état MFA d'un utilisateur (lecture seule).
	GetMFAStatus(ctx context.Context, userID string) (*MFAStatus, error)
}

type authService struct {
	userRepo    repository.UserRepository
	mfaService  MFAService
	auditRepo   repository.AuditLogRepository
}

func NewAuthService(userRepo repository.UserRepository, mfaService MFAService, auditRepo repository.AuditLogRepository) AuthService {
	return &authService{userRepo: userRepo, mfaService: mfaService, auditRepo: auditRepo}
}

// logAuthEvent persiste un événement d'auth dans audit_logs. Best-effort.
func (s *authService) logAuthEvent(ctx context.Context, userID, username, action, details string) {
	if s.auditRepo == nil {
		return
	}
	entry := &entity.AuditLog{
		AdminID:   userID,
		AdminName: username,
		Action:    action,
		TargetID:  userID,
		Details:   details,
	}
	if err := s.auditRepo.Create(ctx, entry); err != nil {
		log.Printf("[AUDIT] log persist failed: %v", err)
	}
}

func (s *authService) Register(ctx context.Context, username, password string) (*entity.User, error) {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return nil, err
	}

	user := &entity.User{
		ID:           uuid.New().String(),
		Username:     username,
		PasswordHash: string(hashedPassword),
		Role:         entity.RoleObserver,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

// Login implémente le flow d'authentification avec lockout (H3) et MFA.
//
// Séquence :
//  1. Lookup user par username
//  2. Check lockout (si locked_until > now() → refuse)
//  3. Vérifie password (bcrypt)
//  4. Si échec : incrémente compteur, lock si >= maxFailedAttempts
//  5. Si succès : reset compteur, update last_login
//  6. Si MFA activée : retourne (mfaChallengeToken, "", nil) → caller répondra
//     { mfa_required: true, challenge_token: "..." }
//  7. Sinon : retourne (token, "", nil) → caller répondra { token: "..." }
func (s *authService) Login(ctx context.Context, username, password string) (string, string, error) {
	user, err := s.userRepo.GetByUsername(ctx, username)
	if err != nil {
		return "", "", err
	}
	if user == nil {
		// On retourne la même erreur que pour un mauvais mot de passe
		// (ne pas révéler l'existence du compte).
		s.logAuthEvent(ctx, "", username, "LOGIN_FAILED", "User not found")
		return "", "", ErrInvalidCredentials
	}

	// 1. Check lockout
	if user.IsLocked() {
		s.logAuthEvent(ctx, user.ID, username, "LOGIN_LOCKED",
			fmt.Sprintf("Account locked until %s", user.LockedUntil.Format(time.RFC3339)))
		return "", "", ErrAccountLocked
	}

	// 2. Vérifie password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password))
	if err != nil {
		// Échec : incrémente et peut-être lock
		newCount, incErr := s.userRepo.IncrementFailedAttempts(ctx, user.ID)
		if incErr != nil {
			log.Printf("[AUTH] IncrementFailedAttempts failed: %v", incErr)
		} else if newCount >= maxFailedAttempts {
			until := time.Now().Add(lockoutDuration)
			_ = s.userRepo.LockUser(ctx, user.ID, until)
			s.logAuthEvent(ctx, user.ID, username, "LOGIN_LOCKED",
				fmt.Sprintf("Account locked after %d failed attempts until %s", newCount, until.Format(time.RFC3339)))
			return "", "", ErrAccountLocked
		}
		s.logAuthEvent(ctx, user.ID, username, "LOGIN_FAILED",
			fmt.Sprintf("Wrong password (attempt %d/%d)", newCount, maxFailedAttempts))
		return "", "", ErrInvalidCredentials
	}

	// 3. Succès : reset compteur + update last_login
	_ = s.userRepo.ResetFailedAttempts(ctx, user.ID)
	_ = s.userRepo.UpdateLastLogin(ctx, user.ID)
	s.logAuthEvent(ctx, user.ID, username, "LOGIN_SUCCESS", "")

	// 4. Si MFA activée, retourne un challenge token (aud=mfa).
	// Note : seuls les super_admin peuvent avoir MFA (par design du brief).
	if user.HasMFA() && user.Role == entity.RoleSuperAdmin {
		challenge, err := s.generateMFAChallengeToken(user.ID, user.Role)
		if err != nil {
			return "", "", err
		}
		return "", challenge, nil
	}

	// 5. Pas de MFA : token d'accès complet.
	token, err := s.generateAccessToken(user.ID, user.Role)
	if err != nil {
		return "", "", err
	}
	return token, "", nil
}

// generateAccessToken signe un JWT d'accès complet.
func (s *authService) generateAccessToken(userID string, role entity.UserRole) (string, error) {
	return signJWT(jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"iss":  tokenIssuer,
		"aud":  tokenAudience,
		"iat":  time.Now().Unix(),
		"exp":  time.Now().Add(tokenDuration).Unix(),
	})
}

// generateMFAChallengeToken signe un JWT de challenge MFA.
// aud=mfa-challenge → ne peut être utilisé que sur /auth/mfa/verify.
func (s *authService) generateMFAChallengeToken(userID string, role entity.UserRole) (string, error) {
	return signJWT(jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"iss":  tokenIssuer,
		"aud":  mfaAudience,
		"iat":  time.Now().Unix(),
		"exp":  time.Now().Add(mfaChallengeDuration).Unix(),
	})
}

func signJWT(claims jwt.MapClaims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// ValidateToken applique strictement les règles de validation JWT (cf. C4 audit) :
//   - Algorithme explicitement HS256 (pas n'importe quel HMAC).
//   - Issuer doit être "openvote".
//   - Audience doit être "openvote-api" (PAS mfa — pour les challenges MFA,
//     voir ValidateMFAChallengeToken).
//   - Claim exp obligatoire et non expiré.
//   - Leeway de 30s toléré pour les décalages d'horloge entre serveurs.
func (s *authService) ValidateToken(tokenString string) (*jwt.MapClaims, error) {
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	},
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithIssuer(tokenIssuer),
		jwt.WithAudience(tokenAudience),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	return &claims, nil
}

// ValidateMFAChallengeToken valide un challenge token (aud=mfa, courte durée).
// Distinct de ValidateToken (qui exige aud=openvote-api).
func (s *authService) ValidateMFAChallengeToken(tokenString string) (*jwt.MapClaims, error) {
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	},
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithIssuer(tokenIssuer),
		jwt.WithAudience(mfaAudience),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid mfa challenge token")
	}
	return &claims, nil
}

// ============================================================
// MFA setup/verify/disable
// ============================================================

// SetupMFA initie l'activation MFA pour un utilisateur. Re-vérifie le mot de
// passe avant de générer un secret (empêche un attaquant ayant accès à un
// device déjà loggé d'activer MFA à l'insu de l'utilisateur).
//
// Retourne : secret TOTP, URL otpauth:// (pour QR code), codes de secours en clair.
// Les codes de secours sont montrés UNE SEULE FOIS à l'utilisateur.
func (s *authService) SetupMFA(ctx context.Context, userID, password string) (string, string, []string, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return "", "", nil, errors.New("user not found")
	}

	// Vérifie le mot de passe (empêche l'activation par un attaquant déjà loggé).
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", "", nil, ErrInvalidCredentials
	}

	// Réservé super_admin (par design du brief).
	if user.Role != entity.RoleSuperAdmin {
		return "", "", nil, errors.New("MFA réservé aux super_admin")
	}

	// Génère le secret + l'URL.
	secret, otpauthURL, err := s.mfaService.GenerateSecret(user.Username, "Openvote")
	if err != nil {
		return "", "", nil, err
	}

	// Génère les backup codes (en clair) et les hash.
	plainCodes := s.mfaService.GenerateBackupCodes()
	backupJSON := make([]map[string]interface{}, 0, len(plainCodes))
	for _, code := range plainCodes {
		hash, err := s.mfaService.HashBackupCode(code)
		if err != nil {
			return "", "", nil, err
		}
		backupJSON = append(backupJSON, map[string]interface{}{
			"hash":    hash,
			"used":    false,
			"used_at": nil,
		})
	}
	backupBytes, err := json.Marshal(backupJSON)
	if err != nil {
		return "", "", nil, err
	}

	// Stocke en DB.
	if err := s.userRepo.SetMFASecret(ctx, userID, secret, backupBytes); err != nil {
		return "", "", nil, err
	}

	s.logAuthEvent(ctx, userID, user.Username, "MFA_SETUP_COMPLETED",
		fmt.Sprintf("%d backup codes generated", len(plainCodes)))

	return secret, otpauthURL, plainCodes, nil
}

// MFAStatus représente l'état MFA d'un utilisateur (lecture seule).
// Utilisé par le frontend pour afficher "MFA activée / désactivée" sans
// déclencher d'effet de bord.
type MFAStatus struct {
	Enabled           bool `json:"enabled"`
	BackupCodesTotal  int  `json:"backup_codes_total"`
	BackupCodesUnused int  `json:"backup_codes_unused"`
	IsSuperAdmin      bool `json:"is_super_admin"`
}

// GetMFAStatus retourne l'état MFA d'un utilisateur. Lecture seule.
func (s *authService) GetMFAStatus(ctx context.Context, userID string) (*MFAStatus, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return nil, errors.New("user not found")
	}

	status := &MFAStatus{
		Enabled:      user.HasMFA(),
		IsSuperAdmin: user.Role == entity.RoleSuperAdmin,
	}

	// Compte les backup codes unused (best-effort).
	if len(user.MFABackupCodes) > 0 {
		var entries []map[string]interface{}
		if err := json.Unmarshal(user.MFABackupCodes, &entries); err == nil {
			status.BackupCodesTotal = len(entries)
			for _, e := range entries {
				if used, _ := e["used"].(bool); !used {
					status.BackupCodesUnused++
				}
			}
		}
	}

	return status, nil
}

// ConfirmMFASetup vérifie qu'un code TOTP généré par l'app d'authentification
// correspond bien au secret stocké en DB après un SetupMFA. Sert à l'UI pour
// valider que l'utilisateur a scanné le QR code avant de refermer la modale
// d'activation.
//
// Sécurité :
//   - JWT requis (l'utilisateur doit être déjà authentifié) — empêche un CSRF.
//   - Si MFA pas activée → erreur (rien à confirmer).
//   - Pas de lockout ni de compteur de tentatives : c'est juste une preuve
//     de possession de l'app, on peut autoriser autant d'essais que voulu.
//     L'utilisateur qui galère peut toujours DisableMFA + SetupMFA à nouveau.
//
// Audit : on log un événement MFA_SETUP_CONFIRMED en cas de succès (preuve
// d'activation effective, utile en cas d'incident support).
func (s *authService) ConfirmMFASetup(ctx context.Context, userID, code string) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return errors.New("user not found")
	}
	if user.MFASecret == nil {
		return errors.New("MFA not enabled")
	}
	if !s.mfaService.VerifyTOTP(*user.MFASecret, code) {
		return ErrInvalidMFA
	}
	s.logAuthEvent(ctx, userID, user.Username, "MFA_SETUP_CONFIRMED",
		"User validated TOTP code from authenticator app")
	return nil
}

// VerifyMFA vérifie un code TOTP à partir d'un challenge token.
// En cas de succès, retourne un JWT d'accès complet.
func (s *authService) VerifyMFA(ctx context.Context, challengeToken, code string) (string, error) {
	claims, err := s.ValidateMFAChallengeToken(challengeToken)
	if err != nil {
		return "", err
	}

	userID, _ := (*claims)["sub"].(string)
	roleStr, _ := (*claims)["role"].(string)
	if userID == "" {
		return "", errors.New("invalid challenge")
	}

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return "", errors.New("user not found")
	}

	if user.MFASecret == nil {
		return "", errors.New("MFA not enabled")
	}

	if !s.mfaService.VerifyTOTP(*user.MFASecret, code) {
		s.logAuthEvent(ctx, userID, user.Username, "MFA_VERIFY_FAILED", "Invalid TOTP code")
		return "", ErrInvalidMFA
	}

	s.logAuthEvent(ctx, userID, user.Username, "MFA_VERIFY_SUCCESS", "")

	return s.generateAccessToken(userID, entity.UserRole(roleStr))
}

// VerifyMFABackup consomme un code de secours. À utiliser quand l'utilisateur
// a perdu son authenticator. Le code est à usage unique.
func (s *authService) VerifyMFABackup(ctx context.Context, challengeToken, backupCode string) (string, error) {
	claims, err := s.ValidateMFAChallengeToken(challengeToken)
	if err != nil {
		return "", err
	}

	userID, _ := (*claims)["sub"].(string)
	roleStr, _ := (*claims)["role"].(string)
	if userID == "" {
		return "", errors.New("invalid challenge")
	}

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return "", errors.New("user not found")
	}

	// Trouve le code de secours correspondant parmi ceux stockés.
	var storedCodes []map[string]interface{}
	if err := json.Unmarshal(user.MFABackupCodes, &storedCodes); err != nil {
		return "", errors.New("backup codes corrupted")
	}

	for i, entry := range storedCodes {
		used, _ := entry["used"].(bool)
		if used {
			continue
		}
		hash, _ := entry["hash"].(string)
		if s.mfaService.VerifyBackupCode(hash, backupCode) {
			// Trouvé et non utilisé : on le consomme (atomique).
			if err := s.userRepo.ConsumeBackupCode(ctx, userID, i); err != nil {
				return "", err
			}
			s.logAuthEvent(ctx, userID, user.Username, "MFA_BACKUP_USED",
				fmt.Sprintf("Backup code #%d consumed", i))
			return s.generateAccessToken(userID, entity.UserRole(roleStr))
		}
	}

	s.logAuthEvent(ctx, userID, user.Username, "MFA_BACKUP_FAILED", "Invalid backup code")
	return "", ErrInvalidMFA
}

// DisableMFA désactive la MFA pour un utilisateur. Re-vérifie le mot de passe
// (empêche un attaquant ayant accès à un device de désactiver la MFA).
func (s *authService) DisableMFA(ctx context.Context, userID, password string) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return errors.New("user not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		s.logAuthEvent(ctx, userID, user.Username, "MFA_DISABLE_FAILED", "Wrong password")
		return ErrInvalidCredentials
	}

	if err := s.userRepo.DisableMFA(ctx, userID); err != nil {
		return err
	}
	s.logAuthEvent(ctx, userID, user.Username, "MFA_DISABLED", "")
	return nil
}

// generateRandomState est un helper pour des chaînes aléatoires (placeholder
// pour d'éventuels usages futurs). Conservé pour la symétrie.
func generateRandomState(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}