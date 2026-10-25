# Planta › 3D: eletroduto e caixas elétricas embutidos na parede

## Pedido original

Sessão de 25/10/2026, tarde, com print do 3D da Garden (paredes transparentes; as descidas dos eletrodutos e as caixas
das tomadas do lado de fora das paredes):

> *"veja prints. Conduites descem embutidos na parede. as caixas de tomadas e interrrptores tambem"*

## Diagnóstico (rascunho da Garden, 25/10 11:40, e `origin/main`)

O ponto elétrico de parede fica na FACE: as TUG da Garden estão a meia espessura do eixo (100 numa parede de 200, 75 numa
de 150). É onde encosta a barra do símbolo (#157), e o motor desce o eletroduto ali, no rasgo da face, e não no eixo, onde
corre o dreno do ar. O 3D (`Blueprint3DViewer`) centrava nesse ponto a caixa (cubo padrão de 100 mm,
`MEDIDAS_PADRAO_TERMINAL`) e o tubo: metade de cada um ficava no ambiente. O interruptor que o usuário moveu ficou 10 mm
fora da face (85 do eixo numa parede de 150).

## Itens

### 1. Onde a caixa e a descida ficam embutidas — `utils/blueprintEletricaEmbutida.ts` (novo), `components/blueprint/Blueprint3DViewer.tsx`

- **O que muda:** `embutimentoEletrico(model)`:
  - `caixa(t)`: para o ponto elétrico de parede (não a luz de teto), a até `FOLGA_DA_FACE_MM` (30) da face, o centro da
    caixa a meio fundo para dentro, com a frente `RESSALTO_DA_CAIXA_MM` (3) à frente da face (o espelho; no plano da face
    as duas superfícies brigam no 3D). Mais funda que meia parede: fica no eixo.
  - `segmentos(t)`: os pedaços de `segmentosDoEletroduto`. No eletroduto, a descida (pedaço vertical) que está na face vai
    para dentro: até o centro da caixa, se há uma ali; senão `EMBUTIDO_DO_ELETRODUTO_MM` (50). A ponta de um horizontal
    que chega nela anda junto. O horizontal que só passa rente à face fica.
  - O 3D usa os dois (tubos e caixas). O modelo não muda: o ponto continua na face (símbolo, clique, motor).
- **Fora (anotado):** o IFC, o Collada, o corte e o clash continuam medindo pela face. A diferença é o meio fundo da caixa.
  O quadro também fica como está.
- **Pronto quando:** `blueprintEletricaEmbutida.test.ts` (caixa na face +y e −y, interruptor 10 mm fora, caixa mais
  funda que a parede, o que não embute; a descida até o centro da caixa, o toco do forro que chega nela, o rasgo sem
  caixa, o horizontal rente à face, outro pavimento e a água); print do 3D da Garden antes × depois.

## Estado

- [x] item 1 + testes — `blueprintEletricaEmbutida.test.ts` (10/10); harness local com o rascunho da Garden no
  `Blueprint3DViewer` de `origin/main` e no novo: a TUG (3113, 5100) e o interruptor (2569, 13885) com paredes opacas.
  Antes, tubo descendo na frente da parede e caixa saindo dela; depois, só o espelho na face. O conjunto, com paredes
  transparentes, mostra as descidas dentro delas.
- [ ] tsc + suíte
- [ ] PR + CI
- [ ] publicação
