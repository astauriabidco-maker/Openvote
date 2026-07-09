package service

import (
	"encoding/base32"
	"strings"
	"testing"
	"time"
)

// TestTOTPRFC6238Vectors : valide generateTOTPCode contre les vecteurs RFC 6238.
//
// Le secret RFC 6238 §Appendix B est "12345678901234567890" (ASCII).
// L'algorithme HMAC-SHA1 + troncage dynamique est identique pour 6 ou 8 digits.
// La RFC publie les codes en 8 digits ; on tronque aux 6 derniers chiffres
// (notre implémentation, standard de facto Google Authenticator / Authy).
//
// Note : on appelle directement generateTOTPCode (package-private) car c'est
// le coeur de l'algo. VerifyTOTP ne fait qu'ajouter le décodage base32 et
// la tolérance ±1 fenêtre — testé séparément.
func TestTOTPRFC6238Vectors(t *testing.T) {
	const rfcSecret = "12345678901234567890"
	secretBytes := []byte(rfcSecret)

	// Vecteurs RFC 6238 Appendix B (SHA-1, 8 digits) → on garde les 6 derniers.
	tests := []struct {
		t        uint64
		expected string // 6 derniers chiffres du vecteur RFC 8 digits
	}{
		{59, "287082"},          // RFC: 94287082
		{1111111109, "081804"},  // RFC: 07081804
		{1111111111, "050471"},  // RFC: 14050471
		{1234567890, "005924"},  // RFC: 89005924
		{2000000000, "279037"},  // RFC: 69279037
		{20000000000, "353130"}, // RFC: 65353130
	}

	for _, tc := range tests {
		counter := tc.t / 30
		got := generateTOTPCode(secretBytes, int64(counter))
		if got != tc.expected {
			t.Errorf("TOTP(t=%d): attendu %s, obtenu %s", tc.t, tc.expected, got)
		}
	}
}

// TestVerifyTOTPRoundTrip : génère un secret, génère un code "maintenant",
// puis vérifie que VerifyTOTP l'accepte.
func TestVerifyTOTPRoundTrip(t *testing.T) {
	mfa := NewMFAService()
	secret, _, err := mfa.GenerateSecret("alice", "Openvote")
	if err != nil {
		t.Fatalf("GenerateSecret: %v", err)
	}

	// Génère le code attendu pour la fenêtre actuelle.
	counter := time.Now().Unix() / 30
	code := generateTOTPCode(decodeBase32FromTest(t, secret), counter)

	if !mfa.VerifyTOTP(secret, code) {
		t.Errorf("VerifyTOTP devrait accepter le code fraîchement généré")
	}
}

// TestVerifyTOTPRefuseCodeIncorrect : un code random doit être refusé.
func TestVerifyTOTPRefuseCodeIncorrect(t *testing.T) {
	mfa := NewMFAService()
	secret, _, _ := mfa.GenerateSecret("alice", "Openvote")

	if mfa.VerifyTOTP(secret, "000000") {
		t.Errorf("VerifyTOTP avec 000000 devrait être false (probabilité ~10^-6)")
	}
	if mfa.VerifyTOTP(secret, "abcdef") {
		t.Errorf("VerifyTOTP avec 'abcdef' (non-digit) devrait être false")
	}
}

// TestVerifyTOTPSecretInvalide : un secret base32 corrompu → false (pas de panic).
func TestVerifyTOTPSecretInvalide(t *testing.T) {
	mfa := NewMFAService()
	if mfa.VerifyTOTP("!!!not_base32!!!", "123456") {
		t.Errorf("VerifyTOTP avec secret corrompu devrait retourner false")
	}
	// Secret vide.
	if mfa.VerifyTOTP("", "123456") {
		t.Errorf("VerifyTOTP avec secret vide devrait retourner false")
	}
}

// TestGenerateBackupCodes : génère 10 codes uniques, 8 chars, dans le bon charset.
func TestGenerateBackupCodes(t *testing.T) {
	mfa := NewMFAService()
	codes := mfa.GenerateBackupCodes()

	if len(codes) != backupCodeCount {
		t.Fatalf("attendu %d codes, obtenu %d", backupCodeCount, len(codes))
	}

	seen := make(map[string]bool, len(codes))
	for i, code := range codes {
		if len(code) != backupCodeLength {
			t.Errorf("code %d : longueur attendue %d, obtenue %d (%q)", i, backupCodeLength, len(code), code)
		}
		for _, c := range code {
			if !isInBackupCharset(byte(c)) {
				t.Errorf("code %d contient %q hors charset safe %q", i, c, backupCodeCharset)
			}
		}
		if seen[code] {
			t.Errorf("code %d dupliqué : %s", i, code)
		}
		seen[code] = true
	}
}

// TestBackupCodeCharsetExclutCaracteresConfondables : 0/O/1/I/L absents.
func TestBackupCodeCharsetExclutCaracteresConfondables(t *testing.T) {
	forbidden := "0O1IL"
	for _, f := range forbidden {
		if isInBackupCharset(byte(f)) {
			t.Errorf("charset backup code contient %q (à exclure pour lisibilité)", f)
		}
	}
}

// TestBackupCodeHashAndVerify : round-trip hash → verify doit marcher.
func TestBackupCodeHashAndVerify(t *testing.T) {
	mfa := NewMFAService()
	codes := mfa.GenerateBackupCodes()

	for _, code := range codes {
		hash, err := mfa.HashBackupCode(code)
		if err != nil {
			t.Fatalf("HashBackupCode(%q): %v", code, err)
		}
		if !strings.HasPrefix(hash, "$2a$") && !strings.HasPrefix(hash, "$2b$") {
			t.Errorf("hash bcrypt doit commencer par $2a$ ou $2b$, obtenu %q", hash[:10])
		}
		if !mfa.VerifyBackupCode(hash, code) {
			t.Errorf("VerifyBackupCode(%q) devrait retourner true avec le bon hash", code)
		}
		if mfa.VerifyBackupCode(hash, code+"X") {
			t.Errorf("VerifyBackupCode avec code modifié devrait retourner false")
		}
	}
}

// TestOTPAuthURLFormat : URL doit respecter le format otpauth:// totp attendu.
func TestOTPAuthURLFormat(t *testing.T) {
	mfa := NewMFAService()
	secret, otpauthURL, err := mfa.GenerateSecret("alice", "Openvote")
	if err != nil {
		t.Fatalf("GenerateSecret: %v", err)
	}

	if !strings.HasPrefix(otpauthURL, "otpauth://totp/Openvote:alice?") {
		t.Errorf("otpauthURL ne commence pas par le préfixe attendu : %q", otpauthURL)
	}
	if !strings.Contains(otpauthURL, "secret="+secret) {
		t.Errorf("otpauthURL doit contenir secret=%s : %q", secret, otpauthURL)
	}
	for _, param := range []string{"issuer=Openvote", "algorithm=SHA1", "digits=6", "period=30"} {
		if !strings.Contains(otpauthURL, param) {
			t.Errorf("otpauthURL manque le paramètre %s : %q", param, otpauthURL)
		}
	}
}

// ============================================================
// helpers de test (package-internes)
// ============================================================

func isInBackupCharset(c byte) bool {
	for _, x := range backupCodeCharset {
		if byte(x) == c {
			return true
		}
	}
	return false
}

// decodeBase32FromTest : wrapper de test pour décoder le secret retourné
// par GenerateSecret (base32 sans padding). Utilise encoding/base32 stdlib.
func decodeBase32FromTest(t *testing.T, s string) []byte {
	t.Helper()
	if len(s) < 4 {
		t.Fatalf("secret trop court : %d", len(s))
	}
	// Padding artificiel à un multiple de 8 (RFC 4648).
	pad := (8 - len(s)%8) % 8
	s = s + strings.Repeat("=", pad)
	out, err := base32.StdEncoding.DecodeString(s)
	if err != nil {
		t.Fatalf("decode base32: %v", err)
	}
	return out
}