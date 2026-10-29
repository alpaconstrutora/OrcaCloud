---
type: módulo
title: "Financeiro: boletos, Asaas/PIX e régua de cobrança"
description: "Três fluxos de dinheiro com terceiros: boletos a pagar (captura por upload ou e-mail, leitura do código de barras, status rascunho → aprovado → pago com efeito no financeiro, gatilho de baixa reversível), a integração Asaas (cobrança de recebíveis, pagamento de títulos por boleto/PIX, webhook e sync de fallback com idempotência por reivindicação) e o Dunning, a régua de lembretes por e-mail."
tags: [boletos, asaas, pix, dunning, payables, receivables, webhooks, email-capture]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-f600d2b6a4aad5bb88966463
    resource: repo://services/boletoService.ts
  - id: openwiki-source-e0e160303165f47be9646671
    resource: repo://services/dunningService.ts
  - id: openwiki-source-af2b84be3bb9e3478c32f387
    resource: repo://services/emailCaptureService.ts
  - id: openwiki-source-05f9be59d808410cd9082f8a
    resource: repo://supabase/functions/_shared/asaasDisparo.ts
  - id: openwiki-source-d84e8cfe1252a59ab1cff2aa
    resource: repo://supabase/functions/_shared/asaasProcessar.ts
  - id: openwiki-source-d205f1305b94dac4624363bf
    resource: repo://supabase/functions/asaas-charge/index.ts
  - id: openwiki-source-1e9966f10b5f2e0a905c82c9
    resource: repo://supabase/functions/dunning-notifier/index.ts
  - id: openwiki-source-e42d180beb3ffebae9417db9
    resource: repo://supabase/migrations/20270909000001_trg_boleto_baixa.sql
  - id: openwiki-source-c6a619d6a3fe226417756a9c
    resource: repo://supabase/migrations/20270909000003_trg_boleto_baixa_reversivel.sql
  - id: openwiki-source-ef3d84eab2f6336efab2d234
    resource: repo://utils/boletoStatus.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Financeiro: boletos, Asaas/PIX e régua de cobrança

## Boletos a pagar

Tela: `components/BoletoManager.tsx` (+ `components/boletos/`,
`BoletoFormModal`, `BoletoEdicaoEmLoteModal`, `BoletoLoteModal`). Serviço:
`services/boletoService.ts`. Tabela `boletos`.

### Entrada

- **Upload de PDF** (`uploadBoleto`) — o arquivo vai ao Storage com hash
  SHA-256 (`utils/boletoParser.ts` → `sha256File`) e o texto/código de barras é
  extraído no navegador (`extractFromPdfFile`, `lerCodigoDeBarrasDoPdf`;
  intercalado 2 de 5 em `utils/codigoBarrasI25.ts`). A linha digitável vem
  preferencialmente do **código de barras**, não do texto.
- **Captura por e-mail** — `services/emailCaptureService.ts` +
  Edge Functions `email-capture-accounts` (conectar, testar, reautenticar caixa
  IMAP) e `email-capture-sync` (cron a cada 15 min, só com caixa ativa). Há
  regras por remetente (padrões de preenchimento), busca por período e modo
  piloto.
- **Linha digitada à mão** — `aplicarLinhaDigitavelManual` com a decisão em
  `utils/boletoLinhaManual.ts`; `boletoComMesmaLinha` acusa duplicata na mesma
  organização.

O fornecedor é sugerido pelo CPF/CNPJ do beneficiário
(`find_supplier_in_org_by_document`); ao associar, o `supplier_id` manda sobre o
nome lido do PDF.

### Status e efeito no financeiro

`rascunho` → `revisao` → `aprovado` → `programado` → `pago`, ou `cancelado`
(rótulos em `utils/boletoStatus.ts`). Mudar o status **segue o fluxo**, não é só
rótulo — `transicoesDoBoleto(status, temLancamento)` diz o efeito de cada
mudança e se pede confirmação:

| Efeito | O que faz |
|---|---|
| `aprovar` | cria a nota (`invoices`) e o **título em Contas a Pagar** (`internal_transactions`) e o envia para a alçada |
| `pagar` | dá baixa no título |
| `estornar` | volta a rascunho apagando título e nota |
| `cancelar` | cancela título e nota; o boleto fica no histórico |
| `rotulo` | só muda o rótulo |

`programado` significa "em pagamento pela Asaas": o status muda sozinho quando
o banco confirma.

`aprovarECriarInvoice` recusa aprovar boleto **sem fornecedor, sem valor ou sem
vencimento** — sem vencimento não há competência, e o título nascia com a data
do clique (boleto de 2021 na competência do mês atual). A criação da nota é
idempotente: um `if (!invoiceId) insert` concorrente chegou a criar pares de
notas para o mesmo arquivo. Há versões em lote (`aprovarEmLote`,
`mudarStatusEmLote`, `associarEmLote`) e `moverParaOrganizacao`.

### Baixa vinda de outro lugar

A baixa pode acontecer em Contas a Pagar, na Conciliação Bancária, na
resolução de Divergências ou pela Asaas. Em vez de consertar cada chamador, o
gatilho `fn_sync_boleto_baixa` (migrations `20270909000001` e
`20270909000003_trg_boleto_baixa_reversivel`) leva boleto → `pago` e nota →
`paid` quando o título é baixado, e desfaz no estorno. Ele escreve em
`boletos`/`invoices`, nunca de volta em `internal_transactions` (sem recursão).

⚠️ "Pago" não é "conciliado": conciliação é o vínculo com o extrato, ver
[Conciliação bancária](./conciliacao-bancaria.md).

## Asaas

A Asaas é o gateway para **receber** (boleto/PIX para clientes) e **pagar**
(títulos por boleto ou PIX a partir da conta Asaas da organização). Toda chamada
passa por Edge Function — a chave da API nunca vai ao navegador. Configuração
por organização em `services/asaasConfigService.ts` (multa, juros, desconto
padrão) e conta Asaas como conta de pagamento (`asaas-conta`).

### Cobrança de recebíveis (`asaas-charge`)

Ações `emitir`, `resend` (segunda via) e `cancel`. Pontos de desenho:

- `exigirMembro` antes de tudo — até a auditoria, o `organization_id` vinha do
  corpo e um tenant emitia/cancelava cobrança de outro;
- **uma cobrança viva por recebível**: índice único parcial
  `uq_client_charges_tx_ativa` (clicar duas vezes gerava dois boletos reais);
- o cliente é resolvido pelo vínculo (`party_id`) **dentro da organização**;
- a segunda via só vai para e-mail **já cadastrado** do cliente;
- o customer Asaas é garantido **na conta usada** (cache por conta em
  `clients.asaas_customer_ids`); reenvio e cancelamento usam a conta que emitiu;
- cancelar devolve o recebível a `PREVISTO` (404 da Asaas = já removido,
  tratado como sucesso).

### Pagamento de títulos (`asaas-payment`)

Boleto e PIX de saída passam por **um único portão**
(`_shared/asaasDisparo.ts` → `avaliarDisparo`, com a regra pura
`bloqueiosDoDisparo` em `utils/asaasGovernanca.ts`). A Asaas ainda consulta o
sistema antes de liquidar um saque (`asaas-saque-validacao`).

### Eventos: webhook + sync de fallback

- `asaas-webhook` autentica pelo header `asaas-access-token`
  (`ASAAS_WEBHOOK_TOKEN`; sem o segredo configurado, recusa tudo).
- `asaas-status-sync` (cron) consulta o status e monta evento **sintético**
  para o que o webhook perdeu.
- Ambos chamam `_shared/asaasProcessar.ts` → `processarEventoAsaas`, **o único
  caminho que muda estado por evento**. A decisão mora em `utils/asaasEventos.ts`
  (puro, testado).
- **Idempotência por reivindicação**: cada transição é um `UPDATE` condicionado
  ao estado de origem com `.select('id')`; se volta vazio, outro processamento
  já fez a transição (reenvio, CONFIRMED + RECEIVED juntos) e a taxa não é
  lançada duas vezes.
- Falha de escrita **lança** → o webhook responde 500 → a Asaas reenvia. Antes
  respondia 200 com metade gravada.
- Boleto/nota com título não são tocados aqui — o gatilho de baixa cuida.
- A baixa pela Asaas também dispara o Motor de Processos (best-effort,
  idempotente pelo título), como a baixa manual faz no navegador.

## Dunning (régua de cobrança)

`services/dunningService.ts`, `components/DunningModule.tsx`, Edge Function
`dunning-notifier`. É **o** mecanismo de cobrança automática (integrações
externas anteriores, como Make.com, foram abandonadas).

- **Regras** por organização (`DunningRule`): `days_offset` (negativo = antes
  do vencimento), `trigger_hour` (BRT), canal `email`, assunto e corpo com
  variáveis `{{nome}}`, `{{valor}}`, `{{vencimento}}`, `{{descricao}}`,
  `{{projeto}}`, `{{dias_atraso}}`. `seedDefaults` cria uma régua padrão
  (ex.: lembrete 7 dias antes).
- **Eventos** (`DunningEvent`): um por título × regra, com status `sent`,
  `failed` ou `skipped` — é o histórico e a trava contra reenvio.
- O envio é por Resend. A função aceita **cron** (`chamadaDeCron`) e disparo
  **manual** (`triggerManual`, JWT do usuário restrito à organização do corpo).

## Onde olhar

| Pergunta | Arquivo |
|---|---|
| status, rótulos e transições do boleto | `utils/boletoStatus.ts` |
| aprovar / pagar / estornar / cancelar | `services/boletoService.ts` |
| leitura de PDF e código de barras | `utils/boletoParser.ts`, `utils/codigoBarrasI25.ts` |
| captura por e-mail | `services/emailCaptureService.ts`, `supabase/functions/email-capture-*`, `_shared/imapCaptura.ts` |
| cobrança Asaas | `supabase/functions/asaas-charge` |
| eventos Asaas | `supabase/functions/_shared/asaasProcessar.ts`, `utils/asaasEventos.ts` |
| régua de cobrança | `services/dunningService.ts`, `supabase/functions/dunning-notifier` |

Como o título se encaixa no resto do financeiro:
[Títulos e sincronização](./titulos-e-sincronizacao.md). Padrões de
autenticação das funções: [Edge Functions](../../integracoes/edge-functions.md).
