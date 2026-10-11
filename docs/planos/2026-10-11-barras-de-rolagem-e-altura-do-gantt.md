# Barras de rolagem discretas que alargam no hover + altura limitada do Gantt

## Pedido original

Sessão de 11/10/2026 (Claude Code, VS Code). Pedido do usuário, transcrito literalmente:

> availe essas Boas Práticas de UI/UX para as barras de rolagens verticais e horizontais:
>
> • Expansão ao passar o mouse (Hover): Faça a barra de rolagem alargar um pouco quando o cursor do usuário se aproximar dela.
> • Use barras de sobreposição (Overlay): O padrão moderno de sistemas como macOS e Windows é exibir a barra fina apenas quando o usuário está rolando a página, sumindo logo em seguida.

Avaliação respondida na sessão: adotar a primeira; **não** adotar a segunda como descrita
(esconde a existência de conteúdo à direita em tabelas largas e no Gantt; overlay de
verdade exige barra desenhada em JS, que conflita com cabeçalhos sticky, virtualização e
a sincronia de rolagem do Gantt). Proposta no lugar: barra discreta em repouso que nunca
some, ganha contraste ao passar o mouse sobre a área e alarga sobre a própria barra — mais
limitar a altura do Gantt para a barra horizontal ficar à vista. Resposta do usuário:

> Se concordar, implemento a barra discreta que alarga no hover para o app inteiro, mais a altura limitada do Gantt, com o mesmo cuidado de medir antes e depois: de acordo!

## Decisões

- **Largura reservada continua 8px.** Alargar o espaço da barra (ex.: 12px) tiraria 4px de
  todo contêiner rolável do app — e há tabelas cuja soma de colunas está no limite da largura
  útil (a coluna da direita some). O "alargar" é VISUAL, dentro dos mesmos 8px: o polegar
  fica com ~4px em repouso (borda transparente + `background-clip: padding-box`) e ocupa os
  8px no hover.
- **Discreta, nunca some:** polegar claro em repouso; mais contraste quando o mouse está
  sobre a área rolável; mais escuro e largo sobre o polegar; mais escuro ainda ao arrastar.
- **Firefox** não tem `::-webkit-scrollbar`: `scrollbar-width: thin` + `scrollbar-color`,
  dentro de `@supports (-moz-appearance: none)`. No Chrome 121+, declarar `scrollbar-color`/
  `scrollbar-width` DESLIGA o `::-webkit-scrollbar` — por isso o bloco só vale para o Firefox.
- **Gantt com altura limitada:** o contêiner do Gantt cresce até a última linha (o pai é
  `flex flex-col` sem altura), então a barra horizontal fica depois da última tarefa e a
  rolagem vertical é a da página. Passa a ocupar a altura que sobra na janela (mínimo
  400px): rolagem própria nos dois eixos, cabeçalho de datas fixo (o `sticky top-0` que já
  existe passa a valer) e a barra horizontal sempre à vista.

## Itens

### 1. Barras de rolagem do app (index.css)
- **Muda:** a regra global `::-webkit-scrollbar*` de `index.css` (8px fixos) e um bloco para
  o Firefox.
- **Pronto quando:** num harness com barras visíveis (Playwright sem `--hide-scrollbars`),
  o polegar medido em pixels tem ~4px em repouso e 8px com o mouse sobre ele; a cor em
  repouso é mais clara que com o mouse sobre a área; a largura reservada continua 8px
  (`offsetWidth − clientWidth` de um contêiner rolável = 8).
- **Estado:** ✅ feito (11/10). `docs/spikes/barras-rolagem/medir.mjs`, nas duas barras:
  repouso 4px `rgb(226,232,240)`; mouse sobre a área 4px `rgb(203,213,225)`; sobre o
  polegar 8px `rgb(148,163,184)`; reservado 8px. A verificação falha no CSS antigo (8px
  sempre, sem contraste na área) e passa no novo. ⚠️ Achado: o Chrome só repinta a barra no
  :hover da ÁREA se o hover mudar algum estilo do próprio elemento — sem isso a regra
  `*:hover::-webkit-scrollbar-thumb` não pinta nada. Gatilho: variável `@property
  --barra-sob-o-mouse` NÃO herdada (herdada, recalcularia a subárvore inteira a cada
  entrada do mouse).

### 2. Altura do Gantt limitada à janela (ScheduleGantt)
- **Muda:** o contêiner rolável do Gantt mede a altura que sobra até o fim da área visível do
  rolador da página (mínimo 400px) e passa a rolar sozinho.
- **Pronto quando:** num harness que reproduz o layout da tela (rolador da página + ribbon +
  Gantt com 300 tarefas), ANTES a barra horizontal está fora da janela e DEPOIS está à
  vista sem rolar a página; o cabeçalho de datas continua visível após rolar o Gantt para
  baixo; quadros acima de 50ms na rolagem continuam 0 (medir.mjs).
- **Estado:** ✅ feito (11/10). `docs/spikes/gantt-rolagem/layout.mjs` (300 tarefas, Dia,
  janela 900px): ANTES contêiner 11.958px, barra horizontal a 12.186px (fora da janela),
  cabeçalho rolava junto; DEPOIS 648px, termina em 876px, barra à vista, rola sozinho e o
  cabeçalho fica no topo após descer 2.000px. Rolagem: 0–1 quadro > 50ms (ruído no limite
  de 50ms, repetido 2×); arrasto da barra e navegação antes do início seguem verdes.

### 3. Verificação e publicação
- **Pronto quando:** typecheck, build, check de UI e suíte completa com a conta fechando;
  publicado só com autorização; conferido em produção com o usuário de leitura (o usuário
  autorizou o uso da senha nesta sessão).
- **Estado:** ✅ feito (11/10). Typecheck, XSS, build (o `@property` chega ao CSS de
  produção) e suíte (8503 + 34 pulados = 8537, conta fechando). Publicado em `36e8dbfa`
  (autorizado: "sim"); CI verde; `conferir-producao.sh` confirmou o domínio servindo
  `36e8dbf`. Conferido em produção com o usuário de leitura, escritas bloqueadas, no
  planejamento Divino Espírito Santo (escala Dia, janela 1000px): Gantt com 717px, termina
  em 976px, barra horizontal à vista, rola sozinho, cabeçalho fixo após descer 1.200px.
