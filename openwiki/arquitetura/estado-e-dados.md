---
type: arquitetura
title: Estado global e acesso a dados
description: Como o front-end guarda sessão, contexto e dados do servidor — Zustand para sessão/contexto/UI, TanStack Query para cache de servidor, services como única camada que fala com o Supabase, e o cliente Supabase com corte de tempo por tipo de chamada.
tags: [state, zustand, react-query, supabase-client, persistence, data-access]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-e4c731bf27a84c2d2f14ad66
    resource: repo://hooks/useAuthSync.ts
  - id: openwiki-source-c9d6eb1d418dd384fe574e87
    resource: repo://hooks/useLaborMutations.ts
  - id: openwiki-source-7456eb0dbece7f9df4400059
    resource: repo://hooks/useLaborQueries.ts
  - id: openwiki-source-138d344eed5eb6662a30193f
    resource: repo://hooks/usePersistenceSync.ts
  - id: openwiki-source-399b5557fded26745365511c
    resource: repo://lib/queryClient.ts
  - id: openwiki-source-07a6a9b54c1891448fdaa178
    resource: repo://lib/queryKeys.ts
  - id: openwiki-source-af66b266e558bf4271ff4b84
    resource: repo://lib/supabase.ts
  - id: openwiki-source-054ae3b7a82fac96a590723c
    resource: repo://lib/supabasePaginate.ts
  - id: openwiki-source-fc4fa093d97ac49c2c84466d
    resource: repo://lib/tempoLimiteRequisicao.ts
  - id: openwiki-source-7b516a038688e734f4e69bf4
    resource: repo://store/useStore.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Estado global e acesso a dados

O front-end tem **três camadas de estado** que convivem, cada uma com um papel
que não se sobrepõe:

| Camada | Arquivo | Guarda |
|---|---|---|
| Zustand | `store/useStore.ts` | sessão, perfil, organização/empresa/obra ativas, view ativa, listas de contexto (projetos, organizações, clientes) |
| TanStack Query | `lib/queryClient.ts`, `lib/queryKeys.ts`, hooks `use*Queries` | dados de servidor de módulos que migraram para cache (RH, estrutural…) |
| Estado local + `localStorage` | componentes, `hooks/usePersistenceSync.ts` | seleção transitória (cotação/contrato/pedido aberto), orçamento em edição, preferências de UI |

Abaixo de tudo isso, **os services (`services/*.ts`) são a única camada que
chama o cliente Supabase**. Componentes não montam consulta PostgREST
diretamente — chamam um service, ou um hook que chama o service.

```
Componente
  ├─ useStore()            sessão / contexto / UI
  ├─ useXxxQuery()         cache de servidor (React Query)
  └─ service.metodo()      regra de negócio + consulta
        └─ supabase (lib/supabase.ts) → PostgREST / RPC / Storage / Edge Function
              └─ Postgres + RLS
```

## Cliente Supabase com corte de tempo

`lib/supabase.ts` cria **um único cliente** com a URL e a chave anon vindas de
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (e lança erro na carga do módulo
se faltarem). O `fetch` global do cliente é substituído por um wrapper com
`AbortController`, porque sem ele um backend travado deixava a UI presa em
"Sincronizando…" indefinidamente — o corte transforma o travamento em erro
tratável.

O tempo-limite depende do tipo de chamada (`lib/tempoLimiteRequisicao.ts`):

- **20 s** para banco/PostgREST, RPC, auth e storage;
- **150 s** para qualquer caminho `/functions/v1/` (Edge Functions), alinhado ao
  corte do próprio gateway. Antes, com 20 s para tudo, funções que trabalhavam
  mais que isso (IA, importação, captura de boletos) terminavam certas no
  servidor e o navegador mostrava *"Failed to send a request to the Edge
  Function"*.

O wrapper respeita um `AbortSignal` externo (cancelamento do próprio
supabase-js), combinando-o com o timeout. Quem precisa de corte **próprio**,
fora do cliente global (ex.: motor de conciliação, import do ÒPURA Market), usa
`SUPABASE_URL`/`SUPABASE_ANON_KEY` exportados pelo mesmo módulo.

Antes do `createClient`, o módulo importa `lib/linkDeAcesso.ts`: ele precisa ler
o `#type=invite|recovery` da URL antes que o supabase-js o apague na
inicialização.

### Paginação: o teto silencioso de 1000 linhas

O PostgREST devolve no máximo 1000 linhas por requisição. Um `.limit(5000)` não
erra — só devolve as 1000 primeiras. `lib/supabasePaginate.ts` resolve isso:

- `fetchAllPages(buildQuery)` aplica `.range()` página a página até vir uma
  página incompleta;
- a consulta precisa de **ordenação determinística** (ex.:
  `.order('transaction_date').order('id')`), senão linhas repetem ou somem
  entre páginas;
- uma variante busca a contagem em paralelo e dispara as páginas restantes ao
  mesmo tempo (duas rodadas em vez de N).

O caso que motivou a extração: o motor de conciliação pontuava ~17% do extrato
de uma conta com 5.797 pendentes enquanto pedia `.limit(5000)`.

## Zustand: `useStore`

Um único store (`create<AuthState & UIState & ProjectState>`) com três fatias.

### Sessão e perfil

`session`, `currentProfile` (`group` + `role`), `selectedLoginGroup` (qual
portal/grupo o usuário escolheu na entrada), perfis de investidor/cliente/
fornecedor e `portalTokenDoLogin` (token de portal resolvido no login por
e-mail, só em memória). `hooks/useAuthSync.ts` alimenta essa fatia: escuta
`supabase.auth.onAuthStateChange`, valida o acesso ao grupo escolhido com
`profileService.validateAccess` e só então marca `profileSynchronized` — que é
o gatilho para buscar organizações e clientes. Detalhes em
[Autenticação, perfis e permissões](../conceitos/autenticacao-e-perfis.md).

### Contexto (organização → empresa → obra)

- `activeOrganizationId: string | null` — `null` significa **"Todas as
  organizações"**. No `localStorage` a sentinela é a string `'TODAS'`, que é
  convertida de volta para `null` na carga. Trocar a organização zera a empresa
  ativa e a lista de empresas.
- `activeEmpresaId` — só a empresa que o usuário escolheu. `fetchCompanies`
  **nunca elege a matriz sozinha**: se a empresa salva sumiu, volta a nenhuma.
  Elegê-la automaticamente tornava "Todas" inalcançável (o seletor voltava para
  a matriz ~1 s depois).
- No primeiro login (chave ausente), `fetchOrganizations` inicia o contexto em
  "Todas", não na primeira organização da lista.

Código de tela **não lê isso direto** para decidir organização: usa
`useOrgContext`, que resolve a hierarquia do topo. Ver
[Multi-tenancy e o seletor de organização](../conceitos/multi-tenancy-organizacao.md).

### Projetos já filtrados na origem

`fetchProjects()` não recebe parâmetro — usa `activeOrganizationId` do próprio
store — e pede `listProjects({ classifications: 'ALL', includeOrphans: true })`.
Da mesma lista deriva três campos:

| Campo | Conteúdo |
|---|---|
| `projects` | **só OBRA**, sem projetos de sistema — o que 99% das telas quer |
| `allProjects` | os quatro tipos (obra, orçamento, planejamento, diário), sem projetos de sistema |
| `systemProjects` | só projetos criados pelo sistema (ex.: "Gestão Comercial") |

`setProjects` aplica os mesmos cortes, para que uma lista crua do banco não
reintroduza projeto de sistema ou orçamento em `projects` por outra porta. A
razão de existir está em
[Projetos: obra, orçamento, planejamento…](../conceitos/classificacao-de-projetos.md).

O parâmetro antigo de `fetchProjects(organizations)` era ignorado mas entrava
nas dependências de um efeito no `App.tsx`, o que refazia a busca inteira de
projetos a cada carga de organizações (medido: ~1,2 MB duas vezes no login).

### UI e navegação

`activeView` é a "rota" atual: nasce do hash da URL (`getInitialView`) e cada
`setActiveView` grava em `localStorage` e sincroniza a URL
(`lib/tabRouter.ts`). `navigateToFocus(view, ref)` navega já apontando um item
para o módulo de destino focar (deep-link transitório em `viewFocus`). Ver
[Navegação e telas](./navegacao-e-telas.md).

### Logout

`logout()` remove **só** chaves `sb-*` (auth do Supabase) e `orca_*` (contexto)
do `localStorage` e limpa o `sessionStorage`. Não usa `localStorage.clear()`,
porque isso apagava preferências de UI (colunas, ordenação, filtros) que devem
sobreviver ao logout. Também avisa outras abas (`broadcastSignOut`) e redireciona
para a página de login de origem (`destinoAposSair`).

## TanStack Query

`lib/queryClient.ts` exporta o `QueryClient` singleton com padrões
conservadores: `staleTime` 2 min, `gcTime` 10 min, `retry: 1` e
**`refetchOnWindowFocus: false`**. `STALE.slow` (10 min), `STALE.normal`
(2 min) e `STALE.fast` (30 s) são usados pelos hooks conforme a volatilidade do
dado.

As chaves vêm de fábricas hierárquicas em `lib/queryKeys.ts` (ex.:
`laborKeys.employees(orgId)` → `['labor','employees', orgId ?? 'all']`). A
hierarquia permite invalidar um módulo inteiro (`laborKeys.all`) ou uma família
(`laborKeys.employees()`), e a regra declarada é **nunca usar chave ad-hoc em
componente**. Os hooks de consulta (`hooks/useLaborQueries.ts`,
`useStructuralQueries.ts`) encapsulam chave + `staleTime` + chamada ao service;
os de mutação (`useLaborMutations.ts`) invalidam as chaves afetadas no
`onSuccess`.

A adoção é parcial: a maior parte das telas ainda carrega dados com
`useEffect` + service + estado local. React Query **convive** com o store; não
o substitui.

## Persistência local e auto-save do orçamento

`hooks/usePersistenceSync.ts` (usado pelo `App.tsx`) concentra o que vive em
`localStorage`:

- **Seleções transitórias de módulo** (cotação, contrato, pedido, estudo
  Imovib, abas de vendas/locação/diário) são gravadas enquanto a view
  correspondente está ativa e **apagadas ao sair dela**. A lista de views de
  Suprimentos inclui o Mapa de Cotação (`supplies-quotations-comparison`) —
  sem ela, abrir o mapa era lido como "saiu de Suprimentos" e o id da cotação
  era apagado no mesmo instante em que a tela ia usá-lo.
- **Favoritos** são sincronizados entre abas via evento `storage`.
- **Auto-save do orçamento do projeto ativo**: cada mudança em `budget` ou
  `projectSettings` agenda `projectService.saveProject` com debounce de 2 s,
  gravando também o orçamento dentro da versão ativa (`settings.versions`). Se
  o projeto for trocado durante o debounce, o cleanup **salva imediatamente** o
  projeto que está saindo; um `ref` com o `projectId` atual impede salvar no
  projeto errado.
- **Reidratação**: ao mudar `projectId`/sessão, `projectService.loadProject`
  recarrega settings e orçamento; projeto inexistente volta ao estado inicial.

## Realtime

O uso de Supabase Realtime é pontual, não um barramento geral: chat
(`services/chatService.ts`), notificações (`services/notificationService.ts`),
colaboração na Planta (`hooks/useBlueprintColaboracao.ts`) e áreas do portal do
parceiro. O `QueryClient` desliga refetch por foco justamente porque a maioria
dos dados não é ao vivo.

⚠️ `supabase.channel(topico)` devolve a **mesma instância** para o mesmo tópico;
remover o canal num consumidor derruba o outro. Dê tópicos distintos por
consumidor.

## Onde mexer

- Nova consulta de servidor: método no service do domínio; se a tela se
  beneficia de cache, um hook `useQuery` com chave em `lib/queryKeys.ts`.
- Nova lista grande: `fetchAllPages` com ordenação determinística.
- Novo dado de contexto global: só se for realmente transversal (sessão,
  seletor do topo); dado de módulo fica no módulo.
