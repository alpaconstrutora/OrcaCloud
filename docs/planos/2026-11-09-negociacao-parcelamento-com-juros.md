# Parcelamento com juros em Gerenciar Negociação — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans. Passos com checkbox (`- [ ]`).

## Pedido original

> "aonde em Gerenciar Negociação é possivel aplicar parcelamento com juros ?"
>
> (resposta: em lugar nenhum — o "Montar plano" divide total ÷ nº; o único campo de juros,
> Vendas › Planos de vendas › "Juros a.m. (%)", é gravado e nunca lido)
>
> "prepare plano"
>
> Sessão: 74a4f583-b6f9-494f-858d-4ead7c338cb7 · 09/11/2026

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 09/11/2026 | Sistema de amortização | **Price e SAC** (o usuário escolhe) |
| 09/11/2026 | Valor da venda com juros | **Total com juros**: Valor Total do Contrato = entrada + Σ parcelas com juros, e o contrato nasce com esse valor |
| 09/11/2026 | Juros na carência (1º vencimento > 1 período após a Data Efetiva) | **Desde a Data Efetiva**: a carência é capitalizada antes de calcular a parcela |
| 09/11/2026 | Juros separados no Financeiro | **Sim, nesta entrega** |
| 09/11/2026 | Comissão do corretor | **Sobre o preço** (soma das unidades), como hoje — NÃO sobre os juros |
| 09/11/2026 | Forma dos juros em Contas a Receber | **1 título por parcela, juros destacado**; DRE e Balancete separam a parte de juros em Receita Financeira |

**Goal:** o "Montar plano" da aba Financeiro de Gerenciar Negociação (venda) calcula parcelas com
juros (Price ou SAC); cada parcela leva sua parte de juros até Contas a Receber, e a DRE/Balancete
mostram essa parte como Receita Financeira.

**Architecture:** motor puro novo (`utils/jurosParcelamento.ts`) gera os blocos já no formato de
`montarPlanoRapido`, com `interest`/`principal` por linha. A decomposição viaja
`custom_installments` → `payment_schedule` → `internal_transactions.interest_amount`. Uma view
`v_internal_transactions_dre` "explode" cada título com juros em duas linhas (principal na
categoria do título, juros na categoria do título de juros) e as 5 funções de DRE/Balancete passam
a ler dela.

**Tech Stack:** React 19 + TS, Vitest, Supabase (Postgres, SQL aplicado com
`npx supabase db query --linked -f`, NUNCA `db push`).

**Spec:** este arquivo (decisões acima) + resposta da sessão sobre onde não há juros hoje.

## Global Constraints

- Só **venda** (`formData.type === 'SALE'`). Locação não ganha juros.
- Juros 0 ou vazio ⇒ comportamento idêntico ao de hoje (`montarPlanoRapido`), sem colunas novas preenchidas.
- Taxa informada **ao mês**; periodicidade de k meses usa `r = (1 + i)^k − 1`.
- Entrada não tem juros e vence na Data Efetiva (`formData.date`), como hoje.
- Base dos juros = **preço sem juros − entrada**; preço sem juros fica gravado em `commercial_deals.price_before_interest` para que remontar o plano não aplique juros sobre juros.
- Centavos: parcela arredondada a 2 casas; a **última** parcela absorve a sobra; **Σ principal = base exatamente**; **Σ juros = Σ parcelas − base**.
- Comissão (`recalcCommission`) continua sobre `formData.value` (soma das unidades). VGV, Vendas › Análise e Tabela de Preços continuam nos preços das unidades.
- Migration: prefixo conferido com grep dos dígitos + `__tests__/migrationsPrefixo.test.ts` após cada fetch e logo antes do merge.
- Função de DRE reescrita a partir de `pg_get_functiondef` lido como UTF-8 (não do arquivo de migration antigo); `REVOKE … FROM PUBLIC, anon` mantido; view nova passa em `bash scripts/verificar-views-anon.sh`.
- Textos de tela em português; botão desligado diz o motivo (title).

## Review Focus

1. **Remontar o plano** com juros já aplicados: a base tem de ser `price_before_interest`, não o Valor Total do Contrato (que já inclui juros) — senão juros sobre juros. Teste na Task 3.
2. **Reajuste depois dos juros** (`applyReajuste` → `reajustarCronograma`, PR #275): ao multiplicar o valor da parcela, `interest`/`principal` têm de escalar junto, senão o título fica com juros > valor ou soma que não fecha. Teste na Task 4.
3. **Valor manual / bloco editado à mão**: linha com `valor_manual` ou bloco editado no Sheet perde a decomposição conhecida — a DRE não pode jogar em Receita Financeira mais do que o valor do título. Regra: `LEAST(interest_amount, amount)` na view; editar bloco à mão limpa `interest`/`principal` das linhas dele. Testes nas Tasks 3 e 5.
4. **Org sem categoria "Receita Financeira"**: o lançamento não pode falhar nem gravar juros sem categoria; grava `interest_category_id = NULL` e a view não separa (tudo fica na categoria do título) + aviso no resultado do "Lançar no Financeiro". Teste na Task 4.
5. **Baixa parcial / cancelamento**: título CANCELLED some das duas linhas da view; regime CAIXA usa `status = 'CONCILIATED'` nas duas. Teste SQL na Task 5.

---

### Task 1: Motor puro de juros (Price e SAC)

**Files:**
- Create: `utils/jurosParcelamento.ts`
- Test: `__tests__/jurosParcelamento.test.ts`

**Interfaces:**
- Consumes: `BlocoPagamento`, `somarMeses`, `mesesEntre` de `utils/paymentPlan.ts`.
- Produces:
  ```ts
  export type SistemaAmortizacao = 'PRICE' | 'SAC';
  export interface PlanoComJuros {
      precoSemJuros: number; entrada: number; parcelas: number; tipo: string;
      intervaloMeses: number; primeiroVencimento: string;
      dataBase: string;            // Data Efetiva da negociação
      taxaMensal: number;          // 1 = 1% a.m.
      sistema: SistemaAmortizacao;
  }
  export interface LinhaComJuros { vencimento: string; valor: number; juros: number; principal: number }
  export function calcularParcelasComJuros(p: PlanoComJuros): LinhaComJuros[];
  export function montarPlanoComJuros(p: PlanoComJuros):
      { entrada: number; blocos: (BlocoPagamento & { juros?: number[]; principal?: number[] })[]; totalComJuros: number; totalJuros: number };
  ```

Algoritmo (o que os testes não determinam sozinhos):
- `r = (1 + taxaMensal/100)^intervaloMeses − 1`; `m = mesesEntre(dataBase, primeiroVencimento)`;
  `baseAjustada = base × (1 + taxaMensal/100)^(m − intervaloMeses)` (carência capitalizada).
- Price: `pmt = centavos(baseAjustada × r / (1 − (1+r)^−n))`; juros da linha = `centavos(saldo × r)`; última = `saldo + juros`.
- SAC: amortização = `floor(baseAjustada/n)` em centavos; última amortiza o saldo.
- Juros da carência (`baseAjustada − base`) saem do principal das primeiras linhas e entram nos juros delas, até esgotar — assim Σ principal = base.
- `montarPlanoComJuros` agrupa linhas consecutivas de mesmo valor em um bloco (Price: N−1 + última; SAC: blocos de 1×), mantendo `juros[]`/`principal[]` por parcela dentro do bloco.

- [ ] **Step 1: testes que falham** — em `__tests__/jurosParcelamento.test.ts`:
  - `price sem carência`: base 100.000, 1% a.m., 12× mensal, dataBase `2026-11-10`, 1º venc. `2026-12-10` ⇒ linha 1 = `{ valor: 8884.88, juros: 1000, principal: 7884.88 }`, linha 12 `valor: 8884.85`, Σ valor `106618.53`, Σ principal `100000`.
  - `price com carência de 3 meses`: mesmo, 1º venc. `2027-02-10` ⇒ parcela `9063.46`, última `9063.54`, Σ valor `108761.60`, linha 1 `juros: 3030.10, principal: 6033.36`, Σ principal `100000`.
  - `price trimestral`: base 100.000, 1% a.m., 4×, intervalo 3, 1º venc. `2027-02-10` ⇒ parcela `26922.07`, linha 1 juros `3030.10`, Σ valor `107688.28`.
  - `sac`: base 120.000, 1% a.m., 12× ⇒ linha 1 `11200`, linha 12 `10100`, Σ valor `127800`, todas as linhas com `principal: 10000`.
  - `entrada`: preço 120.000, entrada 20.000, Price 1% 12× ⇒ base 100.000 (mesmos números do 1º caso) e `entrada: 20000` sem juros.
  - `montarPlanoComJuros` Price devolve 2 blocos (11× 8884.88 + 1× 8884.85), `totalComJuros = entrada + 106618.53`, `totalJuros = 6618.53`.
- [ ] **Step 2:** `npx vitest run __tests__/jurosParcelamento.test.ts` ⇒ FAIL (módulo não existe).
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** mesmo comando ⇒ 6 testes PASS.
- [ ] **Step 5:** commit `feat(negociacao): motor de parcelamento com juros Price/SAC`.

### Task 2: Colunas novas no banco

**Files:**
- Create: `supabase/migrations/aplicar_<prefixo>_negociacao_juros_parcelamento.sql` (prefixo conferido na hora; hoje o maior é `20271109900000`)
- Modify: `types/imovib.ts` (PropertyDeal), `types/financial.ts` (`PaymentInstallment`), `types/contracts.ts` (`ContractInstallment`), `types_db.ts` se as colunas forem tipadas lá

SQL (idempotente):
```sql
ALTER TABLE public.commercial_deals
  ADD COLUMN IF NOT EXISTS interest_rate_monthly numeric(7,4),
  ADD COLUMN IF NOT EXISTS amortization_system text CHECK (amortization_system IN ('PRICE','SAC')),
  ADD COLUMN IF NOT EXISTS price_before_interest numeric(14,2);
ALTER TABLE public.internal_transactions
  ADD COLUMN IF NOT EXISTS interest_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS interest_category_id uuid REFERENCES public.financial_categories(id);
```
+ `COMMENT ON COLUMN` em cada uma dizendo quem grava e quem lê.

Tipos: `PropertyDeal.interest_rate_monthly?: number | null; amortization_system?: 'PRICE' | 'SAC' | null; price_before_interest?: number | null`; `PaymentInstallment.interest?: number; principal?: number`; `ContractInstallment.interest?: number | null; principal?: number | null`.

- [ ] **Step 1:** grep dos dígitos do prefixo em `supabase/migrations` + `npx vitest run __tests__/migrationsPrefixo.test.ts` ⇒ PASS.
- [ ] **Step 2:** aplicar `npx supabase db query --linked -f <arquivo>`; conferir com `SELECT column_name FROM information_schema.columns WHERE table_name IN ('commercial_deals','internal_transactions') AND column_name IN (...)` ⇒ 5 linhas.
- [ ] **Step 3:** `npm run typecheck` ⇒ 0 erros.
- [ ] **Step 4:** commit.

### Task 3: Tela — "Montar plano" com juros

**Files:**
- Modify: `components/DealModal.tsx` (estado `planoRapido` ~l.879, `previaPlanoRapido` ~l.887, `resumoPlanoRapido`, `montarPlano` ~l.908, painel ~l.3388, `salvarBloco` ~l.940, `saldoPlano` ~l.762)
- Modify: `utils/paymentPlan.ts` — `expandirBloco` copia `juros[k]`/`principal[k]` para `interest`/`principal` da linha k; `agruparPlano` não quebra com os campos.
- Test: `__tests__/paymentPlan.test.ts` (casos novos) e `__tests__/components/dealModalJuros.test.tsx`

Comportamento:
- Painel "Montar plano de pagamento" (só venda) ganha **Juros a.m. (%)** e **Sistema** (Price / SAC; o select só aparece com juros > 0) e **Preço sem juros** (pré-preenchido com `price_before_interest ?? contract_total_value`).
- Juros pré-preenchido, ao abrir sem juros gravado, com `interest_rate_monthly` do Plano de vendas ativo do empreendimento da unidade principal **quando houver exatamente um** com juros > 0 (`salesPlanService.listActive(buildingId)`); o campo continua editável e nunca sobrescreve valor já digitado.
- Linha de resumo: `Vai gerar: entrada de R$ 20.000,00 + 12× parcelas mensais de R$ 8.884,88 (Price, 1% a.m.) — juros R$ 6.618,53, total R$ 126.618,53.`
- `montarPlano` com juros > 0: grava `interest_rate_monthly`, `amortization_system`, `price_before_interest = preço sem juros`, `contract_total_value = totalComJuros`, e as linhas com `interest`/`principal`. Com juros 0: limpa os três campos e `contract_total_value = price_before_interest` (se havia), voltando ao comportamento de hoje.
- `salvarBloco` (edição à mão): as linhas do bloco editado perdem `interest`/`principal`.
- Comissão: nenhuma mudança (continua `recalcCommission(formData.value, pct)`).

- [ ] **Step 1: testes que falham**
  - `paymentPlan.test.ts › expandirBloco leva juros e principal por parcela`: bloco Price de 2 linhas ⇒ `[{ interest: 1000, principal: 7884.88 }, …]`.
  - `dealModalJuros.test.tsx › remontar não aplica juros sobre juros`: monta Price 1% 12× sobre 100.000, monta de novo sem mudar nada ⇒ `contract_total_value` continua `106618.53`.
  - `dealModalJuros.test.tsx › juros zero volta ao plano simples`: depois de montar com juros, zera e remonta ⇒ `contract_total_value = 100000`, 12× `8333.33`/`8333.37`, sem `interest` nas linhas.
  - `dealModalJuros.test.tsx › editar bloco à mão limpa o destaque`: edita o bloco de 11× ⇒ linhas sem `interest`.
- [ ] **Step 2:** rodar os dois arquivos ⇒ FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** ⇒ PASS; `bash scripts/check-ui-standard.sh components/DealModal.tsx` ⇒ exit 0.
- [ ] **Step 5:** harness `docs/spikes/negociacao-juros/` (molde: `docs/spikes/negociacao-parcelado`) + Playwright: montar Price e SAC, ver resumo e tabela do plano, screenshot. Commit.

### Task 4: Juros até o contrato e Contas a Receber

**Files:**
- Modify: `components/DealModal.tsx` — `planoComoSchedule` (~l.1013) leva `interest`/`principal`; resultado do "Lançar no Financeiro" avisa quando a org não tem categoria Receita Financeira.
- Modify: `services/contractService.ts` — `createContractFromDeal` (~l.1706): venda com `interest_rate_monthly > 0` nasce com `original_value = contract_total_value`; `syncParceladoScheduleToFinance` (~l.463) grava `interest_amount` e `interest_category_id`; `COLUNAS_PARCELA_EXISTENTE`/`planejarSyncParcelas` comparam `interest_amount` para atualizar título não baixado.
- Modify: `services/financialCategoryResolver.ts` — `resolverCategoriaReceitaFinanceira(organizationId: string): Promise<string | null>` (categoria da org com `dre_group = 'FINANCEIRO'` e `nature = 'REVENUE'`, preferindo nome "Receita Financeira").
- Modify: `utils/reajusteParcelado.ts` — `reajustarCronograma` escala `interest` e `principal` pelo mesmo fator (Review Focus 2).
- Test: `__tests__/contractJurosParcelamento.test.ts`, caso novo em `__tests__/reajusteParcelado.test.ts`

- [ ] **Step 1: testes que falham**
  - `sync grava interest_amount e interest_category_id por parcela` (supabase.from em memória, molde `__tests__/contractReajusteParcelado.test.ts`): schedule de 2 linhas com `interest: 1000` ⇒ upsert com `interest_amount: 1000, interest_category_id: <id da Receita Financeira>`.
  - `org sem Receita Financeira grava interest_category_id null e não lança erro`.
  - `contrato de venda com juros nasce com original_value = contract_total_value` (126.618,53).
  - `reajustarCronograma escala juros e principal`: fator 1,1 sobre `{ value: 1000, interest: 200, principal: 800 }` ⇒ `{ 1100, 220, 880 }`.
- [ ] **Step 2:** ⇒ FAIL. **Step 3:** implementar. **Step 4:** ⇒ PASS + `npx vitest run __tests__/contractReajusteParcelado.test.ts __tests__/reajusteParcelado.test.ts` sem regressão.
- [ ] **Step 5:** commit.

### Task 5: DRE e Balancete separam os juros

**Files:**
- Create: `supabase/migrations/aplicar_<prefixo+1>_dre_juros_destacado.sql`
- Test: `__tests__/sql/dreJurosDestacado.sql` (script de conferência rodado com `db query --linked`) — molde dos testes SQL existentes, se houver; senão o script com `BEGIN … ROLLBACK`.

SQL:
- `CREATE VIEW public.v_internal_transactions_dre WITH (security_invoker = true) AS`
  `SELECT it.*, (it.amount - COALESCE(LEAST(it.interest_amount, it.amount), 0) * (it.interest_category_id IS NOT NULL)::int) AS amount_dre, it.category_id AS category_id_dre FROM internal_transactions it`
  `UNION ALL SELECT it.*, LEAST(it.interest_amount, it.amount), it.interest_category_id FROM internal_transactions it WHERE it.interest_category_id IS NOT NULL AND COALESCE(it.interest_amount,0) > 0;`
  (forma final livre; contrato: soma de `amount_dre` por título = `amount`). `REVOKE ALL … FROM anon`.
- `fn_dre`, `fn_dre_summary`, `fn_balancete`, `fn_dre_spe_summary`, `fn_dre_projects_summary`: corpo atual do banco (`pg_get_functiondef`, lido como UTF-8) com `FROM public.internal_transactions it` → `FROM public.v_internal_transactions_dre it`, `it.amount` → `it.amount_dre`, `fc.id = it.category_id` → `fc.id = it.category_id_dre`. Assinaturas, GRANT/REVOKE iguais.

- [ ] **Step 1:** script de conferência que falha: em transação, insere título CREDIT 8.884,88 com `interest_amount 1000` e categoria de juros; `fn_dre` ⇒ espera Receita de Venda 7.884,88 e Receita Financeira 1.000,00 (hoje dá 8.884,88 numa linha só). Mesmo título CANCELLED ⇒ some das duas; `interest_amount 9999` ⇒ Receita Financeira = 8.884,88 e venda 0.
- [ ] **Step 2:** rodar ⇒ números antigos (falha). **Step 3:** aplicar a migration. **Step 4:** script ⇒ números novos; `bash scripts/verificar-views-anon.sh` ⇒ exit 0; DRE de uma org real sem juros: total antes = total depois (consulta comparando `fn_dre` do mês corrente antes/depois, anotada no PR).
- [ ] **Step 5:** inventário de outros leitores por categoria: `git grep -n -E "from\('internal_transactions'\)|FROM public.internal_transactions" -- services supabase/migrations | grep -i -E "categor|dre|bi"` — listar no PR os que NÃO separam juros (Relatório por categoria, BI, Inteligência Financeira) como pendência, sem mexer. Commit.

### Task 6: Fechamento

- [ ] `npm run typecheck`; suíte completa com env fictício (`VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=teste npx vitest run --reporter=json`) e contagem fechando no JSON.
- [ ] PR com evidências (screenshots do harness, saída do script SQL), CI verde, merge squash, `bash scripts/conferir-producao.sh "Juros a.m."`.
- [ ] Atualizar o "Estado" abaixo e a memória do projeto.

## Estado

- [x] Task 1 — motor Price/SAC (`utils/jurosParcelamento.ts`)
- [x] Task 2 — colunas: migration `aplicar_20271110300000_negociacao_juros_parcelamento.sql` **aplicada em produção em 10/11/2026** (5 colunas conferidas; FK `ON DELETE SET NULL`). Prefixo trocado de `20271109950000`, que colidiu com `broker_portal_espelho`.
- [x] Task 3 — tela Montar plano (Juros a.m., Sistema, Preço sem juros; sugestão do Plano de vendas só em venda sem plano)
- [x] Task 4 — contrato e Contas a Receber (contrato novo **e** existente passam a valer o total com juros; zerar os juros devolve o valor sem juros)
- [x] Task 5 — DRE/Balancete: migration `aplicar_20271110300100_dre_juros_destacado.sql` **aplicada em produção em 10/11/2026**. Assinatura md5 linha a linha de `fn_dre`/`fn_balancete`/`fn_dre_summary` idêntica antes/depois (7 orgs × 2 regimes × 12 meses); Σ view = Σ tabela. Reversão: `supabase/manual/reverter_20271110300100_dre_juros_destacado.sql`.
  - [x] `scripts/teste-dre-juros-destacado.sql` (cenários com juros, INSERT dentro de BEGIN/ROLLBACK) — rodado em produção em 10/11/2026 com liberação do usuário: **40 de 40 verificações ok** (separação 7.884,88 / 1.000,00 nos dois regimes, CANCELLED, `LEAST` com 9.999, sem categoria, fn_dre_summary/balancete/SPE/obras com total inalterado). Rollback conferido: 0 títulos de 2099 depois.
- [x] Task 6 — fechamento (PR, CI, merge, conferir produção) — PR #295, merge 10e78318, produção conferida em 10/11

### Pendências conhecidas (depois do merge)

> 10/11/2026: o usuário pediu "Resolva essas pendências" — tratadas em
> `docs/planos/2026-11-10-juros-parcelamento-pendencias.md` (lista abaixo mantida como registro).

- Relatórios que agrupam por categoria fora da DRE/Balancete ainda deixam os juros na categoria da venda: `vw_fact_financial_tx` (ÒPURA, Central da Obra, `fn_bi_trend`), `vw_fpa_budget_vs_actual`, `vw_journal_entries`, `fn_fi_ledger` (Inteligência Financeira).
- Balancete: o total de "lançamentos" somado em `BalanceteReport.tsx` conta 2× cada parcela com juros (uma linha por categoria).
- SAC gera blocos de 1×: `installment_value`/`installments` da negociação ficam desatualizados no contrato.
- "Ajustar valor" no `ContractDetailView` e regerar o cronograma no `ContractModal` perdem a parte de juros sem aviso.
- Aviso "org sem Receita Financeira" sem teste de componente.

## Verificação de ponta a ponta

1. Negociação de venda, preço 120.000, entrada 20.000, Price 1% a.m., 12× mensal, Data Efetiva 10/11/2026, 1º venc. 10/12/2026 ⇒ Valor Total do Contrato 126.618,53; comissão continua sobre 120.000.
2. Lançar no Financeiro (contrato assinado) ⇒ 13 títulos em Contas a Receber; o de dez/2026 com valor 8.884,88 e juros 1.000,00.
3. Conciliar esse título ⇒ DRE (caixa) de dez/2026: Receita de Venda +7.884,88, Receita Financeira +1.000,00.
4. Aplicar reajuste de 10% no contrato ⇒ parcelas a vencer sobem 10% e o juros de cada uma também.

## Fora deste plano

- Correção monetária (INCC/IPCA) da venda: plano próprio `2026-11-09-venda-correcao-monetaria.md` (branch local `feat/venda-correcao-monetaria`). As duas convivem: o reajuste já escala juros/principal (Task 4).
- Relatórios que agrupam por categoria fora da DRE/Balancete (inventário na Task 5).
- Juros no Simulador de Proposta do Portal do Corretor (`interest_rate_monthly` do Plano de vendas continua só pré-preenchendo a negociação).
