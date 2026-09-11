-- ============================================================================
-- Planta Inteligente — parâmetros de PROJETO da terraplenagem (fase 3)
--
-- Talude de corte e de aterro (1:h), empolamento do material escavado e
-- contração do aterro compactado. Entram na premissa por estudo, ao lado da
-- base e da cota do platô; os volumes continuam derivados, nunca gravados.
--
-- Padrões de solo comum. São PREMISSA — a tela diz isso — e não fato medido.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ `ADD COLUMN IF NOT EXISTS` com DEFAULT: idempotente, e as linhas que já
--    existem recebem os padrões.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_terraplenagem
    ADD COLUMN IF NOT EXISTS talude_corte_h  NUMERIC NOT NULL DEFAULT 1.5 CHECK (talude_corte_h  > 0),
    ADD COLUMN IF NOT EXISTS talude_aterro_h NUMERIC NOT NULL DEFAULT 1.5 CHECK (talude_aterro_h > 0),
    ADD COLUMN IF NOT EXISTS empolamento_pct NUMERIC NOT NULL DEFAULT 25  CHECK (empolamento_pct >= 0),
    ADD COLUMN IF NOT EXISTS contracao_pct   NUMERIC NOT NULL DEFAULT 15  CHECK (contracao_pct   >= 0);

COMMENT ON COLUMN public.blueprint_study_terraplenagem.talude_corte_h IS
  'Talude de corte 1:h (h na horizontal para 1 na vertical). Premissa de projeto.';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.empolamento_pct IS
  'Empolamento do material escavado, em % (banco → solto).';
COMMENT ON COLUMN public.blueprint_study_terraplenagem.contracao_pct IS
  'Contração do aterro compactado, em % (banco necessário = aterro × (1 + c)).';

RESET lock_timeout;
