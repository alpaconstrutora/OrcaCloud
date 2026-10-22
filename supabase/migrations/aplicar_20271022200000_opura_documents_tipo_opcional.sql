-- GED: tipo de documento passa a ser opcional.
--
-- Pedido (22/10/2026): "documentos: retirar bloqueio de tipo de documento para
-- fazer upload em lote". O upload em lote exigia um tipo padrão do lote antes de
-- enviar; sem tipo, o insert caía no NOT NULL. A edição de documento já gravava
-- `tipo_documento: editDocType || null` ao limpar o campo — e também esbarrava
-- aqui. A tabela exibe tipo vazio como "—" (DocumentsTable/texto()).
--
-- Idempotente: DROP NOT NULL em coluna já anulável não faz nada.

ALTER TABLE public.opura_documents ALTER COLUMN tipo_documento DROP NOT NULL;
