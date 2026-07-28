-- Add height_m to opura_electrical_walls
ALTER TABLE public.opura_electrical_walls
ADD COLUMN IF NOT EXISTS height_m NUMERIC(10,2) DEFAULT 2.80;
