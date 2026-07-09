package postgres

import (

	"context"
	"database/sql"
	"time"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
	"github.com/openvote/backend/internal/platform/database"

)

type userRepo struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) repository.UserRepository {
	return &userRepo{db: db}
}

// userColumns liste les colonnes lues par les SELECT. Maintenue en un seul
// endroit pour éviter la divergence entre GetByID, GetByUsername et GetAll.
const userColumns = `id, username, role, password_hash, COALESCE(region_id, '') as region_id,
	created_at, updated_at, last_login_at,
	mfa_secret, COALESCE(mfa_backup_codes, '[]'::jsonb) as mfa_backup_codes,
	failed_login_attempts, locked_until`

func scanUser(row *sql.Row) (*entity.User, error) {
	user := &entity.User{}
	var lastLogin sql.NullTime
	var mfaSecret sql.NullString
	var lockedUntil sql.NullTime

	err := row.Scan(
		&user.ID, &user.Username, &user.Role, &user.PasswordHash, &user.RegionID,
		&user.CreatedAt, &user.UpdatedAt, &lastLogin,
		&mfaSecret, &user.MFABackupCodes,
		&user.FailedLoginAttempts, &lockedUntil,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if lastLogin.Valid {
		user.LastLoginAt = &lastLogin.Time
	}
	if mfaSecret.Valid && mfaSecret.String != "" {
		user.MFASecret = &mfaSecret.String
	}
	if lockedUntil.Valid {
		user.LockedUntil = &lockedUntil.Time
	}

	return user, nil
}

func scanUserRows(rows *sql.Rows) (*entity.User, error) {
	user := &entity.User{}
	var lastLogin sql.NullTime
	var mfaSecret sql.NullString
	var lockedUntil sql.NullTime

	err := rows.Scan(
		&user.ID, &user.Username, &user.Role, &user.PasswordHash, &user.RegionID,
		&user.CreatedAt, &user.UpdatedAt, &lastLogin,
		&mfaSecret, &user.MFABackupCodes,
		&user.FailedLoginAttempts, &lockedUntil,
	)
	if err != nil {
		return nil, err
	}

	if lastLogin.Valid {
		user.LastLoginAt = &lastLogin.Time
	}
	if mfaSecret.Valid && mfaSecret.String != "" {
		user.MFASecret = &mfaSecret.String
	}
	if lockedUntil.Valid {
		user.LockedUntil = &lockedUntil.Time
	}

	return user, nil
}

func (r *userRepo) Create(ctx context.Context, user *entity.User) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `INSERT INTO users (id, username, role, password_hash, region_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := r.db.ExecContext(queryCtx, query, user.ID, user.Username, user.Role, user.PasswordHash, user.RegionID, user.CreatedAt, user.UpdatedAt)
	return err
}

func (r *userRepo) GetByID(ctx context.Context, id string) (*entity.User, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	row := r.db.QueryRowContext(queryCtx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id)
	return scanUser(row)
}

func (r *userRepo) GetByUsername(ctx context.Context, username string) (*entity.User, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	row := r.db.QueryRowContext(queryCtx, `SELECT `+userColumns+` FROM users WHERE username = $1`, username)
	return scanUser(row)
}

func (r *userRepo) GetAll(ctx context.Context) ([]entity.User, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	rows, err := r.db.QueryContext(queryCtx, `SELECT `+userColumns+` FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []entity.User
	for rows.Next() {
		user, err := scanUserRows(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *user)
	}
	return users, nil
}

func (r *userRepo) UpdateRole(ctx context.Context, id string, role entity.UserRole, regionID string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `UPDATE users SET role = $1, region_id = $2, updated_at = NOW() WHERE id = $3`
	result, err := r.db.ExecContext(queryCtx, query, role, regionID, id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *userRepo) UpdateLastLogin(ctx context.Context, id string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	_, err := r.db.ExecContext(queryCtx, `UPDATE users SET last_login_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *userRepo) Delete(ctx context.Context, id string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	query := `DELETE FROM users WHERE id = $1`
	_, err := r.db.ExecContext(queryCtx, query, id)
	return err
}

// ============================================================
// H3 audit : lockout par tentatives échouées
// ============================================================

// IncrementFailedAttempts incrémente le compteur et retourne la nouvelle valeur.
// L'appelant décide s'il faut locker l'utilisateur (typiquement à >= 5).
// Toute la séquence "incrément + check + lock" est faite dans un appel
// unique pour éviter les race conditions (cf. H3).
func (r *userRepo) IncrementFailedAttempts(ctx context.Context, id string) (int, error) {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	var newCount int
	err := r.db.QueryRowContext(queryCtx,
		`UPDATE users SET failed_login_attempts = failed_login_attempts + 1, updated_at = NOW()
		 WHERE id = $1 RETURNING failed_login_attempts`,
		id,
	).Scan(&newCount)
	return newCount, err
}

func (r *userRepo) ResetFailedAttempts(ctx context.Context, id string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	_, err := r.db.ExecContext(queryCtx,
		`UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`,
		id,
	)
	return err
}

func (r *userRepo) LockUser(ctx context.Context, id string, until time.Time) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	_, err := r.db.ExecContext(queryCtx,
		`UPDATE users SET locked_until = $2, updated_at = NOW() WHERE id = $1`,
		id, until,
	)
	return err
}

// ============================================================
// H3 audit : MFA TOTP
// ============================================================

// SetMFASecret stocke le secret TOTP (en base32) et les backup codes hashés (JSONB).
// Le secret est en clair car nécessaire pour vérifier TOTP, mais l'accès à la
// table users est restreint au backend (cf. RLS éventuel).
func (r *userRepo) SetMFASecret(ctx context.Context, id string, secret string, backupCodesJSON []byte) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	_, err := r.db.ExecContext(queryCtx,
		`UPDATE users SET mfa_secret = $2, mfa_backup_codes = $3, updated_at = NOW() WHERE id = $1`,
		id, secret, backupCodesJSON,
	)
	return err
}

func (r *userRepo) DisableMFA(ctx context.Context, id string) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	_, err := r.db.ExecContext(queryCtx,
		`UPDATE users SET mfa_secret = NULL, mfa_backup_codes = '[]'::jsonb, updated_at = NOW() WHERE id = $1`,
		id,
	)
	return err
}

// ConsumeBackupCode marque un backup code comme utilisé.
// Effectue le check + l'update en une seule transaction pour éviter le race
// (sinon deux requêtes simultanées pourraient consommer le même code).
func (r *userRepo) ConsumeBackupCode(ctx context.Context, id string, codeIndex int) error {
	queryCtx, cancel := database.WithQueryTimeout(ctx)
	defer cancel()
	// JSONB update : jsonb_set met à jour le code à l'index donné.
	_, err := r.db.ExecContext(queryCtx,
		`UPDATE users
		 SET mfa_backup_codes = jsonb_set(
			 mfa_backup_codes,
			 ARRAY[$2::int],
			 (mfa_backup_codes->$2::int) || jsonb_build_object('used', true, 'used_at', to_jsonb(NOW()))
		 ),
		 updated_at = NOW()
		 WHERE id = $1
		   AND (mfa_backup_codes->$2::int->>'used')::boolean = false`,
		id, codeIndex,
	)
	return err
}