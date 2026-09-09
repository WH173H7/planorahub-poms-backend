BEGIN;

ALTER TABLE letter_documents
  ADD COLUMN IF NOT EXISTS signature_data_url TEXT;

COMMIT;
