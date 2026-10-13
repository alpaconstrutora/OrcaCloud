# As medidas do corte também na prancha (PDF, PNG, conjunto) e no DXF

## Pedido original

Sessão `cb72b486-263a-49c9-83cc-fd291232608c`, 13/10/2026. Depois das medidas no corte na tela
(`docs/planos/2026-10-13-corte-medidas.md`), o relatório disse: *"essas medidas aparecem só na
tela. A prancha ou PDF exportado do corte ainda sai sem elas; a conta já está pronta para ser
reaproveitada lá, se você quiser"*. Resposta:

> sim implemente

## Diagnóstico

- A exportação chamava `projetarCorte(model, { corte, levelIds })` **sem o terreno** — em
  `projecaoDaPrancha` (pranchas avulsas PDF/PNG e DXF) e em `desenharConjunto` (o conjunto de
  pranchas). Então a prancha do corte saía sem o PERFIL e sem o PLATÔ, não só sem as medidas.
- `enquadrarElevacao` chamava de "vazio" o corte sem parede nem face cortada — um estudo só de
  terreno nem gerava a folha (a tela já tinha sido corrigida disso em 10/09/2026).
- O terreno (amostrador de cota, zero, platô) vive no editor (`terrenoParaCorteComPlato`) e não
  chegava ao `PainelVersoes`, que monta as opções de toda exportação.

## Decisão

- `OpcoesExportacao` ganha `terrenoDoCorte` (o MESMO da tela: a camada "Curvas de nível" ligada) e
  `cotasDoTerrenoNoCorte` / `comprimentosNoCorte` (os itens de Vista › Exibir; ausentes = sim).
- Os três caminhos (`projecaoDaPrancha` ×3 e `desenharConjunto`) passam o terreno a `projetarCorte`.
- Papel (`desenharElevacao`): a terra e o perfil no fundo, o platô tracejado (fase contínua — os
  pontos a 250 mm são menores que o traço a 1:200), e por cima as medidas de `medidasDoCorte` —
  a mesma conta da tela. Rótulo que cairia sobre outro é pulado.
- Enquadramento: terreno não é vazio; com terreno, uma faixa de 10 mm fica reservada abaixo do
  desenho para a cadeia de comprimentos (cabe/escala sugerida/centralização contam com ela).
- DXF: camadas próprias `CORTE-TERRENO`, `CORTE-PLATO`, `CORTE-COTAS` (quem plota o corte
  arquitetônico desliga a terraplenagem). Rótulos SEM acento — o R12 lê no código de página do CAD.

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/blueprintExport.ts` | opções; enquadramento; terreno e medidas no papel | `__tests__/blueprintCortePrancha.test.ts`: corte só de terreno não é vazio e reserva a faixa; os textos (corte 3,00 m, platô 4,00 m, h 3,00 m ×2, 100,00, perfil); os itens de Exibir mandam; a cadeia cai dentro da faixa; sem terreno nada muda |
| 2 | `services/blueprintExportService.ts` | o terreno nos três caminhos | PDF real do conjunto gerado pelo `montarConjuntoPdf` e aberto |
| 3 | `utils/blueprintDxf.ts` | as três camadas, perfil/platô/medidas | teste: camadas em uso, `plato 4,00 m`, `talude 4,50 m - 1:1,5`, sem `platô` |
| 4 | `PainelVersoes.tsx`, `BlueprintEditor.tsx` | o terreno e os dois itens chegam às opções | typecheck |

## Estado

- [x] 1 — 6 testes; mutação: sem a faixa → falha; com "vazio" voltando → falha. 48 testes de exportação/corte/DXF verdes.
- [x] 2 — PDF real (`montarConjuntoPdf`, terreno em rampa contra platô a 101,5): perfil com a terra, platô tracejado, corte 0,25 m / aterro 0,50 m, talude 1,33 m · 1:2,0, níveis 103,00 · 99,75 · 101,50 · piso 100,00, cadeia platô 6,00 m / perfil 26,00 m.
- [x] 3 — DXF do mesmo estudo: 49 referências a `CORTE-COTAS`.
- [x] 4 — typecheck 0 erros (heap 6144; 8192/12288/16384 caíram com segfault do Node 24 nesta rodada).
- [x] Suíte em 4 partes (o Node 24 caiu com V8 "Fatal error"/travou na rodada inteira): 2211 + 1994 + 2046 + 2587 = 8838 = 8804 + 34 pendentes + 0 falhas; build ok; ui-standard (PainelVersoes, BlueprintEditor), xss, origem limpos.
- [ ] Publicação, Vercel, CI
