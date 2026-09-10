# RH — barra de abas no padrão (§19.1) e botão de ajuste de colunas (§6.1.2) em todas as tabelas

## Pedido original

Sessão `fc26bc97` (Claude Code, VS Code), 2026-09-10 ~15:55:

> Recursos humanos < aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas e incluir botão de ajuste de colunas

Escopo fechado com o usuário na mesma sessão (pergunta/resposta):

- **Tabelas:** "Todas as tabelas" — inclusive as que vivem dentro de modais/painéis e
  sub-abas (~35), não só a listagem principal de cada tela.
- **Entrega:** "Tudo numa frente, publicar no fim" — um push ao terminar, com suíte
  verde e prints.

Pedido anterior da mesma sessão, já publicado (`5d90085f`): remover a `LaborScopeBar`
das telas de RH que só tinham o botão Atualizar.

## Interpretação

- **"toolbar de abas"** = §19.1 do guia: card branco `p-2 rounded-[10px] border shadow-sm mb-3`
  com trilho `bg-gray-50 p-1 rounded-[10px] border`, aba `h-7 rounded-[6px] text-sm
  font-medium`, ativa `bg-white text-blue-600 shadow-sm`, inativa `text-gray-700`,
  `flex-wrap` (nunca `overflow-x-auto`). O RH hoje usa `bg-slate-100 p-1 rounded-2xl w-fit`
  com aba ativa `bg-white shadow text-indigo-600` + `uppercase tracking-widest` — fora.
- **"botão de ajuste de colunas"** = autofit (`MoveHorizontal`, "Ajustar largura das
  colunas ao conteúdo") + redimensionar arrastando (`useResizableColumns`), §6.1/§6.1.2.
  NÃO é a engrenagem de colunas visíveis (memória `toolbar-botoes-colunas-vs-largura`).
  Ele mora na toolbar acoplada (§5.2) junto do `ColumnConfigButton` — e a toolbar
  acoplada sempre tem busca (memória `feedback_toolbar_acoplada_sem_busca`). Ou seja:
  tabela que ganha o botão ganha o conjunto §5.2 + §6.1 inteiro.

## Decisão de implementação — dois componentes canônicos em `ui/`

Copiar ~100 linhas de `colgroup`/`SortableHeader`/`ResizeHandle`/toolbar à mão em
35 tabelas é exatamente o que gerou as divergências que o guia combate com `KpiCard`
e `ActionIconButton` ("não reimplemente à mão"). Então:

1. **`components/ui/TabsBar.tsx`** — o card §19.1 com o trilho (`TabsList`/`TabsTrigger`
   já existiam em `ui/tabs.tsx`; faltava o card). Slot à direita para ação/contador.
2. **`components/ui/StandardTable.tsx`** — toolbar acoplada (busca persistida +
   filtros extras + `ColumnConfigButton` + autofit) + tabela com `useTableColumns`
   + `useResizableColumns` + `colgroup` + espaçador antes de "Ações" (§6.1.1) +
   `SortableHeader` sentence case com `ResizeHandle` + `px-6 py-2.5 border-r`
   (§6.6/§7.2) ou `px-3` quando `dense` (§6.9, dentro de `Sheet`/modal) + loading
   §11 + empty §12 + sticky header §6.5. A tela só declara colunas, larguras,
   `renderCell`, `sortValue`, `searchText` e ações.

Ambos entram no guia (§19.1 e nova §6.10) — REGRA #1, passo 4.

## Fora do escopo (dito explicitamente, não omitido)

> A tabela de Encargos patronais (`LaborEncargos.tsx:426`) estava listada aqui na
> primeira versão; como o usuário escolheu "todas as tabelas", entrou também.

| Tabela | Por quê |
|---|---|
| `LaborFolhaEmpregado.tsx:292` (Relação da Folha por Empregado) | relatório de impressão, layout de papel — arrastar coluna não tem função |
| `LaborEncargosINSS.tsx:308` e `:389` (Relação de bases INSS / Resumo geral) | idem, relatório de impressão |
| `LaborDashboard.tsx:371` | não é RH — é Diário de Obra (`project-diary` no AppRouter) |

## Itens — barras de abas (§19.1 via `TabsBar`)

Critério de pronto de cada um: a barra usa `TabsBar`; `check-ui-standard.sh` limpo;
print da tela com a barra no padrão.

- [x] `LaborCargos.tsx:508` — Cargos / Funções (+ `:556` toggle Organograma/Lista vira toggle de ícone §5.1 dentro da barra)
- [x] `LaborEvaluation.tsx:933` — Ciclos / PDI; `:657` sub-abas Avaliações/Resultados
- [x] `LaborEsocial.tsx:609` — Painel / Eventos / Lotes
- [x] `LaborBIAnalytics.tsx:528`
- [x] `LaborComunicacao.tsx:710` — Comunicados / WhatsApp
- [x] `LaborValeRefeicao.tsx:1680` — 5 abas (era `overflow-x-auto`)
- [x] `LaborIncentivos.tsx:116` — sub-abas em card `rounded-2xl`
- [x] `LaborEncargos.tsx:185` — sub-abas + seletor de competência (§5.3 escopo)
- [x] `LaborAbsences.tsx:734` — Solicitações / Saldos (dentro da toolbar acoplada)
- [x] `LaborTimeBank.tsx:270`, `LaborSST.tsx:488`, `LaborEPIs.tsx:422`, `LaborContractors.tsx:443`, `LaborATS.tsx:733` — "Controls" card com trilho `bg-slate-100 rounded-xl`
- [x] `LaborPortal.tsx:724` — Gestão de Acessos / …
- [x] `LaborDocuments.tsx:172` — toggle cards/lista (é viewMode, vai para o grupo de ícones da toolbar §5.1, não é aba)

## Itens — tabelas (§5.2 + §6.1 via `StandardTable`)

Critério de pronto: tabela renderizada por `StandardTable` (busca + engrenagem +
autofit + arrastar borda), `tsc` limpo, `check-ui-standard.sh` limpo, aberta na tela.

- [x] `LaborAbsences.tsx:903` — Saldos de férias (já tinha `useTableColumns`)
- [x] `LaborTrainings.tsx:441` — treinamentos (já tinha `useTableColumns`)
- [x] `academy/AcademyCatalogTab.tsx:272`, `AcademyAssignmentsTab.tsx:316`, `AcademyPanels.tsx:211` (já tinham `useTableColumns`)
- [x] `LaborBIAnalytics.tsx:592` histórico mensal · `:685` coortes · `:749` desvio de custo · `:810` movimentações
- [x] `LaborComunicacao.tsx:430` recibos
- [x] `LaborContractors.tsx:509` medições
- [x] `LaborCostDashboard.tsx:217` detalhamento de custos
- [x] `LaborCosts.tsx:266` detalhamento por colaborador
- [x] `LaborDocuments.tsx:265` lista de documentos
- [x] `LaborEPIs.tsx:488` catálogo · `:561` entregas
- [x] `LaborEncargos.tsx:326` contribuições de terceiros (editável inline — §7.1) · `:426` encargos patronais (referência)
- [x] `LaborEncargosProlabore.tsx:120` pró-labore por sócio
- [x] `LaborEsocial.tsx:663` status por tipo · `:739` eventos · `:849` lotes
- [x] `LaborEvaluation.tsx:679` avaliações · `:745` resultados · `:1006` PDI
- [x] `LaborIncentivos.tsx:495` guarda de habitualidade
- [x] `LaborProductivity.tsx:242` logs de produtividade
- [x] `LaborRemuneracaoSocietaria.tsx:662` cálculo · `:842` distribuição
- [x] `LaborSST.tsx:584` checklists
- [x] `LaborTimeBank.tsx:308` saldos
- [x] `LaborTimeTracking.tsx:217` registros de ponto

Já no padrão (não tocar): `LaborEmployeeList`, `LaborAllocations`,
`LaborEmployeeSalaryHistory`, `LaborRubrics`, `LaborValeRefeicao` (5 tabelas).

## Verificação final

- [x] `npm run typecheck` · `npx vitest run` (suíte inteira, lida)
- [x] `check-ui-standard.sh` em cada arquivo tocado
- [x] Playwright: 22 telas em "Todas as organizações" (varredura, 0 falhas) e 8 telas em organização específica (prints). **Contexto "empresa" não exercitado** — a conta de leitura enxerga uma empresa só e o app cai nesse estado sozinho; não há caminho novo de org nesta frente (só cromo/tabela).
- [x] Guia atualizado (§19.1 aponta `TabsBar`; §6.10 `StandardTable`)
- [ ] `git push origin HEAD:main` + `conferir-producao.sh`

## Resultado (2026-09-10)

- `components/ui/TabsBar.tsx` e `components/ui/StandardTable.tsx` criados; guia
  atualizado (§19.1 e nova §6.10; item §6.10 no checklist de auditoria).
- 17 barras de abas migradas para `TabsBar`; 32 tabelas migradas para
  `StandardTable` (com `renderExpanded`, `renderTotals`, `selection`, busca
  controlada/escopada) + 4 hand-rolled (Treinamentos e Academy) ganharam
  `useResizableColumns`/`colgroup`/`ResizeHandle`/autofit.
- Verificação: `tsc` limpo · `vitest` 245 arquivos / 3593 testes verdes ·
  `check-ui-standard.sh` limpo em todos os arquivos tocados (corrigida uma
  pílula §8 pré-existente em `LaborEncargosProlabore.tsx`) · `varrer-abas.cjs`
  em 22 telas: 0 falhas objetivas (console/HTTP) · prints de Cargos, EPIs,
  Ponto, Encargos conferidos a olho.
- Ruído observado, fora desta frente: em "Todas as organizações", Avaliação 360°
  e Incentivos mostram "Selecione uma organização específica" (comportamento
  anterior dessas telas); a heurística "filtro de org vazando" apontou a
  consulta `employees?…&org_id=eq.` do lookup do colaborador logado (Academia),
  também anterior.
