# Conciliação Bancária › Extrato — "Agrupar" com ordem dos grupos

## Pedido original
> implementar filtro agrupar e ordenador de agrupamento tambem na aba extrato
>
> Sessão: a8e2ea08-5228-4f48-a778-da2044c30bf2 · 24/10/2026 (continuação de `2026-10-24-conciliacao-pendentes-agrupar.md`)

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 24/10/2026 | Quais campos? | As colunas da tabela: Contraparte, Categoria, Obra, Centro de Custo, **Plano de Contas**, Data (mês) e **Status** (os dois últimos só existem nesta aba). Descrição não agrupa (texto livre). Status sai na ordem do fluxo (Importado → … → Ignorado), não alfabética. |
| 24/10/2026 | Onde ficam os controles? | Na toolbar acoplada, **logo depois do Filtro avançado** (§6.12) — aqui a tabela ocupa a largura toda, então não precisa da linha própria da Pendentes. |
| 24/10/2026 | Total do grupo? | Saldo (créditos − débitos), como na Pendentes; o `title` explica. |
| 24/10/2026 | Paginação e Shift+clique? | A aba tem paginação própria (não é o `usePaginacaoEmMemoria`): `linhasAba` (linhas da tela, sem os grupos recolhidos) alimenta as páginas, o "N de M" do rodapé e o Shift+clique; o `indice` de `entradasDaPagina` é a posição global. Trocar campo/sentido volta à página 1 e zera a âncora do Shift; recolher não troca de página. |
| 24/10/2026 | Reaproveitar o util da Pendentes? | Sim: `agruparExtrato` ganhou `plano_contas` e `status` (campos opcionais em `NomesDoExtrato`); a Pendentes não os oferece. |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/pendentesGrupos.ts` | `plano_contas`, `status`, `OPCOES_AGRUPAR_EXTRATO_ABA` | `__tests__/pendentesGrupos.test.ts` (12 casos) |
| `components/BankReconciliation.tsx` | `useAgrupamento('extratoBancario:groupBy')`, paginação sobre `linhasAba`, controles na toolbar, `<tbody>` com `LinhaDeGrupo`, Shift+clique sobre a ordem da tela | tela real |
| `docs/ui_ux_guia_unificado.md` §6.12 | registra a aba Extrato | texto |

## Estado
- [x] util + testes 12/12; `tsc --noEmit` rc=0 (0 erros); `check-ui-standard.sh` 0 violações
- [x] tela real (login de leitura, Sicredi 55883-5, 5.464 lançamentos, só leitura, 0 escritas, 0 erros de página): Categoria/Contraparte A→Z e Z→A, Data cronológica, "Sem …" no fim, recolher/expandir todos, rodapé "N de M" das linhas visíveis, recarregar mantém, Shift+clique marca o intervalo exato na ordem da tela (6 de 6) e trocar o sentido zera a âncora. Script `c:/tmp/pwtest/extrato-agrupar.js`
- [ ] PR + CI
