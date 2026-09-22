# Tarefas › lista — edição em lote

## Pedido original
> implemente funcionalidade de edicao em lote
>
> Sessão: 62d4f507-b4ab-4368-a7bb-e902f0ed2be1 · 2026-09-22 (sequência dos planos de
> Tarefas de 2026-09-21: toolbar acoplada, painel lateral removido, seletor de org removido)

## Decisões de implementação (guia §10 / §10.1 / §14 / §22 / §26 / §30)
- **Seleção**: coluna de checkbox na tabela (entre o grip e o círculo de concluir),
  "selecionar todos" no cabeçalho marca **as linhas renderizadas** (grupos abertos +
  subtarefas expandidas), Shift+clique seleciona intervalo na ordem em que as linhas
  aparecem (§10.1), com `title` de dica no checkbox.
- **Barra de ações em lote** (§10): fixa no rodapé, azul, com contagem · **Editar em lote**
  · **Concluir** · **Excluir** (vermelho — destrutivo) · **Desmarcar**.
- **Editar em lote** abre um painel lateral (`Sheet`, §26 — REGRA #4) com os campos que
  fazem sentido para várias tarefas de uma vez: Status, Prioridade, Responsável, Obra,
  Espaço → Pasta, Data inicial, Vencimento. Cada campo nasce em **"Não alterar"**; os
  anuláveis têm **"Remover"**; datas têm modo Não alterar / Definir / Limpar. Trocar o
  espaço zera a pasta (ou define a escolhida). Status grava `status_id` + o legado
  `status` (`done`/`open`) coerente com `is_done`.
- **Concluir** = mesmo patch do check da linha (status "concluído" da org, ou legado).
- **Excluir** pede `useConfirm()` (§14, variante danger) avisando que subtarefas vão junto
  (FK `parent_task_id ON DELETE CASCADE`).
- **Gravação**: um `update … .in('id', ids).select('id')` / `delete … .select('id')`; a lista
  local é atualizada só com os ids que o banco devolveu (§22) — a RLS pode recusar tarefas
  de outro dono num espaço compartilhado; se sobrou id não gravado, recarrega e avisa no
  painel.
- Kanban e cartões mobile ficam fora (sem seleção).

## Plano
| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/TaskBulkEditSheet.tsx` (novo) | Painel com os 7 campos, "Não alterar" por padrão, resumo das tarefas, erro inline | `tsc` limpo; harness aplica patch parcial |
| 2 | `components/TasksList.tsx` | Coluna de seleção (colgroup/thead/tbody + colSpans), Shift+clique, barra §10, props `bulk` | `check-ui-standard.sh` limpo; largura padrão continua ≤ 1290 |
| 3 | `components/TasksModule.tsx` | `bulkUpdate` / `bulkDone` / `bulkDelete` (+ `useConfirm`), abre o painel, atualiza estado local | `tsc` limpo; harness: escritas em lote abortadas pelo Playwright chegam com `.in('id', …)` |
| 4 | `docs/spikes/tarefas-modulo/` | Harness cobre selecionar, barra, painel e concluir/excluir (escritas abortadas) | prints + 0 erros |

## Estado
- [x] 1 · [x] 2 · [x] 3 · [x] 4 (2026-09-22; a prova vive em `C:/tmp/pwtest/tarefas_lote.js`
      sobre o harness `docs/spikes/tarefas-modulo/`, escritas respondidas pelo Playwright)
- [x] Verificação mecânica: `tsc` limpo; `check-ui-standard.sh` limpo nos 3 arquivos;
      `orgContextGuard` 14/14; suíte completa — ver commit
- [x] Verificação visual/comportamental: A + Shift-clique em C → 3 marcadas, barra azul fixa
      "3 selecionadas · Editar em lote · Concluir · Excluir · Desmarcar"; painel com 7 campos
      em "Não alterar" e "Aplicar" desabilitado até mexer; Prioridade = Alta → um único
      `PATCH tasks?id=in.(t1,t2,t3)` com body `{"priority":2}`, as 3 linhas viram Alta, seleção
      zerada; Concluir → `PATCH … id=in.(t1)` `{"status":"done","status_id":"s3"}`, linha
      riscada; Excluir → `useConfirm` danger ("As subtarefas delas também serão excluídas") →
      `DELETE … id=in.(t3)`, C e a subtarefa somem da lista; 0 erros.
- Largura padrão da tabela: com a coluna de seleção (36px), Nome 240→220, Responsável
  150→140, Obra 160→150 — soma 1284 ≤ 1290.

## Verificação
1. Marcar 2 linhas (uma com Shift) → barra azul "2 selecionadas" no rodapé.
2. Editar em lote › Prioridade = Alta, resto "Não alterar" → só a prioridade muda nas 2.
3. Concluir → as 2 ficam riscadas com check verde.
4. Excluir → confirmação → somem (e as subtarefas delas).
