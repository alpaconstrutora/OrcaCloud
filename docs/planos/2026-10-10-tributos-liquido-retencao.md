# Tributos por parcela, valor líquido e retenção pelo cliente

## Pedido original
> em contas a receber o valor que aparece na coluna Valor, é o valor bruto sem tributos.
> 1. criar uma coluna chamada tributos e trazer o valor do tributos referente a cada parcela a receber
> 2. criar uma coluna chamada Valor líquido, onde o valor deve ser resultado do calculo (valor bruto - Valor do Tributo)
> 3. o valor líquido deve ser exibido em financeiro > conciliacao bancária, pois o valor líquido é o valor a ser efetivamente recebido pelo cliente. Porem temos critérios.
> 3.1. quando o valor do tributo é retido pelo cliente. lançar valor líquido
> 3.2 quando o tributo nao é retido pelo cliente. lançar valor bruto
> 3.3 criar campo para informar como os impostos serão retidos. Colocar em campo em comercial > locações > Gerenciar Negociação > aba financeiro
>
> Sessão: 62e7c910 · 10/10/2026

### Pedido posterior (10/10/2026)
> o contrato TL-010-0004 esta com os impostos retidos nao selecionados, ou seja, nenhum imposto foi retido pelo cliente. nesta caso o cliente deve pagar o valor integral da parcela.
> no financeiro > contas a receber existe a coluna valor com o valor da parcela (renomear para Valor Bruno), coluna valor l;iqudo (que é o valor bruno - tributos) e para nao confundir com o valor a receber do cliente,vamos criar uma nova coluna chamada valor a receber que é o valor bruto - (tributos somente quando tributos retidos pelo cliente estiverem selecionados)

Leitura: "Bruno" = bruto. CTL-010-0004 conferido no banco: sem retenção, bruto R$ 28.800,00,
tributos R$ 3.211,20, valor a receber R$ 28.800,00.
Feito: coluna Valor → **Valor bruto**; nova **Valor a receber** = campo computado
`valor_esperado` (o mesmo que a conciliação confere), carregado junto com Tributos em
`receivableService.resolveTributos`. Valor líquido inalterado.

### Pedido posterior (10/10/2026) — IRRF
> somente quando o cliente é PJ e o locador é PF, acontecerá rentencao na fonte. ou seja o cliente irá reter o valor referente ao Inmposto de renda e pagará apenas o valor líquido (valor da parcela - valor do IRRF)

Achado: o locador era sempre uma empresa (`companies`, tratada como PJ) — não havia locador PF.
Feito (migration `aplicar_20271010005100`):
- Negociação de locação ganha **Locador** (`commercial_deals.locador_client_id` → `clients`),
  cujo Tipo de pessoa decide PF/PJ; sugerido pelo "Cliente / proprietário" do imóvel quando
  não é um dos inquilinos (nunca gravado sozinho).
- **IRRF** entra em "Tributos retidos pelo cliente" (chave `irrf`). Quando algum inquilino é PJ
  e o locador é PF, a aba pede **Confirmar retenção de IRRF**; marcado fora da regra, avisa.
- `generateForDeal` gera o IRRF (só quando marcado) por parcela: tabela de `irrf_brackets`
  vigente na data + redutor 2026 da folha (`aplicarRedutorIRRF2026`, movido de
  `payrollEngine` para `lib/payrollCalc`). Nasce RETIDO → Valor a receber e conciliação pelo líquido.
- ⚠️ A fórmula do redutor é a da folha (âncora R$ 466,27 sobre a base) e pode não bater com a
  Lei 15.270/2025 — usada por decisão do usuário; confirmar com o contador.
- Anotado, sem mudar: vencimento do IRRF em `taxDueDate` é dia 25 (aluguel retido: dia 20,
  informativo — quem recolhe é o cliente); DRE classifica "IRRF" em impostos s/ receita.

### Pedido posterior (11/10/2026) — calcular só o que foi selecionado
> o app precisa calcular o que foi selecionado. Se existe campo para ser selecionado e o app desconsidera, nao precisaria ter este campo. Então corrija de forma a calcular somente o que foi selecionado (veja print)

Esclarecimento do usuário: "PIS e Cofins: São contribuições federais aplicáveis exclusivamente a
pessoas jurídicas (empresas), não incidindo sobre locações declaradas por pessoa física no CPF.
Imposto de Renda (IRPF): O aluguel recebido por pessoa física está sujeito ao Imposto de Renda,
que deve ser recolhido mensalmente pelo Carnê-Leão (se pago por outra pessoa física) ou retido na
fonte (se pago por uma empresa/PJ)".

Causa: CTL-006-012-0001 (locador ALTAIR PEREIRA DA ROSA, PF) gerava PIS/COFINS pelo regime da
empresa do imóvel, ignorando o locador. Feito: com locador PF, `generateForDeal` não gera
PIS/COFINS; na aba Financeiro as caixas PIS/COFINS ficam desligadas com o motivo. INSS inalterado.

### Pedido posterior (11/10/2026) — INSS e tabela de IRRF
> 1. locador pessoa física somente incide IRRF. INSS é um tributo aplicado apenas a pessoa Juridica
> 2. corrigir tabela

Feito: com locador PF o gerador também não gera INSS (só IRRF); caixa INSS desligada com o motivo.
Tabela `irrf_brackets` corrigida (`aplicar_20271011000200`): vigências 04/2015–04/2023 (Lei 13.149),
05/2023–01/2024 (MP 1.171), 02/2024–04/2025 (MP 1.206), 05/2025–12/2025 e 2026+ (MP 1.294);
duplicata de 2026 removida. Provado: 153 meses (04/2015–12/2027) com exatamente uma tabela.
Reversão em `public.irrf_brackets_reversao_20261011` (30 linhas antigas, NÃO apagar).
⚠️ A folha usa a mesma tabela: folhas de 2023–2025 recalculadas daqui em diante saem com os
valores corretos (diferentes dos já calculados).

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 10/10/2026 | Retenção: por tributo ou opção única? | **Por tributo** — PIS, COFINS e INSS separados |
| 10/10/2026 | Tributo retido em Tributos a Pagar? | **Fica listado como "Retido pelo cliente"** — fora de "A pagar"/"Vencidos", sem botão Pagar |
| 10/10/2026 | Onde dizer que o locador é PF? | **Tipo de pessoa do cadastro de Clientes**, com pedido de confirmação na negociação |
| 10/10/2026 | Vários inquilinos PF/PJ misturados? | **Basta um PJ** para reter |
| 10/10/2026 | Redução 2026 no IRRF do aluguel? | **Aplicar a mesma da folha** |

## Restrições que moldaram o desenho
- `internal_transactions.amount` NÃO muda: 10 origens de sync regravam o amount e a DRE
  usa o bruto (memória `project_syncs_regravam_amount_de_titulo_pago`). `original_amount`
  já significa "bruto antes de desconto".
- O motor compara só `amount`, com pré-filtro 0,90–1,01 (`planMatching`): crédito líquido
  com ~4,65% de PIS/COFINS + INSS nunca chegava a ser candidato.
- A tela da conciliação edita e regrava o título a partir de `tx.amount`
  (`handleEditInternalTx`) — por isso na TELA o amount fica bruto e o esperado vem à parte.

## Desenho
O líquido **não é gravado**: o banco calcula na hora, a partir dos tributos ligados à parcela.
- `internal_transactions.parcela_id` (tributo → parcela, FK `ON DELETE SET NULL`).
- Campos computados do PostgREST (SECURITY INVOKER, sem PUBLIC/anon):
  `tributos_da_parcela`, `tributos_retidos_da_parcela`, `valor_esperado` (= bruto − retidos).
- `commercial_deals.tributos_retidos text[]` ('pis'/'cofins'/'inss'); nulo = nada retido.
- Tributo retido nasce com `business_status = 'RETIDO'`; a view de Tributos a Pagar já
  repassa como status efetivo.

## Plano
| # | O que muda | Como sei que terminou |
|---|---|---|
| 1 | Migration `aplicar_20271010005000` (colunas, funções, backfill de `parcela_id`) | 817/817 tributos com `parcela_id`; `valor_esperado = amount` em toda parcela |
| 2 | Migration `aplicar_20271010005001` — `fn_reconcile_group` soma `valor_esperado` | diff contra `pg_get_functiondef`: só o SELECT de `v_sum_int` |
| 3 | `taxPayableService.generateForDeal`: grava `parcela_id` e `RETIDO` | tributo regerado traz os dois campos |
| 4 | `DealModal` aba Financeiro (só locação): 3 caixas PIS/COFINS/INSS | campo salva em `tributos_retidos` |
| 5 | `ContasReceberManager`: colunas Tributos e Valor líquido (pós-lista, `resolveTributos`) | colunas preenchem após a lista |
| 6 | `TributosAPagarManager`: status Retido, fora dos KPIs e da baixa | — |
| 7 | Conciliação: Edge Function, motor do navegador, grupos usam `comValorEsperado`; tela mostra o esperado (+ "bruto R$ X") e soma a seleção pelo esperado; tributo RETIDO fora dos candidatos | `__tests__/conciliacaoValorEsperado.test.ts` |
| 8 | Redeploy `reconciliation-engine --no-verify-jwt` | portão: sem header 401, anon 401 |

## Estado
- [x] Código e testes (itens 3–7) — frente `tributos-liquido-retencao`
- [ ] Migrations aplicadas no banco (itens 1–2) — aguardando OK do usuário
- [ ] Edge Function redeployada (item 8) — depois das migrations
- [ ] Publicação (push em main) — **só depois das migrations**: o código pede
      `valor_esperado`/`parcela_id`, que não existem antes delas

## Ordem de publicação (importa)
1. Migrations 005000 e 005001 (aditivas; sem retenção marcada, comportamento idêntico).
2. Edge Function (lê `valor_esperado`).
3. Push do front.

## Verificação
- Banco: `parcela_id` em 817/817; para uma parcela, `tributos_da_parcela` = soma dos seus
  tributos; `valor_esperado = amount` enquanto ninguém retém. Prova de retenção em transação
  com ROLLBACK (marcar `RETIDO`, ler `valor_esperado`).
- Testes: `conciliacaoValorEsperado`, `reconciliationSelection`, `reconciliationRules`,
  `bankReconciliation.*`, suíte inteira.
- `tsc`, `check-ui-standard.sh` nos 6 .tsx, `check-xss-sinks.sh`.
