# Massa invisível com a camada Terreno oculta (27/10/2026)

## Pedido original

> "cliquei em aplicar neste estudo porem nao aparece na planta e nem no 3d"

(Chegou depois da PR #196, que fez "Aplicar neste estudo" e a abertura da planta enquadrarem o desenho.)

## Diagnóstico

- No banco estava tudo certo. O rascunho (`blueprint_branches.draft_payload`) da "Planta 26/10/2026" foi gravado às
  11:25 UTC com o lote (4 divisas) e os 3 blocos: Subsolo, Torre A e Torre B.
- O problema estava no navegador do usuário (Claude in Chrome, só leitura do `localStorage`).
  `blueprint:camadasPorDisciplina:v1` tinha `TERRENO: "OCULTA"`, e também ESTRUTURA, ELÉTRICA, HIDRÁULICA e INCÊNDIO
  ocultas. Só Arquitetura e Mecânica estavam à vista, provavelmente resto de um Isolar. Os blocos de massa e as
  divisas moram na camada Terreno (`classificarPecas`), e por isso somem da planta (`ocultosNoCanvas`) e do 3D
  (`ocultosNo3d` e `terrenoAVista`).
- Prova: depois de ligar o olho da Terreno, as torres apareceram no 3D.

## Correção

1. `comTerrenoAVista(estados)` (puro, em `utils/blueprintCamadasPorDisciplina.ts`) devolve o estado com a Terreno à
   vista, ou `null` quando ela já aparece. O meio-tom conta como à vista.
2. "Aplicar neste estudo" (`aplicarMassaGerada`) liga a Terreno se estiver oculta e avisa na faixa âmbar.
3. Abrir um estudo só de massa (blocos sem paredes) com a Terreno oculta liga a camada uma vez por abertura do ramo
   e avisa. Depois disso vale o olho da pessoa. O efeito fica abaixo de `camadas` para evitar a TDZ.

## Verificação

- `__tests__/blueprintCamadasPorDisciplina.test.ts`, teste "massa com a camada Terreno oculta".
- tsc e suíte da Planta; CI do PR.
- Produção: no navegador do usuário (Terreno estava oculta), reabrir a planta e conferir que o lote e as torres
  aparecem com o aviso.
