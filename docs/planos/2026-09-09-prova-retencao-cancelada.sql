-- DEFEITO 1 — a retenção do parceiro tem de bater com o ledger interno.
-- Duas medições: uma VIVA (R$ 25 retidos) e uma CANCELADA (R$ 10 retidos).
-- Sem a correção o parceiro somaria 35 e o ledger 25 — o teste só vale porque
-- os dois números SERIAM diferentes. Tudo dentro de ROLLBACK.
BEGIN;

INSERT INTO contract_measurements
    (id, contract_id, number, period_start, period_end, measurement_date, status,
     total_value, retention_value, net_value, notes)
VALUES
    ('11111111-2222-3333-4444-555555555555',
     '389bc525-81b9-4d92-a6bf-1044f43794ee', 997, '2026-08-01', '2026-08-31', '2026-08-31',
     'Processada', 500.00, 25.00, 475.00, 'PROVA temporaria - dentro de ROLLBACK'),
    ('11111111-2222-3333-4444-666666666666',
     '389bc525-81b9-4d92-a6bf-1044f43794ee', 998, '2026-09-01', '2026-09-09', '2026-09-09',
     'Cancelada', 200.00, 10.00, 190.00, 'PROVA temporaria - dentro de ROLLBACK');

SELECT
    -- o que o parceiro vê AGORA (núcleo corrigido)
    (public.partner_ws_financials('80bd4626-83bb-445b-86f3-948c4e3fa974')
        -> 'retention' ->> 'retained')::numeric        AS parceiro_retido,
    -- o que o ledger interno diz (fonte que valida a liberação)
    l.total_retained                                    AS ledger_retido,
    -- o que a conta ANTIGA daria (sem excluir Cancelada) — se este número for
    -- igual ao de cima, a prova não vale: não haveria divergência a corrigir
    (SELECT COALESCE(SUM(m.retention_value), 0) FROM contract_measurements m
      WHERE m.contract_id = '389bc525-81b9-4d92-a6bf-1044f43794ee') AS conta_antiga,
    ((public.partner_ws_financials('80bd4626-83bb-445b-86f3-948c4e3fa974')
        -> 'retention' ->> 'retained')::numeric = l.total_retained)  AS batem_agora,
    ((SELECT COALESCE(SUM(m.retention_value), 0) FROM contract_measurements m
       WHERE m.contract_id = '389bc525-81b9-4d92-a6bf-1044f43794ee') <> l.total_retained)
                                                        AS antiga_divergia
FROM public.fn_contract_retention_ledger('389bc525-81b9-4d92-a6bf-1044f43794ee') l;

ROLLBACK;
