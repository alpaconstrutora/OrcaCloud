# Plano — Cronograma Físico-Financeiro no Portal do Cliente (Serviços)

## Objetivo
Adicionar uma aba dedicada "Cronograma Físico-Financeiro" no Portal do Cliente, visível
apenas para clientes `category = 'Serviços'`, exibindo a curva de desembolso financeiro
previsto × realizado (R$ acumulado + curva S), reaproveitando a infra de planejamento
já existente (aba "Andamento do Serviço" / físico).

## Restrição de segurança (chave)
Hoje `fn_portal_get_planning` / `fn_planning_for_client` descartam valores monetários de
propósito para todos os clientes (payload físico "enxuto"). A liberação de R$ deve ser
feita no servidor (não só na UI), gated por `category = 'Serviços'` — para nenhum cliente
de Vendas/Locação vazar valores.

## Camada 1 — Backend / RPC (migration nova)
Arquivo: `supabase/migrations/2026XXXXXXXXXX_portal_planning_financial_servicos.sql`

Alterar as duas RPCs simétricas:
- `fn_portal_get_planning(p_token)` — caminho anon/token
- `fn_planning_for_client(p_client_id)` — caminho admin/preview

Em ambas:
1. JOIN `public.clients c` para capturar `c.category`.
2. `v_financial := (c.category = 'Serviços')`.
3. No `itemSchedules`, incluir condicionalmente (`CASE WHEN v_financial`): `plannedValue`,
   `actualValue`, `budgetedValue`. Fora de Serviços, seguem ausentes (comportamento atual).
4. Adicionar ao payload raiz `'financialEnabled', v_financial`.

Sem novos GRANTs (mantém `anon, authenticated`). Reusa a ponte `client_id`/category criada
em `20261231000002_services_client_portal_link.sql`.

## Camada 2 — Tipos TS
`services/clientPortalService.ts`:
- `PortalPlanningItem`: `plannedValue?`, `actualValue?`, `budgetedValue?`.
- `PortalPlanning`: `financialEnabled?: boolean`.

## Camada 3 — Util de cálculo
`utils/portalPlanningUtils.ts`:
- Novo `buildFinancialCurve(planning)` → distribui `plannedValue` linearmente sobre
  `[startDate,endDate]` (mesma lógica de peso da curva física); realizado =
  `actualValue ?? plannedValue * manualRealPct/100`.
- Estende `PlanningView` com `financial?: { curve; totalPlanned; totalRealized;
  plannedTodayR$; realizedR$ }`.
- Só popular `financial` quando `planning.financialEnabled` e houver valores.

## Camada 4 — UI (ClientArea.tsx)
1. Adicionar `'cronograma-ff'` à union de `activeTab`.
2. Incluir na lista de tabs de `'Serviços'` + label/ícone. Só renderiza se
   `planningView?.financial` existir.
3. Estender o `useEffect` de load do planning para disparar também nessa aba.
4. Novo `renderCronogramaFinanceiro()`: KPIs (Orçado total, Previsto p/ hoje R$,
   Desembolsado R$, % financeiro) + curva S R$ previsto×realizado, reusando estilo visual
   da curva física existente em `renderObra`.
5. Adicionar `{activeTab === 'cronograma-ff' && renderCronogramaFinanceiro()}` no switch.

## Camada 5 — Verificação
- `tsc --noEmit` local antes do push (build remoto quebra com qualquer erro TS).
- Aplicar migration fora de pico (`npx supabase db push`).
- Testar: cliente Serviços vê a aba+R$; cliente Vendas/Locação não recebe valores no
  payload (checar Network que `plannedValue` vem ausente).

## Pontos de atenção
- Bug de fuso: usar `parseDate` seguro (já existe no util) para os novos cálculos.
- Simetria das 2 RPCs: esquecer `fn_planning_for_client` faz a prévia do admin divergir
  do portal real.
- Gate de "só Serviços" sempre no servidor, nunca só na UI.

Status: implementação em andamento (ver commits).
