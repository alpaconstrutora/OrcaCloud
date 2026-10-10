-- Tributos por parcela, valor líquido e retenção pelo cliente (10/10/2026)
-- Plano: docs/planos/2026-10-10-tributos-liquido-retencao.md
--
-- Aplicar com `npx supabase db query --linked -f <este arquivo>` — NUNCA `db push`.
-- Idempotente: pode rodar de novo.
--
-- O valor líquido NÃO é gravado em lugar nenhum. `internal_transactions.amount`
-- continua sendo o bruto (a DRE usa o bruto e 10 origens de sync regravam o
-- amount). O líquido é calculado na hora a partir dos tributos ligados à parcela,
-- por funções de campo computado do PostgREST:
--   select('id, amount, valor_esperado')
-- Assim nunca fica desatualizado quando o tributo ou a parcela é regerada.

SET lock_timeout = '5s';

-- 1. Negociação: quais tributos o cliente retém na fonte (chaves de
--    taxPayableService: 'pis', 'cofins', 'inss'). Nulo/vazio = nenhum retido
--    = conciliação pelo bruto, como sempre foi.
ALTER TABLE public.commercial_deals
    ADD COLUMN IF NOT EXISTS tributos_retidos text[];
COMMENT ON COLUMN public.commercial_deals.tributos_retidos IS
    'Tributos retidos pelo cliente na fonte (pis/cofins/inss). O tributo retido nasce com business_status RETIDO e a parcela concilia pelo valor líquido (valor_esperado).';

-- 2. Tributo → parcela de origem. Nulo em tudo que não é tributo.
ALTER TABLE public.internal_transactions
    ADD COLUMN IF NOT EXISTS parcela_id uuid;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'internal_transactions_parcela_id_fkey') THEN
        ALTER TABLE public.internal_transactions
            ADD CONSTRAINT internal_transactions_parcela_id_fkey
            FOREIGN KEY (parcela_id) REFERENCES public.internal_transactions(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_internal_transactions_parcela_id
    ON public.internal_transactions (parcela_id) WHERE parcela_id IS NOT NULL;
COMMENT ON COLUMN public.internal_transactions.parcela_id IS
    'Só em tributo (party_type TAX): a parcela a receber sobre a qual ele incide. Gravado por taxPayableService.generateForDeal.';

-- 3. Campos computados. SECURITY INVOKER: a RLS de quem lê vale também para
--    os tributos somados.
CREATE OR REPLACE FUNCTION public.tributos_da_parcela(it public.internal_transactions)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(sum(t.amount), 0)
      FROM public.internal_transactions t
     WHERE t.parcela_id = it.id
       AND t.party_type = 'TAX'
       AND t.status <> 'CANCELLED';
$$;

CREATE OR REPLACE FUNCTION public.tributos_retidos_da_parcela(it public.internal_transactions)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(sum(t.amount), 0)
      FROM public.internal_transactions t
     WHERE t.parcela_id = it.id
       AND t.party_type = 'TAX'
       AND t.status <> 'CANCELLED'
       AND t.business_status = 'RETIDO';
$$;

-- Valor que o banco de fato credita: bruto menos o que o cliente retém.
CREATE OR REPLACE FUNCTION public.valor_esperado(it public.internal_transactions)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN it.direction = 'CREDIT'
                THEN it.amount - public.tributos_retidos_da_parcela(it)
                ELSE it.amount END;
$$;

-- REGRA #7: função nova nasce sem PUBLIC e sem anon.
REVOKE ALL ON FUNCTION public.tributos_da_parcela(public.internal_transactions) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tributos_retidos_da_parcela(public.internal_transactions) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.valor_esperado(public.internal_transactions) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tributos_da_parcela(public.internal_transactions) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tributos_retidos_da_parcela(public.internal_transactions) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.valor_esperado(public.internal_transactions) TO authenticated, service_role;

-- 4. Backfill do vínculo tributo → parcela (só o vínculo; valor e status
--    intocados). reference_id do tributo = tax-{dealId}-{sufixo}-{chave};
--    a parcela é {contrato}-{sufixo} (recorrente), {contrato}{sufixo} (`:pN`),
--    {contrato} (à vista, sufixo vazio) ou tx-{dealId}-{sufixo} (legado).
WITH trib AS (
    SELECT t.id, t.organization_id, t.contract_id,
           substring(t.reference_id from 5 for 36) AS deal_id,
           substring(t.reference_id from
               '^tax-.{36}-(.*)-(pis|cofins|inss|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$') AS sufixo
      FROM public.internal_transactions t
     WHERE t.party_type = 'TAX' AND t.reference_id LIKE 'tax-%' AND t.parcela_id IS NULL
),
alvo AS (
    SELECT tr.id AS tributo_id, p.id AS parcela_id
      FROM trib tr
      JOIN public.internal_transactions p
        ON p.organization_id = tr.organization_id
       AND p.direction = 'CREDIT'
       AND p.reference_id = ANY (ARRAY[
             tr.contract_id::text || '-' || tr.sufixo,
             tr.contract_id::text || tr.sufixo,
             'tx-' || tr.deal_id || '-' || tr.sufixo])
     WHERE tr.sufixo IS NOT NULL
)
UPDATE public.internal_transactions t
   SET parcela_id = a.parcela_id
  FROM (SELECT DISTINCT ON (tributo_id) tributo_id, parcela_id FROM alvo ORDER BY tributo_id) a
 WHERE t.id = a.tributo_id;

-- 5. Conciliação em grupo: a soma dos lançamentos é o que o banco credita
--    (valor_esperado), não o bruto. Única linha alterada da versão lida do
--    banco em 10/10/2026 (aplicar_20270929000030): o SELECT de v_sum_int.
--    O corpo inteiro está em aplicar_20271010005001_fn_reconcile_group_valor_esperado.sql.
