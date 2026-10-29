---
type: módulo
title: Portais externos (cliente, fornecedor, parceiro, investidor, corretor, síndico, colaborador)
description: Como pessoas de fora da organização usam o sistema — cada portal é uma casca própria fora do Layout, identificada por token (link) ou por login com e-mail e senha que resolve o mesmo token; toda leitura passa por RPC SECURITY DEFINER (tabela direta devolve vazio pela RLS); arquivos saem por Edge Function; convites por e-mail; vocabulário visual próprio.
tags: [portals, external-users, token, rpc, security-definer, invites, client-portal, supplier-portal]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-4339af0dc1b99e2c1dcfaab3
    resource: repo://components/portal/PortalKit.tsx
  - id: openwiki-source-c5f8ea3f13070304758504a9
    resource: repo://lib/linkDeAcesso.ts
  - id: openwiki-source-af66b266e558bf4271ff4b84
    resource: repo://lib/supabase.ts
  - id: openwiki-source-c2589d0fa53914a223944fd7
    resource: repo://services/brokerPortalService.ts
  - id: openwiki-source-d9365dc721700719d782cfc5
    resource: repo://services/clientPortalService.ts
  - id: openwiki-source-69224b6d3ed045cdc849b7be
    resource: repo://services/investorPortalTokenService.ts
  - id: openwiki-source-20d3a4816daef467d23ad629
    resource: repo://services/partnerPortalTokenService.ts
  - id: openwiki-source-8a39ce55a5597bd525e4b414
    resource: repo://services/portalInviteService.ts
  - id: openwiki-source-377eae8699165c16b709d112
    resource: repo://services/sindicoPortalService.ts
  - id: openwiki-source-e86103bada577d9bf7e04821
    resource: repo://services/supplierPortalTokenService.ts
  - id: openwiki-source-13a7670649dfec055b68d039
    resource: repo://supabase/migrations/20261128000001_client_portal_tokens.sql
  - id: openwiki-source-8991f99ada0e2c1589e2a1cf
    resource: repo://supabase/migrations/20270822000017_supplier_portal_tokens.sql
  - id: openwiki-source-a3ce0d48506b63e1719d8a1c
    resource: repo://utils/clientPortalTabs.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Portais externos

Clientes, fornecedores, parceiros, investidores, corretores, síndicos,
colaboradores de obra, credores e treinandos usam o sistema **sem serem membros
da organização**. Para eles há portais — cascas próprias renderizadas pelo
`App.tsx` **antes** do `<Layout>` (sem sidebar nem seletor de organização).

| Portal | Rota | Serviço | Família de RPCs |
|---|---|---|---|
| Cliente | `/portal-cliente` | `clientPortalService` | `client_portal_*`, `fn_portal_get_*` |
| Fornecedor | `/portal-fornecedor` | `supplierPortalTokenService` | `supplier_portal_*` |
| Parceiro | `/portal-parceiro` | `partnerPortalTokenService` | `partner_portal_*` |
| Investidor | `/portal-investidor` | `investorPortalTokenService` | `fn_investor_portal_*` |
| Corretor | `/portal-corretor` | `brokerPortalService` | `broker_portal_*`, `fn_broker_portal_*` |
| Síndico | `/portal-sindico` | `sindicoPortalService` | `sindico_portal_*` |
| Colaborador (obra) | `/portal` | `LaborPortal` (`PortalView`) | família do portal do colaborador |
| Treinamentos | `/portal-treinamentos` | `academyPortalService` | `academy_portal_*` |
| Crédito (credor) | casca `LenderPortal` | `creditRoomService` | `fn_my_credit_rooms` e afins |

## Duas portas, uma casca

1. **Link com token** — `?token=…` na URL. O `App.tsx` lê o token do pathname
   (ver [Navegação](../../arquitetura/navegacao-e-telas.md)) e abre a casca. O
   token vive em tabelas próprias (`client_portal_tokens`,
   `supplier_portal_tokens`…) e é emitido pelo admin com
   `*_portal_generate_token`.
2. **Login por e-mail e senha** — a mesma rota **sem** token abre `PortalLogin`.
   No login, `profileService.validateAccess` chama `portal_token_para_mim`
   (ou `sindico_portal_token_para_mim`), que resolve **o token da própria
   pessoa** pelo e-mail do JWT; o `App.tsx` abre **a mesma casca do link** com
   ele. Login por e-mail "entrega a experiência do link" — não há uma segunda
   implementação do portal. Ver
   [Autenticação](../../conceitos/autenticacao-e-perfis.md).

Os ramos antigos do `AppRouter` que renderizavam portais dentro do `Layout`
ficaram inalcançáveis por esse caminho e aguardam limpeza.

### Convites

`services/portalInviteService.ts` → Edge Function `portal-invite-user` (cliente,
fornecedor, corretor; o parceiro usa `partner-invite-user`, o treinando
`academy-portal-invite`). A função confere que quem chama é membro da
organização do cadastro, garante o token do portal, gera link de **criar senha**
(ou de redefinir, se o e-mail já tem conta), envia por Resend e grava
`portal_invited_at`. O convite já vem preenchido com o contato do cadastro.

`lib/linkDeAcesso.ts` captura o `#type=invite|recovery` **na carga do módulo**,
antes de o `createClient` do Supabase apagar o hash; e guarda o e-mail que o link
identifica, para a tela de criar senha não gravar a senha em outra conta caso
outra aba troque a sessão.

## Leitura do portal é SEMPRE RPC

O portador do portal não é membro da organização, então a RLS das tabelas
(`is_org_member`) não libera nada para ele. **Leitura direta de tabela devolve
`[]` sem erro** — a tela fica vazia em silêncio. Por isso:

- toda leitura e ação do portal é uma RPC `SECURITY DEFINER` que recebe o token
  (ou resolve a pessoa pelo JWT) e decide dentro dela o que devolver;
- a RPC devolve dados já "achatados" quando a tela precisa de algo que a RLS
  esconderia (ex.: o **nome da obra** junto do pedido no Portal do Fornecedor,
  porque a RLS de `projects` não deixaria ler);
- toda RPC nova segue a regra de segurança: `REVOKE … FROM PUBLIC, anon` e
  autorização dentro da função (ver
  [Segurança](../../seguranca/rls-funcoes-e-edge-functions.md)). Antes da
  auditoria, RPCs que **emitem credencial de portal** eram chamáveis com a chave
  anon.

O Portal do Síndico ilustra o desenho: a identidade vai em **um** de dois
campos — `token` (link ou login) ou `clientId` (quando a administradora abre o
portal pelo app) — e quem decide se vale é `fn_sindico_resolver`, no banco. O
síndico **nunca entra no app**: gerencia o condomínio (rateio, cotas, conta
bancária, extrato) pelo portal.

## Arquivos

Buckets do Storage só liberam `authenticated` com vínculo de organização. O
portal baixa e envia arquivos por **Edge Functions** que validam o token **e** o
vínculo do arquivo com aquele portador antes de gerar URL assinada com a
service_role: `portal-ged-download`, `client-portal-*-download`,
`supplier-portal-download`/`-upload`/`-recibo-download`,
`partner-portal-*`, `labor-portal-ged-download`, `condomino-portal-download`,
`credit-room-download`, `sindico-portal-financeiro`. Ver
[Edge Functions](../../integracoes/edge-functions.md).

## O que cada portal mostra (resumo)

- **Cliente**: dados do contrato, parcelas e recibos (a mesma regra de "pago"
  do financeiro — `mapReceivableRow`), andamento/cronograma da obra, diário,
  documentos (GED), pedidos, unidade e a aba **Condomínio** (o condômino já é um
  `client` via `unit_occupancies`, então não é um portal novo).
- **Fornecedor**: pedidos, negociação (contrapropostas de pedido), notas,
  contas bancárias, parcelas a receber e recibos.
- **Parceiro**: contratos, financeiro, conversas e solicitações.
- **Investidor**: SPEs, oportunidades, marcos, relatórios e comunicados.
- **Corretor**: estoque, propostas, leads, **comissões** (título `brk-{deal}`),
  materiais, agenda, chat; versão para celular.
- **Síndico**: dados do condomínio, rateio e cotas, situação do título de cada
  cota, conta bancária, extrato e conciliação, ocupantes, OS, documentos.
- **Colaborador**: holerite como tela de abertura, documentos, ponto; identidade
  visual própria em `DESIGN.md` (marca da empresa do colaborador, paleta Alpa).

As abas de cada portal têm **fonte única** fora do componente
(`utils/clientPortalTabs.ts`, `supplierPortalTabs.ts`, `partnerPortalTabs.ts`,
`brokerPortalTabs.ts`, `sindicoPortalTabs.ts`, `trainingPortalTabs.ts`), para a
ajuda (`utils/portalHelpDefaults.ts`) e o tour (`utils/portalTour.ts`) falarem
das mesmas seções — um teste trava a igualdade.

## Visual

Os portais têm **vocabulário visual próprio**, exceção autorizada ao guia de UI
(§24): `components/portal/PortalKit.tsx` reúne as peças, aplicadas aos portais do
investidor, fornecedor, parceiro (financeiro) e corretor (comissões). Eles não
herdam o gutter do `Layout` (§20.2.1). Peças comuns: `PortalLogin`,
`PortalHelp`, `PortalTour`, `PortalChecklist`, `ConvitePortalBloco`.

## Ao criar algo novo num portal

1. Leitura e escrita por RPC `SECURITY DEFINER` que recebe o token (ou resolve
   pelo JWT) — nunca `supabase.from(tabela)` direto.
2. `REVOKE EXECUTE … FROM PUBLIC, anon` + `GRANT` explícito na mesma migration.
3. Arquivo → Edge Function que valida token e vínculo.
4. Aba nova → acrescentar no arquivo `*PortalTabs.ts` e na ajuda.
