# Retângulo com lados vinculados · medida da face interna

## Pedido original

Sessão de 24/08/2026:

> 1. ferramenta retângula quando alterar a medida de um lado, deve ser alterado
> automaticamente do outro lado também, a fim de manter a mesma geometria
> 2. ao clicar no botão medidas, estão sendo inseridas as medidas do lado
> externo do desenho. Incluir as internas também.

Perguntei o que "internas" quer dizer no item 2. Resposta:

> Face interna de cada parede

O item 1 não foi perguntado: o pedido já diz "automaticamente", e a convenção de
qual ponta anda já existe (`esticamento.pontaQueAnda`).

## O que o levantamento estabeleceu

- **A cota de hoje é do EIXO, não da face externa** — `BlueprintCanvas.tsx`,
  bloco `mostrarMedidasParedes`, usa `wallLength(t.w)`. O comentário registra
  que cotar a face foi evitado para não duplicar o desconto de espessura. Ou
  seja: a percepção do pedido ("estão sendo inseridas as medidas do lado
  externo") descreve onde o número é DESENHADO, não o que ele mede.
- **`extensaoDeCanto(walls, wall, end)` já existe** e devolve o avanço de mitra
  da ponta (`meia / tan(θ/2)`, zero em ponta livre). É o que o desenho da
  silhueta já usa. Logo:

  ```
  face interna  = eixo − avançoA − avançoB
  face externa  = eixo + avançoA + avançoB
  ```

  Num canto reto o avanço é meia espessura, então um cômodo de eixo W×H com
  parede t tem interno (W−t)×(H−t) e externo (W+t)×(H+t). Nenhuma conta nova:
  a medida sai da mesma função que desenha.
- **A área do ambiente também é de eixo** — o arranjo planar recebe
  `{a: w.a, b: w.b}` (`arrangement.ts:357`), então `areaMm2` mede até o centro
  das paredes. Fica **fora do escopo** deste plano, mas é a mesma raiz e vale
  registrar: quem quiser área útil vai bater aqui.

## Item 1 — o lado oposto acompanha

### O que acontece hoje

`esticarParede` move a ponta escolhida e leva junto as paredes que compartilham
aquele vértice. Num retângulo isso arrasta UM canto: a parede vizinha fica
oblíqua e o retângulo vira um quadrilátero irregular.

### A regra

Quando a parede editada faz parte de um **laço fechado de 4 paredes com os
quatro cantos retos**, mover a ponta escolhida translada também o vértice do
outro extremo do lado perpendicular — ou seja, o LADO inteiro anda, e não só o
canto.

Para um retângulo A→B→C→D, editando AB com âncora em A:

```
B' = A + u·L'        δ = B' − B
move B → B'          (compartilhado por AB e BC)
move C → C + δ       (compartilhado por BC e CD)
```

Resultado: AB e CD ficam com o mesmo comprimento novo, BC translada sem mudar
de tamanho, DA fica intacta. A geometria se mantém.

### Por que só retângulo

Num laço de 4 lados **não** retos, "manter a geometria" não tem definição única
— dá para preservar os ângulos, os lados opostos ou a área, e as três dão
resultados diferentes. Fora do retângulo o comportamento antigo continua, que é
o que o usuário já conhece.

## Item 2 — a face interna aparece junto

Cada parede com medida ligada passa a mostrar **duas** cotas: a que já existia
(eixo) e a da face interna, distinguível à primeira vista.

⚠️ **A cota existente NÃO vira externa neste plano.** Ela é a mesma que o campo
"Comprimento" do painel mostra; trocá-la aqui desencontraria os dois números
sem ninguém pedir. Se o que se quer é externa+interna (e não eixo+interna), é
uma decisão a tomar explicitamente — está anotada no fim.

## Itens

- [x] **`utils/blueprintKernel/model.ts`** — `retanguloDoLaco(walls, wall)` e
      `faceInternaMm(walls, wall)`. *Pronto quando:* o laço de 4 cantos retos é
      reconhecido e um laço torto devolve `null`.
- [x] **`components/blueprint/BlueprintEditor.tsx`** — `esticarParede` translada
      o lado oposto quando há retângulo. *Pronto quando:* editar um lado mantém
      os quatro ângulos retos.
- [x] **`components/blueprint/BlueprintCanvas.tsx`** — segunda cota, da face
      interna. *Pronto quando:* aparece junto da atual, sem sobrepor.
- [x] **`__tests__/`** — retângulo preservado, laço torto intocado, face interna
      = eixo − avanços.
- [x] **Conferir no navegador** — `docs/spikes/prancha-real/conferir.mjs` ou
      harness próprio. Canvas é opaco em jsdom.

## Fora do escopo

- **Área útil do ambiente** (hoje medida até o eixo). Mesma raiz, mudança de
  quantitativo — exige decisão própria.
- **Trocar a cota de eixo por cota externa.** Ver aviso acima.
- **Laço de 4 lados não retangular** e laços com mais de 4 paredes.

## Duas coisas que só o navegador mostrou

### 1. O harness `wall-render` estava QUEBRADO antes de eu tocar nele

`TypeError: Cannot read properties of undefined (reading 'x')`, tanto com
`medidas=0` quanto com `medidas=1`. Isolado guardando só o `BlueprintCanvas.tsx`
com `git stash push -- <arquivo>`: **o erro continuou sem a minha mudança**.

Causa: `PontaSoltaCanvas` virou `{ p, wallId, end, oposta }` quando "juntar
pontas soltas" foi feito (23/08), e o harness seguia passando `Point` cru —
`ponta.p` era `undefined`. Corrigido usando `pontasSoltasDoNivel`, a mesma
função que o editor usa, em vez de montar a lista à mão.

É o risco que [[feedback_harness_spike_pode_estar_quebrado]] descreve: rodar o
harness ANTES de mexer é o que separa "meu defeito" de "harness podre". Rodei
antes no `prancha-real` e não neste — e foi justamente neste que apareceu.

### 2. O lado do rótulo não significa "interior"

Com a face interna desenhada, o print mostrou que na parede de BAIXO a cota de
eixo cai dentro do desenho e a da face interna cai fora. Não é defeito de
conta: `rotuloDoTraco` normaliza a normal pela direção da TELA, de propósito,
para o rótulo não depender do sentido em que a parede foi desenhada. O lado
`-1` é o oposto ao da cota de eixo — não o interior do cômodo.

Saber qual lado é o interior exigiria o ambiente do arranjo planar. **Prefixar
`int.` no próprio número custa nada e resolve a leitura** — que era o problema
real. Fica registrado para ninguém "consertar" o lado achando que é bug.

### 3. A cópia verbatim de `esticarParede` envelheceu na hora

`docs/spikes/comprimento-editavel/main.tsx` tem uma cópia declaradamente
verbatim de `esticarParede`. Ela divergiu no instante em que mudei o original —
o harness seguia produzindo o trapézio. Atualizada, e as asserções do
`passeio.mjs` também: elas conferiam o CONTRATO ANTIGO (área 13.500.000,
"canto abriu"), que é exatamente o que o pedido mandou mudar.

## Verificações

- `__tests__/blueprintKernel.test.ts` — **191** (8 novos: retângulo
  reconhecido, trapézio recusado, contorno aberto recusado, vértice de
  acompanhamento, ângulos retos preservados, face interna, ponta livre, nunca
  negativo)
- `npx vitest run __tests__` — **1628 passaram**, 24 puladas
- `npx tsc --noEmit -p .` — limpo · `check-ui-standard.sh` — sem violação
- **Navegador, item 1** — `docs/spikes/comprimento-editavel/passeio.mjs`:
  **CONFERÊNCIA OK**. Editando o lado sul de 4,00 para 5,00 m, o modelo sai
  `(0,0)→(5000,0)→(5000,3000)→(0,3000)` e a área vai de 12.000.000 para
  **15.000.000 mm²**. Antes da mudança saía trapézio de 13.500.000.
- **Navegador, item 2** — `docs/spikes/wall-render/medidas.mjs`, sem erro de
  console, print conferido à vista. Com `T = 1200 mm`:

  | parede | eixo | face interna | conta |
  |---|---|---|---|
  | fachada | 16,00 m | **int. 14,80 m** | 16,00 − 0,60 − 0,60 |
  | lateral | 11,00 m | **int. 9,80 m** | 11,00 − 1,20 |
  | trecho com UMA ponta livre | 5,00 m | **int. 4,40 m** | 5,00 − 0,60 − 0 |

  A última linha é a que prova que o desconto vem de `extensaoDeCanto` e não de
  uma conta de espessura própria: ponta livre não tem canto, e não desconta.
