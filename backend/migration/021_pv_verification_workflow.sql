-- Migration 021: Workflow minimal de vérification des PV terrain

DO $$ BEGIN
    ALTER TYPE pv_status ADD VALUE IF NOT EXISTS 'needs_clarification';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE pv_submissions
    ADD COLUMN IF NOT EXISTS verification_comment TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_pv_submissions_verified_by ON pv_submissions (verified_by);
CREATE INDEX IF NOT EXISTS idx_pv_submissions_verified_at ON pv_submissions (verified_at);
