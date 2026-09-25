# Coluna Documento: resolução POR ORIGEM

## Pedido original (literal)

> estender com a mesma estrutura.

Continuação de `docs/planos/2026-09-24-condominio-coluna-documento.md`, onde a
coluna Documento nasceu resolvendo só a origem `BOLETO`.

## O levantamento que definiu o escopo

Medido em 25/09/2026 sobre os **2.053 lançamentos a DÉBITO** da base:

| origem | lançamentos | documento | veredito |
|---|---:|---|---|
| `BOLETO` | 635 | `boletos.documento_path`, bucket `boletos` | ✅ já resolvia |
| `NFE` | 3 | `nfe_invoices` → `raw_documents.file_path`, bucket `fiscal-documents` | ✅ **resolve agora** |
| `COMMERCIAL` | 1245 | minuta do contrato, via `commercial_deals` → `contracts` → `contract_document_versions`, bucket `documents` | ✅ **resolve agora** (817 acham o contrato, **274 chegam ao arquivo**) |
| `CONTRACT_*` | 59 | idem, via `contracts.id` | ✅ **resolve agora** (54 acham o contrato, 0 têm arquivo hoje) |
| `PURCHASE_ORDER` | 12 | `receipt_photo_path` | ❌ 0 de 20 pedidos têm foto, e o `reference_id` não casa com `purchase_orders.id` |
| `LABOR` · `PROLABORE` · `PROJECT` · `MANUAL` · `ASSET_MAINTENANCE` | 99 | — | ❌ não há arquivo |

`PURCHASE_ORDER` e as origens sem arquivo não foram implementadas porque
resolveriam **nada** hoje, e um link errado é pior que "—".

## A cadeia do contrato

`reference_id` aponta para **dois alvos diferentes**, e é preciso tentar os
dois:

```
COMMERCIAL          → commercial_deals.id   (817 de 1.245 casam)
CONTRACT_AVISTA     → contracts.id          (11 de 16)
CONTRACT_PARCELADO  → contracts.id          (43 de 43)
```

E o UUID aparece em **três grafias**:

```
<uuid>:p3                          contrato parcelado
<uuid>-p2020-11-15                 série de locação
tax-<uuid>-p2028-05-20-cofins      tributo sobre locação  ← prefixo ANTES do uuid
```

`originIdFromRef` (lib/receivableRef.ts) corta no primeiro `-p` ou `:`, o que
resolve as duas primeiras e **falha na terceira**, que começa com prefixo.
`uuidDaReferencia` procura o UUID **por forma**, não por posição: atende as
três e devolve `null` — em vez de um pedaço de string — quando não há UUID,
que é exatamente o que gerava `22P02` em `.in()`.

Do contrato sai o **número** (coluna Código) e a versão mais recente **com
arquivo**: há versão de minuta com `storage_path` nulo, que é registro sem
arquivo e não pode ganhar da anterior só por ter `v` maior.

⚠️ A coluna Código nasceu com 100px para o nº de boleto ("0705"). Com
"CTL-010-0003" ela passou a cortar — medido, não suposto. Foi para 135px.

## A estrutura

`resolverOrigens(linhas)` — **uma entrada por `source_system`**, devolvendo
`Map<transactionId, { codigo, documento }>`. Acrescentar uma origem é
acrescentar um ramo; cada ramo falha sozinho, e uma origem sem permissão de
leitura apaga a própria coluna, não a lista inteira.

```
OrigemResolvida  = { codigo: string | null; documento: DocumentoDeOrigem | null }
DocumentoDeOrigem = { bucket: string; path: string; nome: string }
```

**O bucket viaja junto do path.** Boleto mora em `boletos`, XML de NF-e em
`fiscal-documents`: assinar no bucket errado devolve 404, e deixar o bucket
implícito na tela espalharia essa decisão por quem apenas exibe. A tela assina
com `storageService.createSignedUrl(bucket, path, 15min)` — o assinador
genérico que já existia — no lugar do `boletoService.getDocumentoUrl`, que é
específico de boleto.

## A NF-e também ganhou código

`nfe_invoices` **não guarda o número** em coluna própria — só `access_key`. O
nNF mora em posição fixa na chave de 44 dígitos (MOC 6.0, anexo I):

```
cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
                                         └ posições 25..33
```

`numeroDaChaveNfe()` devolve `null` fora dos 44 dígitos em vez de recortar
posição nenhuma: chave truncada existe (já veio de OCR noutras telas), e um
número inventado na coluna Código é pior que a coluna vazia.

O código sai da **chave**, não do arquivo: nota sem XML ainda mostra o número.

## Prova

Playwright no servidor da frente, Bella Vista › Despesas › 06/2020.

**BOLETO** (sem interceptação, dado real):

```
🔗 documento_2307695_19_07_2020.pdf
🔗 Boleto_ALPA CONSTRUTORA E INCORPORADORA LTDA - ME (6).pdf
clique → POST object/sign/boletos/926cf626-…  →  aba com token
```

**NFE** — não há despesa NF-e num centro de custo de condomínio, então a
RESPOSTA de leitura de `internal_transactions` foi reescrita no roteiro para
apontar a primeira linha a uma nota REAL (`00bb0579-…`). As consultas a
`nfe_invoices` e `raw_documents` rodaram contra o banco de verdade; nada foi
gravado.

```
Código 1600910 · Origem NF-e
🔗 PORTOBELLO-NFe42170783475913000272550010016009101078977179_procNFe-20170713.xml
clique → POST object/sign/fiscal-documents/926cf626-…  →  aba com token
```

**CONTRATO** — mesma técnica, com uma referência real da grafia `tax-…`
(`tax-9603b5fa-…-p2022-06-05-cofins`), que é justamente a que `originIdFromRef`
não resolveria:

```
Código CTL-010-0003 · Origem Commercial
🔗 Minuta — Opura_-_CONTRATO_DE_PRESTA_O_DE_SERVICOS r1
clique → POST object/sign/documents/contract-minutas/94453c21-…  →  aba com token
células com texto cortado: 0
```

Mesma coluna, mesmo clique, **três origens e três buckets**: `boletos`,
`fiscal-documents`, `documents`.

Testes: `__tests__/condominioLancamentoCodigo.test.ts` de 20 para 38 — bucket
da NF-e é outro, nota sem XML mantém o número, chave truncada não vira número
inventado, origem sem resolvedor não consulta nada, as três grafias de
referência acham o mesmo contrato, referência sem UUID não consulta nada, e a
versão sem `storage_path` não ganha da anterior.

Portões: `tsc --noEmit` 0 · `vitest run` 5357 passaram / 0 falhas · os cinco
`check-*.sh` · `npm run build`.
