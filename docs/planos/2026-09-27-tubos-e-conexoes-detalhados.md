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

Pedido seguinte, mesma sessão, com print do 3D (caixa d'água azul no canto, tubos
azuis em diagonal pelo cômodo), depois de `f93fb32`:

> veja print.
> 1. a caixa dgua esta dentro da parede .deve estar sobre a laje.
> 2. tubulacao de agua fria e quinte deve passar pelas paredes

Pedido seguinte, mesma sessão, depois de `12dc3fd`:

> agua fria e quante passam embutidas nas paredes

Simulada a versão publicada na planta do usuário (rascunho de 19:27 UTC, em memória,
sem gravar): barrilete e descidas já na parede, mas o TOCO final (325 mm) ia do eixo
ao centro da louça, no ar — os pontos nasciam no centro da peça. Pergunta: "Como
corrijo o ponto de água que fica no centro da louça?" → **"Louça põe na parede +
água encosta os antigos (Recomendado)"**.

Pedido seguinte, mesma sessão, depois de `ec994ab`:

> 1. veja planta aberta. parece que caixa dgua esta parte dentro da laje
> na visao em 3d. botão exibir / ocultar piso e lajes nao esta funcionando

Na planta do usuário (rascunho de 23:25 UTC): laje ESTRUTURAL L1 de 2800 a 2900 e a
caixa com o fundo a 2800 — 10 cm dentro do concreto. O botão "Piso / laje" só mexia na
laje fina do piso (padrão desligado); a L1 era desenhada sempre.

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

9. [x] **Caixa d'água sobre a laje** (`blueprintIsometrico.centroDoTerminal3D`): a
   ficha diz que a cota é o FUNDO; o 3D punha o centro nela e a caixa nascia meio
   enfiada na parede. Agora apoia na cota. **Pronto quando:** teste (cota 2800,
   altura 800 → centro 3,20 m) e visto no harness `?cena=agua`.
   ✔ 27/09.
10. [x] **Água fria e quente pelas paredes** (`utils/blueprintRotaPelasParedes.ts` +
   `blueprintAguaAutomatica.ts`): grafo do eixo das paredes (partido nos encontros e
   nas projeções dos pontos); ramal a 2,20 m e BARRILETE no teto pelo grafo (Steiner
   por caminhos mínimos, nó de passagem emendado); coluna no eixo da parede; descida
   dentro da parede e toco até a face. Ponto a mais de `raioDeEncaixeMm` (700) de
   parede: reta, com aviso. `pelasParedes: false` volta ao reto. Rótulo 3D do tubo
   embutido em parede opaca fica oculto (o sprite saía da parede como papel branco).
   **Pronto quando:** teste — todo horizontal novo no ramal e no teto está sobre o eixo
   de uma parede, inclusive com ponto do outro lado da sala; visto no harness.
   ✔ 27/09: 6 testes em `blueprintRotaPelasParedes.test.ts`; harness `?cena=agua`
   (sólido e transparente) em servidor novo, console limpo. O primeiro print mostrou o
   BARRILETE ainda em reta cruzando a sala — passou a ir pelas paredes também. Suíte:
   507 arquivos / 5.809 testes.

11. [x] **Ponto de água na face da parede.** `faceDaParede` (`blueprintRotaPelasParedes`);
   `pontosDaLouca` põe a ÁGUA (fria/quente) na face atrás da peça (alcance: meia
   maior medida + 400 mm), o esgoto no centro; a água automática ENCOSTA na face o
   ponto solto a até `raioDeEncaixeMm` (`TranslateEntities` no plano, com aviso).
   **Pronto quando:** testes — lavatório a 325 mm do eixo → água em (6600, 5650),
   esgoto no centro; ponto solto encostado (delta 250) e nenhum horizontal fora do
   eixo além do toco de 75 mm; rodar de novo → nada.
   ✔ 27/09: simulação na planta do usuário → 8 de 8 trechos de água DENTRO da parede.
   Suíte: 507 arquivos / 5.811 testes.

12. [x] **Caixa d'água apoia no topo da laje** (`apoioDaCaixaDagua`): laje estrutural
   debaixo dela (em planta) e atravessada pela cota → a base vai para o topo da laje.
   **Pronto quando:** teste com a L1 do usuário (2800 → 2900) → apoio 2900; fora da
   laje, a cota. ✔ 27/09, e visto no harness `?cena=agua`.
13. [x] **Botão "Pisos e lajes"**: desligado esconde também as lajes ESTRUTURAIS; chave
   nova (`blueprint:vista3dPisosELajes`) nascendo LIGADA — a antiga guardava `false` e
   sumiria com as lajes de quem nunca tocou no botão. **Pronto quando:** harness
   `?cena=agua&laje=0` sem a L1 e `?cena=agua` com ela. ✔ 27/09, console limpo.
   Suíte: 507 arquivos / 5.812 testes.

## Fora do escopo (anotado)

- IFC continua emitindo `IFCPIPEFITTING` só para conexão lançada à mão.
- Louças com forma própria no 3D (vaso, lavatório) — continuam caixas brancas.
- Curva longa / joelho com raio: a bolsa não desenha a curvatura.
- A árvore da caixa SIFONADA e da de GORDURA segue o Prim antigo (cada aparelho
  entra na caixa); só a árvore da CI/tubo de queda usa a junção 45°.
- Parede em arco: a rede pelas paredes usa a corda a→b.
- A REDE continua saindo da cota da caixa (2800), dentro da laje; só o desenho da
  caixa apoia no topo dela.
- Ramais pelas paredes não desviam de portas/janelas: correm a 2,20 m, acima delas.
- Com as paredes à vista, o tubo sob o piso fica escondido (e o rótulo junto):
  para ler a rede, esconder paredes ou usar o estilo Transparente.
