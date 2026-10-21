# Inteligência Financeira — números que batem com a realidade

## Pedido original

> analise financeiro > Inteligência Financeira

Sessão `b8e29e60-b2c7-4a2c-a254-d3ca480efdbd` · 21/10/2026

Pedidos posteriores, mesma sessão e data:

> 2. o que voce precisa saber de mim?

(respondendo à análise, que perguntava como a receita deve chegar a uma obra)

> continue

## Diagnóstico (21/10/2026, medido no banco com as RPCs rodadas no JWT do usuário)

O que a tela mostrava: Margem Média **0,0%**, **10 de 11** obras em risco, Saldo
Projetado 90d **+R$ 20,9 mil**.

| # | Defeito | Evidência |
|---|---|---|
| D1 | Projeção soma só PENDING de hoje→hoje+N; ignora vencidos e não parte do saldo bancário | vencidos: R$ 3,13 mi a receber (95), R$ 2,14 mi a pagar (842) |
| D2 | Receita nunca chega à obra → margem 0% em todas; `MARGIN_LOW` nunca dispara | 0 CREDIT conciliado com `project_id`; 54% do custo conciliado sem obra |
| D3 | Scorecard mede risco sem horizonte; alerta mede 90 dias | Garden Cambuhy: −R$ 200 mil (scorecard) × −R$ 753 (alerta) |
| D4 | Orçamento entra como obra (Regra #3) | "Garden" (ORCAMENTO) gera alerta; "Igreja Divino Espírito Santo" 2× |
| D5 | Sem alerta para contas a pagar vencidas | 842 títulos, R$ 2,14 mi |
| D6 | Edge `financial-report-notifier` chama as RPCs com service_role → "Acesso negado"; erro engolido; parâmetro `p_horizon_days` não existe (é `p_days`) | provado com JWT `service_role` |
| D7 | Sem cron para os agendamentos; tela manda o usuário criar no painel | `cron.job` sem entrada; 0 agendamentos |
| D8 | "Enviar agora" não confere se o usuário é membro da org do agendamento; cron autenticaria com service_role key | leitura do código |
| D9 | RPCs com EXECUTE para PUBLIC/anon (Regra #7) | `proacl` |
| D10 | Gráfico Entradas×Saídas amostra 1 de cada N dias | `projectionSampled` usado no BarChart |
| D11 | Margem Média = média simples, conta obra sem receita | `summary.margemMedia` |
| D12 | `activeOrganizationId \|\| ''` no AppRouter (Regra #5) | `AppRouter.tsx` case `financial-intelligence` |

Origem da receita hoje (todas vêm de contrato):

| Natureza | Valor | Caminho até o empreendimento |
|---|---|---|
| Venda de unidade (6 contratos) | ≈ R$ 3,1 mi | contrato → `commercial_deals` → `commercial_properties` (unidade) → `parent_id` (empreendimento) |
| Locação (8 contratos) | ≈ R$ 576 mil | idem |
| Empreitada (1) | R$ 467 mil | `contracts.project_id` já aponta a obra |

Nenhum dos 8 empreendimentos raiz tem `commercial_properties.project_id` preenchido.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 21/10/2026 | Venda de unidade conta como receita da obra que construiu o empreendimento? | **Sim, da obra.** |
| 21/10/2026 | Aluguel entra na margem da obra? | **Não — bloco separado** ("Renda de locação" por empreendimento). |
| 21/10/2026 | Como ligar empreendimento e obra? | **Gravar no cadastro** do empreendimento; preencher 007 Bella Vista→"Bella Vista", 011 Garden Cambuhy→"Garden Cambuhy", 010 Galeria Altavista→"Galeria", 006 Coronel Lambert→"Coronel Lambert 345"; usuário confere na tela. |
| 21/10/2026 | Custo sem obra e obras "Condomínio - Bella Vista" / "Bella Vista - Assistência Técnica"? | **Separar, sem somar** — custo sem obra vira "Despesa da empresa" fora da margem; condomínio e assistência seguem obras próprias. |

Decisão técnica (minha, registrada para conferência): a obra da receita é
**deduzida na leitura**, dentro das RPCs, na ordem
`it.project_id` → `contracts.project_id` → `commercial_deals.linked_project_id` →
`commercial_properties.project_id` da unidade → do empreendimento (`parent_id`).
Nenhum lançamento é regravado e não há backfill — as ~10 origens que regravam
títulos (ver memória "syncs regravam amount") ficam intocadas.

## Plano

### Fase 1 — RPCs (uma migration nova, aplicada por `db query -f`, nunca `db push`)

**1.1 `fn_cashflow_projection`** — `supabase/migrations/<prefixo>_inteligencia_financeira_numeros_reais.sql`
- Muda: ponto de partida = saldo das contas (`payment_accounts.opening_balance` +
  conciliado depois de `opening_balance_date`, pelo mesmo critério das telas de conta —
  localizar e reaproveitar); vencidos devolvidos à parte (colunas/linha "vencido a
  receber/a pagar"), não somados ao saldo; exclui `business_status` CANCELADO/RENEGOCIADO.
  Assinatura (`p_organization_id`, `p_days`) preservada.
- Pronto quando: rodada no JWT do usuário, o 1º dia parte do saldo bancário e o total
  vencido devolvido bate com `SELECT … status='PENDING' AND due_date<CURRENT_DATE`.

**1.2 `fn_project_scorecard`** — mesma migration
- Muda: só `OBRA` não-sistema; receita por obra deduzida pela cadeia acima, **só venda e
  empreitada** (locação fora); risco calculado no mesmo horizonte de 90 dias do alerta;
  vencido em coluna própria.
- Pronto quando: "Garden" (orçamento) não aparece; "Igreja Divino Espírito Santo" aparece
  uma vez; com os 4 vínculos gravados, Bella Vista e Garden Cambuhy têm receita > 0;
  o saldo 90d de cada obra é igual ao valor do alerta `CASHFLOW_RISK` dela.

**1.3 `fn_financial_alerts`** — mesma migration
- Muda: mesmos filtros e cadeia de 1.2; novo alerta `PAYABLE_OVERDUE` (a pagar vencido);
  `MARGIN_LOW` passa a enxergar receita deduzida.
- Pronto quando: aparece alerta de a pagar vencido com 842 títulos/R$ 2,14 mi (ou o valor
  do dia) e nenhum alerta cita orçamento.

**1.4 Nova RPC `fn_rental_income`** (renda de locação por empreendimento) e
**`fn_company_expenses`** (custo sem obra) — mesma migration
- Pronto quando: soma das duas + receita/custo do scorecard = total conciliado do período.

**1.5 Permissões** — mesma migration
- Muda: `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` em todas.
- Pronto quando: `proacl` sem `=X` nem `anon=X`; `npx vitest run __tests__/segurancaMigrations.test.ts` verde.

### Fase 2 — Vínculo empreendimento → obra

**2.1 Campo "Obra" no cadastro do empreendimento** — tela de empreendimento (localizar o
formulário que grava `commercial_properties` raiz) + `services/commercialService.ts`
- Muda: seletor de obra (só OBRA, `useStore().projects`) gravando `project_id` no
  empreendimento raiz.
- Pronto quando: escolher a obra na tela grava a coluna (conferido no banco) e reabrir mostra o valor.

**2.2 Preencher os 4 empreendimentos** (escrita aprovada pelo usuário em 21/10)
- Pronto quando: `SELECT name, project_id FROM commercial_properties WHERE parent_id IS NULL`
  mostra os 4 pares da tabela de decisões.

### Fase 3 — Agendamentos por e-mail

**3.1 `supabase/functions/financial-report-notifier/index.ts`**
- Muda: autorização própria (manual: usuário precisa ser membro da org do agendamento;
  cron: `CRON_SECRET` via `_shared/auth.ts`); dados lidos sem depender de `auth.uid()`
  (RPC interna com org explícita, sem EXECUTE para authenticated); `p_days`; erro de RPC
  vira erro no relatório, nunca lista vazia.
- Pronto quando: `curl` sem header → 401; "Enviar agora" de usuário de outra org → 403;
  e-mail de teste chega com os mesmos números da tela.

**3.2 Cron** — migration
- Pronto quando: `cron.job` tem o job horário e `check-rls-postura.sh` (verificações 5–7) verde.
  O aviso âmbar da tela é removido.

### Fase 4 — Tela (`components/FinancialIntelligence.tsx`, `components/AppRouter.tsx`)

**4.1** Blocos "Renda de locação" e "Despesa da empresa"; vencidos visíveis na projeção.
**4.2** Gráfico Entradas×Saídas agrega por período em vez de amostrar (D10).
**4.3** Margem Média ponderada pela receita, só obras com receita (D11).
**4.4** `useOrgContext` em vez de prop `|| ''` (D12).
- Pronto quando: `bash scripts/check-ui-standard.sh components/FinancialIntelligence.tsx`
  verde; `npx vitest run __tests__/orgContextGuard.test.ts` verde; conferido na tela
  (skill rodar-app) em "Todas" e numa organização.

## Estado

- [x] Diagnóstico — 21/10/2026
- [x] Decisões de negócio com o usuário — 21/10/2026
- [ ] Fase 1 — 0 de 5
- [ ] Fase 2 — 0 de 2
- [ ] Fase 3 — 0 de 2
- [ ] Fase 4 — 0 de 4

## Verificação

Rodar as três RPCs com `request.jwt.claims` do usuário (script em
`scratchpad/sim.sql` desta sessão) antes e depois; conferir na tela os 4 KPIs do topo
contra as consultas diretas de `internal_transactions`.
