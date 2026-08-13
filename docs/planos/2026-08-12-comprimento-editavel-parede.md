# Comprimento da parede editável no painel Ambientes

## Pedido original

Sessão de 2026-08-12, na sequência do traçado pela face:

> no painel lateral "ambientes" ao selecionar uma parede aparece: Parede
> selecionada < Comprimento:
> 1. permite que o campo da medida seja editável de forma a alterar a medida da
> parede

Duas perguntas de portão, respondidas pelo usuário antes de planejar (registradas
integralmente, porque mudam o comportamento do produto):

1. **Quando a ponta que vai andar encontra outra parede (sala fechada), o que
   acontece?** → *"Arrasta o canto junto"* — as vizinhas que compartilham aquele
   vértice andam no mesmo passo de desfazer; o contorno continua fechado (a
   vizinha perpendicular fica oblíqua).
2. **Qual ponta anda?** → *"A ponta livre"* — se as duas estiverem livres, ou as
   duas presas, anda a final (`b`, a última clicada ao desenhar).

Plano completo (Explore + AskUserQuestion + Plan agent) em
`C:\Users\altai\.claude\plans\no-painel-lateral-ambientes-compressed-adleman.md`,
aprovado antes da implementação.

## O que mudou

| Arquivo | Mudança | Como sei que terminou |
|---|---|---|
| `utils/blueprintKernel/geom.ts` | `pontaEsticada(de, para, comprimentoMm)` — ponto a uma distância de `de`, na direção `de→para`; a parede nunca gira | 5 casos em `__tests__/blueprintKernel.test.ts` (eixo, oblíqua com `areCollinear`, encolher, comprimento zero, âncora=direção) |
| `utils/blueprintKernel/index.ts` | exporta `pontaEsticada` | `tsc --noEmit` limpo |
| `components/blueprint/PainelParedeSelecionada.tsx` | **novo** — extrai a caixa "Parede/Abertura selecionada" de `BlueprintEditor.tsx`; campo de comprimento em metros, editável | 15 testes em `__tests__/components/PainelParedeSelecionada.test.tsx` |
| `components/blueprint/BlueprintEditor.tsx` | `esticamento` (memo: qual ponta anda + se arrasta canto) e `esticarParede` (monta o lote `MoveVertex` da parede + vizinhas, via `runBatch`) | passeio com clique real: `docs/spikes/comprimento-editavel/passeio.mjs` → CONFERÊNCIA OK |
| `docs/spikes/comprimento-editavel/` | harness novo (canvas real + painel real, clique + digitação reais) | roda e confere sozinho |

### Por que virou componente novo, não só um `<input>` a mais

Selecionar parede exige clique no canvas, que é opaco em `jsdom` — é o que o
próprio `__tests__/components/BlueprintEditor.test.tsx` declara no cabeçalho.
Sem extrair a caixa para `PainelParedeSelecionada.tsx`, a interação do campo
(digitar, Enter, blur, Escape, ressincronizar ao trocar de parede) não teria
como ser testada sem simular um clique que `jsdom` não sabe dar. Extraída, ela
segue o mesmo padrão dos outros painéis do editor (`PainelMedicoes`,
`PainelVersoes`, `PainelOrcamento`, `ControlesDeFundo`), cada um com arquivo de
teste próprio.

### O bug do `Escape` que a extração revelou (achado ao escrever o teste, corrigido antes de reportar)

O campo é **não controlado** (`defaultValue` + `key` composto de id+comprimento,
para ressincronizar quando a seleção muda ou o arraste da alça no canvas altera
o comprimento por fora). No `Escape`, a primeira versão fazia
`setRascunho(null)` e depois `.blur()` — mas `.blur()` dispara `onBlur`
**sincronamente**, dentro do mesmo handler de tecla, **antes** de o React aplicar
o `setRascunho(null)` pedido. `confirmar` leria o `rascunho` ainda com o texto
abandonado, e reaplicaria um valor que o usuário já tinha descartado.

Corrigido com uma `ref` (`cancelando`), lida na hora, sem esperar repintura —
não é estado do React porque o problema é exatamente a defasagem entre pedir um
`setState` e ele valer. O teste "ESCAPE descarta" prova isso: sem a `ref`, ele
teria reprovado.

### O lote que arrasta o canto

`esticarParede` decide a ponta pela mesma regra de `isFreeWallEnd` que já existe
no kernel (usada por `isFreeWallEnd`/traçado pela face), estica com
`pontaEsticada`, e monta um `Command[]` com o `MoveVertex` da própria parede
**mais** um `MoveVertex` para cada parede vizinha cujo vértice coincidia com a
ponta antiga — tudo aplicado num **único** `runBatch`. Um `Ctrl+Z` desfaz o
gesto inteiro (parede + canto), a mesma garantia que o traçado pela face já
tinha.

**Limitação conhecida, documentada em comentário no código:** ponta que morre
no MEIO de outra parede (junção em T) não é vértice de ninguém — não há
`MoveVertex` de vizinha para disparar, e o encontro desencosta. O painel de
pontas soltas acusa, e a lista de vãos oferece fechar.

## Verificação (feita, não presumida)

- `npx tsc --noEmit` → limpo.
- `npx vitest run` no kernel + quantitativos + exportação + medições +
  `PainelParedeSelecionada` + `BlueprintEditor` → **186 testes passando**.
- `bash scripts/check-ui-standard.sh` nos dois arquivos tocados → sem violação.
- **Kernel**: retângulo 4000×3000, esticar a parede sul para 5000 mm com o lote
  (sul + leste) → `spaces.length === 1`, área do trapézio = 13.500.000 mm²; lote
  que colapsaria uma parede lança `KernelError` e não deixa o modelo pela
  metade.
- **Componente**, com clique/teclado simulado (`userEvent`): mostra "4,10" com
  vírgula; Enter aplica em mm; ponto decimal também funciona; blur sem Enter
  aplica; **Escape não chama `onComprimento` e restaura o texto exibido**; "0",
  "-3", "abc" e campo vazio não chamam nada; trocar de parede selecionada
  ressincroniza o campo; comprimento mudado por fora (arraste da alça)
  ressincroniza; a dica de qual ponta anda muda com `pontaQueAnda`/`arrastaCanto`;
  abertura selecionada não mostra campo de comprimento; botão Unir habilita e
  chama `onUnir`.
- **Passeio em Chrome real** (`docs/spikes/comprimento-editavel/passeio.mjs`,
  canvas + painel reais, cópia verbatim de `esticamento`/`esticarParede` porque
  vivem dentro do editor e não são exportadas): clique real selecionou a parede
  sul de um retângulo 4000×3000; campo mostrou "4,00"; digitado "5,00" + Enter;
  parede sul foi para `(5000,0)`, a **vizinha leste acompanhou** (`a` também em
  `(5000,0)`, sem abrir o canto), **1 ambiente** sobreviveu com área
  13.500.000 mm². `saida-depois.png` mostra o trapézio, a parede selecionada em
  vermelho, o campo com "5,00" e a dica "estica a ponta final — o canto vai
  junto".

## Fora do escopo (como combinado no plano)

- Editar espessura já existia (select ao lado) — não mudou.
- Cota editável diretamente no canvas (clicar no número desenhado) — outro
  pedido.
- Cascata de restrição tipo Revit (vizinhas perpendiculares se transladando
  inteiras, mantendo o esquadro) — aqui a vizinha fica oblíqua, como decidido.
