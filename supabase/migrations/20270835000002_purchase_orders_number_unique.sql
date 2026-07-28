-- Trava de unicidade do número do pedido.
--
-- Só faz sentido DEPOIS do backfill (20270835000001): antes, os números eram
-- Date.now().slice(-6), que colide de verdade quando dois pedidos são criados
-- no mesmo milissegundo.
--
-- Se houver duplicata legada, esta migration ABORTA e lista os números
-- repetidos em vez de criar o índice pela metade. Resolva os casos apontados
-- (renumerando ou apagando o pedido errado) e rode de novo.

SET lock_timeout = '5s';

DO $CHECK$
DECLARE
    v_dups TEXT;
BEGIN
    SELECT string_agg(number || ' (' || cnt || 'x)', ', ' ORDER BY number)
    INTO v_dups
    FROM (
        SELECT number, COUNT(*) AS cnt
        FROM public.purchase_orders
        WHERE number IS NOT NULL
        GROUP BY number
        HAVING COUNT(*) > 1
    ) d;

    IF v_dups IS NOT NULL THEN
        RAISE EXCEPTION
            'Não é possível criar o índice único: existem pedidos com número repetido → %', v_dups
            USING HINT = 'Renumere ou remova os pedidos duplicados e rode esta migration novamente.';
    END IF;
END;
$CHECK$;

-- NULL não conflita com NULL no Postgres, então pedidos sem número (se houver)
-- não travam a criação — e passam a ser o único caso de número não-único.
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_number_unique
    ON public.purchase_orders (number)
    WHERE number IS NOT NULL;
