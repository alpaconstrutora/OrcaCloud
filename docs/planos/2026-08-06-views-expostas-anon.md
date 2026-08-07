# Views expostas a `anon` — 24 views de negócio legíveis sem sessão

## Pedido original

> Sessão: 07fb0a60-ecb1-4723-b1fc-6a00ba334623 · 2026-08-06

Este plano **não** nasceu de um pedido de trabalho. Nasceu de uma verificação de
rotina que deu errado. A sequência literal:

O trabalho da sessão era a F2.2 do plano
`2026-08-06-kpis-locacao-primitivas.md`. Ao conferir se as migrations da Fase 2
tinham sido aplicadas no remoto, sondei as tabelas com a chave publicável — e
`internal_transactions` respondeu com dados. Ao reportar, o usuário mandou as
queries de diagnóstico e, a cada correção aplicada, pediu a verificação seguinte:

> apliquei sim. veirifque novcamente

> aplicado

> aplicado: 20270903000001_vw_receivables_fechar_anon.sql

Foi a terceira verificação que revelou que o problema não era pontual: fechar
`internal_transactions` e `vw_receivables` não fechou o vazamento, porque
`vw_fact_financial_tx` devolve as **mesmas 1.300 linhas** por outra porta.

**Lição que originou este plano:** cada correção verificada revelou a próxima
porta. Fechar uma e declarar resolvido teria sido errado três vezes seguidas.

## Diagnóstico

`pg_class` + `information_schema.role_table_grants` do remoto, 2026-08-06:
**26 views** do schema `public` com `security_invoker = off` **e** `SELECT`
concedido a `anon`. São dois defeitos independentes, e é a combinação que mata:

| Defeito | Consequência |
|---|---|
| `anon` tem `GRANT SELECT` (default do Supabase) | qualquer um com a chave publicável — que vai no bundle do front — consulta a view |
| view roda como o **DONO**, não como quem consulta | ela passa por cima da RLS das tabelas base; trancar a tabela não tranca a view |

O segundo é o que torna o primeiro grave, e é o que explica por que fechar
`internal_transactions` não bastou.

### Exposição medida (não deduzida) — `Content-Range` com a chave publicável

| View | Linhas a `anon` | Leitor no código | Público? |
|---|---|---|---|
| `vw_fact_financial_tx` | **1.300** | nenhum | não |
| `vw_fpa_cashflow_projection` | **558** | `fpaService` | não |
| `vw_commercial_tax_payables` | **108** | `taxPayableService` | não |
| `vw_hr_turnover_trend` | 24 | `hrAnalyticsService` | não |
| `vw_fact_purchase_order` | 18 | nenhum | não |
| `dead_letter_queue` | 15 | nenhum | não |
| `vw_fact_deal` | 13 | nenhum | não |
| `vw_project_cost_comparison` | 12 | `workOrderService`, `OperacionalDashboard` | não |
| `vw_hr_retention_cohorts` | 6 | `hrAnalyticsService` | não |
| `vw_bi_operational` | 3 | nenhum | não |
| `vw_company_consolidated` | 3 | `companyService` | não |
| `vw_journal_entries` | 3 | `diarioService` | não |
| `vw_bi_commercial` | 2 | nenhum | não |
| `vw_bi_supply` | 1 | nenhum | não |
| `pipeline_health` | 1 | `nfeService` | não |
| `retry_candidates`, `vw_communication_read_rate`, `vw_esocial_status_panel`, `vw_fpa_budget_vs_actual`, `vw_hr_productivity_by_project`, `vw_incentive_event_months`, `vw_intercompany_transactions`, `vw_team_hourly_cost`, `tts_apuracao_view` | 0 (tabela vazia) | vários | não |

⚠️ **As de 0 linhas não estão protegidas — estão vazias.** Vazam no dia em que
o módulo correspondente entrar em uso. Tratar igual às demais.

**Fora de escopo:** `geography_columns` e `geometry_columns` pertencem à
extensão PostGIS, são catálogo, e `REVOKE` nelas pode quebrar a extensão. Deixar.

**Já corrigidas** (nesta sessão, antes deste plano): `vw_payables`
(`20270840000001`), `vw_unit_property_map`, `vw_receivables`
(`aplicar_20270903000001`), e a tabela base `internal_transactions`
(`aplicar_20270903000000`, que derrubou `TEMP_BYPASS_ALL_INTERNAL_TXS`).

### O achado que muda o custo do conserto

**Nenhuma das 24 views é lida em contexto público.** Levantamento por `grep` dos
consumidores: todas são chamadas por services do app interno (usuário
autenticado, membro da organização) ou por ninguém — 9 não têm leitor algum.
Não existe o caso difícil de "esta precisa ficar aberta para o portal".

## Fases

A ordem separa **parar o sangramento** de **corrigir o cross-tenant**, porque a
primeira é sem risco e a segunda precisa de teste por tela.

### Fase 1 — `REVOKE anon` nas 24 ⬅️ fazer primeiro

Fecha o acesso anônimo. **Não muda nada para usuário logado**, então não há
regressão possível na aplicação — só deixa de responder a quem não tem sessão.

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/aplicar_20270903000002_views_revoke_anon.sql` | `REVOKE ALL ... FROM anon` (nominal — `FROM PUBLIC` não basta) e `GRANT SELECT TO authenticated` nas 24. Idempotente | `curl` anônimo em cada uma devolve `42501`, e a query de varredura volta com `anon_le = false` para todas |

### Fase 2 — `security_invoker = on`, view por view

Corrige o cross-tenant: hoje um usuário logado de **outra** organização lê tudo
dessas views, porque elas ignoram a RLS das tabelas base.

Precisa de teste por tela, e o risco não é a view esvaziar — é ela ficar
**parcial em silêncio**: uma view que agrega 5 tabelas, com RLS restritiva
demais em uma delas, devolve número menor sem erro nenhum. Por isso não vai em
lote com as outras.

| Grupo | Views | Como sei que terminou |
|---|---|---|
| **Sem leitor** (risco zero) | `vw_fact_*` (3), `vw_bi_*` (3), `dead_letter_queue`, `retry_candidates`, `vw_intercompany_transactions` | `ALTER VIEW` aplicado; nada a testar porque nada as consome |
| **Leitor único, agregação simples** | `pipeline_health`, `vw_commercial_tax_payables`, `vw_communication_read_rate`, `vw_company_consolidated`, `vw_esocial_status_panel`, `vw_incentive_event_months`, `vw_journal_entries`, `tts_apuracao_view` | abrir a tela de cada uma e conferir que o número **bate com antes**, não só que aparece |
| **Agregação multi-tabela** (mais delicado) | `vw_fpa_budget_vs_actual`, `vw_fpa_cashflow_projection`, `vw_hr_*` (3), `vw_project_cost_comparison`, `vw_team_hourly_cost` | anotar o total ANTES, aplicar, conferir que é idêntico. Diferença = RLS de alguma tabela base cortando demais |

### Fase 3 — impedir a reincidência

Toda view nova nasce com `security_invoker = off` e com `GRANT` a `anon`: o
default do Postgres e o default do Supabase, respectivamente. Sem trava, isto
volta — `vw_payables` foi corrigida em `20270840000001` e a irmã
`vw_receivables` ficou aberta mais três meses.

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `scripts/check-view-security.sh` | Falha (exit ≠ 0) se alguma migration criar view sem `security_invoker` e sem `REVOKE ... FROM anon` nominal | roda contra o repo atual sem falso positivo |
| `.github/workflows/ci.yml` | O script entra no CI, como a catraca de `orgContextGuard` | quebra o build num PR que adicione view desprotegida |

## Estado

- [x] Diagnóstico completo, exposição medida view a view
- [x] Consumidores mapeados — nenhum público
- [x] **Fase 1 — APLICADA e VERIFICADA (2026-08-06).** As 24 views devolvem
      `42501 permission denied` à chave publicável, conferidas **uma a uma por
      `curl` de fora do SQL Editor** — 24 fechadas, 0 abertas. Inclui
      `vw_fact_financial_tx`, que era a porta pela qual as 1.300 linhas de
      `internal_transactions` continuavam saindo depois de a tabela ter sido
      trancada.
      **Falta a regressão com sessão:** FP&A, BI, RH, Operacional, Tributos a
      Pagar, Diário e e-Social devem continuar listando. Esta fase não deveria
      mudar nada para usuário logado — se mudou, algum caller está rodando sem
      sessão, e isso é um achado novo.
- [ ] Fase 2 — `security_invoker` (o cross-tenant continua aberto: usuário
      logado de outra organização ainda lê tudo destas 24)
- [ ] Fase 3 — trava no CI

## Verificação

A varredura que fecha cada fase, no SQL Editor:

```sql
SELECT c.relname AS view_name,
       COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                  WHERE option_name = 'security_invoker'), 'off') AS security_invoker,
       EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                WHERE g.table_schema = 'public' AND g.table_name = c.relname
                  AND g.grantee = 'anon' AND g.privilege_type = 'SELECT') AS anon_le
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v' AND n.nspname = 'public'
ORDER BY anon_le DESC, security_invoker, view_name;
```

Fase 1 pronta = nenhuma linha com `anon_le = true` (fora as duas do PostGIS).
Fase 2 pronta = nenhuma com `security_invoker = off`.

⚠️ E a prova final nunca é essa query, é o `curl` anônimo de fora do SQL Editor
— o Editor roda como service role e passa por cima de tudo.
