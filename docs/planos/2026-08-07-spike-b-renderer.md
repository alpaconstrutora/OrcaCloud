# Spike B (parte 2) — renderer: SVG × Canvas 2D × WebGL

## Pedido original

> spike b

Sessão de 2026-08-07. Fecha a metade que faltava do Spike B (PRD §30) e decide
**DP-03** (renderer). Complementa
[`2026-08-07-spike-b-escala-kernel.md`](./2026-08-07-spike-b-escala-kernel.md).

---

## 1. Montagem

Harness isolado, reprodutível, em `docs/spikes/renderer/`:

- `harness.html` — três renderers sobre a **mesma geometria** da bancada do kernel
  (grade de salas de 3×3 m), expondo `window.runBench(modo, alvo)`.
- `drive.mjs` — driver Playwright.

```bash
PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
  node docs/spikes/renderer/drive.mjs
```

O projeto **não** ganhou dependência de Playwright — é ferramenta de spike, resolvida
por env var.

Navegador: **Chrome instalado na máquina**, com janela, GPU real
(`ANGLE (NVIDIA GeForce RTX 4060 Ti, D3D11)`). Não o Chromium empacotado do
Playwright, que cai em GL por software e mediria outra máquina.

## 2. Duas medições descartadas antes de virar resultado

Registro porque as duas produziram números que pareciam conclusivos e eram lixo.

**Primeira: build de 20 mil elementos SVG em 26 ms.** Implausível. O relógio parava
antes de o layout acontecer — media enfileiramento, não trabalho. Corrigido com um
`settle()` que força `getBoundingClientRect()` antes de parar o cronômetro. O número
honesto é 44 ms.

**Segunda: `rafFps` caindo para 1.** Na segunda rodada quase todas as linhas
devolveram 1 ou 0 fps. Não era desempenho: o Chrome estrangula
`requestAnimationFrame` quando a janela sai da frente, e ela saía depois do primeiro
benchmark. Corrigido com `--disable-background-timer-throttling`,
`--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding` e
`bringToFront()` antes de cada medição.

Também houve um erro de desenho do experimento: a primeira versão media só
panorâmica por `transform`, e **os três passavam com 60 fps**. Panorâmica por
transform não é o trabalho que separa os renderers — separa o que muda **por
elemento**. A medição foi refeita com seleção e hit-test, que o PRD pede
explicitamente e a primeira versão ignorava.

## 3. Resultado — 20 200 objetos, duas execuções

| renderer | buildMs | panMs | **selMs** | hitMs | rafFps |
|:---|--------:|------:|------:|------:|-------:|
| SVG | 44 / 45 | 0,30 | **1,10 / 1,10** | 0,42 / 0,45 | 61 / 60 |
| Canvas 2D | 1 / 1 | 0,40 | **0,40 / 0,40** | 0,03 / 0,03 | 60 / 61 |
| WebGL | 5 / 5 | 0,00 | **0,00 / 0,00** | 0,03 / 0,03 | 60 / 60 |

Escala do custo de seleção (5% dos objetos), que é onde a diferença mora:

| objetos | SVG | Canvas 2D | WebGL |
|--------:|----:|----------:|------:|
| 5 100 | 0,20 ms | 0,10 ms | 0,00 ms |
| 9 940 | 0,50 ms | 0,20 ms | 0,00 ms |
| 20 200 | 1,10 ms | 0,40 ms | 0,00 ms |

Reprodutível entre execuções: as duas rodadas batem casa a casa.

## 4. Leitura

**Os três atingem o RNF-003.** 60 fps em 20 mil objetos, os três. A decisão DP-03
**não** é forçada por pan/zoom — e é honesto dizer que qualquer um dos três
funcionaria hoje.

A diferença está na **folga** e em **onde** o custo cai:

- **WebGL** desenha de graça (<0,005 ms/quadro) e é indiferente à seleção. Custo:
  a maior complexidade de código dos três — shader, buffer, uniform, e todo o resto
  do editor (texto, cotas, ícones) precisa ser reimplementado ou sobreposto.
- **Canvas 2D** gasta 0,4 ms num orçamento de 16,7 ms — **2,4% do quadro**. Constrói
  em 1 ms. Código trivial. Seleção custa o mesmo que um redesenho porque *é* um
  redesenho.
- **SVG** passa hoje, mas seu custo cresce exatamente onde um editor trabalha o dia
  inteiro: 1,10 ms para marcar 5% dos objetos, quase 3× o Canvas 2D, e 44× o custo
  de construção. Além disso carrega 20 mil nós de DOM vivos.

## 5. Recomendação para DP-03

**Canvas 2D como renderer padrão da geometria, com sobreposição em DOM para
interação e acessibilidade. WebGL fica como saída de emergência documentada.**

O raciocínio:

1. Canvas 2D entrega o RNF-003 com 97,6% do quadro sobrando, em código que qualquer
   pessoa do time lê. Não há problema a resolver que justifique WebGL hoje.
2. WebGL só se paga se o orçamento de objetos crescer muito além de 20 mil ou se
   entrarem efeitos por-pixel. Os números dizem que essa hora não chegou.
3. SVG puro é o que eu **não** recomendaria: paga mais caro justamente na operação
   mais frequente do editor, e o DOM cresce com o desenho.

**Mas o "híbrido" do PRD tem uma razão que este spike não mediu.** O RNF-008 exige
teclado, foco visível e contraste. Canvas é um retângulo opaco para leitor de tela —
não tem elemento focável, rótulo nem árvore de acessibilidade. SVG tem, de graça.

Por isso a recomendação não é "canvas e pronto": é **canvas para a massa de
geometria + DOM para o que precisa ser focável e anunciável** (alças de seleção,
cotas ativas, o objeto sob edição). Isso mantém o DOM na casa das dezenas de
elementos em vez de dezenas de milhares, e é o que a palavra "híbrido" deveria
significar no PRD.

## 6. Limites desta medição — o que NÃO foi provado

- **`hitMs` não é comparação justa.** Canvas e WebGL usam varredura de caixa com
  saída no primeiro acerto; o SVG usa `elementFromPoint`, que faz hit-test de
  verdade. O número do canvas é otimista. A conclusão não depende dele.
- **Hardware forte.** RTX 4060 Ti. O PRD fala em "hardware-alvo" sem definir qual.
  Enquanto isso não for definido, estes números valem como teto, não como piso.
- **Só primitiva de linha.** Sem texto, cotas, hachura ou ícone. Uma planta real tem
  todos, e é justamente aí que Canvas 2D fica mais trabalhoso que SVG.
- **Sobreposição raster em tiles não foi medida** — o PRD §30 pede explicitamente, e
  ela é central ao Digitalizador (a imagem original por baixo do traçado).
- **Acessibilidade não foi medida**, só argumentada. É a lacuna mais relevante da
  recomendação acima.

## 7. Efeito sobre DP-04 (Rust/WASM)

**Pode ser fechada a favor do TypeScript, com evidência dos três lados:**

| evidência | origem | resultado |
|:---|:---|:---|
| Determinismo | Spike A | 32/32 casos, payload byte-idêntico |
| Escala do kernel | Spike B pt. 1 | 20 mil paredes em 142 ms (era 11 746) |
| RNF-003 | Spike B pt. 2 | 60 fps nos três renderers, kernel fora do laço |

O kernel não participa do laço de pan/zoom. Ele roda na **edição**, e ali 142 ms é
confortável para fim de arrasto. Arrasto ao vivo continua pedindo **recálculo
incremental (RF-065)** — não outra linguagem.

## 8. Critério de pronto

- [x] Harness isolado e reprodutível, com driver Playwright, sem dependência no projeto
- [x] Chrome real com GPU real, não Chromium empacotado
- [x] Três renderers sobre a mesma geometria, em 5 mil / 10 mil / 20 mil
- [x] Duas medições descartadas por artefato, documentadas
- [x] Experimento redesenhado para medir trabalho por elemento, não só transform
- [x] Números reproduzidos em duas execuções
- [x] DP-03 recomendada com o que a medição sustenta, e o que não sustenta declarado
- [ ] **Pendente:** definir "hardware-alvo" do RNF-003 e remedir no piso, não no teto
- [ ] **Pendente:** medir sobreposição raster em tiles (PRD §30)
- [ ] **Pendente:** provar a camada DOM de acessibilidade (RNF-008) sobre canvas
- [ ] **Pendente:** medir com texto, cotas e hachura, não só linhas
