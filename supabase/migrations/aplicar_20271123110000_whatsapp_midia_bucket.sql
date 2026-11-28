-- WhatsApp pelo OpenWA — bucket privado dos arquivos que o fornecedor manda
--
-- Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md (Task 5).
-- Depende de: nada (só o storage). Pode ser aplicada antes ou depois de
-- aplicar_20271123100500_whatsapp_openwa.sql.
--
-- ── O que cria ─────────────────────────────────────────────────────────────────
--   • storage.buckets 'whatsapp-midia' — PRIVADO, até 5 MiB por arquivo, só os tipos
--     que o webhook aceita (TIPOS_DE_MIDIA_ACEITOS em utils/whatsappOpenwa.ts):
--     image/jpeg, image/png, image/webp, application/pdf, audio/ogg, audio/mpeg,
--     video/mp4. Caminho: <organization_id | sem-org>/<wa_mensagens.id>/<nome seguro>.
--     Quem grava: só a Edge Function whatsapp-openwa-webhook (service_role).
--     Quem lê: ninguém direto — o link assinado é gerado no servidor na hora de abrir
--     (Edge Function, depois de conferir a organização da mensagem).
--
-- ── REGRA #7 ───────────────────────────────────────────────────────────────────
--   Pergunta 1 (policy): NENHUMA policy em storage.objects para este bucket — nem de
--     leitura, nem de escrita. Com RLS ligada em storage.objects, sem policy = só
--     service_role. A prova abaixo aborta se aparecer policy citando o bucket OU
--     policy de storage.objects que não recorte por bucket_id (valeria para todos os
--     buckets, inclusive este).
--   Pergunta 2 (função): nenhuma função criada.
--   Pergunta 3 (Edge Function): whatsapp-openwa-webhook, verify_jwt = false; o gate é
--     o HMAC do corpo com OPENWA_WEBHOOK_SECRET (ver o cabeçalho da function).
--
-- ── Aplicar ────────────────────────────────────────────────────────────────────
--   npx supabase db query --linked -f supabase/migrations/aplicar_20271123110000_whatsapp_midia_bucket.sql
--   (NUNCA db push). Idempotente: reaplicar só reafirma privado/limite/tipos.
--   De fora:
--     SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'whatsapp-midia';

BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'whatsapp-midia',
    'whatsapp-midia',
    false,                 -- privado: só link assinado gerado no servidor
    5242880,               -- 5 MiB (MIDIA_MAX_BYTES)
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/ogg', 'audio/mpeg', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE
    SET public             = false,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── Provas (abortam a transação se algo não bater) ───────────────────────────
DO $prova$
DECLARE
    v_b   storage.buckets%ROWTYPE;
    v_pol text;
BEGIN
    SELECT * INTO v_b FROM storage.buckets WHERE id = 'whatsapp-midia';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'bucket whatsapp-midia não existe';
    END IF;
    IF v_b.public THEN
        RAISE EXCEPTION 'bucket whatsapp-midia está público';
    END IF;
    IF v_b.file_size_limit IS DISTINCT FROM 5242880 THEN
        RAISE EXCEPTION 'bucket whatsapp-midia com limite % (esperado 5242880)', v_b.file_size_limit;
    END IF;

    SELECT string_agg(policyname, ', ') INTO v_pol
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%whatsapp-midia%';
    IF v_pol IS NOT NULL THEN
        RAISE EXCEPTION 'storage.objects tem policy citando whatsapp-midia (%): o bucket é só service_role', v_pol;
    END IF;

    -- Policy sem bucket_id vale para TODOS os buckets, inclusive este.
    SELECT string_agg(policyname, ', ') INTO v_pol
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%bucket_id%';
    IF v_pol IS NOT NULL THEN
        RAISE EXCEPTION 'storage.objects tem policy sem recorte por bucket_id (%): abriria whatsapp-midia', v_pol;
    END IF;

    RAISE NOTICE 'whatsapp-midia: TUDO OK';
END
$prova$;

COMMIT;
