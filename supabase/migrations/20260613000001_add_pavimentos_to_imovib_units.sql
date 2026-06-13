ALTER TABLE public.imovib_units
    ADD COLUMN IF NOT EXISTS pavimentos INTEGER DEFAULT 1;
