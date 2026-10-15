# Financeiro — propagar "Agrupar" para as demais tabelas

## Pedido original
> propague agrupamento para as demais tabelas do financeiro:
> tributos a pagar, Cobranças, Contas a Pagar, Aprovação Financeira
>
> Sessão: 6480dfb9-9abe-4ab4-adce-d776e13c7443 · 15/10/2026 (logo depois de
> `docs/planos/2026-10-15-contas-receber-agrupar.md`, publicado em `ee3e4eb9`)

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 15/10/2026 | Copiar o código de Contas a Receber em cada tela? | Não — 5 cópias divergiriam (motivo de `StandardTable`/`KpiCard` existirem). Peças compartilhadas: `utils/agruparLinhas.ts` (função pura), `hooks/useAgrupamento.ts` (estado), `components/ui/Agrupamento.tsx` (controle + linha de grupo) e prop `agrupamento` no `StandardTable`. |
| 15/10/2026 | Quais tabelas são "as demais do financeiro" pedidas? | Tributos a Pagar; Cobranças (`ClientChargesModule`, h1 "Cobranças", menu "Boletos ao Cliente"); Contas a Pagar › Parcelas e › Notas; Aprovação Financeira › fila. |
| 15/10/2026 | O que fica de fora, e por quê | Contas a Pagar › Fechamento (relatório consolidado por centro de custo — já é um agrupamento, não lista de registros); Aprovação › faixas de alçada (configuração com 6 parâmetros; não há o que agrupar). |
| 15/10/2026 | Agrupar com paginação (Parcelas, fila de Aprovação)? | A página continua contando LINHAS DE DADO; o cabeçalho do grupo aparece antes da 1ª linha dele na página e, se o grupo começou na página anterior, repete com "continua". Grupo recolhido aparece na página em que cairia. Contagem e total do cabeçalho são do grupo INTEIRO. Desligar a paginação ao agrupar traria de volta o travamento de 2000 linhas de Parcelas. |
| 15/10/2026 | Total do grupo soma o quê? | O valor principal de cada tela (a coluna Valor). |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/agruparLinhas.ts` (novo) | `agruparLinhas` genérico + `chavePorNome`/`chavePorMes` + `entradasDaPagina` (grupos × recolhidos × página) | `__tests__/agruparLinhas.test.ts` verde, incluindo página que começa no meio de um grupo e grupo recolhido na borda da página |
| `utils/recebivelGrupos.ts` | passa a usar o genérico | `recebivelGrupos.test.ts` continua verde sem mudar |
| `hooks/useAgrupamento.ts` (novo) | campo persistido + recolhidos em memória + alternar/alternar todos | usado pelas telas; coberto pelos testes de tela |
| `components/ui/Agrupamento.tsx` (novo) | `AgruparControles` (select + recolher/expandir todos) e `LinhaDeGrupo` | idem |
| `components/ui/StandardTable.tsx` | prop opcional `agrupamento`; sem ela nada muda | teste de componente do StandardTable agrupado + paginado |
| `components/ContasReceberManager.tsx` | troca o markup próprio pelas peças compartilhadas | `ContasReceberAgrupar.test.tsx` verde sem mudar |
| `components/TributosAPagarManager.tsx` | Agrupar: Tributo, Origem, Cliente, Empreendimento, Competência, Vencimento (mês), Status | teste de tela |
| `components/ClientChargesModule.tsx` | Agrupar: Cliente, Tipo, Vencimento (mês), Status | teste de tela |
| `components/ContasPagarParcelas.tsx` | Agrupar: Credor, Origem, Obra, Centro de Custo, Plano de Contas, Vencimento (mês), Status — com a paginação | teste de tela com página que corta um grupo |
| `components/ContasPagarManager.tsx` (Notas) | Agrupar: Fornecedor, Origem, Vencimento (mês), Status | teste de tela |
| `components/FinancialApprovalModule.tsx` (fila) | Agrupar via `StandardTable`: Tipo, Parte, Obra, Vencimento (mês), Status | teste de tela |
| `docs/ui_ux_guia_unificado.md` §6.12 | aponta para as peças compartilhadas e a regra de paginação | seção atualizada |

## Estado
- [x] peças compartilhadas + testes (`agruparLinhas.test.ts`, 10 casos)
- [x] StandardTable (`StandardTableAgrupar.test.tsx`)
- [x] Contas a Receber migrado (`ContasReceberAgrupar.test.tsx` verde sem mudar)
- [x] Tributos a Pagar (`FinanceiroAgrupar.test.tsx`)
- [x] Cobranças (`FinanceiroAgrupar.test.tsx`)
- [x] Contas a Pagar › Parcelas (`ContasPagarParcelasAgrupar.test.tsx`; deep-link e Shift+clique provados nas duas direções)
- [x] Contas a Pagar › Notas (`FinanceiroAgrupar.test.tsx`)
- [x] Aprovação Financeira › fila (via StandardTable)
- [x] guia §6.12
- [x] conferência visual nas 5 tabelas — preview local, login de leitura, dados reais: colSpan do cabeçalho = colunas do colgroup nas 5; "(continua)" na página 2 de Parcelas e da fila; recolher encolhe as linhas; 0 escritas, 0 erros. Script `c:/tmp/pwtest/financeiro-agrupar.js`. Achado e corrigido: Parcelas › Credor criava grupo "—" (texto de ausência) em vez de "Sem credor".
- [x] publicado em `57f14bf7`; domínio carimbado com o commit e os chunks das 5 tabelas com o seletor (Tributos, Cobranças, Notas, Parcelas, fila de Aprovação); CI `ci` success

## Observado nos dados (fora do escopo)
- Contas a Pagar › Notas: o grupo "Energisa" soma R$ 411.896.600,98 — alguma nota tem valor fora de escala. É dado, não o agrupamento; reportado ao usuário.

## Verificação
1. `npx vitest run __tests__/agruparLinhas.test.ts __tests__/recebivelGrupos.test.ts __tests__/components/*Agrupar*.test.tsx`
2. `bash scripts/check-ui-standard.sh` em cada tela tocada
3. Cada tela: Agrupar › cada opção; recolher um grupo; recolher todos; "selecionar todos" com grupo recolhido; nas paginadas, ir à página 2 com um grupo cortado.
