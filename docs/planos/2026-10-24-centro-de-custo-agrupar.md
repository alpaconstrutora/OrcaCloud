# Minha organização › Centro de custo — "Agrupar" com ordem Crescente/Decrescente

## Pedido original
> implementar filtro agrupar + ordenador do filtro agrupar em Minha organização > centro de custo
>
> Sessão: 6267764c-8162-4cc3-9db5-18ed141cd9cd · 24/10/2026

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 24/10/2026 | "Ordenador do filtro agrupar" = ? | O seletor Crescente/Decrescente da ordem dos GRUPOS (guia §6.12, PR #85), que acompanha o "Agrupar" em toda tela. Não é "Ordenar por" (§6.4): as linhas dentro do grupo seguem a coluna do cabeçalho. |
| 24/10/2026 | Como agrupar uma tela que já é árvore (grupo → centro de custo)? | Agrupar **achata** a lista nos centros de custo e os divide por UM campo. Sem agrupamento, a árvore expansível continua igual. |
| 24/10/2026 | Campos | Centro de custo (grupo) · Organização (**só** em "Todas as organizações") · Empreendimento · Obra. Chave = o MESMO texto da coluna (§6.12). |
| 24/10/2026 | Grupo-pai sem nenhum centro de custo? | Não aparece quando agrupado — não há o que agrupar; na árvore continua listado. Dito na tela vazia, no comentário do código e aqui. |
| 24/10/2026 | Total no cabeçalho do grupo | Não: é cadastro, sem dinheiro (`semTotal`, §6.12 — "R$ 0,00" lê como dado errado). |
| 24/10/2026 | Botão "expandir/recolher tudo" da árvore | Some enquanto agrupa: o controle do Agrupar faz o papel dele (dois botões de chevrons lado a lado confundiriam). |

## Plano
| Item | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/CostCenterModule.tsx` | `useAgrupamento` (`costCenterModule:groupBy`) + `AgruparControles` (com `direcao`/`onDirecao`) na toolbar, depois da busca; `agruparLinhas` sobre os centros de custo já filtrados e ordenados; `LinhaDeGrupo semTotal` no `<tbody>` | `__tests__/components/CentroDeCustoAgrupar.test.tsx` verde |
| 2 | idem | campo guardado que deixou de ser opção ("Organização" ao voltar para uma org) vale como sem agrupamento | teste "uma escolha guardada some…" |
| 3 | `docs/ui_ux_guia_unificado.md` §6.12 | registrar a tela e a decisão de achatar a árvore | texto |

## Estado
- [x] implementação (item 1 e 2)
- [x] teste de tela (`CentroDeCustoAgrupar`)
- [x] typecheck (exit 0, 0 erros) + suítes de Agrupar existentes e `orgContextGuard` verdes + `check-ui-standard.sh` 0 violações
- [x] conferência na tela real (login de leitura, `c:/tmp/pwtest/cc-agrupar.js`): 4 campos (Grupo, Organização, Empreendimento, Obra) com Crescente A→Z, Decrescente = inverso, "Sem …" no fim, recolher/expandir todos, árvore volta igual, toolbar sem estouro, 0 escritas, 0 erros de página
- [ ] PR + CI
- [ ] publicação

## Verificação
1. `npx vitest run __tests__/components/CentroDeCustoAgrupar.test.tsx` + as suítes `*Agrupar*` existentes
2. `bash scripts/check-ui-standard.sh components/CostCenterModule.tsx`
3. Tela real (login de leitura): Minha organização › Centro de custo agrupa por cada campo, Decrescente inverte, "Sem …" no fim, 0 escritas.
