-- ============================================================================
-- Rateio FECHADO libera UMA coluna: o vínculo com o recebível da cobrança
-- Plano: docs/planos/2026-09-23-condominio-financeiro-cobranca-travada.md
--
-- ── O defeito ───────────────────────────────────────────────────────────────
-- `condominioCobrancaService.gerarRecebiveis` exige rateio FECHADO (só rateio
-- fechado vira cobrança) e, para cada cota, faz:
--
--     UPDATE condominio_rateio_itens SET transaction_id = <recebível> WHERE id = ...
--
-- A trava `trg_rateio_itens_protege` (migration aplicar_20270905000024) recusa
-- QUALQUER UPDATE em item de rateio fechado. Então o segundo passo do módulo —
-- "Gerar cobrança" — nunca pôde funcionar. Medido em produção em 23/09/2026:
-- 5 rateios, 0 fechados, 0 cobranças, 0 recebíveis. Ninguém chegou lá.
--
-- Pior que falhar, a ordem das operações deixava LIXO: o recebível é inserido
-- em `internal_transactions` ANTES do vínculo, então a primeira cota virava um
-- recebível órfão em Contas a Receber e o retry batia 23505 em
-- `internal_transactions_org_ref_key` (o reference_id é determinístico:
-- `{item}-p{vencimento}`). O service ganhou compensação no mesmo commit; esta
-- migration tira a causa.
--
-- ── Por que liberar só `transaction_id` ─────────────────────────────────────
-- O que a trava protege é o VALOR que virou base de cobrança: se a cota muda
-- depois, o boleto emitido deixa de bater com o que o sistema diz. O ponteiro
-- para o recebível não é isso — é o registro de que a cobrança aconteceu, e ele
-- só pode ser escrito DEPOIS do fechamento, porque é o fechamento que autoriza
-- cobrar. Travar a coluna que só existe para ser preenchida nesse momento é
-- travar o próprio fluxo.
--
-- Todas as outras colunas (valor, peso, unit_id, client_id, rateio_id) seguem
-- travadas, e INSERT/DELETE continuam recusados em rateio fechado — inclusive
-- um UPDATE que mexa em `transaction_id` E em `valor` na mesma sentença, que é
-- a forma óbvia de contornar isso sem querer.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ (o SQL Editor roda o script inteiro como
--    UMA transação: erro no meio desfaz os blocos anteriores).
-- ============================================================================

-- ═══ BLOCO 1 — a trava, com a exceção nomeada ═══════════════════════════════
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_rateio_protege_fechado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_status TEXT;
BEGIN
    -- O desvio por TG_OP vem ANTES de qualquer referência a NEW/OLD de
    -- propósito: num DELETE o registro NEW não existe, e tocá-lo — mesmo do
    -- lado direito de um AND — levanta "record new is not assigned yet". O SQL
    -- não garante avaliação em curto-circuito, então `TG_OP = 'UPDATE' AND
    -- NEW.valor = ...` numa expressão só NÃO é seguro.
    IF TG_OP = 'DELETE' THEN
        SELECT status INTO v_status FROM public.condominio_rateios
         WHERE id = OLD.rateio_id;
        IF v_status = 'FECHADO' THEN
            RAISE EXCEPTION
                'Rateio já fechado: os valores viraram base de cobrança. Cancele o rateio e refaça, em vez de alterar o que já foi comunicado.';
        END IF;
        RETURN OLD;
    END IF;

    SELECT status INTO v_status FROM public.condominio_rateios
     WHERE id = NEW.rateio_id;

    -- `IS DISTINCT FROM` e não `<>`: rateio não encontrado devolve NULL, e
    -- `NULL <> 'FECHADO'` é NULL (não TRUE), o que faria o IF cair para o
    -- RAISE e barrar uma gravação legítima. Mesmo comportamento da versão
    -- anterior desta função, agora explícito.
    IF v_status IS DISTINCT FROM 'FECHADO' THEN
        RETURN NEW;
    END IF;

    -- Fechado: a ÚNICA mudança tolerada é o vínculo com o recebível. Aqui
    -- OLD existe (é UPDATE), e o par NEW/OLD é comparado coluna a coluna —
    -- de novo com `IS NOT DISTINCT FROM`, porque client_id é anulável e
    -- `NULL <> NULL` daria NULL em vez de "iguais".
    IF TG_OP = 'UPDATE'
       AND NEW.rateio_id IS NOT DISTINCT FROM OLD.rateio_id
       AND NEW.unit_id   IS NOT DISTINCT FROM OLD.unit_id
       AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
       AND NEW.peso      IS NOT DISTINCT FROM OLD.peso
       AND NEW.valor     IS NOT DISTINCT FROM OLD.valor
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'Rateio já fechado: os valores viraram base de cobrança. Cancele o rateio e refaça, em vez de alterar o que já foi comunicado.';
END;
$fn$;

-- REGRA #7: o PostgreSQL concede EXECUTE a PUBLIC por padrão, e `GRANT` não
-- revoga esse default. Função de trigger não é chamada por ninguém diretamente
-- — o executor a invoca com os privilégios do dono —, então ela não precisa de
-- GRANT nenhum; precisa do REVOKE.
REVOKE ALL ON FUNCTION public.fn_rateio_protege_fechado() FROM PUBLIC, anon;

-- A trigger em si não muda (BEFORE INSERT OR UPDATE OR DELETE FOR EACH ROW);
-- `CREATE OR REPLACE FUNCTION` já troca o corpo sob ela. Recriada aqui só para
-- o caso de a migration rodar num banco onde ela não exista.
DROP TRIGGER IF EXISTS trg_rateio_itens_protege ON public.condominio_rateio_itens;
CREATE TRIGGER trg_rateio_itens_protege
    BEFORE INSERT OR UPDATE OR DELETE ON public.condominio_rateio_itens
    FOR EACH ROW EXECUTE FUNCTION public.fn_rateio_protege_fechado();

-- ═══ BLOCO 2 — conferência ══════════════════════════════════════════════════
-- Rodar SOZINHO, por último. Reverte tudo pelo RAISE final — não grava nada.
-- Esperado: 'vinculo=PASSOU | valor=BLOQUEADO | insert=BLOQUEADO'
--
-- DO $$
-- DECLARE v_id uuid; v_item uuid; v_vinculo text; v_valor text; v_insert text;
-- BEGIN
--   SELECT id INTO v_id FROM public.condominio_rateios WHERE status='RASCUNHO' LIMIT 1;
--   SELECT id INTO v_item FROM public.condominio_rateio_itens WHERE rateio_id=v_id LIMIT 1;
--   UPDATE public.condominio_rateios SET status='FECHADO', fechado_em=now() WHERE id=v_id;
--
--   BEGIN UPDATE public.condominio_rateio_itens SET transaction_id=NULL WHERE id=v_item;
--         v_vinculo := 'PASSOU';
--   EXCEPTION WHEN others THEN v_vinculo := 'BLOQUEADO'; END;
--
--   BEGIN UPDATE public.condominio_rateio_itens SET valor=valor+1 WHERE id=v_item;
--         v_valor := 'PASSOU';
--   EXCEPTION WHEN others THEN v_valor := 'BLOQUEADO'; END;
--
--   BEGIN INSERT INTO public.condominio_rateio_itens(rateio_id, organization_id, unit_id, peso, valor)
--         SELECT rateio_id, organization_id, unit_id, peso, valor
--           FROM public.condominio_rateio_itens WHERE id=v_item;
--         v_insert := 'PASSOU';
--   EXCEPTION WHEN others THEN v_insert := 'BLOQUEADO'; END;
--
--   RAISE EXCEPTION 'vinculo=% | valor=% | insert=%', v_vinculo, v_valor, v_insert;
-- END $$;
