# Portal do Corretor — versão para o celular

## Pedido original

Sessão `1d43a73e-ebe3-4903-a8ba-0d2a6314d508` · 16/10/2026, com o print da prévia mobile
(moldura de celular, aba Empreendimentos aberta):

> portal do corretor: veja a tela. nao ficou nada bom. faça plano para melhoria UI/UX

## O que o print mostra, e por quê (lido no código de `origin/main`, 16/10/2026)

### 1. A prévia não mostra o que o corretor vê

`BrokerPortal` abre a prévia como `<BrokerPortal isPreview … />` **sem** `portalToken`
(`components/BrokerPortal.tsx`, bloco `MobilePreviewFrame`). Como `isStandalone = !!portalToken`,
a moldura desenha a **visão interna de desktop** dentro do telefone:

- `h1` "Portal do Corretor" em `text-3xl font-black`, sem barra de status: o entalhe da moldura
  corta o título (no print, "Portal do C…rretor");
- subtítulo "Olá, geleia • Estoque, propostas, leads e comissões em tempo real." — nome tirado do
  e-mail, minúsculo, e uma frase de marketing que não ajuda ninguém no celular;
- a barra de abas de desktop (`flex-wrap`, `h-7`) quebra em duas linhas e ainda assim não cabe
  — com mais abas habilitadas vira três;
- o cartão "Primeiros passos" entra **antes** da navegação e ocupa a primeira dobra inteira
  (~270 px de 780).

### 2. No celular de verdade é pior que a prévia

Pelo link ou pelo login próprio (`BrokerPortalTokenGate`, `App.tsx`), o corretor recebe a casca
pública, que é desktop puro, sem nenhum breakpoint:

- faixa "Acesso via link público" (36 px) + cabeçalho de 64 px com selo "Broker Portal" + nome +
  chip "Nome (CORRETOR)" → o chip sozinho não cabe em 390 px;
- `<aside className="w-64 … shrink-0">` **sem `hidden md:flex`**: num telefone de 390 px o
  menu lateral come 256 px e o conteúdo fica com ~100 px;
- raiz `h-screen` (100vh): no Safari/Chrome do celular é a altura **com** a barra do navegador —
  o que estiver no rodapé (barra da cesta) some atrás dela.

### 3. Nenhuma aba tem versão compacta

`grep md:hidden components/broker/*.tsx` → **0** em 12 arquivos.

| Aba | O que acontece em 390 px |
|---|---|
| Empreendimentos (lista) | tabela de 4 colunas com `overflow-hidden` (sem rolagem): "Unid…" cortado, endereço quebrando palavra por linha — é o print |
| Empreendimentos (tabela de preços) | 12 colunas (espelho de `PriceTableManager`), rolagem horizontal longa, ação "Proposta" na última coluna, fora da tela |
| Estoque | duas pílulas de filtro lado a lado (finalidade + empreendimentos) em linha rolável escondida; o espelho do prédio (`PropertyUnitMap`) rola na horizontal dentro de um card com `p-6` |
| Propostas | linha `flex justify-between` com unidade + comprador + CPF à esquerda e valor + status + 2 botões à direita — esmaga |
| Simulador | colunas já viram 1 em `md:`, mas o botão de enviar fica no fim de uma página longa |
| Leads | tabela + funil `grid-cols-5` **sem breakpoint** (5 colunas de ~60 px) |
| Analytics | `grid-cols-5` sem breakpoint |
| Materiais | tabela como visão padrão |
| Comissões, Ranking, Treinamento, Agenda, Chat | `md:` já existe na maior parte; falta conferir no aparelho |

### 4. Detalhes de interação

- `alert()` em reservar unidade e em enviar proposta (`BrokerPortal`) e em Materiais — no celular
  é o diálogo cru do navegador;
- barra da cesta `fixed bottom-6` e toast `fixed bottom-6 right-6` desenhados para desktop;
- menu de conta com 6 itens, dois deles ("Preferências", "Notificações") só dizem "em breve" — é
  um botão sem função, e "Minha conta" repete um subconjunto de "Meus dados".

## Padrão da casa seguido

O mesmo do Portal de Treinamentos, do Diário e de Minhas Tarefas
(`docs/planos/2026-10-16-portal-treinamentos-mobile.md`, `TrainingPortalMobile`, `DiaryMobileApp`,
`TasksMobileApp`):

- `isMobile = innerWidth < 768`, lido uma vez na montagem → a casca de app entra no lugar da tela;
- dois modos: **aparelho** (tela cheia, `h-dvh`, rodapés somam `env(safe-area-inset-bottom)`) e
  **prévia** (dentro de `MobilePreviewFrame`, `h-screen` do iframe + barra de status falsa, porque a
  moldura desenha o entalhe por cima do topo);
- toast e folha de conta PRÓPRIOS, `absolute` dentro do telefone (na prévia, qualquer
  `createPortal(document.body)` cai no documento pai);
- o **comportamento** (dados, cesta, simulador, abas visíveis, ações) sai para um hook usado pelas
  duas cascas — uma fonte só; as abas recebem `compacto` em vez de ganhar cópias.

Navegação inferior: mesmo desenho do Portal do Cliente (`ClientArea`, barra `md:hidden` com 4
abas + "Mais" e folha inferior com o restante + Ajuda), na cor indigo do corretor
([[project_brokerportal_interno_vs_casca_publica]]: a casca externa do corretor é indigo).

### Como fica (390 px)

```
ANTES (prévia de hoje)               DEPOIS
┌──────────────────────────┐         ┌──────────────────────────┐
│ Portal do C▓▓▓rretor  (?)│         │ 9:41              ▂▄▆ ▮  │ ← só na prévia
│ Olá, geleia • Estoque,…  │         │ (G) Olá, Geleia      (?) │
│┌────────────────────────┐│         │     Empreendimentos      │
││ Primeiros passos       ││         ├──────────────────────────┤
││ 0 de 3 feitos          ││         │ ◔ Primeiros passos 0/3 › │ ← 1 linha
││ ○ Conheça os empreend. ││         │┌────────────────────────┐│
││ ○ Envie uma proposta   ││         ││ [foto] 010 · Galeria   ││
││ ○ Baixe um material    ││         ││ R. Angelo B. Faccio, 98││
│└────────────────────────┘│         ││ 12 disponíveis de 40  ›││
│ [Empreend.][Propostas]   │         │└────────────────────────┘│
│ [Comissões][Mater.][Chat]│         │┌────────────────────────┐│
│ Empreendimentos          │         ││ [foto] 011 · …         ││
│ ┌Empreend.^┬Endereço┬Uni│         │└────────────────────────┘│
│ │ 010 - Ga │ Rua    │   │         │  ┌─ 2 unid. · R$ 812 mil ─┐
│ │ Alt…     │ Angelo │   │         │  └──────── [Proposta] ───┘│ ← cesta
│ │          │ Bernar…│   │         ├──────────────────────────┤
└──────────────────────────┘         │ 🏢    ▦     📄    $    ⋯ │
                                     │Empr. Estoq. Prop. Com. Mais│
                                     └──────────────────────────┘
```

## Pedido posterior (16/10/2026, mesma sessão, ao confirmar D2, D5 e D6)

> Barra inferior: de acordo
> Menu da conta no celular: de acordo
> Aba Saúde: : de acordo
>
> mais um ponto: existe um botão chamado configurar abas visiveis ao clientes, onde o usuario
> define o quais abas o cliente vai ver. isso deve valer também na versao mobiile

No Portal do Corretor o botão é **"Configurar abas visíveis do corretor"** (ícone de engrenagem
ao lado da prévia). Grava em `broker_profiles.settings.brokerPortalTabs`; o portal lê isso do
corretor efetivo (`effectiveBroker.settings`) nos dois modos — pelo link vem de
`broker_portal_get_data`, na prévia vem do corretor impersonado. Vira a regra **D8** abaixo.

## Decisões (D2, D5, D6 e D8 confirmadas pelo usuário em 16/10/2026)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Casca nova ou remendar a atual com `md:`? | **Casca nova** `BrokerPortalMobile` + hook `useBrokerPortal`, como Treinamentos. Remendar não resolve: a casca de desktop tem `h-screen`, menu lateral e cabeçalho que não têm versão estreita. |
| D2 | Quais 4 abas na barra inferior? | As 4 primeiras **habilitadas** para o corretor nesta ordem de prioridade do celular: Empreendimentos · Estoque · Propostas · Comissões. O resto (Leads, Materiais, Chat, Agenda, Ranking, Treinamento, Analytics) vai para "Mais". A configuração de abas por corretor (`brokerPortalTabs`) continua mandando no que aparece. |
| D3 | Qual a aba de abertura no celular? | A primeira da barra (Empreendimentos). No desktop continua Analytics. KPIs de Analytics ficam na própria aba (2×2). |
| D4 | "Primeiros passos" no celular? | Uma linha com progresso ("◔ Primeiros passos · 0 de 3 ›") que abre a folha com a lista; some quando tudo estiver feito, igual ao cartão de hoje. |
| D5 | Menu de conta | Folha inferior com: Meus dados · Ajuda · Sair (este só no login por e-mail). Sem "Preferências" e "Notificações" (só dizem "em breve") e sem "Minha conta" (repete Meus dados). No desktop: **não mexer** nesta frente. |
| D6 | Aba Saúde (painel de gestão da org) | Fora da barra e do "Mais" no celular — é painel de gestão, não do corretor. No desktop não muda nesta frente. |
| D7 | Admin no app interno pelo celular | Fora do escopo: a casca de app vale para o **corretor** (link/login) e para a **prévia**. O admin no celular continua com a visão interna. |
| D8 | "Configurar abas visíveis" vale no celular? | **Sim.** A barra inferior e o "Mais" são montados SÓ com as abas habilitadas (`brokerPortalTabs`; lista vazia = todas, como no desktop), na ordem de prioridade do D2, menos Saúde (D6). Uma função pura só (`abasDoCelular` em `utils/brokerPortalTabs.ts`) decide barra × Mais, testada. Com 5 abas ou menos não há botão "Mais": todas cabem na barra (Ajuda fica no cabeçalho, onde já está). Aba ocultada com o portal aberto: sai para a primeira da barra, como no desktop. A prévia do admin mostra o que o corretor vê (só as habilitadas, sem as cinzas de "oculta") e reflete na hora a troca feita pela engrenagem. |

### Continuação (16/10/2026, "Sim" para seguir com o restante) — achado e decisões

O raio-x das abas no celular (`C:/tmp/pwtest/corretor-mobile-raiox.js`, todas as abas ligadas só na
resposta da RPC, sem gravar) mostrou que **Leads, Chat, Ranking, Agenda, Treinamento e o miolo do
Analytics são só demonstração**: geradores fixos no código (`generateDemoLeads`, `generateDemoMessages`,
`generateDemoRanking`, `generateDemoEvents`, `generateDemoModules`, `generateDemoAnalytics`), sem ler nem
gravar no banco. Corretores reais (Geleia, zoio) tinham Chat liberado e viam mensagens inventadas.
E **Materiais** é real, mas pelo link não mostra nada (o serviço exige login) e oferece "+ Novo Material"
ao corretor.

| # | Pergunta | Decisão do usuário |
|---|---|---|
| D9 | O que fazer com as abas de demonstração? | **Esconder do corretor** (celular e desktop) até terem dados reais, como a aba Integrações em 14/10. Código fica. Na engrenagem do gestor aparecem desligadas com o motivo. Analytics fica só com os 4 números reais do topo. |
| D10 | Materiais pelo link | **RPC de leitura pelo token** (migration nova, REGRA #7: REVOKE + GRANT só a anon) e o "+ Novo Material" some para o corretor. |

## Plano

### F1 — casca do celular e prévia fiel (resolve o print)

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/broker/useBrokerPortal.ts` (novo) | sai do `BrokerPortal` todo o estado e ação que não é desenho: carga de unidades/propostas/negócios (token × autenticado), `enabledPropertyIds`, `visibleUnits`, `stats`, abas visíveis, cesta (`cart`, `handleToggleCart`, aviso), simulador, reservar, enviar proposta, PDF, link público | typecheck 0 erros; desktop idêntico no navegador (mesmas abas, mesma cesta, mesmo simulador) |
| 1b | `utils/brokerPortalTabs.ts` + `__tests__/brokerPortalTabsMobile.test.ts` (novo) | `abasDoCelular(habilitadas)` → `{ barra, mais }` (D2 + D6 + D8) | teste: lista vazia = todas menos Saúde; 3 habilitadas → barra de 3 e Mais vazio; Empreendimentos oculto → Estoque sobe para 1º; ordem segue a prioridade do celular |
| 2 | `components/broker/BrokerPortalMobile.tsx` (novo) | casca de app: modo aparelho (`h-dvh`, safe-area) × prévia (`h-screen` + barra de status falsa); cabeçalho de 56 px (avatar com inicial, "Olá, {primeiro nome}" com maiúscula, título da aba abaixo, Ajuda); barra inferior 4 + Mais (D2); folha "Mais" com o restante + Ajuda; folha de conta (D5); linha "Primeiros passos" (D4); toast próprio `absolute`; mesmos `data-tour` (`menu`, `aba-*`, `ajuda`, `conta`, `checklist`) | Playwright 390×844: raiz ocupa 390×844, barra inferior dentro da tela (y ≥ 788), as 4 abas trocam com `aria-current`, "Mais" abre e navega, conta → Meus dados abre, Ajuda abre |
| 3 | `components/BrokerPortal.tsx` | vira o seletor: corretor (`portalToken`) com `innerWidth < 768` → `BrokerPortalMobile`; casca de desktop passa a usar o hook; a prévia do admin renderiza `BrokerPortalMobile previa` com o corretor impersonado (hoje renderiza a visão interna); `alert()` → toast | Playwright desktop 1440: botão de prévia abre a moldura e o iframe tem `data-modo=previa`, barra de status e barra inferior; título não fica sob o entalhe |

### F2 — abas comerciais (o trabalho do corretor na rua)

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 4 | `components/broker/BrokerDevelopments.tsx` | prop `compacto`. **Lista**: cartão por empreendimento (foto/ícone, nome, endereço em até 2 linhas, "N disponíveis de M", seta). **Tabela de preços**: cartão por unidade (unidade + status na 1ª linha; área privativa · dormitórios · vagas; preço em destaque; botão "Proposta" e caixa da cesta lado a lado); ordenação por `<select>`; filtros em linha rolável | jsdom com dados falsos: cartão mostra nome, endereço, contagem; cartão de unidade mostra status, área, preço e os dois controles; nenhuma `<table>` no modo compacto |
| 5 | `components/common/PropertyUnitMap.tsx` + aba Estoque | filtros (Vendas/Locação/Todos + empreendimento) viram uma linha: segmentado curto + `<select>` de empreendimento; espelho sem o `p-6` em volta (rola por inteiro, sem card dentro de card); toque na unidade abre folha com dados + "Proposta"/"Reservar"/"Adicionar à cesta" em vez de ação direta | Playwright 390: espelho rola na horizontal sem a página rolar junto; toque numa unidade disponível abre a folha com os 3 botões |
| 6 | `BrokerPortalMobile` — barra da cesta | a barra fica **acima** da barra inferior (bottom = 56 px + safe-area), uma linha: "N unid. · R$ total" + "Proposta"; os chips de unidade passam para a folha que abre ao tocar na barra | Playwright: com 2 unidades na cesta, a barra não cobre a navegação nem é coberta por ela; tocar abre a lista com remover |
| 7 | aba Propostas (no hook + casca) | cartão por proposta: unidade (+N) e status na 1ª linha, comprador na 2ª, valor em destaque, PDF e link lado a lado; status com a cor de hoje (§8) | jsdom: cartão com unidade, comprador, valor, status e 2 botões |
| 8 | `components/broker/BrokerProposalSimulator.tsx` | prop `compacto`: botão "Enviar proposta" e total fixos no rodapé da tela (acima da safe-area); seções em blocos recolhíveis (Comprador · Condições · Resumo); barra inferior some durante o simulador e a seta "voltar" do cabeçalho é a saída (como a aula no Treinamentos) | Playwright: com a página no topo, "Enviar proposta" está visível; enviar volta para Propostas com toast |

### F3 — demais abas

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 9 | `BrokerLeadManager.tsx` | `compacto`: tabela → cartões; funil `grid-cols-5` → lista de etapas com contagem (toque filtra) | jsdom: sem `<table>`; 5 etapas como linhas |
| 10 | `BrokerAnalytics.tsx` | `grid-cols-5` → `grid-cols-2 md:grid-cols-5`; KPIs 2×2 | Playwright 390: nenhum card com largura < 150 px |
| 11 | `BrokerMaterials.tsx` | `compacto`: abre na grade de cartões, não na tabela; `alert()` → toast | jsdom: modo compacto sem `<table>` |
| 12 | `BrokerChat.tsx` | altura pela casca (lista rola, campo de mensagem preso ao rodapé, acima do teclado) | Playwright: campo visível com a lista cheia |
| 13 | `BrokerCommissions`, `BrokerRanking`, `BrokerTraining`, `BrokerEvents` | conferir em 390 px e ajustar só o que quebrar | print de cada aba em 390 px anexado ao Estado, sem rolagem horizontal da página |

### F4 — prova

| # | O que | Como sei que terminou |
|---|---|---|
| 14 | `__tests__/components/BrokerPortalMobile.test.tsx` (novo) | cartões (empreendimento, unidade, proposta), barra inferior + "Mais", folha de conta, barra de status só na prévia — `npx vitest run` verde |
| 15 | `bash scripts/check-ui-standard.sh` em cada `.tsx` tocado | sem violação |
| 16 | Navegador de verdade (link do corretor real, não só a prévia): 390×844 e 1440 | Estado registra o roteiro e o resultado; sem erro de console nem 4xx/5xx; desktop sem regressão |

## Fora do escopo

- Redesenho da casca de **desktop** do corretor (só passa a usar o hook);
- dados novos, RPCs novas, mudança de permissão;
- "Preferências" e "Notificações" de verdade (hoje são "em breve").

## Estado

- [x] Decisões D2, D5, D6 confirmadas; D8 pedida pelo usuário (16/10/2026)
- [x] **Publicado (16/10/2026):** `main` em `2a67eae6`. PR de rascunho #18 antes do push (a máquina
  local não fecha o `tsc` hoje): CI `ci` verde em 12min53s no PR e verde de novo no commit da `main`;
  `conferir-producao.sh` provou de fora que o domínio serve `2a67eae` e que os bundles têm
  "Nenhuma seção liberada" e "só proposta individual" (textos que só existem na tela nova).
- [x] **F1 — 4 de 4** (16/10/2026, frente `portal-corretor-mobile`)
  - 1 `useBrokerPortal.ts`: todo o comportamento saiu do `BrokerPortal`; desktop só desenha.
  - 1b `abasDoCelular`/`abasHabilitadas` + teste (6 casos).
  - 2 `BrokerPortalMobile.tsx`: aparelho × prévia, cabeçalho "Olá, Nome", barra 5 ou 4+Mais, folha "Mais",
    folha de conta (Meus dados · Ajuda · Sair), "Primeiros passos" em uma linha
    (`PortalChecklist compacto`, via `PortalHelp checklistCompacto`), toast próprio.
  - 3 `BrokerPortal.tsx` vira seletor; prévia do gestor renderiza `BrokerPortalMobile previa`; `alert()` → toast.
- [x] **Continuação publicada (17/10/2026):** `main` em `d18a2437` (rebase sobre `32a3e968`, do
  Financeiro, sem arquivo em comum). PR de rascunho #20: CI verde em 18min31s; CI verde de novo no
  commit da `main`; `conferir-producao.sh` provou que o domínio serve `d18a243` e que os bundles têm
  "Demonstração, sem dados reais" e "não aceita proposta agora".
- [ ] Fora desta frente (registrado para decidir depois): `fn_broker_portal_get_units` e
  `fn_broker_portal_get_commissions` ainda têm EXECUTE para PUBLIC (REGRA #7 pede REVOKE); em
  Empreendimentos uma unidade com proposta APROVADA aparece "Disponível" (status do cadastro),
  enquanto o Estoque a pinta vendida (negócio ativo).
- [x] **Continuação (16–17/10/2026) — o que entrou:**
  - F2 item 5 concluído: `PropertyUnitMap compacto` — filtros de status em faixa rolável, "Agrupar"
    curto + torre em `<select>` (sem "Visão": densidade sempre compacta), coluna de pavimento estreita
    ("5º", "T" = térreo), molduras sem respiro; **tocar na unidade abre a folha** (dados + Fazer
    proposta / Adicionar / Reservar 48h; indisponível diz por quê) em vez de saltar para o simulador.
    Status da folha = o do quadrinho (`statusDaUnidade`, negócio ativo sobrepõe o cadastro).
    "Torre TORRE B" → "Torre B" (`rotuloTorre`, vale também no desktop).
  - Comissões `compacto`: resumo num cartão (Prevista/Liberada/Paga), filtros em faixa rolável, linha
    enxuta; lista vazia agora diz que está vazia (também no desktop).
  - **D9** abas de demonstração fora: `ABAS_DE_DEMONSTRACAO` em `utils/brokerPortalTabs.ts`;
    `abasHabilitadas` nunca as devolve (celular, desktop, ajuda e tour juntos); a engrenagem as mostra
    desligadas com "Demonstração, sem dados reais"; ligar/desligar outra aba preserva as gravadas.
    Analytics fica só com os 4 KPIs reais (o `BrokerAnalytics` saiu das duas cascas).
  - **D10** `fn_broker_portal_get_materials` — migration
    `aplicar_20271017000200_broker_portal_materiais_por_token.sql` **APLICADA no banco em 17/10/2026**
    (ACL sem PUBLIC: anon + authenticated; token do zoio → 3 materiais; token inválido → valid false).
    `BrokerMaterials` lê por ela com `portalToken`; sem "Novo Material"/editar/excluir no link nem no
    celular; no celular, uma linha tocável por material (o "abrir" do cartão era só no hover).
    Busca não quebra mais ao digitar (`project_name` não vem na consulta).
- [x] **F2 — 5 de 5**
- [x] **F3 — fechada pelas decisões D9/D10:** Leads, Chat, Ranking, Agenda, Treinamento saíram (eram
  demonstração); Analytics ficou só com o real; Materiais e Comissões ganharam modo celular.
- [ ] _(histórico)_ **F2 — 4 de 5**
  - [x] 4 Empreendimentos e tabela de preços em cartões (respeitam as colunas liberadas ao corretor).
  - [ ] 5 Estoque: **feito** o filtro compacto (segmentado + `<select>` de empreendimento); **falta** a folha
    ao tocar na unidade do espelho e tirar o `p-6` em volta do espelho.
  - [x] 6 Cesta acima da barra, numa linha, chips ao tocar.
  - [x] 7 Propostas em cartões.
  - [x] 8 Simulador `compacto`: cabeçalho curto, etapas numa linha, rodapé preso, sem "Cancelar" duplicado.
- [ ] **F3 — 0 de 5** (Leads, Analytics, Materiais, Chat, conferência das demais) — no celular essas abas
  ainda aparecem com o desenho de desktop dentro da casca nova.
- [ ] **F4 — 2 de 3 e meio**
  - [x] 14 `__tests__/components/BrokerPortalMobile.test.tsx` (7 casos) + caso compacto em `PortalChecklist.test.tsx`.
  - [x] 15 `check-ui-standard` sem violação em `BrokerPortal`, `BrokerPortalMobile`, `BrokerDevelopments`,
    `BrokerProposalSimulator`, `PortalChecklist`.
  - [~] 16 navegador: link REAL de dois corretores, 390×844 e 1440 — `C:/tmp/pwtest/corretor-mobile.js`,
    TUDO OK (detalhe abaixo). **Não** conferida no navegador a prévia do gestor (exige login de admin);
    o modo prévia está provado só no jsdom (`data-modo=previa` + barra de status).

### Provas (16/10/2026)

- Tipos: o `tsc` inteiro cai nesta máquina hoje (segfault do Node, ver memória); checagem pela API do
  TypeScript arquivo a arquivo nos 15 tocados → **0 erros**, já **sem `@ts-nocheck`** em
  `BrokerPortal.tsx`, `useBrokerPortal.ts` e `BrokerPortalMobile.tsx`.
- Suítes vizinhas (16 arquivos: corretor, ajuda/tour dos portais, guardas REGRA #5): **198 = 198 ok**, rc 0.
- Navegador (dev server da frente, porta 4191):
  - "Geleia" (5 abas liberadas = o caso do print): raiz 390×844, barra em y 789–844, barra =
    Empreend./Propostas/Comissões/Materiais/Chat sem "Mais", abre em Empreendimentos, nenhuma `<table>`,
    nenhuma rolagem horizontal (lista, detalhe e simulador), "Adicionar" desligado diz o motivo,
    simulador com "Próximo" visível sem rolar e etapas numa linha, voltar devolve à aba de origem
    sem deixar unidade presa na cesta, folha de conta só com Meus dados + Ajuda, Meus dados abre.
  - "zoio" (6 abas): barra = 4 + Mais, "Mais" = Materiais/Chat, cesta acima da barra, total
    R$ 648.893 (não R$ 0), simulador abre com o mesmo valor.
  - Desktop 1440: casca de sempre (menu lateral com as 6 abas), sem a casca de celular.
  - Sem erro de console nem 4xx/5xx nas três rodadas.

### Defeitos achados no caminho (todos corrigidos nesta frente)

| Defeito | Onde valia | Correção |
|---|---|---|
| Pelo link, a unidade não traz `current_price` (só `price`); cesta e simulador liam só ele → **proposta calculada sobre R$ 0**. Nenhuma proposta gravada ainda (`broker_portal_proposals` vazia em 16/10), então sem dado a corrigir. | link, celular e desktop | Empreendimentos manda a unidade com o preço da tabela vigente (venda); cesta e simulador caem para `price`. Teste no jsdom com a unidade como a RPC devolve. |
| "Adicionar"/caixinha da cesta ativo em unidade alugada/reservada: a cesta recusa e o aviso só aparece na barra da cesta, que vazia não existe → clique mudo. | celular (corrigido); desktop continua igual | Cartão desliga "Adicionar" e diz "Alugado: só proposta individual"; na casca do celular, recusa com cesta vazia vira toast. |
| "Fazer proposta" direto troca a cesta; ao desistir, a unidade ficava presa na barra da cesta. | celular e desktop | Voltar do simulador devolve a cesta de antes. |
| "R$ 0,00" exibido como preço de unidade sem valor. | celular | "Preço não informado"; cesta sem preço diz "Sem preço". |

Guardas que pegaram a extração (e por quê não é "fazer passar"): a exceção revisada da REGRA #5 para
`organizations[0]` no portal do corretor ("contexto é o do corretor, não o seletor do topo") mudou de
arquivo junto com o trecho (`BrokerPortal.tsx` → `broker/useBrokerPortal.ts`), sem mudar o código; e o
teste de âncoras dos "Primeiros passos" passou a ler também o hook, onde agora está
`avisarAcaoDoPortal('enviou-proposta')`.

Mudanças que também valem no DESKTOP (efeito colateral do hook, conferir na publicação): `alert()` →
aviso no canto; "Cancelar" do simulador volta à aba de origem (antes ia sempre para Estoque) e
devolve a cesta anterior; preço da tabela na cesta/simulador; queda para `price`.

## Verificação

1. Celular de verdade (ou Playwright 390×844 com `isMobile`) pelo link de um corretor com
   empreendimentos habilitados: abrir → Empreendimentos em cartões → entrar num empreendimento →
   pôr 2 unidades na cesta → Proposta → preencher → enviar → aparece em Propostas → baixar PDF.
2. Mesmo roteiro pela prévia do admin (Comercial › Corretores › Acessar portal › prévia).
3. Desktop 1440 pelo link e pelo app interno: menu lateral, abas e simulador como antes.
