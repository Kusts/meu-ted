-- v2: keep financial write intention identity stable across turn regeneration.
ALTER TABLE turn_queue ADD COLUMN intention_id TEXT;
UPDATE turn_queue SET intention_id = id WHERE intention_id IS NULL;
CREATE INDEX IF NOT EXISTS turn_queue_intention_id_idx ON turn_queue(intention_id);
