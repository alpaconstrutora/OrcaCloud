# PLANO / PRD — ÒPURA Processos (Gerenciamento de Processos)

> **Não é BPM pesado.** É a camada de orquestração que transforma rotinas recorrentes em
> fluxos padronizados, auditáveis e **executáveis** — e que **costura** os módulos-silo que
> hoje já existem (Suprimentos, Fiscal, Financeiro, RH, Contratos, Obras).
> Ancorado no schema/serviços reais (verificado 2026-07-04).

---

## 1. Por que agora (e por que a maior parte NÃO é código novo)

Processos da construtora vivem hoje em WhatsApp, e-mail, planilha e na cabeça dos gestores:
compras fora do fluxo, pagamento sem conferência, admissão mal documentada, aprovação verbal.
O módulo resolve isso dando **etapas, responsáveis, prazos, documentos, aprovações e histórico**.

Diagnóstico do repositório (grep + leitura, 2026-07-04): **≈50–60% do que um PRD de "central
de processos" pediria já existe implementado** e espalhado. O risco número 1 aqui é
**reconstruir motor pronto** — bate de frente com [[feedback_reusar_sistema_existente]] e
[[feedback_separacao_contratos]]. Este plano existe para **fatiar o que é reuso do que é novo**.

O genuinamente novo são **4 coisas**:
1. Uma **máquina de estados genérica** template→instância→etapa (não existe reutilizável).
2. **Versionamento de template que não corrompe instância antiga**.
3. **Dashboard de SLA/gargalos por etapa** (o maior valor gerencial; não existe).
4. A **camada de gatilho/costura entre módulos** — que é, na prática, o que fecha as lacunas do
   [[project_p2p_fluxo_integrado]] (NF-e→Contas a Pagar, PO→Contas a Pagar).

---

## 2. Realidade do schema/serviços — o que JÁ existe e será reusado

### Motor de aprovação — NÃO reconstruir
- `services/approvalService.ts` é a **primitiva ÚNICA de aprovação multinível** (colapsa
  financeiro + contrato + compra). Resolve "quantos níveis" por faixa de valor via
  `financial_approval_config` + RPC `fn_resolve_approval_levels(org, amount)`. Fila acionável
  unificada `listActionQueue`, status `RASCUNHO / PENDENTE / APROVADO`, reprovação com
  justificativa. **A etapa do tipo "aprovação" delega para cá** — ver `PLANO_MODULO_APROVACAO.md`.
- `ApprovalEntity` já prevê `purchase_order` ("Fase 2 — confirmar coluna de valor"). Basta
  **adicionar `'process_step'` como 4ª entidade**, no mesmo padrão.
- `authority_limits` / `org_authority_limits` (Governance) — alçada por cargo, hoje **dormente**
  [[project_opura_governance_gap_audit]]. Fica dormente; Processos usa a faixa de valor, não a
  autoridade-por-identidade (fora do escopo do soft enforcement).

### Tarefa — reusar, NÃO duplicar
- `TasksModule` + `services/taskService.ts` (`Task`, status `open/done/snoozed`) +
  `taskSpaceService` (spaces, board/list/mobile) [[project_modulo_tarefas]].
- **Regra dura deste plano:** etapa do tipo "tarefa" **cria uma `Task` real** com vínculo
  `process_instance_step_id`. Proibido criar `process_tasks` como tabela nova — senão o usuário
  tem duas caixas de "minhas tarefas" e a adesão morre (Risco 3 do próprio PRD).

### Documentos / evidências — reusar
- `OpuraDocsModule` + `services/documentService.ts` (DMS) + emissão `.docx`
  [[project_emissao_documentos_docx]]. Etapa "documento obrigatório" aponta para o DMS e
  **bloqueia a conclusão** sem anexo.

### Templates + versão + assinatura — reusar padrão
- `contractTemplateService` (templates `{{var}}`), versionamento, assinatura ZapSign
  [[project_modulo_contratos]]. É a planta-baixa do versionamento template→instância.

### Suprimentos / P2P — planta-baixa E event source (ver §6)
- `OrderLifeline.tsx` — máquina de estados **hardcoded** de 7 passos
  (`BIDDING→CONFIRMED→PREPARING→SHIPPED→DELIVERED→RECEIVED→DIVERTED`). É uma "instância de
  processo" completa, mas soldada em compras. **Planta-baixa** do componente de timeline.
- `orderService` — transições com efeito colateral (e-mail `status_change`, baixa de estoque em
  `Recebido`, flag `is_financial_approved`). **Padrão de gatilho de transição.**
- `matchService` + `ThreeWayMatchPanel` — 3-way match (Pedido×Recebido×NF). Vira o **tipo de
  etapa "validação automática"**.
- `order.status` / `is_financial_approved` — **eventos** que o motor de Processos escuta.

### Infra transversal — reusar
- Notificações (`type: 'status_change'` já dispara e-mail no `orderService`).
- Alertas: `fn_financial_alerts` (padrão de indicador de pendência).

---

## 3. O que é genuinamente NOVO (o núcleo a construir)

| Novo | Por quê não dá pra reusar |
|---|---|
| `process_templates` / `process_template_steps` | Não há modelo de fluxo genérico hoje |
| `process_instances` / `process_instance_steps` (máquina de estados) | O único "fluxo" existente é o lifeline hardcoded de compras |
| Versionamento template→instância (instância antiga preserva a versão) | Ninguém faz isso hoje |
| Dashboard SLA / gargalo por etapa | Não existe visão de "onde trava" |
| Camada de gatilho (evento de módulo → próxima etapa) | É a costura que o P2P não tem |

Todo o resto do PRD original (aprovação, tarefa, documento, template, assinatura) é
**integração**, não construção.

---

## 4. Arquitetura — motor genérico chamando primitivas

```
process_templates ──(versão)──> process_instances
       │                              │
process_template_steps          process_instance_steps  ── etapa POLIMÓRFICA por tipo:
                                       │
                                       ├─ 'approval'  ──> approvalService (entity='process_step')
                                       ├─ 'task'      ──> taskService.create({ step_id })
                                       ├─ 'document'  ──> documentService (bloqueia s/ anexo)
                                       ├─ 'validation'──> matchService / regra
                                       └─ 'manual'    ──> conclusão simples

GATILHOS (Fase 3):  order.status='Recebido' / is_financial_approved / NF-e conferida
                          └──> engine.startInstance(template, contexto)
```

**Princípio (Regra 12):** o motor **orquestra**, cada tipo de etapa **delega** ao serviço de
domínio que já existe. O motor de Processos não reimplementa aprovação, tarefa nem documento.

---

## 5. Schema (corrigido para `organization_id`)

> **Correção crítica vs PRD original:** o PRD usa `company_id`. O ÒPURA é **org-scoped** com RLS
> por organização. Usar `company_id` quebra RLS e reabre o portão de escopo já mapeado em
> [[project_cargos_migracao_rh]]. Todo o schema abaixo usa `organization_id` e copia o padrão de
> RLS que **funciona** (Empreendimentos), não inventa — [[feedback_mudanca_schema_camadas]] e
> [[feedback_rls_organization_members]] (dual-check uid+email no WITH CHECK).

- `process_templates` — `id, organization_id, name, description, category, department_id,
  owner_user_id, status, version, is_active, criticality, default_sla_hours, trigger_type,
  created_at, updated_at, archived_at`
- `process_template_steps` — `id, process_template_id, name, step_type, order_index, is_required,
  default_responsible_type, default_responsible_id, sla_hours, requires_document, can_skip, ...`
- `process_instances` — `id, organization_id, process_template_id, template_version, title,
  status, priority, criticality, current_step_id, requester_user_id, owner_user_id,
  department_id, obra_id, fornecedor_id, cliente_id, contrato_id, nota_fiscal_id,
  pedido_compra_id, started_at, due_at, completed_at, cancelled_at, ...`
- `process_instance_steps` — `id, process_instance_id, template_step_id, name, step_type, status,
  responsible_user_id, started_at, due_at, completed_at, approval_status, task_id, document_id,
  rejection_reason, ...` (**`task_id`/`document_id` = ponte para as primitivas; `approval_status`
  espelha `approvalService`**)
- `process_comments` — `id, process_instance_id, step_id, user_id, comment, visibility, created_at`
- `process_audit_logs` — `id, process_instance_id, user_id, action, old_value, new_value, metadata, created_at`
- `process_rules` (Fase 3) — `id, process_template_id, condition_field, operator, condition_value,
  action_type, target_step_id`

**NÃO criar** `process_tasks` (usa `taskService`) nem `process_documents` como storage próprio
(usa `documentService`; o vínculo vive em `process_instance_steps.document_id`).

---

## 6. Aproveitamento do Suprimentos / P2P (a tese de costura)

O P2P **não é** o motor — é uma máquina de estados vertical hardcoded. Aproveita-se de 2 formas:

1. **Planta-baixa (design, não código genérico):** `OrderLifeline` é a referência do componente
   de timeline de `process_instance_steps`; `matchService` é o protótipo do tipo `validation`;
   `orderService` (status→notificação) é o padrão de gatilho.
2. **Primeiro consumidor / event source:** o P2P cobre bem o miolo (pedido→recebimento→match);
   suas lacunas são as **costuras** do [[project_p2p_fluxo_integrado]]. O motor escuta os eventos
   que o P2P **já expõe**:
   - `order.status='Recebido'` → inicia "conferência fiscal + AP"
   - `order.status='Divergência'` → inicia "tratamento de divergência"
   - `is_financial_approved` → estado de aprovação já materializado

**NÃO fazer:** migrar o `OrderLifeline` para `process_instances` agora. Ele está acoplado a
efeitos de compras (foto de recebimento, baixa de estoque, e-mail). Trocar de cara = reescrita
big-bang [[feedback_deploy_apenas_minha_tarefa]]. Convergência (lifeline vira caso particular do
motor) é **Fase 4+**, não MVP.

---

## 7. Fatiamento (roadmap)

### Fase 0 — Pré-requisitos
Migrations idempotentes (R3/R10): tabelas §5 + RLS por org (padrão Empreendimentos) +
`'process_step'` adicionado a `ApprovalEntity` no `approvalService`. Semear as **8 categorias**
de departamento se ainda não existirem.

### Fase 1 — MVP: máquina de estados + 1 piloto de ponta a ponta
- CRUD de `process_templates` + `process_template_steps` (**só sequencial**).
- `process_instances` + `process_instance_steps` (motor de transição).
- Tipos de etapa que **delegam**: `approval`→`approvalService`, `task`→`taskService`,
  `document`→`documentService`, `manual`.
- Versionamento template→instância (a regra que ninguém mais faz).
- Comentários + `process_audit_logs`.
- **Template piloto: "Aprovação de pagamento de fornecedor"** — atravessa Fiscal→Obra→Financeiro→
  Tesouraria; prova a tese de costura com peças que já existem.
- UI: página "pendente comigo" (padrão `FinancialApprovalModule`) + visão lista.

### Fase 2 — Integração / costura (event source do P2P)
Gatilhos a partir de `order.status` / `is_financial_approved` / NF-e conferida. Vínculo de
instância a obra/fornecedor/cliente/contrato/NF/PO. Dashboard de SLA/gargalo por etapa. Kanban.

### Fase 3 — Regras e automações
`process_rules` (condição por valor/obra/fornecedor), escalonamento, bloqueio, gatilho automático.

### Fase 4 — Visual process builder
Editor visual, fluxos paralelos, decisões condicionais. Convergência opcional do `OrderLifeline`.

### Fase 5 — Inteligência (IA)
Criação assistida de processo, resumo de instância parada, detecção de gargalo, Q&A ligado ao
Knowledge AI.

---

## 8. Regras da casa aplicadas
- **R3/R10** — migrations primeiro, idempotentes; RLS copiada do padrão que funciona, não inventada.
- **R4** — tipos em `types/process.ts`; nada inline.
- **R5/R13** — `processService` no service layer, `console.error` + throw com mensagem PT.
- **R12** — assinaturas de `approvalService`/`taskService`/`documentService` preservadas; Processos
  só as **chama**. `OrderLifeline`/`is_financial_approved` não são tocados.
- **Idioma** — UI e mensagens em português [[feedback_idioma_portugues]].

---

## 9. Riscos
- **Sobreposição com o Módulo de Tarefas** (Risco 3 do PRD): mitigado pela regra dura "etapa
  `task` = `Task` real via `taskService`", nunca tabela nova.
- **`company_id` vs `organization_id`**: o schema do PRD original quebraria RLS; §5 corrige.
- **Big-bang do lifeline**: proibido migrar P2P agora; só event source (§6).
- **Virar burocracia** (Risco 1 do PRD): poucos campos obrigatórios, templates prontos, aprovar
  pelo "pendente comigo"; sem isso o usuário volta pro WhatsApp.
- **Faixa de aprovação**: depende de `financial_approval_config` semeada (pré-req do
  `PLANO_MODULO_APROVACAO.md`).
- **Deploy**: stagear só os arquivos deste módulo, nunca `git add -A`
  [[feedback_deploy_apenas_minha_tarefa]]; `tsc --noEmit` local antes do push.
</content>
</invoke>
