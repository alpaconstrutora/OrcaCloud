# Valor do contrato de locação desatualizado em relação à negociação

## Pedido original

Sessão de 11/08/2026. A conversa começou em outro assunto (o bloqueio do modal
"Gerar Parcelas") e chegou aqui por uma pergunta do usuário:

> como fica o valor do contrato quando aplico desconto em parcelas?

Respondi que o desconto mexe só em `commercial_deals.contract_total_value` (e
mesmo assim só se o usuário confirmar), nunca em `contracts.original_value` /
`current_value` — e levantei um risco de soma errada em cadeia de renovação.
Ofereci verificar no banco:

> sim

Verificado: o risco da cadeia de renovação **não existe hoje** (zero contratos
com `parent_contract_id`). Mas a consulta revelou outra coisa, que reportei:

> O valor do próprio contrato está desatualizado em relação à negociação — e
> não por causa de desconto. (…) É um problema separado do desconto — me diga
> se quer que eu trate.

> sim

## O problema

`contracts.original_value` de uma locação é o **valor da parcela** (o aluguel),
gravado uma única vez por `createFromDeal`. Quando a negociação ainda não tinha
`installment_value` preenchido, ele foi derivado de `value ÷ installments` — e
depois, quando alguém preencheu o valor mensal na aba Forma de Pagamento, **nada
propagou a correção para o contrato**. A reconciliação do `createFromDeal` só
faz backfill de `client_id`, `empresa_id` e `execution_address`.

Resultado (medido no banco em 11/08/2026, usuário `agente-leitura`):

| Contrato | `original_value` | Aluguel cobrado nas parcelas | Reajuste aplicado |
|---|---|---|---|
| CL-2026-001 | 1.000,00 | (sem parcelas) | não |
| CL-2026-002 | 1.300,00 | (sem parcelas) | não |
| CL-2026-003 | 1.000,00 | 1.000,00 ✓ | não |
| **CL-2026-004** | **4.346,00** | **3.000,00** ✗ | não |
| **CL-2026-005** | **38,88** | **1.100,00** ✗ | não |
| CL-2026-006 | 800,00 | 800,00 ✓ | não |

O 38,88 é `933 ÷ 24` — a conta de fallback do `createFromDeal`.

**Por que importa**: `current_value` é a base do reajuste
(`novo_valor = current_value × índice_hoje / índice_base`). CL-2026-004 e
CL-2026-005 estão com `reajuste_proximo` vencido (2021-05-25 e 2023-03-23) —
quando essa fila rodar, reajusta 38,88 em vez de 1.100,00. As parcelas já
lançadas não mudam (elas têm valor próprio), mas o aluguel "vigente" do contrato
fica errado e contamina renovação, aditivo e qualquer relatório que leia o
contrato em vez da parcela.

**Condição que torna a correção segura**: `current_value == original_value` nos
seis contratos — nenhum reajuste foi aplicado ainda, então não há valor
acumulado a destruir. Essa condição precisa ser reconfirmada na hora de rodar a
correção; se algum contrato já tiver reajuste, ele fica de fora.

## Itens

### 1. `services/contractService.ts` — propagar na geração explícita

**O que muda**: ao gerar as parcelas de um contrato de locação
(`generateRecurringInstallmentsForPeriod`), se o valor usado na geração divergir
de `original_value`/`current_value` **e o contrato não tiver reajuste aplicado**
(`current_value == original_value`), atualizar os dois no contrato e devolver o
que foi corrigido no retorno da função.

Por que aqui e não na reconciliação do `createFromDeal`: reabrir a negociação é
efeito colateral, gerar parcela é ato explícito do usuário — e é exatamente o
momento em que ele declara qual é o aluguel. Mesmo princípio de
`project_deal_installments_serie_unica`.

Guarda obrigatória: contrato COM reajuste aplicado (`current_value !=
original_value`) **não é tocado** — ali a negociação deixou de ser a autoridade.

**Como sei que terminou**: `tsc --noEmit` limpo + gerar parcelas num contrato
cujo valor diverge atualiza o contrato; num contrato com reajuste aplicado, não
atualiza.

### 2. `components/DealModal.tsx` — dizer que atualizou

**O que muda**: a mensagem de resultado da geração passa a informar quando o
valor do contrato foi corrigido ("Valor do contrato atualizado de X para Y").
Escrever no contrato sem avisar é o tipo de coisa que aparece como surpresa
depois.

**Como sei que terminou**: a frase aparece só quando houve correção.

### 3. `supabase/migrations/aplicar_20270905000016_*.sql` — corrigir os 2 existentes

**O que muda**: script de aplicação manual (padrão `aplicar_*`, ver
`docs/planos/README.md` e a trava `__tests__/migrationsPrefixo.test.ts`) que
corrige `original_value`/`current_value` das locações cujo valor diverge do
aluguel efetivamente cobrado nas parcelas, **apenas** quando
`current_value = original_value` (sem reajuste). Deriva do valor bruto das
parcelas (`original_amount`, ou `amount` quando não há desconto), não de um
número escrito à mão.

**Como sei que terminou**: o `SELECT` de conferência no fim do script devolve
zero linhas divergentes, e CL-2026-004/005 passam a 3.000,00 e 1.100,00.

**APLICADO E VERIFICADO em 11/08/2026.** O usuário rodou os blocos no SQL
Editor; o bloco 3 voltou zero linhas. Conferido em seguida pela API com o
usuário `agente-leitura`:

| Contrato | Antes | Depois |
|---|---|---|
| CL-2026-004 | 4.346,00 | **3.000,00** |
| CL-2026-005 | 38,88 | **1.100,00** |

`original_value` e `current_value` atualizados juntos; CL-2026-003/006 e os dois
sem parcelas ficaram intocados; as 156 parcelas de `CONTRACT_RECURRING` não
mudaram (as 6 com desconto seguem bruto 1.100,00 / líquido 1.000,00).

## Fora de escopo (registrado, não feito)

- **Cadeia de renovação e a soma do desconto**: `perguntarCorrigirTotalContrato`
  soma as parcelas de TODOS os contratos do negócio contra um
  `contract_total_value` que cobre só o original. Hoje não há nenhuma cadeia
  (`parent_contract_id` nulo em 100% dos contratos), então não se manifesta.
  Blindar quando a primeira renovação por contrato-filho for criada.
- **`reajuste_proximo` vencido** em CL-2026-002/004/005: a fila de reajuste está
  atrasada. Corrigir o valor-base não roda o reajuste atrasado.
