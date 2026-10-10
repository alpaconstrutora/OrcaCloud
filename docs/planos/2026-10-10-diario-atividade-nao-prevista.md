# Diário de Obras — atividade "não prevista no cronograma" + ordem das abas

## Pedido original

> Sessão 3e035fa3 · 2026-10-10
>
> Operacional > Diário de Obras > aba Atividades do Dia:
> 1. Pergunta: Atualmente somente criar uma atividade vinculada ao cronograma ou posso criar uma atividade avulsa ou uma atividade nao prevista no cronograma?
> 2. trocar de posicao entre si das abas Atividades do Dia com Condições Climáticas
> 3.

Resposta dada ao item 1: já dá para lançar avulsa (o vínculo é opcional), mas
nada na tela diz que ela é não prevista e não há como decidir depois se entra no
cronograma.

> Sessão 3e035fa3 · 2026-10-10 (pedido seguinte)
>
> desconsidere item 3
> implemente: O que falta: nada na tela diz que a atividade foi "não prevista". Ela aparece igual às outras, só que sem vínculo. Também não dá para escolher se ela entra no cronograma depois. Se quiser, posso criar uma marcação "Não prevista no cronograma" com um selo na lista.

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-10 | Abrir o editor em qual aba, depois da troca? | Na primeira (Atividades do Dia) — decidido por mim, reportado ao usuário |
| 2026-10-10 | "Não prevista" é derivado (sem `itemId`) ou marcação explícita? | **Explícita** (`unplanned: true`). Sem vínculo não significa não prevista: o app mobile não tem como vincular, e toda atividade lançada nele nasce sem `itemId` |
| 2026-10-10 | "Escolher se entra no cronograma depois" | Desmarcar "Não prevista" e escolher o item do cronograma, editando a entrada. A partir daí ela passa a alimentar o % realizado. Criar **tarefa nova** no cronograma a partir dela ficou fora (o cronograma é derivado do orçamento) |
| 2026-10-10 | Selo no Portal do Cliente? | Não — só nas telas internas (editor, lista, relatório, mobile) |

## Plano

1. **`types/diary.ts`** — `DiaryActivity.unplanned?: boolean`.
   Pronto quando: o campo existe, documentado.
2. **`utils/diaryActivities.ts`** (novo) — `isUnplannedActivity`, `setUnplanned`
   (marcar limpa o `itemId`) e `activityMatchesBudgetItem` (não prevista nunca casa
   com item, nem por descrição).
   Pronto quando: `__tests__/diaryActivities.test.ts` passa.
3. **`components/FinancialSchedule.tsx`** — os dois pontos que casam atividade com
   item do orçamento passam a usar `activityMatchesBudgetItem`.
   Pronto quando: não sobra comparação de descrição inline nesses dois pontos.
4. **`components/ProjectDiaryManager.tsx`** — (a) troca de ordem das abas;
   (b) por atividade, caixa "Não prevista no cronograma"; marcada esconde o
   vínculo e mostra o aviso; desmarcada mostra o vínculo (quando há cronograma);
   (c) coluna Atividades da lista mostra "· N não prevista(s)" em âmbar (§8).
   Pronto quando: `check-ui-standard.sh` limpo e a soma das larguras não cresce.
5. **`components/DiaryMobileApp.tsx`** — mesma caixa por atividade.
6. **`components/DiaryReportViewer.tsx`** — "Não prevista" ao lado da descrição.

## Estado

- [x] 4(a) troca de abas — `85348126`
- [x] 1 tipo · 2 util + teste (6/6) · 3 FinancialSchedule · 4(b)(c) editor e lista
  (+ busca da lista acha "não prevista") · 5 mobile · 6 relatório —
  `check-ui-standard.sh` limpo nos 4 componentes
- [ ] conferência na tela de verdade (não feita nesta sessão)

## Verificação

Diário de uma obra com cronograma vinculado: lançar uma atividade, marcar "Não
prevista", salvar → a lista mostra "· 1 não prevista"; o % do cronograma não muda.
Editar, desmarcar, escolher um item, salvar → o % do item passa a refletir a evolução.
