# RH › Colaborador — Aba "Histórico Salarial"

## Pedido original

> recursos humanos\colaborador:
> 1) implemente aba com tabela padrao com historico de salarios
> continue com o plano

(Sessão de 2026-08-07.)

## Contexto

Hoje o salário do colaborador é um escalar único: `employees.base_salary`, editado
na aba **Geral** de [LaborEmployeeForm.tsx:531](orçacloud-saas/components/LaborEmployeeForm.tsx#L531)
e gravado por [laborService.updateEmployee](orçacloud-saas/services/laborService.ts#L724).
Alterar o valor **sobrescreve o anterior sem nenhuma trilha** — não existe tabela
`salary_history`, `employee_salaries` nem equivalente em nenhuma das 15 migrations
que tocam salário. Não dá para responder "quanto essa pessoa ganhava em 2025",
"quando foi o último reajuste", "isso foi mérito ou dissídio". O motor de folha
([payrollEngine.ts:175](orçacloud-saas/services/payrollEngine.ts#L175)) consome o
valor corrente e já tem um comentário reconhecendo o buraco (`payrollEngine.ts:450`).

O que existe de correlato **não resolve**: `org_roles.salario_minimo/maximo` é faixa
por cargo (não por pessoa); `hr_turnover_events.salario_entrada/saida` é BI de
turnover; `payroll_*` é snapshot mensal do cálculo, não histórico contratual.

**Resultado esperado:** uma aba nova na tela do colaborador com a tabela padrão do
app listando cada alteração salarial (data de vigência, motivo, valor anterior/novo,
variação, cargo e jornada na época, anexo do termo), em mão dupla com
`employees.base_salary` — os dois nunca divergem.

### Decisões travadas com o usuário (2026-08-07)

1. **Mão dupla.** Lançar reajuste na aba grava `base_salary` (recalculando
   `hourly_cost`/`daily_cost`); alterar o Salário Base na aba Geral gera registro
   automático no histórico.
2. **Campos completos:** básico + cargo na época + jornada/tipo de contrato + anexo.
3. **Captura automática por trigger no banco** — pega ATS, import e SQL manual,
   não só o formulário.

---

---

## ESTADO (2026-08-07)

| Fase | Estado |
|---|---|
| 0 — plano no repo | ✅ este arquivo |
| 1 — banco | ✅ `aplicar_20270904000000` **APLICADA** (2026-08-07) |
| 1f — correção `REVOKE anon` nas RPCs | ✅ `aplicar_20270904000001` **APLICADA e reconferida** |
| 2 — service | ✅ |
| 3a/3b/3c — UI | ✅ código pronto e verificado em harness isolado |
| Segurança (anon) contra o banco real | ✅ sondado com a chave anon |
| Comportamento (backfill, trigger, vigência, exclusão) | ❌ **NÃO conferido** |

**Sondagem de segurança feita em 2026-08-07 com a `VITE_SUPABASE_ANON_KEY`:**
tabela `42501 permission denied for table` (mais restrita que `employees`, que
devolve `[]` ao anon); as duas RPCs `42501 permission denied for function`.

**O que continua sem prova:** backfill, trigger de captura, vigência futura,
lançamento retroativo, exclusão do último reajuste e a mão dupla no
"Salvar Alterações". Exigem escrita autenticada — o repo só tem a anon key, e a
credencial de leitura disponível é read-only por decisão do usuário. Roteiro no
fim deste arquivo; o caminho prático é exercer pela própria tela.

**Verificado de fato:** `tsc --noEmit` limpo; `check-ui-standard.sh` limpo nos 3
arquivos novos/tocados; suíte completa 870/870; e Playwright em harness isolado
(serviço mockado) cobrindo tabela, busca, ordenação, painel de colunas, Sheet com
variação ao vivo, gravação com atualização de estado local, e a aba renderizando
dentro do `LaborEmployeeForm` real. **Nada foi exercido contra o banco.**

---

## Fase 0 — Registrar o plano no repo (REGRA #6) ✅

- [x] Este arquivo, com o `## Pedido original` literal. Atualizar ESTE arquivo
      conforme o trabalho anda.

## Fase 1 — Banco

Arquivo: `orçacloud-saas/supabase/migrations/aplicar_20270904000000_employee_salary_history.sql`

Prefixo `aplicar_` = convenção vigente desde `20270903*`: **aplicar à mão pelo SQL
Editor**. O histórico de migrations está furado — **nunca `supabase db push`.**

### 1a. Tabela `employee_salary_history`

Espelhar o padrão de tabela-filha de `employees` já usado em
[20260325183000_employee_documents.sql](orçacloud-saas/supabase/migrations/20260325183000_employee_documents.sql).

```sql
CREATE TABLE IF NOT EXISTS public.employee_salary_history (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id          UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    effective_date       DATE NOT NULL,
    previous_salary      NUMERIC(14,2),
    new_salary           NUMERIC(14,2) NOT NULL CHECK (new_salary >= 0),
    change_type          TEXT NOT NULL DEFAULT 'OUTRO' CHECK (change_type IN
                            ('ADMISSAO','MERITO','PROMOCAO','DISSIDIO',
                             'ENQUADRAMENTO','REDUCAO','AJUSTE','OUTRO')),
    -- contexto na época (decisão 2)
    org_role_id          UUID REFERENCES public.org_roles(id) ON DELETE SET NULL,
    role_label           TEXT,          -- snapshot textual: sobrevive à exclusão do cargo
    jornada_horas_semana NUMERIC(5,2),
    contract_type        TEXT,
    -- anexo
    file_url             TEXT,
    file_name            TEXT,
    notes                TEXT,
    source               TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','AUTO')),
    created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_salary_hist_employee
    ON public.employee_salary_history(employee_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_emp_salary_hist_org
    ON public.employee_salary_history(org_id);
```

Variação R$/% **não** é coluna gerada — calculada na UI, evita guarda de divisão por zero.

RLS (padrão da REGRA de segurança: camada `authenticated` explícita, anon fora):

```sql
ALTER TABLE public.employee_salary_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_salary_hist_org_access" ON public.employee_salary_history
    FOR ALL TO authenticated
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));
REVOKE ALL ON public.employee_salary_history FROM anon;
```

Trigger `updated_at`: reusar `public.update_labor_updated_at()` (já existe).

**Pronto quando:** `select * from employee_salary_history limit 1` roda; `pg_policies`
mostra a policy com `roles = {authenticated}`; anon recebe permissão negada.

### 1b. RPC `fn_register_salary_change` — a mão dupla, atômica

`SECURITY INVOKER` (a RLS do chamador vale) + `SET search_path = public`.
Depois: `REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE TO authenticated`
(memória: RPC nova = revoke public por padrão).

Faz, numa transação:
1. `SELECT ... FOR UPDATE` no `employees` → lê `base_salary` como `previous_salary`.
2. `INSERT` na `employee_salary_history` com `source='MANUAL'`.
3. Chama `fn_sync_employee_current_salary(p_employee_id)` (1c).

Retorna `public.employee_salary_history` (o tipo da tabela — **não** `RETURNS TABLE`,
que causa 42702 por variável OUT homônima; ver memória `plpgsql_returns_table_ambiguidade`).

### 1c. `fn_sync_employee_current_salary(p_employee_id uuid)`

Recalcula qual registro é o **vigente** — maior `effective_date` **que já chegou**
(`effective_date <= CURRENT_DATE`) — e grava em `employees`:
`base_salary = vigente.new_salary`, `hourly_cost = base/220`, `daily_cost = hourly*8`
(mesma fórmula que a aba Geral já usa em `LaborEmployeeForm.tsx:537-538`).

Antes do UPDATE: `PERFORM set_config('app.skip_salary_history','on',true)` — impede
que o trigger de 1d grave uma linha duplicada. É a razão de a escrita passar por RPC
em vez de ir direto pelo PostgREST.

Chamada também após **editar** e **excluir** registro, para o vigente voltar ao lugar
certo quando alguém apaga o último reajuste.

**Vigência futura:** `effective_date > CURRENT_DATE` é aceito e fica marcado como
*Programado* na tabela, mas **não** mexe em `base_salary` até a data chegar. Aplicar
sozinho no dia exige cron — fica como Fase 4, declarada, não silenciada.

### 1d. Trigger de captura automática

```sql
CREATE TRIGGER trg_employees_salary_history
AFTER INSERT OR UPDATE OF base_salary ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.fn_log_employee_salary_change();
```

A função (`SECURITY DEFINER`, `search_path = public`):
- sai imediato se `current_setting('app.skip_salary_history', true) = 'on'`;
- **INSERT** com `base_salary > 0` → linha `change_type='ADMISSAO'`,
  `effective_date = COALESCE(NEW.hire_date, CURRENT_DATE)`, `source='AUTO'`
  (é isso que faz a contratação pelo ATS entrar no histórico);
- **UPDATE** com `COALESCE(NEW.base_salary,0) IS DISTINCT FROM COALESCE(OLD.base_salary,0)`
  → linha `change_type='AJUSTE'`, `effective_date = CURRENT_DATE`, `source='AUTO'`;
- em ambos, copia `role`/`role_id`/`jornada_horas_semana`/`contract_type` e `auth.uid()`.

⚠️ **Risco a declarar:** `employees` é tabela quente e criar trigger pega
`ACCESS EXCLUSIVE` por um instante. É DDL leve (sem FK nem view nova sobre a tabela),
mas rodar fora do horário de pico. Verificar antes se `employees.role_id` de fato
referencia `org_roles` — o formulário usa `role_id`, confirmar no schema real antes
de copiá-lo para `org_role_id`.

### 1e. Backfill (opcional, na mesma migration)

Uma linha `ADMISSAO` para cada colaborador existente com `base_salary > 0` e sem
histórico, usando `hire_date`. Sem isso, todo colaborador antigo abre a aba vazia e o
KPI "variação acumulada" nasce sem base.

**Pronto quando:** `select count(*) from employee_salary_history where change_type='ADMISSAO'`
bate com `select count(*) from employees where base_salary > 0`.

## Fase 2 — Service

Arquivo: `orçacloud-saas/services/laborService.ts` (já é o dono de `employees` e
`employee_documents`; não criar service novo).

- `export interface EmployeeSalaryRecord` — espelha a tabela.
- `listSalaryHistory(employeeId)` — **colunas explícitas**, nunca `select('*')`
  (memória `feedback_select_narrowing`), com join `org_role:org_roles(id, nome)`,
  ordenado por `effective_date DESC, created_at DESC`.
- `registerSalaryChange(payload, file?)` — se houver anexo, sobe primeiro para o
  bucket `organization-assets` em `labor-salary-history/{employee_id}/…`, reusando
  `validateDocumentFile` e o formato de `uploadDocument` ([laborService.ts:1071](orçacloud-saas/services/laborService.ts#L1071));
  depois `supabase.rpc('fn_register_salary_change', {...})`.
- `updateSalaryRecord(id, patch)` / `deleteSalaryRecord(id)` — update/delete direto
  (RLS cobre) + `supabase.rpc('fn_sync_employee_current_salary', { p_employee_id })`;
  no delete, remover também o arquivo do storage (padrão de `replaceDocumentFile`).

**Pronto quando:** as 4 funções compilam e `registerSalaryChange` devolve o registro
com `previous_salary` preenchido pelo banco.

## Fase 3 — UI

### 3a. `components/LaborEmployeeSalaryHistory.tsx` (novo)

Props: `{ employeeId, orgId, currentSalary, roleId, roleLabel, jornada, contractType,
onSalaryApplied }`.

Tabela padrão — usar os utilitários existentes, sem reinventar
(`components/ui/TableUtils.tsx`), tomando **[ClientList.tsx](orçacloud-saas/components/ClientList.tsx)
como referência canônica** (é o piloto do drag-and-drop de colunas):

- `useTableColumns(SALARY_COLUMNS, 'employeeSalaryHistoryColumns')` + `orderedVisibleColumns`
- `useResizableColumns(DEFAULT_COL_WIDTHS, 'employeeSalaryHistoryColWidths')` e
  `tableTotalWidth` somado coluna a coluna (§6.1 — nunca `w-full`)
- `SortableHeader` em toda coluna de valor único (§6.3), `<thead>` sentence case (§6.2)
- `<colgroup>` com o espaçador **antes** de Ações (§6.1.1); `px-6` + `border-r` (§6.6)
- `usePersistedState('employeeSalaryHistory:search', '')` para a busca (§3)
- `ColumnConfigButton` + autofit `MoveHorizontal` (engrenagem = mostrar/ocultar;
  MoveHorizontal = ajustar largura — são coisas diferentes)
- `ActionIconButton kind="edit" / "delete" / "download"` (anexo) na coluna de ações (§9.2)
- `useConfirm()` na exclusão (§14), nunca `window.confirm`
- Empty state §12 **sem moldura própria** (o card acoplado já supre)
- Motivo (`change_type`) como **texto colorido**, nunca pílula `rounded-full uppercase` (§8)

Colunas: Vigência · Motivo · Salário anterior · Novo salário · Variação (R$) ·
Variação (%) · Cargo · Jornada · Contrato · Anexo · Observações · Origem.
Visíveis por padrão: Vigência, Motivo, Anterior, Novo, Variação (%), Cargo.

Layout: toolbar de botões §5.3 (ação primária **"Registrar reajuste"**) acima, e
toolbar **acoplada** §5.2 — busca + filtro de motivo + ColumnConfigButton + autofit —
costurada no mesmo card da tabela. Larguras default próximas do container real
(memória: toolbar acoplada sem busca é capenga; larguras estreitas demais também).

4 KPIs (`components/ui/KpiCard.tsx`) no topo da aba: Salário vigente · Último reajuste
(data + %) · Variação acumulada desde a admissão · Nº de reajustes.

Estado local pós-ação (§22): CRUD atualiza o array em memória, **sem recarregar tudo**.

⚠️ **Datas:** formatar com `formatDateBR` de `components/ui/Format.tsx` — nunca
`new Date('YYYY-MM-DD').toLocaleDateString()`, que erra o dia por fuso.

### 3b. `components/LaborSalaryRecordSheet.tsx` (novo)

Painel lateral (`components/ui/sheet.tsx`) para criar/editar — padrão de 70–80% dos
casos por `UI_PATTERNS.md`; modal central só para interrupção crítica, e aqui não é.
Modelo próximo: `components/academy/AcademyRecordSheet.tsx`.

Campos: data de vigência · motivo (select) · novo salário (mostrando o anterior e a
variação calculada ao vivo) · cargo (select de `org_roles` da empresa, pré-preenchido
com o atual) · jornada · tipo de contrato · observações · anexo. Rótulos §21.

### 3c. Ligar no formulário — `components/LaborEmployeeForm.tsx`

- Mover `EMPLOYEE_TABS` para escopo de módulo como `BASE_EMPLOYEE_TABS`, derivar
  `type EmployeeTabId = typeof BASE_EMPLOYEE_TABS[number]['id']` e trocar a union
  literal escrita à mão do `useState` da linha 63.
- Acrescentar `{ id: 'salarios', label: 'Histórico Salarial' }` **depois de 'folha'**,
  e **só quando `isEditing`** — colaborador novo ainda não tem `id`, a aba não tem o
  que listar. No modo "Novo Colaborador" (o branch modal da linha 1034) a aba não aparece.
- Entrada em `TAB_SUBTITLES` (§19.1 exige subtítulo por aba): *"Reajustes, promoções e
  dissídios com data de vigência, motivo e documento."*
- Bloco em `renderTabContent()` renderizando `<LaborEmployeeSalaryHistory … />`.
- Aba Geral: manter o campo Salário Base **editável** (decisão 1 = mão dupla) e
  acrescentar a nota *"Alterações aqui geram registro automático no Histórico Salarial."*

⚠️ **Armadilha que precisa de cuidado explícito:** a aba grava direto no banco, mas o
`form` state do componente ainda segura o `base_salary` antigo — clicar
**"Salvar Alterações"** depois regravaria o valor velho por cima. Por isso o callback
`onSalaryApplied(newSalary, hourlyCost, dailyCost)` tem de fazer `setForm(prev => …)`
com os três campos. Sem isso a mão dupla se desfaz no primeiro save.

### 3d. Aditivo não previsto: `defaultHidden` em `useTableColumns`

`components/ui/TableUtils.tsx` não tinha como declarar coluna que nasce oculta —
a tabela abria com 12 colunas e estourava a largura do card, empurrando "Ações"
para fora da tela. Tentar esconder por `toggleColumn` num `useEffect` não funciona:
o `useEffect` interno do próprio `useTableColumns` já gravou o localStorage antes.

Solução: `ColumnConfig.defaultHidden?: boolean`. Mudança **aditiva** — telas que
não usam a flag têm `defaultVisibleColumns === allColumns` e comportamento
idêntico ao anterior. O cuidado que faltava é que `knownColumns`/`columnOrder`
precisam cobrir **todas** as colunas (inclusive as ocultas), senão a coluna oculta
seria redescoberta como "coluna nova" no carregamento seguinte e voltaria sozinha —
mesmo raciocínio já aplicado em `resetColumns`.

## Fase 4 — Declaradamente fora do escopo agora

- Cron que aplica reajuste **programado** no dia da vigência (hoje: só marca *Programado*).
- Ler o histórico dentro do `payrollEngine` para folha retroativa — continua usando o
  `base_salary` vigente.
- Exibir o histórico no Portal do Colaborador.

---

## Verificação

Mecânica (obrigatória antes de reportar):

```bash
cd orçacloud-saas
bash scripts/check-ui-standard.sh components/LaborEmployeeSalaryHistory.tsx
bash scripts/check-ui-standard.sh components/LaborSalaryRecordSheet.tsx
bash scripts/check-ui-standard.sh components/LaborEmployeeForm.tsx
npx vitest run __tests__/orgContextGuard.test.ts
npx tsc --noEmit
```

E o relato tem de listar item a item o `CHECKLIST DE APLICAÇÃO` do
`docs/ui_ux_guia_unificado.md` (REGRA #1, passo 3) — inclusive dizendo o que não se
aplica. `tsc` e o script **não provam comportamento**.

No banco (SQL Editor):
1. `UPDATE employees SET base_salary = base_salary + 100 WHERE id = '<teste>'` →
   nasce linha `AJUSTE` / `source='AUTO'`. Prova o trigger.
2. `SELECT fn_register_salary_change(...)` com data de hoje → `employees.base_salary`,
   `hourly_cost` e `daily_cost` mudam juntos, e **não** aparece linha duplicada
   (prova o `set_config`).
3. Registro com `effective_date` futura → histórico ganha a linha, `base_salary` **não** muda.
4. Registro retroativo (data anterior ao último) → `base_salary` **não** muda.
5. Excluir o último reajuste → `base_salary` volta ao anterior.
6. Como `anon`: `select` na tabela deve ser negado.

No navegador (RH › Colaboradores › editar um colaborador › aba **Histórico Salarial**) —
esta parte é o que decide se está pronto, não os comandos acima:
- a aba lista o backfill de admissão e os KPIs batem;
- "Registrar reajuste" abre o Sheet, salva, a linha entra na tabela **sem recarregar
  a tela**, e o campo Salário Base da aba Geral já mostra o valor novo;
- clicar "Salvar Alterações" logo em seguida **não** reverte o salário (a armadilha da 3c);
- anexo sobe e o botão de download abre o arquivo;
- excluir pede confirmação via `useConfirm` e ressincroniza o salário;
- busca, ordenação, mostrar/ocultar coluna e ajuste de largura funcionam e persistem
  ao reabrir;
- aba **não** aparece em "Novo Colaborador".

Se algum passo do navegador não for executado, o relatório diz isso explicitamente —
nada de "corrigido" sem cenário rodado.
