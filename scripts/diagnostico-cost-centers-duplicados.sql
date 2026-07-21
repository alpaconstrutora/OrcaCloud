-- Diagnóstico de Centros de Custo duplicados (somente leitura — nenhum UPDATE/DELETE aqui).
-- Rodar no SQL Editor do Supabase antes de qualquer limpeza.
--
-- Contexto: a tela "Centros de Custo" (Minha Organização) mostra 343 registros,
-- todos aparentemente duplicados (mesmo código e nome repetidos). O código do
-- app (financialRegistryService.listCostCenters) faz um select simples, sem
-- join e sem duplicar em memória — então a duplicação é real, dentro da
-- tabela `cost_centers`. Antes de apagar qualquer linha é preciso confirmar
-- (a) o tamanho exato do problema e (b) se alguma tabela financeira já
-- referencia o id das linhas "perdedoras" (bank_transactions, contracts,
-- invoices, boletos, internal_transactions/DRE, receivables, fpa_scenarios,
-- remuneração societária — ~44 arquivos no repo usam cost_center_id).

-- 1) Quantas linhas duplicadas existem, por organização?
select
    organization_id,
    code,
    name,
    count(*) as qtd,
    array_agg(id order by created_at) as ids
from cost_centers
group by organization_id, code, name
having count(*) > 1
order by organization_id, code;

-- 2) Total de linhas "extra" (as que seriam removidas se mantivéssemos só 1 por grupo)
select
    count(*) - count(distinct (organization_id, code, name)) as linhas_extras
from cost_centers;

-- 3) Para cada duplicata, quais tabelas já têm registros apontando pro id
--    que SERIA removido (todos os ids do grupo, exceto o mais antigo)?
--    Rodar esta consulta por tabela antes de decidir apagar. Ajuste a lista
--    de tabelas conforme o que existir no seu schema (algumas podem não
--    existir dependendo de quais migrations já foram aplicadas).
with dup_groups as (
    select organization_id, code, name, array_agg(id order by created_at) as ids
    from cost_centers
    group by organization_id, code, name
    having count(*) > 1
),
losers as (
    select unnest(ids[2:array_length(ids,1)]) as loser_id
    from dup_groups
)
select 'bank_transactions' as tabela, count(*) from bank_transactions where cost_center_id in (select loser_id from losers)
union all
select 'contracts', count(*) from contracts where cost_center_id in (select loser_id from losers)
union all
select 'invoices', count(*) from invoices where cost_center_id in (select loser_id from losers)
union all
select 'internal_transactions', count(*) from internal_transactions where cost_center_id in (select loser_id from losers)
union all
select 'boletos', count(*) from boletos where cost_center_id in (select loser_id from losers)
union all
select 'fpa_budgets', count(*) from fpa_budgets where cost_center_id in (select loser_id from losers)
union all
select 'partner_compensation_settings', count(*) from partner_compensation_settings where cost_center_id in (select loser_id from losers)
union all
select 'prolabore_payroll_items', count(*) from prolabore_payroll_items where cost_center_id in (select loser_id from losers);

-- 4) As tabelas acima existem só se a migration correspondente já foi aplicada
--    neste banco. Se alguma delas der erro "relation does not exist", remova
--    essa linha do UNION e rode o resto — significa que aquele módulo ainda
--    não foi criado neste ambiente, então não há risco vindo dela.
