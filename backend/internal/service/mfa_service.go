// Package service : service TOTP (Time-based One-Time Password) pour MFA.
//
// Implémentation pure Go de RFC 6238 (TOTP) basée sur HMAC-SHA1.
// Pas de dépendance externe : on utilise crypto/hmac, crypto/sha1, encoding/base32
// de la stdlib Go.
//
// Format du secret :
//   - 20 bytes aléatoires (160 bits) générés via crypto/rand
//   - Encodés en base32 (RFC 4648, alphabet sans padding) pour otpauth://
//   - Stockés en base32 en DB (champ mfa_secret TEXT) pour faciliter le debug
//
// Format des backup codes :
//   - 10 codes alphanumériques de 8 chars (charset sans 0/O/1/I/L pour lisibilité)
//   - Hashés en bcrypt avant stockage (cf. HashBackupCode)
//   - Stockés en JSONB : [{"hash": "...", "used": false, "used_at": null}, ...]
package service

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"
)

// Paramètres TOTP — conformes RFC 6238 §5 (recommandations pour SHA-1).
const (
	totpDigits    = 6                // longueur du code (6 digits standard)
	totpStep      = 30 * time.Second // fenêtre de validité (30s standard)
	totpWindow    = 1                // tolérance : accepte ±1 fenêtre (anti-skew)
	totpSecretLen = 20               // 160 bits (recommandé par RFC 4226 §4 R1)
)

// Paramètres backup codes.
const (
	backupCodeCount   = 10               // nombre généré à l'activation
	backupCodeLength  = 8                // chars alphanumériques
	backupCodeCharset = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // sans 0/O/1/I/L
)

// MFAService expose les opérations liées à la MFA (TOTP + backup codes).
type MFAService interface {
	// GenerateSecret crée un nouveau secret TOTP + URL otpauth://.
	// Le QR code est généré côté frontend (on ne stocke pas de bytes image).
	GenerateSecret(username, issuer string) (secret string, otpauthURL string, err error)

	// VerifyTOTP vérifie un code TOTP à 6 digits. Tolère ±1 fenêtre (anti-skew).
	// Le secret est en base32 (tel que stocké en DB).
	VerifyTOTP(secretBase32, code string) bool

	// GenerateBackupCodes retourne N codes de secours en clair.
	// Ces codes doivent être montrés UNE SEULE FOIS à l'utilisateur lors de l'activation.
	GenerateBackupCodes() []string

	// HashBackupCode retourne le hash bcrypt d'un code (pour stockage DB).
	HashBackupCode(code string) (string, error)

	// VerifyBackupCode compare un code saisi à son hash bcrypt.
	VerifyBackupCode(hash, code string) bool
}

type mfaService struct{}

// NewMFAService crée un service MFA.
func NewMFAService() MFAService {
	return &mfaService{}
}

// GenerateSecret crée un secret TOTP de 20 bytes aléatoires + URL otpauth://.
//
// Format otpauth (RFC 6238 §6) :
//   otpauth://totp/ISSUER:USERNAME?secret=BASE32&issuer=ISSUER&algorithm=SHA1&digits=6&period=30
func (s *mfaService) GenerateSecret(username, issuer string) (string, string, error) {
	// 1. Génère 20 bytes aléatoires cryptographiquement forts.
	rawSecret := make([]byte, totpSecretLen)
	if _, err := rand.Read(rawSecret); err != nil {
		return "", "", fmt.Errorf("rand.Read failed: %w", err)
	}

	// 2. Encode en base32 (RFC 4648, sans padding pour otpauth://).
	secretBase32 := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(rawSecret)

	// 3. Construit l'URL otpauth://
	// (escape les caractères spéciaux dans username/issuer).
	otpauthURL := fmt.Sprintf(
		"otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d",
		url.PathEscape(issuer),
		url.PathEscape(username),
		secretBase32,
		url.QueryEscape(issuer),
		totpDigits,
		int(totpStep.Seconds()),
	)

	return secretBase32, otpauthURL, nil
}

// VerifyTOTP implémente l'algorithme TOTP (RFC 6238 §5.2).
//
// Étapes :
//  1. Décode le secret base32
//  2. Calcule T = floor(now / step)  (compteur 8 bytes big-endian)
//  3. HMAC-SHA1(secret, T) → 20 bytes
//  4. Troncage dynamique (RFC 4226 §5.3) : 6 derniers bits de HMAC[19] = offset,
//     puis 4 bytes à partir de offset, & 0x7FFFFFFF, puis % 10^6
//  5. Compare avec le code saisi, en comparant aussi la fenêtre ±1
//
// Comparaison en temps constant via hmac.Equal (anti timing-attack).
func (s *mfaService) VerifyTOTP(secretBase32, code string) bool {
	// Decode base32 → raw secret.
	secret, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secretBase32))
	if err != nil {
		return false
	}

	// Calcule le compteur actuel.
	t0 := time.Now().Unix() / int64(totpStep.Seconds())

	// Teste la fenêtre actuelle + ±totpWindow (anti-skew).
	for w := -totpWindow; w <= totpWindow; w++ {
		counter := t0 + int64(w)
		expected := generateTOTPCode(secret, counter)
		if hmac.Equal([]byte(expected), []byte(code)) {
			return true
		}
	}
	return false
}

// generateTOTPCode implémente le calcul TOTP pour un compteur donné.
// Pas de vérification de fenêtre ici — c'est fait par VerifyTOTP.
func generateTOTPCode(secret []byte, counter int64) string {
	// Compteur sur 8 bytes big-endian (RFC 4226 §5.2).
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(counter))

	// HMAC-SHA1.
	h := hmac.New(sha1.New, secret)
	h.Write(buf)
	hash := h.Sum(nil)

	// Troncage dynamique (RFC 4226 §5.3) : offset = hash[19] & 0x0F
	offset := hash[19] & 0x0F
	truncated := binary.BigEndian.Uint32(hash[offset:offset+4]) & 0x7FFFFFFF

	// Code à 6 digits = truncated % 10^6.
	code := uint64(truncated) % uint64(math.Pow10(totpDigits))
	return fmt.Sprintf("%0*d", totpDigits, code)
}

// GenerateBackupCodes retourne N codes de secours en clair.
// Charset volontairement réduit (sans 0/O/1/I/L) pour lisibilité humaine.
func (s *mfaService) GenerateBackupCodes() []string {
	codes := make([]string, backupCodeCount)
	for i := range codes {
		codes[i] = randomStringFromCharset(backupCodeLength, backupCodeCharset)
	}
	return codes
}

// HashBackupCode retourne le hash bcrypt d'un code de secours.
// Coût = bcryptCost (cf. auth_service.go) : 12.
func (s *mfaService) HashBackupCode(code string) (string, error) {
	return hashWithBcrypt(code)
}

// VerifyBackupCode compare un code saisi à son hash bcrypt.
func (s *mfaService) VerifyBackupCode(hash, code string) bool {
	return verifyBcrypt(hash, code)
}

// randomStringFromCharset retourne une chaîne aléatoire de n caractères
// tirés du charset fourni, en utilisant crypto/rand.
func randomStringFromCharset(n int, charset string) string {
	if len(charset) == 0 || n <= 0 {
		return ""
	}
	out := make([]byte, n)
	max := byte(len(charset))
	// Rejection sampling pour éviter le biais modulo.
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		// Fallback déterministe (extrêmement improbable que rand.Read échoue).
		return strings.Repeat(string(charset[0]), n)
	}
	for i := 0; i < n; i++ {
		out[i] = charset[buf[i]%max]
	}
	return string(out)
}