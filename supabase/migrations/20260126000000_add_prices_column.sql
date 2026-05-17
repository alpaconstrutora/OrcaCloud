-- Add prices column to sinapi_items table
ALTER TABLE sinapi_items 
ADD COLUMN IF NOT EXISTS prices JSONB DEFAULT '{}'::jsonb;

-- Optional: Create index for faster JSON queries if needed locally
-- CREATE INDEX IF NOT EXISTS idx_sinapi_prices ON sinapi_items USING gin (prices);
