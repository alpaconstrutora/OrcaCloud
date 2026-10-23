# Folha: salário base pela competência (Histórico Salarial)

## Pedido original

> recursos humanos > folha: continua um problema ja tratado. O salário base nao esta obedecendo as datas do historico salarial recursos humanos > colaborador >  historico salarial

Sessão: 884e7f6e-1d97-4cbf-8032-0e79929e9551 · 22/10/2026

## Diagnóstico

O "já tratado" foi a aba Histórico Salarial (plano
`2026-08-07-rh-colaborador-historico-salarial.md`). Esse plano deixou **de
propósito fora do escopo** a parte que o usuário esperava:

> Ler o histórico dentro do `payrollEngine` para folha retroativa — continua
> usando o `base_salary` vigente.

O motor (`services/payrollEngine.ts`) usa `employees.base_salary` — o salário
de HOJE — em toda folha (mensal, adiantamento, férias, 13º, rescisão), e a
tela da folha e o holerite mostram o mesmo campo do cadastro. Casos medidos no
banco em 22/10/2026 (folha × histórico na competência):

| Colaborador | Competência | Folha | Histórico |
|---|---|---|---|
| Rogério da Silva Santos | 08/2026 | 1.621,00 | 1.767,00 desde 03/08 |
| Rogério da Silva Santos | 09/2026 | 1.621,00 | 1.767,00 |
| Claudinei da Costa Vieira | 07/2026 | 4.329,22 | 4.000,00 |

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 22/10/2026 | Reajuste no meio do mês: proporcional, mês inteiro no novo, ou só no mês seguinte? | **Proporcional** — dias antes da data no salário antigo, a partir da data no novo, mês CLT de 30 dias |

Regras que decorrem (minhas, coerentes com a decisão):

- Salário numa data = lançamento com a maior `effective_date` ≤ data
  (empate: o criado por último). Antes do primeiro lançamento vale o
  `previous_salary` dele (ou o próprio `new_salary`, se for admissão sem
  anterior). Sem histórico nenhum: `employees.base_salary`, como antes.
- Mensal: soma dia a dia (CLT, dia 31 conta como 30) a partir da admissão,
  se for no mês. Hora extra usa o salário vigente no fim do período.
- Adiantamento, 13º e rescisão: salário vigente no fim do período.
  Férias: vigente no início do período (data da concessão).
- `payroll_results.base_salary` guarda o salário da competência usado no
  cálculo — tela e holerite leem dali; folha fechada mantém o seu.

## Plano

1. `lib/payrollSalarioCompetencia.ts` (novo) — `salarioNaData` e
   `salarioDoPeriodo`. **Pronto quando** `__tests__/payrollSalarioCompetencia.test.ts`
   cobre: sem histórico, antes do 1º lançamento, reajuste no meio do mês
   (Rogério 08/2026 = 1.757,27), admissão + reajuste no mesmo mês, dia 31,
   fevereiro.
2. `services/laborService.ts` — `listSalaryHistoryForPayroll` (select estreito).
   **Pronto quando** o motor o usa e o tsc passa.
3. `services/payrollEngine.ts` — contexto carrega o histórico; os 5 tipos de
   folha usam o resolvedor; resultado grava `base_salary`. **Pronto quando**
   teste do motor mostra SALARIO proporcional e hora extra pelo salário da
   competência.
4. `supabase/migrations/aplicar_20271022700000_payroll_results_base_salary.sql`
   — coluna + backfill a partir dos itens já calculados. **Pronto quando**
   aplicada no remoto e a consulta de conferência mostra a coluna preenchida.
5. `services/payrollService.ts` — tipo + upsert com `base_salary`. **Pronto
   quando** tsc passa.
6. `components/PayrollRunDetail.tsx`, `components/PaystubModal.tsx`,
   `components/PayrollEventModal.tsx`, `services/payrollValidationService.ts`
   — leem `base_salary` do resultado, cadastro só como reserva. **Pronto
   quando** check-ui-standard sem achado novo e tsc passa.

## Estado

- [x] 1 — 14 testes em `__tests__/payrollSalarioCompetencia.test.ts`
- [x] 2 — `listSalaryHistoryForPayroll`
- [x] 3 — `__tests__/payrollEngine.salarioCompetencia.test.ts` (7): Rogério 08/2026 SALARIO 1.757,27 ref. 30, base gravada 1.767,00; 07/2026 1.621,00; HE pela competência; 13º e férias
- [x] 4 — aplicada no remoto em 22/10/2026: 49 resultados, 35 preenchidos pelo backfill (14 sem verba de salário ficam NULL)
- [x] 5 — tipo + upsert; `tsc --noEmit` rc=0
- [x] 6 — check-ui-standard: PayrollRunDetail e PaystubModal limpos; PayrollEventModal acusa §8 (l. 313) e §14 (l. 370) que já existem iguais em origin/main — a mudança ali é só a conta do valor, sem UI
- [x] PR + CI — PR #111: `ci` 29m33s, Vercel e Vercel Preview Comments verdes
- [x] publicação — mesclado por squash em 22/10/2026 (`011f4292`); `conferir-producao.sh` provou o domínio servindo 011f429; frente fechada (`--sem-publicar`) e branch apagada
- [ ] folhas abertas reprocessadas pelo usuário (o código não recalcula
      folha sozinho)

## Verificação

Reprocessar a folha 08/2026 da org do Rogério: SALARIO = 1.757,27 (ref. 30) e
coluna "Salário base" = 1.767,00.
