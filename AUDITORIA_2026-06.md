# Auditoria ORÇACLOUD — Junho 2026

**Data:** 2026-06-11 · **Escopo:** Segurança · Dívida técnica · Banco/Migrations · Funcional
**Base:** `orçacloud-saas/` — 311 componentes, 96 services, 282 migrations, 9 edge functions, ~202k linhas
**Saúde geral:** `tsc --noEmit` limpo (0 erros) · testes 604/615 passam (98%) · build pipeline definido

---

## 1. Segurança

### ALTO — `purchase_order_negotiations` sem RLS (vazamento cross-tenant)
**Arquivo:** `supabase/migrations/20260216000006_create_negotiations_table.sql:10-24`
**Corrigido em:** `supabase/migrations/20260612000001_rls_purchase_order_negotiations.sql`

A tabela guarda `sender_email`, `items` (jsonb com preços e quantidades congelados), `message`, `delivery_date` por pedido — dado comercial sensível por tenant. Nunca recebeu `ENABLE ROW LEVEL SECURITY` nem policy. Como o Supabase concede grants padrão a `anon`/`authenticated` no schema `public`, qualquer pessoa com a anon key (extraível do bundle) podia ler todas as negociações de todos os tenants e inserir/alterar/apagar registros. Contradiz a blindagem cross-tenant feita no `commercialFinanceService` (que era só na camada de serviço, não na tabela).

### MÉDIO — `task-alert-notifier` sem gate de autenticação
**Arquivo:** `supabase/functions/task-alert-notifier/index.ts:19-33`
**Corrigido em:** mesma função (adição de gate no início do handler)

Usava `service_role` e `Allow-Origin: *`, mas não validava `Authorization`. Suas irmãs de cron (`process-billing-ruler`, `quality-sla-enforcement`) checam `authHeader === Bearer ${serviceRole}`. Com `verify_jwt` no default, a anon key (pública) passava o gateway, então qualquer um podia disparar a função: envia e-mails de alerta e marca `alert_sent_at` em tarefas de todos os orgs.

### MÉDIO — `payroll_rubrics` e `payroll_fiscal_ranges` sem RLS
**Arquivo:** `supabase/migrations/20260325184500_payroll_module.sql:132-140`
**Corrigido em:** `supabase/migrations/20260612000002_rls_payroll_config_tables.sql`

A migration habilitava RLS em `payroll_runs/items/results/events` mas esquecia `payroll_rubrics` (config global de rubricas, sem `org_id`) e `payroll_fiscal_ranges` (faixas INSS/IRRF). Sem RLS, qualquer usuário autenticado podia INSERT/UPDATE/DELETE — alterando o cálculo de folha de todos os tenants (são tabelas globais compartilhadas).

### BAIXO — `cub_parametric_data` sem RLS
**Arquivo:** `supabase/migrations/20260220000001_create_cub_parametric.sql:1-31`
Dados de referência CUB. Sem RLS → graváveis por qualquer um com anon key (risco de integridade, não de confidencialidade).

### BAIXO — `notify-opportunity-interest` sem validação de ownership
**Arquivo:** `supabase/functions/notify-opportunity-interest/index.ts:28-50`
Aceita `interestId/opportunityId/organizationId` arbitrários e dispara e-mail aos admins via `service_role`. Fluxo público intencional (portal do investidor), mas deveria validar que o `interestId` realmente pertence à oportunidade/org antes de enviar (anti-spam/anti-enumeração).

### Pontos fortes confirmados
- **SECURITY DEFINER bem tratado:** 40 funções com hardening de `SET search_path`; RPC `get_public_marketplace` só retorna colunas whitelisted por slug→org.
- **Grant anon em `nbr_tables`/`sinapi_items` revogado** pela migration `20260214000003`.
- **Gemini desabilitado** (sem chave no front); `.env`/`.env.local` no `.gitignore` e ausentes do histórico git; `dist/` não versionado.
- **Cobertura RLS ampla:** ~228/232 tabelas com RLS habilitado antes desta auditoria.

---

## 2. Banco de dados & Migrations

### MÉDIO — Migrations fora de ordem cronológica quebram rebuild
**Arquivo:** `supabase/migrations/20240313000000_bank_reconciliation.sql:7`

`internal_transactions` (datada 2024-03-13) tem `organization_id REFERENCES organizations(id)`, mas `organizations` só nasce em `20260215000004` (2026). Um `supabase db reset` / ambiente novo / CI falha (FK para tabela inexistente). Produção não afetada (foi construído incrementalmente). A presença de `normalize_migrations.ps1`/`rename_migrations.ps1`/`undo_rename.ps1` confirma fricção histórica com ordenação.
**Ação:** renomear os arquivos `2024xxxx` para timestamps após a criação de `organizations`, ou validar via `supabase db reset` num shadow DB.

### BAIXO — Mojibake em 51/282 migrations
Casos em **valores de CHECK constraint foram remediados** por `20260706000010_fix_check_encoding.sql`. O restante está em comentários. Recomendado: re-salvar os arquivos como UTF-8 para evitar reintrodução.

---

## 3. Dívida técnica & Código

| Métrica | Valor | Observação |
|---|---|---|
| `console.log/error/warn` em fonte | **762** | sem abstração de logging; ruído em produção |
| `: any` / `as any` | **607** | typecheck passa, mas tipagem fraca generalizada |
| `select('*')` | **39** em 22 services | drift: estava em 26 quando iniciamos o narrowing |
| `@ts-ignore` / `eslint-disable` | 34 | |
| Arquivos > 2.500 linhas | 4 | `BankReconciliation.tsx`, `FinancialSchedule.tsx`, `ContractDetailView.tsx`, `BudgetEditor.tsx` |

**Sem CI no GitHub:** existe `npm run ci` (typecheck+test+build) no `package.json` mas não há `.github/workflows/` — nada bloqueia deploy quebrado na Vercel.

**Teste quebrado:** `__tests__/components/BudgetPickerModal.test.tsx:318` — 11 falhas (`getByPlaceholderText(/buscar/i)` não encontrado; placeholder provavelmente renomeado no componente).

**`chart_of_accounts` deprecado** ainda referenciado em 10 arquivos: `boletoService`, `financialService`, `invoiceService`, `orderService`, `payrollService`, `AppRouter`, `BoletoFormModal`, `FinancialOrderDetails`, `OrganizationList`, `financialRegistryService`.

---

## 4. Funcional / Módulos

**Implementados e estáveis:** Controle Operacional, Tarefas, Estrutural/Ferragem, Incentivos, Contratos, Dados Mestres, Portal do Investidor, Emissão .docx, DRE por obra, Oportunidades/Marketplace.

**Pendências funcionais:**
- **Controladoria** — Fase 1 + Balancete prontos; faltam Fase 2 (DRE por SPE, regime de competência) e Fase 3 (partida dobrada → balanço → SPED).
- **Gestão de Vendas 0.2** — migração JSON→tabela com RLS (deferível).
- **BI** — agendamento de relatórios + narrativa por IA.
- **Aposentar `chart_of_accounts`** (10 arquivos).
- **Portal do Investidor Fases 5-6** — diferidas.

---

## Priorização

| # | Item | Severidade | Esforço | Status |
|---|---|---|---|---|
| 1 | RLS em `purchase_order_negotiations` | ALTO | Baixo | **CORRIGIDO** |
| 2 | Gate de auth no `task-alert-notifier` | MÉDIO | Baixo | **CORRIGIDO** |
| 3 | RLS em `payroll_rubrics` / `payroll_fiscal_ranges` | MÉDIO | Baixo | **CORRIGIDO** |
| 4 | Corrigir ordenação das migrations `2024xxxx` | MÉDIO | Médio | pendente |
| 5 | Adicionar workflow CI no GitHub | MÉDIO | Baixo | pendente |
| 6 | RLS em `cub_parametric_data` + validar `notify-opportunity-interest` | BAIXO | Baixo | pendente |
| 7 | Consertar `BudgetPickerModal.test.tsx` | BAIXO | Baixo | pendente |
| 8 | Aposentar `chart_of_accounts` (10 arquivos) | BAIXO | Médio | pendente |
