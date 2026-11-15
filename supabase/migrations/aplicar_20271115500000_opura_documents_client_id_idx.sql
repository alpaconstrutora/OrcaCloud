-- Meus Clientes › aba Documentos (15/11/2026).
-- Plano: docs/planos/2026-11-15-cliente-aba-documentos.md
--
-- Os documentos do cliente moram no GED (opura_documents.client_id, coluna que
-- existe desde 20261122000000_opura_docs.sql). A aba do cliente e o checklist da
-- negociação consultam `client_id IN (...)`; sem índice a coluna não tinha
-- nenhum. Parcial: quase todo documento do GED não é de cliente.
--
-- Sem policy nem função nova (REGRA #7 não se aplica): a RLS de opura_documents
-- (docs_select_org / docs_write_org, por organização) continua valendo.
-- Aplicar com: npx supabase db query --linked -f <este arquivo>  (nunca db push)

CREATE INDEX IF NOT EXISTS idx_opura_documents_client_id
    ON public.opura_documents (client_id)
    WHERE client_id IS NOT NULL;
