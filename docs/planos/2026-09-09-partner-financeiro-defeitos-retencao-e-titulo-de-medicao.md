# Portal do Parceiro › Financeiro — os dois defeitos achados na verificação

**Frente:** `parceiro-financeiro-defeitos`
**Data do pedido:** 09/09/2026

---

## Pedido original

Sessão de 09/09/2026, depois de eu publicar a aba Financeiro e reportar dois
defeitos que tinha encontrado mas não corrigido. Mensagem do usuário, literal:

> corrigir os defeitos

Os dois defeitos, como reportados a ele:

1. **Retenção tem dois cálculos que divergem.**
   `fn_contract_retention_ledger` exclui medição `Cancelada`;
   `partner_ws_financials.retention` não. Com uma medição cancelada o parceiro
   vê, no portal dele, retenção maior que a real — e maior que a que o sistema
   aceita liberar.
2. **Título gerado por medição não aparece no Financeiro do parceiro.**
   `syncMeasurementToFinance` grava `source_system='PROJECT'`; o RPC só procura
   `'CONTRACT_*'` ou `'CONTRACT_MEASUREMENT'`.

---

## O que a investigação acrescentou ao defeito 2

O diagnóstico original estava certo mas incompleto. Três coisas novas, medidas:

### a) O ramo de medição do RPC é impossível de satisfazer, não só inativo

```sql
-- internal_transactions
CREATE UNIQUE INDEX internal_transactions_org_ref_key
  ON internal_transactions (organization_id, reference_id, entry_type);
```

O RPC procura `reference_id IN (<ids de medição>)` — igualdade exata. Com o
UNIQUE acima, **uma medição só poderia ter UMA parcela**. Uma medição de R$ 1,00
num contrato de 24 parcelas gera 24 linhas; 23 delas quebrariam no índice.
Ou seja: mesmo que o produtor passasse a gravar `CONTRACT_MEASUREMENT`, escrever
o id da medição cru em `reference_id` **não funcionaria**.

A convenção que o resto do sistema já usa é composta —
`contractService` grava `${contract.id}:p${i+1}` — e o ramo de contrato do RPC
casa com `LIKE contract_id || '%'`.

### b) Não é um consumidor cego, são TRÊS

Todos assumindo o mesmo contrato que ninguém nunca honrou:

| Onde | O que faz | Estado |
|---|---|---|
| `partner_ws_financials` (SQL) | `reference_id IN (ids de medição)` | morto |
| `contractService.ts:2276` (`listContractTransactions`) | `.in('reference_id', measurementIds)` | morto |
| `contractService.ts:561` (limpeza ao virar parcelado) | `.delete().in('reference_id', measurementIds)` | morto |

Consequência do 2º: a **aba Financeiro do próprio contrato** também nunca
mostrou título de medição. O defeito é maior que o Portal do Parceiro.

### c) `addTransaction` já sabe carimbar a origem — só não o `reference_id`

```ts
source_system: sync?.sourceSystem || 'PROJECT',   // ← já é parametrizável
reference_id: newTx.id,                            // ← fixo no uuid do JSON
```

`syncMeasurementToFinance` nem passa `sourceSystem`. Falta o `referenceId`.

---

## A forma escolhida (e a que descartei)

**Descartada:** `reference_id = ${measurementId}:p${n}`. Casa com o ramo de
medição do RPC (virando prefixo), mas **quebra o "Ir para a origem" do Extrato**:
`BankReconciliation.getOriginLink` faz `refId.split(':')[0]` e navega para o
contrato — com essa forma ele receberia o id da MEDIÇÃO e não acharia contrato
nenhum.

**Escolhida:** `reference_id = ${contractId}:m${measurementId}:p${n}`.

- casa com o ramo de CONTRATO do RPC (`LIKE contract_id || '%'`), bastando somar
  `'CONTRACT_MEASUREMENT'` à lista de origens — o ramo de medição, morto e
  impossível, sai;
- `split(':')[0]` continua devolvendo o **contrato**, então o Extrato não muda;
- única por parcela → respeita o UNIQUE;
- determinística → reprocessar a mesma medição reencontra a linha em vez de
  duplicar (mesma propriedade que `20270905` deu às séries de contrato).

---

## Itens

### 1. `supabase/migrations/aplicar_20270920000009_partner_financials_medicao_e_retencao.sql`

**O que muda** — um `CREATE OR REPLACE` no **núcleo** `partner_ws_financials`
(as duas cascas o chamam; um corpo conserta os dois modos):

- **defeito 1:** `AND m.status <> 'Cancelada'` nas duas somas de
  `retention.retained` — igualando a `fn_contract_retention_ledger`;
- **defeito 2:** `'CONTRACT_MEASUREMENT'` entra na lista de `source_system` do
  ramo que casa por `reference_id LIKE contract_id || '%'`; o ramo separado de
  medição (igualdade exata, impossível pelo UNIQUE) é removido.
- REGRA #7: `REVOKE EXECUTE ... FROM PUBLIC, anon` literal no arquivo.

**Como sei que terminou** — aplicada com `db query -f`, conferida no banco:

| função | tamanho | exclui `Cancelada` | ramo morto | reconhece medição | ACL |
|---|---|---|---|---|---|
| `partner_ws_financials` | 4377 → **4201** | **true** | **false** | **true** | sem PUBLIC/anon/authenticated |
| `partner_get_financials` | 583 (inalterado) | — | — | — | authenticated |
| `partner_portal_get_financials` | 606 (inalterado) | — | — | — | anon + authenticated |

- [x] Núcleo encolheu (o ramo morto saiu) e as **duas cascas ficaram intactas** —
      nenhuma regressão de gêmea.
- [x] `npx vitest run __tests__/segurancaMigrations.test.ts` → 2 passed.
- [x] **Defeito 1 provado com números que divergiriam** (SQL em
      `2026-09-09-prova-retencao-cancelada.sql`, tudo dentro de `ROLLBACK`):
      duas medições, uma viva com R$ 25 retidos e uma Cancelada com R$ 10.

      ```
      parceiro_retido  ledger_retido  conta_antiga  batem_agora  antiga_divergia
           25.00           25.00          35.00         true          true
      ```

      A última coluna é o que dá valor à prova: sem a correção os dois números
      seriam 35 × 25.

### 2. `services/financialService.ts`

**O que muda**
- `InternalTxSyncOptions` ganha `referenceId?: string`;
- `addTransaction` usa `sync?.referenceId ?? newTx.id`;
- `syncMeasurementToFinance` passa, nos DOIS caminhos de geração (schedule e
  divisão igual), `sourceSystem: 'CONTRACT_MEASUREMENT'` e
  `referenceId: ${contract.id}:m${measurementId}:p${n}`.

**Como sei que terminou**
- [x] `__tests__/syncMeasurementToFinance.test.ts` — 7 casos, cobrindo os **dois**
      caminhos (cronograma próprio e divisão igual), que são trechos separados
      com `return` próprio: corrigir só um deixaria metade dos contratos ainda
      gerando título invisível.
- [x] `__tests__/receivableRef.test.ts` — 7 casos novos para a convenção
      (`measurementRef`/`measurementIdFromRef`), incluindo o caso da grafia `:p`
      de contrato, que `originIdFromRef` devolvia inteira até aqui.
- [x] **Portão conferido de verdade**: revertendo o produtor, 4 dos 7 casos
      falham; restaurando, 7/7 passam. Teste que não sabe falhar não é portão.

### 3. `services/contractService.ts`

**O que muda**
- `listContractTransactions`: `'CONTRACT_MEASUREMENT'` entra em
  `measurementSources` (a consulta por prefixo já pega); a segunda consulta,
  morta, sai.
- Limpeza ao virar parcelado (`:561`): `.in('reference_id', measurementIds)` vira
  `.like('reference_id', `${contract.id}%`)`.

**Como sei que terminou**
- [x] Aba Financeiro do contrato: **24 linhas "Medição #996"**, rótulo de origem
      "Medição". Antes: zero, sempre.

### 4. Verificação

- [x] `npx tsc --noEmit -p .` → exit 0.
- [x] `npm run test` → **223 arquivos / 3407 testes, 0 falhas** (baseline antes
      do diff: 222 / 3393 — os +1 arquivo e +14 testes são desta frente).
- [x] **Na tela real** (servidor novo em 3181, PID 213300 provado, ligado a
      `127.0.0.1`, `serviceWorkers:'block'`). Aprovada uma medição de teste de
      R$ 1,00 pela tela:

      | | antes da correção | depois |
      |---|---|---|
      | `source_system` gravado | `PROJECT` | **`CONTRACT_MEASUREMENT`** |
      | `reference_id` | uuid solto do JSON | **`<contrato>:m<medição>:p<n>`** |
      | linhas no payload do RPC | 24 (nenhuma de medição) | **48, sendo 24 de medição** |
      | KPI da aba | R$ 48.000,00 / 24 parcelas | **R$ 48.001,00 / 48 parcelas** |
      | aba Financeiro do contrato | 0 linhas de medição | **24** |
      | origem exibida | — | **"Medição"** |

      Zero erros de console nas duas telas.
- [x] **Baseline do banco restaurada** depois do teste: 2355 títulos, 1 medição,
      0 sobras de `CONTRACT_MEASUREMENT`, JSON do projeto de volta a 24.
      SQL em `2026-09-09-limpar-teste-medicao-996.sql` — que desta vez apaga
      **pelo `reference_id`**, não pela descrição: é a própria correção em uso.

### ⚠️ Porta ocupada por OUTRA frente — e `--strictPort` não protegeu

A primeira tentativa foi na 3178 e o `curl` deu **404**. Havia DOIS processos na
mesma porta: o meu em `0.0.0.0` e um vite de `C:\D\frentes\comparar-extrato` em
`[::1]`. No Windows `localhost` resolve `::1` primeiro, então eu estava falando
com o servidor de outra frente. `--strictPort` não impede isso — o outro
processo tinha pegado só a pilha IPv6.

**Regra que sai daí:** subir com `--host 127.0.0.1` e endereçar por
`127.0.0.1`, nunca `localhost`; e conferir `netstat` procurando **mais de uma**
linha para a porta, não só "alguém está escutando". Não mexi no servidor da
outra frente.

---

## Fora de escopo (registrado)

- **3 linhas históricas** com `source_system='PROJECT'` e descrição
  `Medição #…` na base. Não dá para religá-las: o vínculo com a medição só
  existia dentro do JSON de `projects.settings`, e a medição correspondente não
  existe mais (a base tem 1 medição, status `Pendente`). Backfill impossível,
  não tentado.
