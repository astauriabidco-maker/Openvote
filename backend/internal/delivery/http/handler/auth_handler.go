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

// ... Register and Login methods remain unchanged ...

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

func (h *AuthHandler) Login(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.Login(c.Request.Context(), input.Username, input.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}
