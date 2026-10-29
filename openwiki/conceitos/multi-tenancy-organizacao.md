---
type: conceito
title: Multi-tenancy e o seletor de organização
description: A organização é a fronteira de tenant do SaaS. O banco recorta por RLS (is_org_member sobre organization_members); no front, o seletor do topo é a autoridade, lida por useOrgContext. "Todas as organizações" é null na leitura e replicação nas organizações do usuário na escrita — nunca organization_id NULL. Uma catraca no CI impede padrões que já causaram bug.
tags: [multi-tenancy, organization, rls, org-context, invariants, guard-test]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-f3093ac0d673ccf55e874739
    resource: repo://__tests__/orgContextGuard.test.ts
  - id: openwiki-source-03f620b69efb2535f16dabc1
    resource: repo://hooks/useOrgContext.tsx
  - id: openwiki-source-a45e6c44e86e146c7c19dc2b
    resource: repo://services/inventoryService.ts
  - id: openwiki-source-ed9139727472bc30f4d0e510
    resource: repo://supabase/migrations/20260706000002_fix_is_org_member_remove_backdoor.sql
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Multi-tenancy e o seletor de organização

O sistema atende várias construtoras na mesma base. **Organização**
(`organizations`, coluna `organization_id` nas tabelas de dados) é a fronteira
de tenant. Dentro de uma organização existem **empresas** (`companies`, com
`org_id`; uma delas é a matriz) e **obras** (`projects`).

## Do lado do banco: RLS por membro

Cada linha de dado é recortada por policies que chamam funções como
`is_org_member(organization_id)` / `is_org_manager(...)`. `is_org_member` é
`SECURITY DEFINER` e verdadeira quando existe linha em `organization_members`
para a organização com `user_id = auth.uid()` (ou, em linhas legadas sem
`user_id`, com o e-mail do JWT). Corretores ativos em `broker_profiles` também
contam como membros daquela organização.

Consequências práticas:

- **A RLS é quem garante o isolamento.** O filtro do front é ergonomia, não
  segurança.
- Uma consulta **sem** `.eq('organization_id', …)` devolve tudo o que o usuário
  pode ver — é exatamente o que "Todas as organizações" precisa.
- A RLS de `organizations` é mais permissiva que a das tabelas de dados: o
  seletor do topo pode listar organizações das quais o usuário **não** é
  membro. Gravar numa delas volta `42501 new row violates row-level security
  policy`.

Regras de escrita de policy e função estão em
[Segurança: RLS, funções e Edge Functions](../seguranca/rls-funcoes-e-edge-functions.md).

## Do lado do front: o topo manda

Regra de produto (CLAUDE.md, REGRA #5):

1. Topo apontando para uma organização → usa ela e **não pergunta nada**.
2. Topo em "Todas as organizações" → só então pergunta (ao **criar**).
3. Perguntado, se o usuário mantém "Todas" → o item é **replicado em cada
   organização de que ele é membro**.
4. Operação que exige organização específica por natureza (fechamento
   contábil, faixa de alçada, chamado de garantia) → modo `'single'`, sem a
   opção "Todas".
5. Empresa selecionada no topo **herda** a organização dona dela.

### `useOrgContext()` — leitura

`hooks/useOrgContext.tsx` é a fonte única. Lê **do store, nunca de prop** (prop
é o que se deforma no caminho) e devolve `{ orgId, isAllOrgs, source }`:

1. `activeOrganizationId` preenchido → `source: 'organization'`;
2. senão, empresa ativa → organização dona dela (`Company.org_id`),
   `source: 'company'`;
3. senão → `orgId: null`, `isAllOrgs: true`, `source: 'all'`.

⚠️ A **obra** ativa não entra na cascata, de propósito: trocar de organização
zera a empresa mas não o `projectId`. Se a organização viesse da obra, escolher
"Todas" com uma obra aberta não teria efeito.

**Na leitura, `null` vai direto ao service** — nunca bloqueie o carregamento por
falta de organização. Padrão do service:

```ts
async listWarehouses(organizationId: string | null, …) {
    let query = supabase.from('warehouses').select(COLS).order('name');
    if (organizationId) query = query.eq('organization_id', organizationId);
    …
}
```

### `useOrgWriteTarget()` — criação

```ts
const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
const target = await resolveWriteOrg('all-allowed');   // ou 'single'
if (!target) return;                                   // cancelou
const { ok, failed } = await forEachTargetOrg(target, orgId => service.create(orgId, dados));
// …e renderize {orgTargetModal} no JSX
```

- Com organização no topo → resolve direto, sem modal.
- Em "Todas" com **uma** organização gravável → resolve com ela.
- Em "Todas" com várias → abre o modal. Em `'all-allowed'` (catálogos:
  tipo de contrato, categoria, tributo…) ele oferece "Todas as organizações",
  que vira `{ kind: 'all', orgIds }`.

`WriteTarget` só tem duas formas — `{ kind: 'org' }` e `{ kind: 'all', orgIds }`.
**Não existe alvo "global"**: um registro com `organization_id = NULL` seria
visível a todos os clientes do SaaS, porque a policy de leitura de registro
global é `organization_id IS NULL OR is_org_member(...)`. `NULL` fica reservado
aos seeds do sistema (ex.: as categorias financeiras padrão).

`forEachTargetOrg` usa `Promise.allSettled`: numa replicação, a organização que
já tem o item falha no UNIQUE e as demais seguem. `partialFailureNote` monta o
resumo do toast **distinguindo** duplicata de falta de permissão (`42501`) —
antes a mensagem dizia sempre "as demais já tinham" e escondia o erro de RLS.

### Campos "Organização" em formulário

- `useWritableOrganizations()` — as organizações em que o usuário é **membro**
  (onde pode gravar), não as que ele enxerga. Sem dados de membro, devolve
  todas e deixa o banco decidir.
- `useDefaultWriteOrgId()` — o topo; ou a única organização gravável; ou
  `null` (aí o formulário obriga a escolha).

### `errorMessage(e, fallback)`

Erro do Supabase é um objeto `{ message, code, details, hint }` que **não** é
`instanceof Error`. Use `errorMessage` para mostrar a causa real (ex.: a
mensagem de RLS) em vez de um texto genérico.

## A catraca no CI: `orgContextGuard.test.ts`

`__tests__/orgContextGuard.test.ts` varre `components/`, `hooks/` e `services/`
e roda em todo push/PR para `main`. Quatro padrões proibidos:

| Padrão | Por que é bug |
|---|---|
| `organizations[0]` como organização | pega a primeira da lista, não a selecionada — grava na errada, calado |
| `activeOrganizationId \|\| ''` | terceira sentinela para "Todas"; `??` não pega `''` → botão morto |
| `if (!organizationId) return` em carregamento | tela em branco em "Todas" |
| `enabled: !!organizationId` (React Query) | idem |

Funciona como **catraca**: o `BASELINE` registra a dívida existente quando a
regra nasceu (arquivo → número de ocorrências). Arquivo fora do baseline com
violação falha; arquivo do baseline que piora falha; e também falha quando
**melhora** sem baixar o número, ou zera sem sair da lista — o baseline nunca
fica folgado. A `ALLOWLIST` de cada regra guarda exceções permanentes, cada uma
com justificativa. **Não adicione entrada ao baseline para fazer passar.**

`scripts/check-org-selector-guard.sh` faz verificação equivalente em shell; o
teste é a versão que de fato roda sozinha.

⚠️ O comentário do cabeçalho do teste ainda diz que manter "Todas" "grava
global (organization_id NULL)". Está desatualizado: o contrato vigente (em
`useOrgContext.tsx` e no CLAUDE.md) é replicar nas organizações do usuário.

## Casos especiais

- **Contas com acesso total** (`lib/acessoTotal.ts`) veem tudo porque o banco
  as torna `owner` de toda organização; ver
  [Autenticação, perfis e permissões](./autenticacao-e-perfis.md).
- **Portais externos** (cliente, fornecedor, síndico, treinando…) não são
  membros de organização; leem por RPC `SECURITY DEFINER`. Ver
  [Portais externos](../modulos/portais/portais-externos.md).
- **Folha de pagamento** nasce na organização em que o colaborador é
  registrado; o custo vai para outras organizações por alocação. Ver
  [RH: folha de pagamento](../modulos/rh/folha-de-pagamento.md).
