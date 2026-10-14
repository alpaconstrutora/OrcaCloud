# Boletos a Pagar — "Agrupar" (igual a Minhas Tarefas)

## Pedido original
> implementar a funcionalidade agrupar.
> mesma funcionalidade aplicada em minhas tarefas. veja print

Sessão Claude Code VS Code (`c--D-OR-ACLOUD`) · 14/10/2026. Print: tela Tarefas com o
dropdown "Responsável" aberto (Agrupar · Status · Responsável · Prioridade · Obra · Origem) e
a linha de grupo "Altair Pereira da Rosa 2". Escopo da sessão: exclusivamente Financeiro ›
Boletos a Pagar.

## Decisões
| Data | Decisão |
|---|---|
| 14/10/2026 | Replicar o padrão de `TasksModule`/`TasksList` no `BoletoManager` (não há componente reutilizável de agrupamento no repo). |
| 14/10/2026 | Opções: Status, Fornecedor, Obra, Centro de Custo, Vencimento (mês), Capturado por. Só no modo lista. |
| 14/10/2026 | Total (R$) por grupo — extra em relação a Tarefas. Ao lado da contagem (no fim da linha caía fora da tela). |

## Plano / Estado
- [x] `utils/boletoGrupos.ts` — agrupamento puro (ordem de 1ª aparição; status pelo fluxo; vencimento cronológico; "Sem …" por último; total). *Pronto:* `__tests__/boletoGrupos.test.ts` (7).
- [x] `components/BoletoManager.tsx` — select "Agrupar" (persistido `boletoManagerFilters:groupBy`), expandir/recolher todos, cabeçalho de grupo, Shift+clique e "selecionar todos" sobre as linhas NA ORDEM DA TELA (`renderedList`). *Pronto:* conferido na tela (Alpa, 61 grupos por fornecedor; Shift entre grupos marcou 4 de 4; recolher esconde o grupo; sem erros de console).
- [ ] Publicado e conferido em produção.
