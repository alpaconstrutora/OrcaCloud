-- ============================================================================
-- Planta Inteligente — projeto de CLIMATIZAÇÃO com ART, E8.4 (07/10/2026,
-- roadmap `docs/planos/2026-10-04-climatizacao-benchmark-altoqi-e-roadmap.md`):
--   `blueprint_study_projeto_executivo.disciplina` passa a aceitar CLIMATIZACAO —
--   a mesma tabela de emissão da topografia, da elétrica, do hidrossanitário e
--   do incêndio. As premissas de climatização já vivem em
--   `blueprint_study_climatizacao` (E0).
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ⚠️ Idempotente: DROP/ADD CONSTRAINT. Não toca em linha EMITIDA (o CHECK só ALARGA).
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_projeto_executivo
    DROP CONSTRAINT IF EXISTS blueprint_projeto_executivo_disciplina_chk;
ALTER TABLE public.blueprint_study_projeto_executivo
    ADD CONSTRAINT blueprint_projeto_executivo_disciplina_chk
    CHECK (disciplina IN ('TERRAPLENAGEM', 'ELETRICA', 'HIDROSSANITARIA', 'INCENDIO', 'CLIMATIZACAO'));

COMMENT ON COLUMN public.blueprint_study_projeto_executivo.disciplina IS
  'Qual projeto executivo a linha emite: TERRAPLENAGEM (topografia, drenagem, contenção), ELETRICA (NBR 5410), HIDROSSANITARIA (NBR 5626 / 8160), INCENDIO (regulamento do CBMMG, NBR 13714 / 10897) ou CLIMATIZACAO (NBR 16655 / 16401). Um rascunho por estudo POR disciplina.';

RESET lock_timeout;
