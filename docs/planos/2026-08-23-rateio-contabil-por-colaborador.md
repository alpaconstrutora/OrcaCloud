# Rateio contábil por colaborador (Centro de Custo / Plano de Contas)

> Etapa 2 de `2026-08-23-folha-centro-custo-plano-contas.md` (etapa 1 publicada
> no commit `9a5b9fc`). Aqui o rateio: um colaborador pode apropriar o custo do
> mês em MAIS DE UM centro de custo e plano de contas.

## Pedido original

Sessão de 2026-08-23, depois de a etapa 1 ir para produção — transcrito na
íntegra:

```
pergunta: como eu defino um centro de custo e plano de contas para cada colaborador?
```

e, em seguida, com print da tela de detalhes da folha:

```
1. veja que os campos centro de custo e plano de contas estão vazios.
2. parede não ser possivel definir um centro de custo para cada colaborador
indivualmente e nem fazer um rateio. Por exemplo dentro de um periodo de 1 mes
um colaborador pode apropriar os custos em mais de um centros de custo e plano
de contas
```

### Decisão do usuário (pergunta feita na mesma sessão)

Perguntado se o rateio contábil deveria **acompanhar o rateio de obra**
(`employee_allocations`), permitir **várias linhas por obra** na mesma tabela,
ou viver em **tabela separada e independente**, respondeu: **"Tabela separada,
independente"**.

Consequência aceita explicitamente na pergunta: duas telas de rateio para
manter, e duas somas de 100% que podem divergir entre si (a de obra e a
contábil).

## Estado de hoje (o que a etapa 1 deixou pronto)

| Onde | O que existe | Limite |
|---|---|---|
| `payroll_runs.cost_center_id` / `.plano_de_contas_id` | classificação padrão do ciclo | 1 valor por folha |
| `employees.cost_center_id` / `.plano_de_contas_id` | override do colaborador | 1 valor por pessoa |
| `employee_allocations` | rateio por OBRA (`allocation_percent`, `reference_period`) | dimensão obra apenas |
| `LaborAllocations.tsx` | 4 seletores de CC/Plano (salário e encargos) | **efêmeros**: não são gravados, valem só para o clique em "lançar no financeiro" daquele momento |

Herança atual, aplicada por `resolvePayrollClassification()`:
`colaborador → ciclo → null`. O rateio entra como um degrau **acima** dela.

## Desenho

### Herança final (4 degraus)

```
employee_cost_splits (colaborador × mês)  → se houver linhas, RATEIA
employees.*_id                            → senão, valor único do colaborador
payroll_runs.*_id                         → senão, padrão do ciclo
null                                      → senão
```

Se as linhas de rateio somarem menos de 100%, o restante **não fica sem
classificação**: cai para o degrau seguinte. É o que evita que um erro de
digitação (95%) faça 5% do custo sumir da contabilidade.

### O corte no financeiro

Hoje a folha gera, por obra, três lançamentos agregados (salário, encargos,
contribuições de terceiros) somando todos os colaboradores daquela obra. Com
rateio, o agregado passa a ser por **(obra × centro de custo × plano de
contas)**: o custo de cada colaborador na obra é dividido pelos percentuais
dele antes de somar.

⚠️ Isso muda a granularidade do `reference_id`, que é **composto** e serve de
chave do upsert (`organization_id, reference_id, entry_type`). Novo formato:

```
labor-<run>-<obra>-salario-<ccId|none>-<pcId|none>
```

A limpeza continua funcionando porque é por prefixo `labor-<run>-`. Folha já
sincronizada com o formato antigo é apagada e regravada no novo na próxima
sincronização — não convivem dois formatos para a mesma folha.

## Itens

### 0. Bug aberto — os selects de CC/Plano vêm vazios na tela da folha

Reportado no item 1 do pedido. **Diagnóstico ainda não feito** (pedido ao
usuário: Network → `cost_centers_v2` → URL e status). Duas hipóteses:

- `orgId` chega vazio (seletor do topo apontando para uma *empresa*), e o
  `listCostCenters(orgId: string)` de `main` faz `.eq('organization_id', '')`
  → `22P02` → `catch` → lista vazia. Correção: tolerar `''`/`'all'`, como o
  `listPlanoContas` já faz;
- `orgId` correto, mas de organização diferente da dona dos centros de custo.
  Correção é de dado, não de código.

**Pronto quando**: a origem estiver identificada pela requisição real (não por
dedução), corrigida, e os dois selects listarem na tela.

⚠️ **Bloqueia o resto**: sem cadastro carregando, nenhuma tela de rateio tem o
que oferecer.

### 1. `supabase/migrations/aplicar_20270914000005_employee_cost_splits.sql` (novo)

```sql
CREATE TABLE public.employee_cost_splits (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id        uuid NOT NULL REFERENCES public.employees(id)     ON DELETE CASCADE,
    reference_period   text NOT NULL,                    -- 'YYYY-MM', mesmo formato de employee_allocations
    cost_center_id     uuid REFERENCES public.cost_centers_v2(id) ON DELETE RESTRICT,
    plano_de_contas_id uuid REFERENCES public.plano_de_contas(id) ON DELETE RESTRICT,
    percent            numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT employee_cost_splits_dimensao_obrigatoria
        CHECK (cost_center_id IS NOT NULL OR plano_de_contas_id IS NOT NULL)
);
CREATE UNIQUE INDEX ... ON (employee_id, reference_period, cost_center_id, plano_de_contas_id);
```

`ON DELETE RESTRICT` nas duas FKs de propósito: apagar um centro de custo que
tem rateio histórico apontando para ele reescreveria a contabilidade de meses
fechados. O `SET NULL` da etapa 1 era aceitável em `payroll_runs` (um valor
solto); aqui não é.

RLS: `is_org_member(org_id)` nas quatro operações, `REVOKE ALL FROM anon`
explícito (o Supabase concede SELECT a `anon` por ALTER DEFAULT PRIVILEGES —
`REVOKE FROM PUBLIC` sozinho não fecha).

**Pronto quando**: tabela existe, sonda anon devolve `[]`/401 e não os dados, e
a policy aparece em `pg_policies`.

### 2. `services/payrollService.ts` — leitura e herança

- `listCostSplits(employeeId, period)` / `saveCostSplits(employeeId, period, linhas)`
  (substituição em bloco, como `saveAllocations` já faz).
- `resolvePayrollClassification()` ganha uma irmã que devolve **lista**:
  `resolvePayrollSplits(run, employee, splits) → [{cost_center_id, plano_de_contas_id, percent}]`.
  Sem splits, devolve uma linha de 100% com a herança atual. Com soma < 100,
  acrescenta a linha do resto com a herança.
- **Pronto quando**: teste unitário cobrindo os 4 degraus e o caso da soma
  parcial (`__tests__/payrollCostSplits.test.ts`).

### 3. `services/payrollService.ts` — `getWorksiteCostSummary` e `syncPayrollToFinance`

- O resumo por obra passa a acumular por `(obra, cost_center_id, plano_de_contas_id)`.
- Os três lançamentos por obra viram três **por chave contábil** da obra.
- `syncEmployeeToFinance` (lançamento individual da tela de Alocações) idem.
- **Pronto quando**: uma folha com um colaborador 60/40 gera duas linhas de
  salário na mesma obra, com os dois centros de custo, somando o mesmo total de
  antes. O total da folha não pode mudar — é o critério que pega erro de
  arredondamento no rateio (usar o maior resto para fechar a diferença de
  centavos na última linha).

### 4. `components/LaborAllocations.tsx` — a tela do rateio

- Painel lateral (`Sheet`, `UI_PATTERNS.md`) "Rateio contábil" a partir do
  colaborador selecionado, no mês já escolhido na tela.
- Linhas com Centro de Custo + Plano de Contas + %, botão de adicionar/remover,
  total visível e bloqueio de salvamento acima de 100%.
- "Copiar do mês anterior", como já existe para as alocações de obra.
- Os 4 seletores efêmeros de CC/Plano continuam, mas passam a valer só como
  fallback quando o colaborador não tem rateio no mês.
- **Pronto quando**: salvar, sair, voltar e o rateio reaparecer; e o total
  errado ser recusado com mensagem, não com `alert()` (§14 — `useConfirm`/toast).

### 5. Visibilidade do rateio

- Coluna/etiqueta na lista de Alocações mostrando "60/40" ou "—" para quem não
  tem rateio, para que a exceção seja visível sem abrir o painel.
- **Pronto quando**: dá para varrer a lista do mês e ver quem tem rateio sem
  clicar em ninguém.

## Fora de escopo (decidido aqui para não voltar como surpresa)

- **Folha já fechada não muda sozinha.** O rateio novo só alcança lançamentos
  na próxima sincronização ("Re-sincronizar financeiro"). Não haverá backfill
  automático de meses fechados.
- Rateio por **rubrica** (salário num CC, adiantamento em outro) — hoje a
  rubrica individualizada segue a mesma chave contábil do colaborador.
- Importação em massa do rateio (planilha).

## Verificação

- `bash scripts/check-ui-standard.sh` nos `.tsx` tocados (REGRA #1).
- `npx vitest run` (inclui o teste novo do item 2).
- `npx tsc --noEmit -p .`
- Conferência na tela: colaborador 60/40 numa obra → duas linhas em Contas a
  Pagar, origem Folha, somando o valor de antes.

## Estado — 2026-08-23 (implementação)

**Itens 0 a 5: código escrito.** Verificações mecânicas:

- `npx tsc --noEmit -p .` → limpo.
- `npx vitest run` → 1597 passam, 24 pulados, 0 falhas (12 deles novos, em
  `__tests__/payrollCostSplits.test.ts`).
- `scripts/check-ui-standard.sh` em `LaborAllocations`, `LaborPayroll` e
  `LaborEmployeeForm` → sem violação.

### Item 0 — causa encontrada no código, sem depender do Network

`LaborModule.tsx:494` passa `orgId={orgId ?? 'all'}` para a tela de folha ('all'
é a sentinela de lote dela). Esse valor descia até
`listCostCenters(orgId: string)`, que na versão publicada filtrava
`.eq('organization_id', 'all')` → `22P02`. Como as duas listas eram carregadas
num `Promise.all` com um `try/catch` só, a falha de UMA zerava as DUAS.

Corrigido em três pontos: a tolerância a `''`/`'all'` no service (a mesma que a
outra frente tinha feito e que eu havia revertido ao separar o commit anterior),
e `Promise.allSettled` em `LaborPayroll` e `LaborEmployeeForm`.

⚠️ Isso explica o print com os dois selects vazios **se** o topo estivesse em
"Todas as organizações". Com uma organização específica selecionada, a causa
seria outra (organização sem centros de custo cadastrados) — a conferir na tela
depois do deploy.

### Decisões tomadas durante a implementação

- **`sufixoDaFatia`**: o `reference_id` só ganha a chave contábil quando há mais
  de uma fatia. Quem não rateia mantém exatamente o `reference_id` de sempre, e
  as folhas já sincronizadas não viram linhas órfãs.
- **`dividirValor`**: a sobra de arredondamento vai para a MAIOR fatia, para o
  total lançado bater com o total da folha (três fatias de 33,33% de R$ 100
  somariam R$ 99,99 sem isso). Coberto por teste.
- **Dedução do adiantamento por chave contábil**
  (`deductionByWorksiteClass`): sem isso, o salário de um centro de custo
  abateria o adiantamento lançado em outro.
- **`org_id` do rateio vem do colaborador**, não do seletor do topo — em "Todas
  as organizações" o contexto é `null` e a coluna é `NOT NULL`.

### Falta

1. Aplicar `aplicar_20270914000005_employee_cost_splits.sql` no SQL Editor —
   **antes** do deploy do front.
2. Conferência na tela (não feita aqui).
