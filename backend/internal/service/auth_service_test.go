package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

// ============================================================
// Mocks
// ============================================================

// mockUserRepo : implémentation in-memory de UserRepository pour les tests
// d'AuthService (lockout, MFA). Pas de SQL — l'algo de lockout est 100% Go.
type mockUserRepo struct {
	users map[string]*entity.User // index par ID
}

func newMockUserRepo() *mockUserRepo {
	return &mockUserRepo{users: map[string]*entity.User{}}
}

func (m *mockUserRepo) Create(ctx context.Context, user *entity.User) error {
	if user.ID == "" {
		user.ID = uuid.New().String()
	}
	cp := *user
	m.users[user.ID] = &cp
	return nil
}
func (m *mockUserRepo) GetByID(ctx context.Context, id string) (*entity.User, error) {
	if u, ok := m.users[id]; ok {
		cp := *u
		return &cp, nil
	}
	return nil, nil
}
func (m *mockUserRepo) GetByUsername(ctx context.Context, username string) (*entity.User, error) {
	for _, u := range m.users {
		if u.Username == username {
			cp := *u
			return &cp, nil
		}
	}
	return nil, nil
}
func (m *mockUserRepo) GetAll(ctx context.Context) ([]entity.User, error) {
	out := make([]entity.User, 0, len(m.users))
	for _, u := range m.users {
		out = append(out, *u)
	}
	return out, nil
}
func (m *mockUserRepo) UpdateRole(ctx context.Context, id string, role entity.UserRole, regionID string) error {
	if u, ok := m.users[id]; ok {
		u.Role = role
		u.RegionID = regionID
	}
	return nil
}
func (m *mockUserRepo) UpdateLastLogin(ctx context.Context, id string) error { return nil }
func (m *mockUserRepo) Delete(ctx context.Context, id string) error          { delete(m.users, id); return nil }

// Lockout.
func (m *mockUserRepo) IncrementFailedAttempts(ctx context.Context, id string) (int, error) {
	if u, ok := m.users[id]; ok {
		u.FailedLoginAttempts++
		return u.FailedLoginAttempts, nil
	}
	return 0, errors.New("not found")
}
func (m *mockUserRepo) ResetFailedAttempts(ctx context.Context, id string) error {
	if u, ok := m.users[id]; ok {
		u.FailedLoginAttempts = 0
		u.LockedUntil = nil
	}
	return nil
}
func (m *mockUserRepo) LockUser(ctx context.Context, id string, until time.Time) error {
	if u, ok := m.users[id]; ok {
		u.LockedUntil = &until
	}
	return nil
}

// MFA.
func (m *mockUserRepo) SetMFASecret(ctx context.Context, id string, secret string, backupCodesJSON []byte) error {
	if u, ok := m.users[id]; ok {
		u.MFASecret = &secret
		u.MFABackupCodes = backupCodesJSON
	}
	return nil
}
func (m *mockUserRepo) DisableMFA(ctx context.Context, id string) error {
	if u, ok := m.users[id]; ok {
		u.MFASecret = nil
		u.MFABackupCodes = nil
	}
	return nil
}
func (m *mockUserRepo) ConsumeBackupCode(ctx context.Context, id string, codeIndex int) error {
	return nil
}

// mockAuditRepo : implémente repository.AuditLogRepository, compte les events.
type mockAuditRepo struct {
	events []*entity.AuditLog
}

func (m *mockAuditRepo) Create(ctx context.Context, log *entity.AuditLog) error {
	m.events = append(m.events, log)
	return nil
}
func (m *mockAuditRepo) GetAll(ctx context.Context, limit int) ([]entity.AuditLog, error) {
	return nil, nil
}

// ============================================================
// Helpers
// ============================================================

func seedUser(t *testing.T, repo *mockUserRepo, username, password string, role entity.UserRole) *entity.User {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}
	u := &entity.User{
		ID:           uuid.New().String(),
		Username:     username,
		PasswordHash: string(hash),
		Role:         role,
	}
	if err := repo.Create(context.Background(), u); err != nil {
		t.Fatalf("seed: %v", err)
	}
	return u
}

// ============================================================
// Tests
// ============================================================

// TestLoginSuccesSansMFA : login simple retourne un JWT d'accès.
func TestLoginSuccesSansMFA(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	seedUser(t, repo, "alice", "correctpw", entity.RoleObserver)

	token, mfa, err := svc.Login(context.Background(), "alice", "correctpw")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if token == "" {
		t.Errorf("token attendu non vide")
	}
	if mfa != "" {
		t.Errorf("mfa challenge ne devrait pas être présent pour observer : %q", mfa)
	}
	if repo.users[repo.findID("alice")].FailedLoginAttempts != 0 {
		t.Errorf("compteur devrait être à 0 après succès")
	}
}

// TestLoginEchecMauvaisMotDePasse : échec retourne ErrInvalidCredentials
// et incrémente le compteur.
func TestLoginEchecMauvaisMotDePasse(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	seedUser(t, repo, "alice", "correctpw", entity.RoleObserver)

	token, _, err := svc.Login(context.Background(), "alice", "wrongpw")
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("attendu ErrInvalidCredentials, obtenu %v", err)
	}
	if token != "" {
		t.Errorf("token devrait être vide")
	}
	if got := repo.users[repo.findID("alice")].FailedLoginAttempts; got != 1 {
		t.Errorf("compteur devrait être 1, obtenu %d", got)
	}
}

// TestLoginLockoutApres5Echecs : 5 échecs → ErrAccountLocked + locked_until positionné.
//
// Politique : on incrémente d'abord le compteur, puis on compare à maxFailedAttempts.
// Donc le 5e échec lui-même déclenche le verrou (pas le 6e).
func TestLoginLockoutApres5Echecs(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	seedUser(t, repo, "alice", "correctpw", entity.RoleObserver)

	// Les 4 premiers échecs renvoient ErrInvalidCredentials.
	for i := 0; i < maxFailedAttempts-1; i++ {
		_, _, err := svc.Login(context.Background(), "alice", "wrongpw")
		if !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("itération %d : attendu ErrInvalidCredentials, obtenu %v", i, err)
		}
	}

	// Le 5e échec déclenche le verrou immédiatement.
	_, _, err := svc.Login(context.Background(), "alice", "wrongpw")
	if !errors.Is(err, ErrAccountLocked) {
		t.Fatalf("5e échec : attendu ErrAccountLocked, obtenu %v", err)
	}

	// Tant que locked_until > now, même le bon mot de passe est refusé.
	_, _, err = svc.Login(context.Background(), "alice", "correctpw")
	if !errors.Is(err, ErrAccountLocked) {
		t.Fatalf("avec bon mot de passe mais compte verrouillé : attendu ErrAccountLocked, obtenu %v", err)
	}

	u := repo.users[repo.findID("alice")]
	if u.LockedUntil == nil {
		t.Fatalf("locked_until devrait être positionné après verrouillage")
	}
	if u.LockedUntil.Before(time.Now()) {
		t.Errorf("locked_until devrait être dans le futur : %v", u.LockedUntil)
	}
}

// TestLoginResetCompteurApresSucces : un succès après des échecs partiels
// doit remettre le compteur à 0 (sinon → brute-force progressif).
func TestLoginResetCompteurApresSucces(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	seedUser(t, repo, "alice", "correctpw", entity.RoleObserver)

	// 3 échecs puis 1 succès.
	for i := 0; i < 3; i++ {
		_, _, _ = svc.Login(context.Background(), "alice", "wrongpw")
	}
	_, _, err := svc.Login(context.Background(), "alice", "correctpw")
	if err != nil {
		t.Fatalf("Login après échecs partiels: %v", err)
	}
	if got := repo.users[repo.findID("alice")].FailedLoginAttempts; got != 0 {
		t.Errorf("compteur devrait être reset à 0 après succès, obtenu %d", got)
	}
}

// TestLoginUtilisateurInexistant : pas de fuite d'info (même erreur).
func TestLoginUtilisateurInexistant(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	_, _, err := svc.Login(context.Background(), "ghost", "anything")
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("attendu ErrInvalidCredentials pour user inexistant, obtenu %v", err)
	}
	// Audit doit quand même enregistrer la tentative (avec userID vide).
	if len(audit.events) == 0 {
		t.Errorf("LOGIN_FAILED devrait être audité même pour user inexistant")
	}
}

// TestLoginMFAChallengePourSuperAdmin : si MFA activée et user=super_admin
// → retourne un challenge token (aud=mfa), pas un token d'accès.
func TestLoginMFAChallengePourSuperAdmin(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	user := seedUser(t, repo, "admin", "correctpw", entity.RoleSuperAdmin)
	secret, _, _ := NewMFAService().GenerateSecret("admin", "Openvote")
	_ = repo.SetMFASecret(context.Background(), user.ID, secret, []byte(`[]`))

	accessToken, challenge, err := svc.Login(context.Background(), "admin", "correctpw")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if accessToken != "" {
		t.Errorf("access token ne devrait PAS être retourné pour user MFA")
	}
	if challenge == "" {
		t.Errorf("challenge token devrait être retourné")
	}

	// Valide que c'est bien un challenge token (aud=mfa).
	claims, err := svc.ValidateMFAChallengeToken(challenge)
	if err != nil {
		t.Fatalf("ValidateMFAChallengeToken: %v", err)
	}
	if (*claims)["aud"] != mfaAudience {
		t.Errorf("challenge token aud=%v, attendu %s", (*claims)["aud"], mfaAudience)
	}
}

// TestLoginMFANeBloquePasObserver : si MFA activée mais user!=super_admin,
// on ignore (par design du brief). Retourne token d'accès directement.
func TestLoginMFANeBloquePasObserver(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	user := seedUser(t, repo, "obs", "correctpw", entity.RoleObserver)
	secret, _, _ := NewMFAService().GenerateSecret("obs", "Openvote")
	_ = repo.SetMFASecret(context.Background(), user.ID, secret, []byte(`[]`))

	token, challenge, err := svc.Login(context.Background(), "obs", "correctpw")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if token == "" {
		t.Errorf("token d'accès devrait être retourné pour observer MFA-activé (par design)")
	}
	if challenge != "" {
		t.Errorf("challenge token ne devrait PAS être retourné pour observer (par design)")
	}
}

// TestValidateTokenRejetteChallengeMFA : un challenge token ne peut PAS être
// utilisé comme access token (sinon escalade de privilèges).
func TestValidateTokenRejetteChallengeMFA(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	// Génère un challenge token.
	challenge, _ := svc.generateMFAChallengeToken("user-123", entity.RoleSuperAdmin)

	// ValidateToken (utilisé par le middleware d'auth) doit le refuser.
	_, err := svc.ValidateToken(challenge)
	if err == nil {
		t.Errorf("ValidateToken devrait rejeter un challenge token (aud=mfa), pas l'accepter")
	}
}

// TestConfirmMFASetupOk : un code TOTP généré pour le secret stocké est
// accepté (preuve que l'utilisateur a scanné le QR).
func TestConfirmMFASetupOk(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	user := seedUser(t, repo, "admin", "correctpw", entity.RoleSuperAdmin)
	secret, _, _ := NewMFAService().GenerateSecret("admin", "Openvote")
	_ = repo.SetMFASecret(context.Background(), user.ID, secret, []byte(`[]`))

	// Génère le code attendu pour le compteur actuel.
	counter := time.Now().Unix() / 30
	code := generateTOTPCode(decodeBase32FromTest(t, secret), counter)

	if err := svc.ConfirmMFASetup(context.Background(), user.ID, code); err != nil {
		t.Errorf("ConfirmMFASetup devrait accepter un code valide : %v", err)
	}
}

// TestConfirmMFASetupRefuseCodeIncorrect : un mauvais code → ErrInvalidMFA.
func TestConfirmMFASetupRefuseCodeIncorrect(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	user := seedUser(t, repo, "admin", "correctpw", entity.RoleSuperAdmin)
	secret, _, _ := NewMFAService().GenerateSecret("admin", "Openvote")
	_ = repo.SetMFASecret(context.Background(), user.ID, secret, []byte(`[]`))

	err := svc.ConfirmMFASetup(context.Background(), user.ID, "000000")
	if !errors.Is(err, ErrInvalidMFA) {
		t.Errorf("ConfirmMFASetup avec code invalide devrait retourner ErrInvalidMFA, obtenu %v", err)
	}
}

// TestConfirmMFASetupSansMFA : si MFA pas activée, erreur (pas de confirm possible).
func TestConfirmMFASetupSansMFA(t *testing.T) {
	repo := newMockUserRepo()
	audit := &mockAuditRepo{}
	svc := NewAuthService(repo, NewMFAService(), audit).(*authService)

	user := seedUser(t, repo, "admin", "correctpw", entity.RoleSuperAdmin)

	err := svc.ConfirmMFASetup(context.Background(), user.ID, "123456")
	if err == nil {
		t.Errorf("ConfirmMFASetup sans MFA activée devrait retourner une erreur")
	}
}

func (m *mockUserRepo) findID(username string) string {
	for id, u := range m.users {
		if u.Username == username {
			return id
		}
	}
	return ""
}

// Compile-time check : les mocks satisfont bien les interfaces.
var (
	_ repository.UserRepository      = (*mockUserRepo)(nil)
	_ repository.AuditLogRepository = (*mockAuditRepo)(nil)
)