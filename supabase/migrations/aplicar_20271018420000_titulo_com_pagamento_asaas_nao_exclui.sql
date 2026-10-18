-- Título com pagamento pela Asaas em andamento ou concluído não se exclui
--
-- Achado em 18/10/2026, ao verificar o "Novo pagamento avulso" (fa957390) antes
-- do primeiro PIX real em produção (plano docs/planos/2026-10-16-asaas-pendencias-e-pix.md).
-- O usuário escolheu corrigir antes do teste.
--
-- O defeito: a linha "Avulso" (source_system MANUAL) tem Excluir sempre ligado, e
-- `supplier_payments.transaction_id` é ON DELETE SET NULL. Excluir o título com um
-- PIX enviado/agendado (ou já concluído e ainda não conciliado com o extrato) apaga
-- o título e só solta o pagamento: o dinheiro sai da conta Asaas, a baixa não
-- acontece e o pagamento fica órfão. A trava fica no banco para valer em qualquer
-- caminho que exclua título (tela, sincronizações), não só no botão.
--
-- Estados que travam: APPROVED (gravado, indo para a Asaas), PENDING, SCHEDULED e
-- DONE. FAILED e CANCELLED não travam — nada saiu.
--
-- REGRA #7, pergunta 1: nenhuma policy nova; a de DELETE de internal_transactions
-- continua decidindo quem exclui (roda antes do gatilho).
-- REGRA #7, pergunta 2: função de gatilho SECURITY DEFINER para enxergar
-- supplier_payments mesmo quando quem exclui não lê a tabela por RLS (a trava não
-- pode depender do que o usuário enxerga). Não devolve dado; REVOKE de EXECUTE junto.

CREATE OR REPLACE FUNCTION public.fn_titulo_com_pagamento_asaas_nao_exclui()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT sp.status INTO v_status
      FROM public.supplier_payments sp
     WHERE sp.transaction_id = OLD.id
       AND sp.status IN ('APPROVED', 'PENDING', 'SCHEDULED', 'DONE')
     ORDER BY (sp.status = 'DONE') DESC
     LIMIT 1;

    IF v_status = 'DONE' THEN
        RAISE EXCEPTION 'Este título foi pago pela Asaas e não pode ser excluído.'
            USING ERRCODE = 'P0001', HINT = 'asaas_pagamento_concluido';
    ELSIF v_status IS NOT NULL THEN
        RAISE EXCEPTION 'Este título tem pagamento pela Asaas em andamento. Cancele o pagamento antes de excluir.'
            USING ERRCODE = 'P0001', HINT = 'asaas_pagamento_em_andamento';
    END IF;
    RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_titulo_com_pagamento_asaas_nao_exclui() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_titulo_com_pagamento_asaas_nao_exclui ON public.internal_transactions;
CREATE TRIGGER trg_titulo_com_pagamento_asaas_nao_exclui
    BEFORE DELETE ON public.internal_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_titulo_com_pagamento_asaas_nao_exclui();
