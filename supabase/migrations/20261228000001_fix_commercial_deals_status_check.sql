-- Atualiza o check constraint de status em commercial_deals para incluir
-- todos os estágios do workflow atual (RESERVA, CONTRATO, ASSINATURA, WAITING_PAYMENT legado)
ALTER TABLE public.commercial_deals DROP CONSTRAINT IF EXISTS commercial_deals_status_check;

ALTER TABLE public.commercial_deals ADD CONSTRAINT commercial_deals_status_check
    CHECK (status IN (
        'IN_NEGOTIATION',
        'PENDING',
        'WAITING_PAYMENT',
        'RESERVA',
        'CONTRATO',
        'ASSINATURA',
        'COMPLETED',
        'CANCELLED'
    ));
