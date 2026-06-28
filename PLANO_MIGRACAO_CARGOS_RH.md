# PLANO — Migração de Cargos & Funções para o módulo de RH

> **Princípio:** Cargo passa a ser **conceitualmente do RH** (ciclo de vida do colaborador:
> admissão, promoção, transferência, desligamento). O módulo **ÒPURA Governance** continua
> **consumindo** cargo (alçadas, organograma, sucessão, RACI) mas deixa de ser dono da tela
> de cadastro. **Não se duplica service nem tabela** — reaproveita `orgGovernanceService` e a
> tabela `org_roles`.

## Contexto técnico (estado atual)

- Cargo = tabela **`org_roles`**, escopada por **`company_id`** (tabela `companies`).
- CRUD em `services/orgGovernanceService.ts` (`listRoles`/`saveRole`/`deleteRole`).
- UI hoje embutida na aba **Organograma** de `components/OpuraGovernanceModule.tsx`.
- Elo com pessoas já existe: `employees.role_id → org_roles`.
- O cargo é referenciado por 4 features do Governance: alçadas (`authority_limits.role_id`),
  organograma (`relationships.source/target_role_id`), sucessão (`target_role_id`), RACI.
- **Descasamento de escopo:** `org_roles.company_id` (companies) vs `employees.org_id`
  (organizations), onde org→company é hierárquico. Este é o nó da Fase 3.

## Fase 1 — Aba "Cargos & Funções" no RH ✅ CONCLUÍDA (2026-06-27)

- `components/LaborCargos.tsx` — CRUD completo reusando `orgGovernanceService`.
- Tab `cargos` em LaborModule + rota `labor-cargos` + item de menu + card no dashboard.

## Fase 2 — Governance vira consumidor ✅ CONCLUÍDA (2026-06-27)

- Aba Organograma: lista read-only + banner "gerenciado em RH" + botão que navega para labor-cargos.
- Bug `data_Campanha` → `data_encerramento` corrigido em `orgGovernanceService.saveCommittee`.

## Fase 3 — Escopo `company_id` × `org_id` ✅ CONCLUÍDA — decisão 3a (2026-06-27)

- Mantido `company_id`. LaborCargos tem seletor de empresa interno. Zero migration.

## Fase 4 — Gaps do PRD ✅ CONCLUÍDA (2026-06-27)

- Migration `20261228000007`: `salario_minimo`, `salario_maximo`, `competencias[]`, `proximo_cargo_id` em `org_roles`.
- `OrgRole` type + `saveRole` payload atualizados.
- LaborCargos: 4 KPIs, badge de faixa salarial, chips de competências, trilha de carreira no card e no form.

## Fase 5 — Ponte Funcionário ↔ Cargo ⏳ PRÓXIMA

**Problema:** `employees.role` é texto livre — sem FK para `org_roles`. Headcount por cargo e
KPI "Cargos Vagos" não têm dados reais.

**Escopo:**

### 5a. Migration
```sql
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS org_role_id UUID REFERENCES public.org_roles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_org_role ON public.employees(org_role_id);
```

### 5b. LaborCargos — headcount real
- Query JOIN `employees` por `org_role_id` ao carregar roles.
- Card de cargo: exibir lista de funcionários ocupantes (nome + avatar).
- KPI "Cargos Vagos": `roles sem nenhum employee com org_role_id = role.id`.
- KPI "Cargos": total; novo KPI "Ocupantes": soma de headcount.

### 5c. Formulário do funcionário (EmployeeModal / EmployeeForm)
- Campo `role` (texto livre) substituído por select de `org_roles` da empresa do colaborador.
- Ao selecionar cargo: preenche automaticamente faixa salarial sugerida (read-only informativo).
- Manter `role` TEXT como fallback exibido caso `org_role_id` seja nulo (retrocompatibilidade).

Relaciona: gap audit em memória `project_opura_governance_gap_audit`.
