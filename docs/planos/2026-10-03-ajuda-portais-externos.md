# Sistema de ajuda dos portais externos (Parceiro, Fornecedor, Corretor)

**Data:** 2026-10-03 · **Frente:** `ajuda-portais` · **Status:** F1 em publicação

## Pedido original (literal)

> avaliar menu ajuda e comandos

> o que eu quero é criar um sistema de ajuda ao parceiro no uso do portal

Decisões do usuário (perguntas respondidas na sessão):
- **Formato:** central de ajuda (painel lateral com artigos por assunto e busca)
  **+** tour guiado no primeiro acesso **+** perguntas frequentes **+** contato com
  a construtora (com atalho para abrir uma Solicitação).
- **Conteúdo:** editável pela construtora, por organização, dentro do app.
- **Escopo:** os três portais — Parceiro, Fornecedor e Corretor.

## Contexto

O item "Ajuda e comandos" do menu da conta no Portal do Parceiro só mostrava um
aviso de 4 segundos ("Dúvidas? Fale com a construtora responsável por esta
obra."). Fornecedor e Corretor tinham o mesmo item vazio. Não havia tour, tooltip
nem conteúdo de ajuda em lugar nenhum do app.

Fatos que moldaram o desenho:
- `is_org_member` devolve TRUE para corretor ativo da org → a tabela da ajuda usa
  **só `is_org_manager`** (owner/admin). Os portais leem exclusivamente por RPC.
- Token → organização: `partner_portal_tokens.org_id`, `supplier_portal_tokens.org_id`,
  `broker_portal_tokens.org_id`. Logado: parceiro por `partner_users.email`
  (workspace pode ser compartilhado), corretor por `broker_profiles.email`,
  fornecedor por `suppliers.email` ∪ `supplier_org_shares`.
- Abas visíveis por registro já existem nos três portais; a ajuda não mostra seção
  de aba oculta.
- `organizations` tem `name, email, phone, website` — fonte do cartão de contato.
- Padrão da casa para texto longo: `<textarea>` com HTML simples + preview
  sanitizado; `scripts/check-xss-sinks.sh` exige `sanitizeHtml` junto do sink.

## Desenho

### Conteúdo: padrão em código + sobrescrita por organização
`utils/portalHelpDefaults.ts` é a fonte única: seções (= abas de cada portal),
artigos e perguntas padrão com chave estável, passos do tour com âncora fixa.
A tabela `portal_help_items` guarda só o que a construtora mudou:
`default_key` preenchido = sobrescrita de um padrão (título/corpo/seção ou
`is_published=false` = ocultar); `default_key` NULL = item próprio.
`mergePortalHelp(portal, rows, {visibleSections})` junta tudo (pura; testada).
Texto padrão melhorado numa atualização chega a toda construtora que não
sobrescreveu aquela chave. "Restaurar padrão" = apagar a sobrescrita.

### Banco — `supabase/migrations/aplicar_20271003000050_portal_help.sql`
- Tabela `portal_help_items` (sem FK para `organizations`; `lock_timeout 3s`);
  UNIQUE completa `(organization_id, portal, default_key)` para o upsert do
  PostgREST (índice parcial dá 42P10).
- RLS: uma policy `FOR ALL TO authenticated` com `is_org_manager(organization_id)`;
  `REVOKE ALL ON TABLE … FROM anon`.
- Funções (REGRA #7, REVOKE literal):
  - `portal_help_org_json(p_org, p_portal)` — núcleo, `REVOKE … FROM PUBLIC, anon, authenticated`;
  - `partner_portal_help_get` / `supplier_portal_help_get` / `broker_portal_help_get(p_token)` —
    cascas do link, token ativo e não vencido, `GRANT anon, authenticated`;
  - `portal_help_get_mine(p_portal, p_org DEFAULT NULL)` — externo logado por
    e-mail (e membro interno para prévia), `GRANT authenticated` só.
- Editor grava direto na tabela sob RLS.

### Front
- `services/portalHelpService.ts`, `hooks/usePortalHelp.ts` (token → casca;
  sem token → `get_mine`, com seletor de construtora quando há várias).
- `components/portal/PortalHelp.tsx` — `Sheet size="md"`: seções em acordeão
  (a da aba ativa já aberta), busca (`usePersistedState`), artigo com
  `sanitizeHtml` na mesma linha, FAQ, contato (`mailto:`/`tel:`/WhatsApp) e
  "Abrir uma solicitação" só quando o portal passa `onOpenRequest`. Falha de
  rede → aviso + conteúdo padrão (a ajuda nunca fica vazia).
- `components/PortalHelpSettings.tsx` — Configurações › "Ajuda dos Portais":
  seletor de portal; Artigos / Perguntas frequentes / Tour; tabela com Origem
  (Padrão / Personalizado / Próprio) e Visível; `Sheet size="lg"` com título,
  seção, corpo (HTML simples + pré-visualização sanitizada), visibilidade;
  Restaurar por item e "Restaurar padrão" do portal via `useConfirm`. REGRA #5:
  lista pela org do topo (em "Todas", coluna Organização), grava por
  `resolveWriteOrg('all-allowed')` + `forEachTargetOrg`.
- `components/partner/PartnerPortal.tsx` — botão `?` no header
  (`data-tour="ajuda"`), item "Ajuda" do menu da conta (era o toast),
  `visibleSections = enabledTabs`, `initialSection = activeTab`,
  `onOpenRequest` abre Solicitações com o formulário (não em prévia nem com a
  aba oculta).

## Fases
- **F1 (frente `ajuda-portais`, 376de903):** banco, textos dos 3 portais, editor,
  Parceiro completo.
- **F2 (frente `ajuda-portais-f2`, 04/10/2026):** Fornecedor e Corretor.
  - Pedido literal: "f2".
  - `utils/supplierPortalTabs.ts` e `utils/brokerPortalTabs.ts` passam a ser a
    fonte dos ids de aba (os tipos `SupplierPortalTab`/`PortalTab` derivam deles);
    `__tests__/portalHelpSections.test.ts` trava `PORTAL_SECTIONS` ≡ ids dos três
    portais.
  - `SupplierDashboard`: `?` no header do link, item "Ajuda" no menu (era toast),
    barra inferior do celular com "Mais" **permanente** (4 abas + Mais) e "Ajuda"
    dentro do sheet — o header com o menu é só md+; `visibleSections =
    enabledTabIds`; `accent="coral"`.
  - `BrokerPortal`: `?` no header do link e ao lado do título no modo app, item
    "Ajuda" no menu (era toast); `orgId = initialOrgId || selectedOrgId`;
    `accent="indigo"` (novo no `PortalHelp`).
  - Teste: `__tests__/components/SupplierPortalAjuda.test.tsx`.
- **F3:** Tour guiado (`components/portal/PortalTour.tsx`, `data-tour` nos
  portais; edição dos textos já cabe no editor da F1).
- **F4 (só se pedirem):** "já viu o tour" por e-mail em tabela.

## Verificação (F1)
- `__tests__/portalHelpDefaults.test.ts`, `__tests__/components/PortalHelp.test.tsx`,
  `__tests__/components/PortalHelpSettings.test.tsx`.
- Banco: ensaio da migration em `BEGIN … ROLLBACK` com sondas como `anon`
  (casca válida/inválida, núcleo 42501), como corretor (`get_mine` lê, INSERT 42501,
  SELECT 0 linhas) e como admin (INSERT, upsert pela chave, trigger, `get_mine`);
  aplicar com `db query -f`; `check-rls-postura.sh`; sonda HTTP anon.
- `tsc`, `check-ui-standard.sh` (4 arquivos), `check-xss-sinks.sh`, suíte inteira
  em JSON com a conta fechando, `verificar:build`, push, `conferir-producao.sh`,
  check-run `ci`, fechar a frente.
- Navegador (preview da frente, só leitura, token de teste): `?` → painel com
  seções, artigo, FAQ, contato; busca filtra.
