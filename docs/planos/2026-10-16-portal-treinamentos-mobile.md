# Portal de Treinamentos — versão para o celular

## Pedido original

Sessão `61edd96c-0bd1-4786-b550-a4ff23a33593` · 16/10/2026, logo depois de publicar "atribuição vira
matrícula na hora":

> Fazer uma versao mobilie para o portal de treinamento

## O que havia

`components/training/TrainingPortal.tsx` (15/10) é a casca de desktop com um "respiro" para
telas estreitas: barra inferior `md:hidden` com as quatro abas, `pb-24` no conteúdo e toast
`bottom-20`. No telefone de verdade isso ainda é a tela de desktop encolhida: `h-screen` (no
Safari/Chrome do celular é a altura COM a barra do navegador — a barra inferior some atrás dela),
Certificados e Histórico são tabelas com rolagem horizontal, o cabeçalho de 64px com o nome da
organização ao lado do selo, o menu da conta cai como dropdown de 280px e o player abre no desenho
largo (sumário de 256px ao lado do vídeo).

## Padrão da casa seguido

O mesmo de Minhas Tarefas e do Diário de Obras (`TasksMobileApp`, `DiaryMobileApp`,
`docs/planos/2026-10-14-diario-mobile-tela-cheia-aparelho.md`):

- `isMobile = innerWidth < 768` lido uma vez na montagem → o app do celular entra no lugar da tela;
- dois modos: **aparelho** (tela cheia, `h-dvh` onde houver, rodapés somam
  `env(safe-area-inset-bottom)`) e **prévia** (dentro de `MobilePreviewFrame`, `h-screen` do
  iframe + barra de status falsa, porque a moldura desenha o notch por cima do topo);
- toast e folha de conta PRÓPRIOS, `absolute` dentro do telefone — dentro do iframe da prévia
  qualquer `createPortal(document.body)` vai para o documento pai;
- player no modo `compacto` (o mesmo que o Portal do Colaborador por link já usa no telefone).

## Decisões

| Data | Pergunta | Decisão |
|---|---|---|
| 16/10/2026 | Casca nova ou remendar a atual? | Casca própria `TrainingPortalMobile` (app: cabeçalho curto, barra inferior, folha de conta, player compacto). O **comportamento** (abas, aula aberta, matrícula por inscrição, invalidações, toast, acesso) sai para o hook `useTrainingPortal`, usado pelas duas cascas — uma fonte só. |
| 16/10/2026 | Tabelas no celular? | Certificados e Histórico ganham `compacto`: cartões (número/curso/validade/situação + PDF e Validação lado a lado; curso/origem/realizado/validade/nota/situação). O Catálogo põe a busca abaixo do título, na largura toda. Meus treinamentos já era cartão. As abas continuam as mesmas (dados, RPCs, `data-tour`). |
| 16/10/2026 | Onde ver no desktop? | Botão "Ver no celular" (ícone, só `md+`) no cabeçalho do portal: abre `MobilePreviewFrame` com a casca mobile em modo prévia, com os dados do próprio treinando (as RPCs são "para mim"; não há como pré-visualizar como outra pessoa sem RPC nova — por isso a prévia não fica na gestão). |
| 16/10/2026 | Barra inferior durante a aula? | Some: a sala de aula ocupa a tela toda e a seta "voltar" do player é a saída (como a folha do Diário esconde a barra). |
| 16/10/2026 | Tour e ajuda na prévia? | A central de ajuda abre (vai para o documento pai, como nos outros portais em prévia); tour automático desligado na prévia — ele procura `[data-tour]` no documento pai e não acharia os elementos dentro do iframe. |

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/training/useTrainingPortal.ts` (novo) | estado e ações compartilhados pelas duas cascas | typecheck; desktop continua igual no navegador |
| 2 | `components/training/TrainingPortalMobile.tsx` (novo) | casca do celular: aparelho × prévia, StatusBar na prévia, cabeçalho curto, barra inferior com safe-area, folha de conta, toast interno, player `compacto`, mesmos `data-tour` | Playwright 390×844 (`isMobile`): barra inferior dentro da tela, 4 abas trocam, conta abre Meus dados, ajuda abre; prévia pelo iframe |
| 3 | `components/training/portal/TraineeCertificatesTab.tsx`, `TraineeHistoryTab.tsx`, `TraineeCatalogTab.tsx` | prop `compacto` (cartões / busca na largura toda) | teste jsdom com dados falsos: cartão mostra número, curso, validade, situação e os dois botões; histórico mostra origem e nota |
| 4 | `components/training/TrainingPortal.tsx` | vira o seletor (`isMobile` → mobile); casca de desktop usa o hook; botão "Ver no celular" com `MobilePreviewFrame` | Playwright desktop: botão abre a moldura e o iframe mostra a casca mobile |
| 5 | `__tests__/components/TrainingPortalMobile.test.tsx` (novo) | prova dos cartões e da navegação com dados falsos | `npx vitest run` verde |

## Estado

- [x] 1 · 2 · 3 · 4 · 5 — tipos dos 7 arquivos tocados: 0 erros; `check-ui-standard` sem violação nos 5 `.tsx`; teste jsdom 5/5 (cartões de Certificados e Histórico com dados falsos, folha de conta → Meus dados, barra de status só na prévia)
- [x] Verificação no navegador (16/10/2026, `C:/tmp/pwtest/portal-treinamentos-mobile/prova.js`, dev server da frente). A conta de teste não tinha mais acesso ao portal nem permissão para liberar; com o usuário de acordo, criei um acesso TEMPORÁRIO pela mesma RPC da tela (`academy_portal_users_create`, sob o JWT do administrador) e apaguei acesso + ficha no fim. Celular 390×844 (`isMobile`): raiz `data-modo=aparelho` ocupando 390×844, barra inferior em y 789–844 (dentro da tela), as 4 abas trocam com `aria-current`, busca do catálogo com 358px (largura toda), nenhuma `<table>`, folha de conta abre e leva a Meus dados, ajuda abre. Desktop 1440: menu lateral continua; "Ver no celular" abre a moldura e o iframe mostra `data-modo=previa` com barra de status falsa e a barra inferior. Sem erro de console nem 4xx/5xx.
- [x] Armadilha do harness: o mini-tour "como usar esta tela" abre 400 ms após a PRIMEIRA visita a cada aba e o véu `z-[400]` engole o clique seguinte; o botão de pular é ícone (`aria-label="Pular o tour"`), fora do div do véu. Esperar o véu sair antes de clicar.
- [x] Publicação: `main` em `a01da95e` (16/10/2026, rebase sobre dois commits da Planta sem arquivo em comum); suíte inteira 9884 ✓ (as 2 falhas de `PainelVersoes` passam sozinhas — timeout de 5 s sob carga, fora desta frente)
