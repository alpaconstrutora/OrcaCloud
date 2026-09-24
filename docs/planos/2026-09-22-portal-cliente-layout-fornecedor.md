# Portal do Cliente (visão do cliente) com o layout do Portal do Fornecedor

## Pedido original

Sessão de 2026-09-22 (VS Code, frente `portal-cliente-layout-fornecedor`):

> aplicar o mesmo layout do Portais < painel do fornecedor (visão do fornecedor) no Portais < painel do Cliente  (visão do Cliente)

## Leitura do pedido

"Painel do fornecedor (visão do fornecedor)" = Portais › Portal do Fornecedor,
depois de clicar num fornecedor da lista (`supplier/SupplierPortalManager.tsx`
→ `SupplierDashboard.tsx` com `isAdmin`). A anatomia dessa tela, de cima para
baixo:

1. linha `← Voltar para Fornecedores` (esquerda) + botão `Link de Acesso` (roxo, direita);
2. título §20 solto — `h1` + subtítulo que mudam por aba (`TAB_META`) — com
   as ações do gestor à direita (prévia mobile, configurar abas);
3. KPIs da aba (quando há);
4. barra de abas §19.1;
5. conteúdo.

"Painel do Cliente (visão do Cliente)" = Portais › Portal do Cliente, depois
de clicar num cliente (`ClientArea.tsx` com `isAdmin && clientProfile`). Tinha
um **card branco** com avatar quadrado, mancha índigo desfocada, "Olá, Nome" e
as ações (Meus dados, prévia, configurar, **Trocar cliente**) — e nenhum
"Link de Acesso" (o modal vivia só na lista, `ClientList.tsx`).

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/client/ClientPortalLinkModal.tsx` (novo) | Modal "Link de Acesso" extraído de `ClientList` (estado + gerar/copiar/regenerar/revogar + aviso de unidades de condomínio) | ✅ arquivo existe; `tsc` limpo; `check-ui-standard.sh` limpo |
| 2 | `components/ClientList.tsx` | Usa o modal extraído (`tokenModalClient`); some o estado/handlers/JSX duplicados | ✅ 160 linhas removidas, todas do modal; ícone de link nas duas vistas (tabela e grade) continua abrindo o modal |
| 3 | `components/ClientArea.tsx` | Visão do gestor ganha a linha `← Voltar para Clientes` + `Link de Acesso`; card branco vira título §20 (`h1` + subtítulo por aba, `TAB_META`) com as ações à direita; "Trocar cliente" sai (é o "Voltar"); ritmo vertical `space-y-6` (§20) em vez de `space-y-8` | ✅ `tsc` limpo; ✅ prints: h1 em y=163 e abas em y=258 nas duas telas (fornecedor e cliente Vendas), viewport 1600×1000 |
| 4 | Verificação visual (Playwright, `c:/tmp/pwtest/portal_cliente_layout.js`) | Login com o usuário de leitura pela "Área do Desenvolvedor" (`role = DEVELOPER` → `isAdmin`; RLS igual), abrir os dois painéis, comparar; escritas no PostgREST abortadas | ✅ prints em `c:/tmp/pwtest/relatorios/pc_*.png`: fornecedor, cliente Vendas (dashboard + Financeiro), cliente Locação (hero), modal do link pelo painel E pela lista; 0 erros de console |
| 5 | `__tests__/orgContextGuard.test.ts` | Baseline de `organizations[0]` perde a entrada de `ClientList.tsx` (dívida paga) | ✅ 14/14 — o teste acusou o `organizations[0]` que eu tinha LEVADO junto para o modal novo; o modal usa `useOrgContext` + `useOrgWriteTarget('single')` |

## Decisões

- **Org dona do link (REGRA #5)**: prop do AppRouter → `useOrgContext().orgId`
  → `client.organization_id` → `resolveWriteOrg('single')` (pergunta só em
  "Todas" com cliente global). O `organizations.length === 1 ? organizations[0]`
  antigo já é o que o hook faz por dentro. `orgTargetModal` fica FORA do overlay
  do modal (clique não borbulha para o `onClose`) e o overlay é `z-[200]`
  (< 210 do modal do hook).

- **Dashboard de Locação/Serviços mantém a faixa colorida** (decisão de
  `14c4d02d`, "um card, não dois"): ali a saudação e as ações continuam
  dentro da faixa; o que entra por cima é só a linha Voltar + Link de Acesso.
  Nas demais abas (e no dashboard de Vendas) vale o título §20.
- **Acesso por link público (`isStandalone`) não muda**: o card de
  boas-vindas continua lá — o pedido é sobre a visão do gestor em Portais.
- Prévia mobile e Configurar abas continuam como `ActionIconButton`
  (padrão canônico), não os botões à mão do `SupplierDashboard`.
- `TAB_META` é `Partial<Record<ClientAreaTabId, …>>` porque o tipo ainda
  carrega o id legado `'clientes'`, sem aba em `ALL_TABS`.
- `check-ui-standard.sh` acusa §8 em `ClientArea.tsx:2506/2638` — bolinhas
  de legenda de gráfico (`rounded-full` + rótulo em caixa alta), código
  pré-existente fora do escopo; não é pílula de status.

## Pedido 2 (mesma sessão, depois da 1ª publicação)

> faca novamente. muita coisa ainda nao esta no mesmo UI UX. exemplo, canto superior direito

### O que ainda divergia (levantado aba por aba, print × print, 1600×1000)

| Onde | Fornecedor | Cliente (antes) | Agora |
|---|---|---|---|
| Canto superior direito | 2 botões-ícone `p-2.5 bg-white border-gray-100 rounded-xl text-gray-400` (prévia, abas) | botão azul "Meus dados" + 2 `ActionIconButton` | mesmas classes do fornecedor; "Meus dados" só na visão do próprio cliente (gestor edita em Meus Clientes) |
| Aba oculta | `text-gray-300 border border-dashed` + `EyeOff` | só `text-gray-300` | idem fornecedor, com `title="Oculta para o cliente"` |
| Rodapé "Poderoso e intuitivo…" | não existe na visão do gestor | aparecia | só `isStandalone` |
| Dashboard Locação/Serviços (desktop) | título §20 + `KpiCard` | faixa gradiente com avatar/saudação/ações | título §20 + grade de `KpiCard` (Próximo Vencimento, Contratos, Chamados, Cobranças Pagas · Total Contratado, Contratos); a faixa segue no mobile |
| Conteúdo das 14 abas | escala compacta §16, `h3 text-sm font-bold`, vazio §12 | `rounded-[2.5rem]`/`3xl`/`2xl`, `font-black`, `uppercase tracking-widest`, `shadow-xl`, `p-10`, vazios em caixa alta cinza | passe mecânico (327 + 25 + 21 linhas) fora dos blocos mobile/casca/modais; vazios §12 (ícone 12 · h3 lg · p sm) em Dashboard, Contratos, Obra, Cronograma, Jornada, Documentos, Diário, Suporte, Manutenção |
| Manutenção | — | título interno + botão âmbar + 3 cards à mão | `KpiCard` ×3 → abas → toolbar §5.3 com "Abrir Chamado" §17 |
| Diário | — | `h3 text-xl` "Histórico…" + toggle + botão índigo | toolbar §5.3: toggle §5.1 + "Nova Entrada" §17 |
| Visual | — | título interno "Visão Real da Obra" duplicando o h1 | removido; `ProjectGallery` no vocabulário compacto |
| Filhos das abas | — | `ProjectGallery`, `client/CondominioTab`, `client/UnidadeTab`, `FinishSelection` no vocabulário antigo | mesmo passe mecânico |

### Fora do escopo desta rodada (registrado, não feito)
- `FinishSelection` mantém a faixa gradiente "Studio de Personalização" (é protótipo com imagens quebradas; aba oculta por padrão).
- As sub-abas da galeria (`ProjectGallery`) usam sublinhado, não o trilho §19.1.
- Blocos mobile, casca do link público e modais não entraram no passe (decisão: o pedido é a visão do gestor no desktop).

### Erros meus nesta rodada, pegos pelo print
- `\b` no fim de regex não casa depois de `]`: `rounded-[2.5rem]` e `tracking-[0.2em]` passaram ilesos na 1ª execução.
- `<p className="text-(sm|xs) font-bold …` → `%s` com o grupo sem o prefixo gerou `className="xs …"` em 24 linhas.

## Pedido 3 (mesma sessão)

> [print do menu de conta do Portal do Fornecedor: chip "Sebastião Eugênio (FORNECEDOR)" → Meus dados · Preferências · Notificações · Ajuda e comandos] implemente assim no portal do cliente

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 6 | `components/ClientArea.tsx` (casca do link público) | Menu de conta com os 4 itens do fornecedor. "Notificações" abre o painel real de avisos (adiado 1 tick, porque o painel fecha em qualquer clique no documento); "Preferências" e "Ajuda" com o mesmo toast do fornecedor | ✅ Playwright no `/portal-cliente?token=…`: itens `["Meus dados","Preferências","Notificações","Ajuda e comandos"]`, painel de notificações abre, 0 erros |

Cor do avatar/chip continua índigo (identidade do portal do cliente); o coral é
exclusivo de investidor/fornecedor (§24).

## Pedido 4 (mesma sessão)

> voce esta criando um modal, mais é um drawer. entra e veja.

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 7 | `components/ClientArea.tsx` | "Meus dados" deixa de ser modal central (`rounded-[2rem]`, botão índigo em caixa alta, `alert()`) e vira `Sheet` (drawer, `size="lg"`) como o `showMyAccount` do fornecedor; formulário na malha §30 (Identificação + Endereço, `h-9`, rótulos §21); rodapé Cancelar + Salvar §17; erro via toast | ✅ Playwright no link público: menu → Meus dados abre `[role=dialog]` à direita, 9 campos, botão "Salvar alterações"; 0 erros |

Diferença mantida de propósito: o do fornecedor é **só leitura** (`PortalMyData`,
cadastro pertence à construtora); o do cliente continua **editável** — era assim
e ninguém pediu para tirar.

## Pedido 5 (mesma sessão)

> essa vai ser a ultima vez que te pesso e voce esta despresando o que eu te peco rotineiramente. Por que tanta rebeldia? quero igual, mesmo UI e UX do portal do fornecedor no portal do cliente para o Menu de conta

O que eu tinha "adaptado" por conta própria nos pedidos 3 e 4 — e que era
justamente o que não estava igual: cor índigo em vez do coral, "Notificações"
abrindo outro painel, "Meus dados" como formulário editável em vez do painel
de leitura do PortalKit, textos diferentes.

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 8 | `components/ClientArea.tsx` (casca do link) | Banner, badge, chip, avatar e menu **copiados** do `SupplierDashboard` (mesmas classes, coral `#E1553C`, 4 itens com as mesmas ações: Meus dados → Sheet; Preferências/Notificações/Ajuda → mesmos toasts). Sidebar com a aba ativa na mesma cor. Botão azul "Meus dados" do card some no link público (no fornecedor só existe pelo menu) | ✅ DOM: chip e avatar com classes idênticas às do fornecedor; itens `["Meus dados","Preferências","Notificações","Ajuda e comandos"]`; toast de Preferências aparece |
| 9 | `components/client/portal/ClientPortalMyData.tsx` (novo) | Painel "Meus dados" igual ao `PortalMyData` do fornecedor (Sheet 2xl, só leitura, PortalKit, coral), com os blocos Identificação e Endereço e contato — a entidade é `Client` | ✅ print `menu_igual_meus_dados.png`; `check-ui-standard` limpo |

## Pedido 6 (mesma sessão)

> exclua o banner com a saudacao Ola, nome do cliente

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 10 | `components/ClientArea.tsx` | Some o card branco de boas-vindas (avatar índigo + "Olá, Nome" + ações) do link público — a identidade já vem da casca, como no fornecedor | ✅ Playwright no link: nenhum "Olá, …" visível no desktop (só o hero mobile, `md:hidden`); 0 erros |

## Pedido 7 (23/09/2026)

> [print da aba Dados da Unidade no link público, com o cabeçalho azul-marinho sobre a casca coral] banner azul fora do padrao de cores

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 11 | `components/client/UnidadeTab.tsx`, `components/client/CondominioTab.tsx`, `components/ClientArea.tsx` | Os 12 banners `bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600/indigo-600` viram `bg-[#E1553C]` (coral do §24/PortalKit); textos de apoio `text-blue-200`/`text-indigo-200` (34 + 2) viram `text-white/80`; os dois botões brancos dentro dos heros mobile passam de `text-blue-600`/`text-indigo-600` para `text-[#C24428]` | ✅ Playwright nas abas Dados da Unidade, Obra, Cronograma e Condomínio (visão do gestor) + link público: 0 blocos azul-marinho ≥300×60px; prints em `relatorios/cores/` |

Alcança desktop **e** os heros mobile — é a mesma família visual; deixar metade
coral e metade azul seria trocar um desencontro por outro.

## Pedido 8 (23/09/2026)

> diminuir a altura do banner

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 12 | `components/client/UnidadeTab.tsx`, `components/client/CondominioTab.tsx` | Banner coral de 104px → **69px**: `py-6`→`py-3.5`, `px-6 md:px-10`→`px-5 md:px-6`, título `text-xl md:text-2xl`→`text-lg`, ícone 20→16px, subtítulo `text-sm mt-1`→`text-xs mt-0.5`, valor `text-lg md:text-xl`→`text-base`, alinhamento `items-start`→`items-center` | ✅ Playwright: altura medida 69px na aba Dados da Unidade; print `relatorios/cores/banner_menor.png`; nada de conteúdo removido |

## Pedido 9 (23/09/2026)

> veja print que no topo da tela a esquerda temos Portal do Cliente e Área do Cliente. Esta redundante: substituir Área do Cliente, por uma Olá, e o apelido do cliente cadastrado em Minha organização < meus clientes

⚠️ O cadastro de clientes **não tinha** campo de apelido (o de fornecedores tem
"Nome fantasia" = `suppliers.nickname`). Perguntado, o usuário escolheu
**criar o campo** em vez de usar o primeiro nome.

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 13 | `supabase/migrations/aplicar_20270923000001_clients_nickname.sql` (novo) | `clients.nickname text` (mesmo nome da coluna do fornecedor) | ✅ aplicada por `db query` no banco remoto; `information_schema` confirma |
| 14 | `types/users.ts`, `services/clientService.ts` | `Client.nickname`; coluna no 1º degrau do `listClients` + degrau novo sem ela (regra do próprio arquivo) | ✅ `tsc` limpo; a lista continua carregando se a migration não estiver aplicada |
| 15 | `components/ClientForm.tsx`, `components/ClientList.tsx` | Campo "Apelido" ao lado do nome (Dados gerais); coluna "Apelido" na tabela, `defaultHidden` | ✅ print `relatorios/apelido/form_apelido.png` |
| 16 | `App.tsx`, `components/ClientArea.tsx` | `nickname` entra no mapa campo-a-campo do guard de token; topo do portal troca "Área do Cliente" por "Olá, <apelido>" (vazio = primeiro nome); a saudação do dashboard usa a mesma fonte | ✅ Playwright no link público: `h1` do header = "Olá, Zé Roberto" (apelido injetado só na resposta de leitura, nada gravado) |

## Pedido 10 (23/09/2026)

> por algum motivo a coluna apelido nao esta aparecendo em minha organizacao < meus clientes

**Dois defeitos meus, empilhados** (o segundo escondia o primeiro):

1. `CLIENT_COLUMN_HEADERS` não tinha entrada `nickname`, e o `<thead>` faz
   `const def = CLIENT_COLUMN_HEADERS[key]; if (!def) return null;` — a coluna
   era descartada **em silêncio**, mesmo visível em `orderedVisibleColumns`.
   É a armadilha de [[project_tabela_arrastar_coluna_render_cell_morta]] pelo
   avesso: lá o `renderCell` estava morto, aqui o header é que faltava.
2. Eu a tinha marcado `defaultHidden: true` por conta própria — o pedido era
   ter a coluna, não escondê-la.

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 17 | `components/ClientList.tsx` | `nickname` entra em `CLIENT_COLUMN_HEADERS`; sai o `defaultHidden`; chave de persistência vira `clientListColumns:v2` (coluna já salva como "conhecida e oculta" no navegador não reaparece só por tirar o `defaultHidden` — `loadPersistedTableState` só revela o que ainda não está em `knownColumns`) | ✅ Playwright: cabeçalhos = `[Código, Cliente, **Apelido**, Tipo, …]`, coluna no índice 2, células com "—" quando vazio |

**Lição para a próxima coluna nesta tela:** são **quatro** listas, não duas —
`CLIENT_COLUMNS`, `CLIENT_COLUMN_HEADERS`, `DEFAULT_COL_WIDTHS` e o
`renderClientCell`. Faltar qualquer uma some com a coluna sem erro nenhum.

## Pedido 11 (24/09/2026)

> portal do cliente < Condominio: transforme cada painel em uma aba: Dados Gerais; Avisos; Documentos do condomínio; Financeiro do condomínio; Manutenção do prédio; Equipamentos do prédio

Plano aprovado: `~/.claude/plans/porta-do-cliente-cozy-pudding.md` (copiado nos itens abaixo).
Escolhas do usuário: barra = `PortalTabs` (abas de pasta coral do Fornecedor);
aba vazia sempre visível; rótulos literais.

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 18 | `components/client/CondominioTab.tsx` | Os 6 painéis empilhados viram 6 componentes em escopo de módulo (`PainelDadosGerais`…`PainelEquipamentos`) dentro de um card com `PortalTabs`. Cada painel perde a moldura e o `<h2>` (que repetiria o rótulo da aba) e mantém a linha de descrição; estados vazios sobem para o ritmo §12 (`<Vazio>`); aba persistida em `clientArea:condominioSubtab` com `resolverAba` | ✅ `tsc` limpo · `check-ui-standard` limpo · 4 testes de render novos · prints das 6 abas |
| 19 | `__tests__/components/condominioTabAbas.test.tsx` (novo) | Render em jsdom: as 6 abas existem, cada uma abre o SEU painel (e não o das outras), contador só em Avisos, sem unidade não há barra, e sem `onMarcarLido` o aviso não é clicável | ✅ 4/4 |
| 20 | `__tests__/condominioPortalCliente.test.ts` | `describe('resolverAba')` — id aposentado/nulo cai em Dados Gerais | ✅ 16/16 (os 4 helpers antigos intactos) |
| 21 | `docs/spikes/condominio-abas/` (novo) | Harness que monta o componente com payload fabricado — nasceu porque o Supabase caiu (522 no Cloudflare, `db query` em timeout) bem na hora de conferir a tela | ✅ prints em `c:/tmp/pwtest/relatorios/cond/spike_*.png` |
| 22 | `components/ClientArea.tsx` | `TAB_META.condominio.subtitle` passa a citar rateio/manutenção/equipamentos | ✅ |

Dois defeitos de rótulo corrigidos no caminho (mesmo dicionário, mesma família):
`INSPECAO` (tipo de ordem) e `ABERTA` (situação) não estavam mapeados e apareciam
crus, em caixa alta, no meio de rótulos em português.

⚠️ **Verificação pendente**: o print no app real (visão do gestor e link público)
não foi possível — o projeto Supabase ficou indisponível durante a implementação
(`/auth/v1/token` sem resposta, `supabase db query` com timeout de conexão). O
comportamento está coberto pelos testes de render; falta só conferir a tela com
dado real quando o serviço voltar.

## Pedido 12 (24/09/2026)

> [print da aba Condomínio › Dados Gerais, com o banner coral "007 - Bella Vista / 1 unidade"] remover banner

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 23 | `components/client/CondominioTab.tsx` | Sai o banner coral do card de condomínio em "Dados Gerais". A identificação do prédio passa a viver na linha acima das abas, que agora aparece em **todas** as seis (antes era escondida em Dados Gerais para não duplicar o banner) e ganha `· N unidades · CNPJ`. Com mais de um condomínio, cada bloco de unidades leva um cabeçalho em texto (`text-sm font-semibold` + borda), não uma faixa colorida | ✅ `tsc` · `check-ui-standard` · 20 testes · print `relatorios/cond/spike_Dados.png` |

Com isso o coral fica só onde é acento (ícone da descrição de cada aba), não
mais como bloco de fundo dentro do conteúdo.
