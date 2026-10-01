-- ============================================================================
-- Planta Inteligente — projeto de segurança contra INCÊNDIO com ART, E8.4
-- (01/10/2026, roadmap `docs/planos/2026-09-29-incendio-benchmark-altoqi-e-roadmap.md`):
--   `blueprint_study_projeto_executivo.disciplina` passa a aceitar INCENDIO — a
--   mesma tabela de emissão da topografia, da elétrica e do hidrossanitário.
--   As premissas de incêndio já vivem em `blueprint_study_incendio` (E0).
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Idempotente: DROP/ADD CONSTRAINT. Não toca em linha EMITIDA (o CHECK só ALARGA).
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_projeto_executivo
    DROP CONSTRAINT IF EXISTS blueprint_projeto_executivo_disciplina_chk;
ALTER TABLE public.blueprint_study_projeto_executivo
    ADD CONSTRAINT blueprint_projeto_executivo_disciplina_chk
    CHECK (disciplina IN ('TERRAPLENAGEM', 'ELETRICA', 'HIDROSSANITARIA', 'INCENDIO'));

COMMENT ON COLUMN public.blueprint_study_projeto_executivo.disciplina IS
  'Qual projeto executivo a linha emite: TERRAPLENAGEM (topografia, drenagem, contenção), ELETRICA (NBR 5410), HIDROSSANITARIA (NBR 5626 / 8160) ou INCENDIO (regulamento do CBMMG, NBR 13714 / 10897). Um rascunho por estudo POR disciplina.';

RESET lock_timeout;
