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

### Fase 3 — impedir a reincidência ✅ (2026-08-11)

⚠️ **Feita como TESTE, não como shell script — divergindo do desenho abaixo, de
propósito.** O plano previa `scripts/check-view-security.sh` + passo no
`ci.yml`. Esse formato **já falhou neste repositório**: os `check-*.sh`
dependiam de alguém lembrar de rodar, e foi exatamente por isso que a trava do
seletor de organização virou teste (ver o histórico em CLAUDE.md REGRA #5).
`npx vitest run` já é passo do CI, então a checagem roda sozinha.

| Arquivo | O que faz | Como sei que terminou |
|---|---|---|
| `__tests__/viewSecurityGuard.test.ts` (novo) | Varre `supabase/migrations/**/*.sql`; falha se migration **fora do BASELINE** criar view sem `security_invoker = on` e sem `REVOKE ... FROM anon` nominal. Ignora comentários antes de casar `CREATE VIEW` | **Provado nos dois sentidos**: criei uma migration com view desprotegida → falhou apontando a view; troquei pelo formato correto → passou. Suíte completa 1166 passando |

- **BASELINE: 25 arquivos** — a dívida de higiene fechada em 2026-08-11. É
  catraca: só anda para baixo, e o segundo teste falha se uma entrada deixar de
  violar sem ser removida.
- **ALLOWLIST: `geography_columns`, `geometry_columns`** — catálogo do PostGIS,
  exceção permanente (REVOKE pode quebrar a extensão).
- As views do baseline **já estão fechadas no banco** (`aplicar_20270903000002`
  e `...03`). O baseline registra que o ARQUIVO original não trazia a proteção —
  dívida de higiene, não exposição viva.

### Fase 3 — desenho original (mantido como registro)

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
- [x] **Fase 2 — APLICADA e VERIFICADA (2026-08-07).**
      `aplicar_20270903000003_views_security_invoker.sql`. **7 das 8 bateram
      EXATAMENTE com a previsão** (1238, 551, 12, 8, 1, 1, 1) — o cross-tenant
      dessas fechou, e nenhuma view esvaziou nem ficou parcial.

      **A oitava revelou um problema em outra camada.**
      `vw_hr_retention_cohorts` previa 3 e continuou em 6, ainda com org alheia.
      Causa: `security_invoker` **funcionou** — a view passou a respeitar a RLS
      da base — mas a RLS de **`employees` está aberta**: com a conta de teste,
      a tabela devolve 2 organizações. Não havia o que filtrar.
      → vira item da dívida da camada `authenticated`
      ([[project_rls_authenticated_layer_gap]]), não deste plano.

      **Varredura das tabelas base (2026-08-07):** de 15 tabelas principais
      testadas com conta real — `contracts`, `clients`, `suppliers`,
      `projects`, `companies`, `deals`, `commercial_properties`, `invoices`,
      `purchase_orders`, `internal_transactions`, `organization_members`,
      `work_orders`, `tasks`, `cost_centers_v2` — **só `employees` vaza**. O
      problema é localizado, não sistêmico.

      **Pendência menor:** `vw_project_cost_comparison` melhorou (expunha 6
      projetos, agora 5), mas **1 projeto alheio ainda aparece** — o usuário
      não o enxerga em `projects` sob RLS. Escopo indireto: provável OS na org
      do usuário apontando para projeto de outra org (inconsistência de dado),
      ou join que não propaga a RLS de `projects`. Precisa da definição da view
      para decidir.

Migration original abaixo, mantida como registro do que foi medido antes:

      **O cross-tenant deixou de ser hipótese (2026-08-07).** Com a conta
      `agente-leitura` (membro de UMA organização), consultando pela API:
      **8 views expõem organização alheia**, mais 1 de escopo indireto que
      também vaza. Existem ao menos 3 organizações no banco.

      | View | Hoje | Previsto | Perde |
      |---|---|---|---|
      | `vw_fact_financial_tx` | 1300 | 1238 | 62 |
      | `vw_fpa_cashflow_projection` | 558 | 551 | 7 |
      | `vw_hr_turnover_trend` | 24 | 12 | 12 |
      | `vw_fact_deal` | 13 | 8 | 5 |
      | `vw_hr_retention_cohorts` | 6 | 3 | 3 |
      | `vw_bi_operational` | 3 | 1 | 2 |
      | `vw_company_consolidated` | 3 | 1 | 2 |
      | `vw_bi_commercial` | 2 | 1 | 1 |
      | `vw_project_cost_comparison` | 12 | ? | expõe 6 projetos, 4 visíveis |

      As outras 6 com dados não mudam (uma organização só), e 9 estão vazias.
      **Nenhuma zera** — foi essa medição que autorizou aplicar as 24 de uma
      vez em vez de ir view a view.
- [x] **Fase 3 — CONCLUÍDA (2026-08-11).** Trava como TESTE (`__tests__/viewSecurityGuard.test.ts`), não shell script — o formato que já falhou aqui. Baseline de 25 arquivos, provada nos dois sentidos.

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

⚠️ E a prova final nunca é essa query, é o `curl` de fora do SQL Editor — o
Editor roda como service role e passa por cima de RLS, GRANT e
`security_invoker`. Ele mostraria tudo igual mesmo com tudo corrigido.

**Ferramenta:** `bash scripts/verificar-views-anon.sh '<senha>'` verifica as
duas fases de uma vez — Fase 1 sem sessão (espera `42501`) e Fase 2 com a
conta `agente-leitura` (espera zero organização alheia).

⚠️ Ele marca `NAO VERIFICAVEL` — e **não** `ok` — para view sem coluna de
organização, porque ali não há o que comparar. Hoje é o caso de
`vw_project_cost_comparison`, que vaza de fato e passaria como aprovada se o
script fosse otimista. Escopo indireto exige conferência à mão contra a tabela
pela qual a view escopa.

⚠️ A coluna de organização tem **dois nomes** no schema: `organization_id` e
`org_id`. Procurar só o primeiro dá falso "sem coluna" em 4 views de RH e
empresa — erro que este plano cometeu na primeira medição.

### Duas abordagens que NÃO funcionaram (para não repetir)

1. `DO $$ ... RAISE NOTICE ... $$` com `BEGIN/ROLLBACK`: o SQL Editor do
   Supabase não exibe notice. Resultado: "Success. No rows returned" e a
   medição inteira perdida.
2. Função em `pg_temp` + `SELECT`: mesma resposta vazia — o schema temporário
   aparentemente não sobrevive entre os statements da mesma execução.

A medição que funcionou foi por **HTTP com token de usuário real**, que é o
mesmo caminho do app — e é o único que exercita RLS, GRANT e
`security_invoker` de verdade.
