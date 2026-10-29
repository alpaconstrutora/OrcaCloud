---
type: módulo
title: "Fiscal: ingestão e classificação de NF-e"
description: O pipeline de Nota Fiscal Eletrônica — upload do XML com hash SHA-256, raw_documents idempotente por chave de acesso, processing_jobs com máquina de estados processada pela Edge Function fiscal-nfe-processor (acquire_job, persistência atômica por RPC, classificação por NCM > CFOP > palavra-chave), retry com backoff exponencial até dead letter, aprovação que gera o título e tributos a pagar.
tags: [fiscal, nfe, xml, pipeline, state-machine, edge-function, dead-letter, taxes]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-03f29619ce78ac093f2a6671
    resource: repo://services/nfeService.ts
  - id: openwiki-source-e5b10d613199d2984b49ab5b
    resource: repo://services/taxPayableService.ts
  - id: openwiki-source-3fbe43c633095c3f4d91501f
    resource: repo://supabase/functions/fiscal-nfe-processor/index.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Fiscal: ingestão e classificação de NF-e

O módulo transforma XML de NF-e (SEFAZ) em notas estruturadas
(`nfe_invoices`, `nfe_invoice_items`), classifica os itens e, na aprovação,
gera o título a pagar. Telas em `components/fiscal/` (Upload, Documentos,
Jobs, Regras, Analytics, validação tributária) dentro de `FiscalModule`.
Serviço: `services/nfeService.ts`. Processador: Edge Function
`fiscal-nfe-processor`.

```
FiscalUpload ─ uploadNFe()
  1 SHA-256 do arquivo              (source_hash)
  2 Storage: bucket fiscal-documents (upsert: false)
  3 leitura rápida da chave de acesso (access_key)
  4 INSERT raw_documents             ← idempotência: access_key + source_hash
  5 INSERT processing_jobs (queued)  ← o webhook do banco chama a função
            │
            ▼
fiscal-nfe-processor (só aceita CRON_SECRET)
  acquire_job()            trava o job (FOR UPDATE SKIP LOCKED)
  access_key já em nfe_invoices? → job e documento 'duplicated'
  baixa o XML → parseNFe → contrato JSON v1
  RPC persist_nfe_transaction      ← transação atômica: extraído + nota + itens + status
  classificar itens                ← pós-persistência; falha não desfaz a nota
  erro → failed (retry com backoff) ou dead_letter
            ▲
pg_cron (fallback) ─ retry_candidates + órfãos
```

## Estados

| Job (`processing_jobs.status`) e documento (`raw_documents.processing_status`) | Significado |
|---|---|
| `queued` | criado, aguardando |
| `processing` | travado por um worker |
| `parsed` | XML lido |
| `normalized` / `completed` | persistido |
| `duplicated` | a chave de acesso já existe em `nfe_invoices` |
| `failed` | erro transitório; tem `next_retry_at` |
| `dead_letter` | desistiu; precisa de ação manual |

### Concorrência e idempotência

- **Na entrada**: `raw_documents` é única por `access_key` + `source_hash`, e
  o upload no Storage é `upsert: false`. Reenviar o mesmo arquivo não cria
  segundo documento.
- **No worker**: `acquire_job` trava a linha com `FOR UPDATE SKIP LOCKED`; dois
  workers nunca processam o mesmo job.
- **Na nota**: antes de processar, o worker confere se a chave de acesso já
  existe em `nfe_invoices` e marca `duplicated`.
- **Persistência**: a RPC `persist_nfe_transaction` grava extraído, nota, itens
  e status numa transação — ou tudo, ou nada.

### Retry e dead letter

Em erro, `retry_count + 1`. Vai direto para `dead_letter` quando:

- o erro é **de dado** (mensagem começa com `DATA_` — XML inválido, campo
  obrigatório ausente: tentar de novo não muda nada); ou
- o número de tentativas atingiu `max_retries`.

Senão fica `failed` com `next_retry_at = agora + 2^tentativas minutos`
(backoff exponencial). O **pg_cron** chama a função periodicamente sem
`record`; ela busca `retry_candidates` e jobs órfãos e processa em lotes de 10
em paralelo. Assim um webhook perdido não deixa nota parada.

Dead letter se resolve na tela de Jobs: `replayDeadLetter` (reenfileira) ou
`dismissDeadLetter` (descarta com motivo), individualmente ou em lote;
`listParsingErrors` mostra por que falhou e `getPipelineHealth` resume o
pipeline.

### Segurança do processador

A função aceita **só** chamadas com `CRON_SECRET` (`chamadaDeCron`) — tanto o
webhook do banco em `processing_jobs` quanto o cron de fallback. Até a
auditoria de 2026-09-02 ela não tinha gate nenhum, só `verify_jwt`; como aceita
`body.record` e roda com service_role, dava para injetar job forjado usando a
chave anon pública. Ver
[Edge Functions](../../integracoes/edge-functions.md).

## Classificação dos itens

`classifyItem` procura em `classification_rules` (gerenciadas em
`FiscalRules` via `createClassificationRule`/`toggleClassificationRule`), em
ordem de precedência:

1. **NCM** — pelos 4 primeiros dígitos;
2. **CFOP** — valor exato;
3. **palavra-chave** na descrição.

Roda **depois** da persistência: uma falha de classificação não desfaz a
nota.

## Aprovação e vínculo com o financeiro

`approveAndLink` transforma a nota em lançamento:

- se o **pedido de compra** escolhido (ou já vinculado à nota) já tem título
  lançado, a nota se **vincula** a ele em vez de gerar outro — gerar cobraria em
  dobro (`ERRO_PEDIDO_JA_TEM_TITULO`, `titulosDoPedido`);
- senão grava um par de partidas em `internal_transactions` com
  `source_system = 'NFE'`: débito de custo de materiais (principal) e crédito de
  fornecedores a pagar (contrapartida), com `due_date` (sem ele o título nunca
  vencia) e `purchase_order_id` (sem ele o pedido ficava invisível para "as
  parcelas do pedido" no Portal do Fornecedor).

Também existem `linkExistingTransaction` (ligar a título existente),
`createOrderFromNfe` (criar pedido a partir da nota) e `deleteNfeInvoice`.

Ver [Títulos e sincronização](../financeiro/titulos-e-sincronizacao.md).

## Tributos

- `services/taxPayableService.ts` + `TributosAPagarManager` — gestão de
  tributos a pagar. PIS/COFINS dependem do **regime tributário da empresa**
  (`companies.regime_tributario`) e das tabelas oficiais `tax_pis_rates` /
  `tax_cofins_rates` (alíquota do exercício mais recente ≤ ano). Simples/MEI
  não destacam PIS/COFINS. Tributo retido aparece como `RETIDO` e não é baixado
  em Contas a Pagar.
- `services/darfService.ts` / `utils/darf.ts` — guias DARF.
- `services/taxValidationService.ts` / `TaxValidationPanel` — validação
  tributária das notas.
- `fiscal-certificado` (Edge Function) recebe o certificado digital A1 da
  empresa (só gestor).
- Configurações: `TaxSettingsManager`, `PisRatesSettings`,
  `CofinsRatesSettings`, `InssBracketsSettings`.

## Origem histórica

O processador foi adaptado de um módulo standalone (pasta
`Módulo Fiscal & Custos/` fora do repositório): `invoices` → `nfe_invoices`,
`company_id` → `organization_id`, bucket `fiscal-documents`. A documentação
antiga desse protótipo não é fonte da verdade.
