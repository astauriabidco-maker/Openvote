package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/service"
)

func AuthMiddleware(authService service.AuthService, userRepo ...repository.UserRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		tokenString := parts[1]
		claims, err := authService.ValidateToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Injection des infos utilisateur dans le contexte Gin
		if sub, ok := (*claims)["sub"].(string); ok {
			c.Set("userID", sub)

			// Résolution du username si le repo est disponible
			if len(userRepo) > 0 && userRepo[0] != nil {
				user, err := userRepo[0].GetByID(c.Request.Context(), sub)
				if err == nil && user != nil {
					c.Set("username", user.Username)
				}
			}
		}
		if role, ok := (*claims)["role"].(string); ok {
			c.Set("role", role)
		}

		c.Next()
	}
}
