# Juros do parcelamento — pendências depois do PR #295

## Pedido original

> Resolva essas pendências

Sessão 74a4f583, 10/11/2026, logo depois do relatório final do PR #295 (parcelamento
com juros Price/SAC na venda). "Essas pendências" são as listadas em
`docs/planos/2026-11-09-negociacao-parcelamento-com-juros.md` › "Pendências conhecidas":

1. Relatórios que agrupam por categoria fora da DRE/Balancete ainda deixam os juros na
   categoria da venda: `vw_fact_financial_tx` (ÒPURA, Central da Obra, `fn_bi_trend`),
   `vw_fpa_budget_vs_actual`, `vw_journal_entries`, `fn_fi_ledger` (Inteligência Financeira).
2. Balancete: o total de "lançamentos" conta 2× cada parcela com juros.
3. SAC: `installment_value`/`installments` da negociação ficam desatualizados no contrato.
4. "Ajustar valor"/correção no contrato e regerar o cronograma no `ContractModal` perdem a
   parte de juros sem aviso.
5. Aviso "org sem Receita Financeira" sem teste de componente.
6. (achado no relatório) "Data Prevista" do PDF da proposta sai pelo fuso UTC.

## Levantamento (produção, 10/11/2026)

| Relatório | Quem lê | Conclusão |
|---|---|---|
| `vw_fact_financial_tx` | `fn_opura_pivot`, `fn_bi_trend`, `fn_opura_entries`, `fn_opura_aging` (nada no front lê a view direto) | Separa: a view passa a ter 1 linha por PARTE (principal/juros), como a da DRE, e ganha `parte_juros` e `amount_titulo` no fim. Pivot conta títulos (`COUNT(DISTINCT id)`); aging e a lista de lançamentos continuam 1 linha por título (Central do Cliente não muda), exceto quando a lista é o detalhe de uma dimensão de CATEGORIA. |
| `vw_fpa_budget_vs_actual` | `fpaService` | Separa: o realizado lê `v_internal_transactions_dre`; a parte de juros casa a categoria pelo id. A parte principal casa como hoje (por nome). |
| `vw_journal_entries` | `diarioService` | **Não muda.** Só títulos com `journal_entry_id` entram, e em produção só 5 títulos de NF-e têm (nenhum CONTRACT_*). |
| `fn_fi_ledger` | 8 funções; 7 contam títulos (`count(*)`) | **Não muda** (linha extra quebraria as contagens). A única que agrupa por categoria, `fn_entries_without_project`, separa os juros via `v_internal_transactions_dre`. |
| `fn_balancete` | `BalanceteReport` | Ganha `n_partes_juros`; a tela desconta essas linhas no total geral. |

Regra de separação: uma só, a de `v_internal_transactions_dre` (migration
`aplicar_20271110300100`). As views/funções novas fazem `JOIN` nela por `id` em vez de
repetir o `CASE`.

## Itens

### 1. Migration `aplicar_20271110400000_juros_relatorios_por_categoria.sql`
- **Muda:** `vw_fact_financial_tx` (partes + 2 colunas no fim), `fn_opura_pivot`
  (`qtd = COUNT(DISTINCT id)`), `fn_opura_aging` (só título), `fn_opura_entries`
  (título, ou parte quando filtrado por categoria/grupo DRE/categoria-pai),
  `vw_fpa_budget_vs_actual`, `fn_entries_without_project`, `fn_balancete`
  (DROP + CREATE com `n_partes_juros`, grants reafirmados).
- **Pronto quando:** aplicada; conferência antes × depois (md5 por org) idêntica para
  pivot (todas as dimensões de categoria), `fn_bi_trend`, aging, entries, FP&A,
  balancete e entries_without_project; teste BEGIN/ROLLBACK com título de 2099 prova a
  separação em cada um. Reversão em `supabase/manual/`.
- [x] escrito · [x] aplicado (10/11, autorizado pelo usuário) · [x] conferido:
  teste ANTES 10 de 25 (separações vermelhas, invariantes verdes) → DEPOIS 25 de 25; rollback
  sem resto (0 títulos/orçamentos de teste); md5 antes × depois IDÊNTICO nas 7 orgs (fato,
  pivô em 7 dimensões, bi_trend, aging, lançamentos, sem obra, balancete, FP&A); ACL igual
  à de antes (authenticated + service_role, sem anon).

### 2. Balancete — total de lançamentos
- **Muda:** `BalanceteLine.n_partes_juros`; `BalanceteReport` total = Σ(n − n_partes_juros).
- **Pronto quando:** teste de componente com uma linha de juros mostra o total sem contar 2×.
- [x] feito — `__tests__/components/BalanceteTotalLancamentos.test.tsx` (falha no cálculo antigo: "2 lançamentos").

### 3. SAC — espelho `installments`/`installment_value`
- **Muda:** `espelhoDoPlano(blocos)` em `utils/jurosParcelamento.ts`: plano com juros ⇒
  `installments` = nº de parcelas, `installment_value` = 1ª parcela. Usado no
  `montarPlanoNoNegocio` e no `aplicarBlocos` do DealModal.
- **Pronto quando:** teste SAC 12× ⇒ 12 / valor da 1ª; Price 12× ⇒ 12 (antes 11).
- [x] feito — `__tests__/jurosParcelamento.test.ts` (o teste antigo cravava `installments = 11`).

### 4. Contrato — correção e gerador não apagam juros em silêncio
- **Muda:** `planoDeDistribuicao` mantém `interest` e recalcula `principal`;
  `planoDoGerador` recusa (motivo) quando há parcela em aberto com juros;
  `ContractModal`: com juros no cronograma, campos do gerador e "Redistribuir"
  desligados com o motivo; editar o valor de uma linha mantém os juros e recalcula o
  principal.
- **Pronto quando:** testes em `conferenciaParcelasContrato` e teste de componente do
  ContractModal.
- [x] feito — `__tests__/conferenciaParcelasContrato.test.ts` (juros + `comNovoValor`) e
  `__tests__/components/ContractModalCronogramaComJuros.test.tsx`. "Ajustar o valor do contrato"
  não precisou mudar: só grava o Original, e a sincronização relê o cronograma com os juros.

### 5. Teste do aviso "Receita Financeira"
- **Pronto quando:** teste de componente do DealModal: org sem a categoria ⇒ o aviso
  aparece no resultado do lançamento; com a categoria ⇒ não aparece.
- [x] feito — `__tests__/components/dealModalAvisoReceitaFinanceira.test.tsx` (falha sem o aviso).

### 6. PDF — "Data Prevista" sem fuso
- **Muda:** `condicoesDaProposta` formata `deal.date` (`YYYY-MM-DD`) sem `new Date`.
- **Pronto quando:** teste com `2026-12-01` ⇒ `01/12/2026` em qualquer fuso.
- [x] feito — `__tests__/propostaCondicoesJuros.test.ts` (com TZ=America/Sao_Paulo o código antigo falha 3).

## Estado

10/11/2026: itens 1–6 feitos. Migration aplicada e conferida em produção (item 1). PR #299.

### Revisão independente (10/11) — 6 achados, todos corrigidos
1. `fn_opura_entries` no detalhe "— Sem categoria-pai" devolvia o mesmo id 2× (principal e
   juros no mesmo filtro) → agora 1 linha por título com a soma das partes que passaram.
2. `planoDoGerador` só olhava títulos abertos → olha o cronograma (plano com juros ainda não
   lançado também recusa).
3. Total "N lançamentos" da ÒPURA somava `qtd` (2× nas dimensões de categoria) → o pivô
   devolve `qtd_titulos` (só parte principal; DROP + CREATE) e a tela soma essa coluna.
4. Teste do Balancete passava pelo "1.000,00" → confere a célula da coluna Lançamentos.
5. `comNovoValor` abaixo dos juros deixava `interest > value` → juros descem ao valor.
6. FP&A: JOIN com CASE trocado por dois JOINs; a fato expõe `d.organization_id` (o filtro de
   org chega aos dois ramos da view de partes).
