# Tubos e conexões detalhados (3D, 2D e junção 45° no esgoto)

## Pedido original

Sessão de 27/09/2026 (VS Code), com dois prints de isométrico sanitário (tubos
verdes com "ø100 mm / ø75 mm / ø50 mm / ø40 mm", conexões cinzas, CI3 cilíndrica
com tampa, CS com grelha, tubo de queda e ventilação, derivações em Y):

> os tubos e conexoes devem ser detalhados.veja print

Perguntas e respostas da mesma sessão:

- "Por onde começo o detalhamento de tubos e conexões?" → **"3D + junção 45° juntos (1+2+3+4)"**
- "As conexões também devem aparecer na planta 2D (símbolo de joelho/tê/junção nos encontros)?" → **"3D e 2D"**

Pedido seguinte, mesma sessão, depois da publicação de `e4070fa`:

> detalhado também no 2d

## Estado de partida (levantado no código em 27/09/2026)

- 3D: cada trecho é um cilindro com raio = DN/2 e cor da disciplina
  (`Blueprint3DViewer.tsx` › `redes`, geometria em `blueprintRede.cilindroDoTrecho`).
  Nenhum rótulo no 3D.
- `conexoesDerivadas` (kernel) classifica joelho 90/45, tê, cruzeta, luva e
  redução — mas só alimenta quantitativo/orçamento/planilha; nenhum desenho mostra
  conexão. Não guarda a direção dos ramais. Não existe junção 45°.
- Terminais no 3D: caixa na cor da disciplina com a COTA COMO CENTRO. A ficha da
  CI e da CG diz "a cota é a do fundo"; a CS e o ralo têm a grelha no piso (cota =
  topo). A CI aparece meia altura abaixo.
- Esgoto automático: Prim com rota limitada, ramal em qualquer ângulo, sem nó
  intermediário → encontros viram tê de 90° ou "ângulo fora de 45/90".
- 2D: traço com espessura = DN, rótulo "DN 100 · i 1 %"; nenhuma conexão.

## Decisões

- **Geometria fora do viewer.** O viewer é `@ts-nocheck`; toda forma nova sai de
  um módulo puro testado (`utils/blueprintIsometrico.ts`), como já é com
  `cilindroDoTrecho`.
- **Conexão desenhada = bolsas.** Para cada ramal da conexão, um cilindro curto
  mais grosso que o tubo (bolsa) saindo do nó na direção do ramal, e um corpo
  esférico no nó para joelho/tê/junção. Serve para todos os tipos (a redução tem
  bolsas de diâmetros diferentes) e é o que se lê nos prints.
- **Cor da conexão:** a da disciplina escurecida — distingue a peça do tubo sem
  inventar cor nova para cada rede.
- **Junção 45° (`JUNCAO_45`):** 3 trechos no nó, dois colineares (o tubo que
  passa) e o terceiro a ~45°/135° deles. Tê continua sendo o ramal a ~90°.
- **Nó dentro de caixa não tem conexão:** os tubos que chegam à CI, CS, CG ou ralo
  sifonado entram na caixa — a caixa é a peça. (Hoje contava tê/cruzeta ali.)
- **Traçado do esgoto com Y:** o ramal pode pendurar-se NO MEIO de um trecho da
  árvore, no ponto em que chega a 45° a favor do fluxo (o trecho é partido ali).
  Vale só na árvore que vai à caixa de inspeção; na caixa sifonada e na de gordura
  cada aparelho entra direto (é o papel delas). Continua valendo a rota limitada.
- **Rótulo ø no 3D:** sprite de texto (canvas próprio, sem fonte externa) no meio
  de cada trecho hidráulico: "ø100 mm", "TQ ø100 mm", "Ventilação ø50 mm".
- **Caixas de esgoto no 3D:** CI/CG com a base na cota (fundo); CS/ralo com o topo
  na cota; CS e ralo como cilindro com grelha, CI/CG como prisma com tampa.

## Itens

1. [x] `utils/blueprintKernel/conexoes.ts` — `JUNCAO_45`; `ramais` (direção 3D e
   bitola de cada tubo que sai do nó); nó dentro de caixa de esgoto sem conexão.
   **Pronto quando:** testes: Y a 45° → `JUNCAO_45`; ramal a 90° → `TE`; tubos na
   CI → nenhuma conexão; `ramais` com os vetores unitários certos.
2. [x] Consumidores de `TipoDeConexao` (orçamento, planilha, quantitativos) com o
   rótulo "Junção 45°". **Pronto quando:** typecheck verde e o texto do item
   `CONTAGEM_CONEXOES` cita junções.
3. [x] `utils/blueprintEsgotoAutomatico.ts` — traçado com junção 45° na árvore da
   CI. **Pronto quando:** teste com dois aparelhos em fila → o segundo entra no
   trecho do primeiro por uma `JUNCAO_45`; nenhuma conexão "fora de 45/90" na casa
   de teste; caimento, DN e "sem ponta aberta" continuam valendo (testes atuais).
4. [x] `utils/blueprintIsometrico.ts` — peças 3D das conexões, corpos das caixas
   de esgoto, rótulos ø. **Pronto quando:** testes da posição/eixo/raio das bolsas,
   da base da CI na cota do fundo e do topo da CS na cota, e dos textos dos rótulos.
5. [x] `components/blueprint/Blueprint3DViewer.tsx` — desenha conexões, caixas e
   rótulos. **Pronto quando:** visto no navegador (harness `docs/spikes/blueprint-3d`
   ou print), sem erro de console.
6. [x] `components/blueprint/BlueprintCanvas.tsx` — símbolo das conexões na planta
   2D (bolsas projetadas; prumada vira anel). **Pronto quando:** visto no navegador.
   ✔ 27/09: mesmo harness, `?vista=2d` — a peça aparece no encontro, por cima do
   tubo. O pavimento do símbolo é o dos TRECHOS (teste: ramal sob o piso do
   superior aparece na planta do superior).
7. [x] Suíte (506 arquivos / 5.797 testes), typecheck, `check-ui-standard.sh` nos 4
   componentes tocados e `check-xss-sinks.sh`: verdes em 27/09. Publicado (`e4070fa`,
   push em main) e conferido de fora: `conferir-producao.sh "Diâmetros das redes"
   "Junção 45°"` → o domínio serve exatamente origin/main.

8. [x] **Planta 2D detalhada** (`BlueprintCanvas.tsx` + `blueprintIsometrico.ts`):
   água e esgoto com zoom para isso (faixa >= `LARGURA_MINIMA_DO_DETALHE_PX` = 4 px)
   viram o TUBO em duas bordas com o miolo claro; a prumada, o círculo cheio; as
   conexões, retângulo da bolsa + disco com contorno (`COR_DO_CONTORNO_DA_PECA`); a
   CI/CG, parede + tampa com a sigla; a CS/ralo, corpo + grelha; o rótulo vira
   "ø100 mm · i 1 %" PARALELO ao tubo (`anguloDeLeitura`: nunca de cabeça para
   baixo). Longe (ou trecho sobreposto em arco), o traço simples de antes.
   **Pronto quando:** testes da faixa, do ângulo, do rótulo e da pegada; visto no
   harness `?vista=2d` em três zooms, console limpo.
   ✔ 27/09: 13 testes em `blueprintIsometrico.test.ts`; harness em servidor novo.
   Ajuste que saiu do print: o rótulo da prumada curta sob o aparelho caía sobre a
   sigla ("VS" em cima de "ø100 mm") — na planta só a prumada com nome (TQ,
   Ventilação) leva rótulo. Suíte: 506 arquivos / 5.801 testes verdes.

## Fora do escopo (anotado)

- IFC continua emitindo `IFCPIPEFITTING` só para conexão lançada à mão.
- Louças com forma própria no 3D (vaso, lavatório) — continuam caixas brancas.
- Curva longa / joelho com raio: a bolsa não desenha a curvatura.
- A árvore da caixa SIFONADA e da de GORDURA segue o Prim antigo (cada aparelho
  entra na caixa); só a árvore da CI/tubo de queda usa a junção 45°.
- Com as paredes à vista, o tubo sob o piso fica escondido (e o rótulo junto):
  para ler a rede, esconder paredes ou usar o estilo Transparente.
