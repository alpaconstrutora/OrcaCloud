# Plano Técnico — Módulo Gestão de Contratos

> **⚠️ CORREÇÃO DE PREMISSA:** Este módulo **NÃO é greenfield**. ~70% do escopo já existe em produção (módulo `contracts` rico + `services_contracts` do CRM Serviços). Este plano é roadmap de **fechamento de lacunas + consolidação**, não construção do zero.
>
> **Decisão arquitetural central:** convergir `services_contracts` para o módulo `contracts` rico. O pipeline de Serviços (oportunidade→proposta) deve apenas *gerar* um `contract` ao fechar, igual ao deal imobiliário faz hoje. Reusar, não duplicar.

---

## 0. Inventário do que já existe (baseline)

### Tabelas e Migrações

| Entidade | Migrations | Status |
|---|---|---|
| `contracts` | 20 migrations (20240219–20260529) | ✅ completo: tipos, natureza, recorrência, parcelado, retenção, reajuste_index, signed_contract_url, sync financeiro, numeração |
| `contract_items` | 20240224000000_commercial_module.sql | ✅ com `budget_item_id` FK |
| `contract_addendums` | 20240219 (incluso) | ✅ com tipo (Valor/Prazo/Ambos/Outros), status (Pendente/Aprovado/Rejeitado), approval automático |
| `contract_measurements` | 20240224000004_measurement_multi_upload.sql | ✅ com período, status (Pendente/Em Análise/Processada/Paga), retenção, invoice_url, upload multi |
| `contract_measurement_items` | 20240224000004 (incluso) | ✅ com quantity_executed, value_executed, attachment_urls |
| `contract_utility_bills` | 20240219 (incluso) | ✅ concessionária/consumo (Água/Luz/Gas/Internet) |
| `services_contracts` | 20260528100000_create_services_commercial_module.sql | 🟡 FINO: só number/client/value/datas/status; é saída do pipeline (oportunidade→proposta→contract) |

### Services e Componentes

| Código | LOC | Cobertura |
|---|---|---|
| `services/contractService.ts` | 950 | listContracts, getContractById, createContract, updateContract, syncContractToFinance, deleteContract, duplicateContract, listContractItems, addContractItem, listAddendums, createAddendum, **approveAddendum** (1 nível), listMeasurements, createMeasurement, updateMeasurement, deleteMeasurement, listUtilityBills |
| `components/ContractModal.tsx` | 924 | create/edit de contract (budget_id picker, payment_schedule_editor, recurrence config, signed_contract_url upload) |
| `components/ContractDetailView.tsx` | 2010 | detalhe + 6 tabs (Geral, Itens, Aditivos, Medições, Financeiro, GED) |
| `components/ContractAddendumModal.tsx` | 181 | addendum create/edit + approval (1 passo) |
| `components/ContractMeasurementModal.tsx` | 546 | measurement create/edit + item wizard + upload + cálculo de saldo visual |
| `types/contracts.ts` | 116 | ContractType, ContractStatus, Contract, ContractItem, ContractAddendum, ContractMeasurement, ContractUtilityBill |

### Sync Financeiro (Automático)

- `syncContractToFinance()` gera transações financeiras em `internal_transactions` (Despesas/Crédito via Vault Projects)
- Recorrência (mensal/anual/bimestral): gera N transações futuras (`payment_schedule`)
- Parcelado à vista: gera 1–N parcelas com data_vencimento
- Aditivo aprovado com impacto de valor: re-sync de parcelas
- Medição: gera transação via `financialService.syncMeasurementToFinance()`

---

## 1. Lacunas Reais (Confirmadas no Código)

### 1.1 Snapshot do Orçamento Contratado (Regra 1 / Seção 5.4)

**Status:** Não existe.

**Hoje:**
- Existe FK `contract.budget_id` → `projects.budget` (JSON).
- Ao criar contrato a partir de orçamento, só copia o id.
- Orçamento pode ser alterado após contrato → divergência.

**Gap:** Seção 5.4 do PRD pede "congelar orçamento contratado" e "manter rastreabilidade" (snapshot).

**Decisão técnica:** Reusar padrão já aplicado em [[project-mvp-controle-operacional]] (Operacional):
- Coluna `budget_snapshot` (JSONB) em `contracts` — cópia do `projects.budget[0]` (ou composição em uso) no momento da assinatura.
- Preserva histórico, sem tabela nova (`contract_budget_snapshot` seria overhead).

**Esforço:** S (1–2h). Migration add column + atualizar `createContract` para serializar snapshot se houver `budget_id`.

---

### 1.2 Guarda de Saldo Contratual na Medição (Regra 3 / Seção 5.6)

**Status:** Visual apenas (não trava).

**Hoje:**
- `ContractMeasurementModal.tsx:395` calcula `isExceeded = currentQty > remainingQty` → pinta vermelho.
- `contractService.createMeasurement()` insere SEM rejeitar.

**Gap:** Regra 3 pede "medições não podem ultrapassar saldo contratual" (server-side enforcement).

**Decisão:** Adicionar guarda em `contractService.createMeasurement()` antes do insert:
```ts
const totalMeasured = prevMeasurements.reduce(...) + items.reduce(...)
if (totalMeasured > contract.current_value * (1 - retentionRate)) {
    throw new Error('Measurement total exceeds available balance');
}
```

**Esforço:** S (30min). Sem migration; só lógica no service.

---

### 1.3 Reajuste Automático por Índice (Regra 5 / Seção 5.11)

**Status:** Campo `reajuste_index` só é exibido (`ContractDetailView.tsx:878`); sem motor de aplicação.

**Hoje:**
- `contract.reajuste_index` pode ser "INCC", "IPCA", "CUB", "IGP-M", etc.
- Campo editorial; nunca é APLICADO ao valor.

**Gap:** Seção 5.11 pede "reajustes automáticos conforme índice".

**Decisão técnica:**
- Novos campos em `contracts`: `reajuste_index`, `reajuste_data_base` (YYYY-MM-DD), `reajuste_proximo_mes` (DATE quando roda próximo).
- Service `contractService.applyReajuste(contractId, indexValue)` que (a) calcula impacto via fórmula INCC/IPCA padrão: `novo_valor = current_value × (indice_hoje / indice_base)`, (b) atualiza `current_value`, (c) re-sync financeiro (parcelas futuras).
- Scheduler mensal (CronCreate) que checa contratos com `reajuste_proximo_mes = hoje` e roda (ou UI manual "Aplicar Reajuste Agora").
- Alimentar índices via API externa (IBGE INCC/IPCA, FGV IGP, ou manual via Upload do admin).

**Esforço:** M (4–6h). Migration (3 colunas) + service method + view/modal para aplicação + opcionalmente scheduler.

---

### 1.4 Templates de Contrato com Variáveis `{{}}` / Importação DOCX (Seção 5.3)

**Status:** Não existe (só upload de PDF assinado).

**Gap:** "Modelos reutilizáveis", "editor visual", "importação DOCX", "cláusulas dinâmicas", "variáveis automáticas", "versionamento".

**Decisão:** Fase futura (3+). MVP não precisa (hoje as incorporadoras usam templates Word — trazer para dentro é ganho, não bloqueador). Quando vier:
- Nova tabela `contract_templates` (org_id, nome, versão, conteúdo_html/docx, variáveis_json, created_at).
- `contract_template_clauses` (id, template_id, tipo, texto, order).
- Service `generateContractFromTemplate(templateId, variables)` → renderiza html ou docx+merge.
- Integração com assinatura eletrônica (nova seção 1.5).
- Não construir editor visual hoje (overkill); deixar copy-paste de HTML/DOCX.

**Esforço:** L (essa é uma Fase 3, 10–15h com DOCX parsing).

---

### 1.5 Assinatura Eletrônica (Seção 5.9)

**Status:** Mock — `signed_contract_url` é upload manual de PDF.

**Gap:** Integração com ZapSign/Clicksign para assinatura real.

**Decisão:** Já confirmada em [PLANO_GESTAO_VENDAS.md:1.2](PLANO_GESTAO_VENDAS.md#12--assinatura-eletrônica-via-integração--esforço-m). **Integrar, nunca construir motor jurídico.**

- Edge Function `sign-contract` (token ZapSign/Clicksign fora do bundle).
- Criar documento → POST /sign-contract → URL para assinatura → webhook status → download certificado.
- Status em `contracts`: `signature_status` (PENDING/SENT/SIGNED/EXPIRED), `signature_url`, `signature_completed_at`.
- Persiste o PDF assinado em `signed_contract_url`.

**Esforço:** M (6–8h: Edge Function + webhook handler + UI).

---

### 1.6 Aprovação Multinível (Seção 5.8)

**Status:** Aditivo tem 1 nível (`approveAddendum`). Contrato não tem fluxo de aprovação.

**Gap:** PRD pede 4 níveis (comercial/jurídico/financeiro/diretoria). **Fazer 1–2, não 4** (lição: [[project-modulo-incentivos]], 4 níveis viram gargalo).

**Decisão:**
- Novos campos em `contracts`: `approval_status` (RASCUNHO/PENDENTE/APROVADO/REJEITADO), `approval_chain` (JSONB com [{ role, approved_by, approved_at, notes }]).
- 2 níveis: (1) Comercial/Gestor → (2) Financeiro/Diretoria. Ambos obrigatórios para passar de RASCUNHO para ATIVO.
- Service `submitContractForApproval(contractId)` → status = PENDENTE.
- Service `approveContractAt(contractId, level, approvedBy, notes)` → avança cadeia.
- UI em `ContractDetailView`: card de aprovação + dropdown next-approver + modal notes.
- RLS policy: só usuário com `role IN ['gestor', 'financeiro', 'diretoria']` pode aprovar.

**Esforço:** M (5–7h: migration + services + UI modal).

---

### 1.7 Dashboard de Carteira Contratual (Seção 5.1)

**Status:** Não existe. Hoje visão é por contrato individual.

**Gap:** Seção 5.1 pede indicadores: contratos ativos, vencendo, receita contratada, backlog, saldo, reajustes pendentes, por cliente, por obra, inadimplência, recorrentes.

**Decisão:** Fase futura (Fase 4). Implementar como:
- Novo componente `ContractsDashboard.tsx` (aba em SalesManagementModule).
- KPIs em cards (SQL views ou client-side agg de `contractService.listContracts()`).
- Gráficos: receita ao longo do tempo (Chart.js), distribuição por cliente, por obra, por status.
- Tabela filtro-sort: contatos vencendo em N dias, reajustes pendentes.

**Esforço:** S/M (4–6h para MVP: cards + tabela, sem gráficos avançados). Gráficos = +2h.

---

## 2. Risco Arquitetural: Convergência de `services_contracts`

Atualmente há **2 modelos paralelos:**

- **(A) `contracts` rico** — completo para qualquer cenário (obra, serviço, fornecimento, locação). Tem medição, aditivo, recorrência, sync financeiro.
- **(B) `services_contracts` fino** — saída do pipeline (oportunidade→proposta→services_contract). Só fields básicos.

**Risco:** Manutenção de dois engines de contrato. Divergência de regras (medição em um, não em outro). Duplicação quando CRM Serviços quiser avançar (aditivos, reajuste, etc.).

**Recomendação — Fase 0 (pré-requisito):** Migrar `services_contracts` para usar `contracts`. Fluxo:
1. `services_opportunity` + `services_proposal` → gera uma linha em `contracts` ao aceitar proposta.
2. `services_contracts` vira um *link* descritivo (preservar por compatibilidade de dados), não a fonte de verdade.
3. Todos os serviços (medição, aditivo, reajuste, aprovação, financeiro) operam em `contracts`.

**Esforço:** M (6–8h: migration FK + update servicesCommercialService para criar/updateContract em vez de services_contracts).

---

## 3. Roadmap Faseado

### Fase 0 — Convergência (PRÉ-REQUISITO)

> Sem feature nova. Arquitetura apenas.

**Ticket:** "Migrar pipeline CRM Serviços para usar `contracts` como fonte de verdade"

**Tarefas:**
1. Migration: add `services_opportunities.contract_id` FK → `contracts.id`.
2. Update `servicesCommercialService.acceptProposal()` → create `contracts` entry.
3. Update routes/UI `SalesModule` para ler/exibir `contracts` ao invés de `services_contracts`.
4. Teste integração: oportunidade → proposta → aceita → contract criado com status PENDENTE (fica em aprovação Phase 1.2).

**Esforço:** M (6–8h).

**Aceite:** Uma proposta aceita em CRM Serviços gera um contrato `contracts` com status RASCUNHO; UI exibe contrato rico (itens, medição futura, etc.).

---

### Fase 1 — Fechamento de Regras de Negócio

> Alto valor / baixo esforço. Trava os requisitos inegociáveis.

#### 1.1 · Snapshot do Orçamento

**Tarefas:**
1. Migration: add `budget_snapshot` (JSONB) em `contracts`.
2. Update `createContract` → se `budget_id`, serialize `projects.budget[index]` para `budget_snapshot`.
3. Update `ContractModal` → UI mostra "orçamento contratado (congelado)" em tab Geral, com diff visual vs orçamento atual.

**Esforço:** S (1–2h).

**Aceite:** Contrato exibe snapshot do orçamento vigente na assinatura; histórico preservado.

---

#### 1.2 · Guarda de Saldo Contratual

**Tarefas:**
1. Update `contractService.createMeasurement()` → validar saldo antes de insert.
2. Update `ContractMeasurementModal` → mensagem clara "Saldo insuficiente" ao tentar criar com execução > disponível.
3. Teste: medir 110% do contratado → erro server-side (não aceita UI visual apenas).

**Esforço:** S (30min–1h).

**Aceite:** Medição que ultrapasse saldo é rejeitada com erro legível; usuário vê visual de saldo em tempo real.

---

#### 1.3 · Reajuste por Índice

**Tarefas:**
1. Migration: add `reajuste_index`, `reajuste_data_base`, `reajuste_proximo_mes` em `contracts`.
2. Service `applyReajuste(contractId, indexValue)` → calcula novo valor via fórmula padrão.
3. UI em `ContractDetailView` → card "Reajuste Disponível" + botão "Aplicar Agora".
4. Opcionalmente: CronCreate para verificação mensal (scheduler mock; production é endpoint que admin chama).

**Esforço:** M (4–6h).

**Aceite:** Admin/Gestor consegue aplicar reajuste manualmente; valor + parcelas atualizam; transações financeiras sincronizam.

---

### Fase 2 — Workflow e Integração

#### 2.1 · Assinatura Eletrônica (Edge Function)

**Tarefas:**
1. Criar Edge Function `sign-contract` (conecta ZapSign/Clicksign via token env).
2. Migration: add `signature_status`, `signature_url`, `signature_completed_at` em `contracts`.
3. Update `ContractDetailView` → tab GED com botão "Enviar para Assinatura".
4. Webhook handler em `/api/webhooks/signature` (Supabase) → atualiza `signature_status` + baixa PDF.

**Esforço:** M (6–8h).

**Aceite:** Contrato enviado para assinatura; status trackado; PDF assinado vinculado automaticamente.

---

#### 2.2 · Aprovação Multinível (1–2 Níveis)

**Tarefas:**
1. Migration: add `approval_status`, `approval_chain` (JSONB) em `contracts`.
2. Services: `submitContractForApproval()`, `approveContractAt(level)`.
3. UI: card workflow + modal approval em `ContractDetailView`.
4. RLS: apenas `role IN ['gestor', 'financeiro']` aprova.

**Esforço:** M (5–7h).

**Aceite:** Contrato em RASCUNHO só avança se aprovado em 2 níveis; trilha auditável; rejeição retorna para edição.

---

### Fase 3 — Experiência de Usuário

#### 3.1 · Templates de Contrato (Variáveis / DOCX)

**Tarefas:**
1. Novas tabelas: `contract_templates`, `contract_template_clauses`.
2. Service `generateContractFromTemplate(templateId, variables)`.
3. UI: builder de templates (simples: upload HTML/DOCX + marcar variáveis).
4. Integração com assinatura (Fase 2.1).

**Esforço:** L (10–15h com parsing DOCX).

**Aceite:** Admin cria template uma vez; proposta→contrato preenchido automaticamente com variáveis (cliente, valor, datas).

---

#### 3.2 · Dashboard de Carteira

**Tarefas:**
1. Novo componente `ContractsDashboard.tsx`.
2. KPIs: ativos, vencendo, saldo total, receita contratada.
3. Tabelas: filtros por status/cliente/obra.
4. Gráficos: receita ao longo do tempo, distribuição (opcionalmente).

**Esforço:** S/M (4–6h MVP; +2h gráficos).

**Aceite:** Dashboard exibe saúde do portfólio contratual; gestor vê alertas (vencimentos, reajustes).

---

### Fase 4 — Futuro (Não MVP)

- Integração e-mail/WhatsApp (alertas de vencimento, assinatura).
- IA narrativa sobre contratos (resumo automático).
- OCR de contratos (leitura automática via pdfjs).
- Configuração de workflow por tipo de contrato / cliente.

---

## 4. Sequenciamento e Dependências

```
Fase 0 (Convergência) ◄── pré-req para resto
    │
    ├─ Fase 1.1 (Snapshot)
    │   └─ Fase 1.2 (Guarda saldo)
    │       └─ Fase 1.3 (Reajuste)
    │
    ├─ Fase 2.1 (Assinatura) ◄── paralelo com Fase 1
    │
    └─ Fase 2.2 (Aprovação) ◄── depende de 1.* (regras definidas)
        │
        ├─ Fase 3.1 (Templates) ◄── pode ir paralelo
        │
        └─ Fase 3.2 (Dashboard) ◄── paralelo

Proposta: Fase 0 → Fase 1 (sprint único) → Fase 2 (paralelo) → Fase 3 (backlog).
```

---

## 5. Princípios Inegociáveis

1. **Integrar, não construir:** assinatura eletrônica é Edge Function + API 3ª, nunca motor jurídico.
2. **Reusar, não duplicar:** não tem `services_contracts` paralelo; `contracts` é a fonte de verdade.
3. **Moat é integração vertical:** orçamento→contrato→obra→medição→faturamento já ~70% feito; Fase 1–2 apenas fecha gaps.
4. **Aprovação ≤2 níveis:** evita gargalo (lição: projeto Incentivos).
5. **Snapshot não é tabela:** reusar padrão JSONB (budget_snapshot) para não multiplicar entidades.

---

## 6. Estimativas Totais

| Fase | Tarefas | Esforço | Semanas | Crítico |
|---|---|---|---|---|
| 0 | Convergência CRM Serviços | M | 1 | ✅ Sim (pré-req) |
| 1.1 | Snapshot orçamento | S | 0.2 | 🟡 Desejável |
| 1.2 | Guarda saldo | S | 0.2 | ✅ Sim (regra) |
| 1.3 | Reajuste automático | M | 0.8 | 🟡 Desejável |
| 2.1 | Assinatura eletrônica | M | 1 | 🟡 Desejável |
| 2.2 | Aprovação multinível | M | 1 | 🟡 Desejável |
| 3.1 | Templates / DOCX | L | 2 | ❌ Fase futura |
| 3.2 | Dashboard carteira | S/M | 0.8 | ❌ Fase futura |

**Total MVP (Fase 0 + 1 + 2):** ~5 semanas.

---

## 7. Stack Confirmado

- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4 + lucide-react.
- **Backend:** Supabase (migrations versionadas, RLS policies, Edge Functions).
- **Estado:** Zustand + React Query (queryClient em `lib/queryKeys.ts`).
- **Roteamento:** `activeView` em store + `AppRouter.tsx` + `lib/tabRouter.ts` (sem react-router).
- **Sync Financeiro:** `financialService.ts` existente (reusar).
- **Assinatura:** Edge Function + webhook (ZapSign/Clicksign).
- **Testes:** vitest em `__tests__/*.test.ts`.

---

**Status:** Plano confirmado 2026-06-02. Faseamento pronto para discussão / sprint planning.
