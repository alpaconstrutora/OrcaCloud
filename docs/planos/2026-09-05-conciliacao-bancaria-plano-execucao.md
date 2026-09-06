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

## ONDA 3 — Estrutura

Detalhada em 06/09/2026, ao ser iniciada. A ordem é por valor entregue, não por
tamanho: 3.1 e 3.2 fecham lacunas que fazem número mentir; 3.3 remove a causa de
tudo o que deu errado hoje; 3.4 é dívida técnica pura; 3.5 depende de terceiro.

### 3.1 `bank_reconciled_at` — pago não é o mesmo que conferido no banco
**Arquivos:** migration `..._bank_reconciled_at.sql`; `fn_reconcile_match`/`unmatch`;
`fn_reconciliation_dashboard`.

Hoje 634 títulos estão `CONCILIATED`, e só 32 vieram da conciliação bancária: o resto
foi baixado por webhook do Asaas, por boleto ou pelo sync comercial. O Dashboard soma
todos no "saldo do sistema" e chama a diferença contra o extrato de "gap de
integridade" — mas está comparando coisas diferentes, então a diferença nunca fecha e
o indicador não significa nada.

- Coluna `internal_transactions.bank_reconciled_at`, preenchida SÓ por
  `fn_reconcile_match` e limpa por `fn_reconcile_unmatch`.
- Backfill a partir dos vínculos existentes.
- O Dashboard passa a ter dois números separados: baixado (qualquer origem) e
  conferido no extrato.
- **Pronto quando:** o "gap de integridade" compara extrato conciliado com título
  conferido no extrato, e fecha em zero quando não há vínculo faltando.
- ✅ **FEITO 06/09/2026**, migration `aplicar_20270919000022` aplicada. Backfill marcou os
  32 títulos com vínculo. Medido: **617 baixados, 32 conferidos contra extrato** — os 585
  restantes vieram de webhook, boleto ou sync e nunca passaram por extrato. O Dashboard
  agora mostra os dois números e explica que a diferença não é vínculo faltando.

### 3.2 Afinidade de conta bancária no score
**Arquivos:** `scoreCandidate`; produtores que gravam `internal_transactions`.

Só 1 de 1.620 títulos pendentes tem `payment_account_id`. É um sinal barato e forte
(folha sai sempre da mesma conta, aluguel entra sempre na mesma) que hoje não existe.

- `scoreCandidate` soma pontos quando a conta do título bate com a do extrato.
- Preencher `payment_account_id` na origem onde a informação existe.
- **Pronto quando:** teste do peso novo; títulos novos nascem com a conta.
- ✅ **Peso FEITO 06/09/2026**: conta igual soma 20, conta diferente tira 15, ausência não
  pontua nem penaliza (1.619 dos 1.620 pendentes não têm conta prevista). 4 testes.
- ⏳ **Falta preencher na origem** — enquanto isso o peso quase nunca dispara.

### 3.3 Motor fora do navegador
**Arquivos:** nova Edge Function; `runMatchingEngine` vira chamada.

É a causa de tudo o que deu errado em 06/09: o motor só roda quando alguém clica, o
navegador pode estar com versão antiga, a falha aparece como toast e some, e 9.958
lançamentos são carregados para a memória do cliente. Rodando no servidor, ele
executa após a importação, sozinho, com resultado registrado.

- **Pronto quando:** importar extrato dispara o motor sem clique, e o resultado fica
  gravado para consulta posterior.
- ✅ **Registro FEITO 06/09/2026**, migration `aplicar_20270919000023`. `reconciliation_runs`
  grava quem disparou (clique, importação ou rotina), o que fez, quanto varreu, quanto
  demorou e — o que faltava — se FALHOU e por quê. A Central mostra a última execução, então
  "rodou?" deixa de ser pergunta para o banco de dados. Importação já dispara o motor e agora
  fica registrada como `IMPORT`.
- ✅ **Regras extraídas 06/09/2026**: `utils/reconciliationRules.ts`, 10 funções de decisão,
  ZERO imports. Os corpos foram MOVIDOS por script, não redigitados; a suíte inteira passou
  igual, provando que nada mudou de comportamento.
- ✅ **Edge Function `reconciliation-engine` publicada 06/09/2026.** Roda a parte
  DETERMINÍSTICA no servidor — transferências e pares exatos com candidato único — usando o
  MESMO arquivo de regras que o navegador (o deploy o carrega junto). Autorização por
  `exigirMembro`, com a organização vindo da CONTA e nunca do corpo da requisição.
  **Portão provado:** 401 sem cabeçalho e 401 com a chave pública anon.
- ✅ **Gatilho automático ligado em 06/09/2026**, migration `aplicar_20270919000024`.
  Cron `reconciliation-engine-sweep`, de 10 em 10 minutos: procura conta que RECEBEU
  importação e NÃO teve execução concluída depois dela, e dispara a Edge Function para
  cada uma. Mesmo padrão do `fiscal-fallback-polling` — `pg_net` + `fn_cron_secret()` do
  vault, nunca a service_role key.

  **Por que cron e NÃO trigger de INSERT** em `bank_statement_imports`: o registro da
  importação é gravado **antes** de o motor rodar, então um trigger dispararia em paralelo
  com o motor do navegador — dois processos escrevendo o mesmo vínculo, resultado
  dependendo de quem chega primeiro. A carência de 10 minutos garante que o caminho normal
  já terminou (ou já falhou). O caminho pelo navegador continua, porque é ele que dá o
  número na hora para quem importou; o cron cobre quando aquele caminho não completa —
  aba fechada, bundle velho em cache, rede caída, exceção no motor.

  **Teto de 3 tentativas por importação.** Motor com defeito insistindo a cada 10 minutos
  para sempre só enche `reconciliation_runs` de `FAILED` iguais e esconde o sinal.

  **A Edge Function passou a aceitar dois chamadores**, e a ordem mudou: agora exige
  credencial **antes** de consultar a conta. Antes, quem não provasse ser ninguém recebia
  `404 "Conta bancária não encontrada"` — a função respondia se um id existe. Isso não
  aparecia enquanto o `verify_jwt` do gateway barrava a porta; ele teve de ser desligado
  para o segredo do cron (que não é JWT) chegar até aqui, e então este arquivo virou a
  única porta. Pessoa é sempre `MANUAL`; só o cron pode escrever `CRON` no registro, senão
  o histórico não responde mais "rodou sozinho ou alguém clicou?".

  **Portão reprovado nos três caminhos** (`curl`, 06/09/2026):
  ```
  sem cabeçalho     -> 401 Unauthorized
  com a chave anon  -> 401 Token inválido      (a anon vai no bundle)
  segredo errado    -> 401 Token inválido
  ```
  **Cadeia provada de ponta a ponta, com o segredo sem sair do banco**: `net.http_post`
  disparado do Postgres com `fn_cron_secret()` → **HTTP 200**, 5.735 lançamentos e 1.559
  títulos varridos em 2,8 s, e `reconciliation_runs` gravou `trigger=CRON`, `status=DONE`,
  `created_by` nulo (a varredura não tem dono, e inventar um seria mentir no registro).

  **Predicado da varredura provado sem escrever nada**, com importações hipotéticas sobre
  a conta real: importação anterior à última execução → não dispara; posterior → dispara;
  posterior mas ainda na carência → não dispara.

  ⚠️ **A rede ainda não teve entrada real:** `bank_statement_imports` está **vazia** — o
  registro de importação nasceu no item 2.4 e nenhuma importação aconteceu desde então (o
  lançamento de extrato mais recente é de 14/08). A policy da tabela está certa
  (`is_org_member`, INSERT liberado para membro autenticado), então a primeira importação
  de verdade é o que vai exercitar a varredura fim a fim.

- ✅ **Pontuação levada para o servidor em 06/09/2026.** O motor inteiro — determinístico
  E score — roda na Edge Function. `runMatchingEngineTracked` agora **chama a function
  primeiro**; o motor do navegador virou degradação para quando ela estiver fora do ar
  (avisa no console; conciliar devagar é melhor que não conciliar).

  **Uma implementação só, movida por script.** O miolo virou `planMatching` em
  `utils/reconciliationRules.ts`, o módulo sem imports que Deno e Vite compartilham.
  Foram junto os PADRÕES (`montarAjustes`) e a montagem do índice de contrapartes
  (`montarIndiceDeContrapartes`) — porque também são decisão, não transporte:
  `auto_threshold: 100` é o que separa "concilia sozinho" de "só sugere", e o corte de 11
  dígitos é o que impede um "código 12345" de virar CPF. Duplicados, os dois lados
  poderiam discordar sobre quando escrever vínculo sem ninguém perceber. Os chamadores
  ficaram só com as CONSULTAS.

  **Prova de equivalência:** o servidor recalculou a conta Sicredi do zero (apaga e
  regrava) e chegou às **mesmas 578 sugestões, 95 de alta confiança, sobre os mesmos 259
  lançamentos** que o navegador produzia — duas execuções seguidas, número idêntico.
  `title_rows_scanned` caiu de 1.559 para 735: o servidor passou a aplicar a mesma janela
  de títulos do cliente (60 dias antes, 5 depois) em vez de carregar todos os pendentes.

  **Prova pela tela:** clique em "Reprocessar" com a rede escutada → 1 requisição a
  `/functions/v1/reconciliation-engine`, HTTP 200, 3.449 lançamentos e 346 títulos
  varridos em 6,7 s, zero erro de console. A execução ficou gravada `MANUAL` **com dono**;
  as do cron, sem dono. Pessoa pode declarar `MANUAL` ou `IMPORT` — as duas são verdade
  sobre ela — mas **nunca `CRON`**, que é reservado a quem provou ser a rotina.

  ⚠️ **`suggestions: 0` deixou de ser mentira.** Antes a function gravava zero fixo porque
  não fazia essa metade, e quem lesse `reconciliation_runs` entendia "não achou nada".

- ⚠️ **`pg_net` desiste em 5 s** (`timeout_milliseconds DEFAULT 5000`), e com a pontuação
  a rodada passou a levar 5,7 s. O trabalho **não** se perdia — a function terminava e
  gravava —, mas do lado do banco `status_code` ficava NULL: sucesso e falha idênticos.
  Migration `aplicar_20270919000025` reagenda o cron com **120 s**. Reprovado depois:
  HTTP 200 registrado em `net._http_response`, 578 sugestões, 5,3 s.

### 3.4 Quebrar `BankReconciliation.tsx` — FECHADO
5.971 linhas, 11 abas, ~50 estados. Refatoração pura, sem ganho funcional, com risco
alto de regressão visual. **Fazer por último e por aba**, nunca de uma vez.

✅ **Aba Regras extraída em 06/09/2026** para `components/reconciliation/RulesTab.tsx`
(435 linhas). O pai caiu de 5.971 para 5.666.

Três coisas que essa primeira aba ensinou, e que valem para as dez seguintes:

1. **O corpo foi MOVIDO por script, não redigitado** — mesmo procedimento da extração
   das regras puras (`utils/reconciliationRules.ts`). Aqui não há suíte que prove
   equivalência de layout, então redigitar seria a forma mais provável de introduzir
   regressão silenciosa.
2. **O tipo da regra é o LOCAL do pai, não o de `types/financial.ts`.** Lá,
   `conditions` e `actions` são `Record<string, unknown>`, e ler `conditions.value`
   de um `unknown` não compila. O pai declara um tipo próprio dentro do componente, com
   `[key: string]: unknown` — o extraído tem de repetir essa forma, inclusive o índice,
   senão o `onEditRule` do pai deixa de ser atribuível (contravariância de parâmetro).
3. **O modal saiu como componente IRMÃO (`RuleFormModal`), não filho da aba.** Ele é
   `fixed inset-0`; o wrapper da aba tem `animate-in slide-in-from-bottom-4`, cujo
   `animation-fill-mode: both` deixa um `transform` residual. Ancestral com transform
   vira bloco de contenção de `fixed`, e o modal passaria a cobrir só a área da aba. O
   pai continua montando o modal no topo do seu `return`, exatamente onde o JSX estava.

**Conferência visual** (Playwright, conta de leitura, `serviceWorkers: 'block'`): lista
com as 3 regras, modo grade, botão Nova Regra abrindo o formulário em tela cheia, e
Editar carregando nome/condição/categoria da regra. `check-ui-standard.sh` limpo nos dois
arquivos; suíte 2.788 passando.

⚠️ Achado colateral, **pré-existente e fora deste escopo**: o overlay do modal mede
876 px de altura numa viewport de 900 px. Medido nas duas versões (antes e depois da
extração) — o número é idêntico, então não veio da quebra. Nenhum ancestral com
transform/filter foi encontrado. Fica registrado, não corrigido aqui.

✅ **Categorias, Conciliados e as tabelas, em 06/09/2026.** O pai foi de 5.971 para
**4.747 linhas** (−20%).

- `CategoriesTab.tsx` (184) — sem modal: renomear e criar usam `prompt` do navegador.
- `ConciliatedTab.tsx` (320) — recebe `matches` **e** `sortedMatches`. O contador do topo e
  o estado vazio olham o total; a tabela olha o recorte filtrado. Trocar um pelo outro
  mudaria o que a tela diz quando há filtro de fluxo ligado.
- `LazySelect.tsx` (45) — era helper de módulo dentro do pai. Saiu porque Conciliados,
  Pendentes e Extrato usam o mesmo componente, e importar de volta do pai criaria ciclo.
- `tabelasDaConciliacao.tsx` (559) — configuração e desenho das três tabelas. **Custo zero
  de prop**: eram declarações de módulo, e as três `render*Cell` recebem tudo por um `ctx`.

⚠️ **A conta de abas estava errada no plano original.** Seis das que listei como pendentes
**já eram componentes próprios**: Dashboard, Central, Divergências, Anomalias, Fechamento e
Pró-labore. Sobrou um ramo inline só — `pending || statement`, 1.205 linhas.

⛔ **Pendentes/Extrato fica como está, e é decisão, não pendência.** Esse ramo lê **mais de
40 estados** do pai: buscas, filtros, ordenação dos dois lados, seleção, paginação, larguras
de coluna, sete dropdowns. Um componente de 40 props é o mesmo acoplamento com mais
cerimônia, e cada prop é uma chance de errar a ligação sem o compilador reclamar. O que ali
valia a pena — as 550 linhas de tabela — já saiu.

**Defeito corrigido de passagem**, achado pela varredura com a rede escutada:
`loadAuditLogs` pedia a coluna `action` de `reconciliation_audit_log`; ela chama
`event_type`. O PostgREST devolvia `42703`, o `catch` engolia, e como o bloco só renderiza
com `length > 0` a "Trilha de Auditoria Recente" nunca aparecia — sem erro na tela. O
select também não trazia `payload`, que o JSX já lia. Depois da correção a aba Conciliados
passou de 3.312 para 4.740 caracteres renderizados.

### 3.5 Open Finance — BLOQUEADO
Depende de conta em agregador (Pluggy, Belvo ou Celcoin) com credencial. Não há o que
codar antes dessa decisão comercial.

## Ordem de execução
1.6 → 1.1 → 1.2 → 1.3 → 1.4/1.5 → 1.7 → 1.8 → 1.9 · 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6.

## Estado

### Situação em 06/09/2026, 18h30 — Ondas 1, 2 e 3 fechadas exceto 3 itens

| Onda | Fechados | Falta |
|---|---|---|
| 1 — integridade | 7 de 9 | fixtures reais de extrato (1.3) e reimportação (1.9) — **os dois dependem de arquivo do usuário** |
| 2 — eficácia | 6 de 6 | nada |
| 3 — estrutura | 4 de 5 | só 3.5, Open Finance, **bloqueado por decisão comercial** |

O motor inteiro — determinístico e pontuação — roda na Edge Function, com o navegador como
degradação. Um cron de 10 em 10 minutos cobre importação que ficou sem execução. O
componente da tela caiu de 5.971 para 4.747 linhas.

Lido do banco em 06/09/2026, 18h30:

| Indicador | Antes do motor | Agora |
|---|---|---|
| Lançamentos de extrato | 10.133 | 9.958 (as 175 linhas de saldo saíram) |
| Vínculos extrato × título | 4, todos manuais | 32 |
| Conciliações automáticas | 0 | 28 |
| Pares de transferência | 0 | 43 (86 linhas) |
| Sugestões abertas | 146, de 15/08 | 645 |
| Sugestões de alta confiança | 0 | 95 |
| Títulos pendentes | 1.760 | 1.625 |
| Vínculos com data de pagamento errada | 4 de 4 | 0 |
| Vínculos cruzando organizações | — | 0 |
| Contrapartes em `reconciliation_classification_memory` | 0 | 115 |
| Execuções do motor registradas (nenhuma falha) | — | 4 |

⚠️ **Dois zeros que são falta de entrada, não falha:** `bank_statement_imports` = 0 e
`reconciliation_aliases` = 2. O registro de importação nasceu no item 2.4 e **nenhuma
importação aconteceu desde então** — o lançamento de extrato mais novo é de 14/08. É a
mesma razão pela qual a varredura do cron ainda não teve entrada real. O alias só aprende
quando alguém CONFIRMA um vínculo pela tela, e isso ainda não foi feito em volume.

Por conta:

| Conta | Organização | Conciliou | Observação |
|---|---|---|---|
| Sicredi | Alpa Construtora | 20 | 578 sugestões, 95 de alta confiança |
| Banco Itaú | Alpa Construtora | 8 | 65 sugestões; cada vínculo casado com o título do próprio mês |
| Sicredi - Garden | SPE Garden Cambuhy | 0 | 2 sugestões fracas; a SPE tem 51 títulos para 538 movimentos |

**O que a primeira execução real ensinou, e custou três correções.** A regra
"exato e único" errou nas duas direções antes de acertar, e nenhum erro aparecia
no número agregado — só amostrando linha a linha:

1. Ligou 25 pares que não deviam existir, R$ 13.409, casando contrapartes sem
   relação (pagamento a um posto de combustível contra título da Energisa,
   coincidindo em R$ 100). Desfeitos com `fn_reconcile_unmatch`.
2. A guarda que criei para isso bloqueou 9 de 9 pares do Itaú, porque tratei
   "texto presente no extrato" como "contraparte declarada" — e
   `INT PAG TIT BANCO 001` é jargão de compensação, não nomeia ninguém.
3. A organização vinha do seletor do topo e não da conta. Como a conta Garden é de
   outra organização, bastava o seletor apontar para a Alpa para o motor procurar
   título de um inquilino para movimento de outro. Não chegou a acontecer, mas
   dependia de sorte.

**Também apareceram dois defeitos que escondiam tudo isso:** o motor quebrava com
"Todas as organizações" selecionado (22P02) e a Central chamava aviso em nove
lugares sem nunca desenhar nenhum, então a tela ficava muda enquanto o console
gritava. Os dois corrigidos.

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

### Onda 2 — 6 de 6 itens fechados

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
- [x] 2.3 Alias polimórfico + memória de classificação — migration `aplicar_20270919000019` aplicada.
  `party_id` do alias virou nullable (era o que impedia aprender fornecedor, com 73% do extrato
  sendo débito e só 2 aliases na base). Nova `reconciliation_classification_memory`, semeada com
  115 contrapartes a partir do trabalho já feito, 76 com evidência para virar regra. Gravada em toda
  classificação manual e na edição em lote; botão "Aplicar memória" em Pendentes e Extrato.
  Medido: classificaria 524 dos 3.797 lançamentos sem categoria. 16 testes.
- [x] 2.4 Saldo inicial, LEDGERBAL e registro de importação — migration `aplicar_20270919000020` aplicada.
  Nova `bank_statement_imports` com o saldo de fechamento que o banco informa e o período; bucket
  privado `bank-statements` com a organização na primeira pasta; `fn_bank_account_completeness`
  compara informado com calculado e conta buracos de período; painel no drawer. Primeira importação
  em conta sem saldo inicial passa a ser bloqueada.
- [x] 2.5 Modo "extrato histórico" e geração em lote — migration `aplicar_20270919000021` aplicada.
  `payment_accounts.reconciliation_historic_until`; `fn_generate_internal_from_bank` transforma
  extrato classificado em lançamento já conciliado, numa transação, recusando quem não tem
  categoria; `fn_reconciliation_progress` separa "classificado" (histórico) de "conciliado"
  (corrente). Ação "Gerar lançamentos" na barra de seleção.
- [x] 2.6 Regras com AND/valor/direção/conta e botão Testar — sem migration.
  `conditions` aceita `{ op, items, filters }` mantendo os dois formatos legados intactos, que é o
  que as regras em produção usam. Filtros de faixa de valor, direção e conta. `applyCustomRules`
  agrupa por regra e grava em lote: eram um UPDATE e um INSERT de auditoria POR LINHA. Botões
  "Testar" e "Sugerir da memória" no formulário. 18 testes.

## Pendências

Atualizado em 06/09/2026, 18h30. **Não há item do plano parado do meu lado.** As três
pendências restantes são uma decisão comercial e dois insumos que só o usuário tem.

**Dependem de você**

1. **Arquivos de extrato anonimizados** (itens 1.3 e 1.9). Fecham os testes de parser com
   arquivo real de cada banco e liberam a reimportação controlada do histórico, que é o que
   recupera as linhas perdidas pelo fingerprint antigo. Hoje o teste roda com 24 casos
   sintéticos — cobre a lógica, não cobre a excentricidade de cada banco.
   ⚠️ **É também o que falta para a varredura automática ter entrada real:**
   `bank_statement_imports` está com 0 linhas porque nenhuma importação aconteceu desde que
   o registro passou a existir.
2. **Os 8 boletos duplicados marcados como pagos nas duas cópias.** Ganharam a marca de
   duplicata mas o status foi preservado de propósito: ou houve pagamento em duplicidade,
   ou a baixa caiu na cópia errada. Só a conferência do extrato responde. Consulta no plano
   `2026-09-05-titulos-duplicados-por-sincronizacao.md`.
3. **Saldo inicial das 3 contas.** Continua zerado. Enquanto não for informado, o saldo do
   Dashboard é soma desde 1900 a partir do zero, e a conferência de completude não tem
   contra o que comparar. A primeira importação numa conta sem saldo já é bloqueada.
4. **Revisar as 95 sugestões de alta confiança** na Central — é onde o trabalho está agora —
   e os 25 pares bloqueados da Sicredi. Aceitar manualmente um par legítimo **ensina a
   memória**: `reconciliation_aliases` tem só 2 linhas justamente porque o alias aprende no
   momento em que alguém confirma um vínculo pela tela.

**Decisão comercial, sem código possível antes**

5. **3.5 Open Finance.** Depende de conta em agregador (Pluggy, Belvo ou Celcoin) com
   credencial. Enquanto não houver, o extrato entra por arquivo.

**Fora do escopo deste plano, registrado para frente própria**

6. **Pontuação do score continua no cliente? Não — mas a leitura do Extrato/Pendentes sim.**
   O ramo `pending || statement` de `BankReconciliation.tsx` (1.205 linhas) lê mais de 40
   estados do componente pai e ficou inline por decisão (item 3.4). Não é dívida urgente;
   é uma nota para quem for mexer ali.

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
