package postgres

import (
	"context"
	"database/sql"
	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/domain/repository"
)

type userRepo struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) repository.UserRepository {
	return &userRepo{db: db}
}

func (r *userRepo) Create(ctx context.Context, user *entity.User) error {
	query := `INSERT INTO users (id, username, role, password_hash, region_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := r.db.ExecContext(ctx, query, user.ID, user.Username, user.Role, user.PasswordHash, user.RegionID, user.CreatedAt, user.UpdatedAt)
	return err
}

func (r *userRepo) GetByID(ctx context.Context, id string) (*entity.User, error) {
	query := `SELECT id, username, role, password_hash, region_id, created_at, updated_at FROM users WHERE id = $1`
	user := &entity.User{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(&user.ID, &user.Username, &user.Role, &user.PasswordHash, &user.RegionID, &user.CreatedAt, &user.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return user, err
}

func (r *userRepo) GetByUsername(ctx context.Context, username string) (*entity.User, error) {
	query := `SELECT id, username, role, password_hash, region_id, created_at, updated_at FROM users WHERE username = $1`
	user := &entity.User{}
	err := r.db.QueryRowContext(ctx, query, username).Scan(&user.ID, &user.Username, &user.Role, &user.PasswordHash, &user.RegionID, &user.CreatedAt, &user.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return user, err
}

func (r *userRepo) GetAll(ctx context.Context) ([]entity.User, error) {
	query := `SELECT id, username, role, COALESCE(region_id, '') as region_id, created_at, updated_at, last_login_at FROM users ORDER BY created_at DESC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []entity.User
	for rows.Next() {
		var user entity.User
		var lastLogin sql.NullTime
		err := rows.Scan(&user.ID, &user.Username, &user.Role, &user.RegionID, &user.CreatedAt, &user.UpdatedAt, &lastLogin)
		if err != nil {
			return nil, err
		}
		if lastLogin.Valid {
			user.LastLoginAt = &lastLogin.Time
		}
		users = append(users, user)
	}
	return users, nil
}

func (r *userRepo) UpdateRole(ctx context.Context, id string, role entity.UserRole, regionID string) error {
	query := `UPDATE users SET role = $1, region_id = $2, updated_at = NOW() WHERE id = $3`
	result, err := r.db.ExecContext(ctx, query, role, regionID, id)
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
	_, err := r.db.ExecContext(ctx, `UPDATE users SET last_login_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *userRepo) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM users WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}
