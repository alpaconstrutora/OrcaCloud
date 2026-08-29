# Planta Inteligente — copiar/colar objetos e a trava ortogonal no Terreno

## Pedido original

Sessão de 2026-08-29, mensagem literal do usuário:

> incorporacao < planta inteligente:
> 1. Funcionalidade de copiar e colar objetos (paredes, portas, janelas...)
> 2. Funcionalidade orto deve funcionar também com a ferramenta terreno

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
