# Planta › 3D: as conexões seguem a camada dos tubos

## Pedido original

Sessão de 25/10/2026, tarde, com print do 3D da Garden só com a Elétrica visível (eletrodutos em amarelo e, soltas no ar,
pecinhas azul-escuras, vermelhas e verde-azuladas):

> *"veja que com somente a eletrica visivel aparecem essas conexões, acho que fazem parte da hidraulica. veirfique"*

## Diagnóstico (lido em `origin/main`)

São as conexões (joelhos, tês, luvas) da água fria, da água quente, do esgoto e do dreno do ar. Em
`components/blueprint/Blueprint3DViewer.tsx` os tubos e as peças passam por `escondida(id)` (o conjunto `ocultos` que o
editor monta com as camadas desligadas, `ocultosNo3d`), mas `conexoes3d` chamava `pecasDasConexoes3D(model, idsVisiveis)`
só com o filtro de pavimento, e o memo nem dependia de `chaveOcultos`. O 2D já fazia certo:
`simbolosDasConexoes2D(...).filter((sc) => !ocultos.size || sc.trechoIds.some((id) => !ocultos.has(id)))`.

## Itens

### 1. A conexão 3D some com os tubos dela — `utils/blueprintIsometrico.ts`, `components/blueprint/Blueprint3DViewer.tsx`

- **O que muda:** `pecasDasConexoes3D(model, idsVisiveis, ocultos?)` deixa de fora a conexão cujos tubos (`trechoIds`)
  estão TODOS ocultos — a regra do 2D; o viewer passa `ocultos` e o memo passa a depender de `chaveOcultos`.
- **Pronto quando:** teste em `blueprintIsometrico.test.ts` (os dois tubos ocultos → nenhuma peça; um à vista → a peça
  fica; sem ocultos → fica); print do 3D da Garden com só a Elétrica, antes × depois.

## Estado

- [x] item 1 + teste — `blueprintIsometrico.test.ts` (17/17); harness local com o rascunho da Garden (11:40) no
  `Blueprint3DViewer` de `origin/main` e no novo, com tudo que não é elétrico oculto: antes, conexões azul-escuras,
  vermelhas, cinza e verde-azuladas soltas; depois, só os eletrodutos e as caixas
- [ ] tsc + suíte
- [ ] PR + CI
- [ ] publicação
