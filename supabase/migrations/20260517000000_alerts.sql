-- Phase 3 — DETECT leg: alerts table.
-- See chaindrain_export/CURSOR_PROMPT.md "PHASE 3" and docs/AI_CONTEXT.md §7.
-- Migrations are append-only; do not edit prior files (DECISIONS §8).

CREATE TABLE IF NOT EXISTS chaindrain.alert (
    alert_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    detected_at       timestamptz NOT NULL DEFAULT now(),
    signal_type       text        NOT NULL,
    severity          text        NOT NULL,
    dependency_key    text        NOT NULL,
    dependency_field  text        NOT NULL,
    raw_signal        jsonb       NOT NULL,
    fanout_count      int,
    fanout_tvl_usd    numeric,
    CONSTRAINT alert_signal_type_chk CHECK (
        signal_type IN (
            'stablecoin_depeg',
            'oracle_deviation',
            'bridge_pause',
            'admin_tx',
            'tvl_drop'
        )
    ),
    CONSTRAINT alert_severity_chk CHECK (
        severity IN ('critical', 'high', 'medium', 'low')
    )
);

CREATE INDEX IF NOT EXISTS idx_alert_detected
    ON chaindrain.alert (detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_severity
    ON chaindrain.alert (severity, detected_at DESC);

GRANT SELECT ON chaindrain.alert TO anon, authenticated;
GRANT ALL    ON chaindrain.alert TO service_role;
