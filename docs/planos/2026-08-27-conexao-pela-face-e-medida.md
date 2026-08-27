# Conexão de parede pela face — o vão no modelo e a medida que mente

## Context

Pedido de 27/08/2026, com print:

> A conexão de paredes deve ser pelas faces não pelo eixo. veja print. pelo eixo
> as medidas ficam erradas

Respostas de escopo:

- **O que está errado:** *"As duas coisas"* — há vão de verdade no modelo E a
  cota desconta errado
- **Junção em T:** o comprimento vai **até a FACE da parede que recebe**

O print mostra uma parede vertical fina, duas horizontais grossas, um vão branco
entre elas, a alça vermelha de ponta selecionada solta nesse vão, e a cota
`5,97` — um número que não é redondo, sinal de meia espessura sobrando.

São **dois defeitos independentes** que se somam, e é preciso separá-los: o vão
faz a cota nem existir, e a fórmula da cota erra quando as paredes têm
espessuras diferentes.

---

## Defeito 1 — o vão: o passe de conexão não roda no traçado manual

`encostosSemJuncao` (`utils/blueprintKernel/arrangement.ts`) já detecta
exatamente isto, e o comentário dele descreve o print: *"o desenho mostrava o
canto fechado e o modelo não. Ele olhou a tela e disse 'não funcionou', com
razão."*

`comandosDeConexao` (`BlueprintEditor.tsx:1135`) já transforma isso em
`MoveVertex`. **E já é usado em três lugares** — ao ABRIR a planta (efeito com
guarda `conexaoTFeitaEm`), no botão "conectar agora", e nas paredes geradas do
PDF (`aplicarParedesGeradas`).

**O que falta: ele não roda depois de um traçado MANUAL.** Quem desenha uma
divisória que morre no corpo de outra parede fica com a ponta pendurada até
recarregar a planta ou achar o botão. É o estado do print.

### Correção

Ao concluir uma parede desenhada à mão, rodar o passe de conexão **no MESMO
lote** da criação — como `aplicarParedesGeradas` já faz. Um `Ctrl+Z` desfaz o
traço e a conexão juntos; em dois lotes sobraria um passo intermediário com a
planta pendurada.

- **`components/blueprint/BlueprintEditor.tsx`** — no caminho de `onAddWall`
  (e no fechamento de contorno), acrescentar as correções de
  `comandosDeConexao` ao lote. *Pronto quando:* desenhar uma divisória
  encostando no corpo de outra parede fecha o ambiente na hora, sem recarregar.

⚠️ **A conexão no MODELO continua sendo no EIXO, e isso não é negociável.** O
arranjo planar (`buildArrangement`) monta o grafo a partir dos eixos: uma ponta
que pare na FACE deixa vértice de grau 1, o anel não fecha e o ambiente
desaparece — junto com área e quantitativo. A memória do traçado pela face já
registra esse fracasso: *"deslocar cada trecho por conta própria NÃO funciona…
o contorno não fecha e o ambiente não aparece"*.

O que o usuário chama de "conexão pela face" é atendido onde importa: **o que
ele desenha** (clique na face, que já existe) e **o que ele mede** (defeito 2).

---

## Defeito 2 — a medida usa a espessura ERRADA

`extensaoDeCanto` (`utils/blueprintKernel/model.ts:420`) usa **sempre a
espessura da própria parede** (`wall.thicknessMm / 2`) — nunca lê a da vizinha.

Isso está **certo para o que ela existe**: o avanço de mitra do DESENHO, quanto
o corpo desta parede avança para fechar o canto.

**O erro é meu, da fase anterior:** construí `faceInternaMm` em cima dela. Mas a
distância do vértice até a **face da outra parede** depende da espessura **da
outra**, não da própria. São duas grandezas diferentes:

| | fórmula | depende de |
|---|---|---|
| avanço de mitra (desenho) | `(t_própria/2) / tan(θ/2)` | espessura PRÓPRIA |
| recuo até a face (medida) | `(t_vizinha/2) / sen(θ)` | espessura da VIZINHA |

Com espessura uniforme e canto reto as duas dão `t/2` e coincidem — **e todos os
meus testes usaram espessura uniforme**. Por isso passou. No print do usuário as
paredes têm espessuras visivelmente diferentes.

### Correção

- **`utils/blueprintKernel/model.ts`** — `recuoAteFace(walls, wall, end)`:
  distância do vértice até a face da vizinha, ao longo do eixo desta parede.
  Ponta livre → 0. Acha a vizinha tanto por vértice compartilhado (canto) quanto
  por pertinência ao corpo (junção em T — o caso que o usuário perguntou).
  `extensaoDeCanto` **fica como está**: ela é o desenho.
- **`faceInternaMm`** passa a somar `recuoAteFace` das duas pontas.
- **`utils/blueprintCotas.ts`** — `espessuraPerpendicular` já lê a espessura da
  VIZINHA (está certo), mas ignora o ângulo. Passa a usar o mesmo fator `sen(θ)`,
  para lado oblíquo não divergir da medida por parede.

---

## O que a tela mostra

- **Rótulo "Medidas" por parede** — o `int.` passa a ser o comprimento livre
  correto (até a face da vizinha).
- **Painel "Parede selecionada"** — o campo **Comprimento continua sendo o
  EIXO**, porque é ele que a edição move (`esticarParede`/`pontaEsticada`).
  Acrescentar ao lado, só leitura, o **comprimento livre**. É o mesmo padrão que
  o quantitativo já usa com Piso × Eixo: dois números com nomes diferentes, em
  vez de um número ambíguo.

---

## Verificação

1. **Unidade — o caso que os testes antigos não cobriam:**
   `__tests__/blueprintKernel.test.ts`
   - divisória de 100 morrendo em parede de 300: o recuo é **150**, não 50
   - canto entre paredes de espessuras diferentes: cada uma recua metade da
     OUTRA
   - junção a 45°: o recuo cresce por `1/sen(θ)`
   - ponta livre continua recuando 0
   - `extensaoDeCanto` **não muda de valor em caso nenhum** — é a trava que
     prova que o desenho não foi afetado

2. **Conexão no traçado:** `__tests__/` — desenhar parede terminando no corpo de
   outra fecha o ambiente no mesmo lote; um `undo` reverte traço e conexão.

3. **Navegador** — reproduzir o print: parede fina encontrando parede grossa.
   Harness `docs/spikes/wall-render/` (já tem `?medidas=1` e `?cotas=1`);
   acrescentar uma cena com **espessuras diferentes**, que é a que faltava.
   ⚠️ Rodar o harness ANTES de mexer.

4. **Regressão:** `npx vitest run __tests__` (1659 hoje), `npx tsc --noEmit -p .`,
   `bash scripts/check-ui-standard.sh`, e os **goldens de hash 7/7** — nenhuma
   destas mudanças pode alterar o payload canônico.

---

## Fora de escopo

- **Mitra de desenho entre espessuras diferentes.** `extensaoDeCanto` usa a
  própria espessura nos dois lados do canto; com espessuras diferentes o
  encontro das faces externas não é exato. É defeito **cosmético e
  pré-existente**, não é o que foi reportado, e mexer nele muda o desenho e a
  exportação. Fica registrado.
- **Mudar o modelo para conectar por face.** Quebraria o arranjo planar — ver o
  aviso no defeito 1.

---

# Andamento — CONCLUÍDO

## Baseline, antes de mexer

`medidas.mjs` e `cotas.mjs` sem erro, **1663 testes**. Sem isso, qualquer
reprovação nova seria ambígua.

## Defeito 2 — a medida ✅

- [x] `recuoAteFace(walls, wall, end)` em `model.ts` — `(t_vizinha/2)/sen(θ)`,
      achando a vizinha por vértice compartilhado (canto) **e** por pertinência
      ao corpo (T). Colinear não conta.
- [x] `faceInternaMm` passa a usar `recuoAteFace`.
- [x] `extensaoDeCanto` **intocada** — ela é o desenho, e há teste fixando que
      não mudou de valor em caso nenhum.
- [x] `blueprintCotas.espessuraPerpendicular` → `recuoDoCanto`, com o mesmo
      fator `sen(θ)`, para a cadeia não divergir da medida por parede.
- [x] 7 testes com **espessuras diferentes** — a condição que nenhum teste
      anterior tinha.

**Medido:** divisória de 100 morrendo em parede de 300 → recuo **150**
(`extensaoDeCanto` segue devolvendo 50, como deve). Vão livre: **4850**, não
4950.

## Defeito 1 — o vão ✅

- [x] `adicionarParede` roda o passe de conexão no MESMO lote da criação.
- [x] **Recortado ao que acabou de ser desenhado** (`diff.created`): o passe
      completo varre o modelo inteiro e mexeria em pontas antigas que o usuário
      não tocou — mudança silenciosa longe de onde ele clicou. O botão
      "conectar agora" continua sendo o caminho do passe completo.
- [x] 4 testes: o encosto é detectado, SEM encostar há 1 ambiente, DEPOIS há 2,
      e vão de verdade (1 m) **não** é encostado.

## Tela

- [x] `PainelParedeSelecionada` mostra **"Livre entre faces: X m · o eixo mede
      Y m"**. O campo editável continua sendo o EIXO, porque é ele que a
      geometria move — trocar faria digitar 4,00 gerar eixo 4,00+espessura, e a
      volta é ambígua quando as duas pontas têm vizinhas de espessuras
      diferentes.

## Conferido no navegador

Cena nova `?mista=1` (`docs/spikes/wall-render/mista.mjs`): envoltória de 300,
divisória de 100 em T nas duas fachadas — **a condição que faltava em todo o
harness**.

| | esperado | no print |
|---|---|---|
| divisória, vão livre | 6,00 − 0,15 − 0,15 = **5,70** | **int. 5,70 m** ✓ |
| (o que o código antigo daria) | 6,00 − 0,05 − 0,05 = 5,90 | — |
| fachada, vão livre | 9,00 − 0,30 = **8,70** | **int. 8,70 m** ✓ |
| ambiente | dividido em 2 | dividido ✓ |

## Verificações

- `npx vitest run __tests__` — **1674 passaram** (era 1663; +11)
- `npx tsc --noEmit -p .` — limpo
- `check-ui-standard.sh` — sem violação
- **goldens de hash 7/7** — o payload canônico não mudou
- `medidas.mjs` e `cotas.mjs` — sem regressão

## Continua fora de escopo

**Mitra de DESENHO entre espessuras diferentes.** `extensaoDeCanto` usa a
espessura própria nos dois lados do canto; com espessuras diferentes o encontro
das faces externas não é exato. É cosmético, pré-existente, e mexer nele muda
desenho e exportação. Fica registrado — não foi o que o usuário reportou.
