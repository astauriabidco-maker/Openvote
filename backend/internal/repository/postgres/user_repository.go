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
