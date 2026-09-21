# Contrato › Financeiro › Parcelado: entrada, nº de parcelas e periodicidade

## Pedido original

> comercial < venda de ativos < Pós-Obra & Garantia < aba financeiro:
> 1. Ao optar pelo forma de pagamento parcelado, nao existem campos para quantas parcelas, tipo de pagamento como entrada parcelas mensais, semestrais, trimestraris, bimestrais anuais etc etc

Sessão: ae7b7fd0-7246-4c11-934c-c6662002b7ab · 2026-09-21

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-21 | Qual tela? "Pós-Obra & Garantia" fica em Engenharia e não tem aba Financeiro. Negociação (DealModal) ou Contrato? | **Contrato (Comercial › Contratos)** — o formulário `ContractModal`, embutido na aba Financeiro do detalhe do contrato (`ContractDetailView`, seção `pagamento`). |

## Diagnóstico (reproduzido em harness, `docs/spikes/contrato-parcelado/`)

Antes de mexer, o `ContractModal` de produção foi montado embutido com as mesmas
seções da aba Financeiro e fotografado nos dois estados:

- **Contrato comum** (`is_recurring=false`) + "Parcelado": aparece só **Nº de
  Parcelas** e um cronograma **sempre mensal** (`buildSchedule` soma 1 mês por
  linha). Não há entrada (sinal), não há periodicidade.
- **Contrato recorrente** (`is_recurring=true`) + "Parcelado": aparece
  **Periodicidade** (Mensal/Bimestral/Semestral/Anual — sem Trimestral) e Dia de
  Vencimento; Nº de Parcelas não existe, por definição (cobra a vigência toda).

Além disso `buildSchedule` faz aritmética com `new Date(...)` + `setMonth`, que
transborda (31/jan + 1 mês = 03/mar) — `utils/paymentPlan.ts` já tem
`somarMeses` correto, usado pelo Plano de Pagamento da negociação.

## Plano

1. **`utils/contractInstallments.ts`** (novo) — parte pura do gerador do
   cronograma de contrato parcelado: `gerarCronogramaContrato({ total, entrada,
   vencimentoEntrada, parcelas, intervaloMeses, primeiroVencimento })` →
   `ContractInstallment[]` (linha de entrada com `installment_type='SINAL'`,
   parcelas iguais com o tipo da cadência — `MENSAL`/`BIMESTRAL`/`TRIMESTRAL`/
   `SEMESTRAL`/`ANUAL`, resto do arredondamento na última) e
   `lerParametrosDoCronograma(schedule)` (caminho inverso, para a tela reabrir
   com os campos preenchidos a partir do `payment_schedule` salvo).
   **Pronto quando:** `__tests__/contractInstallments.test.ts` cobre entrada +
   parcelas, sem entrada, cada periodicidade, arredondamento, 31/jan e o inverso.
2. **`constants/paymentTypes.ts`** — adicionar `BIMESTRAL` (intervalo 2) aos
   tipos padrão; `services/contractService.ts › tipoDaCadencia` passa a devolver
   `BIMESTRAL` em vez de cair em `MENSAL`. **Pronto quando:** o código do tipo
   existe e o rótulo resolve em `labelForInstallmentType`.
3. **`components/ContractModal.tsx`** — na seção Condições de Pagamento, com
   "Parcelado" e contrato não recorrente: campos **Entrada (R$)** +
   **Vencimento da entrada**, **Nº de parcelas**, **Periodicidade**
   (Mensal/Bimestral/Trimestral/Semestral/Anual) e **1º vencimento das
   parcelas**, na malha do §30; o cronograma ganha coluna **Tipo**; qualquer
   mudança nos campos regera o cronograma; ao abrir contrato existente os campos
   são lidos do `payment_schedule`. `buildSchedule` local é removido (substituído
   pelo util). **Pronto quando:** o harness fotografa os campos e o
   `check-ui-standard.sh` passa.
4. **Recorrente — Trimestral:** `types/contracts.ts`, `types/imovib.ts`,
   `services/contractService.ts` (`advanceCycle`, tipo do `createContractFromDeal`)
   e o `<select>` de Periodicidade ganham `Trimestral`; migration
   `supabase/migrations/aplicar_20270921000031_contracts_billing_cycle_trimestral.sql`
   refaz o CHECK `contracts_billing_cycle_check`. **Pronto quando:** a migration
   foi aplicada (`db query -f`) e o CHECK no banco lista Trimestral.
5. **`docs/spikes/contrato-parcelado/`** — harness que reproduz a tela (fica no
   repo, como os demais spikes). **Pronto quando:** roteiro em
   `c:/tmp/pwtest/contrato-parcelado/passeio.js` gera os prints antes/depois.

## Estado

- [x] 1 util + testes — `utils/contractInstallments.ts`, 16 testes verdes
- [x] 2 BIMESTRAL no catálogo (+ rótulo na proposta em PDF, `propertyExportService`)
- [x] 3 ContractModal — harness fotografado: entrada 20.000 + 4× trimestral → 5 linhas (Entrada + 4), soma R$ 120.000; reabertura lê Entrada/Nº/Periodicidade/1º venc. do `payment_schedule`; `check-ui-standard.sh` limpo
- [x] 4 Trimestral no recorrente — código feito; migration aplicada em 2026-09-21 (`db query -f`, autorizado pelo usuário) e o CHECK conferido no banco: `Mensal, Bimestral, Trimestral, Semestral, Anual`
- [x] 5 harness em `docs/spikes/contrato-parcelado/` (`?recorrente=1`, `?salvo=1`)

**Publicado em 2026-09-21** (`77e89a06` em main) e provado de fora: `conferir-producao.sh "1º Vencimento das Parcelas"` ✅ (domínio servindo origin/main). Suíte cheia: 4975 ✓, 3 ✗ — `migrationsPrefixo` (corrigido: migration renomeada para 000031) e 2× `TelaWebhooks` (passa isolado, não tocado; instabilidade conhecida da suíte cheia).

Checagens: `npm run typecheck` ✓ · `npm run build` ✓ · `check-xss-sinks.sh` ✓ · 7 arquivos de teste relacionados (121) ✓

## Verificação

1. `npx vitest run __tests__/contractInstallments.test.ts __tests__/paymentPlan.test.ts __tests__/contractsLogic.test.ts`
2. `bash scripts/check-ui-standard.sh components/ContractModal.tsx`
3. `npm run typecheck`
4. Harness: `npx vite --port 3117` na frente + `node c:/tmp/pwtest/contrato-parcelado/passeio.js` → prints com os campos novos.
5. No app: Comercial › Contratos › abrir contrato › Financeiro › Parcelado → entrada 10.000 + 12× trimestral → cronograma com 13 linhas (1 entrada + 12) e datas de 3 em 3 meses; salvar; reabrir → campos preenchidos.
