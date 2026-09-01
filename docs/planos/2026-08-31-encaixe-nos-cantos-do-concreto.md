# Planta Inteligente — pontos de conexão nos cantos do concreto

## Pedido original

> veja print. perceba que os pontos de conexao para os componentes estruturais sao apenas no eixo. deve ser também nos cantos

Sessão: `173a7f9b-72cd-49d6-972f-e29192178ac2` · 2026-08-31
(print: uma viga selecionada, com as duas alças quadradas nas pontas do eixo e
nada nos quatro cantos do corpo)

## Contexto

A peça de concreto era **invisível para o ímã**: `capturar`, em
`BlueprintCanvas`, varria só as paredes — ponta de eixo e canto do corpo. Pilar,
viga e laje não ofereciam ponto de encaixe nenhum, e a única coisa que se via
numa peça selecionada eram as alças do eixo.

É a mesma lacuna que a alvenaria já tinha resolvido, e pelo mesmo motivo: **a
ponta do eixo fica no meio da espessura**, onde não há nada desenhado. Quem
copia uma prancha aponta o canto que enxerga — o encontro da face da viga com a
face do pilar — e ali o clique caía na grade.

## Decisões

| Pergunta | Decisão |
|---|---|
| Onde os pontos do concreto entram? | Nas **mesmas duas urnas** da parede (eixo e canto), não numa terceira. Encostar a face de uma viga na face de um pilar é o mesmo gesto que encostar duas paredes, e o `preferirCanto` já sabe qual o traçado está pedindo. |
| Peça circular | **Sem canto.** O vértice do quadrado envolvente fica ~62 mm fora do concreto numa estaca ⌀300 — mesmo corte que `estruturaSob` faz para o cursor. |
| Laje | `cantos` vazio: o contorno dela JÁ é o eixo, e oferecer o mesmo ponto duas vezes anularia o `preferirCanto`. |
| Os cantos são arrastáveis? | **Não.** São ponto de encaixe, e o desenho diz isso: círculo vazado pequeno, contra o quadrado cheio da alça. O kernel só sabe mover o EIXO — mover um canto de viga não define nada (a largura sairia do nada). |

## Plano

### 1. Kernel · `utils/blueprintKernel/model.ts` ✅

`pontosDeConexaoEstrutural(s)` → `{ eixo, cantos }`, exportado em `index.ts`.
Sem mudança em `KERNEL_VERSION`: é função de leitura, não muda o payload.

**Pronto quando:** os 4 casos novos em `__tests__/blueprintEstrutural.test.ts`
passam (viga, pilar retangular, circular, laje).

### 2. Ímã · `components/blueprint/BlueprintCanvas.tsx` ✅

- `encaixesDeEstrutura` memoizado por nível (não dentro de `capturar`, que roda
  a cada movimento do ponteiro);
- eixo e cantos entram nas duas urnas existentes;
- **a peça em arraste sai do conjunto**: `movendoEstrutura` captura pela mesma
  função, e numa viga fina o canto fica a meia largura da ponta — dentro do raio
  de encaixe em zoom de trabalho. Sem o corte, arrastar a ponta a grudaria no
  canto dela mesma.

### 3. Desenho · o mesmo arquivo ✅

Peça sozinha na seleção mostra os cantos como círculos vazados (r 3) por baixo
das alças quadradas do eixo.

### 4. Conferência em Chrome real · `docs/spikes/encaixe-estrutural/` ✅

```bash
npx vite --port 3103
PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
  node docs/spikes/encaixe-estrutural/passeio.mjs http://127.0.0.1:3103
```

Viga de largura 1230 mm com ponta em x = 6010: **nenhum ponto de conexão cai em
múltiplo do passo da grade**, então encaixe e grade dão respostas diferentes e o
passeio distingue os dois mundos. Cada alvo declara o que a grade daria e o
passeio REPROVA se o resultado for esse.

**Resultado:** parede nasceu em `(2000, 3385)` — o canto, não a grade `(2000,
3300)`; e em `(6010, 4000)` — a ponta do eixo, não `(6100, 4000)`. Print
`saida-pontos.png` mostra os 4 círculos e as 2 alças.

## Resultado

Quatro itens concluídos em 31/08/2026. `npx tsc --noEmit` limpo; suíte inteira
2097 passando; passeio aprovado.

## Pendências conhecidas

- **Arrastar pelo canto** (esticar a peça agarrando a quina) não existe — exige
  comando novo no kernel, com semântica definida por forma.
- **Meio de face e centro** (os OSNAP "midpoint"/"center" do CAD) continuam
  fora, para parede e para concreto.
