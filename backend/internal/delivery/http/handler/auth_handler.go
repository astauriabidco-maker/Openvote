package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/service"
)

type AuthHandler struct {
	authService      service.AuthService
	enrolmentService service.EnrolmentService
}

func NewAuthHandler(authService service.AuthService, enrolmentService service.EnrolmentService) *AuthHandler {
	return &AuthHandler{
		authService:      authService,
		enrolmentService: enrolmentService,
	}
}

// Enroll : enrôlement d'un nouvel observateur via token d'activation.
func (h *AuthHandler) Enroll(c *gin.Context) {
	var input struct {
		ActivationToken string `json:"activation_token" binding:"required"`
		PIN             string `json:"pin" binding:"required,min=4,max=8"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, accessToken, refreshToken, err := h.enrolmentService.Enroll(c.Request.Context(), input.ActivationToken, input.PIN)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user":          user,
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}

// Register : création d'un nouvel utilisateur.
func (h *AuthHandler) Register(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.authService.Register(c.Request.Context(), input.Username, input.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, user)
}

// Login : point d'entrée principal de l'authentification (H3 audit).
//
// Retourne :
//   - 200 { token: "..." } : login réussi, JWT d'accès complet
//   - 200 { mfa_required: true, challenge_token: "..." } : password OK mais MFA requise
//   - 401 { error: "invalid credentials" } : username/password incorrects
//   - 429 { error: "account temporarily locked", locked_until: "..." } : compte verrouillé
func (h *AuthHandler) Login(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, mfaChallenge, err := h.authService.Login(c.Request.Context(), input.Username, input.Password)
	if err != nil {
		switch err {
		case service.ErrAccountLocked:
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "account temporarily locked"})
		case service.ErrInvalidCredentials:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	// Si MFA requise : challenge token au lieu du token d'accès.
	if mfaChallenge != "" {
		c.JSON(http.StatusOK, gin.H{
			"mfa_required":   true,
			"challenge_token": mfaChallenge,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}

// ============================================================
// MFA endpoints (H3 audit)
// ============================================================

// SetupMFA : initie l'activation MFA pour l'utilisateur courant (JWT requis).
// Retourne le secret TOTP (base32), l'URL otpauth:// (à encoder en QR par
// le frontend) et les codes de secours en clair (à montrer UNE SEULE FOIS).
func (h *AuthHandler) SetupMFA(c *gin.Context) {
	userID, _ := c.Get("userID")
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found in context"})
		return
	}

	var input struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	secret, otpauthURL, backupCodes, err := h.authService.SetupMFA(
		c.Request.Context(), userID.(string), input.Password,
	)
	if err != nil {
		switch err {
		case service.ErrInvalidCredentials:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"secret":        secret,
		"otpauth_url":   otpauthURL,
		"backup_codes":  backupCodes,
		"message":       "Scannez le QR code avec Google Authenticator / Authy / 1Password, puis vérifiez avec un code via /auth/mfa/verify.",
	})
}

// VerifyMFA : vérifie un code TOTP (6 digits) à partir d'un challenge token.
// Retourne un JWT d'accès complet en cas de succès.
func (h *AuthHandler) VerifyMFA(c *gin.Context) {
	var input struct {
		ChallengeToken string `json:"challenge_token" binding:"required"`
		Code           string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.VerifyMFA(c.Request.Context(), input.ChallengeToken, input.Code)
	if err != nil {
		switch err {
		case service.ErrInvalidMFA:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid mfa code"})
		default:
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}

// VerifyMFABackup : consomme un code de secours (usage unique).
// À utiliser quand l'utilisateur a perdu accès à son authenticator.
func (h *AuthHandler) VerifyMFABackup(c *gin.Context) {
	var input struct {
		ChallengeToken string `json:"challenge_token" binding:"required"`
		BackupCode     string `json:"backup_code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.VerifyMFABackup(c.Request.Context(), input.ChallengeToken, input.BackupCode)
	if err != nil {
		switch err {
		case service.ErrInvalidMFA:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid backup code"})
		default:
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}

// DisableMFA : désactive la MFA pour l'utilisateur courant (JWT requis).
// Re-vérifie le mot de passe pour éviter qu'un attaquant ayant accès à un
// device déjà loggé désactive la MFA.
func (h *AuthHandler) DisableMFA(c *gin.Context) {
	userID, _ := c.Get("userID")
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found in context"})
		return
	}

	var input struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.authService.DisableMFA(c.Request.Context(), userID.(string), input.Password); err != nil {
		switch err {
		case service.ErrInvalidCredentials:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "MFA disabled"})
}

// ConfirmMFASetup : vérifie qu'un code TOTP saisi correspond bien au secret
// stocké après un SetupMFA. Permet à l'UI de confirmer que l'utilisateur a
// scanné le QR code avant de refermer la modale d'activation. JWT requis.
func (h *AuthHandler) ConfirmMFASetup(c *gin.Context) {
	userID, _ := c.Get("userID")
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found in context"})
		return
	}

	var input struct {
		Code string `json:"code" binding:"required,len=6"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.authService.ConfirmMFASetup(c.Request.Context(), userID.(string), input.Code); err != nil {
		switch err {
		case service.ErrInvalidMFA:
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid TOTP code"})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "MFA setup confirmed"})
}

// GetMFAStatus : retourne l'état MFA de l'utilisateur courant (JWT requis).
// Sert à l'UI pour savoir si MFA est active et combien de backup codes restent.
func (h *AuthHandler) GetMFAStatus(c *gin.Context) {
	userID, _ := c.Get("userID")
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found in context"})
		return
	}

	status, err := h.authService.GetMFAStatus(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, status)
}