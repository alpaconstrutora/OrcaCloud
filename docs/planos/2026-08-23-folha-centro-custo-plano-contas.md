# Folha de Pagamento — Centro de Custo e Plano de Contas

## Pedido original

Sessão de 2026-08-23:

```
recursos humanos < Gestão de Folha de Pagamento
1.	Criar coluna centro de custo e plano de contas
2.	Incluir centro de custo e plano de contas
```

### Decisões do usuário (perguntas feitas na mesma sessão)

1. **Onde definir** → "Os dois": padrão no **ciclo de folha** (`payroll_runs`),
   com **override por colaborador** (`employees`).
2. **Propagação** → "Sim, propagar": os lançamentos financeiros gerados no
   fechamento da folha (`internal_transactions`, origem `LABOR`) passam a
   gravar `cost_center_id` e `plano_de_contas_id`.

## Contexto

As três dimensões contábeis do sistema são distintas (ver memória
`centro-custo-vs-plano-de-contas-canonico`):

| Termo na tela | Tabela |
|---|---|
| Centro de Custo | `cost_centers_v2` |
| Plano de Contas | `plano_de_contas` |
| Categoria Financeira | `financial_categories` |

A folha não tinha nenhuma das duas primeiras: `payroll_runs` só guarda período,
tipo e status; `employees.centro_custo` existia como **texto livre** (migration
`20260528000000`), sem FK, consumido apenas pelo formulário do colaborador.
Consequência: toda linha de folha em Contas a Pagar aparecia sem Centro de Custo
e sem Plano de Contas — o mesmo tipo de buraco do Credor, corrigido em
`aplicar_20270914000003`.

### Regra de herança (as duas dimensões, mesmo comportamento)

```
colaborador (employees.cost_center_id)  →  se preenchido, vence
ciclo de folha (payroll_runs.cost_center_id)  →  padrão
(nenhum)  →  NULL, como hoje
```

O override por colaborador só tem efeito nas linhas financeiras que são **de um
colaborador**: rubricas individualizadas (adiantamento etc.) e
`syncEmployeeToFinance`. As linhas **agregadas por obra** e "Não Alocado"
somam vários colaboradores numa transação só — nelas vale sempre a
classificação do ciclo, porque não existe um colaborador dono da linha.

## Itens

### 1. `supabase/migrations/aplicar_20270914000004_folha_centro_custo_plano_contas.sql` (novo)

- `payroll_runs` + `cost_center_id` (FK `cost_centers_v2`, ON DELETE SET NULL) e
  `plano_de_contas_id` (FK `plano_de_contas`, ON DELETE SET NULL) + índices.
- `employees` + as mesmas duas colunas (override).
- Backfill: `employees.cost_center_id` a partir do texto legado
  `employees.centro_custo`, casando por `code` ou `name` dentro da mesma
  organização. Só onde o casamento é único.
- **Pronto quando**: `information_schema.columns` mostra as 4 colunas novas e a
  consulta de conferência 2.b devolve o número de colaboradores religados.

### 2. `services/payrollService.ts`

- `PayrollRun` ganha `cost_center_id?` / `plano_de_contas_id?`; `listRuns` e
  `getRun` passam a selecioná-las.
- `updateRunClassification(id, { cost_center_id, plano_de_contas_id })`.
- `listPlanoContas(orgId)` ao lado do `listCostCenters` que já existia.
- `syncPayrollToFinance`: resolve a classificação do ciclo, aplica o override do
  colaborador nas linhas individualizadas e grava as duas colunas em
  `internal_transactions` (e o nome em `project.settings.financialInfo`, onde já
  havia `costCenter`/`chartOfAccounts`).
- **Pronto quando**: fechar uma folha e ver as colunas Centro de Custo e Plano
  de Contas preenchidas em Contas a Pagar, origem Folha.

### 3. `services/payrollEngine.ts`

- `runPayroll` e `runBulkPayroll` aceitam a classificação e a gravam no run
  criado (ou atualizam o run reprocessado).
- **Pronto quando**: criar folha pelo modal com os dois campos escolhidos e o
  registro nascer com os UUIDs.

### 4. `components/LaborPayroll.tsx`

- Carrega `cost_centers_v2` e `plano_de_contas` da org ativa e repassa os mapas.
- Modal "Novo ciclo de folha": dois selects (opcionais).
- **Pronto quando**: o modal mostra os dois campos e o valor escolhido chega ao
  banco.

### 5. `components/PayrollRunList.tsx`

- Duas colunas novas (`cost_center`, `plano_contas`) — ordenáveis, entram na
  busca, no `ColumnConfigButton` e nas larguras padrão.
- **Pronto quando**: as colunas aparecem na tabela com o nome resolvido e "—"
  quando vazias.

### 6. `components/PayrollRunDetail.tsx`

- Faixa de classificação: edita as duas dimensões enquanto a folha está em
  RASCUNHO; somente leitura quando FECHADO.
- **Pronto quando**: alterar o valor persiste e reaparece ao voltar à lista.

### 7. `components/LaborEmployeeForm.tsx`

- O campo "Centro de Custo" (texto livre) vira select de `cost_centers_v2`;
  novo select "Plano de Contas". O texto legado continua no banco, apenas não é
  mais editado por aqui.
- **Pronto quando**: salvar o colaborador grava os UUIDs.

## Verificação

- `bash scripts/check-ui-standard.sh` nos `.tsx` tocados (REGRA #1).
- `npx vitest run __tests__/migrationsPrefixo.test.ts __tests__/orgContextGuard.test.ts`
- `npx tsc --noEmit`

## Estado — 2026-08-23

Itens 1 a 7: **código escrito**. Verificações mecânicas rodadas:

- `npx tsc --noEmit -p .` → limpo.
- `npx vitest run` → 1585 passam, 24 pulados, 0 falhas (inclui
  `migrationsPrefixo`, `orgContextGuard`, `payrollCredor`).
- `scripts/check-ui-standard.sh` nos 4 `.tsx`: PayrollRunDetail, LaborPayroll e
  LaborEmployeeForm limpos. PayrollRunList acusa §7 nas linhas 214 (`<h1>`) e
  324 (`<h3>`) — **falso positivo conhecido**: o comentário da linha 92 contém
  `<td>` e liga a máquina de estados do awk até o primeiro `</td>` real (linha
  384). Nenhuma das duas linhas está dentro de célula; ambas são anteriores a
  esta tarefa.

**Falta**, e nesta ordem:

1. Aplicar `aplicar_20270914000004_...sql` à mão no SQL Editor. Enquanto ela
   não roda, `payrollService.listRuns/getRun` pedem colunas que não existem e a
   tela de folha quebra — a migration vem ANTES do deploy do front.
2. Conferência na tela (não feita aqui): criar folha com as duas dimensões,
   fechar, e olhar Contas a Pagar com Origem = "Folha".
