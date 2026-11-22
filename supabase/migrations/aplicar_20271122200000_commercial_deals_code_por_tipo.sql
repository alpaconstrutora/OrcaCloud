-- Código da negociação único POR SÉRIE: (organização, tipo, código).
--
-- 22/11/2026 — "Erro ao salvar negociação: duplicate key value violates unique
-- constraint idx_commercial_deals_org_code" ao criar uma LOCAÇÃO.
--
-- O índice nasceu em 20270912000003 quando só Venda (type=SALE) tinha código:
-- (organização, código). Depois a Nomenclatura passou a numerar também a
-- Locação, como série PRÓPRIA — RENTAL_DEAL tem contador e máscara separados
-- de SALE_DEAL (document_number_counters, chave org+doc_type+scope). Com as duas
-- séries na mesma máscara (4 dígitos, sem prefixo), a locação nº 5 recebe
-- "0005", que já é o código da venda nº 5 — e o índice recusa. Medido na Alpa
-- Construtora: vendas 0002…0012, contador RENTAL_DEAL em 5, nenhuma locação
-- com código.
--
-- Unicidade por série é o que os contadores já garantem; o índice passa a
-- espelhar isso. O código da negociação não alimenta nenhuma outra máscara
-- (não é variável da Nomenclatura) e nada busca negociação só pelo código —
-- venda 0005 e locação 0005 são documentos de séries diferentes, como pedido
-- 0005 e cotação 0005.
--
-- type é NOT NULL. Troca numa transação: a trava nunca fica ausente.

SET lock_timeout = '5s';

BEGIN;

DROP INDEX IF EXISTS public.idx_commercial_deals_org_code;

CREATE UNIQUE INDEX idx_commercial_deals_org_code
    ON public.commercial_deals (
        COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
        type,
        code
    )
    WHERE code IS NOT NULL AND code <> '';

COMMIT;
