# Tarefas › lista — toolbar acoplada §5.2, ajuste de colunas §6.1.2 e filtro por Espaço

## Pedido original
> minhas Tarefas:
> 1. aplicar o padrão ui_ux_guia_unificado.md no toolbar acoplada a tabela + botão de ajuste de colunas
> 2. criar filtro espaço no toolbar acoplada
>
> Sessão: 62d4f507-b4ab-4368-a7bb-e902f0ed2be1 · 2026-09-21

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-21 | Qual tela é o alvo? ("Espaço" = Espaço → Pasta → Tarefa) | Tarefas › lista (`components/TasksList.tsx`, dentro de `TasksModule.tsx`) |

## Decisões de implementação (sem perguntar — rotina do guia)
- **Hand-rolled mantido, não `StandardTable`** (§6.10 permite justificar): a tabela de
  tarefas tem árvore de subtarefas (expandir/recolher, indentação), cabeçalho de grupo
  (`groupBy`), arrastar linha para virar subtarefa / soltar em pasta do rail, e duas
  colunas estruturais (grip + checkbox circular). `StandardTable` não suporta nada disso.
- "Ajuste de colunas" = **autofit/`useResizableColumns`** (`MoveHorizontal`), não a
  engrenagem — a engrenagem já existia.
- Ordem de coluna arrastável passa a ser a do `useTableColumns` (`orderedVisibleColumns`
  + `moveColumn`, via `SortableHeader onMoveColumn`) em vez do `colOrder` local — mesma
  mecânica ClickUp, só que persistida e sem código duplicado.
- Ordenação passa a ser a do `useTableColumns` (`sortColumn`/`sortDirection`), também
  persistida; o `usePersistedState('tasksListFilters:sortCol')` local sai.
- Filtro **Espaço** = `FilterPopover` (§5.4) — dimensão de escolha única. Opções:
  Todos · Sem espaço · cada espaço da organização. Persistido em
  `tasksListFilters:space`. Entra no `activeFilters`/`Limpar`.
- Cartões mobile (`TaskCard`) ficam fora: vocabulário de app nativo, não `<table>`.
- **Colunas visíveis por padrão: Nome, Responsável, Vencimento, Prioridade, Status, Ações.**
  Obra, Data inicial, Origem e Alerta nascem `defaultHidden` (ligam na engrenagem). Motivo
  medido: a área de conteúdo de Tarefas tem ~1016px em 1600 (sidebar 260 + gutter 48 +
  rail 256 + gap 20) e nove colunas com `px-6` somavam 1526px — a coluna de Ações nascia
  fora da tela. Quem já tinha preferência salva (`tasksListColumns`) continua vendo as
  colunas de antes. Se o usuário preferir outro conjunto padrão, é uma linha em
  `TASKS_LIST_COLUMNS`.
- Harness de prova visual: `docs/spikes/tarefas-toolbar/` (monta o `TasksList` real com
  dado fabricado em 1016px; `?groupBy=status` prova o cabeçalho de grupo).

## Plano
| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/TasksList.tsx` | Toolbar §5.2 dentro do card da tabela (busca h-9 + FilterPopover Espaço + Filtros + expandir + limpar + contador + filtro avançado + separador + engrenagem + autofit); `useResizableColumns` + `colgroup` + espaçador antes de Ações (§6.1.1) + `ResizeHandle`; `SortableHeader uppercase={false} onMoveColumn`; `px-6 py-2.5 border-r` nas células (§6.6/§7.2); sem `font-bold`/`font-black` em `<td>`; alerta sem pílula (§8); painel de filtros rápidos em `h-9 rounded-[6px] text-sm` (§16); loading/empty dentro do card (§11/§12); cabeçalho sticky (§6.5) | `bash scripts/check-ui-standard.sh components/TasksList.tsx` limpo; `tsc` limpo; tela aberta no navegador com toolbar costurada ao card, autofit funcionando e filtro Espaço recortando |
| 2 | `components/TasksModule.tsx` | Passa `spaces={spaceOptions}` para `TasksList` | `tsc` limpo; popover lista os espaços da org selecionada |
| 3 | `docs/planos/…` (este) | Estado atualizado | — |

## Estado
- [x] 1 — `TasksList.tsx` (2026-09-21)
- [x] 2 — `TasksModule.tsx` (2026-09-21)
- [x] Verificação mecânica: `check-ui-standard.sh` limpo nos 2 arquivos; `tsc --noEmit` limpo;
      `orgContextGuard.test.ts` 14/14; suíte completa — ver commit
- [x] Verificação visual (2026-09-21, Playwright sobre `docs/spikes/tarefas-toolbar/`, 1600×1000,
      container 1016px): toolbar costurada ao card (`border-b` 1px, card `rounded-[10px]`);
      tabela = 1014px = container, sem scroll lateral, borda de Ações encostada na do card;
      `th` 14px sentence case; `td` `px-6 py-2.5`, `border-r` 1px, 14px/400; autofit reagiu
      (title 240→500, assignee 150→278…); popover Espaço lista Todos · Sem espaço · Engenharia ·
      Financeiro; "Engenharia" deixou 1 linha, "Sem espaço" 1 linha, "Limpar" devolveu 4;
      selects dos filtros rápidos 36px / 6px / 14px; modo agrupado com `colSpan=9` cobrindo
      a largura inteira; subtarefa expande com indentação; 0 erros de console/página.

## Verificação
1. Tarefas › Lista (desktop): a busca, o botão Espaço, Filtros, engrenagem e o botão de
   setas horizontais ficam **dentro** do card da tabela, separados dela só pelo `border-b`.
2. Clicar nas setas horizontais ajusta a largura das colunas ao conteúdo; arrastar a
   borda do cabeçalho redimensiona; duplo clique restaura.
3. Espaço › escolher um espaço: a tabela mostra só tarefas daquele espaço; "Sem espaço"
   mostra só as sem `space_id`; o gatilho fica azul com o nome escolhido; "Limpar" zera.
4. Arrastar cabeçalho troca a posição da coluna (persistido); clicar ordena.
