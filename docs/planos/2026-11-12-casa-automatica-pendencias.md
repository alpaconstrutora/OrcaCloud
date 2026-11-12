# Casa automática — as pendências da fase "itens 6 a 11": mais pendências com local e o motor dividido por etapa

## Pedido original

Sessão de 11–12/11/2026 (Claude Code, VS Code), depois do PR #377. A mensagem anterior listou o que continuava pendente:
"Dar local a mais pendências" e "O passo 2 da divisão do motor".

> Resolva as pendências

Lido como os dois itens. O passo 2 tinha sido adiado pelo usuário em 12/11 ("Parar no passo 1"); este pedido o retoma.
Plano anterior: `2026-11-11-casa-automatica-itens-6-a-11.md` (inventário do C1 e técnica do D2 passo 2).

## Itens

### P1. Mais pendências com local

**O que muda.** O motor preenche `locais` em mais sete pontos, todos com o elemento à mão:

| pendência | local |
|---|---|
| Mobiliário: não coube / reduzida | o ambiente (`MobiliarioDoAmbiente.spaceId`) |
| Escada: o núcleo come / parte um ambiente (térreo e pavimentos de cima) | o ambiente |
| Prumada pelo meio do cômodo | o trecho e o cômodo — `prumadasPeloMeioDoComodo` passa a devolver `trechoId`/`comodoId` (campos novos; quem usa só os nomes segue igual) |
| Forro: pé-direito livre abaixo do mínimo | os ambientes |
| Elétrica (conferência NBR 5410, faltas e avisos) | os `ids` dos achados |
| Programa: relação violada | `spaceA`/`spaceB` |
| Terraplenagem: muro de arrimo na borda · entrada diante da porta | o ponto do meio da borda (sem id) · a porta |

**Como sei que terminou.** Teste do motor (`blueprintCasaLocaisDasPendencias`) exigindo locais válidos nesses grupos quando
aparecem nas casas de referência; o marco das 8 casas REGRAVADO (as pendências mudam de propósito — dito no PR) e, depois
de regravado, repetindo idêntico; conferência no app ("ver na planta" de uma pendência de mobiliário ou de elétrica).

### P2. O motor dividido por etapa (o D2 passo 2)

**O que muda.** A função `planejarComPavimentos` (`utils/casaAutomatica/orquestrador.ts`, ~2.200 linhas) é partida em
funções de primeiro nível por etapa, como no plano anterior: `ContextoDaCasa` explícito (consts por desestruturação, `let`s
por getter/setter), a troca `m` → `ctx.m` feita pela AST do TypeScript, um bloco por vez (terraplenagem/acesso/muro →
arquitetura → estrutura/telhado → instalações → sobrado).

**Como sei que terminou.** O marco das 8 casas idêntico ao gravado no P1 a cada extração (sem regravar); tsc e a suíte da
CI verdes; nenhum arquivo do motor passa de ~600 linhas (ou, se algum passar, o porquê fica dito aqui).

## Estado

| Item | Situação |
|---|---|
| P1 | feito — 7 pontos do motor com local; teste do motor (térrea e sobrado 12×30); marco REGRAVADO: nas 8 casas mudou SÓ o hash das pendências (modelo, ids, etapas e contagens iguais); no app a casa 12×30 foi de 4 para 8 pendências com "ver na planta" (3 de mobiliário, 1 da NBR 5410) e a de mobiliário marca o cômodo |
| P2 | feito, com 3 arquivos acima de ~600 linhas (porquê abaixo) — 4 extrações, cada uma com o marco idêntico ao do P1: acesso e muro (`etapaAcessoEMuro.ts` 217), arquitetura (`etapaArquitetura.ts` 78), estrutura e telhado (`etapaEstruturaETelhado.ts` 93), instalações (`etapaInstalacoes.ts` 890), sobrado (`sobrado.ts` 691, o bloco `if (divididos)` → `planejarOSobrado(ctx)`); `contexto.ts` 135; orquestrador 2.423 → 767 |

**Como foi feito (P2, 12/11/2026).** Uma ferramenta pela AST do TypeScript com o VERIFICADOR DE TIPOS (scratchpad
`extrair_motor.cjs`): só vira `ctx.x` a referência cujo símbolo é a declaração de fora (a função tinha `r`, `n`, `L`, `q` e
`comandos` sombreados por dentro — troca por nome teria quebrado). Os `const` chegam por desestruturação, os 6 `let`
(`m`, `n`, `telhado`, `terraplenagemDaCasa`, `resumoDoMuro`, `imp`) por getter/setter; o tipo de cada campo do
`ContextoDaCasa` vem do verificador. O orquestrador chama as etapas por embrulhos de mesmo nome (`const instalacoes =
(…) => instalacoesDaEtapa(ctx, …)`), então o roteiro não mudou de texto.

**Por que três arquivos passam de ~600 linhas.** `etapaInstalacoes.ts` (890) e `sobrado.ts` (691) são UMA função cada,
com subetapas internas que compartilham estado local (instalações: mobiliário → âncoras → água/esgoto/pluvial → elétrica →
clima, com os acumuladores de cada disciplina; sobrado: núcleo, pavimentos e as instalações deles). Parti-los é repetir a
técnica um nível abaixo, com um contexto por etapa. `orquestrador.ts` (767) é ~350 linhas do roteiro mais `planejarCasa`,
`planejarTerrea` e os auxiliares de módulo. Fica anotado para quando o motor for mexido de novo.
