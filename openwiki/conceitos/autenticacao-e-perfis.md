---
type: conceito
title: Autenticação, perfis e permissões
description: Como alguém entra no app — escolha do portal (grupo de login), Supabase Auth, validação do acesso por grupo (membro de organização ou RPC de portal), o papel derivado, os papéis dentro da organização, permissões por módulo e as contas com acesso total.
tags: [auth, login, profiles, permissions, roles, supabase-auth]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-e4c731bf27a84c2d2f14ad66
    resource: repo://hooks/useAuthSync.ts
  - id: openwiki-source-4f974863db7243612755385b
    resource: repo://lib/acessoTotal.ts
  - id: openwiki-source-7ebf5de04d812969f494db20
    resource: repo://lib/loginNestaAba.ts
  - id: openwiki-source-e6f796a84111cdceb8b87e0b
    resource: repo://services/profileService.ts
  - id: openwiki-source-6ad90e0726a82fa252d6da59
    resource: repo://types/users.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Autenticação, perfis e permissões

Há **três noções diferentes** de "quem é o usuário", e confundi-las é fonte
recorrente de bug:

| Noção | Onde | Exemplo | Decide |
|---|---|---|---|
| **Grupo de login** (`ProfileGroup`) | `useStore().currentProfile.group` | `USUARIO`, `CLIENTE`, `FORNECEDOR`, `SINDICO` | qual casca/portal o app abre |
| **Papel do perfil** (`UserProfile`) | `currentProfile.role` | `PERFIL_USUARIO`, `DESENVOLVEDOR`, `CLIENTE_COMPRA` | derivado do grupo; **não** é o papel na organização |
| **Papel na organização** (`OrganizationRole`) | linha em `organization_members` | `owner`, `admin`, `member`, `viewer` (+ cargo customizado) | o que o membro vê e edita naquela organização |

O mesmo e-mail pode entrar por portas diferentes (ex.: síndico também é
cliente) — **o grupo vem da porta escolhida, não do cadastro**.

## Fluxo de entrada

```
LoginGateway (escolhe o portal)  ─ ou ─  rota própria /portal-xxx sem token (PortalLogin)
   │ setSelectedLoginGroup(grupo)        (persistido em orca_selectedLoginGroup)
   ▼
Auth (Supabase Auth: e-mail + senha / convite / recuperação)
   ▼
useAuthSync
   ├ supabase.auth.getSession + onAuthStateChange → store.session
   ├ profileService.validateAccess(email, grupo)
   │     ok   → currentProfile = { group, role derivado, email }; profileSynchronized = true
   │     não  → authError; signOut após 3 s (só se o login foi NESTA aba)
   └ profileSynchronized → fetchOrganizations / fetchClients / carrega projeto
```

### `LoginGateway`

Tela de escolha do portal antes do login (Colaborador, Cliente, Investidor,
Fornecedor, Corretor, Parceiro, Crédito, Treinamentos, Síndico…). A escolha vira
`selectedLoginGroup`. Para portais com rota própria (`/portal-parceiro`,
`/portal-cliente`, `/portal-fornecedor`, `/portal-corretor`,
`/portal-treinamentos`, `/portal-sindico`), o `App.tsx` abre direto a página de
login daquele portal, sem passar pelo seletor; a escolha feita pela rota fica
só em memória (`selectLoginGroupForRoute`) para não "prender" o navegador no
portal na próxima visita.

### `profileService.validateAccess`

A pergunta é diferente por grupo:

| Grupo | Validação |
|---|---|
| `USUARIO` / `DESENVOLVEDOR` | existe **alguma** linha em `organization_members` com o e-mail (`.limit(1).maybeSingle()`) |
| `CLIENTE`, `FORNECEDOR`, `CORRETOR` | RPC `portal_token_para_mim(p_portal)` — devolve `situacao` e o **token do portal** da própria pessoa |
| `SINDICO` | RPC `sindico_portal_token_para_mim` — exige mandato vigente (`sem_mandato` é uma situação própria) |
| `CREDOR` | RPC `fn_my_credit_rooms` (convite em sala de crédito, não revogado/expirado) |
| `TREINANDO` | RPC `academy_portal_user_my_access` |
| `PARCEIRO` | linha ativa em `partner_users` |
| `INVESTIDOR` | linha em `investors` com o e-mail |

Por que RPC para os portais: quem está **fora** da organização não passa pela
RLS de `clients`/`suppliers`, que só libera membros. A leitura direta de tabela
recusava sempre quem era de fora. As RPCs são `SECURITY DEFINER` e casam pelo
e-mail do JWT. O token devolvido vai para `portalTokenDoLogin`, e o `App.tsx`
abre **a mesma casca do acesso por link** — login por e-mail "entrega a
experiência do link". Ver [Portais externos](../modulos/portais/portais-externos.md).

⚠️ O `.limit(1)` na checagem de membro é essencial: sem ele, quem é membro de
mais de uma organização recebia `PGRST116` do `maybeSingle()`, o erro virava
"acesso negado" e o usuário era deslogado 3 s depois.

Há um mapa fixo de e-mails reservados a um grupo específico no início do
método.

### Papel derivado

Após validar, o `useAuthSync` deriva `currentProfile.role` do grupo
(`DESENVOLVEDOR` → `DEVELOPER`, `CLIENTE` → `CLIENT_BUYER`, padrão `USER`,
etc.). Esse `role` diz qual portal está aberto; **não** use para decidir
permissão dentro de uma organização — para isso há o membro.

### Abas diferentes, mesma sessão

As abas do navegador compartilham a sessão do Supabase (`localStorage`), mas
cada aba tem o seu portal. `lib/loginNestaAba.ts` grava em `sessionStorage` o
e-mail de quem fez login **naquela aba**. Se a validação falha numa aba que
**não** fez o login, ela não desconecta a conta (o que derrubava a outra aba —
"entra e cai"); adota o portal gravado ou volta ao seletor. Só a aba que fez
o login daquela pessoa pode deslogar por "portal não combina".

Logout em qualquer aba se propaga às demais via `BroadcastChannel`
(ver [Navegação](../arquitetura/navegacao-e-telas.md)).

## Papéis e permissões dentro da organização

Cada membro em `organization_members` tem:

- `role: 'owner' | 'admin' | 'member' | 'viewer'`;
- opcionalmente `customRoleId` (cargo customizado da organização);
- `permissions: UserPermissions` — um mapa de booleanos `canViewX`/`canEditX`
  (orçamento, planejamento, diário, pedidos, financeiro, portais, configurações
  etc.; `canApproveDiary` é conferido também no banco);
- `productContext` (`platform`, `pro`, `offices`).

A organização guarda uma matriz de visibilidade por papel em
`settings.module_visibility`. A ordem de decisão (em `AppRouter` e no menu do
`Layout`):

1. grupo `DESENVOLVEDOR`, conta com acesso total ou topo em "Todas" → libera;
2. `admin` da organização → libera;
3. permissão gravada **no membro** vence;
4. senão, a matriz da organização para o papel/cargo;
5. nada gravado → libera (ou herda de outro módulo).

Detalhes da trava de rota em [Navegação](../arquitetura/navegacao-e-telas.md).
A gestão de membros, convites e permissões fica em
`components/OrganizationUsers.tsx` (`getDefaultPermissions(role)` dá o pacote
inicial de cada papel).

⚠️ Muitos módulos aparecem nas permissões detalhadas, mas só uma parte das
chaves é efetivamente lida pela trava de rota. Antes de prometer que "a
permissão X esconde a tela Y", confira o mapeamento no `AppRouter`.

⚠️ Permissão de interface não é segurança. O que garante os dados é a **RLS**
(`is_org_member`/`is_org_manager`) e a autorização dentro das RPCs — ver
[Segurança](../seguranca/rls-funcoes-e-edge-functions.md).

## Contas com acesso total

`lib/acessoTotal.ts` lista as contas com acesso a todos os módulos de todas as
organizações; `temAcessoTotal(email)` é usado pelo menu, pela trava de rota e
por travas de edição. **Isso é só interface.** Os dados são liberados pelo
banco: as mesmas contas estão em `public.superadmins` e uma migration as
torna `owner` de toda organização e espaço de tarefas, inclusive dos criados
depois. Conta nova na lista precisa entrar nos dois lugares; senão vê o menu
inteiro e as telas vazias.
