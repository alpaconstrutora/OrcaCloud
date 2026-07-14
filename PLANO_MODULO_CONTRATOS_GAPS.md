# PLANO DE IMPLEMENTAÇÃO — Gaps do Módulo Suprimentos → Contratos

> Origem: auditoria de correspondência entre o **Contrato Matriz v2.0**, o
> **Manual Interno de Contratação v2.0** e o módulo **Suprimentos → Contratos**
> (jul/2026). Dos 91 itens dos documentos, **35 não têm correspondência (✗)** e
> **40 são parciais (◐)**. Este plano cobre as lacunas com adições ao módulo,
> respeitando os princípios de ouro: **integrar, não construir; reusar, não
> duplicar; moat = integração vertical orçamento→contrato→obra→medição→faturamento.**

## Princípios de escopo (o que NÃO recriar)

| Assunto do documento | Já vive em | Ação neste plano |
|---|---|---|
| Cotação/comparação (Manual §9) | módulo Procurement/Cotação | **Não recriar** — só linkar `quotation_id` no contrato |
| Due diligence/certidões/CNPJa (Manual §7) | módulo **Fornecedores** (`supplierService`) | **Reusar** — puxar status do fornecedor, não duplicar cadastro |
| Cronograma/curva-S/marcos (Cl.14, Anexo IV) | módulo **Planejamento** | **Linkar** ao `project_id`; não duplicar cronograma |
| Retenção/enquadramento fiscal (Cl.17, Manual §15) | módulo **Fiscal** (IN RFB 2.110) | **Parametrizar por documento**, chamar o Fiscal |
| RACI completa/alçadas (Manual §2, §20) | módulo **Governança/Alçadas** | **Reusar** `authority_limits` para gates |
| Não conformidade estruturada (Cl.20) | módulo **Processos** | **Disparar** instância de processo, não recriar NC |
| Cláusulas redacionais (Cl.1,3,5,25–27,29,36–38) | `contract_templates` ({{var}}) | **Enriquecer** o mapa de variáveis (Fase 8) |

## Numeração e convenções

- Migrations a partir de **`20270130000010`** (última aplicada: `20270129000007`; as 4 da Fase 5 foram
  renumeradas de `20270130000000-3` para `20270130000010-3` para evitar colisão de timestamp com
  `20270130000000_add_nickname_to_suppliers.sql`, de outra sessão em paralelo — ver
  `feedback_sessoes_paralelas_git`).
- Nome: `AAAAMMDD000000_faseN_descricao.sql`.
- Tipos em `types/contracts.ts`; serviço em `services/contractService.ts` (ou novos
  serviços finos por domínio); UI em novas abas/cards do `ContractDetailView.tsx`.
- **Toda** tabela nova: `organization_id NOT NULL` + RLS no padrão Empreendimentos
  (dual-check `uid + email`, ver `feedback_rls_organization_members`).
- Antes do push: `tsc --noEmit` local + `bash scripts/check-ui-standard.sh` nos
  `.tsx` tocados (regra obrigatória #1 do `CLAUDE.md`).

---

# ROADMAP — 4 fases

| Fase | Nome | Lacunas cobertas | Valor | Status |
|---|---|---|---|---|
| **5** | Blindagem Jurídico-Financeira | Seguros, Garantias, Retenção faseada, Penalidades, Limite de responsabilidade, CNO | 🔴 Alto (risco legal) | ✅ **IMPLEMENTADA** (migrations `20270130000010-13`) |
| **6** | Governança da Contratação | Risco R1/R2/R3, Questionário trabalhista, Ordem de Início, Pré-mobilização, Matriz documental/condicionantes | 🟠 Alto (compliance) | ✅ **IMPLEMENTADA** (migrations `20270201000010-13`) |
| **7** | Ciclo de Vida & Encerramento | Recebimento provisório/definitivo, Dossiê, ART/RRT, Avaliação de desempenho | 🟡 Médio | ✅ **IMPLEMENTADA** (migrations `20270202000010-12`) |
| **8** | Detalhamento Técnico & SST | Matriz de fornecimento/interfaces, SST condicionante, Biblioteca de cláusulas, Fiscal parametrizado | 🟢 Médio/baixo | ✅ **IMPLEMENTADA** (migrations `20270203000010-11`) |

> Fase 7 não incluiu geração de dossiê consolidado (as-built/manuais/ART/garantias/medições
> num pacote único) — ficou só o registro dos termos e das ARTs individualmente.

> Subcontratação (Cl.7, CP-03) ficou fora do escopo da Fase 6 — só o campo
> `subcontracting_rule` foi criado (migration `20270201000012`); regra de
> aplicação/validação ainda não tem UI.

---

## FASE 5 — Blindagem Jurídico-Financeira ✅ IMPLEMENTADA

**Objetivo:** fechar as lacunas de maior risco legal (seguros, garantias, multas,
limite de responsabilidade) e a liberação de retenção por fase. Tudo são adições
que não quebram nada existente.

### 5.1 — Seguros & Garantias (CP-08, CP-10, Cl.24, Anexo VIII)

Migration `20270130000010_fase5_contract_guarantees.sql`:

```sql
create table contract_guarantees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  contract_id uuid not null references contracts(id) on delete cascade,
  kind text not null,          -- RC_GERAL | RC_PROFISSIONAL | SEGURO_GARANTIA
                               -- | FIANCA | CAUCAO | EQUIPAMENTOS | AMBIENTAL
                               -- | GARANTIA_ADIANTAMENTO
  insurer text,                -- seguradora / instituição
  policy_number text,          -- nº da apólice/instrumento
  coverage_limit numeric(15,2),
  premium numeric(15,2),
  valid_from date,
  valid_until date,
  document_url text,           -- GED: apólice + comprovante de prêmio
  status text not null default 'VIGENTE',  -- VIGENTE | VENCIDA | CANCELADA | SUBSTITUIDA
  notes text,
  created_at timestamptz default now()
);
-- RLS dual-check padrão + índice (contract_id, kind)
```

- **Tipos** (`types/contracts.ts`): `ContractGuarantee`, enum `GuaranteeKind`.
- **Serviço** (`services/contractGuaranteeService.ts`): `list(contractId)`,
  `save`, `remove`, `listExpiring(days)` (para alerta do dashboard).
- **UI:** novo card **"Seguros & Garantias"** na aba *Visão Geral* do
  `ContractDetailView` + tabela CRUD; badge de status por vigência.
- **Alerta:** `ContractsDashboard` ganha KPI "Apólices vencendo 30d" e alerta
  crítico (reusa a estrutura de alertas já existente na aba *Carteira*).

### 5.2 — Retenção faseada / liberação (CP-08, Cl.18)

Estende `contracts` + já existe `retention_rate` e `retention_value` na medição.
Migration `20270130000011_fase5_retention_release.sql`:

```sql
alter table contracts
  add column retention_cap numeric(15,2),          -- limite acumulado
  add column retention_release_provisional int default 50,  -- % no recebimento provisório
  add column retention_release_definitive int default 50,   -- % no definitivo
  add column retention_definitive_days int default 90;      -- carência p/ definitivo
```

- **Serviço:** `contractService.getRetentionLedger(contractId)` — soma retido nas
  medições, mostra liberado vs a liberar por marco (provisório/definitivo).
- **UI:** bloco **"Retenção"** na aba *Financeiro* com barra retido/liberado;
  botão "Liberar retenção" gera lançamento no Financeiro (reusa sync existente).
- **Gate:** liberação do definitivo bloqueada se não houver recebimento definitivo
  (Fase 7) — por ora, liberação manual com aviso.

### 5.3 — Penalidades & Limite de Responsabilidade (CP-09, CP-10, Cl.23, Cl.31)

Migration `20270130000012_fase5_contract_penalties.sql`:

```sql
alter table contracts
  add column liability_cap numeric(15,2),           -- limite geral de responsabilidade
  add column penalty_daily_rate numeric(6,4),       -- % ao dia (mora)
  add column penalty_moratoria_cap numeric(6,4),    -- teto da mora (% da base)
  add column penalty_material_rate numeric(6,4);    -- % inadimplemento material

create table contract_penalties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  contract_id uuid not null references contracts(id) on delete cascade,
  kind text not null,          -- MORATORIA | COMPENSATORIA | SST | OUTRA
  reason text not null,
  base_value numeric(15,2),
  amount numeric(15,2) not null,
  status text not null default 'NOTIFICADA', -- NOTIFICADA | EM_CURA | APLICADA | CANCELADA
  cure_deadline date,          -- prazo de cura (3 dias úteis padrão)
  applied_at date,
  compensated_measurement_id uuid references contract_measurements(id),
  notes text,
  created_at timestamptz default now()
);
```

- **Serviço** (`contractPenaltyService.ts`): `apply`, `cure`, `cancel`,
  `compensateInMeasurement(penaltyId, measurementId)` — abate no `net_value`.
- **UI:** card **"Penalidades"** na aba *Financeiro*; fluxo notificação → cura →
  aplicação; compensação abate na próxima medição.
- **Regra:** limite de responsabilidade e multas alimentam o mapa de variáveis do
  Template (Fase 8) para saírem no PDF do contrato.

### 5.4 — Campos avulsos da obra (CP-02)

Migration `20270130000013_fase5_contract_cno.sql`:

```sql
alter table contracts
  add column cno text,                 -- CNO / matrícula da obra
  add column obra_registration text,
  add column manager_name text,        -- gestor da obra
  add column inspector_name text;      -- fiscal do contrato
```

- **UI:** campos na seção *Identificação da Obra* do `ContractModal`.

**Esforço Fase 5:** ~4 migrations, 2 serviços novos, 3 cards de UI. **M/G.**

---

## FASE 6 — Governança da Contratação ✅ IMPLEMENTADA

**Objetivo:** trazer o fluxo do Manual (§3, §4, §8, §11, §14) para dentro do
sistema como **gates** que condicionam a mobilização. Reusa Governança e Aprovação.

> Implementada e testada (jul/2026). Migrations reais: `20270201000010_fase6_contract_risk_assessments.sql`,
> `20270201000011_fase6_labor_risk_questionnaire.sql`, `20270201000012_fase6_mobilization.sql`,
> `20270201000013_fase6_document_requirements.sql` (os nomes de arquivo abaixo são do rascunho original
> e não refletem os nomes finais). UI: `ContractRiskModal`, `ContractLaborQuestionnaireModal`,
> `ContractDocumentRequirementModal` + 4 cards no `ContractDetailView` (Classificação de Risco,
> Risco Trabalhista, Pré-mobilização, Matriz Documental).

### 6.1 — Classificação de Risco R1/R2/R3 (Manual §3)

Migration `20270131000000_fase6_contract_risk.sql`:

```sql
create table contract_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  contract_id uuid not null references contracts(id) on delete cascade,
  -- 8 fatores do Manual §3, cada 0/1/2
  factor_canteiro int, factor_equipe int, factor_sst int, factor_valor int,
  factor_tecnica int, factor_dados int, factor_continuidade int, factor_pf int,
  score int generated always as (
    coalesce(factor_canteiro,0)+coalesce(factor_equipe,0)+coalesce(factor_sst,0)
    +coalesce(factor_valor,0)+coalesce(factor_tecnica,0)+coalesce(factor_dados,0)
    +coalesce(factor_continuidade,0)+coalesce(factor_pf,0)
  ) stored,
  level text generated always as (
    case when (...) >= 10 then 'R3' when (...) >= 5 then 'R2' else 'R1' end
  ) stored,
  assessed_by text, assessed_at timestamptz default now()
);
```

- **Serviço:** `contractRiskService.assess`, `getLevel`.
- **UI:** wizard curto (8 selects) no `ContractModal`, aba/etapa "Risco"; badge
  R1/R2/R3 no card do contrato e na `SupplyChainContractList`.
- **Gate:** R3 e PF com fator 2 exigem **aprovação Jurídico** (liga na
  `approval_chain` já existente da Fase 2) e travam anexos obrigatórios.

### 6.2 — Questionário de Risco Trabalhista (Manual §8, Anexo H, Cl.5)

Migration `20270131000001_fase6_labor_risk_questionnaire.sql`:

```sql
create table contract_labor_questionnaires (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  contract_id uuid not null references contracts(id) on delete cascade,
  q_horario bool, q_ordens bool, q_pessoalidade bool, q_salario_fixo bool,
  q_permanente bool, q_exclusividade bool, q_cargo_email bool, q_ferias bool,
  alert_count int generated always as (
    (q_horario::int)+(q_ordens::int)+(q_pessoalidade::int)+(q_salario_fixo::int)
    +(q_permanente::int)+(q_exclusividade::int)+(q_cargo_email::int)+(q_ferias::int)
  ) stored,
  answered_by text, answered_at timestamptz default now()
);
```

- **Regra:** `alert_count >= 2` **bloqueia** contratação de PF sem parecer jurídico
  (Anexo H) — enforce no `contractService.createContract` quando `nature = 'Mão de
  Obra'`/PF. Também dispara redesenho para PJ (aviso na UI).
- **UI:** 8 toggles no fluxo; resultado ("2 alertas — exige Jurídico") em destaque.

### 6.3 — Ordem de Início & Pré-mobilização (Cl.4, Manual §11)

Migration `20270131000002_fase6_mobilization.sql`:

```sql
alter table contracts
  add column start_order_issued_at date,
  add column start_order_authorized_by text,
  add column subcontracting_rule text;   -- PROIBIDA | AUTORIZACAO_PREVIA | LISTA

create table contract_precedent_conditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null references contracts(id) on delete cascade,
  item text not null,          -- ART, seguros, PGR/PCMSO/ASO, garantia, etc.
  required bool default true,
  satisfied bool default false,
  evidence_url text,
  responsible text
);
```

- **Serviço:** `contractService.issueStartOrder(contractId)` — só permite se todas
  as condições precedentes `required` estiverem `satisfied`; seta status → `Ativo`.
- **UI:** card **"Pré-mobilização"** (checklist do Manual §11) na aba *Visão Geral*;
  botão "Emitir Ordem de Início" desabilitado até checklist completo.

### 6.4 — Matriz Documental & Condicionantes (Anexo V, Manual §14)

Estende o `release_requirements` já existente (booleano) para uma matriz por
documento. Migration `20270131000003_fase6_document_requirements.sql`:

```sql
create table contract_document_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null references contracts(id) on delete cascade,
  document text not null,      -- CND, FGTS, PGR, ASO, ART, NF...
  phase text not null,         -- ANTES_INICIO | MENSAL | ENCERRAMENTO
  applicable bool default true,
  last_valid_until date,
  blocks_payment bool default true
);
```

- **Serviço:** `getPaymentGate(contractId)` consolida release_requirements +
  documentos vencidos → retorna o que bloqueia a medição.
- **UI:** integra ao **gate de pagamento** já existente em `createMeasurement`.

**Esforço Fase 6:** ~4 migrations, 2 serviços, 3 cards + wizard. **G.**

---

## FASE 7 — Ciclo de Vida & Encerramento

**Objetivo:** modelar recebimento provisório/definitivo, dossiê de encerramento,
responsabilidade técnica e avaliação de desempenho. Fecha o loop com a Fase 5
(liberação de retenção passa a depender do recebimento definitivo).

### 7.1 — Recebimento Provisório/Definitivo & Dossiê (Cl.21, Cl.33, Manual §18)

Migration `20270201000000_fase7_contract_acceptances.sql`:

```sql
create table contract_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null references contracts(id) on delete cascade,
  kind text not null,          -- PROVISORIO | DEFINITIVO
  issued_at date,
  pending_items jsonb,         -- lista de pendências (descrição, prazo, responsável)
  term_url text,               -- termo assinado (GED)
  issued_by text,
  created_at timestamptz default now()
);
```

- **Serviço:** `contractService.issueAcceptance(kind, ...)`; o **definitivo**
  libera a parcela de retenção definitiva (integra 5.2) e move status → `Encerrado`.
- **UI:** aba nova **"Recebimento"** (ou card na *Visão Geral*): termo provisório,
  lista de pendências com prazo, termo definitivo, geração do **dossiê** (agrega
  as built/manuais/ART/garantias/medições num pacote).

### 7.2 — Responsabilidade Técnica ART/RRT/TRT (Cl.10, CP-01, Anexo E)

Migration `20270201000001_fase7_technical_responsibility.sql`:

```sql
create table contract_technical_responsibilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null references contracts(id) on delete cascade,
  professional_name text not null,
  council text,                -- CREA | CAU | CRT
  council_number text,
  art_type text,               -- ART | RRT | TRT
  art_number text,
  valid_from date, valid_until date,
  status text default 'VALIDA', -- VALIDA | SUSPENSA | CANCELADA | BAIXADA
  document_url text
);
```

- **Regra:** ART inválida/vencida **suspende** pagamentos do trecho (Cl.10.2) —
  entra no gate de pagamento (6.4).
- **UI:** card **"Responsabilidade Técnica"** na *Visão Geral*; alerta de vencimento
  no dashboard.

### 7.3 — Avaliação de Desempenho do Prestador (Manual §17)

Migration `20270201000002_fase7_contract_evaluations.sql`:

```sql
create table contract_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null references contracts(id) on delete cascade,
  supplier_id uuid references suppliers(id),
  period text,
  score_quality numeric(3,1), score_deadline numeric(3,1),
  score_sst numeric(3,1), score_compliance numeric(3,1),
  score_communication numeric(3,1), score_commercial numeric(3,1),
  weighted numeric(4,2),       -- média ponderada (pesos do Manual §17)
  evaluated_by text, created_at timestamptz default now()
);
```

- **Reuso:** nota agregada por `supplier_id` volta para o módulo **Fornecedores**;
  nota < 2 ou ocorrência crítica **bloqueia novas contratações** (flag no supplier).
- **UI:** card na aba *Visão Geral* + histórico; média exibida no `SupplierList`.

**Esforço Fase 7:** ~3 migrations, extensões de serviço, 1 aba + 2 cards. **M/G.**

---

## FASE 8 — Detalhamento Técnico & SST ✅ IMPLEMENTADA

**Objetivo:** granularidade técnica (matriz de fornecimento/interfaces), SST como
condicionante e a biblioteca de cláusulas para o Template. Menor risco, mais volume.

> Implementada e testada (jul/2026). Migrations reais: `20270203000010_fase8_supply_matrix.sql`
> (contract_supply_matrix + contract_interfaces) e `20270203000011_fase8_sst_and_fiscal.sql`
> (is_sst_critical/communication_deadline_hours em contract_document_requirements +
> fiscal_classification em contracts). 8.3 (biblioteca de cláusulas) ficou reduzida a um
> enriquecimento do `buildVariableMap()` com campos das Fases 5-7 (limite de responsabilidade,
> multa moratória, garantia, CNO) — não criou um editor de biblioteca de cláusulas dedicado.

### 8.1 — Matriz de Fornecimento & Interfaces (Anexos I/II, Cl.11)

Migration `20270202000000_fase8_supply_matrix.sql`:

```sql
create table contract_supply_matrix (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null references contracts(id) on delete cascade,
  item text not null,
  supplies text,        -- ALPA | CONTRATADO
  transports text, stores text, installs text,
  admissible_loss text, notes text
);
create table contract_interfaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null references contracts(id) on delete cascade,
  interface_event text not null,
  primary_responsible text, support text,
  deadline_trigger text, evidence text
);
```

- **UI:** aba **"Fornecimento & Interfaces"** (ou sub-cards na aba *Itens*), com as
  duas tabelas editáveis; substitui os campos agregados `labor_value`/`materials_value`.

### 8.2 — SST como condicionante (Cl.13, Anexo VI, Manual §16)

Não recria a gestão de SST (módulo futuro). Adiciona SST à **matriz documental**
(6.4) com validade + prazos de comunicação (risco grave 24h, etc.) como metadados,
e liga a NC de SST ao módulo **Processos**.

### 8.3 — Biblioteca de cláusulas & mapa de variáveis (Cl.1,3,5,25–27,29,36–38)

- Enriquece `contract_template_clauses` com um **catálogo padrão** (as cláusulas
  redacionais do Contrato Matriz) e amplia `buildVariableMap(contract)` para injetar
  os campos estruturados das Fases 5–7 (seguros, penalidades, RT, garantias).
- **UI:** no `ContractTemplateManager`, biblioteca de cláusulas por tema + preview.

### 8.4 — Fiscal parametrizado por documento (Cl.17, Manual §15)

- **Não recria** o Fiscal. Adiciona `fiscal_classification` no contrato/medição e
  chama o módulo Fiscal para a retenção vigente (IN RFB 2.110) por documento —
  encerra a regra "não cadastrar taxa fixa universal" (Manual §15.2).

**Esforço Fase 8:** ~2 migrations, extensões, 1 aba + biblioteca. **M.**

---

## Impacto na matriz de correspondência (após execução)

| Estado | Hoje | Após Fase 5 | Após Fase 6 | Após Fase 7 | Após Fase 8 |
|---|---|---|---|---|---|
| ✓ Total | 16 | ~22 | ~31 | ~38 | ~48 |
| ◐ Parcial | 40 | ~40 | ~38 | ~36 | ~33 |
| ✗ Nenhuma | 35 | ~29 | ~22 | ~17 | ~10 |

Residual esperado (✗ que permanecem por design): cláusulas puramente jurídicas de
interpretação (Cl.1, Cl.37), foro/mediação (Cl.38) e gestão sem subordinação
(Cl.12) — atendidas **via Template**, não como dado estruturado.

## Riscos & cuidados

- **Schema em várias camadas:** cada campo novo → grep em migration/RLS/tipos
  (2+ arquivos)/UI/service **antes** de mexer (ver `feedback_mudanca_schema_camadas`).
- **RLS:** copiar o padrão que funciona (Empreendimentos), dual-check uid+email.
- **UI standard:** rodar `check-ui-standard.sh` em cada `.tsx`; badges de status
  (R1/R2/R3, vigência de apólice) seguem §8 do guia (não `font-bold` em `<td>`).
- **Deploy:** stagear só os arquivos desta tarefa (`feedback_deploy_apenas_minha_tarefa`);
  `tsc --noEmit` local não garante build remoto — conferir untracked.
- **Sequência:** Fase 5 é pré-requisito real da liberação de retenção da Fase 7.2;
  as demais são paralelizáveis.

---

*Documento de planejamento — não implica implementação. Conferir estado real no
código antes de assumir. Base: auditoria de 91 itens, jul/2026.*
