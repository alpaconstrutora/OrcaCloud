-- ═══════════════════════════════════════════════════════════════════════════
-- Planta Inteligente — identidade persistente de elemento (`element_uid`)
--
-- Plano: docs/planos/2026-09-04-planta-inteligente-identidade-e-ifc.md
-- Pedido: "o que falta implementar para transformar o modulo planta
--          inteligente em um BIM completo" — Etapa 1, Bloco A.
--
-- O kernel passou a dar a cada elemento um `uid` que sobrevive a autosave,
-- publish e reload (ver `utils/blueprintKernel/identity.ts`). O payload canônico
-- ganhou a chave de topo `identity`, com um array por família PARALELO ao array
-- geométrico (mesma ordem canônica). Ela fica FORA do hash — `p_hash` continua
-- sendo o SHA-256 só da geometria, e por isso o `kernel_version` NÃO mudou.
--
-- Do lado do banco isto muda duas coisas:
--
--   1. `blueprint_objects` ganha `element_uid`, para consultar "esta parede" entre
--      versões sem desserializar payload nenhum (é a coluna que o 4D, a ponte com
--      a ferragem e o comentário ancorado vão referenciar).
--   2. `fn_blueprint_publish_snapshot` grava essa coluna lendo
--      `p_payload #>> '{identity,<família>,<índice>}'` em cada INSERT.
--
-- SEM BACKFILL, de propósito. Snapshot publicado antes daqui não tem `identity`
-- no payload; o kernel deriva uids determinísticos ao RELER (hash:família:índice)
-- e o primeiro autosave os grava. Reimplementar essa derivação em SQL seria uma
-- segunda verdade para o mesmo número. As linhas antigas ficam com
-- `element_uid IS NULL`, e os índices abaixo são parciais por isso.
--
-- ⚠️ APLICAR COM `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` — ver CLAUDE.md, seção Banco de dados.
--
-- IDEMPOTENTE: pode rodar duas vezes sem estragar nada. Blocos separados, cada
-- um com `lock_timeout`, para um DDL preso não segurar os demais — lição de
-- `feedback_worktree…`/`blueprint-e0-persistencia` (deadlock com o editor aberto).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. A coluna ─────────────────────────────────────────────────────────────
SET lock_timeout = '5s';

ALTER TABLE public.blueprint_objects
    ADD COLUMN IF NOT EXISTS element_uid TEXT;

COMMENT ON COLUMN public.blueprint_objects.element_uid IS
    'uid persistente do elemento (UUID em texto), vindo de payload.identity.<família>[object_index]. '
    'NULL em snapshot publicado antes de 04/09/2026 (payload sem identity). '
    'Em SPACE é o uid da ETIQUETA que nomeia o ambiente — ambiente é derivado e não tem uid próprio.';

-- ─── 2. Índices ──────────────────────────────────────────────────────────────
--
-- UNIQUE por snapshot: um uid, um elemento — é o mesmo invariante que o kernel
-- impõe (`DUPLICATE_UID`), agora também no schema. Parcial porque as linhas
-- antigas são NULL e NULL não colide.
--
-- Por organização: "histórico desta parede em todas as versões" é a consulta
-- que o 4D e a ferragem vão fazer, e ela sempre vem recortada por org (RLS).
SET lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS blueprint_objects_snapshot_uid_key
    ON public.blueprint_objects (snapshot_id, element_uid)
    WHERE element_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blueprint_objects_org_uid
    ON public.blueprint_objects (organization_id, element_uid)
    WHERE element_uid IS NOT NULL;

-- ─── 3. A publicação grava o uid ─────────────────────────────────────────────
--
-- `CREATE OR REPLACE` da função inteira: plpgsql não tem como emendar um INSERT
-- no meio de um corpo já criado. O texto é o de `aplicar_20270917000004` com
-- `element_uid` em cada INSERT e nada mais. Sem parâmetro novo: a identidade
-- viaja dentro do próprio `p_payload`.
--
-- `#>>` com caminho em ARRAY de texto devolve NULL tanto quando a chave
-- `identity` não existe (payload antigo reenviado tal qual) quanto quando a
-- posição traz JSON `null` (elemento sem uid, ou ambiente sem etiqueta) — os
-- dois casos significam "sem identidade" e caem na mesma coluna NULL.
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

-- ─── 4. Privilégios ──────────────────────────────────────────────────────────
--
-- `CREATE OR REPLACE` PRESERVA os privilégios existentes, mas repetir o REVOKE
-- é barato e fecha o caso de a função ter sido recriada por outro caminho.
-- REGRA OBRIGATÓRIA #7: o Postgres concede EXECUTE a PUBLIC por padrão.
SET lock_timeout = '5s';

REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_blueprint_publish_snapshot(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT) TO authenticated;

-- ─── 5. Conferência (só leitura; rodar por último e sozinha) ─────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'blueprint_objects' AND column_name = 'element_uid';
-- SELECT indexname FROM pg_indexes
--  WHERE tablename = 'blueprint_objects' AND indexname LIKE '%uid%';
