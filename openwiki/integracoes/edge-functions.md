---
type: integração
title: Edge Functions do Supabase
description: Catálogo das Edge Functions em Deno (supabase/functions), os quatro modos de autenticação (usuário membro/gestor, cron com CRON_SECRET, token de portal, webhook de terceiro) com o módulo compartilhado _shared/auth.ts, como o banco as agenda via pg_cron + pg_net, como o cliente as chama e quais serviços externos elas integram.
tags: [edge-functions, deno, supabase, auth, cron, webhooks, integrations]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-d81538d8891efe37053aeccb
    resource: repo://supabase/config.toml
  - id: openwiki-source-64f5c44ae46c33b53f076c87
    resource: repo://supabase/functions/_shared/auth.ts
  - id: openwiki-source-004ad9ebd27bae80df9d2ebd
    resource: repo://supabase/functions/asaas-webhook/index.ts
  - id: openwiki-source-1d13284fee5145b47c59a80a
    resource: repo://supabase/functions/dwg-converter/index.ts
  - id: openwiki-source-d3748953b5ba324578df9230
    resource: repo://supabase/functions/notify-broker-proposal/index.ts
  - id: openwiki-source-f6de51c0231394cecb1ddce5
    resource: repo://supabase/functions/portal-ged-download/index.ts
  - id: openwiki-source-7d8190119a9d684ec4114986
    resource: repo://supabase/functions/quality-sla-enforcement/index.ts
  - id: openwiki-source-ff7381dcd39350b01ba18871
    resource: repo://supabase/migrations/aplicar_20271015110200_email_capture_cron.sql
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Edge Functions do Supabase

Tudo o que precisa de **segredo**, de **service_role**, de **rede externa** ou
de **trabalho pesado** fora do navegador mora em `supabase/functions/<nome>/index.ts`
(Deno). São cerca de 50 funções; o deploy é separado do front-end (a
publicação do Vercel não as atualiza).

## Quatro maneiras de uma função saber quem chamou

`supabase/functions/_shared/auth.ts` concentra a autorização. Ele nasceu da
auditoria de segurança de 2026-09-01: o padrão dominante era validar que
**existe** um usuário e depois usar o cliente `service_role` com o
`organization_id` vindo do corpo da requisição. Isso confunde autenticação com
autorização — um usuário do tenant A emitia cobrança Asaas contra recebível do
tenant B.

| Modo | Helper | Uso típico |
|---|---|---|
| **Usuário membro** | `exigirMembro(req, organizationId)` | ação do app sobre dados de uma organização (cobrança Asaas, conciliação, documento, BI) |
| **Usuário gestor** | `exigirGestor(req, organizationId)` (`owner`/`admin`), `exigirGestorDeQualquerOrg`, `exigirUsuario` | configuração (certificado A1, conta Asaas, importação SINAPI, caixas de e-mail) |
| **Cron do banco** | `chamadaDeCron(req)` | varreduras agendadas (alertas de tarefa, régua de cobrança, sincronização Asaas, captura de e-mail, NF-e) |
| **Token de portal** | validação própria do token na tabela de tokens do portal | downloads/uploads dos portais externos |
| **Webhook de terceiro** | segredo do provedor no header | `asaas-webhook` (`asaas-access-token` = `ASAAS_WEBHOOK_TOKEN`), `asaas-saque-validacao` |

### `exigirMembro`

1. exige `organization_id` (400) e header `Authorization` (401);
2. valida o JWT com um cliente **anon** — a chave anon é pública, então sozinha
   não satisfaz `getUser()`; usar a service_role aqui derrotaria a checagem;
3. com a service_role, procura a linha em `organization_members` pela
   organização **e** pelo e-mail; sem linha → **403** (sem confirmar se a
   organização existe);
4. devolve `{ userId, email, papel }`.

`respostaDeErro(falha, corsHeaders)` converte a falha em `Response`.

### `chamadaDeCron`

Compara `Authorization` com `Bearer ${CRON_SECRET}` em **tempo constante**.
Por que um segredo dedicado e não a service_role key: as chaves novas
(`sb_secret_…`) não são JWT (não satisfaziam `verify_jwt`), e a chave que
ignora toda a RLS não precisa trafegar em header a cada minuto.

⚠️ A guarda `CRON_SECRET.length < 32 → false` é essencial: sem ela, segredo
ausente vira `''` e o header literal `"Bearer "` passaria — falha de
configuração viraria permissão. Foi o formato do defeito que deixou a
`task-alert-notifier` aberta.

Algumas funções antigas (`quality-sla-enforcement`, `notify-broker-proposal`)
ainda comparam o header com a service_role key.

### `verify_jwt` não é autorização

O gateway do Supabase só confere que o token é uma chave válida **do projeto** —
e a anon é uma delas, publicada no bundle. Função "protegida" só por
`verify_jwt` está aberta. Funções chamadas por cron ou webhook rodam com
`verify_jwt = false` (em `supabase/config.toml`) e o gate inteiro fica no
código; isso só é seguro **depois de provar** no deploy publicado que uma
requisição sem header recebe 401:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/functions/v1/<fn>" -d '{}'   # tem de dar 401
```

O arquivo local não prova o que está publicado. Mais em
[Segurança](../seguranca/rls-funcoes-e-edge-functions.md).

## Como as funções são chamadas

**Pelo app**: `supabase.functions.invoke(...)` (≈50 chamadas em `services/`,
`components/`, `hooks/`). O cliente global corta Edge Functions em **150 s**
(contra 20 s para o resto), alinhado ao gateway — com 20 s, funções longas
terminavam certas no servidor e o navegador mostrava *"Failed to send a request
to the Edge Function"*. Ver [Estado e acesso a dados](../arquitetura/estado-e-dados.md).

**Pelo banco**: jobs `pg_cron` disparam `net.http_post` para
`/functions/v1/<fn>` com `Authorization: Bearer ` + `public.fn_cron_secret()`
e `timeout_milliseconds := 150000`. As migrations de agendamento são
idempotentes (`cron.unschedule` antes) e podem condicionar o disparo (ex.:
`email-capture-sync` a cada 15 min, só se houver caixa ativa).

**Por terceiros**: webhooks (Asaas) e o endpoint público `planta-api`.

## Catálogo por domínio

| Domínio | Funções |
|---|---|
| Financeiro / Asaas | `asaas-charge`, `asaas-payment`, `asaas-webhook`, `asaas-status-sync` (fallback do webhook), `asaas-conta` (conta Asaas como conta de pagamento, extrato), `asaas-saque-validacao` (Asaas pergunta se o saque é legítimo) |
| Cobrança e relatórios | `dunning-notifier` (régua de cobrança), `financial-report-notifier`, `send-bi-report`, `bi-narrative` |
| Conciliação | `reconciliation-engine` (motor de conciliação bancária) |
| Boletos por e-mail | `email-capture-accounts` (conectar/testar caixas), `email-capture-sync` (IMAP → boletos) |
| Fiscal | `fiscal-nfe-processor` (pipeline de NF-e), `fiscal-certificado` (certificado A1) |
| Documentos | `doc-gen-enviar`, `doc-gen-ia`, `sign-contract` (assinatura eletrônica via ZapSign), `read-matricula` |
| Portais (download/upload) | `portal-ged-download`, `client-portal-*-download`, `client-portal-rateio-comprovantes`, `condomino-portal-download`, `supplier-portal-*`, `partner-portal-*`, `labor-portal-ged-download`, `credit-room-download`, `sindico-portal-financeiro`, `academy-portal-media` |
| Convites | `invite-member`, `portal-invite-user`, `partner-invite-user`, `academy-portal-invite` |
| Notificações e varreduras | `task-alert-notifier`, `process-overdue-sweep`, `quality-sla-enforcement`, `notify-broker-proposal`, `notify-opportunity-interest` |
| Planta Inteligente | `planta-api` (API pública por token), `planta-webhooks`, `planta-ia`, `dwg-converter` (DWG → DXF com libredwg em WASM), `topografia-elevacao`, `topografia-copernicus` |
| Dados de referência | `sinapi-import`, `opura-market-import` |

Detalhes por módulo:
[Boletos, Asaas e cobrança](../modulos/financeiro/boletos-asaas-e-cobranca.md),
[Conciliação bancária](../modulos/financeiro/conciliacao-bancaria.md),
[Ingestão de NF-e](../modulos/fiscal/ingestao-nfe.md),
[Portais externos](../modulos/portais/portais-externos.md).

### Por que os portais baixam arquivo por função

Quem entra num portal por link é `anon` + token; as policies de
`storage.objects` dos buckets só valem para `authenticated`. A função de
download valida o token na tabela de tokens do portal **e** o vínculo do arquivo
com aquele portador, e só então gera a URL assinada com a service_role.

### `dwg-converter`

O WASM do libredwg tem 9,5 MB — pesado demais para o bundle de quem nunca abre
DWG. O navegador envia os bytes do `.dwg`, recebe DXF em texto e segue pelo
pipeline de importação DXF da Planta. Só exige login: não lê nem grava nada no
banco.

## Serviços externos usados pelas funções

| Serviço | Para quê |
|---|---|
| Asaas | cobranças, PIX, saque, conta de pagamento |
| Resend (`api.resend.com`) | envio de e-mail (alertas, convites, relatórios, cobrança) |
| Anthropic (`api.anthropic.com`) | IA (narrativa de BI, geração de documento, Planta IA, leitura de documentos) |
| ZapSign | assinatura eletrônica de contratos |
| OpenTopoData / Copernicus | elevação de terreno para topografia |
| ViaCEP / BrasilAPI / Photon | CEP e geocodificação |
| IMAP (caixas da organização) | captura de boletos por e-mail |

## Código compartilhado (`_shared/`)

- `auth.ts` — autorização (acima).
- `asaas*.ts` — conta, disparo, confirmação e processamento de eventos Asaas,
  reaproveitados por webhook e pelo sync de fallback.
- `certificadoA1.ts` — leitura do certificado digital.
- `imapCaptura.ts` — leitura de caixas IMAP.
- `pixFavorecido.ts`, `origemDoLancamento.ts`, `html.ts` — utilitários.

## Ao criar uma função nova

1. Escolha o modo de autenticação e use o helper de `_shared/auth.ts`; nunca
   confie em `organization_id` do corpo sem `exigirMembro`.
2. Chamada pelo cron → `chamadaDeCron`, `verify_jwt = false` no
   `config.toml`, migration de `cron.schedule` com `fn_cron_secret()`.
3. Depois do deploy, prove o 401 sem header contra a URL publicada.
4. Se a função passa de 20 s, chame-a pelo cliente global (que já espera 150 s)
   ou com corte próprio.
