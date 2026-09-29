# Portal do Parceiro — configuração de abas visíveis

## Pedido original

Sessão de 29/09/2026 (Claude Code, frente `portal-parceiro-abas`):

> implementar botao de gonfiguracão de abas visíveis da mesma forma que foi implementado em Portais < portal do fornecedor (visão do app)

## Referência

Portal do Fornecedor, visão do app (`components/SupplierDashboard.tsx`):
engrenagem só para admin → modal com as abas → cada clique liga/desliga e grava
`suppliers.settings.supplierPortalTabs`. Sem configuração = todas; lista vazia
= nenhuma. Admin vê as ocultas marcadas; o fornecedor só vê as liberadas.

## Decisões

- **Onde grava:** `partner_workspaces.settings.partnerPortalTabs` (coluna já
  existia; policy `workspaces_manage_internal` já deixa o membro da org gravar).
- **Quais abas:** as seis do portal — Dashboard, Conversas, Documentos,
  Contratos, Financeiro, Solicitações. "Usuários" é só da visão do app, fica fora.
- **Onde vale:** link, parceiro logado e pré-visualização do admin ("Visualizar
  como Parceiro" mostra o portal como o parceiro vê — igual ao Fornecedor).
- **Visibilidade, não autorização:** as RPCs do link continuam respondendo pelo
  token, como no Fornecedor.
- **O link só recebe a chave das abas**, não o `settings` inteiro (roda como anon).
- **Tipografia do modal:** estrutura igual à do Fornecedor, mas título e rótulos
  em sentence case (guia §21), não no caixa-alta antigo.
- **Marcação na visão do app:** as sub-abas do workspace são sublinhadas, não
  pílulas; oculta = texto apagado + ícone de olho cortado + título "Oculta para
  o parceiro" (no Fornecedor a pílula ganha borda tracejada).

## Itens

1. **Regra pura** `utils/partnerPortalTabs.ts` — ids, rótulos, derivar
   habilitadas (null → todas, [] → nenhuma, ordem canônica), alternar.
   *Pronto quando:* `__tests__/partnerPortalTabs.test.ts` passa. ✅ 6 testes.
2. **Service** `partnerService.updateWorkspaceSettings` grava só `settings`.
   *Pronto quando:* o teste de componente confere a chamada com as outras chaves
   de `settings` preservadas. ✅
3. **Visão do app** (`PartnerWorkspaceManager.tsx`) — engrenagem no cabeçalho do
   workspace, modal, marcação das sub-abas ocultas.
   *Pronto quando:* `__tests__/components/PartnerWorkspaceAbasVisiveis.test.tsx`
   passa (marcação, estado no modal, gravação, lista vazia). ✅ 4 testes.
   ⚠️ Não fotografado no navegador: a visão do app exige login e a senha do
   usuário de leitura não fica guardada.
4. **Portal** (`PartnerPortal.tsx`) — sidebar só com as liberadas, cai na
   primeira liberada se a aberta sumir, aviso "Portal em configuração" quando
   nenhuma.
   *Pronto quando:* no navegador, pelo link, com a resposta da RPC interceptada:
   sem config = 6 abas; [contratos, financeiro] = só as 2, abrindo Contratos;
   [] = aviso. ✅ medido em 29/09/2026 no build da frente.
5. **Migration** `aplicar_20270929000020_partner_portal_abas_visiveis.sql` —
   `partner_portal_get_data` devolve `workspace.settings.partnerPortalTabs`;
   REVOKE de PUBLIC + GRANT a anon/authenticated (REGRA #7).
   *Pronto quando:* aplicada, e a sonda com a chave anon devolve o campo.
   ✅ aplicada em 29/09/2026; sonda anon: `valid=true`,
   `settings={partnerPortalTabs: null}`.
6. **Publicação** — push em main e prova de fora com `conferir-producao.sh`.
   *Pronto quando:* o domínio serve um commit que contém o desta frente.
   ✅ commit `152541dd` em main; `conferir-producao.sh` em 29/09/2026: domínio
   serve `152541d`, com "Configurar abas visíveis do parceiro" e "Portal em
   configuração" nos bundles.
