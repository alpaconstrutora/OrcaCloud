# Conciliação bancária — plano de execução (Ondas 1 e 2)

## Pedido original

> **Financeiro < conciliação bancária: avalie o sistema de conciliacao bancária, e promova sugestões de melhoria**
> Sessão de 05/09/2026 (Claude Code, pasta `c:\D\ORÇACLOUD`).

> **transformar em um plano de execucao**
> Mesma sessão, 05/09/2026, depois da avaliação publicada.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 05/09/2026 | Escopo do plano | **Onda 1 + Onda 2**; Onda 3 registrada como fase futura |
| 05/09/2026 | Os arquivos originais dos extratos 2019–2026 existem para reimportar? | **Sim** — reimportação controlada entra no plano (item 1.9) |
| 05/09/2026 | Remover o código de depuração WALDIR / R$ 400.000? | **Sim** — a regra cadastrada "Waldir" continua (é dado) |

## Contexto

Avaliação publicada em https://claude.ai/code/artifact/5f7123fe-a36b-4792-89ed-ed14835783c6
(memória `project_conciliacao_avaliacao_2026_09`). Estado em produção em 05/09/2026,
lido por três consultas somente-leitura (`npx supabase db query --linked`):

| Medida | Valor |
|---|---|
| Lançamentos de extrato importados (3 contas) | 10.133 |
| Conciliados com título (`MATCHED`) | 5 |
| Confirmados sem título (`CONFIRMED`) | 10 |
| Vínculos criados na história (todos `MANUAL`; `HEURISTIC` = 0) | 4 |
| Sugestões abertas (alta 0 / média 14 / baixa 132) | 146 |
| Pares exatos 1:1 disponíveis (mesmo valor, direção, ±10 dias) | 231 |
| Transferências entre contas próprias não reconhecidas | 51 |
| Títulos internos pendentes (maior org: 1.682) | 1.759 |
| Contas com saldo inicial configurado | 0 de 3 |
| Fingerprints que colidem entre lançamentos distintos (mesma conta) | 45 |
| `external_id` aleatório (`ext-`/`csv-`/`xlsx-`) | 5.226 (52%) |
| Vínculos com `payment_date` ≠ data do extrato | 4 de 4 |

Seis defeitos de integridade fazem o dado ser perdido ou mentir:

- motor lê `.limit(5000/8000)` sem paginar e o PostgREST corta em 1.000 (vê ~17% do extrato);
- fingerprint = `btoa(...).substring(0,32)` = 24 bytes de texto, colide entre lançamentos distintos e descarta o segundo como duplicata;
- 52% das linhas têm `external_id` aleatório; parser OFX grava `</MEMO>`; linhas "SALDO DO DIA" viram movimento;
- `payment_date = hoje` em vez da data do extrato;
- conciliar/desfazer = 5 escritas sem transação (já há órfãos), `created_by` nunca gravado, exclusão de extrato é hard delete;
- 0 contas com saldo inicial, `LEDGERBAL` não lido, "system_balance" soma baixas de webhook como se fossem conferidas no banco.

**Resultado esperado.** Onda 1: reimportar os extratos e as contagens por mês baterem com
os arquivos; nenhum vínculo com data divergente; nenhuma escrita parcial possível.
Onda 2: os 231 pares exatos conciliados automaticamente, 51 transferências pareadas,
sugestões de alta confiança > 0, extrato histórico com estado final "classificado".

## Regras do projeto que se aplicam

- **REGRA #1**: toda edição em `BankReconciliation.tsx`, `SmartReconciliationCenter.tsx`,
  `BankStatementImportDrawer.tsx` exige ler `docs/ui_ux_guia_unificado.md` inteiro antes
  e rodar `bash scripts/check-ui-standard.sh <arquivo>` depois, listando o checklist.
- **REGRA #5**: org via `useOrgContext`; services recebem `organizationId?: string | null`.
- **REGRA #7**: toda migration com função leva `REVOKE EXECUTE ... FROM PUBLIC, anon;
  GRANT ... TO authenticated;` literal. Prefixos a partir de **`aplicar_20270919000016`** (as três desta frente ficaram em 000013–000015 após colisão no 000010 com a frente de esquadrias)
  (último em `origin/main` em 05/09: `aplicar_20270919000009_blueprint_escada.sql`),
  únicos (`__tests__/migrationsPrefixo.test.ts`). Aplicar com
  `npx supabase db query --linked -f`, **nunca** `db push`.
- **REGRA #8**: frente isolada `C:\D\frentes\conciliacao-integridade`
  (branch `feat/conciliacao-integridade`, criada de `origin/main` f98a700 em 05/09/2026).
- Memória `feedback_reproduzir_antes_de_corrigir`: antes de cada item de dados, rodar a
  consulta de diagnóstico e guardar o número "antes" **neste arquivo**.

---

## ONDA 1 — Integridade

### 1.1 Paginação no motor e no agrupador (C1)
**Arquivos:** novo `lib/supabasePaginate.ts`; `services/bankReconciliationService.ts`
(`runMatchingEngine`); `services/reconciliationGroupService.ts` (`findGroups`);
`components/BankReconciliation.tsx` (`fetchAllPages` local → import do lib).
- Extrair `fetchAllPages` para `lib/supabasePaginate.ts`; o componente importa de lá.
- `runMatchingEngine`: `.limit(5000)`/`.limit(8000)` → `fetchAllPages` com
  `.order('transaction_date').order('id')`. Janela do lado interno derivada do extrato:
  `transaction_date` entre `min(bank) − 60d` e `max(bank) + 5d`.
- `findGroups`: mesma troca dos `.limit(2000)/.limit(4000)`.
- **Pronto quando:** teste unitário com mock devolvendo 3 páginas (1000/1000/37) prova
  que todas chegam; em produção, após "Reprocessar" na conta Sicredi,
  `SELECT count(DISTINCT bank_transaction_id) FROM reconciliation_suggestions` cobre
  lançamentos de todos os anos pendentes.

### 1.2 Fingerprint SHA-256 computável em TS e em SQL (C2, C3)
**Arquivos:** `services/bankReconciliationService.ts` (`ingestMultipleFiles`,
`generateFingerprint`); migration `aplicar_20270919000013_bank_tx_fingerprint_v2.sql`.
- Cadeia canônica: `${bank_account_id}|${transaction_date}|${amount.toFixed(2)}|${direction}|${description_raw.trim()}|${ordinal}`;
  `ordinal` = posição (1..n) entre linhas idênticas **no mesmo arquivo**.
- TS: `crypto.subtle.digest('SHA-256')` (padrão de `services/nfeService.ts`), hex 64.
- `external_id`: FITID quando existir, **NULL** quando não; `upsert(onConflict)` → `insert`.
- Migration em 4 blocos com `RAISE NOTICE` de contagem: (1) `regexp_replace(description_raw, '\s*</MEMO>', '', 'g')`;
  (2) remover linhas `^\s*SALDO (DO DIA|FINAL|ANTERIOR|INICIAL)` não MATCHED/CONFIRMED —
  listar antes, abortar se alguma for MATCHED; (3) backfill `encode(sha256(convert_to(cadeia,'UTF8')),'hex')`
  com `ordinal = row_number() OVER (PARTITION BY bank_account_id, transaction_date, amount, direction, description_raw ORDER BY created_at, id)`;
  (4) `CREATE UNIQUE INDEX bank_transactions_account_fingerprint_uq ON bank_transactions(bank_account_id, fingerprint)`.
- **Pronto quando:** teste TS com o caso real (dois PIX de R$ 16 em 28/01/2026 →
  hashes diferentes; duas linhas idênticas no mesmo arquivo → ordinal 1 e 2); vetor fixo
  TS = SQL; índice único criado em produção sem erro.

### 1.3 Parsers: OFX por tokens, CSV com `;`, filtro de saldo, conta certa (C3)
**Arquivos:** novo `services/bankStatementParsers.ts` (parsers saem do service);
fixtures em `__tests__/fixtures/extratos/` (anonimizados — o usuário fornece);
`components/BankStatementImportDrawer.tsx` (`IMPORT_RULES`).
- `parseOFX` por tokens (SGML e XML); devolve `header: { acctId, ledgerBalance, ledgerBalanceDate, dtStart, dtEnd }`.
- Conferência de conta: `ACCTID` (dígitos) termina com `payment_accounts.account_number` (dígitos); divergindo, **para**.
- `parseCSV`: delimitador (`;`, `,`, tab) + colunas por cabeçalho reaproveitando `detectColumns` do XLSX.
- Filtro `^SALDO\b|^TOTAL\b` em CSV/XLSX. `parseCNAB400`: sem `-amount` forçado; marcado "não verificado" até haver fixture.
- Remover "Arquivo original preservado" de `IMPORT_RULES` até a 2.4.
- **Pronto quando:** `npx vitest run __tests__/bankReconciliation.parsers.test.ts` passa
  nas fixtures; nenhuma descrição contém `</`; arquivo de outra conta é recusado.

### 1.4 + 1.5 RPCs transacionais: conciliar, desfazer, confirmar, ignorar (C4, C5, M3)
**Arquivos:** migration `aplicar_20270919000014_fn_reconcile.sql`;
`services/bankReconciliationService.ts` (`createMatch`, `confirmTransaction`, novos `unmatch`, `ignoreBankTransactions`);
`services/divergenceService.ts`; `services/reconciliationGroupService.ts`;
`components/BankReconciliation.tsx` (`handleUndoMatch`, exclusão de título conciliado, `handleDeleteBankTransactions`);
`types/financial.ts` (`BankTransactionStatus` + `'IGNORED'`); `fn_reconciliation_dashboard` (exclui IGNORED).
- `fn_reconcile_match(p_bank_id, p_internal_id, p_match_type, p_confidence, p_adjustment_category DEFAULT NULL)`:
  mesma org; match com `created_by = auth.uid()`; bank `MATCHED`; internal `CONCILIATED` +
  **`payment_date = bank.transaction_date`** (N:1 = max); boleto/invoice; ajuste opcional; auditoria `MATCH`.
- `fn_reconcile_unmatch(p_match_id)`: apaga; restaura os dois lados só se não restar outro vínculo; boleto/invoice; auditoria `UNMATCH`.
- `fn_reconcile_confirm(p_bank_id, p_note)`; `fn_reconcile_ignore(p_bank_ids uuid[], p_reason)` → `IGNORED`
  (substitui hard delete; sai do saldo e das pendências). Todas `SECURITY INVOKER` + REVOKE/GRANT.
- Backfill: `payment_date` dos 4 vínculos; correção dos 2 órfãos (listar e decidir com o usuário).
- **Pronto quando:** `segurancaMigrations` passa; conciliar pela Central gera match com
  `created_by`, `payment_date` = data do extrato, auditoria com `user_id`; desfazer devolve
  os dois status; falha simulada não deixa nada escrito; consulta de divergência = 0.

### 1.6 Remover código de depuração WALDIR / 400k (A5)
**Arquivos:** `services/bankReconciliationService.ts` (bloco `[DIAGNÓSTICO WALDIR]` e `console.log` do motor);
`components/BankReconciliation.tsx` (busca cirúrgica + merge).
- **Pronto quando:** `grep -rn -i waldir services components` vazio; Pendentes carrega o mesmo conjunto da consulta principal.

### 1.7 REVOKE nas 8 funções SQL do módulo (M4)
**Arquivo:** migration `aplicar_20270919000015_revoke_public_fn_reconciliation.sql`.
- **Pronto quando:** `SELECT proacl FROM pg_proc WHERE proname LIKE 'fn_reconciliation%' OR proname LIKE 'fn_%period%'` sem `anon=X` nem `=X/`.

### 1.8 Testes do motor (M2)
**Arquivos:** `__tests__/bankReconciliation.engine.test.ts`, `__tests__/bankReconciliation.fingerprint.test.ts`.
- **Pronto quando:** `npm run test` verde; cada peso do score coberto.

### 1.9 Reimportação controlada dos extratos históricos
**Arquivo:** `scripts/conciliacao-diagnostico-reimportacao.sql`.
- **Pronto quando:** por conta × mês, `count` = linhas do arquivo (menos saldo) e
  `Σcréditos − Σdébitos` = variação de saldo; inseridos na reimportação listados aqui.

---

## ONDA 2 — Eficácia

### 2.1 Regra "exato e único" (A1)
`runMatchingEngine`: candidato único, mesmo valor, ±3 dias, unicidade mútua → `fn_reconcile_match('HEURISTIC', 100)`.
Central: KPI "conciliados automaticamente nesta rodada" + Conciliados filtrado por `HEURISTIC`.
**Pronto quando:** 3 cenários em teste; em produção `matches HEURISTIC ≥ 50`.

> **Correção de rumo (05/09/2026, ao amostrar os pares reais):** dos "231 pares exatos" da
> avaliação, só **55** são exatos E únicos dos dois lados em ±3 dias. O resto é coincidência
> de valor — ex.: um PIX de R$ 600 para uma pessoa casa em valor com oito títulos
> "Fatura Contrato 005 (n) - junho de 2026" de outro fornecedor. A unicidade mútua não é
> refinamento: é a regra. O critério de pronto caiu de 180 para 50 por isso.

### 2.2 Transferência entre contas próprias (A3)
Migration `aplicar_20270919000013_bank_tx_transfer.sql` (`transfer_pair_id`, status `TRANSFER`,
`fn_reconcile_transfer`/`fn_reconcile_untransfer`); passo `pairInternalTransfers(orgId)` no motor;
dashboard/divergências tratam TRANSFER; chip "Transferência" no Extrato.
**Pronto quando:** 51 pares em `TRANSFER`; `pending_count` cai em 102.

### 2.3 Alias polimórfico + memória de classificação (A2)
Migration `aplicar_20270919000014_reconciliation_memory.sql` (`reconciliation_classification_memory`);
`learnAliasFromMatch` aprende por `(party_type, party_name)`; memória gravada em toda classificação manual
e aplicada na importação (hits ≥ 2) + botão "Aplicar memória" em Pendentes.
**Pronto quando:** classificar 1 linha de um fornecedor pré-classifica as demais; aliases > 2.

### 2.4 Saldo inicial obrigatório, LEDGERBAL e registro de importação (C6)
Migration `aplicar_20270919000015_bank_statement_imports.sql` (tabela + bucket privado `bank_statements` por org);
drawer mostra saldo informado × calculado e buraco de período; primeira importação sem
`opening_balance_date` bloqueia; dashboard por conta ganha saldo informado/diferença.
**Pronto quando:** importar OFX grava registro + arquivo; dashboard mostra diferença explicada.

### 2.5 Modo "extrato histórico" e geração em lote (A4)
Migration `aplicar_20270919000016_historic_mode_and_generate.sql`
(`payment_accounts.reconciliation_historic_until`, `fn_generate_internal_from_bank(uuid[])`);
Pendentes com toggle "mostrar histórico" e ação "Gerar lançamentos"; KPIs separados.
**Pronto quando:** 50 linhas classificadas geram 50 títulos + 50 vínculos; sem categoria são recusadas.

### 2.6 Regras com AND, valor, direção, conta, obra/CC e "Testar" (A5, A6 parcial)
`conditions` `{ op, items }` compatível com legado; `actions` + `project_id`/`cost_center_id`;
aplicação em lote (1 update por regra); botão Testar; "criar regra da memória" (hits ≥ 5).
**Pronto quando:** teste de `evaluateRule`; 3 regras × 6.000 pendentes ≤ 10 requisições.

---

## ONDA 3 — Estrutura (registrada, fora deste escopo)
Motor em Edge Function/SQL pós-importação; `bank_reconciled_at`; quebrar `BankReconciliation.tsx`
por aba com TanStack Query; `payment_account_id` na origem + afinidade de conta; Open Finance.

## Ordem de execução
1.6 → 1.1 → 1.2 → 1.3 → 1.4/1.5 → 1.7 → 1.8 → 1.9 · 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6.

## Estado

### Situação em 06/09/2026 — leitura do banco, não de memória

| Onda | Fechados | Falta |
|---|---|---|
| 1 — integridade | 7 de 9 | fixtures reais de extrato (1.3) e reimportação (1.9) |
| 2 — eficácia | 2 de 6 | 2.3 a 2.6 |
| 3 — estrutura | 0 de 5 | não iniciada |

Medido em produção agora:

| Indicador | Valor |
|---|---|
| Lançamentos de extrato | 9.958 |
| Vínculos extrato × título | 4, todos manuais |
| Conciliações automáticas | 0 |
| Transferências pareadas | 0 |
| Títulos pendentes | 1.648 |
| Títulos cancelados na limpeza de duplicados | 112 |
| Contas com saldo inicial | 0 de 3 |
| Contrapartes aprendidas | 2 |

**O gargalo é um só: o motor não foi acionado.** As regras 2.1 e 2.2 estão publicadas e
testadas, mas só rodam quando alguém clica em *Reprocessar* ou importa um extrato, porque o
motor vive no navegador. Recalculado hoje, depois da limpeza de duplicados: **55**
conciliações automáticas e **46** transferências. Os números não mudaram com a limpeza, o que
era esperado: os títulos cancelados não disputavam a janela de 3 dias.

**Bloqueio removido.** A unicidade de que a regra 2.1 depende estava corroída por títulos
duplicados. Isso foi tratado em `2026-09-05-titulos-duplicados-por-sincronizacao.md`, já
concluído e em produção. Restam 20 grupos que parecem duplicados num agrupamento por valor e
data, mas têm linha digitável distinta: são boletos legítimos e devem ficar.


### Onda 1 — 7 de 9 itens fechados (05/09/2026, em produção)

Publicado: commits `3723d07` (código) e `52f3a95` (renumeração das migrations), no ar em
`https://orcacloud.vercel.app` — provado baixando `/assets/index-Cm_hpOde.js` e achando o SHA
`52f3a95624d8` lá dentro. Migrations aplicadas à mão na ordem 000013 → 000014 → 000015.

⚠️ **Colisão de prefixo:** as três nasceram como 000010–000012 e foram aplicadas com esses
números; a frente de tipos de esquadria chegou antes ao 000010, então foram renumeradas para
**000013–000015** e cada cabeçalho avisa que já rodou. Não reaplicar a de fingerprint (apaga linhas).

- [x] 1.1 Paginação no motor e no agrupador — `lib/supabasePaginate.ts`, `runMatchingEngine` (com janela de títulos derivada do extrato), `findGroups`, componente importando do lib; teste `__tests__/supabasePaginate.test.ts` (5 casos). **Falta** a prova de campo: reprocessar a conta Sicredi e conferir que as sugestões cobrem todos os anos.
- [x] 1.2 Fingerprint SHA-256 — código + migration `aplicar_20270919000013` aplicada. Provado em produção: 10.133 → **9.958** linhas (as 175 de saldo, R$ 2.656.890,96, todas em Banco Itaú, nenhuma conciliada), **9.958** fingerprints de 64 chars, 0 `</MEMO>`, 0 linha de saldo, 0 `external_id` aleatório (5.051 agora NULL), índice único `bank_transactions_account_fingerprint_uq` criado sem erro. Teste com vetor TS = SQL (`da9188…c226`).
- [~] 1.3 Parsers — código feito (`services/bankStatementParsers.ts`: OFX por tokens SGML/XML com cabeçalho ACCTID/LEDGERBAL, CSV com delimitador detectado e colunas por nome, filtro de saldo/total, CNAB 400 sem sinal forçado; `ingestMultipleFiles` recusa conta errada e devolve `rejected`/`skipped`/`headers`; drawer e alerta da tela avisam); teste `__tests__/bankReconciliation.parsers.test.ts` (24 casos sintéticos). **Falta**: fixtures reais anonimizadas (Itaú OFX, Sicredi OFX/XLSX/CSV) — o usuário fornece.
- [x] 1.4/1.5 RPCs transacionais — migration `aplicar_20270919000014_fn_reconcile.sql` **aplicada**: as 5 funções existem com ACL `postgres/authenticated/service_role` (sem PUBLIC, sem anon). Service usa RPC (`createMatch` com ajuste opcional, `unmatch`, `ignoreBankTransactions`, `unignoreBankTransactions`); `divergenceService.reconcileWithDifference` delega o ajuste à RPC; componente: desfazer, excluir título conciliado e "ignorar" (ex-excluir extrato) via service, status `IGNORED` rotulado, botão restaurar. Provado: títulos com `payment_date` ≠ data do extrato = **0**; os 2 órfãos (1 extrato `MATCHED` de R$ 400.000 de 01/07/2025 e 1 título `CONCILIATED` de R$ 2.376,89 de 30/04/2026) **restaurados para pendente** a pedido do usuário — reaparecem em Pendentes. Órfãos agora = 0.
- [x] 1.6 Remover código WALDIR/400k — feito (service: bloco de diagnóstico e `console.log` do motor; componente: busca cirúrgica e merge)
- [x] 1.7 REVOKE nas 8 funções — migration `aplicar_20270919000015_revoke_public_fn_reconciliation.sql` **aplicada**. Antes: todas com `=X/postgres` (PUBLIC) e `anon=X`. Depois: `postgres=X authenticated=X service_role=X` nas oito, sem PUBLIC e sem anon.
- [x] 1.8 Testes do motor — `__tests__/bankReconciliation.engine.test.ts` (31 casos: cada peso do score, juros pró-rata, alias/CNPJ, regras legadas, subset-sum, afinidade de contraparte, e o caso real negativo dos 8 títulos de R$ 600). Fingerprint: 9 casos (item 1.2). Total novo: 74 testes.
- [ ] 1.9 Reimportação controlada (depende de 1.2 e 1.3 em produção)

### Onda 2 — 2 de 6 itens fechados

Publicado no commit `75f4ad1`, provado em `/assets/index-BXMCjfL8.js`. Migration
`aplicar_20270919000016_bank_tx_transfer.sql` aplicada (coluna `transfer_pair_id`,
`fn_reconcile_transfer`/`untransfer` com REVOKE, dashboard e divergências cientes de
`TRANSFER`). Suíte completa: **2.648 passando, 27 skipped**.

- [x] 2.1 Regra "exato e único" — `findExactUniquePairs` roda ANTES do score: valor exato,
  ≤3 dias e candidato único dos DOIS lados → `fn_reconcile_match('HEURISTIC', 100)`.
  Reprocessar agora relata o que fez. 11 testes.
- [x] 2.2 Transferência entre contas próprias — `pairInternalTransfers` + `findInternalTransferPairs`
  rodam antes de tudo; status `TRANSFER` com `transfer_pair_id` igual nas duas pontas; conta no
  saldo, sai das pendências/divergências/pool. 9 testes.
- [ ] 2.3 Alias polimórfico + memória de classificação
- [ ] 2.4 Saldo inicial, LEDGERBAL e registro de importação
- [ ] 2.5 Modo "extrato histórico" e geração em lote
- [ ] 2.6 Regras com AND/valor/direção/conta e botão Testar

**⏳ Falta apertar o botão.** As duas regras só rodam quando alguém clica em *Reprocessar*
(na Central ou em Regras) ou importa um extrato — o motor é do navegador. Previsão medida em
produção em 05/09/2026, somente leitura: **55** conciliações automáticas e **46** transferências
pareadas (o teto de 51 caiu para 46 porque cada movimento entra em no máximo um par). Depois de
rodar, conferir: `matches` com `match_type='HEURISTIC'` ≥ 50 e `bank_transactions` com
`status='TRANSFER'` = 92 linhas (46 pares).

## Medidas "antes" (05/09/2026, produção)
Ver tabela em Contexto. Acrescentar aqui o "depois" de cada item de dados.

- Snapshot conta × mês tirado com `scripts/conciliacao-diagnostico-reimportacao.sql` **antes** e
  **depois** da migration de fingerprint. Total: **10.133 → 9.958**. A diferença de 175 está
  distribuída em meses do **Banco Itaú** (1 a 2 linhas por mês, de 2019-04 a 2024), e são
  exatamente as linhas de saldo. Nenhuma conta perdeu movimento real. Recolher de novo depois
  da reimportação (item 1.9) e registrar aqui os meses que ganharem linhas.
- Linhas de saldo a remover pela migration 000010 (Bloco 2): 175, todas `RULE_APPLIED`,
  R$ 2.656.890,96 (ex.: Itaú 2019-05-10 "SALDO ANTERIOR" CREDIT 92.743,76).
- Pares extrato × título exatos **e únicos dos dois lados** (±3 dias): **55** — o alvo real da 2.1.
- **Achado novo (fora do escopo deste plano, registrar para frente própria):** títulos pendentes
  DUPLICADOS (mesma org, valor, direção, data e descrição): 49 grupos `COMMERCIAL`
  (R$ 29.400), 28 `BOLETO` (R$ 17.472,88), 14 `LABOR` (R$ 3.167,41). Ex.: "Fatura Contrato 005 (1)
  - junho de 2026" repetida várias vezes. O sync comercial está gerando a mesma parcela mais de
  uma vez — e isso destrói a unicidade que a conciliação automática precisa.

## Verificação
- `npm run typecheck && npm run test`; `bash scripts/check-ui-standard.sh` em cada `.tsx` tocado;
  `bash scripts/check-org-selector-guard.sh`.
- Migration: `npx supabase db query --linked -f supabase/migrations/aplicar_<prefixo>_<nome>.sql` + consulta de prova.
- Interface real: skill `rodar-app` — importar OFX, reprocessar, conciliar 1 par, desfazer, ignorar 1 linha.
- Deploy = `git push origin HEAD:main` (REGRA #8) e `bash scripts/publicar-producao.sh`.
- Relatório de cada fase diz "X de Y itens", nunca "concluída" com item aberto (REGRA #6).
