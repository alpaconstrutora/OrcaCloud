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

---

## Pedido posterior (2026-09-21, mesma sessão) — a tela era a NEGOCIAÇÃO

> ,Pós-Obra & Garantia" foi um erro meu e estava me referindo como voce disse negociação (DealModal › Financeiro), lá já há o "Plano de pagamento › Adicionar pagamento" por blocos (sinal, mensal, trimestral…), só não ligado ao select "Parcelado" — é outra frente, se quiser.

A resposta anterior ("Contrato") veio de uma pergunta com opções; o usuário corrigiu.
O trabalho no `ContractModal` fica (é melhoria real e já está publicado); o que
o pedido original queria é isto:

### Plano — Fase 2 (frente `negociacao-parcelado-gerador`)

6. **`utils/paymentPlan.ts`** — `montarPlanoRapido({ total, entrada, parcelas,
   tipo, intervaloMeses, primeiroVencimento, valorParcelaFixo? })` → `{ entrada,
   blocos }` no formato que `aplicarBlocos` já consome; sobra do arredondamento
   vira bloco de 1× na última data; locação usa o valor mensal fixo e nunca tem
   entrada. **Pronto quando:** 6 testes novos em `__tests__/paymentPlan.test.ts`.
7. **`components/DealModal.tsx`** — abaixo do select "Forma de Pagamento", com
   "Parcelado Direto / Mensalidade" (venda e locação): card "Montar plano de
   pagamento" com Entrada (só venda), Nº de parcelas, Periodicidade (tipos do
   catálogo que geram série: mensais/bimestrais/trimestrais/semestrais/anuais) e
   1º vencimento; linha "Vai gerar: …"; botão **Montar plano** (vira **Substituir
   plano** com `useConfirm` quando já há blocos). Grava nos MESMOS lugares do
   Sheet de bloco (`down_payment` + `aplicarBlocos`); em locação preenche
   `contract_total_value = mensal × nº`. **Pronto quando:** harness
   `docs/spikes/negociacao-parcelado/` fotografa venda (entrada 20.000 + 4×
   trimestral → Sinal + bloco, "Plano fechado") e locação (12× mensal, fechado);
   `check-ui-standard.sh` limpo.

### Estado — Fase 2

- [x] 6 `montarPlanoRapido` + 6 testes (28 no arquivo)
- [x] 7 DealModal — harness: venda fechada com Sinal + 4× trimestrais; locação 12× fechada; substituição com confirmação e sobra em 2 blocos (7× de 120.000 → 6× 17.142,85 + 1× 17.142,90); typecheck ✓; `check-ui-standard.sh` ✓

O plano por blocos continua acima do select, como antes (não foi reordenado):
o gerador só o preenche. O botão "Ver plano de pagamento" (aba Parcelas =
cobranças reais) ficou como estava.

**Fase 2 publicada em 2026-09-21** (`12b53f8c` em main) e provada de fora:
`conferir-producao.sh "Montar plano de pagamento"` ✅ (domínio servindo origin/main).

---

## Pedido posterior (2026-09-21) — o plano como tabela

> o plano de pagamento é montado adicionando conforme o usuário desejar. Veja exemplo:
> Parcela / Quantidade / Valor / tipo / descriçao
> Parcela 1 / 1 / 100.000,00  /Entrada / Entrada em dinheiro
> Parcelas Mensais 2 - 8 / 8 / 10.000,00 / parcelas mensais / Parcelas mensais em cheque
> Parcela 9 / 1 / 50.000,00 / Parcela Final / Nas chaves

### Plano — Fase 3 (frente `plano-pagamento-tabela`)

8. **`components/DealModal.tsx`** — a lista do Plano de pagamento (aba Financeiro)
   vira tabela: **Parcela** (numeração sequencial através dos blocos — "Parcela
   1", "Parcelas 2–9", "Parcela 10") / **Quantidade** / **Valor** / **Tipo** /
   **Descrição** (a "Observação" do bloco, renomeada para Descrição no Sheet) /
   **1º vencimento** / Ações; rodapé "Total do plano" + a faixa de saldo que já
   existia. Tabela dentro de modal → §6.9 (`px-3`, texto livre `px-4`), §6.2,
   §7/§7.2. Container da aba de `max-w-3xl` para `max-w-4xl` (7 colunas não
   cabiam em 768px). **Pronto quando:** harness `?exemplo=1` reproduz o exemplo
   do pedido linha a linha e total R$ 230.000,00 / Plano fechado.

### Estado — Fase 3

- [x] 8 — harness: `Parcela 1 | 1 | R$ 100.000,00 | Sinal | Entrada em dinheiro | 21/09/2026`, `Parcelas 2–9 | 8 | R$ 10.000,00 | Parcelas mensais | Parcelas mensais em cheque | 10/11/2026`, `Parcela 10 | 1 | R$ 50.000,00 | Parcela nas chaves | Nas chaves | 10/07/2027`; total R$ 230.000,00; Plano fechado. typecheck ✓ · `check-ui-standard.sh` ✓

Nota: a numeração corrige o exemplo (8 mensais depois da parcela 1 são as
parcelas 2–9, e a final é a 10). "Adicionar pagamento" continua sendo o caminho
para montar linha a linha; o card "Montar plano" (Fase 2) só gera um primeiro
rascunho homogêneo.

**Fase 3 publicada em 2026-09-21** (`a07ef55a` em main) e provada de fora:
`conferir-producao.sh "Total do plano"` ✅ (domínio servindo origin/main).

---

## Pedido posterior (2026-09-21) — "Parcela única" e "Gerar parcelas" morto

> 1. incluir "parcela Única" em  no tipo de parcela
> 2. aba Parcelas, < botao gerar parcelas nao esta funcionando

### Diagnóstico (harness `docs/spikes/negociacao-parcelado/?salva=1&exemplo=1`)

O botão abre o modal; o que falhava era o **rodapé "Gerar contrato e parcelas"
numa VENDA sem contrato**: criava o contrato e só LIA as parcelas dele —
`createContractFromDeal` não copia o Plano de Pagamento da negociação para o
`payment_schedule`, então respondia "contrato criado, mas sem parcelas: plano
vazio, preencha na aba Financeiro" com o plano preenchido lá. E os cartões do
modal mostravam "—" (liam o espelho mensal × nº, vazio num plano heterogêneo).
Quando a criação do contrato falhava (ex.: negociação sem unidade), a mensagem
era genérica ("veja a aba Contrato e Assinatura").

### Plano — Fase 4 (frente `parcelas-gerar-e-tipo-unica`)

9. **`constants/paymentTypes.ts`** — tipo padrão `UNICA` "Parcela única"
   (sem série); rótulo na proposta em PDF. **Pronto quando:** aparece no Sheet
   "Adicionar pagamento" (defaults não importados são mesclados por
   `withDefaultPaymentTypes`).
10. **`components/DealModal.tsx`** — venda sem contrato: "Gerar contrato e
    parcelas" cria o contrato e aplica o plano (`handleGenerateForContract`, o
    mesmo caminho de quando o contrato já existe / "Lançar no Financeiro");
    modal mostra "Parcelas do plano / Valor total" em venda (mensal × nº e a
    âncora de data ficam só para locação); motivo real da falha de criação no
    modal (`erroContratoRef`); pré-requisito de unidade em `motivoSemContrato`.
    **Pronto quando:** harness — clique gera `PATCH contracts
    payment_schedule,payment_term_type` com as 10 linhas do exemplo e a
    mensagem "10 parcela(s) do Plano de Pagamento lançadas".

### Estado — Fase 4

- [x] 9 UNICA no catálogo
- [x] 10 DealModal — harness: modal "Parcelas do plano 10 · R$ 230.000,00"; sem unidade → "Negociação sem unidade — selecione o imóvel…" no modal; com unidade → contrato criado, `PATCH contracts payment_schedule` (SINAL + 8× MENSAL + CHAVES), "10 parcela(s) … lançadas". typecheck ✓ · `check-ui-standard.sh` ✓

**Fase 4 publicada em 2026-09-21** (`474f2717` em main) e provada de fora:
`conferir-producao.sh "Parcelas do plano"` ✅ (domínio servindo origin/main).
