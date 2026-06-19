-- Controle de versões das minutas de contrato
-- Cada entrada: { v: number, url: string, notes: string, created_at: string }
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS minuta_versions JSONB NOT NULL DEFAULT '[]'::jsonb;
