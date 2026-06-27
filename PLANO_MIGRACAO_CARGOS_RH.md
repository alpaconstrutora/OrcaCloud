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

## Fase 1 — Aba "Cargos & Funções" no RH ✅ (em andamento)

- Novo componente `components/LaborCargos.tsx` — gestor de cargo autocontido, **reusa**
  `orgGovernanceService` (zero lógica nova de dados). Tema claro (slate/white) do LaborModule.
- Seletor de empresa interno (mesma query da Governance), pois cargo é por-empresa.
- CRUD completo: criar/editar/excluir cargo, com campo **responsabilidades** (corrige lacuna:
  o modal da Governance tinha o estado mas omitia o input).
- Integração: tab `cargos` em `LaborModule` + rota `labor-cargos` em `AppRouter` + item de
  menu em `Layout` (grupo "Pessoas") + card no dashboard de RH.

## Fase 2 — Governance vira consumidor

- Trocar o CRUD de cargo na aba Organograma por **lista read-only + seletor**.
- Banner: "Cargos são gerenciados em RH › Cargos & Funções".
- Corrigir bug `data_Campanha` em `orgGovernanceService.ts` `saveCommittee` (grava coluna
  inexistente em vez de `data_encerramento`).

## Fase 3 — Resolver escopo `company_id` × `org_id` ⚠️ (portão de decisão)

Três caminhos (decisão **pendente** do cliente):
- **3a.** Manter `company_id` — RH seleciona empresa. Zero migration. *(recomendação preliminar)*
- **3b.** Adicionar `org_id` a `org_roles` — cargo nos dois níveis.
- **3c.** Migrar para `org_id` — cargo org-level puro; toca FKs/RLS de 4 features + backfill.

## Fase 4 — Gaps do PRD que pertencem a RH (incremental, 1 por vez)

- Faixa salarial por cargo/nível
- Catálogo de competências ligado ao cargo
- Trilha de carreira Jr→Pleno→Sr
- *(Ponte cargo→permissão fica fora — é de Governance/acesso)*

Relaciona: gap audit em memória `project_opura_governance_gap_audit`.
