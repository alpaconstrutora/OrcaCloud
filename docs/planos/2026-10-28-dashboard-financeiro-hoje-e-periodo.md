# Dashboard financeiro — posição de hoje + resultado do período

## Pedido original

> /impeccable craft: financeiro > Dashboard Financeiro
>
> Sessão: 3d788ea9-a1de-4c95-a7ec-75f573eee7c7 · 28/10/2026, tarde

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 28/10 | Qual pergunta a tela responde? (hoje mostrava só o fluxo do período por `transaction_date`, sem os R$ 3,13 mi vencidos a receber e R$ 1,83 mi vencidos a pagar) | **As duas, em blocos**: topo = posição de hoje (independe do período); abaixo, o resultado do período com Mês/Trimestre/Ano |
| 28/10 | Mexer no banco ou só na tela? | **Tela + RPC nova** (leitura, aplicada por SQL, REVOKE anon) |
| 28/10 | Convivência com a Inteligência Financeira | **Dashboard resume e aponta**: leitura de 10 s numa tela, sem abas; detalhe (scorecard, projeção) por link para a aba certa da Inteligência |
| 28/10 | Composição (página de decisão do impeccable, 3 esboços) | **Painel em faixas** — `.impeccable/mocks/decision/faixas.html` |

## Diagnóstico (medido no banco em 28/10/2026)

- `fn_financial_kpis` filtra por `transaction_date` dentro do período: outubro mostrava
  R$ 11 mil a receber e R$ 362 pagos, enquanto 95 títulos a receber (R$ 3,13 mi) e 780 a
  pagar (R$ 1,83 mi, org Alpa) estavam vencidos — nada disso aparecia.
- "Pago" = `status = 'CONCILIATED'`, que inclui boleto marcado pago à mão (não é conciliação
  bancária). 276 de 520 débitos pagos não têm `payment_date` nem `due_date`.
- Saldo calculado não tem base: as 5 contas estão sem saldo inicial (Sicredi −R$ 41 mil).
  A Conciliação publicou hoje (#233/#235, `aplicar_20271028800000`) o **saldo que o banco
  informa** — é dele que o Dashboard lê.
- "Top fornecedores" lia só `boletos` por vencimento; o resto dos títulos a pagar ficava fora.
- `FinancialDashboard` recebia `activeOrganizationId || ''` do AppRouter (REGRA #5).

## Plano

1. **`supabase/migrations/aplicar_20271029400000_dashboard_financeiro_hoje_e_periodo.sql`**
   — duas RPCs de leitura, `SECURITY INVOKER`, sobre o livro único `fn_fi_ledger`
   (mesmos números da Inteligência):
   - `fn_financial_dashboard_today(uuid)` → jsonb: vencidos a receber/pagar (valor, qtd, dias
     do mais antigo), próximos 7 e 30 dias, e por conta ATIVA o saldo do banco lido de
     `fn_reconciliation_dashboard` (regra do "saldo informado" num lugar só);
   - `fn_financial_dashboard_period(uuid, date, date, date)` → jsonb: recebido/pago no período
     pela data do pagamento (`payment_date` → vencimento → lançamento), série mensal e maiores
     credores (títulos a pagar com vencimento no período, `supplier_id` antes de `party_name`).
   - REVOKE de PUBLIC e anon + GRANT authenticated.
   **Pronto quando:** aplicada no remoto; rodada com o JWT do desenvolvedor@ devolve para a
   Alpa os mesmos vencidos de `fn_cashflow_position`; sonda anon → erro de permissão;
   `segurancaMigrations.test` e `migrationsPrefixo.test` verdes.
2. **`services/financialOverviewService.ts`** — `getToday(orgId)` e `getPeriod(orgId, …)`.
   **Pronto quando:** tipado, sem `any`; `tsc` limpo.
3. **`lib/dashboardFinanceiro.ts`** (+ `__tests__/dashboardFinanceiro.test.ts`) — regras puras:
   limites do período sem fuso, meses do gráfico, resumo do saldo dos bancos (soma do saldo do
   banco, contas sem saldo, data mais antiga) e o `tom` de cada destaque pelos `LIMIAR`.
   **Pronto quando:** testes cobrem conta sem saldo do banco, saldo antigo, saldo negativo,
   tudo zero, e virada de ano no trimestre.
4. **`components/FinancialDashboard.tsx`** — refeito no Painel em faixas: título §20; faixa
   "Hoje" com 4 `KpiCard destaque` (§4.5) + faixa de apoio `size="sm" color="gray"`; faixa
   "Resultado do período" com o seletor, 3 KPIs de apoio e 2 `ChartCard` (§28, `chartKit`);
   link para Scorecard/Projeção da Inteligência. `useOrgContext` (REGRA #5). Sai: atalhos de
   ícone, "Boletos vencidos" da tabela `boletos` (já está no vencido a pagar), Receita × custo
   por obra (mora no Scorecard).
   **Pronto quando:** `check-ui-standard.sh` limpo; tela aberta no navegador em Alpa e em
   "Todas", 1440 e 390 px, com print; carregando/erro/vazio de cada faixa vistos.
5. **`components/AppRouter.tsx`** — `FinancialDashboard` sem o `organizationId || ''`.
   **Pronto quando:** `orgContextGuard.test` verde.
6. **`docs/ui_ux_guia_unificado.md`** — §4.5.1: painel com duas leituras (hoje × período),
   título de faixa `h2` e o seletor de período na linha da faixa que ele recorta.
   **Pronto quando:** seção escrita com referência a `FinancialDashboard.tsx`.

## Estado

- [x] 1 migration — aplicada no remoto em 28/10 (e reaplicada após a revisão: "sem fornecedor"
  saiu do ranking). Alpa: vencido a receber R$ 3.132.268,07 (95) e a pagar R$ 1.832.862,22 (780),
  idênticos a `fn_cashflow_position`; anon → 401 `permission denied` nas duas.
- [x] 2 service — `getToday` / `getPeriod`; tipos `FinancialKPIs`/`FinancialTopSupplier` órfãos removidos.
- [x] 3 regras puras + testes — `__tests__/dashboardFinanceiro.test.ts` 14/14.
- [x] 4 tela — `check-ui-standard.sh` limpo; harness `docs/spikes/dashboard-financeiro/`
  (componente de produção, largura útil do app, respostas reais da Alpa) com 21 portões
  verdes em 1440 e 390 px, carregando/erro/vazio, foco por Tab real.
- [x] 5 AppRouter — `orgContextGuard` verde; baseline do AppRouter 28 → 27.
- [x] 6 guia — §4.5.1 + linha no checklist de auditoria.

### Revisão (impeccable finish review, 28/10)
1ª: recapture (print de foco inválido). 2ª: fix — 5 correções materiais (período marcado no
gráfico, "sem fornecedor" fora do ranking, anel de foco sólido também no `KpiCard`, esqueleto
com as duas fileiras, sem ícones nos cartões de apoio). 3ª pontuação: 3 resolvidas, 2 parciais
(valores do período invisíveis na escala; rótulos quebrando a 390 px) — corrigidas; 4ª: as
2 resolvidas + 1 regressão do lote (valor da coluna visível de set/26 só no tooltip) — corrigida
com portão próprio no passeio (22/22), sem 5ª rodada.

### Fora do escopo, registrado
- `__tests__/conciliacaoSaldoBanco.test.ts` lia a última migration que CITA
  `fn_reconciliation_dashboard`; passou a ler a que a DEFINE (a nova RPC a chama).
- `KpiCard`: anel de foco `ring-blue-600` (era `/40`, ~1,6:1) — vale para todas as telas.
- Deriva pré-existente apontada pelo documentador (não corrigida): `KpiCard` em `rounded-xl` ×
  `rounded-[10px]` do §16; §28.2 com altura de barra horizontal e subtítulo `gray-400`
  desatualizados; "Tentar de novo" do `ChartSourceState` sem anel de foco.
- Dado: nenhuma das 5 contas tem saldo inicial; Sicredi sem saldo informado pelo banco — o
  card "Saldo nos bancos" fica em atenção até alguém informar na Conciliação.

## Verificação

`npx tsc --noEmit -p .` · `npx vitest run __tests__/dashboardFinanceiro.test.ts __tests__/orgContextGuard.test.ts __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` ·
`bash scripts/check-ui-standard.sh components/FinancialDashboard.tsx` · abrir Financeiro ›
Dashboard financeiro na Alpa e em "Todas" e conferir os vencidos com a Inteligência ›
Projeção de caixa.
