# ÒPURA · Relatórios › Centro de Custo — colunas Grupo / Centro de custo + "Agrupar"

## Pedido original
> ÒPURA · Relatórios >
> 1. centro de custo: criar colunas grupo de centro de custo e centro de custo
> 2. implementar filtro grupo como botão de classificacao
> 3. inserir  Botão de expandir e recolher
>
> (seguido de "continue")
>
> Sessão: eb7a70df-6937-45af-869d-83d188d41d9b · 13/11/2026

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 13/11/2026 | O que a aba mostrava antes | Uma árvore (`buildCostCenterTree`, plano de 13/09) numa coluna só: grupo com os totais somados e os centros recuados embaixo; nenhuma coluna ordenava (exceção §6.3). |
| 13/11/2026 | "Colunas grupo de centro de custo e centro de custo" | Lista PLANA: uma linha por centro de custo do pivot, com o grupo (raiz da hierarquia, `parent_id IS NULL`) na sua própria coluna. Com as duas colunas a árvore deixa de ser necessária, e todas as colunas voltam a ordenar (§6.3 sem exceção). |
| 13/11/2026 | "Filtro grupo como botão de classificação" | O "Agrupar" do guia (§6.12) com a opção "Grupo de centro de custo" e o seletor Crescente/Decrescente da ordem dos grupos: o mesmo controle de Minha Organização › Centro de custo (plano de 24/10, pedido "filtro agrupar + ordenador"). O cabeçalho do grupo mostra contagem + soma do realizado (é relatório de dinheiro). |
| 13/11/2026 | "Botão de expandir e recolher" | O botão recolher/expandir todos do `AgruparControles` (sempre visível; desligado com o motivo no `title` quando não há agrupamento). Clicar no cabeçalho do grupo recolhe/expande só aquele. |
| 13/11/2026 | Abre agrupado ou plano? | Agrupado por grupo — era a leitura que a árvore dava. `useAgrupamento` ganha um padrão opcional (`padrao`), e o `StandardTable` o repassa. Escolha do usuário continua persistida. |
| 13/11/2026 | Lançamento gravado direto num grupo (legado, antes da trava do PR #273) | Linha com Grupo = o próprio grupo e Centro de custo = "(lançado no grupo)", em itálico — como o nó sintético da árvore fazia. |
| 13/11/2026 | Centro fora do catálogo / sem centro de custo | Grupo vazio ("—" na célula, "Sem grupo" no Agrupar, sempre por último); Centro = rótulo da RPC / "— Sem centro de custo". |
| 13/11/2026 | CSV | Na aba Centro de Custo, exporta Grupo e Centro de custo em colunas separadas. |

## Plano
| Item | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/opuraCostCenterTree.ts` | `buildCostCenterRows`: pivot + catálogo → linhas planas com o grupo; sai a árvore (`buildCostCenterTree`/`flattenCostCenterTree`, sem outro uso) | `__tests__/opuraCostCenterTree.test.ts` reescrito e verde |
| 2 | `hooks/useAgrupamento.ts`, `components/ui/StandardTable.tsx` | `padrao` opcional do campo de agrupamento | suítes `*Agrupar*` existentes verdes |
| 3 | `components/OpuraReports.tsx` | colunas Grupo de centro de custo / Centro de custo, ordenáveis; `agrupamento` com a opção Grupo, total = realizado; CSV com as duas colunas | `__tests__/components/OpuraReportsCentroDeCusto.test.tsx` reescrito e verde |
| 4 | `docs/ui_ux_guia_unificado.md` §6.12 | registrar a tela | texto |

## Estado
- [x] itens 1–4
- [x] typecheck (exit 0, 0 erros) + 17 suítes / 132 testes (Relatórios, `*Agrupar*`, `agruparLinhas`, `orgContextGuard`) + `check-ui-standard.sh` / `check-system-projects.sh` / `check-project-classification.sh` exit 0
- [ ] conferência na tela real — NÃO feita: o Claude in Chrome não alcançou o servidor local (página de erro em 127.0.0.1 e localhost) e a senha do usuário de leitura não fica guardada
- [ ] PR + CI
- [ ] publicação
