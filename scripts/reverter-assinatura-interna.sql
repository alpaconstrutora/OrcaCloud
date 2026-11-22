-- scripts/reverter-assinatura-interna.sql
-- REVERSÃO de supabase/migrations/aplicar_20271122100000_assinatura_interna.sql
--
-- ⚠️ SÓ COM AUTORIZAÇÃO EXPLÍCITA DO USUÁRIO. Apaga a trilha de assinaturas
-- (envelopes, signatários, eventos) e os documentos das negociações. Os arquivos
-- do bucket `assinaturas` NÃO são apagados aqui (storage se limpa pela API).
-- Fica fora de supabase/migrations de propósito: não é migration, é saída de emergência.

BEGIN;

DROP TRIGGER IF EXISTS trg_cdv_nova_versao_cancela_assinatura ON public.contract_document_versions;
DROP TRIGGER IF EXISTS trg_cdv_nao_apaga_assinado_no_portal ON public.contract_document_versions;

DROP FUNCTION IF EXISTS public.assinatura_validar(uuid);
DROP FUNCTION IF EXISTS public.fn_broker_portal_assinaturas(text);
DROP FUNCTION IF EXISTS public.fn_portal_assinaturas(text);
DROP FUNCTION IF EXISTS public._assinatura_lista_json(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.assinatura_cancelar(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.assinatura_concluir(uuid, text, text);
DROP FUNCTION IF EXISTS public.assinatura_confirmar(uuid, text, text, uuid, text, text, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.assinatura_registrar_codigo(uuid, text, text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.assinatura_ver(uuid, text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.assinatura_criar(uuid, text, uuid, text, text, text, int, jsonb, uuid, int);

DROP TABLE IF EXISTS public.assinatura_eventos;
DROP TABLE IF EXISTS public.assinatura_segredos;
DROP TABLE IF EXISTS public.assinatura_signatarios;
DROP TABLE IF EXISTS public.assinatura_envelopes;
DROP TABLE IF EXISTS public.commercial_deal_documents;

DROP FUNCTION IF EXISTS public._assinatura_cancelar_por_nova_versao();
DROP FUNCTION IF EXISTS public.cdv_nao_apaga_assinado_no_portal();
DROP FUNCTION IF EXISTS public._assinatura_autorizar(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public._assinatura_vencer(uuid);
DROP FUNCTION IF EXISTS public._assinatura_projetar(uuid, text);
DROP FUNCTION IF EXISTS public._assinatura_evento(uuid, uuid, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public._assinatura_cpf_mascarado(text);
DROP FUNCTION IF EXISTS public._assinatura_cpf_valido(text);
DROP FUNCTION IF EXISTS public.assinatura_envelopes_imutavel();
DROP FUNCTION IF EXISTS public.assinatura_signatarios_imutavel();
DROP FUNCTION IF EXISTS public.assinatura_eventos_imutavel();
DROP FUNCTION IF EXISTS public.assinatura_eventos_encadear();
DROP FUNCTION IF EXISTS public.commercial_deal_documents_nao_apaga_assinado();
DROP FUNCTION IF EXISTS public.commercial_deal_documents_coerencia();

ALTER TABLE public.contract_document_versions DROP CONSTRAINT IF EXISTS cdv_signature_provider_check;
ALTER TABLE public.contract_document_versions DROP COLUMN IF EXISTS signature_provider;
ALTER TABLE public.contract_document_versions DROP COLUMN IF EXISTS assinatura_envelope_id;

DELETE FROM storage.buckets WHERE id = 'assinaturas'
   AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'assinaturas');

COMMIT;
