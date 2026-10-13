# Medidas no corte: cotas de nível, corte/aterro, comprimentos, régua e Medir

## Pedido original

Sessão `cb72b486-263a-49c9-83cc-fd291232608c`, 13/10/2026. Print de um corte só com terreno
(perfil marrom), a linha do piso e o platô tracejado azul com os taludes:

> outro ponto. Cortes (veja print): Como exibir as medidas ?

A resposta foi que hoje o corte só tem "Cotas de altura" (e só com parede atrás do plano), e a
proposta de cinco itens: 1. cotas de nível no perfil; 2. corte e aterro (e a altura de cada talude);
3. comprimentos horizontais; 4. régua vertical com escala; 5. Medir dentro do corte. Resposta:

> começar por 1 + 2 + 3, ne sequencia 4 e depois 5.

## Diagnóstico

- `ElevationCanvas.tsx` desenha elevação e corte; a geometria vem de `projetarCorte`
  (`utils/blueprintCorte.ts`): `perfilDoTerreno` (terreno natural, `v` em mm a partir do zero do
  desenho), `platoNoCorte` (platô + talude + face de muro, em pedaços) e `linhaDoSolo` (o piso).
- A projeção NÃO diz qual ponto do platô é platô e qual é talude, e não carrega a cota absoluta do
  zero (`cotaZeroM` fica no `TerrenoParaCorte`). Sem as duas coisas não há o que cotar.
- As bordas do platô saem amostradas no passo (250 mm): medir o comprimento pelo ponto amostrado
  erraria até um passo. A borda exata é a interseção da linha de corte com o anel.

## Decisão

- `projetarCorte` passa a devolver `cotaZeroM`, as `bordasDoPlato` (u exatos onde a linha cruza o
  anel) e cada ponto de `platoNoCorte` com `trecho: 'PLATO' | 'TALUDE' | 'MURO'`.
- As medidas são uma função PURA nova (`utils/blueprintCorteMedidas.ts` → `medidasDoCorte`), que o
  canvas só pinta — e que a prancha poderá reusar depois.
  - **1 · Níveis**: terreno nas pontas, no ponto mais alto e no mais baixo; platô (um rótulo por
    trecho plano, dois se for inclinado); o piso `±0,00 = cota`. Cota absoluta, `887,94`.
  - **2 · Corte/aterro**: a maior diferença terreno − platô (corte, vermelho) e a maior platô −
    terreno (aterro, azul), como cota vertical entre as duas linhas; cada talude com a altura e a
    inclinação (1:x).
  - **3 · Comprimentos**: uma linha de cotas abaixo do desenho com cada talude e cada trecho de
    platô (bordas exatas); outra com a extensão do perfil do terreno.
- Dois itens novos em Vista › Exibir, só no corte: "Cotas do terreno" (1 + 2) e "Comprimentos"
  (3). Sem terreno no corte, ficam desabilitados dizendo o motivo (ligar as curvas de nível).
- Rótulo que cairia sobre outro é pulado (o primeiro a ocupar o lugar fica).

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/blueprintCorte.ts` | `cotaZeroM`, `bordasDoPlato`, `trecho` nos pontos do platô | Testes: borda exata do platô num anel conhecido; trechos marcados; os testes de corte existentes passam |
| 2 | `utils/blueprintCorteMedidas.ts` (novo) | `medidasDoCorte` | Testes: níveis (pontas, máx., mín., platô, piso), corte e aterro máximos com o `u` certo, talude (altura, 1:x), comprimentos que somam |
| 3 | `components/blueprint/ElevationCanvas.tsx` | Pinta níveis, cotas verticais e a cadeia horizontal | Harness/foto do corte com terreno e platô: cotas legíveis, sem sobreposição |
| 4 | `components/blueprint/BlueprintEditor.tsx` | Os dois itens no Exibir (persistidos) | typecheck; item desabilitado diz o motivo |
| 5 | (etapa 4) `marcasDaRegua`, `escalaGrafica` + canvas + "Régua e escala" no Exibir | Régua à esquerda (cota absoluta no corte com terreno; altura ±0 na elevação), linhas de nível ao fundo, escala gráfica no canto; o passo é o primeiro redondo com 36 px | Testes de passo/rótulo/escala; foto do corte e da elevação |
| 6 | (etapa 5 do pedido) Medir no corte | — | a planejar ao fechar a régua |

## Estado

- [x] 1 — `bordasDoAnelNoCorte` (exata, inclusive anel girado), `trecho` nos pontos, `cotaZeroM`; os 42 testes de corte existentes passam.
- [x] 2 — `__tests__/blueprintCorteMedidas.test.ts` (11): corte 3,00 / aterro 2,00; talude 4,50 m a 1:1,5 com h 3,00 (pé refinado no encontro com o terreno, ±5 mm); platô 3,80 m pela borda exata fora do passo; níveis sem repetir; muro 4,00 m. Mutação: sem o refino do pé → falha; sem a borda exata → falha.
- [x] 3 — harness `docs/spikes/topografia/?vista=corte&plato=1&medidas=1`: aterro 1,08 m, talude 1,58 m · 1:1,5 com h 1,05 m, platô 8,00 m, perfil 11,75 m, cotas nas pontas e no piso, sem rótulo sobreposto.
- [x] 4 — "Cotas do terreno" e "Comprimentos" em Vista › Exibir, só no corte; sem terreno, desabilitados com o motivo. typecheck 0.
- [x] Suíte 8827 = 8793 + 34 pendentes + 0 falhas; `vite build` ok; ui-standard (ElevationCanvas, BlueprintEditor), xss e origem-do-deploy limpos.
- [x] 1–3 publicados em `795aef8b` (13/10/2026): domínio carimbado `795aef8` com "Cotas do terreno", Vercel success, check-run `ci` success.
- Fora desta etapa: as medidas ainda não saem na prancha/PDF do corte (a função é pura, para reusar lá).
- [x] 5 (régua) — 3 testes (passo 2 m a 0,02 px/mm em cotas absolutas 878…886; relativas ±0/+/−; escala 5 m = 100 px). Fotos: corte `topografia/?vista=corte&plato=1&medidas=1` (piso 101,50 na marca 101,5) e elevação `blueprint-elevation/?regua=1&cotas=1` (5,60 m chega a +5,6). typecheck 0; suíte 8830 = 8796 + 34 + 0 (a 1ª rodada perdeu 4 testes num "Fatal error" do V8 — repetida até a conta fechar); build, ui-standard, xss, origem limpos.
- [ ] 5 publicado · [ ] 6 (Medir)
