-- Migration 003: Audit Logs for Phase 4
-- Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
-- Phase 4: Full CRUD + audit trail + undo
-- Requires: 001_initial_schema.sql + 002_pending_operations.sql already applied

BEGIN;

-- ============================================================
-- AUDIT LOGS (immutable write log)
-- All write operations (create/update/delete/confirm/cancel/undo)
-- are recorded here with before/after JSON snapshots.
-- This table is append-only — rows are never deleted or modified.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id),
    user_id     UUID REFERENCES users(id),
    action      TEXT NOT NULL,              -- create, update, delete, confirm, cancel, undo
    entity_type TEXT NOT NULL,             -- transaction, account, category, pending_operation
    entity_id   UUID NOT NULL,
    before_json JSONB,                     -- NULL for create actions
    after_json  JSONB,                     -- NULL for delete actions
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_household
    ON audit_logs(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
    ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user
    ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON audit_logs(action, created_at DESC);

-- ============================================================
-- UNDO SUPPORT: last_action tracking per household
-- Households table gets a last_audit_log_id column to track
-- the most recent auditable action for undo operations.
-- ============================================================
ALTER TABLE households
    ADD COLUMN IF NOT EXISTS last_audit_log_id UUID REFERENCES audit_logs(id);

COMMIT;