-- ============================================================================
-- Planta Inteligente — terraplenagem fase 4: banqueta, via de serviço, talude
-- por aresta; e a linha desenhada do perfil altimétrico.
--
-- Tudo na premissa por estudo (`blueprint_study_terraplenagem`), como os
-- parâmetros da fase 3. Volumes, canaletas e o próprio perfil continuam
-- DERIVADOS na tela.
--
-- `talude_por_aresta`: JSON `[{corteH, aterroH} | null, …]`, índice = aresta
-- do anel do platô. `perfil_polilinha`: JSON `[{x, y}, …]` em mm do desenho —
-- a linha do perfil é do MUNDO, não do desenho, e por isso não vai no payload.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_terraplenagem
    ADD COLUMN IF NOT EXISTS altura_do_lance_m     NUMERIC NOT NULL DEFAULT 6 CHECK (altura_do_lance_m     >= 0),
    ADD COLUMN IF NOT EXISTS largura_da_banqueta_m NUMERIC NOT NULL DEFAULT 2 CHECK (largura_da_banqueta_m >= 0),
    ADD COLUMN IF NOT EXISTS largura_da_via_m      NUMERIC NOT NULL DEFAULT 0 CHECK (largura_da_via_m      >= 0),
    ADD COLUMN IF NOT EXISTS talude_por_aresta     JSONB   NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS perfil_polilinha      JSONB;

COMMENT ON COLUMN public.blueprint_study_terraplenagem.altura_do_lance_m IS
  'Banqueta a cada N metros de altura de talude (0 = sem banqueta).';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.largura_da_via_m IS
  'Via de serviço: faixa na cota do platô em volta dele, antes do talude (0 = sem).';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.talude_por_aresta IS
  '[{corteH, aterroH} | null, …] por aresta do anel do platô; vazio herda o padrão.';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.perfil_polilinha IS
  'Linha desenhada do perfil altimétrico, [{x, y}] em mm do desenho. NULL = usa um corte.';

RESET lock_timeout;
