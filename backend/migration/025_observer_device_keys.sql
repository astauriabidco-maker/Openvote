-- Migration 025: Clés publiques d'appareils observateurs

CREATE TABLE IF NOT EXISTS observer_device_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(120) NOT NULL,
    algorithm VARCHAR(40) NOT NULL DEFAULT 'ECDSA_P256_SHA256',
    public_key_jwk JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_observer_device_keys_user
    ON observer_device_keys (user_id);

CREATE INDEX IF NOT EXISTS idx_observer_device_keys_device
    ON observer_device_keys (device_id);
