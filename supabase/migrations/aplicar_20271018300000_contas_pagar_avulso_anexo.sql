-- ============================================================================
-- Contas a Pagar › Pagamento avulso — anexo do título
-- Plano: docs/planos/2026-10-17-contas-a-pagar-pagamento-avulso.md (item 1)
--
-- O título avulso é uma linha de internal_transactions com source_system='MANUAL'
-- (nenhuma tabela nova). O que faltava era onde guardar o documento — nota,
-- recibo, comprovante. Diferente de BOLETO/NFE/CONTRACT_*, o lançamento manual
-- não tem documento de origem em outra tabela: o arquivo é dele mesmo, então o
-- caminho mora na própria linha.
--
-- Parcelas de um mesmo avulso compartilham o arquivo (mesmo documento_path);
-- quem apaga o objeto do bucket é o app, e só quando nenhuma linha aponta mais
-- para ele.
--
-- APLICAR com `npx supabase db query --linked -f <este arquivo>` — nunca db push.
-- Idempotente: pode rodar de novo.
-- ============================================================================

SET lock_timeout = '5s';

-- 1. Colunas -----------------------------------------------------------------
ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS documento_path TEXT,
    ADD COLUMN IF NOT EXISTS documento_nome TEXT;

COMMENT ON COLUMN public.internal_transactions.documento_path IS
    'Lançamento MANUAL (pagamento avulso): caminho do documento no bucket financeiro-anexos ({org}/avulso/{grupo}/{arquivo}). Parcelas do mesmo avulso compartilham o caminho. Outras origens resolvem o documento pela origem (source_system + reference_id), não por aqui.';
COMMENT ON COLUMN public.internal_transactions.documento_nome IS
    'Nome original do arquivo em documento_path, para exibir e baixar.';

-- 2. Bucket privado -------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'financeiro-anexos',
    'financeiro-anexos',
    false,       -- privado: só abre por URL assinada no clique
    20971520,    -- 20 MiB — nota/recibo/comprovante, não projeto
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
   SET public             = EXCLUDED.public,
       file_size_limit    = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Policies: a 1ª pasta do caminho é a organização, e só membro dela entra.
--    Uma condição só por policy, sem perna OR (REGRA #7, pergunta 1).
DROP POLICY IF EXISTS "financeiro_anexos_select" ON storage.objects;
CREATE POLICY "financeiro_anexos_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'financeiro-anexos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

DROP POLICY IF EXISTS "financeiro_anexos_insert" ON storage.objects;
CREATE POLICY "financeiro_anexos_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'financeiro-anexos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

DROP POLICY IF EXISTS "financeiro_anexos_update" ON storage.objects;
CREATE POLICY "financeiro_anexos_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'financeiro-anexos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    )
    WITH CHECK (
        bucket_id = 'financeiro-anexos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

DROP POLICY IF EXISTS "financeiro_anexos_delete" ON storage.objects;
CREATE POLICY "financeiro_anexos_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'financeiro-anexos'
        AND public.is_org_member((storage.foldername(storage.objects.name))[1]::uuid)
    );

-- 4. vw_payables — definição viva lida do banco em 17/10/2026
--    (pg_get_viewdef), com as colunas novas acrescentadas NO FIM: CREATE OR
--    REPLACE VIEW só aceita coluna nova depois das existentes.
--    security_invoker continua ligado (a RLS de internal_transactions vale).
CREATE OR REPLACE VIEW public.vw_payables
WITH (security_invoker = on) AS
 SELECT it.id,
    it.organization_id,
    it.source_system,
    it.reference_id,
    it.transaction_date,
    it.due_date,
    it.amount,
    it.direction,
    it.description,
    it.category,
    it.status,
    it.business_status,
    it.party_id,
    it.party_name,
    it.party_type,
    it.entity_name,
    it.supplier_id,
    it.project_id,
    it.cost_center_id,
    it.plano_de_contas_id,
    it.property_id,
    it.property_allocation_mode,
    it.created_at,
    it.updated_at,
        CASE
            WHEN it.status = 'CONCILIATED'::text AND (COALESCE(it.business_status, 'PREVISTO'::text) <> ALL (ARRAY['PARCIAL'::text, 'RENEGOCIADO'::text])) THEN 'PAGO'::text
            WHEN (COALESCE(it.business_status, 'PREVISTO'::text) = ANY (ARRAY['PREVISTO'::text, 'EMITIDO'::text, 'ENVIADO'::text, 'APROVADO'::text])) AND it.due_date IS NOT NULL AND it.due_date < CURRENT_DATE THEN 'VENCIDO'::text
            ELSE COALESCE(it.business_status, 'PREVISTO'::text)
        END AS effective_status,
    p.name AS project_name,
    cp.name AS property_name,
    o.obra_id,
    o.obra_name,
    -- novas (pagamento avulso): o que o formulário de edição precisa reabrir
    it.documento_path,
    it.documento_nome,
    it.category_id,
    it.payment_account_id,
    it.payment_type,
    it.payment_date,
    it.competencia_date,
    it.installment_type
   FROM internal_transactions it
     LEFT JOIN projects p ON p.id = it.project_id
     LEFT JOIN commercial_properties cp ON cp.id = it.property_id
     LEFT JOIN vw_project_obra o ON o.project_id = it.project_id
  WHERE it.direction = 'DEBIT'::text AND it.status <> 'CANCELLED'::text AND it.entry_type IS DISTINCT FROM 'CONTRA'::text;

NOTIFY pgrst, 'reload schema';
