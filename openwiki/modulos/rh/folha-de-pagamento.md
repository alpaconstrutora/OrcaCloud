---
type: módulo
title: "RH: colaboradores, folha de pagamento e encargos"
description: Como a folha é calculada e vira financeiro — quem participa (por datas de admissão/desligamento), o motor por tipo de folha com fórmulas seguras, INSS progressivo e IRRF com o redutor de 2026, salário pela competência a partir do histórico salarial (proporcional no meio do mês), rubricas recorrentes com valor, um título por encargo/retenção em Tributos a Pagar com títulos pagos/conciliados preservados, alocação de custo por obra e o custo de mão de obra por competência.
tags: [hr, payroll, inss, irrf, fgts, rubrics, labor-cost, taxes, finance-sync]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-5f627a209985fb291de32e41
    resource: repo://lib/payrollCalc.ts
  - id: openwiki-source-43e2ec84664d62beb8ce662d
    resource: repo://lib/payrollRubricaRecorrente.ts
  - id: openwiki-source-411aadb9d8c851a02a229ad4
    resource: repo://lib/payrollSalarioCompetencia.ts
  - id: openwiki-source-d840083ce4e96100231e09e7
    resource: repo://services/payrollEngine.ts
  - id: openwiki-source-0b904c09bd0b1ed517253e8f
    resource: repo://services/payrollService.ts
  - id: openwiki-source-c59b26be9adf2ee504c71fb4
    resource: repo://utils/folhaDaCompetencia.ts
  - id: openwiki-source-4415100967dc2b1fd8c64b41
    resource: repo://utils/folhaFinanceiro.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# RH: colaboradores, folha de pagamento e encargos

Telas: `components/LaborModule.tsx` e a família `Labor*` (colaboradores,
folha, encargos, alocações, ponto, banco de horas, férias/afastamentos, EPIs,
SST, treinamentos, desligamento, eSocial, dashboard RH). Serviços:
`services/laborService.ts` (cadastros), `services/payrollService.ts` (folha,
rubricas, alocações, financeiro), `services/payrollEngine.ts` (cálculo). Cálculo
puro em `lib/payroll*.ts` e `utils/folha*.ts`. Cache por React Query
(`hooks/useLaborQueries.ts`, `useLaborMutations.ts`, chaves `laborKeys`).

## Onde a folha nasce

A folha de um colaborador roda **só na organização em que ele é registrado**.
Quando ele trabalha ou é pago por outra organização, o custo chega lá por
**alocação/rateio**, não por uma segunda folha (`employee_org_shares` define
onde trabalha/quem paga). Cadastro duplicado do mesmo CPF gera duas folhas — é
erro de dado, não de motor.

Contas bancárias do colaborador ficam em `employee_bank_accounts`
(`employeeBankAccountService`); colunas `banco_*` antigas em `employees` são
obsoletas.

## O motor (`services/payrollEngine.ts`)

`runPayroll` / `runBulkPayroll` montam um `PayrollContext` por colaborador
(`buildContext`) e despacham por tipo de folha:

| Tipo | Função |
|---|---|
| Mensal | `processMonthly` |
| Adiantamento | `processAdvance` |
| Férias | `processVacation` |
| 13º | `processThirteenth` |
| Rescisão | `processTermination` |

Todas terminam em `finaliseWithRubrics` → `persistResults` (bruto, descontos,
encargos e bases INSS/FGTS/IRRF).

- **Quem participa** — `participaDaFolha(emp, início, fim)` decide **por datas**:
  admissão depois do fim do período tira; desligamento antes do início tira;
  `ATIVO` participa; `DESLIGADO` participa se a data de desligamento cai no
  período. `saiDaFolha` remove os itens de quem deixou de participar ao
  reprocessar — exceto `AFASTADO`, cujo lançamento é decisão de quem fecha a
  folha.
- **Fórmulas de rubrica** são avaliadas por um **parser aritmético seguro**
  (`+ - * / ( )`, números e negativos unários), não `new Function`/`eval`
  (`calculateRubricValue`).

### Impostos (`lib/payrollCalc.ts`, fonte única)

- `calculateINSS(base, faixas)` — INSS **progressivo** por faixas (faixas
  configuráveis por ano, `InssBracketsSettings`).
- `calcularIrrfMensal` / `calculateIRRF` — IRRF pela tabela, com desconto
  simplificado mensal (`descontoSimplificadoMensal`).
- `aplicarRedutorIRRF2026(irrf, rendimentosTributaveis)` — redução mensal do
  IRPF a partir de 01/2026 (Lei 9.250/1995, art. 3º-A, incluído pela
  Lei 15.270/2025): até R$ 5.000,00 de rendimento tributável, redução de até
  R$ 312,89; de R$ 5.000,01 a R$ 7.350,00, `978,62 − 0,133145 × rendimentos`;
  acima disso, sem redução. Limitada ao imposto calculado; nunca negativa. O
  argumento é o **rendimento tributável bruto**, não a base de cálculo.

O mesmo módulo é usado pela validação (`payrollValidationService`).

### Salário pela competência (`lib/payrollSalarioCompetencia.ts`)

O salário base vem do **Histórico Salarial** (`employee_salary_history`) na
competência, não de `employees.base_salary` (o salário de hoje). Antes, um
reajuste com data de agosto não entrava na folha de agosto e reprocessar uma
folha antiga trazia o salário novo para trás. **Reajuste no meio do mês é
proporcional** — dias antes da vigência no salário antigo, depois no novo, sobre
o mês comercial de 30 dias (`salarioNaData`, `salarioDoPeriodo`).

### Rubricas recorrentes (`lib/payrollRubricaRecorrente.ts`)

Qualquer rubrica pode ser recorrente no colaborador, com **valor próprio**:
R$/mês (`fixo`) ou % do salário da competência (`percentual`). Antes só rubricas
"Automáticas" podiam, sem valor — gratificação, hora extra e prêmios nunca
entravam. A mesma regra serve à tela (o que travar, o que exigir) e ao motor (o
que lançar).

## Da folha para o financeiro

`utils/folhaFinanceiro.ts` (puro) define que títulos uma folha gera, **por obra
× chave contábil**; `payrollService.syncPayrollToFinance` grava.

| Chave | Título |
|---|---|
| `salario` | líquido − proventos pagos à parte |
| `inss` | INSS descontado do empregado → Tributos a Pagar |
| `irrf` | IRRF retido → Tributos a Pagar |
| `fgts` | rubricas FGTS → Tributos a Pagar |
| `cpp` | base INSS × CPP (padrão 20%) → Tributos a Pagar |
| `rat` | base INSS × RAT × FAP (padrão RAT 3%, construção civil) → Tributos a Pagar |
| `ter-COD` | um título **por entidade** de terceiros (Salário-Educação, INCRA, SENAI, SESI, SEBRAE — FPAS 507) |
| `rep-COD` | desconto repassado a terceiro |
| `enc-COD` | outro encargo de rubrica |

Os demais descontos (falta, VR, 13º, adiantamento) **só reduzem o líquido**.
O adiantamento tem título próprio pela rubrica individualizada. Antes existia um
único "Encargos Patronais" = custo − líquido, que somava FGTS com **todos** os
descontos do empregado (um FGTS de R$ 453 virava um "encargo" de R$ 3.989).
Regime e alíquotas por empresa: `getEncargosConfig` / `saveEncargosConfig`.

**Regravar não destrói o que tem dinheiro.** Título pago, conciliado, cancelado à
mão, em DARF ou com pagamento Asaas **não é apagado nem regravado**
(`tituloDaFolhaPreservado`); se o recálculo diverge, o retorno avisa. O resto é
regravado pelo mesmo `reference_id` (upsert) e o excedente do cálculo antigo é
apagado. `cancelarTitulosDaFolha` também preserva os conciliados.

`espelharFolhaNasObras` atualiza o espelho legado
`settings.financialInfo.transactions` das obras — **só exibição**: o
`financialSyncService` não o materializa mais.

Ver [Títulos e sincronização](../financeiro/titulos-e-sincronizacao.md) e
[NF-e e tributos](../fiscal/ingestao-nfe.md).

## Custo por obra

- **Alocações** (`listAllocations`, `saveAllocations`, `insertAutoAllocations`)
  e **rateio de custo** (`listCostSplits`, `saveCostSplits`) distribuem o custo
  do colaborador entre obras/organizações por competência.
- `utils/folhaDaCompetencia.ts` define o **custo de mão de obra** de uma
  competência (Dashboard RH e Custo por Obra): só folha **mensal** (somar a de
  adiantamento duplicaria), status `FECHADO` ou `PROCESSANDO`, e a competência
  mais recente até o mês de referência (a folha de outubro só é calculada em
  novembro).
- `custoDaFolhaDaCompetencia`, `getWorksiteCostSummary`.

## Portal do Colaborador

Rota `/portal` (casca `PortalView` de `components/LaborPortal.tsx`, carregada sob
demanda). Abre no holerite, com a marca da empresa do colaborador
(`DESIGN.md`). Documentos por `labor-portal-ged-download`. Ver
[Portais externos](../portais/portais-externos.md).

## Onde olhar

| Pergunta | Arquivo |
|---|---|
| quem entra na folha | `services/payrollEngine.ts` (`participaDaFolha`) |
| INSS/IRRF | `lib/payrollCalc.ts` |
| salário do mês | `lib/payrollSalarioCompetencia.ts` |
| rubrica recorrente | `lib/payrollRubricaRecorrente.ts` |
| que títulos a folha gera | `utils/folhaFinanceiro.ts` |
| gravar no financeiro | `services/payrollService.ts` (`syncPayrollToFinance`) |
| custo da competência | `utils/folhaDaCompetencia.ts` |
