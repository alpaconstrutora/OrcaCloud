# PRD / Plano de Implementação — Pagamento de Títulos e PIX (AP) via Asaas

> Fecha o outro lado da integração Asaas: hoje o sistema **recebe** cobrança do cliente
> ([[Fase 6 do Financeiro]] — `client_charges`/`asaas-charge`); este plano cobre **pagar**
> fornecedor/título via boleto de terceiro ou PIX, com a mesma conta Asaas.
> Ancorado no schema real (verificado 2026-07-03).

---

## 1. Por que agora

O ciclo de Contas a Pagar hoje termina em **"aprovado"**: o boleto é capturado/OCR'd
(`boletos` + `ContasPagarManager`), aprovado, e a baixa efetiva é manual — o financeiro
sai do sistema, paga no internet banking, e depois concilia via OFX/CNAB. Não há
**execução de pagamento** de dentro do ÒPURA, nem para boleto de fornecedor nem para PIX.

Isso é o par natural da Fase 6 (emissão de boleto ao cliente): lá o Asaas gera a cobrança
e webhook baixa o *recebível*; aqui o Asaas **paga** a cobrança e webhook baixa o *pagável*.
Mesma conta Asaas, endpoints diferentes, arquitetura em espelho.

---

## 2. Escopo

**Dentro do escopo:**
1. **Pagamento de boleto de terceiro** (`POST /v3/bill`) — a partir de um boleto já
   capturado/aprovado em `boletos`, usa a `linha_digitavel` já extraída por OCR.
2. **Transferência PIX para fornecedor** (`POST /v3/transfers`) — para títulos sem boleto
   (ex.: serviço avulso, reembolso), usando a chave PIX já cadastrada em
   `supplier_bank_accounts` (tabela existente, não precisa criar).
3. Baixa automática via webhook (extensão do `asaas-webhook` já existente).
4. Aprovação prévia obrigatória antes de qualquer disparo de pagamento — **reusa** o motor
   de aprovação por faixa já mapeado na Fase 3 do `PLANO_MODULO_FINANCEIRO.md` (ou o binário
   `is_financial_approved` como ponte enquanto a Fase 3 não sai).

**Fora do escopo nesta fase (deferido):**
- TED tradicional para conta não-PIX (a API suporta via `/transfers` sem `pixAddressKey`,
  mas processamento D+1 e maior atrito — entra numa Fase 2 se houver demanda).
- Pagamento em lote / múltiplos títulos de uma vez.
- Folha de pagamento (módulo próprio, [[project_modulo_incentivos]]).
- Pagamento de tributos/DARF (Asaas tem `/v3/bill` genérico para "contas" mas o volume de
  boleto de concessionária/tributo não é o problema que este PRD resolve).

---

## 3. Realidade do schema (o que já existe e será reusado)

- **Ledger** — `internal_transactions`, `direction=DEBIT` = título a pagar. Mesmo padrão da
  Fase 6 (lá era `CREDIT`).
- **Boletos capturados** — `boletos` (linha_digitavel, codigo_barras, valor, vencimento,
  beneficiario_*, status rascunho→revisao→aprovado→**programado→pago**→cancelado). Os status
  `programado`/`pago` **já existem no CHECK constraint** mas hoje nada os popula
  automaticamente — este plano é quem passa a usá-los de verdade.
- **Dados bancários do fornecedor** — `supplier_bank_accounts` (migration
  `20260527000001`): `pix_key`/`pix_key_type`, conta principal, favorecido. **Não precisa
  criar nada novo aqui.**
- **Conta Asaas / credenciais** — `ASAAS_API_KEY`, `ASAAS_ENV`, `ASAAS_WEBHOOK_TOKEN` já
  configurados como secrets (reusados, mesma conta/chave da Fase 6).
- **Padrão de Edge Function + service** — `asaas-charge`/`clientChargeService` é o template
  a espelhar (resolução JWT, `access_token` header, tratamento de erro `{errors:[{description}]}`,
  extração de detail via `error.context.json()`).

### NÃO existe (criado por este plano)
- `supplier_payments` (ou `payment_orders`) — liga `internal_transactions` (DEBIT) ↔ ordem
  de pagamento Asaas. Espelho de `client_charges`.
- Edge Function `asaas-payment` (actions `quote`, `pay`, `cancel`).
- Extensão do `asaas-webhook` para eventos de saída (`BILL_*`, `TRANSFER_*`).
- `supplierPaymentService.ts` (espelho de `clientChargeService.ts`).
- Botões "Pagar via Asaas" / "Pagar via PIX" em `ContasPagarManager`.

---

## 4. Decisão de arquitetura (espelho da Fase 6)

```
                                    ┌─ boleto de terceiro → POST /v3/bill  ─┐
internal_transactions (DEBIT) ──▶  │  (linha_digitavel de `boletos`)        ├─▶ supplier_payments
  título aprovado                  └─ PIX p/ fornecedor  → POST /v3/transfers┘     (asaas_bill_id |
                                       (pix_key de `supplier_bank_accounts`)        asaas_transfer_id)
                                                                                          │
                                                                              asaas-webhook (extensão)
                                                                                          │
                                                                                          ▼
                                                              internal_transactions.business_status = PAGO
                                                              boletos.status = 'pago'
```

Tabela nova `supplier_payments`:

```sql
create table supplier_payments (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id),
  transaction_id     uuid references internal_transactions(id),   -- título DEBIT
  boleto_id          uuid references boletos(id),                 -- opcional, se veio de boleto
  supplier_id        uuid references suppliers(id),
  provider           text not null default 'asaas',
  payment_type       text not null check (payment_type in ('BILL','PIX_TRANSFER')),
  asaas_bill_id       text,       -- id retornado por /v3/bill
  asaas_transfer_id   text,       -- id retornado por /v3/transfers
  pix_key            text,       -- snapshot da chave usada (auditoria)
  identification_field text,     -- snapshot da linha digitável usada
  value              numeric(15,2) not null,
  fee                numeric(15,2),          -- tarifa Asaas cobrada na operação
  scheduled_date     date,
  status             text not null default 'AWAITING_APPROVAL'
                      check (status in (
                        'AWAITING_APPROVAL','APPROVED','PENDING','SCHEDULED',
                        'DONE','FAILED','CANCELLED')),
  failure_reason     text,
  authentication_code text,      -- comprovante Asaas
  receipt_url        text,
  approved_by        uuid,
  approved_at        timestamptz,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
```

---

## 5. Fluxos

### 5.1 Pagamento de boleto de terceiro (BILL)
1. Boleto já capturado e **aprovado** em `ContasPagarManager` (fluxo atual, inalterado).
2. Novo botão "Pagar via Asaas" no boleto aprovado.
3. **Quote** (`GET /v3/bill/identificationField/{linha}` ou equivalente) — Asaas retorna
   beneficiário, valor, vencimento, multa/juros calculados. **UI mostra o beneficiário
   retornado pela Asaas ao usuário antes de confirmar** — mitigação central contra boleto
   adulterado (linha digitável correta mas beneficiário trocado).
4. Se aprovação de alçada exigida e ainda pendente → status `AWAITING_APPROVAL`, não dispara.
5. Após aprovação → `POST /v3/bill` com `identificationField` (+ `scheduleDate` se agendado).
6. Persiste em `supplier_payments`, `boletos.status='programado'`.
7. Webhook Asaas confirma pagamento → `boletos.status='pago'`,
   `internal_transactions.business_status='PAGO'`.

### 5.2 Transferência PIX para fornecedor
1. Título AP sem boleto associado (ex.: serviço avulso) em `ContasPagarManager`.
2. Botão "Pagar via PIX" → seleciona a conta de `supplier_bank_accounts` (já cadastrada,
   prioriza `is_pix_primary=true`).
3. Mesma trilha de aprovação de alçada.
4. `POST /v3/transfers` com `pixAddressKey`/`pixAddressKeyType` + `value` + `description`.
5. PIX é instantâneo (ou na `scheduleDate`) — status muda para `DONE` já na resposta ou via
   webhook de transferência.
6. Baixa automática do título.

---

## 6. Segurança e governança (o motivo desta ser uma fase própria, não só "mais um botão")

Diferente da Fase 6 (dinheiro **entrando**), aqui é dinheiro **saindo de verdade** — o
padrão de cuidado precisa ser mais alto:

- **Aprovação prévia obrigatória** antes de qualquer chamada a `/v3/bill` ou `/v3/transfers`
  — reusa o motor de alçada já mapeado (Fase 3 do financeiro / `ContractApprovalWorkflow`).
  Enquanto essa fase não sai, usar o `is_financial_approved` binário como gate mínimo.
- **Confirmação de beneficiário na tela** — mostrar nome retornado pela Asaas (não o nome
  digitado internamente) antes de confirmar. Fraude clássica de boleto: linha digitável
  válida, beneficiário trocado.
- **Trilha de auditoria imutável** — mesmo padrão de `boletos_auditoria`: quem aprovou, quem
  disparou, valor, timestamp, resposta da Asaas.
- **RLS restrita** — diferente de `client_charges` (leitura ampla por org), `supplier_payments`
  deveria restringir *disparo* (insert/update de status) a roles financeiro/admin, não todo
  membro da org.
- **Saldo pré-pago na Asaas** — ⚠️ a validar na Fase 0: operações de saída (`/bill`,
  `/transfers`) tipicamente descontam de saldo disponível na conta Asaas, não debitam
  direto de conta bancária do cliente. Isso é uma decisão operacional (manter caixa
  pré-carregado na Asaas) que o financeiro precisa validar antes de qualquer código —
  pode inviabilizar ou mudar a proposta de valor do módulo.
- **KYC mais rigoroso** — contas Asaas costumam exigir aprovação de conta mais completa para
  operações de saída do que para só receber. Validar se a conta atual (já usada na Fase 6)
  está habilitada, ou se precisa de upgrade/homologação adicional.

---

## 7. Fases

### Fase 0 — Descoberta e validação (pré-requisito, sem código de produto)

**Já confirmado via documentação oficial (2026-07-03), não precisa mais validar:**
- Eventos de webhook de saída **existem e têm nomes próprios** (payload diferente do webhook
  de cobrança já implementado — vai precisar de handler novo, não só extensão dos ifs atuais):
  - Boleto: `BILL_CREATED`, `BILL_PENDING`, `BILL_BANK_PROCESSING`, `BILL_PAID` (evento
    terminal de sucesso — equivalente ao `PAYMENT_RECEIVED` da Fase 6).
  - Transferência: `TRANSFER_CREATED`, `TRANSFER_PENDING`, `TRANSFER_IN_BANK_PROCESSING`,
    `TRANSFER_DONE` (sucesso), `TRANSFER_FAILED`, `TRANSFER_BLOCKED`, `TRANSFER_CANCELLED`.
- **Mecânica de saldo confirmada**: `/v3/bill` e `/v3/transfers` debitam **saldo disponível
  da própria conta Asaas** — não há débito automático do banco corrente do cliente. O risco
  levantado na Seção 6 é real e vira requisito: a empresa precisa **transferir caixa para
  dentro da conta Asaas antes de pagar qualquer título por ela** (aporte manual ou automatizado
  — a definir com o financeiro).
- **Sandbox só aceita boleto próprio**: para testar `POST /v3/bill` é preciso gerar o boleto
  **na própria conta Asaas sandbox** (`POST /v3/payments` billingType=BOLETO) e usar a linha
  digitável dele — linha digitável de boleto real externo retorna erro/`FAILED`. Isso limita o
  teste de ponta a ponta do fluxo de boleto de fornecedor real; o teste teórico do endpoint é
  válido, mas o cenário "boleto de fornecedor real chega e é pago" só se valida em produção
  com valor baixo controlado.
- **PIX de teste** usa chaves fictícias oficiais do Bacen (ex. CPF `99991111140`, conta
  virtual mensageria `99999004`) — completa com sucesso e debita o saldo sandbox, mas sem
  compensação real (são fictícias, não uma segunda conta de teste).
- **Saldo sandbox** se popula confirmando manualmente o recebimento de uma cobrança fictícia
  criada na própria conta (mesmo mecanismo já usado para testar a Fase 6 — `receiveInCash`).

**Ainda pendente, só o usuário consegue verificar (painel Asaas, não acessível por API):**
- [ ] Confirmar se a conta Asaas atual (a mesma da Fase 6) já tem `BILL:WRITE` habilitado, ou
      se precisa de solicitação/KYC adicional para operações de saída — normalmente mais
      rigoroso do que o KYC para só receber.
- [ ] Definir com o financeiro a política de aporte de saldo na conta Asaas (quanto manter,
      quem autoriza a transferência de fundo, frequência).
- [ ] Confirmar se a Asaas cobra tarifa por pagamento de boleto/transferência (impacta o campo
      `fee` de `supplier_payments` e o registro de despesa — mesmo padrão da taxa gateway da
      Fase 6, ver [[project_asaas_dupla_conciliacao]]).

### Fase 1 — Pagamento de boleto de terceiro *(3 sprints)* — ✅ CÓDIGO+DEPLOY CONCLUÍDOS (2026-07-03)
- Migration `supplier_payments` (20261231000014) — aplicada no remoto.
- Edge Function `asaas-payment` (actions `quote`, `pay`, `cancel`) — reusa padrão de erro/JWT
  de `asaas-charge`. Deployada.
- `supplierPaymentService.ts`. Criado.
- Botão "Pagar via Asaas" em `ContasPagarManager`, modal (`PagarBoletoAsaasModal.tsx`) com
  beneficiário + CPF/CNPJ + alerta de divergência de valor OCR×Asaas + taxa. Integrado.
- Extensão do `asaas-webhook` para eventos `BILL_*` (payload usa chave `bill`, campo `fee`
  registrado como despesa "Taxa Gateway Asaas", mesmo padrão da Fase 6). Deployada.
- Gate mínimo: exige boleto já `aprovado` no fluxo existente (== is_financial_approved
  implícito).

**Schema real confirmado via OpenAPI oficial da Asaas (fornecida pelo usuário, 2026-07-03)** —
corrigiu 3 suposições erradas da 1ª versão do código:
1. O nome do beneficiário só existe na resposta de `/v3/bill/simulate`, aninhado em
   `bankSlipInfo.beneficiaryName` (+ `beneficiaryCpfCnpj`, `value`, `isOverdue`) — **não** no
   nível raiz como a 1ª versão assumia.
2. A resposta de `POST /v3/bill` (criar pagamento) **não tem** nome de beneficiário, só
   `companyName` (opcional).
3. O campo `value` do request de `POST /v3/bill` é documentado como "para contas que NÃO têm
   essa informação" (ex.: fatura de cartão) — um boleto padrão já carrega o valor na própria
   linha digitável; a 1ª versão enviava `value` sempre, o que foi removido.
4. Bônus: `fee` (taxa Asaas) está confirmado tanto na simulação quanto na resposta de criação
   — persistido em `supplier_payments.fee` e registrado como despesa no webhook.
5. Status oficiais do bill: `PENDING, BANK_PROCESSING, PAID, FAILED, CANCELLED, REFUNDED,
   AWAITING_CHECKOUT_RISK_ANALYSIS_REQUEST` — mapeados internamente para o enum simplificado
   de `supplier_payments.status`.

**Critérios de aceite:** boleto aprovado → pago via Asaas → `boletos.status='pago'` e título
baixado automaticamente ao confirmar no webhook; beneficiário exibido bate com o real antes
da confirmação; nenhum pagamento disparado sem aprovação prévia. **Ainda não testado em
sandbox de ponta a ponta** — bloqueado pelos 3 itens da Fase 0 (permissão BILL:WRITE, saldo,
tarifa) que só o usuário verifica no painel Asaas.

### Fase 2 — Transferência PIX para fornecedor *(2 sprints)*
- Reusa `supplier_payments` (payment_type=PIX_TRANSFER) e `supplier_bank_accounts` existente.
- Botão "Pagar via PIX" nos títulos AP sem boleto.
- Extensão do webhook para eventos de transferência.

**Critérios de aceite:** título sem boleto pago via PIX para a conta principal do fornecedor;
baixa automática; erro de chave inválida tratado com mensagem clara (não só HTTP 502 cru).

### Fase 3 — Governança forte *(2 sprints, pode rodar em paralelo às 1/2 se a Fase 3 do
financeiro já estiver pronta)*
- Substitui o gate binário pelo motor de alçada por faixa (reuso do que a Fase 3 do
  `PLANO_MODULO_FINANCEIRO.md` cria).
- Trilha de auditoria dedicada (`supplier_payments_auditoria`, espelho de `boletos_auditoria`).
- RLS restrita por role no disparo de pagamento (não só `is_org_member`).

**Critérios de aceite:** título acima da faixa não dispara pagamento sem todas as
assinaturas; toda ação (aprovar/disparar/cancelar) fica em log auditável e imutável.

### Fase 4 — Agendamento e lote *(deferido, sem estimativa)*
- `scheduleDate` para pagamento futuro (já suportado pela API, só falta UI de calendário —
  reusa a Fase 4 do financeiro, Calendário Financeiro).
- Pagamento em lote (múltiplos títulos numa só ação, respeitando alçada de cada um).

---

## 8. Resumo de esforço e dependências

| Fase | Escopo | Esforço | Depende de |
|---|---|---|---|
| 0 | Descoberta/validação Asaas (saldo, KYC, sandbox) | — | conta Asaas já existente (Fase 6) |
| 1 | Pagamento de boleto de terceiro | 3 sprints | Fase 0 |
| 2 | Transferência PIX a fornecedor | 2 sprints | Fase 0; `supplier_bank_accounts` (já existe) |
| 3 | Governança forte (alçada + auditoria + RLS restrita) | 2 sprints | Fase 3 do `PLANO_MODULO_FINANCEIRO.md` |
| 4 | Agendamento e lote | — | Fases 1–3; Fase 4 do financeiro (Calendário) |

**Risco principal, não técnico:** a mecânica de saldo pré-pago na Asaas para pagamentos de
saída pode exigir que a empresa mantenha caixa alocado dentro da conta Asaas — decisão de
tesouraria que precisa ser validada com o financeiro antes de qualquer investimento em
código (daí a Fase 0 ser um pré-requisito formal e não apenas "sprint 0" de costume).

## 9. Classificação estratégica
- **Tier A** — Fase 1 (boleto) sozinha já fecha o ciclo AP mais comum.
- **Tier A+** — + Fase 2 (PIX), cobre a maioria dos casos de pagamento avulso.
- **Tier S** — + Fase 3 (governança), necessária para uso em produção com volume real —
  sem isso o módulo é um risco operacional, não um ganho.
- **Tier S+** — + Fase 4 (agendamento/lote).

---

Relacionado: [[project_modulo_financeiro_fase6]] (arquitetura espelho, recebimento),
[[project_modulo_financeiro_plano]] (Fase 3 = motor de alçada a reusar aqui),
[[project_modulo_contratos]] (`ContractApprovalWorkflow`, motor de aprovação original).
