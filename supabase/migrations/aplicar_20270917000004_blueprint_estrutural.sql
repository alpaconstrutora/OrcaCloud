-- ═══════════════════════════════════════════════════════════════════════════
-- Planta Inteligente — grupo Estrutural (kernel 0.9.0)
--
-- Plano: docs/planos/2026-08-30-planta-inteligente-estrutural.md
-- Pedido: "implemente novos objetos e agrupe-os em Grupo chamado Estrutural com
--          Pilar, Viga, Laje, estaca, Bloco de coroamento, Viga de Fundação"
--
-- O kernel ganhou a família `structures`, que viaja DENTRO do payload canônico.
-- Do lado do banco isso muda duas coisas, e só duas:
--
--   1. `blueprint_objects.object_type` precisa aceitar 'STRUCTURAL'.
--   2. `fn_blueprint_publish_snapshot` precisa explodir `payload->'structures'`
--      como já faz com paredes, aberturas, limites e ambientes.
--
-- `blueprint_snapshots.payload` é JSONB e não muda de forma: o payload inteiro
-- já cabe lá. `blueprint_branches.draft_payload` idem. Por isso nenhuma tabela
-- nova, e nenhuma coluna nova.
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` — ver CLAUDE.md, seção Banco de dados.
--
-- IDEMPOTENTE: pode rodar duas vezes sem estragar nada.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. `object_type` aceita 'STRUCTURAL' ───────────────────────────────────
--
-- O CHECK original é INLINE e sem nome (foundation, linha 162), então o Postgres
-- o batizou sozinho. Descobrir o nome em vez de adivinhá-lo é o que faz esta
-- migration rodar tanto num banco criado pela foundation quanto num que já
-- tenha passado por aqui: o `DO` derruba o que existir sobre a coluna e o
-- `ADD` recria com nome explícito, para a próxima não precisar procurar.

DO $$
DECLARE
    v_nome TEXT;
BEGIN
    FOR v_nome IN
        SELECT c.conname
          FROM pg_constraint c
         WHERE c.conrelid = 'public.blueprint_objects'::regclass
           AND c.contype  = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%object_type%'
    LOOP
        EXECUTE format('ALTER TABLE public.blueprint_objects DROP CONSTRAINT %I', v_nome);
    END LOOP;
END $$;

ALTER TABLE public.blueprint_objects
    ADD CONSTRAINT blueprint_objects_object_type_check
    CHECK (object_type IN ('WALL','OPENING','BOUNDARY','SPACE','STRUCTURAL'));

-- ─── 2. A publicação explode também as estruturas ───────────────────────────
--
-- `CREATE OR REPLACE` da função inteira: plpgsql não tem como emendar um laço
-- no meio de um corpo já criado. O texto abaixo é o da foundation com UM bloco
-- novo, o das estruturas, logo depois do de ambientes.
--
-- `length_mm` fica NULL na estrutura de propósito: a coluna existe para a
-- parede, e uma viga tem comprimento de eixo enquanto um pilar tem altura —
-- guardar os dois na mesma coluna faria uma consulta somar coisas diferentes.
-- Quem precisar do número lê de `props`, que carrega o item canônico inteiro.

CREATE OR REPLACE FUNCTION public.fn_blueprint_publish_snapshot(
    p_branch_id      UUID,
    p_base_revision  INTEGER,
    p_hash           TEXT,
    p_kernel_version TEXT,
    p_payload        JSONB,
    p_notes          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_study_id     UUID;
    v_org_id       UUID;
    v_current_rev  INTEGER;
    v_next_rev     INTEGER;
    v_snapshot_id  UUID;
    v_existing     UUID;
    v_item         JSONB;
    v_idx          INTEGER;
BEGIN
    -- FOR UPDATE serializa publicações concorrentes no mesmo ramo.
    SELECT b.study_id, b.organization_id, b.base_revision
      INTO v_study_id, v_org_id, v_current_rev
      FROM public.blueprint_branches b
     WHERE b.id = p_branch_id
       FOR UPDATE;

    IF v_study_id IS NULL THEN
        RAISE EXCEPTION 'blueprint: ramo % não encontrado', p_branch_id
          USING ERRCODE = 'no_data_found';
    END IF;

    -- Idempotência (PRD CA-07): republicar o MESMO conteúdo sobre a MESMA
    -- revisão devolve o snapshot que já existe, sem criar duplicata.
    SELECT s.id INTO v_existing
      FROM public.blueprint_snapshots s
     WHERE s.branch_id = p_branch_id
       AND s.revision  = v_current_rev
       AND s.hash      = p_hash;

    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- Concorrência otimista (PRD §12.4 / CA-05): recusa em vez de sobrescrever.
    IF p_base_revision IS DISTINCT FROM v_current_rev THEN
        RAISE EXCEPTION
          'blueprint: revisão desatualizada (enviou %, ramo está em %)',
          p_base_revision, v_current_rev
          USING ERRCODE = 'serialization_failure';
    END IF;

    v_next_rev := v_current_rev + 1;

    INSERT INTO public.blueprint_snapshots (
        study_id, branch_id, organization_id, revision,
        hash, kernel_version, payload, notes, published_by
    ) VALUES (
        v_study_id, p_branch_id, v_org_id, v_next_rev,
        p_hash, p_kernel_version, p_payload, p_notes, auth.uid()
    )
    RETURNING id INTO v_snapshot_id;

    -- Explodir o payload para consulta. `ordinality` dá o índice canônico
    -- (1-based no SQL, normalizado para 0-based).
    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'walls','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, length_mm)
        VALUES (
            v_snapshot_id, v_org_id, 'WALL', v_idx, (v_item->>'level')::INTEGER, v_item,
            ROUND(sqrt(
                power((v_item->'b'->>'x')::NUMERIC - (v_item->'a'->>'x')::NUMERIC, 2) +
                power((v_item->'b'->>'y')::NUMERIC - (v_item->'a'->>'y')::NUMERIC, 2)
            ))::INTEGER
        );
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'openings','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, props)
        VALUES (v_snapshot_id, v_org_id, 'OPENING', v_idx, v_item);
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'boundaries','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props)
        VALUES (v_snapshot_id, v_org_id, 'BOUNDARY', v_idx, (v_item->>'level')::INTEGER, v_item);
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'spaces','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, area_mm2)
        VALUES (
            v_snapshot_id, v_org_id, 'SPACE', v_idx, (v_item->>'level')::INTEGER, v_item,
            (v_item->>'areaMm2')::BIGINT
        );
    END LOOP;

    -- ESTRUTURA (kernel 0.9.0). `COALESCE` para '[]' não é só defesa: a chave
    -- `structures` é OMITIDA do payload canônico quando o desenho não tem
    -- nenhuma peça — de propósito, para que o hash das plantas antigas não
    -- mude. Sem o COALESCE, publicar uma planta só de paredes estouraria aqui.
    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'structures','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props)
        VALUES (v_snapshot_id, v_org_id, 'STRUCTURAL', v_idx, (v_item->>'level')::INTEGER, v_item);
    END LOOP;

    -- O ramo avança e o rascunho é descartado: ele já virou snapshot.
    UPDATE public.blueprint_branches
       SET base_revision        = v_next_rev,
           parent_snapshot_id   = v_snapshot_id,
           draft_payload        = NULL,
           draft_hash           = NULL,
           draft_kernel_version = NULL,
           draft_saved_at       = NULL
     WHERE id = p_branch_id;

    UPDATE public.blueprint_studies
       SET status = 'PUBLICADO'
     WHERE id = v_study_id AND status <> 'ARQUIVADO';

    INSERT INTO public.blueprint_audit_events
        (organization_id, study_id, actor, action, target_type, target_id, metadata)
    VALUES (
        v_org_id, v_study_id, auth.uid(), 'SNAPSHOT_PUBLICADO', 'SNAPSHOT', v_snapshot_id,
        jsonb_build_object(
            'revision', v_next_rev, 'hash', p_hash, 'kernel_version', p_kernel_version
        )
    );

    RETURN v_snapshot_id;
END;
$$;

-- `CREATE OR REPLACE` PRESERVA os privilégios existentes, mas repetir o REVOKE
-- é barato e fecha o caso de a função ter sido recriada por outro caminho.
-- Ver a memória `feedback_rpc_revoke_public_default`: RPC nova nasce executável
-- por PUBLIC, e este banco tem `anon` ativo.
REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) TO authenticated;

COMMIT;
