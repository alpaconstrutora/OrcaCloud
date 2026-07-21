-- Remove Centros de Custo duplicados (mesma organização + código + nome) e
-- trava recorrência com constraint única.
--
-- Diagnóstico confirmou 0 referências às linhas "perdedoras" em
-- bank_transactions, contracts, invoices, internal_transactions, boletos,
-- fpa_budgets, partner_compensation_settings e prolabore_payroll_items —
-- por isso o DELETE abaixo é direto, sem precisar reatribuir FK antes.
-- Mantém a linha mais antiga (menor created_at, com id como tie-break) de
-- cada grupo duplicado.

-- Agrupa também por empresa_id (não só organization_id) porque a coluna
-- existe pra permitir cost centers por empresa dentro do mesmo grupo — o
-- GROUP BY já trata NULL = NULL, então empresa_id nulo em ambas as linhas
-- ainda conta como duplicata.
with dup_groups as (
    select organization_id, empresa_id, code, name, array_agg(id order by created_at, id) as ids
    from public.cost_centers
    group by organization_id, empresa_id, code, name
    having count(*) > 1
),
losers as (
    select unnest(ids[2:array_length(ids, 1)]) as loser_id
    from dup_groups
)
delete from public.cost_centers
where id in (select loser_id from losers);

-- Trava a recorrência: um código não pode se repetir na mesma organização
-- (ou, se cost_center for por empresa, na mesma empresa). Dois índices
-- parciais porque unique index padrão trata NULL <> NULL — sem isso, duas
-- linhas com empresa_id nulo e mesmo código não seriam pegas como duplicata.
create unique index if not exists uq_cost_centers_org_code_sem_empresa
    on public.cost_centers (organization_id, code)
    where code is not null and empresa_id is null;

create unique index if not exists uq_cost_centers_org_empresa_code
    on public.cost_centers (organization_id, empresa_id, code)
    where code is not null and empresa_id is not null;
