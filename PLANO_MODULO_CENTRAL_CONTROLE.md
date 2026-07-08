# PLANO — Central de Controle / Minha Mesa

> Tela inicial do ÒPURA centrada no **usuário e na exceção**, não no departamento.
> Princípio-guia: **o dashboard mostra o problema; o módulo resolve o problema.**
> Todo bloco leva a uma tela operacional já filtrada (drill-down), nunca resolve no lugar.

---

## 1. Diagnóstico do que já existe (não recriar)

| Peça | Onde | Estado |
|------|------|--------|
| `fn_financial_alerts` / `fn_project_scorecard` / `fn_cashflow_projection` | migration `20261119000001` + `services/financialIntelligenceService.ts` | **APLICADO** e consumido em `FinancialIntelligence.tsx` (preso no módulo) |
| `MyTasksWidget` (fila pessoal de tarefas) | `components/MyTasksWidget.tsx` | Existe; query direta em `tasks`; **hoje mal-posicionado dentro de `BIDashboard`** → migrar p/ Central |
| `BIDashboard` (BI Executivo, analítico) | `components/BIDashboard.tsx` + `biService` | **Existe e é bom.** Vira o destino da Faixa 3 (link), NÃO é a home; não recriar |
| `fn_approval_action_queue` / `fn_approval_pending_summary` | migration `20261223000004/05` | **APLICADO** (verificado 2026-07-08) |
| `fn_reconciliation_divergences` / `_dashboard` / `_anomalies` | migrations `20261220000001/02/05` + `divergenceService`/`reconciliationDashboardService` | **APLICADO** (verificado 2026-07-08) |
| `fn_process_bottlenecks` | migration `20270105000000` + `processService.ts:391` | **APLICADO** (verificado 2026-07-08) |
| 22 dashboards por assunto (Financial, Planning, Sales, Supplier, Labor…) | `components/*Dashboard.tsx` | Existem; são destino de drill-down, **não** a home |

**Conclusão:** a Central de Controle é ~70% **costura de sinais que já existem**, não lógica nova.
O backend **já está aplicado no remoto** (verificado 2026-07-08: só 2 migrations pendentes, nenhuma da Central).
⇒ o trabalho é essencialmente **UI + costura de serviços**, não migration. Ver Fase 0.

---

## 2. Arquitetura da tela

Nova view `central` (rota + NavItem), definida como **default view pós-login**.
Um único componente `CentralControle.tsx` com três faixas, **nesta ordem de prioridade**:

### Faixa 1 — Alertas & Exceções (topo, o mais valioso)
"As N coisas erradas hoje." Lista objetiva, severidade-first, cada linha clicável → tela operacional filtrada.
Agregador dos `fn_*` já existentes:

- Financeiro: `fn_financial_alerts` (contas vencidas, estouro de orçamento, margem em risco) → **já aplicado**
- Conciliação: `fn_reconciliation_divergences` + `_anomalies` → **pendente**
- Aprovações: `fn_approval_pending_summary` → **pendente**
- Processos: `fn_process_bottlenecks` → **confirmar**

### Faixa 2 — Minha Mesa (fila de trabalho pessoal)
O que **depende de mim** hoje, cruzando módulos. Reusa/expande `MyTasksWidget` +:

- `fn_approval_action_queue` (aprovar pedido, liberar pagamento) → **pendente**
- Medições pendentes, propostas sem retorno, documentos a validar (fontes já existentes nos módulos)

### Faixa 3 — Resumo macro → **link para o BI Executivo** (NÃO recriar)
O painel executivo/analítico **já existe e é bom**: `BIDashboard` (view `bi`, `biService.getSummary`)
consolida Comercial · Operacional · Suprimentos · Financeiro · RH, com abas (Visão Geral, Tendência
12 Meses, vs. Metas, IA & Relatórios), filtro de período e narrativa por IA.

Portanto a Faixa 3 **não duplica KPIs**. É uma faixa compacta (2–4 números-âncora, ex.: caixa 30/60/90
via `fn_cashflow_projection`, resultado/risco por obra via `fn_project_scorecard`) que serve de
**deep-link para o BI Executivo**. O BI Executivo continua sendo o destino de análise; a Central só aponta.

---

## 2b. Central de Controle × BI Executivo (delimitação)

Não são a mesma tela. Diferença de **lente**, não de estética:

| | BI Executivo (`BIDashboard`, existe) | Central de Controle (novo) |
|---|---|---|
| Pergunta | "Como o negócio **foi** no período?" | "O que está errado / preciso fazer **agora**?" |
| Tempo | Filtro de período (retrospectivo) | Hoje / em aberto |
| Centrado em | Assunto (5 áreas) | **Usuário** e **exceção** |
| Peso | Pesado (gráficos, summary consolidado) | Leve, lista clicável |
| Papel | **Destino** de análise | **Porta de entrada** e priorização |

O próprio texto-base diz que o dashboard analítico "não deve ser a tela inicial para usuário comum".
O BI Executivo é ótimo como destino, arriscado como home. A Central entrega o que **falta**: alertas
acionáveis (Faixa 1) + fila pessoal (Faixa 2).

**Correção de posicionamento do `MyTasksWidget`:** hoje ele está dentro do `BIDashboard` — lugar errado
(fila de trabalho *pessoal* dentro de um painel analítico de período). Deve **migrar para a Central** (Faixa 2).

---

## 3. Duas regras de correção (do meu review do texto-base)

1. **Centrado no usuário, não no departamento.** A home NÃO é uma grade dos 22 dashboards
   por assunto — é "o que preciso decidir/executar". Os dashboards por assunto são destino
   de drill-down (já existem), não a porta de entrada.
2. **Todo agregado expõe cobertura.** Nenhum KPI/alerta agregado sem indicar sua base
   ("8 de 12 obras", período). Agregação sem contexto de origem é a mesma classe de bug
   já corrigida no Planejamento (`max()` conflatando físico×financeiro) — não repetir.

---

## 4. Fases

### Fase 0 — Backend (JÁ PRONTO — verificado 2026-07-08)
`supabase migration list --linked`: remoto aplicado até `20270108000000`. **Só 2 migrations pendentes**,
e **nenhuma é da Central**:
- `20270109000000_inss_obra_regularizacao` (módulo INSS/CNO — não relacionado)
- `20270110000000_add_cost_center_to_bank_transactions` (coluna no extrato — não relacionado)

Todos os `fn_*` da Central **já estão no remoto**: `fn_financial_alerts` (`20261119`),
`fn_reconciliation_divergences`/`_anomalies` (`20261220`), `fn_approval_action_queue`/`_pending_summary`
(`20261223`), `fn_process_bottlenecks` (`20270105`).

⇒ **Fase 0 é praticamente vazia.** A Central é trabalho de UI + costura de serviços já existentes.
(As 2 pendentes podem ser aplicadas quando convier, independentemente da Central.)
> Correção: a memória antiga dizia "remoto parou em 20261219000002 / 87 pendentes" — **estava desatualizada**.

### Fase 1 — MVP (só o que já está aplicado)
- Componente `CentralControle.tsx` + view `central` como default pós-login.
- Faixa 1 apenas com `fn_financial_alerts`; Faixa 2 com `MyTasksWidget` **movido para fora do `BIDashboard`**;
  Faixa 3 = 2–4 números-âncora (`fn_cashflow_projection` / `fn_project_scorecard`) que **linkam para o BI Executivo** (view `bi`).
- Drill-down: cada card chama `onNavigate(view, filtro)` para o `*Dashboard`/módulo correspondente.
- **Entrega valor sem depender da Fase 0.**

### Fase 2 — Ligar as filas (depende da Fase 0)
- Faixa 1 recebe divergências de conciliação, aprovações pendentes e gargalos de processo.
- Faixa 2 recebe `fn_approval_action_queue` (aprovar/liberar direto da fila, respeitando
  que ações que exigem conferência **só linkam**, não resolvem inline).

### Fase 3 — Perfilamento
- Filtro por papel: diretor entra e o botão do BI Executivo ganha destaque; operador vê Faixa 2 (mesa) em destaque.
- Filtros simples: período, empresa, obra, responsável.

---

## 4b. Fase 1 — Especificação de implementação (verificado no código em 2026-07-08)

### Componente e registro
- Novo arquivo `components/CentralControle.tsx`.
- Registrar em `AppRouter.tsx`: `const CentralControle = React.lazy(() => import('./CentralControle'));`
  + `case 'central': return <CentralControle organizationId={...} onNavigate={setActiveView} />`.
- Props mínimas (padrão do repo, ver `BIDashboard`/`FinancialApprovalModule`):
  ```ts
  interface Props {
      organizationId: string;
      onNavigate: (view: string) => void;
  }
  ```
- **Default view pós-login**: hoje é `'eng-obras'` (`getInitialView()` em `store/useStore.ts`).
  Trocar o fallback para `'central'` é mudança de comportamento visível a todos os usuários —
  **decisão do usuário, não assumir**; implementar o componente primeiro, trocar o default depois
  de validado.

### Contrato de drill-down (reusar o que já existe — não criar mecanismo novo)
O store já tem exatamente o mecanismo necessário — **não inventar filtro novo**:
```ts
// store/useStore.ts
navigateToFocus(view: string, ref: string, source?: string): void   // aponta um item específico
setActiveView(view: string): void                                    // navega sem foco (cai na tela padrão do módulo)
```
Padrão de consumo do lado do destino já existe em `BoletoManager.tsx` (linhas ~299-384): a tela lê
`useStore(s => s.viewFocus)`, filtra por `source`, abre/realça o item e limpa o foco. Cards da Central
com um `ref_id` concreto (alerta financeiro, item da fila de aprovação, divergência específica) usam
`navigateToFocus`; cards agregados sem item único (ex. "3 obras com desvio") usam `setActiveView` puro
e a tela de destino abre na sua visão padrão — está alinhado com o texto-base ("o dashboard aponta, o
módulo detalha", não exige pré-filtro pixel-perfect no MVP).

### Views de destino confirmadas em `AppRouter.tsx`
| Faixa | Fonte | View de destino |
|---|---|---|
| 1 — Alerta financeiro | `financialIntelligenceService.getAlerts` | `financial-dashboard` |
| 1 — Divergência de conciliação | `divergenceService.getDivergences` | `bank-reconciliation` |
| 1 — Pendência de aprovação | `approvalService.getPendingSummary` | `financial-approval` |
| 1 — Gargalo de processo | `processService` (`fn_process_bottlenecks`) | `opura-processos` |
| 2 — Fila de aprovação acionável | `approvalService.listActionQueue` | `financial-approval` |
| 2 — Tarefa pessoal | `MyTasksWidget` (já existente) | `tarefas` |
| 3 — Resumo macro | `fn_cashflow_projection` / `fn_project_scorecard` | `bi-executivo` |

### Carregamento de dados — isolar falhas por fonte
`BIDashboard` hoje usa um único `try/catch` ao redor do `Promise.all` (uma fonte falha → painel inteiro
quebra). Para a Central **não repetir esse padrão**: são 5+ fontes independentes (financeiro, conciliação,
aprovação, processos, tarefas) e uma RPC fora do ar não pode apagar as outras 4. Usar `Promise.allSettled`
e renderizar cada bloco a partir do seu próprio resultado — bloco com erro mostra estado de erro local
("Não foi possível carregar X"), os demais seguem normais.

### Migração do `MyTasksWidget`
Hoje importado e renderizado dentro de `BIDashboard.tsx:13`. Mover a chamada para dentro de
`CentralControle.tsx` (Faixa 2) e remover de `BIDashboard.tsx`. O componente em si não muda —
já recebe `orgId`/`onNavigate` como props.

### Regras de UI a seguir (CLAUDE.md — obrigatório, não opcional)
- Ler `docs/ui_ux_standard_guide.md` inteiro antes de codar os cards (KPI card, badge de severidade).
- Rodar os 3 greps de autoverificação do guia nos arquivos tocados (`CentralControle.tsx`,
  `BIDashboard.tsx`) antes de reportar a tarefa como concluída.
- `UI_PATTERNS.md` para decidir se algum drill-down merece abrir em `Sheet` em vez de navegar de tela
  (ex.: aprovar um item da fila sem sair da Central) — provável candidato a painel lateral no MVP.

---

## 5. Fora de escopo (evitar a "parede de gráficos")
- Nada de gráfico avançado/série histórica na home (isso é dashboard analítico, tela separada).
- Sem botão "resolver tudo" para ações que exigem conferência.
- Não duplicar KPI que já vive num `*Dashboard` de assunto — a home aponta, o módulo detalha.

---

## 6. Padrões obrigatórios do repo (ao implementar UI)
- Ler `docs/ui_ux_standard_guide.md` inteiro antes de tocar KPI card / badge de status / tabela.
- `UI_PATTERNS.md` para decidir modal × Sheet × página nos drill-downs.
- Busca/filtro persistido via `usePersistedState`.
- Datas: nunca `new Date('YYYY-MM-DD').toLocaleDateString()` (bug de fuso UTC-3).
