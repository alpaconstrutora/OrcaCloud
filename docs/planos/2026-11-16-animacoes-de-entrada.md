# Animações de entrada do app (`animate-in` e companheiras) passam a valer

## Pedido original

> Corrija  pendência

Sessão `21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0`, 16/11/2026, ~17h. A pendência é a que eu tinha
registrado ao terminar o movimento do Portal do Investidor (guia §24.2), nas palavras da mensagem
anterior: *"cerca de 437 usos, no resto do app, de classes de animação que não têm efeito nenhum"*.

## Estado (17/11/2026)

**Tudo no ar.** O pedido original e os 5 pedidos posteriores estão no `main`, sem migration. A prova de produção de
cada PR (domínio servindo o squash, texto novo no bundle, CI da `main` verde, patch do merge = patch da branch) está
no comentário do próprio PR.

| Pedido | O quê | PR | No main |
|---|---|---|---|
| Original (16/11) | `animate-in` e companheiras passam a valer (`tw-animate-css`), trava, guia §35 | #515 | `ee11605c` |
| Posterior 1 (16/11) | Entradas em 300 ms; alertas antigos em 2 telas; item "Produção" | #517 | `ff93030f` |
| Posterior 2 (16/11) | Alertas antigos do `check-ui-standard` em 7 telas | #523 | `9ad453ec` |
| Posterior 3 (16/11) | Aba Cenários alcançável; caixa alta fora de 4 telas; confirmação da cotação pelo app | #528 | `61b64288` |
| Posterior 4 (17/11) | Cenários do paramétrico gravados no projeto; aplicar traz BDI e K; excluir pergunta | #532 | `d55343e3` |
| Posterior 5 (17/11) | Simulação guardada no orçamento; renomear cenário; voltar aos valores do projeto | #535 | `f295b36c` |

Itens do plano: **todos marcados**. O que segue aberto está em "Fora do escopo", no fim do arquivo:

- [ ] Arrastar um controle deslizante da simulação grava a cada passo. Não foi medido no App real. Se travar, gravar
  só ao soltar o controle.
- [ ] A simulação gravada não foi conferida num orçamento real: o harness provou, mas conferir no banco exige mexer
  num orçamento de verdade.

## Diagnóstico

- `animate-in`, `fade-in`, `zoom-in-95`, `slide-in-from-*` são classes do plugin de animação
  (`tailwindcss-animate` no v3; `tw-animate-css` no Tailwind v4). O `index.css` só tinha
  `@import "tailwindcss"` — sem plugin, nenhuma regra é gerada, e o build não reclama de classe
  desconhecida. Conferido no CSS de produção em 16/11: zero regras.
- Recenseamento (fora de testes e docs): **436 `animate-in`**, todas de **entrada** (nenhum
  `animate-out`, nenhuma variante `data-[state]`). 153 `slide-in-from-bottom-4`, 57 `zoom-in-95`,
  24 `slide-in-from-top-2`; durações 300 ms (201), 200 ms (112), 500 ms (86), 700 ms (15).
- Achados no caminho: 12 `zoom-in` **sem número** (escala 0 — o modal cresceria do nada) e três
  classes inventadas que não existem em lugar nenhum: `animate-fade-in` (3), `animate-slide-up` (1),
  `animate-pulse-subtle` (1).
- Risco ao ligar: o html2canvas 1.4 fotografa uma cópia do documento onde as animações recomeçam e lê
  o estilo **antes** de zerá-las (`ElementContainer`) — um `fade-in` dentro da área capturada sairia
  transparente no PDF.

## Itens

- [x] **`package.json`** — `tw-animate-css@^1.4.0` (MIT, só CSS, sem script de instalação) e
  `@tailwindcss/node@4.3.0` em devDependencies (o teste compila com ele; antes só vinha como
  dependência do plugin do Vite). *Pronto quando:* `npm ci` instala e o teste importa.
- [x] **`index.css`** — `@import "tw-animate-css"` + bloco `prefers-reduced-motion: reduce` que zera
  deslocamento/escala da `.animate-in` (fica só o esmaecimento). *Pronto quando:* o CSS do build traz
  `.animate-in{`, `@keyframes enter`, `.zoom-in-95{`, `.slide-in-from-bottom-4{` e o bloco de menos
  movimento (conferido: 1 de cada em `dist/assets/index-*.css`).
- [x] **`utils/html2canvasCores.ts`** — `coresCompativeisNaCopia` injeta na cópia
  `*, *::before, *::after { animation: none !important; }` (uma vez). *Pronto quando:*
  `__tests__/html2canvasCopiaSemAnimacao.test.ts` verde (vermelho antes).
- [x] **12 `zoom-in` → `zoom-in-95`** (MaterialModal, OrderReceiptModal, OrganizationUsers ×3,
  PayrollEventModal, RentalsModule, SalesModule, BaselineModal, ConfigModal, CrewClassificationModal,
  OutlineRowMenu). *Pronto quando:* o teste "zoom-in sem número" acha zero.
- [x] **Classes inventadas** — `animate-fade-in` → `animate-in fade-in duration-300` (AssetImportModal,
  DataTablePrototype, ImovibDetailView); `animate-slide-up` → `animate-in fade-in
  slide-in-from-bottom-4 duration-300` (PWAInstallPrompt, igual aos avisos do pé); `animate-pulse-subtle`
  removida (OrderLifeline: o marcador da etapa atual sempre foi parado; laço para destacar estado não
  entra). *Pronto quando:* o teste "toda classe da família gera regra" acha zero sem regra.
- [x] **Trava** — `__tests__/animacoesDeEntrada.test.ts`: compila o `index.css` com
  `@tailwindcss/node` e exige regra para toda classe `animate-*`/`fade-in*`/`zoom-in*`/`slide-in-from-*`
  usada no código; confere a animação `enter`, o bloco de menos movimento e zero `zoom-in` puro.
  *Pronto quando:* vermelho sem o import (25 classes sem regra), verde com ele.
- [x] **Guia** — §35 nova (vocabulário, duração, menos movimento, `fixed` dentro de quem anima, PDF);
  itens nos dois checklists; nota do §24.2 deixa de ser pendência. *Pronto quando:* a seção existe e o
  §24.2 aponta para ela.
- [x] **Navegador** — com o CSS de produção do build, no Chromium: modal a 60 ms com opacidade 0,58 e
  escala 0,979 → 1 / `transform: none`; conteúdo de aba sobe 13,6 px → 0; aviso centralizado com
  `-translate-x-1/2` fica em x = 640 (centro de 1280) do começo ao fim; menos movimento = matriz
  identidade, só esmaece. No app (visão do investidor pelo link, `vite preview` do build): o esqueleto
  de carregamento esmaece 0 → 0,22 → 0,58 (`enter`, 0,3 s); depois de carregar, nenhum elemento preso;
  0 erros de console.
- [x] **Produção** — PR #515, CI verde no PR e na `main`, merge `ee11605`; `conferir-producao.sh
  "data-captura-sem-animacao"` → domínio serve `ee11605` com o texto; CSS servido
  (`/assets/index-BJdcyN5B.css`) com `.animate-in{`, `@keyframes enter`, `.zoom-in-95{`,
  `.slide-in-from-bottom-4{` e o bloco de menos movimento.

## Pedido posterior (16/11/2026, mesma sessão)

> corrigir Pontos em aberto:
> 1. Abas lentas:\
> 2. Alertas antigos
> 3. Plano no repositório

Os três pontos em aberto do relatório do #515: entradas de 500/700 ms; os alertas do
`check-ui-standard.sh` que já existiam em dois arquivos tocados (OrderReceiptModal §7,
PayrollEventModal §8/§14); e o item "Produção" deste plano, que ficou desmarcado.

- [x] **Abas lentas** — os 102 trechos de classe com `animate-in` e `duration-500` (86),
  `duration-700` (15) ou `duration-400` (1), em 44 arquivos, passaram para `duration-300` (§35).
  Antes de trocar: nenhum desses trechos — nem o resto da linha, nem classe que continua na
  linha seguinte — tinha `transition`, que herdaria a duração. Trava nova no
  `animacoesDeEntrada.test.ts`: "entrada dura no máximo 300 ms". *Pronto quando:* a trava fica
  vermelha sem a troca (conferido) e verde com ela.
- [x] **Alertas antigos** — `OrderReceiptModal.tsx` (§7/§7.1): descrição, código, quantidade
  pedida, campo de quantidade recebida, seletor de problema e o "OK" em `text-sm font-normal`
  (sem `font-bold`/`font-black`/`font-mono`; "OK" como status em texto colorido, §8).
  `PayrollEventModal.tsx`: excluir lançamento manual pelo `useConfirm()` (§14, `variant:
  'danger'`, mensagem diz que o cálculo do colaborador é refeito); o avatar da inicial no
  histórico não é pílula — a letra vai maiúscula no texto, guia §8.2 nova. *Pronto quando:*
  `check-ui-standard.sh` sem violação nos dois arquivos.
- [x] **Plano** — este arquivo, item "Produção" marcado com a evidência.

**Publicação deste pedido:** a prova de produção (`conferir-producao.sh` + CI da `main`) fica
registrada como **comentário no PR** deste pedido — o plano não ganha um item que só poderia
ser marcado com outro commit depois do merge (foi o que deixou o "Produção" acima desmarcado).

Publicado no PR #517 (`ff93030`); prova de produção no comentário do PR.

## Pedido posterior 2 (16/11/2026, mesma sessão)

Pergunta minha: *"a troca de duração passou por 7 arquivos que já tinham 65 linhas de alertas
antigos… Quer que eu corrija também?"* — resposta:

> sim

Os 7 arquivos e o que o `check-ui-standard.sh` acusava (idêntico a `origin/main`, nenhum veio da
troca de duração):

- [x] **`Dashboard.tsx`** (Curva ABC) — §7: posição, descrição, % e acumulado em `text-sm
  font-normal`; custo `font-medium` (dinheiro). §8: "Classe A/B/C" e o nome do projeto ao lado do
  título viram texto colorido (sem pílula/fundo/caixa alta).
- [x] **`ParametricEstimator.tsx`** — §7 nas tabelas da Curva S e de Quantitativos (sem
  `font-bold`/`font-black`/`font-mono`; dinheiro `font-medium`; unidade em texto). §8: as
  etiquetas "Produto Atual"/"Estudo Comparativo" sobre a borda dos cartões viram legenda de texto
  dentro do cartão. §14: "Converter para Analítico" (substitui o orçamento → `variant: 'danger'`) e
  "aplicar as taxas do cenário" pelo `useConfirm()`.
- [x] **`ProjectOverview.tsx`** e **`TaxReport.tsx`** — §8: a pílula maiúscula dentro do cabeçalho
  escuro ("Status: …", "Consultor IR …") vira texto claro. O cabeçalho "hero" fica (§20: linguagem
  deliberada, não se migra sem decisão).
- [x] **`RentalsDashboard.tsx`** — o §8 era falso positivo (bolinha da legenda e rótulo na mesma
  linha), mas o rótulo `text-xs font-black text-gray-400 uppercase` contrariava a legenda da §28.3:
  agora quadrado `w-2.5 h-2.5 rounded-[2px]` + `text-xs text-gray-500`.
- [x] **`SupplyChainQuotationComparison.tsx`** (36 linhas) — §7 nas células da matriz, no rodapé
  (total, forma/condição de pagamento, entrega) e na tabela da contraproposta (campo de preço
  `h-9 rounded-[6px] text-sm font-normal text-gray-900`, §7.1/§32); §17 nos 5 botões de ação
  (`h-9 rounded-[6px] text-[13px] font-medium`, sem caixa alta/sombra); §8 na situação da
  negociação, em "Histórico"/"WhatsApp" (chips `rounded-[6px]`) e no autor do histórico.
- [x] **`investor/HoldingsList.tsx`** — §7 na tabela (nome, cotas, progresso; patrimônio
  `font-medium`); §8 no status da tabela e do cartão.

*Pronto quando:* `check-ui-standard.sh` com exit 0 nos 7 (conferido) e as telas medidas no
harness `docs/spikes/alertas-ui-sete-telas` (todas exigem login): 0 texto com peso > 500 em `<td>`,
0 `font-mono` em `<td>`, 0 pílula maiúscula, botões de ação da cotação com 36 px/6 px/peso 500,
"Converter" abre o diálogo do app e nenhum `confirm()` nativo; prints conferidos. Teste novo
`ParametricConverterConfirma.test.tsx` (vermelho com o arquivo antigo, verde com o novo).

Publicado no PR #523 (`9ad453e`); prova de produção no comentário do PR.

## Pedido posterior 3 (16/11/2026, mesma sessão)

Os dois pontos que o #523 deixou registrados ("aba Cenários inalcançável"; "caixa alta/peso pesado
nas mesmas telas: abas e rodapé do modal de contraproposta, rótulos dos indicadores da Visão da
obra, botão Baixar PDF do IR") — resposta:

> Corrigir estes pontos

Decisão de escopo: a caixa alta não estava só nos itens listados — a Visão da obra tinha 17, o IR
9, a comparação de cotações (fora do modal) 3 e o paramétrico 18 + textos já escritos em
maiúsculas. Corrigir só os listados deixaria as mesmas telas pela metade (guia §21: a caixa alta
saiu do app inteiro), então as quatro telas foram limpas inteiras.

- [x] **Aba "Cenários"** (`ParametricEstimator`) — o painel existia desde o commit inicial sem
  botão. A aba entra entre "Estudo de mix" e "Milestones" (a ordem do próprio tipo `intelTab`),
  com a contagem: "Cenários (1)". A barra de sub-abas passa ao vocabulário do §19.1/§21
  (`px-3 h-7 rounded-[6px] text-sm font-medium`, rótulos em sentence case, inativa `text-gray-700`).
  Teste `ParametricAbaCenarios.test.tsx` (vermelho sem a aba).
- [x] **Modal de contraproposta** (`SupplyChainQuotationComparison`) — abas `h-9 text-sm
  font-medium`; cabeçalho da tabela §6.2; histórico e rodapé sem caixa alta; Cancelar/Enviar §17.
  O modal de confirmação feito à mão (`pendingConfirm`, §14 proíbe) virou `useConfirm()` com título
  e variante (fechar compra, aceitar, recusar = `danger`, regerar número = `warning`). Fora do modal:
  cabeçalho da matriz §6.2, selo do número `rounded-[6px]`, "Carregando mapa comparativo…".
  Teste `CotacaoConfirmaPeloDialogo.test.tsx` (vermelho com o modal antigo).
- [x] **Visão da obra** (`ProjectOverview`) — rótulos do cabeçalho escuro (Custo orçado, Progresso
  físico, Execução financeira, Previsão de ROI) e todos os rótulos/seções da tela em
  `text-xs font-semibold` sem caixa alta; "Acessar módulo" `text-sm font-medium`.
- [x] **IR** (`TaxReport`) — "Baixar PDF completo" §17 compacto; desligado, o motivo ("Disponível
  em breve") num `<span title>` em volta (botão desligado não mostra `title` — §9.2); rótulos sem
  caixa alta.
- [x] **Paramétrico** — rótulos do cabeçalho (Fator K, Preço sugerido), KPIs, legendas, réguas dos
  sliders, cabeçalhos das tabelas, painel de cenários; o selo "IMPACTO ALTO" era pílula de status
  disfarçada (`toUpperCase()` no JS escapava do script) → texto colorido (§8).

*Pronto quando:* `check-ui-standard.sh` exit 0 nos 4; no harness, **0 elemento com
`text-transform: uppercase`** em cada uma das 4 telas e no modal, aba "Cenários (1)" abre o
gerenciador, "Fechar Compra" abre o diálogo do app (0 diálogo nativo), botão do IR 36 px/peso 500
com o motivo no `title` em volta; prints conferidos.

Publicado no PR #528 (`61b6428`); prova de produção no comentário do PR.

## Pedido posterior 4 (17/11/2026, mesma sessão)

> Corrigir problemas com cenários
>
> Sessão: 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0 · 2026-11-17

Diagnóstico (`ParametricEstimator`, lido em `origin/main` 6b055c1): os cenários eram um
`useState` da tela, e daí vinham os outros defeitos.

- [x] **Somem ao sair da tela/recarregar** — passam a morar em `settings.parametricScenarios`
  (tipo `ParametricScenario` em `types/project.ts`). O autosave do projeto já grava qualquer campo
  das configurações (`usePersistenceSync` compara o JSON inteiro), e abrir o projeto carrega o
  objeto inteiro: **sem migration**. A carga do CUB passa a depender só dos campos que as
  consultas leem — com `[settings]` inteiro, cada cenário salvo recarregaria a tela.
- [x] **"Restaurar" só trazia o fator K** — o cenário nem guardava a composição do BDI. Agora
  guarda BDI (composição), K, sensibilidade (materiais/mão de obra) e prazo, e aplicar traz tudo;
  se o padrão ou a área do orçamento mudaram desde então, o diálogo avisa que o valor não volta.
- [x] **"Salvar cenário" durante o carregamento** gravava R$ 0,00 (→ "Infinity%"): desligado
  enquanto carrega ou sem valor, com o motivo no `title` em volta (§9.2).
- [x] **Excluir e "Limpar tudo" apagavam sem perguntar** → `useConfirm()` (§14).
- [x] **Numeração repetia** depois de excluir ("Cenário 2" duas vezes) → maior número + 1.
- [x] **"Variação VGV"** (é custo, não VGV; verde quando o atual ficava mais caro, vermelho em
  0%) → "Diferença para o atual" em texto neutro ("12,3% abaixo do atual", "igual ao atual").
- [x] **Data**: só a hora → data e hora (o cenário agora atravessa dias). Lista lateral da aba
  financeira: BDI sem arredondar ("31.234567%"), letra de 9 px → pt-BR e `text-xs`.
- [x] Sobra do pedido posterior 3: "DURAÇÃO DA OBRA:" (caixa alta escrita no texto, não por
  classe — escapou da medição por `text-transform`) → "Duração da obra".

Regras puras em `utils/cenariosParametricos.ts`. *Pronto quando:* `cenariosParametricos.test.ts`
e `ParametricCenarios.test.tsx` vermelhos com o código antigo (5 de 5 na tela) e verdes com o
novo; no harness, salvar → sair da tela → voltar mantém os cenários, aplicar traz K e lucro,
excluir e limpar perguntam, 0 diálogo nativo, 0 erro de console.

Publicado no PR #532 (`d55343e`); prova de produção no comentário do PR.

## Pedido posterior 5 (17/11/2026, mesma sessão)

> Corrigir também
>
> Sessão: 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0 · 2026-11-17

"Também" = os dois itens que o pedido posterior 4 deixou em "Fora do escopo".

- [x] **A simulação some ao sair da tela** (BDI, fator K, sensibilidade e prazo mexidos fora de um
  cenário). Passa a morar em `settings.parametricSimulation` (tipo `ParametricSimulation`), um
  campo **à parte** de `bdiComposition`/`kFactor` do projeto — simular não muda o BDI das
  Configurações nem o valor que `parametricService` calcula. Sem simulação gravada, a tela segue o
  BDI e o K do projeto; igual a eles, o campo nem é gravado (abrir a tela não suja o projeto).
  Cada mudança é UMA gravação: aplicar um cenário trocava 5 estados seguidos, e 5
  `onUpdateSettings` a partir do mesmo `settings` deixariam só o último.
- [x] **Voltar aos valores do projeto**: com a simulação guardada não há mais "sair e voltar"
  para zerar. Botão no painel do BDI, só quando a simulação difere do projeto, com confirmação
  (`useConfirm`, §14).
- [x] **Renomear cenário**: lápis (`ActionIconButton kind="edit"`) abre o nome num campo `h-9`;
  Enter ou clicar fora grava, Esc desiste. Nome vazio ou igual não grava; corta em 80 caracteres.
  Confirmações citam nome livre entre aspas ('Excluir o cenário "Otimista"?').
- [x] No mesmo painel: "BDI calculado: 39.28%" e "x1.35" → pt-BR ("39,28%", "x1,35").

*Pronto quando:* testes novos vermelhos com o código anterior (13: regras puras ausentes, nada
gravado, sem botão de renomear) e verdes com o novo; abrir a tela não chama `onUpdateSettings`;
no harness, K, lucro, sensibilidade e prazo sobrevivem a sair/voltar, renomear com Enter/clicar
fora grava e Esc não, "Voltar aos valores do projeto" pergunta e volta ao K e lucro do projeto.

Publicado no PR #535 (`f295b36`); prova de produção no comentário do PR. A 1ª rodada da CI do PR falhou em
`PortalHelpSettings.test.tsx`, um arquivo que o PR não toca e que passou 3 de 3 vezes localmente. A 2ª rodada passou.

## Fora do escopo (registrado, não feito)

- ~~Durações de 500/700 ms em conteúdo de aba~~ — feito no pedido posterior acima.
- ~~Aba "Cenários" inalcançável; caixa alta nas mesmas telas~~ — feito no pedido posterior 3.
- ~~Os cenários do paramétrico vivem só no estado da tela (somem ao sair)~~ — feito no pedido
  posterior 4.
- ~~A simulação em si (BDI e fator K fora de um cenário) continua só na tela; cenário não tem
  renomear~~ — feito no pedido posterior 5.
- Arrastar um controle deslizante da simulação grava a cada passo (o App re-renderiza e o
  autosave reinicia a espera de 2 s). No harness: 17 ms por passo (mediana; p90 22 ms), um
  quadro. No App real não medido — se travar, gravar só ao soltar o controle.
- A simulação gravada (#535) foi provada nos testes e no harness, não num orçamento real. Conferir pede alguém mexer
  na simulação de um orçamento e uma leitura de `settings.parametricSimulation` no banco.
