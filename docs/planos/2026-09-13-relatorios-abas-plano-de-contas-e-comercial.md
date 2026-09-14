# ÒPURA · Relatórios — abas Plano de Contas, Vendas de Ativos, Locações, Gestão de Locações e Contratos de Serviço

## Pedido original

Sessão 2e718847, 2026-09-13:

> cria novas abas:
> 1. Plano de Contas: Conectar a minha organização < Plano de Contas
> 2. Venda de Ativos: Conectar a comercial < Venda de Ativos
> 3. Locações: Conectar a comercial < Locações
> 4. Gestão de Locações: Conectar a comercial < Gestão de Locações
> 5. Contratos de Serviço: Conectar a comercial < Contratos de Serviço

Decisões tomadas com o usuário (perguntas na mesma sessão):
- "Locações" e "Gestão de Locações" são a mesma tela (o segundo é o título dela). **Locações = uma linha por contrato de locação; Gestão de Locações = uma linha por locatário** (`contracts.client_id`).
- Abas de domínio (Vendas / Locações / Gestão / Serviço) mostram **só** os lançamentos do domínio; totais só do domínio.
- Os **817 tributos** gerados sobre parcelas de locação (`source_system COMMERCIAL`, `reference_id tax-<negociação>-…`) **entram** nas abas: ligados ao contrato da negociação (backfill + gerador grava `contract_id`).
- REVOKE de `anon`/`PUBLIC` nas duas RPCs (`fn_opura_pivot`, `fn_opura_entries`) — tecnicamente correto (REGRA #7); nenhum chamador anônimo. Fecha a dívida registrada em `aplicar_20270915000006`.

## Como cada aba se liga

| Aba | Chave (dim_key) | Rótulo | Filtro |
|---|---|---|---|
| Plano de Contas | `internal_transactions.plano_de_contas_id` | `código · nome` (`plano_de_contas`) | nenhum ("— Sem plano de contas") |
| Vendas de Ativos | `contract_id` | `código da negociação · imóvel` (fallback número · título) | `contracts.domain = 'VENDAS'` |
| Locações | `contract_id` | `número do contrato · imóvel` | `domain = 'LOCACAO'` |
| Gestão de Locações | `contracts.client_id` (locatário) | nome do cliente | `domain = 'LOCACAO'` |
| Contratos de Serviço | `contract_id` | `número · título` | `domain = 'SERVICOS'` |

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20270919000042_opura_dimensoes_plano_contas_e_contratos.sql` | view +8 colunas ao final (plano_de_contas_id/_name, contract_domain, contract_number, contract_client_id/_name, deal_label, property_name) e 4 JOINs; backfill dos tributos; `fn_opura_pivot` com 5 dimensões + `v_domain`; `fn_opura_entries` DROP + CREATE com `p_plano_de_contas_id`, `p_contract_domain`, `p_contract_client_id`; REVOKE/GRANT nas duas; COMMENT; NOTIFY pgrst | dry-run: LOCACAO 1.128 lanc (311 + 817 tributos) / 8 contratos; entries 1 sobrecarga / 25 args; `anon` sem EXECUTE; RPCs rodando como o usuário de leitura. **Aplicada em produção 2026-09-13.** |
| 2 | `services/taxPayableService.ts` | `pushRow` grava `contract_id: contractPrefix ?? null` | typecheck |
| 3 | `services/opuraAnalyticsService.ts` | `OpuraDimension` +5; `OpuraEntryFilters` +3; `entries()` +3 params; `drillFilter` (locatário leva domínio; as de contrato não) | `__tests__/opuraAnalyticsDrill.test.ts` verde |
| 4 | `components/OpuraReports.tsx` | `DIMENSIONS` +5 abas (rótulo "Vendas de Ativos" = menu) | `check-ui-standard` limpo; prints |
| 5 | `__tests__/opuraAnalyticsDrill.test.ts`, `__tests__/components/OpuraReportsAbasComercial.test.tsx` | drill das 5 dimensões, contrato da RPC (25 chaves), abas pedem a dimensão certa, clique abre o extrato com o filtro certo | verdes |

## Verificação feita
- Dry-run SQL em `BEGIN…ROLLBACK` com as checagens acima, depois aplicação real e prova (`pg_proc`, `has_function_privilege`, tributos ligados = 817).
- Navegador (preview local + Playwright, usuário de leitura): 5 abas com dados reais (Vendas 2 linhas; Locações 4; Gestão de Locações 4 locatários; Serviço 1; Plano de Contas 5), extrato aberto em Locações e Gestão de Locações (44 lançamentos), Centrais de Obras/Clientes/Fornecedores carregando com a `fn_opura_entries` nova (Obra: 200 lançamentos no extrato), sem erro JS e sem HTTP ≥ 400.

## Limitações registradas
- Negociação com N compradores/locatários ou N unidades: a aba mostra o principal (`contracts.client_id`, `commercial_deals.property_id`).
- Tributo de negociação com mais de um contrato fica sem `contract_id` (ambíguo). Hoje: 8 negociações / 8 contratos — nenhum caso.
- Tributo de parcela legada (`tx-<negociação>-…`) continua sem contrato.
- 21 abas quebram em duas linhas (`flex-wrap`, §19.1).
