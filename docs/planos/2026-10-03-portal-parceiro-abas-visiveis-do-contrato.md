# Portal do Parceiro — abas visíveis do detalhe do contrato

## Pedido original

Sessão de 03/10/2026 (Claude Code, frente `portal-parceiro-abas-contrato`):

> implementar a funcionalidade de configurar abas visíveis (alem da geral existente), uam exclusiva para a aba Constratos

Perguntas feitas ao usuário antes do plano, e as respostas:

- *"A configuração das abas do contrato vale para todos os contratos do
  parceiro, ou cada contrato tem a sua?"* → **Por parceiro**.
- *"Onde fica o botão exclusivo das abas do contrato, na visão do app?"* →
  **Na aba Contratos** (engrenagem ao lado de "Contratos deste Fornecedor").

## Contexto

A configuração **geral** (engrenagem do cabeçalho do workspace, 6 abas do
portal, `settings.partnerPortalTabs`) nasceu em 29/09/2026 —
`docs/planos/2026-09-29-portal-parceiro-abas-visiveis.md`. O detalhe de um
contrato no portal tem 7 sub-abas (Visão Geral, Itens, Execução & Entrega,
Aditivos, Medições, Retenção de Garantia, Penalidades), todas sempre visíveis.
Não confundir com `2026-09-10-portal-parceiro-abas-do-contrato.md`, que CRIOU
essas sub-abas.

## Decisões

- Grava em `partner_workspaces.settings.partnerContractTabs`, lista
  independente da geral; mesma regra: ausente = todas, `[]` = nenhuma.
- Visibilidade de navegação, não autorização — a RPC do detalhe continua
  respondendo pelo token (igual à geral e ao Fornecedor).
- A visão do app (`ContractDetailView` embutido) não muda: a configuração é
  sobre o que o PARCEIRO vê.
- O modal geral e o do contrato são o mesmo componente (`ConfigAbasModal`), e
  as duas engrenagens gravam pela mesma rotina (`salvarAbas`), que preserva as
  outras chaves de `settings`.
- Com a aba geral Contratos oculta, a engrenagem do contrato continua ativa e o
  modal avisa que a configuração só vale quando a aba for liberada.
- Nenhuma sub-aba liberada: o cabeçalho do contrato fica e aparece o aviso
  "Detalhes do contrato não liberados" no lugar das abas.

## Itens

1. **Regra pura** `utils/partnerPortalTabs.ts` — construtor genérico; as funções
   da geral mantêm a assinatura; novas `enabledPartnerContractTabs` /
   `togglePartnerContractTab`.
   *Pronto quando:* `__tests__/partnerPortalTabs.test.ts` passa. ✅ 11 testes.
2. **Portal** `PartnerPortal.tsx` — barra de sub-abas filtrada, abre na
   primeira liberada, queda se a aberta sumir, aviso quando nenhuma.
   *Pronto quando:* casos 7 e 8 de
   `__tests__/components/PartnerPortalContratoAbas.test.tsx` passam, e no
   navegador pelo link (RPC interceptada): sem config = 7 sub-abas abrindo em
   Visão Geral; `[measurements, items]` = só Itens e Medições abrindo em Itens;
   `[]` = aviso. ✅ medido em 03/10/2026 no build da frente.
3. **Visão do app** `PartnerWorkspaceManager.tsx` — engrenagem na aba
   Contratos, modal das 7, aviso quando Contratos está oculta, modal geral
   reescrito sobre o componente compartilhado.
   *Pronto quando:* `__tests__/components/PartnerWorkspaceAbasContrato.test.tsx`
   (4 casos) e o `PartnerWorkspaceAbasVisiveis.test.tsx` existente passam. ✅
   ⚠️ Não fotografado no navegador: a visão do app exige login e a senha do
   usuário de leitura não fica guardada.
4. **Migration** `aplicar_20271003000020_partner_portal_abas_do_contrato.sql` —
   `partner_portal_get_data` devolve também `partnerContractTabs`.
   *Pronto quando:* ensaio com ROLLBACK correto, aplicada, sonda anon devolve a
   chave. ✅ corpo vigente conferido (md5 `fad251b5…`, igual ao de 29/09);
   ensaio devolveu `["items","measurements"]` e não deixou rastro; aplicada;
   sonda anon: `{partnerPortalTabs: null, partnerContractTabs: null}`.
5. **Verificação geral** — `tsc`, `check-ui-standard.sh` (0 → 0 nos dois
   componentes), suíte inteira. ✅ 7.116 testes, 7.082 passaram, 34 pulados,
   0 falhas (a conta fecha).
6. **Publicação** — push em main, `conferir-producao.sh` com os textos novos e
   check-run `ci` do commit.
   *Pronto quando:* o domínio serve um commit que contém o desta frente e a CI
   do commit está verde.
   ✅ commit `3cce2758` em main; `conferir-producao.sh` em 03/10/2026: domínio
   serve `3cce275`, com "Configurar abas do contrato visíveis ao parceiro" e
   "Detalhes do contrato não liberados" nos bundles; check-run `ci` do commit:
   `completed success`.
