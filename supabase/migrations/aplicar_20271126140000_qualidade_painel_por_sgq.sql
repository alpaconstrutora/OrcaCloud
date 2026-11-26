-- =============================================================================
-- Qualidade (SiAC / PBQP-H) — fase 2, pendência: o painel conta igual para quem olha.
-- Plano:  docs/planos/2026-11-26-qualidade-siac-fase2-implementacao.md
--         ("Pendências resolvidas (26/11)", item 2).
-- Consome: aplicar_20271126100000 (estrutura: work_order_validations.executores/liberado_em),
--          110000, 120000, 130000.
--
-- ⚠️ REAPLICAR NA ORDEM: vem DEPOIS das quatro da fase 2
--    (100000 → 110000 → 120000 → 130000 → esta 140000). Não redefine nenhuma função
--    delas; é idempotente (CREATE OR REPLACE) e pode ser reaplicada sozinha, desde que
--    a 100000 já esteja no banco (guarda no topo).
--
-- O problema: qualidadeSiacService.inspecoesAprovadas(sgq) lia work_order_validations
-- pela RLS de quem olha. Quem é membro só da Alpa (SGQ) não enxerga as OEs da SPE que
-- aponta para ela — e o painel "aplicados com registro" da Alpa contava MENOS, calado,
-- conforme quem abria a tela.
--
-- A correção: quality_inspecoes_aprovadas_do_sgq(p_sgq) — SECURITY DEFINER — devolve
-- UMA linha por validação de inspeção aprovada (type 'inspection', status 'approved')
-- de OE cujo serviço controlado é de p_sgq, de qualquer organização. Só campos de
-- CONTAGEM: serviço, quando, se a obra está "Em andamento" e quantos executores /
-- quantos treinados. SEM nome de pessoa, SEM id de OE, SEM id de colaborador — o
-- membro da Alpa passa a contar a OE da SPE, mas não passa a ver a SPE.
--
-- O app (services/qualidadeSiacService.ts) chama esta RPC e, se ela ainda não existir
-- no banco (PGRST202 / 42883), volta para a leitura antiga pela RLS — publicar o app
-- antes desta migration não quebra o painel.
--
-- REGRA #7:
--   Pergunta 1 — nenhuma policy nova nem alterada.
--   Pergunta 2 — quality_inspecoes_aprovadas_do_sgq(uuid): NOVA, SECURITY DEFINER.
--     Autoriza DENTRO: quem chama é membro de p_sgq (p_sgq IN minhas_orgs_membro())
--     ou superadmin; senão 42501 (inclusive p_sgq NULL ou organização inexistente —
--     não distingue). O que sai é agregado do próprio SGQ do membro: os serviços são
--     dele; da OE de outra organização só sai "houve uma inspeção aprovada neste
--     serviço, nesta data, obra em andamento sim/não, N executores, M treinados".
--     REVOKE EXECUTE FROM PUBLIC, anon + GRANT authenticated, na mesma migration.
--
-- Aplicar com `npx supabase db query --linked -f` — nunca `db push`.
-- =============================================================================

SET lock_timeout = '3s';

BEGIN;

-- ── 0. Pré-requisito: fase 2 aplicada (colunas da validação) ────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'work_order_validations'
                      AND column_name = 'executores')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'work_order_validations'
                      AND column_name = 'liberado_em') THEN
        RAISE EXCEPTION 'Aplique antes aplicar_20271126100000 … 130000 (na ordem).';
    END IF;
END $$;

-- ── 1. Inspeções aprovadas do SGQ, só com o que se conta ─────────────────────
CREATE OR REPLACE FUNCTION public.quality_inspecoes_aprovadas_do_sgq(p_sgq uuid)
RETURNS TABLE (
    controlled_item_id   uuid,
    aprovado_em          timestamptz,
    obra_em_andamento    boolean,
    executores_total     integer,
    executores_treinados integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (public.is_superadmin()
            OR COALESCE(p_sgq IN (SELECT public.minhas_orgs_membro()), false)) THEN
        RAISE EXCEPTION 'Sem acesso ao sistema da qualidade desta organização.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT wo.controlled_item_id,
           COALESCE(v.liberado_em, v.created_at),
           COALESCE(p.settings ->> 'obraStatus' = 'Em andamento', false),
           CASE WHEN jsonb_typeof(v.executores) = 'array'
                THEN jsonb_array_length(v.executores) ELSE 0 END,
           CASE WHEN jsonb_typeof(v.executores) = 'array'
                THEN (SELECT count(*)::integer
                        FROM jsonb_array_elements(v.executores) e
                       WHERE jsonb_typeof(e) = 'object'
                         AND (e ->> 'treinado') = 'true')
                ELSE 0 END
      FROM public.work_order_validations v
      JOIN public.work_orders wo             ON wo.id = v.work_order_id
      JOIN public.quality_controlled_items i ON i.id = wo.controlled_item_id
      LEFT JOIN public.projects p            ON p.id = wo.project_id
     WHERE v.type = 'inspection'
       AND v.status = 'approved'
       AND i.organization_id = p_sgq;
END
$$;

COMMENT ON FUNCTION public.quality_inspecoes_aprovadas_do_sgq(uuid) IS
    'Painel da Qualidade (SiAC): inspeções aprovadas das OEs com serviço controlado do SGQ '
    'p_sgq, de qualquer organização que aponta para ele — só contagem (serviço, data, obra em '
    'andamento, executores/treinados), sem nomes nem ids. Só membro de p_sgq ou superadmin; '
    'senão 42501. Migration aplicar_20271126140000.';

REVOKE EXECUTE ON FUNCTION public.quality_inspecoes_aprovadas_do_sgq(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.quality_inspecoes_aprovadas_do_sgq(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
