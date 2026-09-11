-- ============================================================================
-- Planta Inteligente — terraplenagem fase 6: drenagem traçada e contenção.
--
-- `drenagem`: as linhas de drenagem desenhadas (canaleta, descida d'água,
-- tubo) em mm do desenho, no sentido do escoamento:
--   [{id, nome, tipo: 'CANALETA'|'DESCIDA'|'TUBO', pontos: [{x, y}, …]}, …]
-- `caimento_min_pct`: o caimento mínimo exigido delas (padrão 0,5 %).
-- Contenção não ganha coluna: `talude_por_aresta[i].muro = true` marca o lado
-- do platô que leva muro de arrimo em vez de talude.
--
-- Perfil, caimento, altura e área de face continuam DERIVADOS na tela.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_terraplenagem
    ADD COLUMN IF NOT EXISTS drenagem         JSONB   NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS caimento_min_pct NUMERIC NOT NULL DEFAULT 0.5 CHECK (caimento_min_pct >= 0);

COMMENT ON COLUMN public.blueprint_study_terraplenagem.drenagem IS
  'Linhas de drenagem traçadas, no sentido do escoamento: [{id, nome, tipo CANALETA|DESCIDA|TUBO, pontos [{x,y}] em mm}].';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.caimento_min_pct IS
  'Caimento mínimo exigido das linhas de drenagem, em %.';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.talude_por_aresta IS
  '[{corteH, aterroH, muro} | null, …] por aresta do anel do platô; vazio herda o padrão; muro = muro de arrimo no lugar do talude.';

RESET lock_timeout;
