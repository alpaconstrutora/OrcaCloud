# Planta Inteligente — copiar/colar objetos e a trava ortogonal no Terreno

## Pedido original

Sessão de 2026-08-29, mensagem literal do usuário:

> incorporacao < planta inteligente:
> 1. Funcionalidade de copiar e colar objetos (paredes, portas, janelas...)
> 2. Funcionalidade orto deve funcionar também com a ferramenta terreno

Sessão de 2026-08-30, mensagem literal:

> 1. Funcionalidade orto deve funcionar também com a ferramenta terreno
> 2. Ocultar e exibir preenchimento de terreno

E, depois de o usuário testar na tela, sobre o item 1 desta segunda mensagem:

> acabei de testar e esta alinha sim e esta travando. desconsidere esse meu pedido

---

## Item 2 — o que o item pedia já existia, e mesmo assim não funcionava

**Levantamento antes de mexer.** A trava ortogonal JÁ estava ligada à ferramenta
Terreno em `BlueprintCanvas.tsx`, na prévia e no clique, e o harness
`docs/spikes/terreno/medir.mjs` já provava isso em Chrome real (medição 2: com
trava o lado enviesado sai reto; sem trava sai torto). Ou seja: o pedido, lido ao
pé da letra, já estava atendido — e o usuário estava certo assim mesmo.

**A causa real.** `capturarTracado` GRUDA o ponto no primeiro vértice quando o
cursor volta até ele (é assim que o contorno fecha). A trava era aplicada
**depois**, e arrancava o ponto de lá. `fechandoContorno` saía falso, o lado de
fechamento nascia noutro lugar e a polilinha seguia aberta — lote sem área, sem
papéis e sem quadro de divisas. Na prática: **com a trava ligada, o lote não
fechava**, e quem quisesse um lote de lados retos tinha de desligá-la justamente
para conseguir desenhá-lo. O próprio comentário do harness registrava a
convivência com o defeito ("Orto DESLIGADO para traçar o lote irregular").

**A correção: ENCAIXE VENCE A TRAVA** — a regra de todo CAD. A trava só entra
quando o ponto capturado NÃO é o de fechamento. Vale igual para Terreno/Divisa e
para Parede (lá o sintoma era outro: o canto de fechamento ficava aberto por meia
espessura, e canto aberto apaga o ambiente da lista).

- `components/blueprint/BlueprintCanvas.tsx` — 4 pontos (prévia e clique, de
  terreno/divisa e de parede) passam a testar `!fechandoContorno(...)` antes de
  travar. **Pronto quando:** `docs/spikes/terreno/medir.mjs` aprova a medição 6.
- `docs/spikes/terreno/medir.mjs` — medição 6 nova: desenha o lote torto com a
  trava desligada e dá o clique de fechamento COM SHIFT (que a inverte),
  conferindo 5 divisas, anel fechado e área de 104 m².
  ⚠️ **O lote precisa fechar na DIAGONAL.** A primeira versão desta medição era
  um retângulo e **aprovava o código com o defeito**: num lote todo ortogonal o
  último lado é sempre paralelo a um eixo, e a trava devolve o mesmo ponto do
  encaixe. **Pronto quando:** reintroduzido o defeito, a medição REPROVA —
  conferido, sai "NÃO — a trava arranca o clique do 1º vértice e o lote não
  fecha".
- **A armadilha virou TRAVA, não aviso.** O comentário sozinho não bastava — ele
  já existia na cabeça de quem escreveu, e mesmo assim a medição nasceu
  retângulo. Agora o harness confere, ANTES de abrir o navegador, que o lado de
  fechamento difere do primeiro vértice nas duas coordenadas; alinhado, ele
  aborta com `exit 1` explicando por quê, em vez de aprovar tudo calado.
  **Pronto quando:** trocado o último canto para `{x: 0, y: 7000}`, o harness sai
  com "MEDIÇÃO 6 INVÁLIDA" e código 1 — conferido.
  O harness de copiar/colar ganhou a trava equivalente: destino igual à âncora
  daria deslocamento zero, e `saiuInteiro` passaria até para uma implementação
  que ignorasse o cursor.

---

## Item 2, reaberto em 30/08 — e fechado como FALSO ALARME

O usuário repetiu "orto deve funcionar também com a ferramenta terreno". Antes
de mexer em qualquer linha, levantei o que dá para provar sozinho:

- só existe **um** `<BlueprintCanvas>` em produção (o resto é harness), e ele
  recebe `ortogonal` direto do botão da barra;
- o chunk publicado `BlueprintModule-BzYwTjHJ.js` **contém** a correção de 29/08
  (conferido baixando o bundle e procurando "Colar no cursor" e "Orto LIGADO");
- a trava dispara mesmo com as props reais do editor — rodei o harness com
  `alinhamento="DIREITA"` e `passoGradeMm={null}`, que é como o editor nasce, e a
  medição 2 continuou aprovando.

Com isso, perguntei ao usuário o que ele via em vez de adivinhar de novo. Ele
testou e respondeu: **"está alinhado sim e está travando. desconsidere esse meu
pedido"**. Não havia defeito.

⚠️ **A lição é sobre a PRIMEIRA rodada, não sobre esta.** Em 29/08 o mesmo pedido
chegou e eu encontrei um defeito real (o lote não fechava). Quando ele voltou,
a tentação era procurar um segundo defeito — e eu cheguei a montar uma hipótese
elaborada (trava relativa ao lado anterior, para lote girado). Perguntar custou
uma linha e evitou construir uma funcionalidade que ninguém pediu.

---

## Item 3 (30/08) — ocultar e exibir o preenchimento do terreno

> "2. Ocultar e exibir preenchimento de terreno"

Toggle **"Preenchimento do terreno"** no menu Exibir, ao lado de "Preenchimento
dos ambientes".

| Decisão | Por quê |
|---|---|
| Toggle SEPARADO do preenchimento dos ambientes | São figuras de níveis diferentes. O lote é o chão sob tudo, e apagá-lo é o gesto de quem vai conferir o traçado contra o levantamento topográfico — sem perder a cor dos cômodos, que é o que orienta a leitura enquanto se desenha. |
| Vale para o anel pronto E para a prévia em curso | São o mesmo preenchimento em dois momentos; apagar só um faria a cor aparecer e sumir conforme o gesto. |
| Desabilitado por AUSÊNCIA DE DIVISA, não por "lote não fechado" | A prévia também é preenchida, então o toggle precisa estar vivo enquanto o lote nasce. |
| Estado persistido em chave própria | `blueprint:mostrarPreenchimentoTerreno`, como os outros do menu Exibir. |

Arquivos: `BlueprintCanvas.tsx` (prop `mostrarPreenchimentoTerreno`, guardando os
dois pontos de `fill`), `BlueprintEditor.tsx` (estado + item de menu),
`docs/spikes/terreno/` (medição 7).

**Pronto quando:** a medição 7 aprova — ✅. Ela conta **pixels verdes** no miolo
do lote, porque o modelo não muda ao ligar e desligar o preenchimento: nenhuma
leitura de `window.__limites` distinguiria as duas situações. E conta também os
pixels desenhados na tela inteira, senão um toggle que apagasse o desenho todo
passaria. Discriminação conferida: ignorando a prop, sai "NÃO — o verde não
sumiu".

### ⚠️⚠️ `getImageData` MUDA O CANVAS QUE ELE LÊ — e isso não era defeito nenhum

Ao escrever a medição 7 encontrei o que parecia um erro de render: logo após o
lote fechar, 216 px do miolo saíam BEGE em vez de verde, e a contagem pulava de
1197 para 1413 depois que o ponteiro entrava no lote — sem nada mudar no modelo.
**Documentei uma explicação errada** ("sobra do envelope naquele render"; "mover
o mouse não limpa"). O usuário mandou corrigir o detalhe, e investigar até o fim
mostrou que **não havia defeito no produto**:

O Chrome rasteriza o canvas na GPU até alguém pedir os pixels de volta. O
primeiro `getImageData` derruba aquele canvas para rasterização por **CPU**, e a
CPU antisserrilha as linhas a 45° da hachura do envelope de um jeito levemente
diferente. A troca só aparece no **próximo redesenho** — e é isso que engana:

| Experimento | Resultado | O que prova |
|---|---|---|
| 6 leituras seguidas, sem redesenho | 1197, 1197, 1197, 1197, 1197, 1197 | ler não muda o que já está pintado |
| ler, depois mover o mouse (redesenho) | 1197 → **1413**, e fica | o redesenho seguinte já é por CPU |
| medir de DENTRO do próprio desenho | **1413** desde o primeiro quadro | com o `getImageData` no meio do desenho, tudo é CPU desde o início |
| `envelope={[]}` (sem hachura) | 1521 em todos os estados | sem linha a 45° não há diferença de antisserrilhamento |

A "cura pelo movimento do mouse" era coincidência de contagem de leituras, não de
estado. **A correção é no instrumento, não no canvas:** uma leitura de
AQUECIMENTO seguida de um redesenho, antes de qualquer medição que valha — daí em
diante todas as leituras vêm do mesmo rasterizador. Vale para qualquer harness
deste módulo que conte pixel.

A ordem desligado → ligado → desligado ficou, porque prova os DOIS sentidos em vez
de só ida e volta.

---

## Item 1 — copiar e colar objetos

### Decisões de produto

| Decisão | Por quê |
|---|---|
| **Cola no CURSOR** (Ctrl+V), não com deslocamento fixo | É o gesto de CAD. Deslocamento fixo obriga a arrastar a cópia depois, toda vez. |
| **Âncora no canto (x mín, y mín)**, não no centro | O delta sai múltiplo do passo da grade, então a cópia cai NA grade. Com o centro, uma soma ímpar dividida por dois deslocaria tudo meio milímetro para fora dela, calado. |
| **A porta acompanha a parede** copiada, sem ser pedida | É o que "copiar a parede" significa. |
| **Abertura avulsa** (sem a parede) cola na parede sob o cursor | Um deslocamento no plano não diz nada sobre onde uma porta cai: o lugar dela é um offset ao longo do eixo do hospedeiro. |
| Atalhos no `onKeyDown` do **canvas**, não em `window` | Em `window`, o Ctrl+C sequestraria os campos de texto dos painéis desta tela. |
| A cópia **nasce selecionada** | É ela que a pessoa vai ajustar em seguida; sem isso o próximo arraste pega o original de volta. |
| **Não usa a área de transferência do sistema** | O que se copia são ids de um modelo de kernel, não texto. |

### Arquivos

- `utils/blueprintKernel/commands.ts` — comando `DuplicateEntities`
  (`levelId`, `wallIds`, `boundaryIds`, `openings[]`, `delta`). UM comando, e não
  um lote de `AddWall`+`AddOpening`, por duas razões: a abertura precisa do id da
  parede que ainda não existe (o de-para é interno, como em `DuplicateLevel`), e
  um gesto tem de ser UM passo de desfazer.
  ⚠️ **Sem bump de `KERNEL_VERSION`**: comando novo não muda o payload canônico,
  só o modelo resultante. **Pronto quando:**
  `__tests__/blueprintDuplicateEntities.test.ts` passa (13 casos) — ✅.
- `utils/blueprintAreaDeTransferencia.ts` — **novo**. As REGRAS, sem React:
  `copiarSelecao(model, selectedIds)` e `comandoDeColagem(model, area, destino,
  levelId)`. Existe separado porque regra escondida dentro de um componente de
  4.000 linhas só se testa arrastando o mouse.
  **Pronto quando:** `__tests__/blueprintAreaDeTransferencia.test.ts` passa (15
  casos) — ✅.
- `components/blueprint/BlueprintCanvas.tsx` — props `onCopiar`/`onColar`,
  atalhos no `aoTeclar`, e o `ref` `ponteiro` com a última posição do mouse em mm
  (REF, não estado: muda a cada pixel e só é lido no Ctrl+V).
  ⚠️ O `ref` é escrito **antes** de qualquer `return` de `aoMover`, senão colar
  no cursor ficaria sem destino justamente na ferramenta Selecionar.
  **Pronto quando:** `docs/spikes/copiar-colar/medir.mjs` aprova — ✅.
- `components/blueprint/BlueprintEditor.tsx` — estado da área de transferência,
  botões Copiar/Colar na barra, faixa âmbar de aviso e a seleção do que nasceu.
  **Pronto quando:** typecheck limpo e os botões aparecem habilitados/desabilitados
  conforme a seleção — ✅.
- `docs/spikes/copiar-colar/` — **novo harness**. Monta o `BlueprintCanvas` real
  com as funções reais e mede 7 coisas em Chrome. **Pronto quando:** removida a
  linha que registra o ponteiro, o harness REPROVA — conferido, 5 dos 7 vereditos
  caem.

### O que ficou de fora, com motivo

- **Ctrl+D (duplicar no lugar)**: seria um terceiro caminho para a mesma
  operação, com um deslocamento arbitrário embutido. Ctrl+C + Ctrl+V no cursor já
  cobre o caso e é o gesto que a pessoa já conhece.
- **Colar medição**: medição é outra camada, com outra gravação, e **não entra no
  histórico de desfazer** (decisão de `useBlueprintMedicoes`). Copiar junto faria
  um Ctrl+Z reverter metade do gesto.
- **Colar entre estudos/plantas diferentes**: a área de transferência guarda ids
  de um modelo; atravessar estudos exigiria guardar geometria, que é outra
  decisão. O comando já aceita `levelId` de destino, então **colar noutro
  pavimento do mesmo estudo já funciona** no kernel.

---

## Como conferir

```bash
npx vitest run __tests__/blueprintDuplicateEntities.test.ts __tests__/blueprintAreaDeTransferencia.test.ts

npx vite --port 3103
PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
  node docs/spikes/terreno/medir.mjs      http://127.0.0.1:3103
PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
  node docs/spikes/copiar-colar/medir.mjs http://127.0.0.1:3103
```
