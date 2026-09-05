-- Diagnóstico para a reimportação controlada dos extratos (plano 2026-09-05, item 1.9).
-- Rodar ANTES e DEPOIS: npx supabase db query --linked -o table -f scripts/conciliacao-diagnostico-reimportacao.sql
-- Somente leitura.
SELECT pa.name AS conta,
       to_char(bt.transaction_date, 'YYYY-MM') AS mes,
       count(*)                                                   AS linhas,
       count(*) FILTER (WHERE bt.status IN ('MATCHED','CONFIRMED','LOCKED')) AS fechadas,
       sum(CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE 0 END)   AS creditos,
       sum(CASE WHEN bt.direction = 'DEBIT'  THEN bt.amount ELSE 0 END)   AS debitos,
       sum(CASE WHEN bt.direction = 'CREDIT' THEN bt.amount ELSE -bt.amount END) AS variacao
  FROM bank_transactions bt
  JOIN payment_accounts pa ON pa.id = bt.bank_account_id
 GROUP BY 1, 2
 ORDER BY 1, 2;
