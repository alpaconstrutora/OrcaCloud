-- ═══════════════════════════════════════════════════════════════════════════
-- Planta Inteligente — TELHADO (kernel 0.12.0)
--
-- Plano: docs/planos/2026-09-04-planta-inteligente-telhado.md
-- Pedido: "vamos com o telhado" — primeiro item da Etapa 2 do roadmap BIM.
--
-- O kernel ganhou a família `roofs`, a ÁGUA: um plano inclinado de cobertura,
-- que viaja DENTRO do payload canônico. Do lado do banco isso muda duas coisas,
-- e só duas — a mesma forma da migration do grupo Estrutural
-- (`aplicar_20270917000004`):
--
--   1. `blueprint_objects.object_type` precisa aceitar 'ROOF'.
--   2. `fn_blueprint_publish_snapshot` precisa explodir `payload->'roofs'` como
--      já faz com paredes, aberturas, limites, ambientes e estruturas — com o
--      `element_uid` lido de `identity.roofs`, como as demais desde
--      `aplicar_20270918000030`.
--
-- `blueprint_snapshots.payload` é JSONB e não muda de forma: o payload inteiro
-- já cabe lá. `blueprint_branches.draft_payload` idem. Por isso NENHUMA tabela
-- nova, e NENHUMA coluna nova.
--
-- ⚠️ `area_mm2` fica NULL na água, de propósito. A coluna existe para o
-- AMBIENTE, e a água tem DUAS áreas que importam — a projetada e a real
-- (inclinada), que diferem 4,4% a 30% e 41% a 45°. Gravar uma delas na coluna
-- genérica faria uma consulta somar telhado com piso e não dizer qual das duas
-- áreas entrou na conta. Quem precisa do número lê de `props` (que carrega o
-- item canônico inteiro: contorno, inclinação, beiral, cota) ou do
-- quantitativo, que é onde as duas convivem nomeadas.
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` — ver CLAUDE.md, seção Banco de dados.
--
-- IDEMPOTENTE: pode rodar duas vezes sem estragar nada. Blocos separados, cada
-- um com `lock_timeout`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. `object_type` aceita 'ROOF' ─────────────────────────────────────────
--
-- O CHECK é substituído inteiro, e o `DO` derruba o que existir sobre a coluna
-- antes: é o mesmo idioma de `aplicar_20270917000004`, e é o que faz esta
-- migration rodar tanto num banco que já passou por ela quanto num que não.
SET lock_timeout = '5s';

DO $do$
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
END $do$;

ALTER TABLE public.blueprint_objects
    ADD CONSTRAINT blueprint_objects_object_type_check
    CHECK (object_type IN ('WALL','OPENING','BOUNDARY','SPACE','STRUCTURAL','ROOF'));

-- ─── 2. A publicação explode também as águas ────────────────────────────────
--
-- `CREATE OR REPLACE` da função inteira: plpgsql não tem como emendar um laço
-- no meio de um corpo já criado. O texto abaixo é o de
-- `aplicar_20270918000030` com UM bloco novo, o das águas, logo depois do de
-- estruturas.
SET lock_timeout = '5s';

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
    -- revisão devolve o snapshot que já existe, sem criar duplicata. Como o
    -- hash é só da geometria, republicar com uids diferentes também cai aqui —
    -- identidade não é conteúdo (ver `canonical.ts`).
    SELECT s.id INTO v_existing
      FROM public.blueprint_snapshots s
     WHERE s.branch_id = p_branch_id
       AND s.revision  = v_current_rev
       AND s.hash      = p_hash;

    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- Concorrência otimista (PRD §12.4 / CA-05): recusa em vez de sobrescrever.
    --
    -- ⚠️ `restrict_violation` (23001), NÃO `serialization_failure` (40001).
    -- `aplicar_20270905000001` já tinha corrigido isto: o PostgREST trata 40001
    -- como retentável e reexecuta a transação em laço; como repetir nunca
    -- resolve, o cliente pendurava até o timeout de 20 s. O texto de
    -- `aplicar_20270917000004` (estrutural) recriou a função com 40001 de volta
    -- — regressão que só não apareceu porque `blueprintService` também casa a
    -- MENSAGEM. Aqui volta o código certo, que é o que o serviço testa primeiro.
    IF p_base_revision IS DISTINCT FROM v_current_rev THEN
        RAISE EXCEPTION
          'blueprint: revisão desatualizada (enviou %, ramo está em %)',
          p_base_revision, v_current_rev
          USING ERRCODE = 'restrict_violation';
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
    -- (1-based no SQL, normalizado para 0-based) — o MESMO índice que endereça
    -- `identity.<família>`.
    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'walls','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, length_mm, element_uid)
        VALUES (
            v_snapshot_id, v_org_id, 'WALL', v_idx, (v_item->>'level')::INTEGER, v_item,
            ROUND(sqrt(
                power((v_item->'b'->>'x')::NUMERIC - (v_item->'a'->>'x')::NUMERIC, 2) +
                power((v_item->'b'->>'y')::NUMERIC - (v_item->'a'->>'y')::NUMERIC, 2)
            ))::INTEGER,
            p_payload #>> ARRAY['identity','walls', v_idx::TEXT]
        );
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'openings','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, props, element_uid)
        VALUES (
            v_snapshot_id, v_org_id, 'OPENING', v_idx, v_item,
            p_payload #>> ARRAY['identity','openings', v_idx::TEXT]
        );
    END LOOP;

    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'boundaries','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, element_uid)
        VALUES (
            v_snapshot_id, v_org_id, 'BOUNDARY', v_idx, (v_item->>'level')::INTEGER, v_item,
            p_payload #>> ARRAY['identity','boundaries', v_idx::TEXT]
        );
    END LOOP;

    -- SPACE: o uid gravado é o da ETIQUETA que nomeia o ambiente (ou NULL).
    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'spaces','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, area_mm2, element_uid)
        VALUES (
            v_snapshot_id, v_org_id, 'SPACE', v_idx, (v_item->>'level')::INTEGER, v_item,
            (v_item->>'areaMm2')::BIGINT,
            p_payload #>> ARRAY['identity','spaces', v_idx::TEXT]
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
            (snapshot_id, organization_id, object_type, object_index, level_index, props, element_uid)
        VALUES (
            v_snapshot_id, v_org_id, 'STRUCTURAL', v_idx, (v_item->>'level')::INTEGER, v_item,
            p_payload #>> ARRAY['identity','structures', v_idx::TEXT]
        );
    END LOOP;

    -- TELHADO (kernel 0.12.0). `COALESCE` para '[]' pela MESMA razão de
    -- `structures`: a chave `roofs` é OMITIDA do payload canônico quando o
    -- desenho não tem cobertura — de propósito, para que o hash das plantas
    -- antigas não mude. Sem o COALESCE, publicar uma casa sem telhado estouraria
    -- aqui.
    FOR v_item, v_idx IN
        SELECT value, ord - 1 FROM jsonb_array_elements(COALESCE(p_payload->'roofs','[]'::jsonb))
          WITH ORDINALITY AS t(value, ord)
    LOOP
        INSERT INTO public.blueprint_objects
            (snapshot_id, organization_id, object_type, object_index, level_index, props, element_uid)
        VALUES (
            v_snapshot_id, v_org_id, 'ROOF', v_idx, (v_item->>'level')::INTEGER, v_item,
            p_payload #>> ARRAY['identity','roofs', v_idx::TEXT]
        );
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

-- ─── 3. Privilégios ─────────────────────────────────────────────────────────
--
-- `CREATE OR REPLACE` PRESERVA os privilégios existentes, mas repetir o REVOKE
-- é barato e fecha o caso de a função ter sido recriada por outro caminho.
-- REGRA OBRIGATÓRIA #7: o Postgres concede EXECUTE a PUBLIC por padrão.
SET lock_timeout = '5s';

REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) TO authenticated;

-- ─── 4. Conferência (só leitura; rodar por último e sozinha) ────────────────
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'blueprint_objects_object_type_check';
-- SELECT position('roofs' in pg_get_functiondef('public.fn_blueprint_publish_snapshot'::regproc)) > 0;
