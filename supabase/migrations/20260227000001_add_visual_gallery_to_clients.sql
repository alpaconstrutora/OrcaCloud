-- Add visual_gallery column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS visual_gallery JSONB DEFAULT '[]';

-- Request schema reload
NOTIFY pgrst, 'reload schema';
