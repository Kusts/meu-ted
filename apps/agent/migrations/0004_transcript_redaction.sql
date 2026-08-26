-- v4: one-time backfill marker for credential-redacted durable transcript data.
CREATE TABLE IF NOT EXISTS transcript_redaction (
    id INTEGER PRIMARY KEY CHECK (id = 1)
);
