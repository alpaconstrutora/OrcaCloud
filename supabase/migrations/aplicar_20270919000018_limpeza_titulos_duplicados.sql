-- ==========================================================================
-- Limpeza dos títulos duplicados já gravados + trava definitiva no boleto
-- Date: 2026-09-06 · Plano: docs/planos/2026-09-05-titulos-duplicados-por-sincronizacao.md
--
-- ⚠️ JÁ APLICADA EM PRODUÇÃO em 06/09/2026, sob o prefixo ANTIGO
--    `aplicar_20270919000017_limpeza_titulos_duplicados.sql`. Renumerada para 000018
--    porque a frente de arquivos IFC chegou antes ao 000017 — quem chega depois move.
--    NÃO reaplicar: os blocos 1 e 2 mexem em JSON e status. Resultado provado no plano:
--    479→418 transações no cofre, 112 títulos cancelados, 68 boletos marcados,
--    16 órfãos de folha zerados, índice único criado.
-- ==========================================================================
-- As causas foram corrigidas no código (commit e4fd443 e o desta leva). Esta
-- migration trata o passado, que o código não desfaz.
--
-- PRINCÍPIO: nada é APAGADO. Título vira CANCELLED, boleto vira 'cancelado' com
-- `duplicado_de` apontando para o original. Tudo reversível, tudo auditável.
-- A única exclusão é dentro do JSON do cofre comercial, e ela é obrigatória: o
-- espelho recria o título a partir dali (financialSyncService usa o `id` do JSON
-- como `reference_id`), então cancelar o título sem limpar o JSON seria inútil.
--
-- ABORTA se encontrar qualquer excedente conciliado com o extrato ou com data de
-- pagamento — nesse caso a decisão é humana, não de migration.
--
-- Medido em produção em 05-06/09/2026:
--   COMMERCIAL  61 títulos excedentes            R$  36.600,00
--   BOLETO      67 boletos excedentes            R$ 117.911,57  (61 grupos idênticos)
--   LABOR       16 títulos órfãos de folha apagada  R$ 6.814,90
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '10s';

-- ──────────────────────────────────────────────────────────────────────────
-- Guarda geral: nenhum excedente pode estar conciliado ou pago
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_conc int; v_pago int;
BEGIN
    WITH g AS (
      SELECT organization_id, source_system, amount, direction, transaction_date, description,
             array_agg(id ORDER BY created_at, id) ids
        FROM public.internal_transactions WHERE status='PENDING' AND source_system='COMMERCIAL'
       GROUP BY 1,2,3,4,5,6 HAVING count(*)>1
    ), excedentes AS (
      SELECT i.id FROM g JOIN public.internal_transactions i ON i.id = ANY(g.ids[2:])
    )
    SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = e.id)),
           count(*) FILTER (WHERE (SELECT payment_date FROM public.internal_transactions x WHERE x.id = e.id) IS NOT NULL)
      INTO v_conc, v_pago
      FROM excedentes e;

    IF v_conc > 0 OR v_pago > 0 THEN
        RAISE EXCEPTION 'ABORTADO: % excedente(s) conciliado(s) e % com pagamento. Decisão humana.', v_conc, v_pago;
    END IF;
    RAISE NOTICE 'Guarda: nenhum excedente comercial conciliado ou pago.';
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Bloco 1 — COMMERCIAL: JSON do cofre e títulos espelhados
-- ──────────────────────────────────────────────────────────────────────────
-- Ordem importa: descobrir os títulos a cancelar (mais antigo de cada grupo fica),
-- tirar do JSON as entradas correspondentes, e só então cancelar os títulos.
DROP TABLE IF EXISTS tmp_comm_excedentes;
CREATE TEMP TABLE tmp_comm_excedentes AS
WITH g AS (
  SELECT organization_id, source_system, amount, direction, transaction_date, description,
         array_agg(id ORDER BY created_at, id) ids
    FROM public.internal_transactions
   WHERE status = 'PENDING' AND source_system = 'COMMERCIAL'
   GROUP BY 1,2,3,4,5,6 HAVING count(*) > 1
)
SELECT i.id, i.reference_id, i.organization_id, i.amount
  FROM g JOIN public.internal_transactions i ON i.id = ANY(g.ids[2:]);

DO $$
DECLARE n int; v numeric;
BEGIN
    SELECT count(*), coalesce(sum(amount),0) INTO n, v FROM tmp_comm_excedentes;
    RAISE NOTICE 'Bloco 1: % títulos comerciais excedentes, R$ %', n, v;
END $$;

-- 1.a Remove do JSON do cofre as transações cujo id é reference_id de um excedente.
DO $$
DECLARE r record; n_total int := 0; n_proj int;
BEGIN
    FOR r IN
        SELECT p.id,
               jsonb_array_length(coalesce(p.settings->'financialInfo'->'transactions','[]'::jsonb)) AS antes
          FROM public.projects p
         WHERE coalesce(p.settings->'financialInfo'->'transactions','[]'::jsonb) <> '[]'::jsonb
    LOOP
        UPDATE public.projects p
           SET settings = jsonb_set(
                 p.settings,
                 '{financialInfo,transactions}',
                 coalesce((
                   SELECT jsonb_agg(t ORDER BY ord)
                     FROM jsonb_array_elements(p.settings->'financialInfo'->'transactions')
                          WITH ORDINALITY AS x(t, ord)
                    WHERE NOT EXISTS (
                      SELECT 1 FROM tmp_comm_excedentes e WHERE e.reference_id = (x.t->>'id')
                    )
                 ), '[]'::jsonb))
         WHERE p.id = r.id;

        SELECT r.antes - jsonb_array_length(coalesce(p.settings->'financialInfo'->'transactions','[]'::jsonb))
          INTO n_proj FROM public.projects p WHERE p.id = r.id;
        IF n_proj > 0 THEN
            RAISE NOTICE 'Bloco 1: projeto % perdeu % entrada(s) duplicada(s) do JSON', r.id, n_proj;
            n_total := n_total + n_proj;
        END IF;
    END LOOP;
    RAISE NOTICE 'Bloco 1: % entradas removidas do JSON no total', n_total;
END $$;

-- 1.b Cancela os títulos espelhados.
DO $$
DECLARE n int;
BEGIN
    UPDATE public.internal_transactions i
       SET status = 'CANCELLED'
      FROM tmp_comm_excedentes e
     WHERE i.id = e.id AND i.status = 'PENDING';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Bloco 1: % títulos comerciais cancelados', n;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Bloco 2 — BOLETO: marca duplicata pela LINHA DIGITÁVEL
-- ──────────────────────────────────────────────────────────────────────────
-- A identidade do boleto é a linha digitável (FEBRABAN). Mesmo valor e vencimento
-- NÃO servem: um condomínio tem dezenas de unidades pagando igual no mesmo dia.
DROP TABLE IF EXISTS tmp_boleto_dup;
CREATE TEMP TABLE tmp_boleto_dup AS
SELECT b.id,
       b.status,
       b.valor,
       first_value(b.id) OVER (PARTITION BY b.organization_id, b.linha_digitavel
                               ORDER BY b.created_at, b.id) AS original_id,
       row_number()      OVER (PARTITION BY b.organization_id, b.linha_digitavel
                               ORDER BY b.created_at, b.id) AS rn
  FROM public.boletos b
 WHERE b.linha_digitavel IS NOT NULL AND b.linha_digitavel <> '';

DELETE FROM tmp_boleto_dup WHERE rn = 1;

DO $$
DECLARE n int; v numeric; n_pago int;
BEGIN
    SELECT count(*), coalesce(sum(valor),0), count(*) FILTER (WHERE status='pago')
      INTO n, v, n_pago FROM tmp_boleto_dup;
    RAISE NOTICE 'Bloco 2: % boletos excedentes, R$ % — dos quais % marcados como PAGO', n, v, n_pago;
END $$;

-- 2.a Todos ganham a referência ao original. É o que a coluna `duplicado_de`
--     sempre existiu para registrar, e nunca foi preenchida.
DO $$
DECLARE n int;
BEGIN
    UPDATE public.boletos b SET duplicado_de = d.original_id
      FROM tmp_boleto_dup d WHERE b.id = d.id AND b.duplicado_de IS DISTINCT FROM d.original_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Bloco 2: % boletos apontam para o original em duplicado_de', n;
END $$;

-- 2.b Só os NÃO pagos são cancelados. Boleto pago é fato consumado: se a cópia
--     está paga, ou houve pagamento em duplicidade ou a baixa caiu na cópia
--     errada. Nos dois casos a decisão é humana; aqui fica só o registro.
DO $$
DECLARE n int; n_pago int;
BEGIN
    UPDATE public.boletos b SET status = 'cancelado'
      FROM tmp_boleto_dup d
     WHERE b.id = d.id AND b.status IN ('rascunho', 'revisao', 'aprovado', 'programado');
    GET DIAGNOSTICS n = ROW_COUNT;

    SELECT count(*) INTO n_pago FROM tmp_boleto_dup WHERE status = 'pago';
    RAISE NOTICE 'Bloco 2: % boletos cancelados; % PAGOS preservados para conferência humana', n, n_pago;
END $$;

-- 2.c Títulos financeiros dos boletos cancelados saem das pendências.
DO $$
DECLARE n int;
BEGIN
    UPDATE public.internal_transactions i SET status = 'CANCELLED'
     WHERE i.source_system = 'BOLETO'
       AND i.status = 'PENDING'
       AND EXISTS (SELECT 1 FROM tmp_boleto_dup d JOIN public.boletos b ON b.id = d.id
                    WHERE b.id::text = i.reference_id AND b.status = 'cancelado')
       AND NOT EXISTS (SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = i.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Bloco 2: % títulos de boleto duplicado cancelados', n;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Bloco 3 — LABOR: títulos de folha que foi apagada
-- ──────────────────────────────────────────────────────────────────────────
-- `payrollService.deleteRun` apagava a folha, os itens e os resultados, mas deixava
-- os lançamentos em Contas a Pagar. Sem a folha, ninguém consegue explicar a origem
-- deles. Corrigido no código; aqui ficam os que já existiam.
DO $$
DECLARE n int; v numeric;
BEGIN
    WITH orfaos AS (
      SELECT i.id, i.amount
        FROM public.internal_transactions i
       WHERE i.source_system = 'LABOR'
         AND i.status = 'PENDING'
         AND i.reference_id LIKE 'labor-%'
         AND substring(i.reference_id from 'labor-([0-9a-f-]{36})') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.payroll_runs r
            WHERE r.id::text = substring(i.reference_id from 'labor-([0-9a-f-]{36})'))
         AND NOT EXISTS (
           SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = i.id)
    )
    SELECT count(*), coalesce(sum(amount),0) INTO n, v FROM orfaos;
    RAISE NOTICE 'Bloco 3: % títulos de folha órfãos, R$ %', n, v;

    UPDATE public.internal_transactions i SET status = 'CANCELLED'
     WHERE i.source_system = 'LABOR'
       AND i.status = 'PENDING'
       AND i.reference_id LIKE 'labor-%'
       AND substring(i.reference_id from 'labor-([0-9a-f-]{36})') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.payroll_runs r
          WHERE r.id::text = substring(i.reference_id from 'labor-([0-9a-f-]{36})'))
       AND NOT EXISTS (
         SELECT 1 FROM public.reconciliation_matches m WHERE m.internal_transaction_id = i.id);
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Bloco 4 — A trava: um boleto por linha digitável, por organização
-- ──────────────────────────────────────────────────────────────────────────
-- PARCIAL de propósito: exclui quem já está marcado como duplicata, para que os
-- registros do Bloco 2 possam continuar existindo (inclusive os pagos, que não
-- foram cancelados). Inserção nova nunca traz `duplicado_de`, então cai na trava.
-- Falha aqui significa que sobrou colisão — e é para falhar mesmo.
CREATE UNIQUE INDEX IF NOT EXISTS boletos_org_linha_digitavel_uq
    ON public.boletos (organization_id, linha_digitavel)
 WHERE duplicado_de IS NULL AND linha_digitavel IS NOT NULL AND linha_digitavel <> '';

COMMENT ON INDEX public.boletos_org_linha_digitavel_uq IS
    'A linha digitável é a identidade FEBRABAN do boleto. Parcial: quem tem duplicado_de preenchido é uma duplicata já reconhecida e fica de fora.';

DROP TABLE IF EXISTS tmp_comm_excedentes;
DROP TABLE IF EXISTS tmp_boleto_dup;
