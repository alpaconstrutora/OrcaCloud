# Portal do Parceiro — documentos da aba Emissão nas duas visões

## Pedido original

> aba emissão nao esta conectado ao portal do parceiro nas duas visoes

Sessão: 96c7e92a-06fb-4a92-b248-08960e4208ee · 2026-10-04, madrugada — depois de
`2026-10-03-emissao-documento-unico.md`, `2026-10-03-documentos-do-contrato-em-tabela.md`
e `2026-10-04-gerar-pelo-modelo-versao-pdf.md`.

"Duas visões" = a do **parceiro** (`PartnerPortal`, pelo link e pelo portal
autenticado/prévia) e a do **gestor** (`PartnerWorkspaceManager`: engrenagem das
abas do contrato, "Ver PDF", "Visualizar como Parceiro").

## Diagnóstico

- O núcleo `partner_ws_contract_detail` (fonte única das duas cascas) devolvia 8
  coleções e **nenhuma** era a de documentos versionados — o parceiro não tinha
  como ver o que a construtora emite na aba Emissão.
- `PARTNER_CONTRACT_TAB_IDS` (engrenagem do gestor + abas do parceiro) não tinha
  a aba.
- "Ver PDF" da lista (duas cópias idênticas, uma por visão) punha
  `signed_contract_url` na frente de tudo: o PDF do GED antigo vencia a versão
  emitida (no CTS-018-104-0001, um extrato bancário).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-04 | Aba "Documentos" com versões EMITIDAS (contrato + aditivos), na engrenagem; "Ver PDF" = emitida mais recente ou o assinado; migration no núcleo — autoriza? | "Sim, aplicar a migration" |
| 2026-10-04 | Os 2 workspaces com abas do contrato já configuradas (Álvaro Esteves, Débora Cristina Duarte): aba nova ligada ou desligada? | "Ligada nos dois" |

## Plano e estado

- [x] **Migration `aplicar_20271004000020_partner_contrato_documentos.sql`** —
      núcleo + coleção `documents` (só `emitted`, campos explícitos, SEM
      `signature_token`/`storage_path`); corpo conferido mecanicamente contra o
      `pg_get_functiondef` vigente (idêntico sem o bloco novo); `REVOKE` literal
      (REGRA #7); `settings.partnerContractTabs` dos 2 workspaces ganhou
      'documentos'. Aplicada e conferida: ACL `{postgres, service_role}`.
- [x] **`utils/partnerPortalTabs.ts`** — sub-aba `documentos` ("Documentos").
- [x] **`services/partnerContractDetail.ts`** — `PartnerContractDocument` + normalização.
- [x] **`components/partner/PartnerPortal.tsx`** — aba "Documentos (n)" no
      detalhe do contrato, mesmo vocabulário de cartões das outras abas;
      `?? []` para payload sem a coleção não derrubar o detalhe.
- [x] **`components/partner/PartnerWorkspaceManager.tsx`** — ícone na engrenagem.
- [x] **`utils/contractFileUrl.ts`** — "Ver PDF" numa regra só (gêmeas fundidas):
      assinado (SIGNED) → emitida mais recente → GED legado.
- [x] Textos da Emissão: "Portal do Cliente" → "portal (cliente ou parceiro)".

## Verificação

- `tsc` limpo; `check-ui-standard.sh` limpo nos 4 arquivos de tela;
  `segurancaMigrations.test.ts` verde.
- Testes novos/atualizados (`contractFileUrl.test.ts`, `PartnerPortalContratoAbas`
  6b/6c, contagem 7→8 em `partnerPortalTabs.test.ts` e
  `PartnerWorkspaceAbasContrato`): falham no código antigo, passam no novo.
- Suíte: 7379 = 7345 passou + 34 pulados, 0 falha (JSON conferido). Build: 2
  quedas intermitentes do Node, 3ª ok (código idêntico nas três).
- **De fora, chave pública** (como o navegador do parceiro):
  `partner_portal_get_contract_detail` → `valid:true` e 9 chaves com
  `documents`; o núcleo chamado direto com anon → HTTP 401.
- **Visual, só leitura** (`c:/tmp/pwtest/parceiro-documentos-contrato.js`,
  `documents` injetado na resposta real das DUAS cascas — nenhum contrato de
  parceiro tem versão emitida ainda):
  - link: 8 abas, "Documentos (2)", contrato e aditivo, links "Abrir";
  - gestor: engrenagem lista "Documentos" (ligado); "Visualizar como Parceiro"
    mostra a mesma aba com as mesmas versões;
  - 0 escritas, 0 erros de console nas duas.
- NÃO exercitado com dado real: nenhum contrato de parceiro tem versão emitida.
