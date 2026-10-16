-- ============================================================
-- Processos — a instância passa a se ligar ao TÍTULO financeiro e ao BOLETO
-- Plano: docs/planos/2026-10-16-torre-fluxo-financeiro.md (item C.2)
--
-- Pedido (16/10/2026): fluxo do Financeiro em canvas, como a Torre P2P, com
-- eventos novos no motor de Processos (`boleto.approved`, `payable.approved`,
-- `payable.settled`, `receivable.settled` — emitidos pelos services, ver
-- `ProcessEventKey` em types/process.ts).
--
-- `process_instances` só sabia se ligar a obra, fornecedor, cliente, contrato
-- e pedido (`20270103000000_processos_module_fase0.sql`). Um processo que nasce
-- de um título (folha, tributo, boleto avulso, recebível) não tinha onde guardar
-- de onde veio — nem como `processService.triggerEvent` evitar a 2ª instância
-- quando o mesmo título é baixado por dois caminhos (painel e conciliação). O
-- pedido usa `purchase_order_id` para isso; o título passa a usar
-- `internal_transaction_id`, e o boleto `boleto_id`.
--
-- ON DELETE SET NULL, como os vínculos que já existem: apagar o título não
-- apaga o histórico do processo.
--
-- SEM policy (a linha continua recortada por `organization_id`), SEM função,
-- SEM seed de modelo (o usuário cria o gatilho pelo canvas). Idempotente.
--
-- ⚠️ O front só manda as colunas no INSERT quando há valor
-- (`processService.startInstance`), então publicar o código antes desta
-- migration não quebra os processos do P2P — só os eventos financeiros ficam
-- sem abrir instância até ela ser aplicada.
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA db push.
-- ============================================================

SET lock_timeout = '5s';

ALTER TABLE public.process_instances
    ADD COLUMN IF NOT EXISTS internal_transaction_id UUID
        REFERENCES public.internal_transactions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS boleto_id UUID
        REFERENCES public.boletos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.process_instances.internal_transaction_id IS
    'Título financeiro de origem (eventos payable.* / receivable.* / boleto.approved). Chave de idempotência por modelo em processService.triggerEvent.';
COMMENT ON COLUMN public.process_instances.boleto_id IS
    'Boleto de origem (evento boleto.approved).';

-- Índices parciais: a maioria das instâncias não tem título nem boleto, e a
-- consulta de idempotência filtra por (modelo, título) com status não terminal.
CREATE INDEX IF NOT EXISTS process_instances_internal_tx_idx
    ON public.process_instances (internal_transaction_id, process_template_id)
    WHERE internal_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS process_instances_boleto_idx
    ON public.process_instances (boleto_id, process_template_id)
    WHERE boleto_id IS NOT NULL;
