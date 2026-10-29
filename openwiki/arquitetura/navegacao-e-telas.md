---
type: arquitetura
title: Navegação, roteamento por abas e casca da aplicação
description: Como a aplicação decide o que renderizar — rotas por pathname para portais e páginas públicas no App.tsx, "view" por hash (#/view) no store, o switch do AppRouter com componentes lazy, a trava de rota por permissão, o Layout com menu e seletor de contexto, e a recuperação de chunk ausente após deploy.
tags: [routing, navigation, app-shell, lazy-loading, permissions, layout]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-f35da1e74133517d40998acd
    resource: repo://App.tsx
  - id: openwiki-source-00dc81e442e44f56cd135352
    resource: repo://components/AppRouter.tsx
  - id: openwiki-source-3bf128cf3b6045e7937f4aff
    resource: repo://components/ContextSelector.tsx
  - id: openwiki-source-c644b7befa18b0940f7b0bfa
    resource: repo://components/ErrorBoundary.tsx
  - id: openwiki-source-fcd661be546a7f90966534cd
    resource: repo://components/Layout.tsx
  - id: openwiki-source-8bd2e4ba8c3cad445a639461
    resource: repo://hooks/useTabRouter.ts
  - id: openwiki-source-33470089c88a88d57c27c5ee
    resource: repo://index.tsx
  - id: openwiki-source-19f2c352086ce17d996488f0
    resource: repo://lib/tabRouter.ts
  - id: openwiki-source-9ef6bdd8e63ec2932f4ff0d6
    resource: repo://utils/chunkLoadError.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Navegação, roteamento por abas e casca da aplicação

Não há biblioteca de roteamento (React Router etc.). A navegação tem **dois
níveis**, decididos em lugares diferentes:

1. **Pathname** (`/portal-cliente`, `/pedido/<uuid>`, `/publico/validar-…`) —
   decidido no `App.tsx`, **antes** do `<Layout>`. Serve portais externos e
   páginas públicas, que têm casca própria.
2. **View por hash** (`#/contas-a-pagar`, `#/blueprint?studyId=…`) — a "rota"
   interna do app autenticado. Vive em `useStore().activeView` e é resolvida por
   um `switch` gigante em `components/AppRouter.tsx`, renderizado dentro do
   `<Layout>`.

```
index.tsx
  └ QueryClientProvider → ConfirmProvider → ToastProvider → <App/>
App.tsx
  ├ pathname de portal/página pública? → casca própria (sem Layout)
  ├ sem sessão → <Auth/> / PortalLogin
  ├ overlay "Sincronizando…" (sessão, perfil, projetos carregando)
  └ <Layout> (sidebar, topo, ContextSelector)
       └ <ErrorBoundary> → <AppRouter> → switch (activeView) → módulo lazy
```

## Inicialização (`index.tsx`)

Monta os provedores globais — `QueryClientProvider` (cache de servidor),
`ConfirmProvider` (`useConfirm()`, substituto do `confirm()` nativo) e
`ToastProvider` — em volta do `<App/>`. Também:

- escuta `vite:preloadError` (chunk de deploy anterior sumiu do servidor) e
  recarrega a página uma vez;
- registra o service worker da PWA e força **uma** recarga quando um SW novo
  assume, com trava anti-loop em `sessionStorage` (no máximo uma recarga
  automática a cada 5 min). Sem a trava, CDN servindo versões diferentes fazia a
  aba recarregar em ciclo.

## Nível 1 — pathname no `App.tsx`

Os tokens de portal e os IDs de páginas públicas são derivados de
`window.location` em `useMemo` com dependências vazias:

| Pathname | Destino |
|---|---|
| `/portal`, `/portal-cliente`, `/portal-corretor`, `/portal-investidor`, `/portal-parceiro`, `/portal-fornecedor`, `/portal-sindico` (com `?token=`) | casca do portal correspondente, autenticada pelo token |
| as mesmas rotas **sem** token | `PortalLogin` — login por e-mail e senha próprio do portal (mapa em `lib/entradasDoPortal.ts`) |
| `/pedido/<uuid>`, `/proposta/<uuid>`, `/especificacoes-cliente/<uuid>` | visualizações públicas compartilhadas |
| `/m/<slug>` | marketplace público |
| `/publico/validar-planta|certificado|documento/<uuid>` | validação pública (destino de QR code) |

⚠️ **Todos os hooks do `App.tsx` precisam rodar antes do primeiro `return` de
guarda.** Quando cada token tinha seu `useMemo` seguido de `return`, a contagem
de hooks mudava entre renders (sessão carregando → sem sessão) e o React caía no
erro #300 — tela branca logo após deslogar ou limpar o storage. O comentário no
topo desse bloco registra isso; respeite a ordem ao adicionar rota.

O overlay de carregamento tem **escape**: se ficar ativo mais de 15 s
(`OVERLAY_STUCK_MS`), vira uma tela de "falha de conexão" com "Tentar
novamente", em vez de "Sincronizando…" eterno. Combina com o corte de tempo do
cliente Supabase (ver [Estado global e acesso a dados](./estado-e-dados.md)).

Detalhes de cada portal: [Portais externos](../modulos/portais/portais-externos.md).

## Nível 2 — view por hash

`lib/tabRouter.ts`:

- `getInitialView()` lê o hash `#/<view>`; sem hash, usa `orca_activeView` do
  `localStorage`; sem nada, `'central'`.
- `syncViewToUrl(view)` reescreve o hash com `history.replaceState` **só quando
  a view muda**. Antes comparava o hash inteiro e apagava a query string de
  links diretos (`#/blueprint?studyId=…`) antes de a tela lazy montar e lê-la.
- Cada aba do navegador tem seu próprio hash, então várias abas podem mostrar
  views diferentes ao mesmo tempo.

`hooks/useTabRouter.ts` liga o resto:

- escuta `hashchange` (voltar/avançar, URL digitada) e chama `setActiveView`;
  se houver edição pendente (`lib/guardaDeSaida.ts`), pergunta antes e, se o
  usuário ficar, restaura o hash da tela atual;
- usa o `BroadcastChannel('orca_auth_sync')`: logout numa aba desloga todas.

Para navegar já focando um item (deep-link), use
`useStore().navigateToFocus(view, ref, source)`; o módulo de destino lê
`viewFocus`, foca o item e limpa.

## `AppRouter`: o switch de telas

`components/AppRouter.tsx` (~1.660 linhas) recebe do `App.tsx` o estado e os
handlers e devolve a tela da view ativa.

- **Todo módulo é `React.lazy`** e cada `case` envolve o componente em
  `<React.Suspense fallback={<Spinner/>}>` — um chunk por módulo.
- O `default` mostra `ProjectOverview` se o projeto carregado é uma obra, senão
  o `Dashboard`.
- **Duas listas de projetos**: `typedProjects` (só obras) vai para quase tudo;
  `typedAllProjects` (os quatro tipos) só para as telas que são explicitamente
  sobre orçamento/planejamento/diário. Tela nova que precisa dos outros tipos
  recebe `typedAllProjects` explicitamente. Ver
  [Projetos e classificação](../conceitos/classificacao-de-projetos.md).
- **Ramos por perfil antes do switch**: grupos `CLIENT`, `INVESTOR`, `SUPPLIER`,
  `BROKER` e `PARTNER` renderizam o portal correspondente direto. Os ramos de
  cliente, fornecedor, corretor e parceiro estão **inalcançáveis** pelo login
  por e-mail desde outubro/2026 (o `App.tsx` já renderiza a casca do portal antes
  do `Layout`) e aguardam limpeza.

### Views renomeadas continuam funcionando

Endereços antigos chegam por URL salva, `orca_activeView` e pela busca do menu.
Em vez de cair numa tela vazia, o `AppRouter` redireciona: `regulatory-maps` →
aba da Planta Inteligente, `area-engine` → `blueprint`, `labor-trainings` →
`treinamentos`, `labor-dashboard` → `labor-rh-dashboard`. Ao remover ou
renomear uma view, acrescente o redirecionamento.

### Trava de rota por permissão

`isModuleAllowed(userPermKey, matrixKey, padrao?)` decide se a view pode abrir:

1. libera tudo para o grupo `DESENVOLVEDOR`, para e-mail com acesso total
   (`lib/acessoTotal.ts`), e quando o topo está em "Todas" (sem organização);
2. libera se o membro ainda não carregou ou é `admin` da organização;
3. senão, a permissão **do membro** (`permissions[userPermKey]`) vence; depois a
   matriz da organização por papel (`settings.module_visibility`, com suporte a
   matriz por produto `platform`/`pro`/`offices`);
4. nada gravado → libera (ou herda de outro módulo, ex.: Treinamentos herda do RH).

Um efeito mapeia prefixos/IDs de view para pares de chave (`labor-*` →
`canViewLabor`/`rh`, `supplies-*` → `canViewOrders`/`compras`, vendas/
locações/condomínios → `crm`/`rentals`, etc.) e, se bloqueado, manda para
`dashboard`. O ÒPURA Market tem trava pelo **perfil**, não pela organização
(`podeAcessarMarket`). O `Layout` usa a mesma lógica (`checkModule`) para
esconder itens do menu. Ver [Autenticação, perfis e permissões](../conceitos/autenticacao-e-perfis.md).

Muitos módulos são declarados nas permissões detalhadas mas só cerca de uma
dezena de chaves é de fato aplicada aqui — não crie chave nova que ninguém lê.

## `Layout`: sidebar, topo e busca

`components/Layout.tsx` monta:

- **sidebar** com grupos (Geral, Engenharia, Suprimentos, Financeiro, …),
  filtrada pelas mesmas permissões, com posição de rolagem preservada em
  `sessionStorage`;
- **temas** do sidebar: claro, escuro (sidebar escuro, janelas claras),
  `midnight` ("Escuro Total") e automático;
- **busca de comandos** (`commandItems`) — lista plana de views com atalhos;
- **`ContextSelector`** no topo.

### `ContextSelector`

Accordion multinível: **Organização** (selecionável) → **Empreendimento** (só
agrupa) → **Obra** (selecionável), mais "Sem empreendimento" e **Empresas** da
organização. Não existe "empreendimento ativo": só organização, empresa e obra
são contexto real no store. O rótulo do botão mostra o nível mais específico
escolhido. A árvore vem de `hooks/useContextTree.ts`. A semântica do contexto
(o que "Todas" significa, herança de organização) está em
[Multi-tenancy e o seletor de organização](../conceitos/multi-tenancy-organizacao.md).

## Chunk ausente depois de um deploy

Uma aba aberta durante uma publicação pede chunks que não existem mais.
`utils/chunkLoadError.ts`:

- `isChunkLoadError` reconhece as mensagens de import dinâmico falho;
- `reloadOnceForChunkError` recarrega no máximo **uma vez a cada 2 min**
  (marca de tempo em `sessionStorage`). Se falhar de novo dentro da janela, o
  problema não é deploy novo e o erro é mostrado. Era "uma vez por sessão", e a
  segunda publicação do dia deixava a aba presa no erro.

É usado pelo `ErrorBoundary` (que envolve o `AppRouter`) e pelo listener de
`vite:preloadError` no `index.tsx`.

## Adicionando uma tela

1. Componente em `components/` (ou subpasta do módulo).
2. `React.lazy` + um `case '<view-id>'` com `Suspense` no `AppRouter`.
3. Item no menu do `Layout` (e, se aplicável, na busca de comandos).
4. Se o módulo tem permissão própria, mapeie a view no efeito de trava de rota.
5. Siga a regra de interação: painel lateral (`Sheet`) é o padrão; ver
   [Padrões de interface](../interface/padroes-de-ui.md).
