# Juntar duas pontas soltas num canto

## Pedido original

> veja exemplo de duas pontas soltas e levemente desalinhadas. é um exemplo típico.
> gostaria de clicar em circulo laranja e ela mudar de cor e clicar no segundo
> circulo laranja mudar de cor e fazer a conexão das paredes automaticamente,
> seguindo a alinhamento da primeira em 90 graus

(sessão de 23/08/2026, acompanhado de print: parede vertical cuja ponta passa 30 px
do canto, e parede horizontal cuja ponta para bem antes dele.)

## Contexto

Hoje as pontas soltas são **só aviso**: círculo âmbar no desenho e contador no painel.
Para fechar um canto aberto o usuário precisa selecionar a parede, pegar a alça e
arrastar a olho — em pixel, não em milímetro. O detector de vãos não ajuda nesse caso:
depois do commit `f94cb41` ele só oferece pares **na mesma linha**, e canto aberto por
definição não está.

Falta o gesto que resolve o caso típico: apontar as duas pontas e deixar o sistema
levá-las ao encontro exato dos dois eixos.

## Decisões tomadas com o usuário

| Pergunta | Resposta |
|---|---|
| Perpendiculares (caso do print) | **Encostar as duas no canto** — cada ponta anda pelo próprio eixo até o cruzamento. 2 paredes, nenhuma nova |
| Paralelas / deslocadas de lado | **Recusar** — sem cotovelo, sem parede de ligação. Avisa e não mexe em nada |
| Acionamento | **Ferramenta nova na barra** — os círculos só respondem a clique com ela ativa |

Consequência: nenhuma parede gira. Os dois eixos são preservados como estão, e o canto
nasce na interseção real deles — se o desenho vier 1° torto do PDF, o canto sai 89°.
Endireitar o desenho é outro problema, e resolvê-lo aqui giraria a parede em silêncio.

## Implementação

### 1. `utils/blueprintKernel/geom.ts` — o cálculo do canto

Função pura nova, ao lado de `intersectSegments`:

```ts
export function cantoEntreEixos(a1: Point, a2: Point, b1: Point, b2: Point): Point | null
```

Interseção das duas retas **infinitas** (não dos segmentos: o canto quase sempre cai
fora dos dois trechos — é exatamente por isso que as pontas estão soltas). Devolve mm
inteiro, via o mesmo arredondamento que `intersectSegments` já usa.

Devolve `null` em dois casos, e os dois são recusa de produto, não falha de conta:

- **quase paralelas** — `|sen θ| < 0.17` (≈10° de folga). Vale para θ perto de 0° **e**
  de 180°: duas paredes quase colineares com um buraco no meio não são canto, são vão —
  e vão já tem dono, a lista do painel âmbar;
- **canto longe demais** — mais de `DISTANCIA_MAX_CANTO_MM` (proposta: 20 000 mm) de
  qualquer uma das duas pontas. Esticar 20 m para fechar um canto não é juntar pontas,
  é redesenhar a planta.

Reusar: `point()` para validar faixa/inteireza, `distanceSq` para o teste de distância.

**Testes** em `__tests__/blueprintKernel.test.ts`: perpendicular exato; perpendicular
1° torto (tem que passar — é o "levemente desalinhadas" do pedido); paralelas → `null`;
quase colineares → `null`; canto fora do alcance → `null`; resultado sempre em mm
inteiro.

### 2. `components/blueprint/BlueprintEditor.tsx` — estado e comando

O memo `vaosCandidatos` já guarda `wallId` e `oposta` por ponta (entrou em `c1aa989`/
`f94cb41`). Falta guardar **`end`** (`'a'` ou `'b'`) — é o que `MoveVertex` pede. É uma
linha no mesmo laço.

- `soltas` passa de `Point[]` para `{ p; wallId; end }[]`;
- estado `pontaEmJuncao: { p; wallId; end } | null` — a primeira escolhida;
- estado `avisoJuncao: string | null` — a recusa;
- `juntarPontas(primeira, segunda)`:
  - mesma parede → aviso ("uma parede não faz canto consigo mesma");
  - `cantoEntreEixos(...)` → `null` → aviso apontando a saída certa (vão vs. canto);
  - senão `editor.runBatch([MoveVertex primeira → C, MoveVertex segunda → C])`.

`runBatch` e não dois `run`: **um** passo de desfazer, e aborta o lote inteiro se o
kernel recusar qualquer um dos dois — o canto nunca fica pior do que estava. É o mesmo
argumento já escrito em `esticarParede`. Recusa do kernel (uma porta que cairia fora da
parede encurtada) aparece sozinha na faixa vermelha de `editor.lastError`.

Limpar `pontaEmJuncao` ao trocar de ferramenta — ponta escolhida que sobrevive à troca
volta a agir num clique que o usuário já esqueceu.

### 3. `hooks/useBlueprintEditor.ts` — `'juntar'` no tipo `BlueprintTool`

Uma linha na união, com comentário dizendo que a ferramenta **não desenha**: corrige
topologia movendo vértice, e por isso não tem prévia de parede nova.

### 4. `components/blueprint/BlueprintCanvas.tsx` — o gesto

- prop `pontasSoltas` passa a ser `{ p; wallId; end }[]` (o laço de desenho lê `.p`).
  Um array só, e não dois paralelos: a versão com `Point[]` ao lado de um mapa de donos
  derivaria na primeira mudança;
- props novas: `pontaEmJuncao`, `onEscolherPontaJuncao`, `onJuntarPontas`;
- **desenho**: a escolhida sai preenchida e em `COR_SELECIONADA` (é o "mudar de cor" do
  pedido); a que está sob o cursor com `tool === 'juntar'` sai com raio maior;
- **`aoApertar`**, ramo `tool === 'juntar'`: acerta ponta solta dentro de `ALCA_PX`
  (mesmo alcance das alças de parede). Sem ponta sob o clique, cancela a escolha em
  curso — clicar no vazio desiste, como em toda ferramenta daqui;
- **prévia**: com uma ponta escolhida e o cursor sobre outra válida, desenhar tracejado
  os **dois trechos até o canto** — é o que fica depois do clique. É a regra que o
  arquivo já segue em três gestos ("o que se vê durante o gesto é exatamente o que fica
  ao soltar"). Cursor sobre ponta inválida: tracejado em `COR_ALERTA`, sem canto;
- **Esc** cancela a escolha, em `aoTeclar`;
- **faixa de ajuda do rodapé** (`bottom-3 left-3`): "Clique na 1ª ponta solta" →
  "Clique na 2ª ponta · Esc cancela".

### 5. Barra de ferramentas

`<Ferramenta valor="juntar" icone={CornerDownRight} rotulo="Juntar" />`, depois de
"Abertura" e antes do separador do Terreno. `CornerDownRight` porque o ícone **é** um
canto — o desenho do botão diz o que o botão faz.

## Fora de escopo (proposital)

- pontas de **divisa** (`Boundary`): mesmo gesto, outro comando (`MoveBoundaryVertex`).
  Divisa é jurídica, não construção, e misturar as duas famílias num gesto só foi
  problema antes;
- botão "juntar" no painel âmbar de pontas soltas;
- varrer a planta e fechar todos os cantos de uma vez.

## Verificação

1. `npx vitest run __tests__/blueprintKernel.test.ts` — a matemática do canto.
2. `npx vitest run __tests__/components/BlueprintEditor.test.tsx` — a barra oferece
   "Juntar" e ela ativa; os casos de recusa produzem aviso e **não** mexem no modelo
   (chamando o handler direto, já que o canvas é opaco em jsdom).
3. `npx tsc --noEmit` e `bash scripts/check-ui-standard.sh` nos arquivos tocados.
4. **Na planta real** (é o único lugar onde o gesto existe de verdade): abrir o estudo
   do print, ativar Juntar, clicar nas duas pontas do canto aberto. Esperado: os dois
   círculos âmbar somem, o contador de pontas soltas cai de 2, o canto fecha, um
   Desfazer devolve tudo de uma vez. Depois repetir apontando duas pontas de paredes
   **paralelas**: aviso, e nada se move.
5. Opcional, no padrão de `docs/spikes/porta-flip/`: harness `docs/spikes/juntar-pontas/`
   com quatro cantos abertos (perpendicular exato, 1° torto, paralelas, quase colinear).
   O kernel prova a conta e o teste de componente prova o botão; o harness é o único que
   prova que os dois se falam.

---

## Execução — 23/08/2026

Tudo dos itens 1 a 5 feito. Três desvios em relação ao plano, todos anotados aqui
porque nenhum deles se deduz do código depois:

1. **`aoMover` zerava o cursor.** `if (tool !== 'parede') { setCursor(null); }`
   valia para toda ferramenta nova, então `pontaSobCursor` nunca computava e a
   prévia do canto simplesmente não aparecia — sem erro nenhum no console. Foi o
   harness que pegou, olhando o print; teste de unidade não veria.
2. **O harness nasceu com os casos fora da viewport.** Espalhados de 12 em 12 m,
   os casos 3 e 4 caíam fora dos 900 × 900 px da escala inicial, e a falha se
   apresentava como "a mira errou o círculo" — o mesmo sintoma de um bug de
   acerto de verdade. Layout comprimido para caber em ~16 m; comentário no
   `main.tsx` para não voltar.
3. **O harness deixou de ser opcional.** Era o item 5 "opcional" da verificação, e
   foi ele que achou o defeito 1. Ficou em `docs/spikes/juntar-pontas/`.

### Estado final da verificação

- `cantoEntreEixos` — 8 casos em `__tests__/blueprintKernel.test.ts` (171 no arquivo);
- barra e rodapé — 3 casos em `__tests__/components/BlueprintEditor.test.tsx` (34);
- suíte inteira: 1548 passando, 24 puladas; `tsc --noEmit` limpo;
  `check-ui-standard.sh` sem violações nos dois arquivos tocados;
- harness: `CONFERÊNCIA OK`, com prints de prévia, canto fechado e canto torto.

**Falta a verificação na planta real** (item 4): abrir o estudo do print, ativar
Juntar e fechar aquele canto. O harness prova a geometria e o gesto; ele não prova
que o canto que o usuário tem na tela é um dos quatro casos previstos.
