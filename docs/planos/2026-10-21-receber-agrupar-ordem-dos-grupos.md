# Contas a Receber — "Agrupar" com ordem Crescente / Decrescente (molde ClickUp)

## Pedido original
> financeiro < contas a receber: em conjunto com o filtro de agrupar deve ter um classificacao nos mesmos moldes do clickup.com, no caso é usado um classificar de (crescente e decrescente)
>
> (com print do ClickUp: popover "Agrupar por" com o campo "Forn: Serviço" e, ao lado, o seletor aberto "Crescente ✓ / Decrescente")
>
> Sessão: b860a2e1-10f9-4fc3-ad2d-aacbd42a7030 · 21/10/2026

### Pedido posterior (21/10/2026, mesma sessão)
Depois de eu perguntar "1. Faço o commit e abro um PR rascunho para você publicar? 2. Levo o mesmo seletor
para as outras telas que têm 'Agrupar'?":
> 1 e 2

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 21/10/2026 | O que "Crescente/Decrescente" ordena? | **Os grupos**, pelo valor do campo agrupado — como no ClickUp. As linhas dentro de cada grupo continuam na ordem da coluna clicada no `<thead>` (§6.3). Não é o "Ordenar por" proibido pelo §6.4: aquele reordena linhas. |
| 21/10/2026 | Qual é a ordem "crescente" de cada campo? | Nome (cliente, empreendimento, obra, CC, plano de contas): alfabética pt-BR, sem caixa/acento, números em ordem natural. Status: ordem do fluxo (mapa de rótulos da tela). Vencimento: cronológica. Decrescente inverte. |
| 21/10/2026 | E o grupo "Sem …"? | Sempre por último, nos dois sentidos (no ClickUp o vazio também fica no fim). |
| 21/10/2026 | Muda o comportamento atual? | Sim, nos campos de nome: antes os grupos saíam na ordem da 1ª aparição (seguiam a coluna ordenada); com o seletor, "Crescente" (padrão) = A→Z. Ordem de 1ª aparição não tem sentido com um seletor Crescente/Decrescente ao lado. |
| 21/10/2026 | Seletor só aparece ao agrupar (como no ClickUp)? | Sempre visível; sem agrupamento fica desligado e diz o motivo no `title` — mesma regra do "recolher todos" (pedido de 15/10/2026: o que só aparece ao agrupar não é descoberto). |
| 21/10/2026 | Só Contas a Receber? | Na 1ª entrega, sim (o pedido). Com o "1 e 2", o seletor foi para todas as telas com "Agrupar". |
| 21/10/2026 | Como ligar ~20 telas sem trocar `'aparicao'` por `'rotulo'` em cada uma? | Regra central em `agruparLinhas`: com `direcao` informada, `'aparicao'` vale como `'rotulo'`. Cada tela só passa a direção. Sem `direcao` (nenhuma tela hoje), segue a 1ª aparição. |
| 21/10/2026 | Teste de paginação de Parcelas dependia de "Construtora Alfa" vir antes de "Cimentos Beta" (1ª aparição) | Credor de teste renomeado para "Distribuidora Beta": A→Z mantém o grupo grande primeiro e o corte de página que o teste quer provar. |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/agruparLinhas.ts` | `ordem: 'rotulo'` (alfabética pt-BR) e `direcao: 'asc' \| 'desc'` (inverte os grupos com valor; "Sem …" fica no fim) | `__tests__/agruparLinhas.test.ts` com casos novos verdes |
| `utils/recebivelGrupos.ts` | recebe `direcao`; campos de nome passam a `ordem: 'rotulo'` | `__tests__/recebivelGrupos.test.ts` atualizado e verde |
| `hooks/useAgrupamento.ts` | `direcao`/`setDirecao` persistidos em `<storageKey>:direcao`; trocar zera a âncora do Shift+clique | coberto pelo teste de tela |
| `components/ui/Agrupamento.tsx` | `AgruparControles` com seletor Crescente/Decrescente opcional (`direcao`/`onDirecao`), desligado sem agrupamento com o motivo | coberto pelo teste de tela |
| `components/ContasReceberManager.tsx` | liga o seletor e passa a direção ao `agruparRecebiveis` | `__tests__/components/ContasReceberAgrupar.test.tsx`: A→Z, Z→A, persistência, desligado sem agrupar |
| `docs/ui_ux_guia_unificado.md` | §6.12 documenta o seletor de ordem dos grupos e a diferença para o §6.4 | seção atualizada |

### Plano — fase 2 (todas as telas)
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/agruparLinhas.ts` | `direcao` faz `'aparicao'` valer como `'rotulo'` | caso novo em `agruparLinhas.test.ts` |
| `components/ui/StandardTable.tsx` | passa `direcao`/`onDirecao` (Aprovação Financeira, Ofícios, Recebidos, Modelos) | caso novo em `StandardTableAgrupar.test.tsx` (desligado sem grupo, Z→A paginado, persiste) |
| `utils/boletoGrupos.ts` + `BoletoManager.tsx` | `direcao` na função própria; nome A→Z; estado persistido em `boletoManagerFilters:groupBy:direcao` | caso novo em `boletoGrupos.test.ts` |
| 14 telas feitas à mão (Cobranças, Clientes, Notas, Parcelas, Tributos, Fornecedores, Contratos, Pedidos, Cotações, Recebimento, Almoxarifado ×2, Itens, Ativos ×3, Documentos) | `direcao`/`onDirecao` no controle, `direcao` no `agruparLinhas` e no `useMemo` | Decrescente testado em `FinanceiroAgrupar` (Tributos, Cobranças, Notas), `CadastrosAgrupar` (Clientes), `SuprimentosAgrupar` (Saldos), `ContasPagarParcelasAgrupar`; typecheck |
| guia §6.12 | o seletor passa a ser parte do controle padrão | texto atualizado |

## Estado
- [x] `utils/agruparLinhas.ts` + teste (2 casos novos)
- [x] `utils/recebivelGrupos.ts` + teste (cliente agora A→Z; caso novo de Decrescente em nome/status/mês)
- [x] `hooks/useAgrupamento.ts`
- [x] `components/ui/Agrupamento.tsx`
- [x] `ContasReceberManager.tsx` + teste de tela (3 casos novos/alterados) — 10 arquivos de teste de agrupar + travas: 75/75
- [x] guia §6.12
- [x] `check-ui-standard.sh` (0 violações) + `tsc --noEmit` (rc=0, 0 erros)
- [x] conferência visual no harness sem login `docs/spikes/receber-agrupar-ordem/` (peças de produção, dados fabricados): 10 portões verdes; prints em `c:/tmp/pwtest/ordem-0*.png`
- [x] conferência na tela real com dados reais — servidor da frente, login de leitura, 362 títulos: 15 grupos por cliente A→Z e invertido em Decrescente; status e vencimento (jun/2015 → jun/2029) invertem; recarregar mantém; toolbar sem estouro em 1660 px; 0 escritas, 0 erros (13 portões). Script: `c:/tmp/pwtest/receber-agrupar-ordem.js`; prints `c:/tmp/pwtest/receber-ordem-real-0*.png`
- [x] fase 1 commitada (`8ffa839a`)


Fase 2 (todas as telas):
- [x] regra central em `agruparLinhas` + teste
- [x] `StandardTable`, `boletoGrupos`/`BoletoManager` e as 14 telas feitas à mão (script com contagem por arquivo; dependências dos `useMemo` uma a uma)
- [x] testes: 9 arquivos de agrupar verdes, arquivo a arquivo (`agruparLinhas` 13, `recebivelGrupos` 9, `boletoGrupos` 8, ContasReceber 7, Financeiro 3, Cadastros 10, Suprimentos 7, StandardTable 5, Parcelas 6)
- [x] guia §6.12 (o seletor faz parte do controle padrão)
- [x] `check-ui-standard.sh` nos 17 `.tsx` tocados: 0 violações
- [x] tela real, login de leitura, 6 telas (Parcelas 18 grupos, Boletos 51, Tributos 4, Fornecedores 18, Pedidos 11, Aprovação Financeira 38): Crescente A→Z, Decrescente invertido, "Sem …" no fim, toolbar sem estouro, 0 escritas, 0 erros. Script `c:/tmp/pwtest/agrupar-ordem-todas.js`; prints `c:/tmp/pwtest/agrupar-ordem-*.png`. Uma queda do navegador headless em Fornecedores não se reproduziu (sonda `sonda-fornecedores-agrupar.js`, produção e frente)
- [ ] typecheck da fase 2
- [ ] suíte inteira
- [ ] PR rascunho + CI verde
- [ ] publicação (o usuário mescla)

## Verificação
1. `npx vitest run __tests__/agruparLinhas.test.ts __tests__/recebivelGrupos.test.ts __tests__/components/ContasReceberAgrupar.test.tsx`
2. `bash scripts/check-ui-standard.sh components/ContasReceberManager.tsx components/ui/Agrupamento.tsx`
3. Financeiro › Contas a Receber › Agrupar › Cliente / Parte → grupos A→Z; Decrescente → Z→A; "Sem cliente" no fim nos dois; recarregar mantém a escolha.
