-- ============================================================================
-- Planta Inteligente — FRAÇÃO IDEAL DA VERSÃO APROVADA DE VOLTA AO EMPREENDIMENTO
-- (14/10/2026, Fase 9 do plano docs/planos/2026-10-13-areas-nbr12721-na-planta.md)
--
-- O Motor de Áreas antigo devolvia a fração ao Empreendimento a partir de uma
-- versão "calculada" (`writeBackFractionsToEmpreendimento`), pela proveniência
-- guardada do lado DELE (`area_version_units.source_empreendimento_unit_id`).
-- Na Planta:
--
--   1. empreendimento_units.blueprint_unidade_chave — a unidade do prédio da
--      Planta a que a unidade do Empreendimento corresponde (`UnidadeDoPredio.chave`:
--      "<uid>" ou "<uid>:<levelUid>" do andar copiado). Mesmo molde de
--      `blueprint_massa_chave` (aplicar_20271002000020). Quem liga é a pessoa,
--      na tela, a partir de uma proposta por número — nunca inferido calado.
--   2. empreendimento_units.nbr12721_snapshot_id — a VERSÃO publicada de onde
--      veio a fração (substitui `area_engine_version_id`, que sai na Fase 10
--      junto com as tabelas area_*).
--   3. blueprint_snapshot_nbr12721.unidades — código do motor ↔ chave ↔ número,
--      congelado na publicação. Sem isso a fração ("101 [2]") não tem como
--      voltar à unidade certa. A tabela tinha 0 linhas em 14/10/2026: a coluna
--      entra com padrão '[]' e não há linha antiga para tratar.
--   4. devolver_nbr12721_ao_empreendimento(versão, empreendimento, pares) —
--      SECURITY DEFINER, autorização DENTRO; uma transação só:
--        - membro da organização do empreendimento E da versão;
--        - a versão é do estudo ligado ao empreendimento;
--        - quadro sem pendência, aprovado na TÉCNICA e na JURÍDICA;
--        - cada par: unidade deste empreendimento, chave existente na versão,
--          chave sem repetição;
--        - grava a chave; grava fração (milésimos FECHADOS em 1000), área real
--          total (IV-B f), versão e data — NUNCA em fração de CONVENÇÃO (o
--          gatilho trg_fracao_ideal_protege_convencao também recusaria).
--
-- REGRA #7: REVOKE de PUBLIC e anon na mesma migration.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.empreendimento_units
    ADD COLUMN IF NOT EXISTS blueprint_unidade_chave TEXT,
    ADD COLUMN IF NOT EXISTS nbr12721_snapshot_id UUID REFERENCES public.blueprint_snapshots(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.empreendimento_units.blueprint_unidade_chave IS
  'Unidade do prédio da Planta (UnidadeDoPredio.chave) correspondente — ligada pela pessoa na devolução das frações NBR 12721.';
COMMENT ON COLUMN public.empreendimento_units.nbr12721_snapshot_id IS
  'Versão publicada da Planta de onde vieram fracao_ideal_* e area_real_total_m2 (origem MOTOR).';

CREATE INDEX IF NOT EXISTS idx_empreendimento_units_nbr12721_snapshot ON public.empreendimento_units(nbr12721_snapshot_id);

ALTER TABLE public.blueprint_snapshot_nbr12721
    ADD COLUMN IF NOT EXISTS unidades JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.blueprint_snapshot_nbr12721.unidades IS
  '[{codigo, chave, numero}] — código da unidade no motor ↔ UnidadeDoPredio.chave ↔ número, congelado na publicação.';

CREATE OR REPLACE FUNCTION public.devolver_nbr12721_ao_empreendimento(
    p_snapshot_id UUID,
    p_empreendimento_id UUID,
    p_pares JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    q RECORD;
    v_emp_org UUID;
    v_emp_study UUID;
    v_par JSONB;
    v_unit RECORD;
    v_chave TEXT;
    v_codigo TEXT;
    v_fracao JSONB;
    v_area NUMERIC;
    v_gravadas INT := 0;
    v_vinculos INT := 0;
    v_convencao TEXT[] := '{}';
    v_sem_fracao TEXT[] := '{}';
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
    END IF;
    IF p_pares IS NULL OR jsonb_typeof(p_pares) <> 'array' THEN
        RAISE EXCEPTION 'pares inválidos: esperava uma lista' USING ERRCODE = '22023';
    END IF;

    SELECT n.organization_id, n.study_id, n.saida, n.unidades, s.revision
      INTO q
      FROM public.blueprint_snapshot_nbr12721 n
      JOIN public.blueprint_snapshots s ON s.id = n.snapshot_id
     WHERE n.snapshot_id = p_snapshot_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'esta versão não tem os Quadros NBR 12721 congelados' USING ERRCODE = 'P0002';
    END IF;

    SELECT e.organization_id, e.blueprint_study_id INTO v_emp_org, v_emp_study
      FROM public.empreendimentos e WHERE e.id = p_empreendimento_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'empreendimento não encontrado' USING ERRCODE = 'P0002';
    END IF;

    -- A autorização mora AQUI (o GRANT é só privilégio de chamada — REGRA #7).
    IF NOT public.is_org_member(v_emp_org) OR NOT public.is_org_member(q.organization_id) THEN
        RAISE EXCEPTION 'você não é membro da organização do empreendimento e da versão' USING ERRCODE = '42501';
    END IF;
    IF v_emp_study IS DISTINCT FROM q.study_id THEN
        RAISE EXCEPTION 'esta versão não é do estudo da Planta ligado a este empreendimento' USING ERRCODE = '22023';
    END IF;
    IF q.saida->>'status' IS DISTINCT FROM 'success' THEN
        RAISE EXCEPTION 'os quadros desta versão têm pendência bloqueante' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.blueprint_snapshot_nbr12721_aprovacoes a WHERE a.snapshot_id = p_snapshot_id AND a.tipo = 'TECNICA')
       OR NOT EXISTS (SELECT 1 FROM public.blueprint_snapshot_nbr12721_aprovacoes a WHERE a.snapshot_id = p_snapshot_id AND a.tipo = 'JURIDICA') THEN
        RAISE EXCEPTION 'só uma versão aprovada na técnica E na jurídica devolve a fração ao empreendimento' USING ERRCODE = '22023';
    END IF;

    -- Chave repetida entre os pares: duas unidades do Empreendimento numa só da Planta.
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_pares) x
         WHERE nullif(x->>'chave', '') IS NOT NULL
         GROUP BY x->>'chave' HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'a mesma unidade da Planta foi ligada a mais de uma unidade do empreendimento' USING ERRCODE = '22023';
    END IF;

    FOR v_par IN SELECT * FROM jsonb_array_elements(p_pares) LOOP
        SELECT u.id, u.name, u.fracao_ideal_origem INTO v_unit
          FROM public.empreendimento_units u
          JOIN public.empreendimento_towers t ON t.id = u.tower_id
         WHERE u.id = (v_par->>'unit_id')::uuid AND t.empreendimento_id = p_empreendimento_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'unidade % não é deste empreendimento', v_par->>'unit_id' USING ERRCODE = '22023';
        END IF;

        v_chave := nullif(v_par->>'chave', '');
        v_codigo := NULL;
        IF v_chave IS NOT NULL THEN
            SELECT x->>'codigo' INTO v_codigo FROM jsonb_array_elements(q.unidades) x WHERE x->>'chave' = v_chave LIMIT 1;
            IF v_codigo IS NULL THEN
                RAISE EXCEPTION 'a unidade da Planta % não existe nesta versão', v_chave USING ERRCODE = '22023';
            END IF;
        END IF;

        UPDATE public.empreendimento_units SET blueprint_unidade_chave = v_chave WHERE id = v_unit.id;
        IF v_chave IS NULL THEN CONTINUE; END IF;
        v_vinculos := v_vinculos + 1;

        IF v_unit.fracao_ideal_origem = 'CONVENCAO' THEN
            v_convencao := v_convencao || v_unit.name;
            CONTINUE;
        END IF;

        SELECT f INTO v_fracao FROM jsonb_array_elements(q.saida->'fracoes') f WHERE f->>'unidade' = v_codigo LIMIT 1;
        IF v_fracao IS NULL THEN
            -- Unidade não autônoma (sem fração no Quadro IV-B): ligada, mas sem número a levar.
            v_sem_fracao := v_sem_fracao || v_unit.name;
            CONTINUE;
        END IF;
        SELECT (l->>'qivb_f_real_total_area_raw')::numeric INTO v_area
          FROM jsonb_array_elements(q.saida->'quadroIVB') l WHERE l->>'unidade' = v_codigo LIMIT 1;

        UPDATE public.empreendimento_units
           SET fracao_ideal_decimal = (v_fracao->>'fraction_decimal_raw')::numeric,
               -- Os milésimos FECHADOS em 1000 (maior resto) — o número do cartório.
               fracao_ideal_thousandths = (v_fracao->>'milesimos')::numeric,
               fracao_ideal_origem = 'MOTOR',
               area_real_total_m2 = v_area,
               nbr12721_snapshot_id = p_snapshot_id,
               area_engine_synced_at = now()
         WHERE id = v_unit.id;
        v_gravadas := v_gravadas + 1;
    END LOOP;

    -- Depois das trocas, nenhuma chave pode ficar em duas unidades do empreendimento
    -- (uma unidade fora dos pares ainda com a chave antiga, por exemplo).
    IF EXISTS (
        SELECT 1 FROM public.empreendimento_units u
          JOIN public.empreendimento_towers t ON t.id = u.tower_id
         WHERE t.empreendimento_id = p_empreendimento_id AND u.blueprint_unidade_chave IS NOT NULL
         GROUP BY u.blueprint_unidade_chave HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'uma unidade da Planta ficaria ligada a duas unidades do empreendimento' USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
        'revisao', q.revision,
        'vinculos', v_vinculos,
        'gravadas', v_gravadas,
        'convencao', to_jsonb(v_convencao),
        'semFracao', to_jsonb(v_sem_fracao)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.devolver_nbr12721_ao_empreendimento(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devolver_nbr12721_ao_empreendimento(UUID, UUID, JSONB) TO authenticated;

RESET lock_timeout;
