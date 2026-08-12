# Planta Inteligente — traçado pela face e rótulo sobreposto

## Pedido original

Sessão de 2026-08-12, com print anexado (prévia azul de parede com o texto
"2,00 m" por cima da própria faixa):

> planta inteligente:
> 1.  ao desenhar parede o ponto deve ser nos cantos da parede
> 2. veja print que a medida da parede fica sobreposta a parede quando em zoom out.

Esclarecimento pedido na mesma sessão (o item 1 tinha duas leituras possíveis,
porque o kernel guarda parede pelo EIXO): perguntei se era (a) desenhar pela
face, (b) encaixar nos cantos das paredes existentes, ou (c) as duas.
**Resposta: "As duas coisas".**

Pedido seguinte, mesma sessão, depois da entrega dos dois itens:

> implementar tecla para inventer o lado

## O que estava errado

**Item 1.** `Wall` é eixo + espessura (`utils/blueprintKernel/model.ts:23`), e o
clique virava o eixo direto. Quem copia planta de fundo aponta o CANTO desenhado,
então a parede nascia meia espessura para fora do que estava na imagem. E o ímã
de encaixe só oferecia as pontas do EIXO — que ficam no meio da espessura, onde
não há nada para mirar na tela.

**Item 2.** O rótulo de comprimento era escrito em `(meio + 8, meio − 8)`:
deslocamento fixo, em diagonal, em pixels de tela. Assim que a espessura
desenhada passava de 16 px, o número caía dentro da faixa da parede.

## O que mudou, arquivo por arquivo

| Arquivo | Mudança | Como sei que terminou |
|---|---|---|
| `utils/blueprintKernel/geom.ts` | `AlinhamentoParede`, `eixoDaParede` (deslocamento + **mitra** do canto, com teto de farpa) e `cantosDaParede` | 11 casos novos em `__tests__/blueprintKernel.test.ts`, incluindo "o modelo ACEITA o contorno mitrado e ele deriva um ambiente" |
| `utils/blueprintKernel/index.ts` | exporta os três | `tsc --noEmit` limpo |
| `utils/blueprintKernel/commands.ts` | `ModelHistory.applyMany` — lote como UM passo de histórico | um "desfazer" desfaz o gesto inteiro (parede + canto corrigido) |
| `hooks/useBlueprintEditor.ts` | `run` devolve os ids criados; novo `runBatch` | `fecharComPorta` volta a criar a porta (ver abaixo) |
| `components/blueprint/BlueprintCanvas.tsx` | `capturar` passa a oferecer os 4 cantos do corpo; traçado guarda a POLILINHA (`cadeia`) para mitrar canto e fechamento; prévia desenhada sobre o eixo resolvido; `escreverRotulo`/`rotuloDoTraco` | passeio com ponteiro de verdade: `docs/spikes/parede-face/passeio.mjs` → CONFERÊNCIA OK |
| `components/blueprint/BlueprintEditor.tsx` | seletor "Clique: na face / no eixo" na barra; `adicionarParede` grava parede + correções num lote | print `saida-contorno.png` |
| `docs/spikes/parede-face/` | harness novo (canvas real, clique real, dump verificável) | roda e confere sozinho |

### Tecla para inverter o lado (pedido de 12/08, depois da 1ª entrega)

**Barra de espaço**, como no Revit, tratada no `onKeyDown` do próprio canvas —
não num ouvinte de `window`. Duas razões: o canvas é quem tem o foco enquanto se
desenha, e espaço no `window` seria sequestro de tecla (é ele que aciona botão e
abre `select`, e a barra de ferramentas desta tela É a camada acessível por
teclado). Bônus: fica exercitável pelo harness, no código real, em vez de uma
cópia da regra.

Do modo EIXO a tecla passa a desenhar pela face (`DIREITA`): "o outro lado do
eixo" não existe, e devolver o mesmo estado faria a tecla parecer quebrada.

**Inverter no meio de uma cadeia NÃO mitra a junção.** Duas paredes de lados
diferentes não têm canto: a interseção seria calculada com um lado só, e corrigir
a ponta da anterior por essa conta a deixaria TORTA, com o eixo fora de paralelo
com a linha traçada. Por isso `trechos` guarda `{ wallId, lado }` — onde o lado
muda, a junção fica com um degrau, que é a consequência honesta de mudar de lado
ali. O fechamento do contorno só mitra se o primeiro trecho for do mesmo lado.

### Padrão do canto (por que a mitra não é enfeite)

Deslocando cada trecho por conta própria, as pontas de um canto reto ficam a meia
espessura uma da outra **em cada eixo** — o contorno não fecha e o ambiente não
aparece. A mitra é a interseção das duas faces deslocadas. Como o trecho seguinte
só existe depois, cada novo trecho **corrige a ponta do anterior** (`MoveVertex`)
no mesmo lote — e o clique que volta ao primeiro ponto corrige também a ponta
inicial, fechando o contorno.

Lote recusado (caso real: abertura que não caberia na parede encurtada) → a
parede entra **sem** a mitra: canto com folga visível, que se arruma arrastando,
em vez de perder o clique em silêncio.

## Defeito adjacente corrigido no caminho

`fecharComPorta` lia `editor.model.walls[antes]` **depois** do `run`. `editor.model`
é estado de React: dentro do mesmo tratador ele ainda é o modelo anterior, a
leitura devolvia `undefined`, e a porta nunca era criada — o vão fechava com
alvenaria cheia e o quantitativo contava parede onde havia porta, sem nenhum erro
na tela. Agora o id vem do retorno do comando.

## Verificação (feita, não presumida)

- `npx tsc --noEmit` → limpo.
- `npx vitest run` nos 4 arquivos de teste do kernel/quantitativos/exportação →
  **121 passando**, sem golden alterado.
- `bash scripts/check-ui-standard.sh` nos dois `.tsx` → sem violação.
- Passeio com Playwright (`docs/spikes/parede-face/passeio.mjs`), traçando o
  contorno externo 12000×7000 mm com espessura 1200 mm:
  - eixos em 2600…13400 × 2600…8400 — ou seja, **o ponto clicado é o canto** do
    corpo, com meia espessura para dentro em cada lado;
  - os 4 cantos compartilham vértice (`atual.b === proxima.a`);
  - **1 ambiente** derivado, área 10800 × 5800 mm² — o contorno fechou;
  - `saida-rotulo.png`: a medida "6.00 m" fica **acima** da faixa, sem tocá-la.
- Regressão do modo eixo (`?alinhamento=EIXO`): eixos exatamente nos pontos
  clicados (12000×7000, área 84 m²) — o caminho antigo não mudou.
- Encaixe no canto: clique 4 px fora do canto visível grudou nele
  (`a.x = 2000`, não o 2100 da grade).
- Barra de espaço (no mesmo passeio, com `keyboard.press('Space')` depois de
  clicar no canvas — o que também prova que o canvas ganha foco no clique):
  - o lado inverteu (`DIREITA` → `ESQUERDA`);
  - o trecho anterior saiu com eixo em `y=10400` (à direita do traçado) e o
    seguinte em `x=9400` (à esquerda; à direita teria dado 10600);
  - a ponta do trecho anterior **não foi mexida** (`b.x = 10000`) — a junção não
    mitrou por cima da troca de lado;
  - `saida-inversao.png` mostra o "L" com o degrau na junção e nada torto.
- Rótulo "0,00 m" entre o clique e o primeiro movimento do mouse: suprimido (o
  fundo claro novo o deixava mais visível do que antes).

### Armadilha do harness (custou uma rodada)

A vista inicial é enquadrada na **primeira** medida do container
(`enquadrado.current`), e o harness não carrega o Tailwind — então `h-full w-full`
não valia nada, o container nascia com altura indefinida e o passeio clicava no
vazio (0 paredes, nenhum erro no console). Corrigido no `index.html` do harness
com `#raiz > div { position: absolute; inset: 0 }`.

## Em aberto

- O seletor não é persistido: reabrir o estudo volta ao padrão (face, à direita).
- A barra de espaço só age com o **canvas em foco** (é onde ela é tratada, de
  propósito). Escolhendo a ferramenta Parede pelo teclado e apertando espaço sem
  antes clicar no desenho, nada acontece — o mesmo que aconteceria com um ouvinte
  global, porque ali o espaço acionaria o botão em foco.
