-- Folhas FECHADAS também: cada resultado na folha da org DO COLABORADOR
-- (11/10/2026)
--
-- Continuação de `aplicar_20271011000900` (que corrigiu só folhas abertas com
-- destino aberto). Decisão do usuário: "corrigir folha mesmo fechada". Sobravam
-- 14 resultados cruzados em 04, 05 e 06/2026 (folhas abertas e fechadas).
--
-- ⚠️ O FINANCEIRO NÃO É TOCADO. Palavras do usuário: "Uma coisa e gerar folha na
-- organizacao correta. outra é qual conta será paga [...] Um colaborador pode ser
-- de uma organizacao mas prestar servico para outra e ser pago por uma conta de
-- outra organizacao." Nenhum internal_transactions é apagado, movido ou
-- regerado aqui — inclusive o adiantamento de 05/2026 do Rogério, pago por PIX
-- da conta da Garden e conciliado. NÃO resincronizar o financeiro dessas folhas
-- por causa desta migration: o sync de LABOR apaga e recria todos os
-- lançamentos da folha, e o vínculo de conciliação cai junto (CASCADE).
--
-- Mesma regra de 0900, sem excluir destino fechado:
--   · destino já tem o colaborador → DUPLICATA: apaga a cópia da org errada
--     (fica a da org dele, mesmo quando os valores divergem — 06/2026 Clovis e
--     Rogério; a cópia descartada fica na reversão);
--   · senão → MOVE resultado e itens; se faltar ciclo, cria (status copiado).
--   · eventos sempre vão para o ciclo da org do colaborador.
-- Valores preservados: move linha, não recalcula.
--
-- Reversão: public.folha_org_colaborador_reversao_20261011 (de 0900) — não apagar.
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `db push`. Idempotente.

BEGIN;

CREATE TEMP TABLE plano ON COMMIT DROP AS
SELECT DISTINCT r.id AS origem_run, pr.employee_id, e.org_id AS emp_org,
       r.start_date, r.end_date, r.type, r.subtype, r.status,
       (SELECT d.id FROM public.payroll_runs d
         WHERE d.org_id = e.org_id AND d.start_date = r.start_date AND d.type = r.type
           AND coalesce(d.subtype, '') = coalesce(r.subtype, '')
         ORDER BY d.created_at LIMIT 1) AS destino_run
  FROM public.payroll_results pr
  JOIN public.payroll_runs r ON r.id = pr.payroll_run_id
  JOIN public.employees e    ON e.id = pr.employee_id
 WHERE e.org_id <> r.org_id;

ALTER TABLE plano ADD COLUMN ciclo_criado boolean NOT NULL DEFAULT false,
                  ADD COLUMN ja_no_destino boolean;

WITH faltam AS (
    SELECT DISTINCT ON (emp_org, start_date, type, coalesce(subtype, ''))
           emp_org, start_date, end_date, type, subtype, status
      FROM plano WHERE destino_run IS NULL
     ORDER BY emp_org, start_date, type, coalesce(subtype, '')
), novos AS (
    INSERT INTO public.payroll_runs (org_id, start_date, end_date, status, type, subtype)
    SELECT emp_org, start_date, end_date, status, type, subtype FROM faltam
    RETURNING id, org_id, start_date, type, subtype
)
UPDATE plano p SET destino_run = n.id, ciclo_criado = true
  FROM novos n
 WHERE p.destino_run IS NULL AND n.org_id = p.emp_org AND n.start_date = p.start_date
   AND n.type = p.type AND coalesce(n.subtype, '') = coalesce(p.subtype, '');

UPDATE plano p SET
    ja_no_destino = EXISTS (SELECT 1 FROM public.payroll_results x
                             WHERE x.payroll_run_id = p.destino_run AND x.employee_id = p.employee_id);

INSERT INTO public.folha_org_colaborador_reversao_20261011
       (acao, origem_run, destino_run, employee_id, results, items, events, ciclo_criado)
SELECT CASE WHEN p.ja_no_destino THEN 'DUPLICATA'
            WHEN p.ciclo_criado  THEN 'MOVIDO_CICLO_NOVO'
            ELSE 'MOVIDO' END,
       p.origem_run, p.destino_run, p.employee_id,
       (SELECT jsonb_agg(to_jsonb(x)) FROM public.payroll_results x WHERE x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id),
       (SELECT jsonb_agg(to_jsonb(x)) FROM public.payroll_items   x WHERE x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id),
       (SELECT jsonb_agg(to_jsonb(x)) FROM public.payroll_events  x WHERE x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id),
       p.ciclo_criado
  FROM plano p;

UPDATE public.payroll_events ev
   SET payroll_run_id = p.destino_run, org_id = p.emp_org
  FROM plano p
 WHERE ev.payroll_run_id = p.origem_run AND ev.employee_id = p.employee_id;

DELETE FROM public.payroll_items i USING plano p
 WHERE p.ja_no_destino AND i.payroll_run_id = p.origem_run AND i.employee_id = p.employee_id;
DELETE FROM public.payroll_results x USING plano p
 WHERE p.ja_no_destino AND x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id;

UPDATE public.payroll_items i SET payroll_run_id = p.destino_run
  FROM plano p
 WHERE NOT p.ja_no_destino AND i.payroll_run_id = p.origem_run AND i.employee_id = p.employee_id;
UPDATE public.payroll_results x SET payroll_run_id = p.destino_run
  FROM plano p
 WHERE NOT p.ja_no_destino AND x.payroll_run_id = p.origem_run AND x.employee_id = p.employee_id;

COMMIT;
