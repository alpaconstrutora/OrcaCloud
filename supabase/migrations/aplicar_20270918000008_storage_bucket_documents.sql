-- ============================================================
-- Migration: aplicar_20270918000008_storage_bucket_documents.sql
-- SEGURANÇA — parte do achado C3-07 (média) da auditoria de 2026-09-01
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md § Fase 4.2
--
-- PROBLEMA
-- O bucket `documents` é PÚBLICO e estava sem nenhuma restrição:
-- allowed_mime_types NULL e file_size_limit NULL. A Edge Function
-- partner-portal-upload grava nele com o content-type informado pelo CLIENTE
-- (`contentType: file.type`), o que permitia publicar text/html arbitrário numa
-- URL do domínio de storage da organização — útil para phishing e para hospedar
-- carga maliciosa com ar de legitimidade.
--
-- Esta migration fecha a metade que é de configuração. A outra metade — validar
-- que o `contractId` pertence ao workspace do token e não confiar em
-- `file.type` — é o item 2.12 do plano, na Edge Function.
--
-- SEGURO PARA O CONTEÚDO EXISTENTE
-- As duas restrições valem para uploads NOVOS; não invalidam objeto já gravado.
-- Levantamento do que há hoje no bucket, antes de escolher os limites:
--     application/pdf  20 arquivos  (maior: 5101 kB)
--     image/png         9 arquivos  (maior:   11 MB)
-- A allowlist abaixo cobre os dois, e o limite de 50 MB (mesmo de `opura-docs`)
-- deixa folga de 4x sobre o maior arquivo atual.
-- ============================================================

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
           'application/pdf',
           'image/png', 'image/jpeg', 'image/webp', 'image/gif'
       ],
       file_size_limit = 52428800   -- 50 MiB, igual ao bucket opura-docs
 WHERE id = 'documents';

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_mimes text[];
    v_limite bigint;
    v_publico boolean;
    v_fora int;
BEGIN
    SELECT allowed_mime_types, file_size_limit, public
      INTO v_mimes, v_limite, v_publico
      FROM storage.buckets WHERE id = 'documents';

    IF v_mimes IS NULL OR v_limite IS NULL THEN
        RAISE EXCEPTION 'C3-07: bucket documents continua sem allowed_mime_types ou file_size_limit';
    END IF;

    IF 'text/html' = ANY(v_mimes) THEN
        RAISE EXCEPTION 'C3-07: text/html nao pode estar na allowlist de um bucket publico';
    END IF;

    -- Nenhum arquivo já existente pode ficar fora da allowlist escolhida.
    SELECT count(*) INTO v_fora
      FROM storage.objects
     WHERE bucket_id = 'documents'
       AND metadata->>'mimetype' IS NOT NULL
       AND NOT (metadata->>'mimetype' = ANY(v_mimes));

    IF v_fora > 0 THEN
        RAISE EXCEPTION 'C3-07: % arquivo(s) ja existente(s) ficariam fora da allowlist', v_fora;
    END IF;

    RAISE NOTICE 'C3-07 (storage) OK: bucket documents com % tipos permitidos e limite de % bytes.',
        array_length(v_mimes, 1), v_limite;
    IF v_publico THEN
        RAISE NOTICE 'ATENCAO: bucket documents segue PUBLICO — tornar privado com URL assinada e decisao a parte.';
    END IF;
END $$;
