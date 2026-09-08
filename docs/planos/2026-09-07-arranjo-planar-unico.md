# Um motor de arranjo planar, não dois

## Pedido original

> atacar a dívida do arranjo duplicado antes

Escolhido no lugar de abrir a Etapa 6 do roadmap BIM. O contexto da escolha, e
que vale registrar: **a Etapa 6 está mal dimensionada**. O maior item dela (15
dos ~25 dias) é "modelo de rede como grafo de trechos + conectores", e isso já
existe — `OpuraElectricalConduit` é literalmente `sourceId → targetId` com fios
anotados, servido por 12 componentes de UI. O que existe não é ausência, é
duplicação. A etapa precisa ser reescrita antes de ser executada.

Este plano ataca a parte que **vale por si**, hoje, independentemente de MEP.

## O que foi MEDIDO (07/09/2026)

`utils/geometry/roomDetection.ts` — **232 linhas, ZERO testes**, usado por
`components/electrical/ElectricalEditorView.tsx`. É um segundo motor de arranjo
planar: extrai segmentos, funde vértices próximos, ordena vizinhos por ângulo e
percorre faces pela regra da mão direita — a mesma família de algoritmo de
`utils/blueprintKernel/arrangement.ts`.

⚠️ **E ele é pior de cinco jeitos, quatro deles confessados pelo próprio
código:**

1. **NÃO parte segmentos que se cruzam.** O comentário admite: *"If we have
   intersecting walls but no vertex at the intersection, we would need to split
   segments. But for our architecture, users generally draw segments connecting
   at endpoints."* — uma parede que morre no MEIO de outra não gera nó, e o
   ambiente não fecha. É exatamente o defeito que a importação de IFC teve por
   outro caminho, e que o kernel resolve com `splitAtIntersections`.
2. **O sinal da área foi ADIVINHADO.** O bloco de comentário nas linhas 181–191
   hesita em voz alta — *"Wait, standard math: +area is CCW. In canvas (y points
   down): +area is CW. Let's just accept positive area faces (assuming inner
   faces are CCW or CW consistently)"* — e termina num `area > 500` mágico, em
   pixel².
3. **`getVertexId` é O(n) dentro de laço** → O(n²) em número de pontas.
4. **A tolerância é 5 PIXELS.** O resultado depende do zoom da planta de fundo:
   o mesmo desenho, aberto noutra escala, detecta outros ambientes.
5. **`arePolygonsSimilar` compara por ÁREA e CENTROIDE** (`|Δárea| > 100` px² e
   centroide a 5 px). Isso não é identidade: dois cômodos diferentes de mesma
   área e mesmo centroide — um L e o seu espelho, por exemplo — passam por
   iguais, e um ambiente novo deixa de ser detectado.

Do outro lado, `arrangement.ts` já tem `splitAtIntersections`, varredura no
lugar de n², tolerância em milímetro e goldens travados.

## A decisão

**O elétrico passa a chamar o kernel.** Não se reescreve o `roomDetection`: ele
é DELETADO, e no lugar entra um adaptador fino.

⚠️ **O que o adaptador tem de resolver, e é a única parte de verdade difícil: a
UNIDADE.** O elétrico desenha em PIXELS de uma imagem de planta; o kernel exige
milímetro INTEIRO e limita coordenada a ±1.000.000. Pixel vira coordenada do
kernel por um fator fixo, e o fator define a tolerância efetiva — é ele que
decide se duas pontas a 5 px são "a mesma ponta".

## Fatias

1. **O adaptador puro** (`utils/electricalArranjo.ts`): paredes do elétrico →
   `BlueprintModel` sintético → `recomputeSpaces` → polígonos de volta em pixel.
   Com o teste que justifica a troca: **uma parede que morre no meio de outra**.
   O motor velho não fecha o ambiente; o do kernel fecha.
2. **A troca no editor** e a exclusão do `roomDetection.ts`.
3. **A identidade do ambiente**: trocar `arePolygonsSimilar` por comparação que
   seja de fato identidade — o anel, e não área e centroide.

## ✅ AS TRÊS FATIAS FEITAS em 07/09/2026

`utils/geometry/roomDetection.ts` **não existe mais**. O editor elétrico chama
`ambientesNovos`, que é o motor do kernel com um adaptador de unidade.

**O que os testes travam** — cada um é um defeito do motor antigo, medido com os
dois lado a lado antes de apagá-lo:

- **parede que morre no meio de outra**: o antigo devolvia menos de dois
  ambientes; o kernel devolve dois;
- **o mesmo desenho em outra escala** acha os mesmos ambientes — o antigo tinha
  tolerância de 5 px fixos e dependia do zoom;
- **um L e um retângulo de área parecida e mesmo centroide** deixaram de ser
  confundidos. `arePolygonsSimilar` dizia que eram o mesmo cômodo, e por isso um
  ambiente novo deixava de ser detectado em silêncio;
- **planta de 5.000 px não estoura** o limite de ±1.000.000 do kernel.

⚠️ **Um teste meu falhou e melhorou o caso.** Eu afirmei que o antigo confundia
um L com o seu ESPELHO; não confunde — o ponto repetido do anel fechado desloca
o centroide ingênuo e os separa por acaso. Medi então um par que de fato o
engana. A afirmação ficou mais fraca e verdadeira.

**Conferido de olho no app**: o editor de Projetos Elétricos monta e desenha —
"Coronel 345", com um ambiente já cadastrado (7 vértices, 8,97 m², 12,6 m). Os
dados existentes, criados pelo motor antigo, seguem intactos: a troca alcança só
a detecção nova.

⚠️ **E um desvio de escopo, declarado**: o arquivo do editor tinha um `confirm()`
NATIVO, proibido pelo guia (§14) e acusado pelo `check-ui-standard.sh`. A
violação é ANTERIOR a esta frente. Corrigida aqui porque o arquivo já estava
sendo tocado, e deixar um portão obrigatório vermelho é pior que o desvio — o
handler já era `async`, então a troca foi só de quem pergunta.

## Verificação

| Fatia | Prova |
|---|---|
| 1 | o caso da parede em T: motor velho **não fecha**, kernel **fecha**; e o caso do zoom: o mesmo desenho em duas escalas dá o mesmo número de ambientes |
| 2 | `roomDetection.ts` não existe mais e nada o importa; a tela do elétrico continua detectando os ambientes que já detectava |
| 3 | dois cômodos de mesma área e mesmo centroide deixam de ser confundidos |
| todas | suíte, build, `check-ui-standard`, e a tela do elétrico aberta no app |

## Fora do escopo

- **Hidráulica e esgoto**, que não existem — são trabalho novo, e entram quando
  a Etapa 6 for reescrita.
- **Clash** entre disciplinas.
- Unificar o MODELO do elétrico com o do kernel: aqui só o ARRANJO é unificado.
  Fundir as duas persistências é outra decisão, bem maior, e nada hoje a exige.
