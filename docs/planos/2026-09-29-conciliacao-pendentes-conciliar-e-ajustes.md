# Conciliação › Pendentes: botão Conciliar no dock + ajustes de diferença

## Pedido original

> financeiro < conciliacao bancaria< aba pendentes:
> 1. ao selecionar um ou mais itens em lançamento e um ou mais em extrato aparece o botão conciliar no docker.
> 2. ao selecionar mais de um tanto em extrato como em lançamento implemente botoes de ajustes de valores, saldos etc

Sessão df7b7923 · 2026-09-29

## Decisões tomadas com o usuário (2026-09-29)
| Pergunta | Resposta |
|---|---|
| Quais ajustes quando as somas diferem? | Os 4: **Diferença como ajuste**, **Baixa parcial (saldo aberto)**, **Ajustar valor do lançamento**, **Excedente vira lançamento** |
| Conciliar com somas diferentes? | **Só com diferença zero** (≤ R$ 0,01); com diferença fica desabilitado dizendo o motivo |
| Quando aparecem os ajustes? | **Sempre que houver diferença**, inclusive 1×1 |

## Contexto
Hoje a aba Pendentes (`components/BankReconciliation.tsx`) tem duas multisseleções
independentes (`selectedBankTxIds`, `selectedInternalTxIds`) e um dock inferior que só
edita em lote / gera lançamentos / ignora. Conciliar manualmente é só 1×1 (clicar numa
linha do extrato → "Vincular" num título). Não há totais nem diferença no dock.
No banco, `fn_reconcile_match` (última versão: `aplicar_20270919000022_bank_reconciled_at.sql`)
concilia 1 par por chamada, sem validar soma; ajuste de diferença existe só por par
(`p_adjustment_category`, usado por Divergências). `reconciliationGroupService.confirmBankToTitles`
é um loop de `createMatch` no cliente — não atômico.

Objetivo: selecionou dos dois lados → dock mostra **Extrato Σ · Lançamentos Σ · Diferença**,
**Conciliar (N×M)** atômico quando diferença = 0, e **Ajustar diferença** com as 4 opções.

## Onde trabalhar (REGRA #8)
Checkout de integração está 135 commits atrás e o dock mudou em `origin/main` (commit
`5f072cfb`, `loteAlvoPendentes`). → `bash scripts/nova-frente.sh conciliacao-pendentes-conciliar`
e trabalhar só lá. Primeiro commit: o plano em
`docs/planos/2026-09-29-conciliacao-pendentes-conciliar-e-ajustes.md` (este conteúdo + Estado).

## Plano (um item por arquivo; cada um com critério de pronto)

### 1. `supabase/migrations/aplicar_20270929000030_fn_reconcile_group.sql` (novo; conferir `ls` do número antes)
Nova RPC **`fn_reconcile_group(p_bank_ids uuid[], p_internal_ids uuid[], p_mode text, p_params jsonb DEFAULT '{}')`**,
`SECURITY INVOKER`, uma transação só, `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` (REGRA #7).
- Trava com `FOR UPDATE` todas as linhas; valida: ≥1 de cada lado, mesma org, **uma direção só**
  em tudo, nenhum extrato `IGNORED/MATCHED/TRANSFER`, nenhum título `CANCELLED/CONCILIATED`.
- `v_diff := Σ extrato − Σ lançamentos` (valores absolutos, mesma direção).
- Modos (`p_mode`), executados ANTES dos vínculos:
  - `EXACT` — exige `abs(v_diff) < 0.01`.
  - `ADJUSTMENT` (diferença como ajuste) — `p_params.category` obrigatória; cria título
    `MANUAL` "Ajuste de conciliação (<cat>)" no valor `abs(v_diff)`, direção pelo sinal
    (mesma regra do ajuste por par já existente), `CONCILIATED`; entra nos vínculos.
  - `EXCESS` (excedente vira lançamento) — exige extrato > lançamentos; cria título na
    **mesma direção** do grupo, valor `v_diff`, com `category`, `supplier_id`/`party_id`,
    `project_id`, `cost_center_id`, `description` de `p_params`; entra nos vínculos.
  - `PARTIAL` (baixa parcial) — exige extrato < lançamentos; `p_params.split_internal_id`
    ∈ seleção com `amount > abs(v_diff)`. Reduz o título a `amount − abs(v_diff)` e insere
    o **saldo** como clone da linha (`jsonb_populate_record`) com `id` novo, `amount = abs(v_diff)`,
    `status 'PENDING'`, `payment_date NULL`, `bank_reconciled_at NULL`, `reference_id NULL`
    (índice único `org+reference_id+entry_type`), descrição "Saldo de <desc>", mesmo vencimento.
    O saldo **não** é vinculado.
  - `ADJUST_VALUE` (ajustar valor do lançamento) — exige exatamente 1 título; grava
    `original_amount = COALESCE(original_amount, amount)` (coluna já existe) e `amount = Σ extrato`.
- Vínculos: chama `fn_reconcile_match(b, i, 'MANUAL', 100, NULL)` para cada par extrato×título
  (reaproveita payment_date = maior data do extrato, `bank_reconciled_at`, boleto pago, auditoria);
  título de ajuste criado com direção oposta é vinculado por INSERT direto (como o ajuste por par).
- Auditoria extra: `reconciliation_audit_log` evento `MATCH`, `action 'RECONCILE_GROUP'`, com
  modo, diff, ids e valores antes/depois (valor original de ADJUST_VALUE/PARTIAL).
- Retorna `{match_ids, created_ids, split_saldo_id, diff}`.
- **Antes de escrever PARTIAL/ADJUST_VALUE:** ler os syncs que regravam `amount` de títulos
  com `source_system` COMMERCIAL/LABOR/BOLETO (memória "títulos duplicados sync"). Se algum
  sobrescreve valor de linha existente, a RPC recusa esses dois modos para essa origem com
  mensagem clara (e o util do item 3 espelha o motivo).
- **Pronto quando:** aplicado via `npx supabase db query --linked -f` (nunca `db push`);
  `\df+`/ACL sem PUBLIC/anon; `npx vitest run __tests__/segurancaMigrations.test.ts` verde;
  teste manual em transação com `ROLLBACK` para cada modo (script em scratchpad) mostrando
  status/valores/vínculos esperados e erro para diferença≠0 em `EXACT`.

### 2. `services/bankReconciliationService.ts`
`reconcileGroup(bankIds, internalIds, mode, params)` → `rpc('fn_reconcile_group')`; depois,
best-effort, `processService.triggerForTransaction(id, 'internal_transaction.paid')` para cada
título conciliado (mesmo que `createMatch` faz). `reconciliationGroupService.confirmBankToTitles`
/`confirmTitleToBanks` passam a delegar para `reconcileGroup(…, 'EXACT'…)` — ganham atomicidade.
**Pronto quando:** typecheck verde e GroupMatchPanel continua conciliando grupos.

### 3. `utils/reconciliationSelection.ts` (novo, puro) + `__tests__/reconciliationSelection.test.ts`
`resumoDaSelecao(bankTxs, internalTxs)` → `{ totalExtrato, totalLancamentos, diferenca,
direcao, podeConciliar, motivoConciliar, ajustes: { ADJUSTMENT, EXCESS, PARTIAL, ADJUST_VALUE } }`,
cada ajuste com `{ habilitado, motivo }`. Motivos: "Selecione ao menos 1 de cada lado",
"Direções diferentes (entrada × saída)", "Diferença de R$ X — use um ajuste", "Extrato maior
que os lançamentos", "Só com 1 lançamento selecionado", "Nenhum título maior que a diferença" etc.
Usa os objetos **completos** da seleção (inclusive ocultos por filtro), não só os visíveis.
**Pronto quando:** testes cobrem 1×1 exato, N×M exato, tolerância 0,01, direção mista, cada
ajuste habilitado/desabilitado nos dois sinais de diferença.

### 4. `components/reconciliation/AjustarDiferencaSheet.tsx` (novo; painel lateral, REGRA #4)
Cabeçalho com Extrato Σ / Lançamentos Σ / Diferença; 4 opções (cada uma botão/cartão,
desabilitada com motivo visível — memória "botão desligado sempre diz por quê"):
- Diferença como ajuste → categoria (seletor hierárquico padrão, drawer com `parentId`).
- Excedente vira lançamento → descrição, categoria, credor/cliente, obra, centro de custo
  (mesmos seletores do `BankTxEdicaoEmLoteModal`; CC/Plano de contas no drawer padrão).
- Baixa parcial → escolher qual título desmembrar (lista dos selecionados com valor > diferença);
  prévia "fica pago R$ A · saldo aberto R$ B, venc. dd/mm".
- Ajustar valor do lançamento → prévia "R$ original → R$ novo".
Confirmar chama `reconcileGroup`; toast de sucesso/erro (`useToast` renderizado);
`useConfirm()` antes de ADJUST_VALUE/PARTIAL (alteram título).
**Pronto quando:** `bash scripts/check-ui-standard.sh` no arquivo sem achados.

### 5. `components/BankReconciliation.tsx` (dock da aba Pendentes, base `origin/main`)
Quando `bankCount>0 && internalCount>0` (e `activeView==='pending'`): o dock ganha, antes
dos botões existentes, o bloco `Extrato R$ · Lançamentos R$ · Dif. R$` (dif. verde quando 0,
âmbar senão) + **Conciliar (N×M)** (desabilitado com `title` = motivo quando diferença≠0) +
**Ajustar diferença** (só quando diferença≠0; abre o Sheet do item 4). `handleReconcileGroup`
limpa seleções, `loadTransactions()`, `loadStats()`, toast com erro real (hoje
`handleConfirmMatch` só faz `console.error`). O dock mantém `max-w-[calc(100vw_-_2rem)]`
e passa a `flex-wrap` para caber com os botões de edição em lote.
**Pronto quando:** `check-ui-standard.sh` no arquivo sem achados novos; dock cabe em 1280 px
com sidebar aberta (print).

## Reuso
- `fn_reconcile_match` (per-pair: payment_date, carimbo, boleto, auditoria) — chamado de dentro da RPC nova.
- Lógica de resíduo do ajuste por par (`aplicar_20270919000022…`) — mesma convenção de sinal.
- `BankTxEdicaoEmLoteModal` — seletores de categoria/credor/obra/CC para o modo Excedente.
- `formatMoney` de `components/ui/Format`; `useConfirm`, `useToast`.

## Verificação
1. `npx vitest run __tests__/reconciliationSelection.test.ts __tests__/segurancaMigrations.test.ts`, depois `npm run ci` (heap alto; conferir a contagem no JSON).
2. SQL de cada modo em transação com `ROLLBACK` no banco remoto (só leitura efetiva).
3. `rodar-app` (Playwright, login real) na aba Pendentes: selecionar 2 extratos + 2 títulos
   de soma igual → Conciliar aparece e concilia; somas diferentes → Conciliar desabilitado
   com motivo e Ajustar diferença abre o painel; conferir as 4 opções habilitando/desabilitando
   conforme o sinal. Escrita real só num par combinado com o usuário, e desfazer pela aba
   Conciliados (`fn_reconcile_unmatch`) conferindo o banco depois.
4. Push em `main` + `bash scripts/publicar-producao.sh` / `conferir-producao.sh "Ajustar diferença"`.

## Descobertas durante a execução (2026-09-29)

- **10 origens regravam `amount` de título já pago** (levantamento nos syncs: PROJECT,
  COMMERCIAL — inclui tributos —, PURCHASE_ORDER, CONTRACT_PARCELADO/MEASUREMENT/AVISTA/RECURRING,
  LABOR, DEBT_INSTALLMENT, BOLETO). Para essas, **Baixa parcial** e **Ajustar valor** são
  recusados (RPC `c_origens_sync` = util `ORIGENS_VALOR_SINCRONIZADO`), com o motivo na tela:
  o ajuste seria desfeito em silêncio pela próxima sincronização. Na prática, esses dois
  modos valem hoje para títulos MANUAL, NFE, PROLABORE, DIVIDENDOS, ASAAS_FEE,
  CONDOMINIO_RATEIO, ASSET_MAINTENANCE. Diferença como ajuste e Excedente valem para todos.
- **`original_amount` NÃO é usado** para guardar o valor anterior: a coluna já significa
  "bruto antes do desconto" (DealModal, `contractService.updateFinancialEntry`). O valor
  anterior fica em `reconciliation_audit_log.payload.antes`.
- O painel de grupos da Central (`GroupMatchPanel`) confirma com a folga de `findGroups`
  (máx(R$ 1, 1%)); por isso o modo EXACT aceita `tolerance_abs`/`tolerance_pct`, e
  `confirmBankToTitles`/`confirmTitleToBanks` passaram a ser atômicos sem mudar o que aceitam.
- Credor da Pendentes = fornecedores + colaboradores; o Excedente grava o nome
  (`entity_name`/`party_name`/`party_type`) e só põe `supplier_id`/`party_id` quando o
  cadastro é fornecedor/cliente (colaborador não tem FK).
- Achado paralelo, **fora do escopo** (não mexido): vários syncs apagam títulos sem poupar
  conciliados e `reconciliation_matches.internal_transaction_id` é `ON DELETE CASCADE` —
  vínculos somem em silêncio (`contractService`, `payrollService`, `debtFinanceService`).
  O comentário em `debtFinanceService.ts:439` diz RESTRICT, mas não há ALTER.

## Estado

- [x] 1. migration `aplicar_20270929000030_fn_reconcile_group.sql` — **aplicada** por
  `db query -f` em 29/09; ACL `{postgres, authenticated, service_role}` (sem PUBLIC/anon);
  13 cenários em transação desfeita (EXACT 2×2, diferença recusada, ajuste juros/desconto
  em débito e crédito, excedente, excedente invertido recusado, baixa parcial, parcial em
  COMMERCIAL recusado, ajustar valor, direção mista, folga do grupo, extrato já conciliado)
  — todos com o resultado esperado; resíduo no banco conferido = 0.
- [x] 2. `bankReconciliationService.reconcileGroup` + `reconciliationGroupService` delega (atômico).
- [x] 3. `utils/reconciliationSelection.ts` + `__tests__/reconciliationSelection.test.ts` (12 testes).
- [x] 4. `components/reconciliation/AjustarDiferencaSheet.tsx` — `check-ui-standard` sem achados.
- [x] 5. dock da aba Pendentes — totais, Conciliar (N×M), Ajustar diferença; `w-max` +
  `flex-wrap` (sem `w-max` o `fixed left-1/2` limitava o dock a meia tela e quebrava em 3
  linhas); corrigido de carona o "itemns selecionados". Visto no navegador (Playwright,
  conta de leitura, org Garden, escritas bloqueadas = 0): direção mista → Conciliar
  desligado com motivo; mesma direção com diferença → Ajustar diferença abre o painel com
  as 4 opções e os motivos. **Não visto no navegador:** o clique real em Conciliar/Ajustar
  (escrita) — coberto pelos cenários SQL.

## Verificação executada

- `npx vitest run` completo: 6.372 passaram + 33 pendentes = 6.405, 0 falhas.
- `tsc --noEmit` exit 0; `check-ui-standard.sh` nos 2 .tsx exit 0; `check-xss-sinks.sh` exit 0;
  `segurancaMigrations.test.ts` verde.

## Pedido posterior (2026-09-30)

> na aba conciliados: aplicar o toolbar acoplado a tabela + botão de ajuste de colunas

- [x] `components/reconciliation/ConciliatedTab.tsx` — toolbar acoplada (§5.2): busca
  (`usePersistedState`, sem acento, também por valor), contador "N de M vínculos", engrenagem
  de colunas (`useTableColumns` + `ColumnConfigButton`, só em modo lista) e alternância
  grade/lista, tudo no MESMO card da tabela. O título solto "Transações Conciliadas" e o
  seletor de visão fora do card saíram. Colunas configuráveis (7 + Ações fixa): a lista
  continua sendo grid CSS, com `grid-template-columns` calculado das colunas visíveis.
  Cabeçalhos curtos ("Data"/"Valor"), nomes completos só na engrenagem. Cards da grade:
  `rounded-[2rem]` → `rounded-[10px]` (§16).
  Visto no navegador (org Garden, conta de leitura, escritas bloqueadas = 0): toolbar no
  card, ocultar "Data do interno" some a coluna na hora, busca sem resultado mostra o
  estado vazio. **§6.1 (redimensionar/autofit):** decisão = não se aplica; a lista é grid
  de larguras fixas, não `<table>`. **Não feito:** arrastar coluna para reordenar.
  `tsc` 0, `check-ui-standard` 0, `check-xss-sinks` 0, suíte 6.392 + 33 pend. = 6.425, 0 falhas.
