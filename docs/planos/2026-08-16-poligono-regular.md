# Polígono regular — criar contorno fechado de N lados

## Pedido original

Sessão de 2026-08-16:

> atuamente o parede é feita atraves de poligono. implemente opção de criar
> parede através de um poligo fechado com  lados
>
> CONTINUE

Leitura: hoje a parede é traçada como polilinha à mão (que fecha contorno quando
se volta ao primeiro ponto). O pedido é uma ferramenta que cria o **polígono
regular** de N lados de uma vez.

### Pedido seguinte, 16/08/2026, com print

> veja print, o poligono de 4 lados é formado desalinhado (girado) em relacao a
> planta

Confirmou o risco que eu tinha registrado ao entregar ("para 4 lados isso dá um
losango"). Corrigido: ver **A medida mudou de vértice para lado**, abaixo.

## O que entrou

Ferramenta **Polígono** na barra, com seletor de **Lados** (3, 4, 5, 6, 8, 10,
12 — padrão 6). Gesto de dois cliques: o primeiro marca o **centro**, o segundo
fecha. O cursor fica no **meio de um lado**, então o lado nasce perpendicular ao
arraste e, com a trava ortogonal ligada, o polígono sai alinhado à planta.

| Arquivo | Mudança | Como sei que terminou |
|---|---|---|
| `utils/blueprintKernel/geom.ts` | `poligonoRegular(centro, raio, lados, ângulo)` | 7 casos novos em `blueprintKernel.test.ts` |
| `hooks/useBlueprintEditor.ts` | ferramenta `'poligono'` | `tsc` limpo |
| `components/blueprint/BlueprintCanvas.tsx` | estado do gesto, prévia com a cota do lado, e os eixos mitrados | passeio em Chrome |
| `components/blueprint/BlueprintEditor.tsx` | botão, seletor de Lados, e o lote de N paredes | 2 casos em `BlueprintEditor.test.tsx` |
| `docs/spikes/poligono/` | harness novo (canvas real, clique real, dump verificável) | roda e confere sozinho |

### Reaproveita a mitra, não reinventa

Um polígono fechado é exatamente o caso que o fechamento manual de contorno já
resolve: cada lado consulta os **dois vizinhos** e sai com as pontas mitradas
(`eixoDaParede`). Por isso os cantos coincidem e o contorno deriva ambiente — um
polígono que não deriva ambiente seria só decoração.

As N paredes entram num **único lote** (`runBatch`): o polígono é um gesto só, e
desfazê-lo tem que devolver a planta ao que era, não tirar um lado por vez.

### Sentido dos vértices não é arbitrário

Saem no sentido **horário na tela** (ângulo decrescente, porque o Y do modelo
aponta para cima). É o mesmo sentido que o traçado manual pede para a parede
nascer **para dentro** com o alinhamento "à direita". Gerar ao contrário faria o
polígono crescer para fora do que se apontou, sem nada explicando na tela.

### Terceiro pedido, 16/08/2026

> o ponto inicial de uma parede deve ser no canto

E, ao ser perguntado o que exatamente via:

> falei parede mas me referia ao poligono fechado de 4 lados para fazer um
> ambiente. A ideia é usar o poligono para fazer paredes mais rapido!

Isso reenquadrou o problema: **não era o polígono que estava errado, era a
ferramenta que faltava**. Ver **Retângulo**, abaixo.

## Retângulo — a ferramenta que o pedido realmente pedia

O polígono regular de 4 lados é sempre um **quadrado**, e nasce do centro.
Cômodo quase nunca é quadrado, e ninguém pensa um cômodo a partir do centro —
pensa a partir de um canto. Por isso o polígono não servia para "fazer paredes
mais rápido", por mais que se ajustasse a medida ou o giro.

Ferramenta **Retângulo**: clica um canto, arrasta até o oposto, dois cliques e o
ambiente está fechado. Fica **antes** do Polígono na barra, porque é o gesto do
dia a dia — o polígono regular resolve o caso raro (planta sextavada, torre
octogonal).

Decisões que o gesto exige:

- **Sempre alinhado aos eixos**, por construção: os lados são paralelos a x e y.
  Não há giro a escolher, e é isso que se quer ao copiar planta ortogonal.
- **Sem trava ortogonal.** No polígono ela alinha o giro; no retângulo ela
  colapsaria o gesto — prender o segundo canto no eixo do primeiro zera um dos
  lados e não sobra retângulo.
- **Tanto faz de qual canto se arrasta.** O contorno é normalizado para o
  sentido horário da tela; sem isso, arrastar da direita para a esquerda
  inverteria o sentido e a parede nasceria para FORA no alinhamento "à direita".
- **As duas medidas na prévia**, uma em cada lado: é assim que se confere um
  cômodo contra a planta, e uma só não diria nada sobre a outra.

Reaproveita tudo o que o polígono já montou: a mitra dos cantos, o lote único de
paredes e a derivação de ambiente. O estado do gesto é o mesmo (`ancoraDaForma`)
— o que muda é só o que o primeiro ponto SIGNIFICA: centro no polígono, canto no
retângulo.

## A medida mudou de vértice para lado (correção do mesmo dia)

A primeira entrega media pelo **vértice**: o cursor era uma esquina. Arrastando
na horizontal, as esquinas caíam nos eixos e o **quadrado nascia como losango**,
girado 45° sobre uma planta ortogonal. Eu havia registrado isso como risco
aceito na entrega; em uso, com print, ficou claro que não era aceitável.

Agora mede pelo **lado** (`poligonoPeloLado`): o meio de um lado fica sob o
cursor, perpendicular ao arraste. Consequências:

- com a trava ortogonal, **todo polígono de lados pares nasce alinhado** aos
  eixos da planta;
- a distância arrastada vira a **apótema**: arrastar 2 m dá um cômodo de
  4 × 4 m, que é o que se pensa ao desenhar. Pelo vértice, os mesmos 2 m davam
  2,83 m de lado — imprevisível enquanto se desenha;
- a área agora **decresce** com o número de lados para o mesmo arraste (todos
  circunscrevem o mesmo círculo), o inverso de antes. A inversão dessa
  conferência no passeio é o que prova que a medida mudou de fato.

`poligonoRegular` (por vértice) continua no kernel como primitiva geral —
`poligonoPeloLado` delega a ela.

## Um defeito que a ferramenta revelou — e que já existia

O primeiro hexágono desenhado saiu com uma **farpa em cada vértice**. Não era do
polígono: a silhueta de cada parede avança meia espessura além do eixo na ponta
que encontra outra, e **meia espessura só fecha o canto exatamente em 90°**.

A conta certa sai da geometria: com ângulo θ no vértice, as faces externas se
cruzam a `(t/2)/sen(θ/2)` dele, e a tampa da pincelada precisa avançar
`(t/2)/tg(θ/2)`. Em 90° isso dá meia espessura — **por isso passou despercebido
por toda planta ortogonal**. Em 120° (hexágono) a pincelada ultrapassava; em
ângulo agudo, faltava.

Duas coisas importam aqui:

1. **O defeito é anterior ao polígono.** Duas paredes oblíquas traçadas à mão
   sempre tiveram a farpa. O polígono só o tornou sistemático — todo vértice de
   todo polígono com ≠ 4 lados.
2. **A regra estava COPIADA** no canvas e na exportação, com a mesma conta errada
   nos dois. É a divergência que os comentários do próprio módulo avisam que
   acontece ("regra de geometria duplicada é regra que diverge") — só que desta
   vez as duas cópias erravam junto. Agora vive no kernel: `extensaoDeCanto`.

**Risco da correção: baixo por construção.** Em 90° a fórmula devolve exatamente
o valor que estava cravado, então toda planta ortogonal desenha idêntica — na
tela e no papel. Junção em X (3+ paredes) e em T mantêm meia espessura, que é o
comportamento já verificado em uso.

## Verificação (feita, não presumida)

- `npx tsc --noEmit` → limpo.
- `npx vitest run` nos 12 arquivos de blueprint → **347 passando** (20 pulados,
  os de banco que já eram). Nenhum teste existente mudou de valor — a prova de
  que 90° não se mexeu.
- `bash scripts/check-ui-standard.sh` nos 2 `.tsx` → sem violação.
- **Kernel, polígono** (7 casos): um vértice por lado, todos no raio pedido;
  lados iguais; o ângulo posiciona o primeiro vértice; **sentido horário na
  tela**; entrada degenerada devolve vazio sem levantar erro (roda a cada
  movimento do mouse); raio pequeno demais para o número de lados devolve vazio;
  e o caso que importa — **o contorno fecha, os cantos coincidem e deriva UM
  ambiente**.
- **Kernel, canto** (7 casos): 90° dá meia espessura (o valor cravado de antes);
  obtuso avança menos; agudo avança mais; agudo demais é limitado; quase
  colinear quase não avança; ponta livre não avança; junção em X mantém meia.
- **Kernel, retângulo** (6 casos): os dois cantos clicados são cantos do
  retângulo; todo lado sai alinhado aos eixos; **os 4 sentidos de arraste dão o
  mesmo contorno**; sentido horário na tela; cantos na mesma linha/coluna não
  formam retângulo; e o que importa — vira **um ambiente** com a área do cômodo,
  cantos mitrados.
- **Kernel, medida pelo lado** (5 casos): **o quadrado sai alinhado aos eixos**,
  com os quatro cantos exatos (é o caso do print); a distância arrastada é a
  apótema (2 m → lado de 4 m); todo polígono de lados pares fica alinhado ao
  arrastar num eixo; mantém o sentido horário; entrada degenerada devolve vazio.
- **Chrome real** (`docs/spikes/poligono/passeio.mjs`), com ponteiro de verdade
  para 3, 4, 5, 6, 8 e 12 lados: N paredes, **1 ambiente derivado** em todos, e
  cantos compartilhados vértice a vértice. A área **decresce** com o número de
  lados para a mesma apótema (triângulo 79,03 m² → dodecágono 48,91 m², com o
  círculo de 4 m em 50,27) — confere que a apótema está sendo respeitada.
  `saida-4-lados.png` mostra o quadrado alinhado à grade.
- **Chrome real, retângulo**: clique num canto, arraste até o oposto → 4
  paredes, **1 ambiente**, caixa de eixo exatamente em `3100,3100 → 8900,6900`
  (o traçado 6 × 4 m recuado em meia espessura), área de 22,04 m².
  `saida-retangulo.png` e `saida-retangulo-previa.png`.
- **O canto, ampliado** antes e depois da correção: a farpa de 120° sumiu e o
  canto fecha vivo.
- Os passeios de **parede** e **porta** foram rodados de novo: passam sem
  alteração, exercitando os cantos de 90° que não podiam mudar.

## Fora do escopo

- ~~Retângulo livre (dois cantos, lados diferentes)~~ — **entrou em 16/08**, a
  pedido, como ferramenta própria. Ver a seção Retângulo.
- Retângulo GIRADO (dois cantos + um ângulo). Ele sai sempre alinhado aos eixos;
  cômodo torto continua no traçado manual, que aceita qualquer direção.
- Editar o polígono como objeto depois de criado — ele vira N paredes
  independentes, e cada uma se edita como qualquer parede.
- Escolher entre medir pelo lado e pelo vértice. A medida é sempre pelo LADO,
  porque é a que alinha o polígono à planta; oferecer as duas seria um controle
  a mais para um caso que ninguém pediu.
- Corrigir o avanço de canto em junção **T** e **X** com a fórmula do ângulo:
  ficou em meia espessura, o comportamento já verificado. Só faria diferença em
  T/X oblíquos, que ninguém relatou.
