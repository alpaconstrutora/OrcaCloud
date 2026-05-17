-- Alter attachment_url to JSONB to support multiple URLs
-- 1. Create a temporary column
ALTER TABLE contract_measurement_items ADD COLUMN attachment_url_new JSONB DEFAULT '[]'::jsonb;

-- 2. Migrate existing data
-- If it was a single URL string, convert it to a JSON array with one element
-- If it was empty/null, it stays as an empty array
UPDATE contract_measurement_items 
SET attachment_url_new = jsonb_build_array(attachment_url)
WHERE attachment_url IS NOT NULL AND attachment_url <> '';

-- 3. Drop old column and rename new one
ALTER TABLE contract_measurement_items DROP COLUMN attachment_url;
ALTER TABLE contract_measurement_items RENAME COLUMN attachment_url_new TO attachment_urls;

-- Note: I'm renaming it to 'attachment_urls' (plural) to better reflect the new reality,
-- but I'll update the code to handle both or just use the new name.
