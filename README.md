# OrçaCloud SaaS

Plataforma SaaS multi-tenant para gestão integrada de obras e empreendimentos imobiliários. Cobre orçamentação, cadeia de suprimentos, financeiro, fiscal, RH/folha e portais para múltiplos stakeholders.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript 5.8 |
| Build | Vite 6 |
| Estado global | Zustand 5 |
| Estilização | Tailwind CSS v4 (build-time via `@tailwindcss/vite`) |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Segurança | Row Level Security (RLS) multi-tenant por `organization_id` / `company_id` |
| Charts | Recharts |
| Exportação | ExcelJS, jsPDF, html2canvas |
| Testes | Vitest + Testing Library |
| Edge Functions | Deno (Supabase Functions) |

---

## Módulos

| Módulo | Descrição |
|--------|-----------|
| **Dashboard** | Analytics gerais por projeto e organização |
| **Orçamentação** | Editor com integração SINAPI e composições |
| **Estimador Paramétrico** | Estimativa rápida por CUB/m² |
| **Financeiro** | Contas a pagar/receber, DRE, conciliação bancária, boletos |
| **Fiscal & Custos** | Ingestão de NF-e XML, fila de processamento, classificação heurística por NCM/CFOP |
| **Suprimentos** | Pedidos de compra, cotações, contratos com fornecedores |
| **RH / Folha** | Cadastro de funcionários, payroll com INSS e IRRF |
| **Imovib** | Análise de viabilidade imobiliária |
| **Portais** | Fornecedor, Investidor, Cliente, Corretor |

### Perfis de acesso

`ADMIN` · `USER` · `BROKER` · `INVESTOR` · `CLIENT` · `SUPPLIER`

---

## Módulo Fiscal & Custos

Pipeline completo de ingestão, normalização e classificação de Notas Fiscais Eletrônicas (NF-e) via XML SEFAZ.

### Fluxo de processamento

```
Upload XML (Frontend)
  → Storage (Supabase)
  → raw_documents (idempotência: access_key + source_hash UNIQUE)
  → processing_jobs (status: queued)
  → Webhook → Edge Function (Deno)
      → acquire_job() com FOR UPDATE SKIP LOCKED
      → parse NF-e → JSON Contract v1.0.0
      → Transação ACID: extracted_documents + invoices + invoice_items
      → Classificação heurística pós-persistência (NCM > CFOP > keyword)
  → Fallback: pg_cron polling a cada 2 min (jobs órfãos / retries)
```

### State machine dos jobs

```
queued → processing → parsed → normalized → completed
                                    ↓
                                  failed → queued (retry, máx 3, exponential backoff)
                                    ↓
                               dead_letter (replay manual)
duplicated (access_key já existe)
```

### Camadas do banco de dados

| Camada | Tabelas |
|--------|---------|
| Multi-tenancy | `companies`, `company_users`, `user_permissions` |
| Raw | `raw_documents` — XML original imutável no Storage |
| Extracted | `extracted_documents` — JSON Contract versionado (`superseded_by`) |
| Domain | `invoices`, `invoice_items` |
| Fila | `processing_jobs` |
| Observabilidade | `parsing_errors` |
| Classificação | `classification_rules` (NCM / CFOP / keyword, global + por empresa) |
| IA futura | `training_data` — feedback para ML |

### Views operacionais

- **`pipeline_health`** — contagem por status, taxa de sucesso, tempo médio, último job
- **`dead_letter_queue`** — jobs com falha crítica aguardando replay manual
- **`retry_candidates`** — jobs prontos para retry após backoff

### RBAC

| Role | Permissões |
|------|-----------|
| `super_admin` | Acesso total + todas as empresas |
| `company_admin` | Gestão completa + replay + dead letter |
| `fiscal_operator` | Upload, visualização, operações com permissão explícita |
| `viewer` | Read-only |

### Garantias arquiteturais

- **Idempotência** — `access_key` (44 dígitos SEFAZ) + `source_hash` (SHA-256) com constraint UNIQUE
- **Imutabilidade** — XML original preservado no Storage, nunca sobrescrito
- **Versionamento** — `extracted_documents.superseded_by` suporta histórico de parser
- **Transacionalidade** — bloco crítico (extracted → invoices → items → job status) é ACID
- **Observabilidade** — `parsing_errors` registra 100% das falhas com `error_code`, `error_payload`
- **Escalabilidade** — lock otimista evita processamento duplicado em concorrência

### Thresholds de alerta (Runbook v1)

| Métrica | Aviso | Crítico |
|---------|-------|---------|
| Dead letter por hora | > 5 | > 20 |
| Taxa de sucesso | < 90% | < 70% |
| Jobs queued > 5 min | > 10 | > 50 |
| Tempo médio de processamento | > 30s | > 120s |
| Retry rate | > 20% | > 40% |

---

## Estrutura de arquivos

```
orçacloud-saas/
├── App.tsx                          # Orquestrador (350 linhas)
├── components/
│   ├── AppRouter.tsx                # Roteamento isolado
│   └── ...                         # 150+ componentes React
├── hooks/
│   ├── useAuthSync.ts               # Auth Supabase + validação de perfil
│   ├── usePersistenceSync.ts        # localStorage + auto-save
│   ├── useProjectOperations.ts      # CRUD projetos/organizações
│   └── useToast.ts
├── services/                        # 40+ serviços de negócio
├── store/useStore.ts                # Store Zustand central
├── types/                           # Tipos por domínio (13 arquivos)
│   └── index.ts                     # Re-exporta tudo
├── types_db.ts                      # Tipos gerados do Supabase
├── constants.ts                     # SINAPI, CUB, tabelas fiscais
├── utils/                           # schedulingEngine, financialMath, projectUtils
├── supabase/
│   ├── migrations/                  # 40+ migrações SQL sequenciais
│   └── functions/                   # Edge Functions Deno
└── __tests__/                       # Vitest — financeiro, folha, calendário, progresso
```

---

## Setup local

**Pré-requisitos:** Node.js 20+ · Conta Supabase

```bash
npm install
```

Crie `.env.local` na raiz com:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# Opcionais
VITE_MAKE_WEBHOOK_URL=<webhook-make-com>
GEMINI_API_KEY=<chave-gemini>          # IA desabilitada por padrão
```

```bash
npm run dev        # Inicia em http://localhost:3100
npm run build      # TypeCheck + build produção
npm run test       # Roda todos os testes
npm run ci         # typecheck + test + build (pipeline completo)
```

---

## Banco de dados

Supabase PostgreSQL com RLS multi-tenant.

Tabelas principais: `organizations`, `organization_members`, `projects`, `contracts`, `purchase_orders`, `quotations`, `invoices`, `invoice_items`, `raw_documents`, `processing_jobs`, `payment_accounts`, `financial_entries`, `labor_employees`, `labor_payroll`, `properties`, `investors`, `bank_transactions`, `suppliers`

Para aplicar as migrações:

```bash
supabase db push
# ou aplique os arquivos em supabase/migrations/ em ordem sequencial
```

---

## Integrações externas

| Integração | Uso |
|-----------|-----|
| Supabase | Banco, auth, storage, edge functions, webhooks de banco |
| Make.com | Automações via webhook (`VITE_MAKE_WEBHOOK_URL`) |
| Z-API | WhatsApp (módulo Suprimentos — planejado) |
| Gemini API | IA assistiva — desabilitada por padrão (`GEMINI_API_KEY`) |
