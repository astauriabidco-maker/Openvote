-- Migration 015 : MFA (TOTP) + lockout par tentatives échouées (cf. H3 audit).
--
-- Ajoute 4 colonnes à la table users :
--   - mfa_secret         : secret TOTP base32 (NULL = MFA désactivé)
--   - mfa_backup_codes   : JSONB avec liste de backup codes hashés
--   - failed_login_attempts : compteur de tentatives échouées (reset sur succès)
--   - locked_until       : TIMESTAMPTZ, NULL = pas verrouillé
--
-- Politique de lockout (cf. auth_service.go) :
--   - 5 tentatives échouées → locked_until = NOW() + 15 minutes
--   - Reset du compteur sur login réussi
--   - Application uniquement sur /auth/login (pas sur /auth/mfa/verify)
--
-- Politique MFA (cf. mfa_service.go) :
--   - Activable uniquement par super_admin (par design du brief)
--   - TOTP standard RFC 6238, secret 20 bytes base32
--   - 10 backup codes générés à l'activation, chacun utilisable 1 fois
--   - Stockage : secret en clair (nécessaire pour vérifier TOTP),
--     backup codes hashés en bcrypt
--
-- Idempotence : tous les ALTER utilisent IF NOT EXISTS.

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Index pour accélérer le nettoyage des locks expirés (cron job futur).
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- Index pour détecter rapidement les utilisateurs avec MFA activé.
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users((mfa_secret IS NOT NULL)) WHERE mfa_secret IS NOT NULL;

-- Commentaire documentation
COMMENT ON COLUMN users.mfa_secret IS 'Secret TOTP base32 (NULL = MFA désactivé). Réservé super_admin.';
COMMENT ON COLUMN users.mfa_backup_codes IS 'JSONB: [{hash, used: bool, used_at: timestamp}]. Générés à l''activation, usage unique.';
COMMENT ON COLUMN users.failed_login_attempts IS 'Compteur de tentatives de login échouées (reset sur succès). Lockout à 5.';
COMMENT ON COLUMN users.locked_until IS 'Timestamp de fin de lockout (NULL = pas verrouillé). Durée : 15 min.';