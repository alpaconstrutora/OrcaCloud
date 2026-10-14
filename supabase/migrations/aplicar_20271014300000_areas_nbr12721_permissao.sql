-- ============================================================================
-- Áreas NBR 12721 — PERMISSÃO APLICADA NO BANCO + PREPARO DA REMOÇÃO DO MOTOR
-- (14/10/2026, Fase 10 do plano docs/planos/2026-10-13-areas-nbr12721-na-planta.md)
--
-- Roda ANTES do push da Fase 10 e não quebra o código que está em produção:
--
--   1. fn_pode_editar_areas_nbr12721(org) — a permissão `canEditAreaEngine`
--      (Usuários › Permissões Detalhadas) passa a VALER. Até aqui era só
--      declarada. Mesma regra de `avaliarEdicaoImovib` (hooks/useImovibEdicao.tsx)
--      e de `avaliarEdicaoAreasNbr12721` (hooks/useAreasNbr12721Edicao.ts):
--      não-membro não; admin/owner sim; chave definida no membro vale ela; sem
--      chave, o padrão do papel (viewer não, os demais sim). Em 14/10/2026
--      nenhum membro tinha a chave negada nem papel viewer: ninguém perde acesso.
--   2. aprovar_nbr12721_da_versao e devolver_nbr12721_ao_empreendimento passam
--      a exigir a permissão (42501 com o caminho para pedir). Corpo copiado dos
--      ARQUIVOS das migrations 20271014100000 e 20271014200000 + a checagem.
--   3. empreendimento_types.motor_category ganha DEFAULT 'vertical': o código
--      novo deixa de gravar a coluna (só o Motor antigo a lia) e o INSERT não
--      pode quebrar até o DROP da coluna, na migration seguinte.
--
-- REGRA #7: REVOKE de PUBLIC e anon em toda função.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_pode_editar_areas_nbr12721(p_org UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_perm JSONB;
BEGIN
    IF auth.uid() IS NULL OR p_org IS NULL THEN
        RETURN FALSE;
    END IF;
    -- O mesmo casamento de membro do is_org_member: user_id; e-mail só em linha legada sem user_id.
    SELECT m.role, m.permissions INTO v_role, v_perm
      FROM public.organization_members m
     WHERE m.organization_id = p_org
       AND ((m.user_id IS NOT NULL AND m.user_id = auth.uid())
            OR (m.user_id IS NULL AND lower(m.email) = lower(auth.jwt()->>'email')))
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    IF v_role IN ('admin', 'owner') THEN
        RETURN TRUE;
    END IF;
    IF v_perm ? 'canEditAreaEngine' THEN
        RETURN coalesce((v_perm->>'canEditAreaEngine')::boolean, FALSE);
    END IF;
    RETURN v_role IS DISTINCT FROM 'viewer';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pode_editar_areas_nbr12721(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pode_editar_areas_nbr12721(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.aprovar_nbr12721_da_versao(
    p_snapshot_id UUID,
    p_tipo TEXT,
    p_observacao TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
    v_hash TEXT;
    v_status TEXT;
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
    END IF;
    IF p_tipo IS NULL OR p_tipo NOT IN ('TECNICA', 'JURIDICA') THEN
        RAISE EXCEPTION 'tipo de aprovação desconhecido: %', p_tipo USING ERRCODE = '22023';
    END IF;
    SELECT q.organization_id, q.hash, q.saida->>'status'
      INTO v_org, v_hash, v_status
      FROM public.blueprint_snapshot_nbr12721 q
     WHERE q.snapshot_id = p_snapshot_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'esta versão não tem os Quadros NBR 12721 congelados' USING ERRCODE = 'P0002';
    END IF;
    -- A autorização mora AQUI (o GRANT é só privilégio de chamada — REGRA #7).
    IF NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'você não é membro da organização desta versão' USING ERRCODE = '42501';
    END IF;
    IF NOT public.fn_pode_editar_areas_nbr12721(v_org) THEN
        RAISE EXCEPTION 'sem permissão para editar as Áreas NBR 12721 nesta organização (Usuários › Permissões Detalhadas)' USING ERRCODE = '42501';
    END IF;
    IF v_status IS DISTINCT FROM 'success' THEN
        RAISE EXCEPTION 'os quadros desta versão têm pendência bloqueante — não há o que aprovar' USING ERRCODE = '22023';
    END IF;
    IF p_tipo = 'JURIDICA' AND NOT EXISTS (
        SELECT 1 FROM public.blueprint_snapshot_nbr12721_aprovacoes a WHERE a.snapshot_id = p_snapshot_id AND a.tipo = 'TECNICA'
    ) THEN
        RAISE EXCEPTION 'a aprovação jurídica vem depois da técnica' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.blueprint_snapshot_nbr12721_aprovacoes a WHERE a.snapshot_id = p_snapshot_id AND a.tipo = p_tipo) THEN
        RAISE EXCEPTION 'esta versão já tem a aprovação %', lower(p_tipo) USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.blueprint_snapshot_nbr12721_aprovacoes (snapshot_id, organization_id, tipo, hash, observacao, aprovado_por)
    VALUES (p_snapshot_id, v_org, p_tipo, v_hash, NULLIF(btrim(COALESCE(p_observacao, '')), ''), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aprovar_nbr12721_da_versao(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_nbr12721_da_versao(UUID, TEXT, TEXT) TO authenticated;

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
    IF NOT public.fn_pode_editar_areas_nbr12721(q.organization_id) THEN
        RAISE EXCEPTION 'sem permissão para editar as Áreas NBR 12721 nesta organização (Usuários › Permissões Detalhadas)' USING ERRCODE = '42501';
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

ALTER TABLE public.empreendimento_types ALTER COLUMN motor_category SET DEFAULT 'vertical';

RESET lock_timeout;
