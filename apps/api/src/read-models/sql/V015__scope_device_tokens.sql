-- Device tokens carry their household context before authentication lookup.
-- This lets the resolver scope the credential lookup without trusting a
-- separate workspace header. Existing temporary tokens are rotated in place.
UPDATE device_tokens
SET token = household_id::text || '.' || token
WHERE token NOT LIKE household_id::text || '.%';

ALTER TABLE device_tokens
  ADD CONSTRAINT device_tokens_token_scope_ck CHECK (POSITION('.' IN token) > 0);
