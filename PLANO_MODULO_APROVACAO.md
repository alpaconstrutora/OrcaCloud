# PLANO — Unificação do Fluxo de Aprovação (ÒPURA Approval)

> Hardening, não módulo novo. Decisão do cliente: **enforcement soft** (avisa, não bloqueia)
> + **unificar tudo** (financeiro, contratos, compras num só modelo).
> Ancorado no schema/serviços reais (verificado 2026-06-23).

---

## 1. Por que agora

Diagnóstico em produção (`scratch/diagnostico_alcadas*.sql`):

- `org_authority_limits` (alçadas por cargo) = **0 linhas e 0 consumidores** — registro órfão.
- `internal_transactions` = **291 lançamentos (R$ 10,5 mi), 100% em `RASCUNHO`**. O portão de
  aprovação financeiro **nunca foi usado**. 113 saídas (R$ 1,03 mi) sem nenhuma aprovação.
- Contratos aprovados = 0. Compras aprovadas = 0.

Conclusão: não há risco ativo de fraude (nada passou pelo fluxo), mas há **muita maquinaria de
aprovação construída e 100% ociosa**, em **3 implementações paralelas e duplicadas** + **2 telas
de alçada** (uma delas inerte). O trabalho não é construir mais — é **ativar uma e tirar a confusão
das outras da frente**.

---

## 2. Realidade do schema/serviços

### Existe e será reusado
- **Política de níveis** — `financial_approval_config` (faixa de valor → `required_levels` 1/2 +
  labels), RPC `fn_resolve_approval_levels(org, amount)`. **É a fonte única eleita.**
- **Primitiva de aprovação** — colunas `approval_status` / `approval_chain` (JSONB) /
  `approval_required_levels` já existem **idênticas** em `internal_transactions` e `contracts`.
  `ApprovalStep` e `ContractApprovalStep` são tipos idênticos.
- **Serviços** — `financialApprovalService` (completo) e a seção de aprovação de `contractService`
  (lógica **copiada**). Telas: `FinancialApprovalModule`, `ContractDetailView`.

### Duplicação a colapsar
- Aprovação de contrato = cópia da financeira (mesma lógica de cadeia/níveis).
- Compras (`purchase_orders`) = modelo cru: só boolean `is_financial_approved`.
- Alçada de governança (`org_authority_limits`) = 2ª tela de configuração, sem efeito.

### NÃO muda agora
- `org_authority_limits` e a autoridade-por-cargo ficam **dormentes** (são para enforcement rígido
  por identidade — fora do escopo do soft). Tabelas preservadas (Regra 12), tela escondida.

---

## 3. Arquitetura: uma primitiva, vários donos

```
financial_approval_config  ──(fn_resolve_approval_levels)──┐  fonte ÚNICA de "quantos níveis"
                                                            ▼
internal_transactions ─┐                          approvalService (TS)
contracts ─────────────┼── approval_status/chain ── submit / approve / reject ── pura + genérica
purchase_orders ───────┘   (Fase 2)                         │
                                                            ▼
                                  efeitos específicos da entidade ficam no wrapper
                                  (contrato→status 'Ativo', tx→business_status, etc.)
```

Princípio: **a lógica de cadeia/níveis é única** (`approvalService`); cada serviço de domínio
mantém um **wrapper fino** que injeta os efeitos colaterais próprios e preserva a assinatura
pública atual (Regra 12 — nenhum componente muda).

---

## 4. Fatiamento (roadmap)

### Fase 0 — Pré-requisito (faixa default)
Migration idempotente: para toda organização **sem** config, semear 3 faixas default
(0–5k: 1 nível · 5k–50k: 1 nível · 50k+: 2 níveis). Sem isso, "acima do limiar" não resolve nada.
Tunável depois pela tela existente. **Não toca dados de orgs que já configuraram.**

### Fase 1 — Unificar a primitiva (refactor)
`services/approvalService.ts` genérico (`submit/approve/reject/resolveRequiredLevels`,
parametrizado por entidade). `financialApprovalService` e `contractService` passam a **delegar**,
mantendo assinaturas. Efeito colateral positivo: o `submit` de contrato passa a **resolver níveis
pelo valor** (hoje ficava no default 1 — bug silencioso). Risco ~zero: 0 aprovações hoje.

### Fase 2 — Compras entra no modelo
Migration: `purchase_orders` ganha `approval_status/chain/required_levels` (espelha contratos).
`orderService` usa `approvalService`. `is_financial_approved` vira derivado/compat (Regra 12).

### Fase 3 — Soft enforcement + visibilidade (é aqui que "ativa")
Ao criar saída/contrato/PO acima da faixa → nasce `PENDENTE` (não bloqueia). Indicador unificado de
pendência (alerta "N itens acima de R$X aguardando aprovação", reusando `fn_financial_alerts`) +
badge nas listas. Fila de aprovação generalizada para as 3 entidades.

### Fase 4 — Simplificar / tirar a confusão
Esconder a aba de alçadas do Governance (`org_authority_limits`). Corrigir o bug
`data_Campanha` → `data_encerramento` em `orgGovernanceService.saveCommittee`.

---

## 5. Regras da casa aplicadas
- **R3/R10** — migrations primeiro, idempotentes.
- **R4** — tipos em `types/` (reuso de `ApprovalStep`/`ApprovalStatus`); nada inline.
- **R5/R13** — `approvalService` no service layer, `console.error` + throw com mensagem.
- **R12** — assinaturas públicas preservadas; `org_authority_limits` e `is_financial_approved`
  não removidos, só superados/escondidos.

---

## 6. Riscos
- **Enforcement soft pode virar "ignorado de novo"**: a visibilidade (Fase 3) é o que garante
  adoção — sem o alerta, ativar é inócuo.
- **`submit` de contrato mudando de comportamento** (passa a resolver níveis): seguro hoje (0
  aprovações), mas registrar na release.
- **Campo de valor da PO** (`purchase_orders`): confirmar a coluna real na Fase 2 antes de ligar.
- **Faixa default** pode não refletir a política do cliente: é só semente, editável na tela.
