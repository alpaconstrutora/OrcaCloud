# PRD / Plano de Implementação — Remuneração Societária (Pró-labore, Lucros e Dividendos)

> Módulo transversal **RH + Financeiro + Fiscal + Contábil + Societário** para gerir
> pró-labore de sócio-administrador e distribuição de lucros/dividendos, com trilha
> societária, retenções e integração ao financeiro/contábil.
>
> **Ancorado no schema real (verificado 2026-07-03).** Este plano reescopa o PRD original
> sobre o que **já existe** no ÒPURA — não recria cadastro de sócio nem motor fiscal.

---

## 1. Por que agora

Você opera holding + SPEs + construtora + concreteira + distribuidoras. Hoje pró-labore e
distribuição de lucro vivem em **planilha, WhatsApp e lançamento manual** no financeiro.
Isso é exatamente o processo que o ÒPURA deve capturar: naturezas distintas (remuneração de
trabalho × retorno de capital), retenções específicas, aprovação societária formal e
rastreabilidade por empresa/sócio/competência.

Há ainda um **gatilho fiscal 2026**: a Lei nº 15.270/2025 institui retenção na fonte de
**10%** sobre lucros/dividendos pagos por uma mesma PJ a uma mesma **PF residente** acima de
**R$ 50.000,00 no mês**, com recálculo sobre o total mensal quando há mais de um pagamento.
Sem um agregador mensal por (empresa × beneficiário), esse cálculo é impossível de fazer à mão
com segurança.

---

## 2. Princípio de arquitetura — reusar, não recriar

**Regra de ouro:** o cadastro de sócio/participação **já é canônico em Empresas/Companies**
(`company_partners` + `CompanyPartnersTab.tsx`). O módulo de RH → Remuneração Societária
**consome** essa entidade; não duplica um `partners` novo. Mesma decisão tomada em
`PLANO_MIGRACAO_CARGOS_RH.md` (a entidade fica no dono canônico, o RH reusa o service).

### 2.1 Realidade do schema (o que será reusado)

| Necessidade do PRD | Já existe | Observação |
|---|---|---|
| Cadastro de sócio / participação / holding sócia | `company_partners` (migration `20260601000001`): `company_id`, `tipo_pessoa` pf/pj, `documento`, `participacao_pct`, `is_administrador`, `is_assinante_legal`, `pj_company_id`, `data_entrada/saida` + RLS por org | **Estender**, não criar (§17.2 do PRD morre aqui) |
| Motor INSS/IRRF | `inss_brackets`, `irrf_brackets`, `fgts_config` versionados por competência (`fiscalService.getINSSBrackets(refDate)`); `payrollEngine` já calcula + `applyIRRFReducer` p/ 2026; `lib/payrollCalc` | Reusar o cálculo; **não** criar `tax_rules` genérica ao lado |
| Contas a pagar / ledger | `internal_transactions` (`organization_id`, `source_system`, `reference_id`, `project_id`, `cost_center_id`, `transaction_date`, `amount`, `direction` CREDIT/DEBIT, `category`, `status`) | Pró-labore/dividendo/IRRF/INSS entram como `DEBIT` |
| Aprovação multinível + segregação de funções | ÒPURA Governance `authority_limits` (alçadas) + `financialApprovalService` + assinatura ZapSign (Contratos) | Reusar; não inventar workflow |
| Ata / recibo / informe | `opura_documents` + versões + emissão `.docx` com marcadores `{001}` (`docxRenderService`) | Recibo e informe = template `.docx` |
| eSocial do pró-labore de sócio | `LaborEsocial.tsx` | Plugar evento remuneração de administrador |

### 2.2 Dependência crítica (gargalo)

O **"lucro distribuível validado"** (§7/§15 do PRD) depende de contabilidade em **partida
dobrada → balanço → lucros acumulados**, que é a **Fase 3 da Controladoria** — **ainda não
implementada** (hoje: Balancete via `fn_balancete`, Fase 1). 

**Decisão de escopo:** no MVP, `available_profit_amount` é **entrada manual do usuário com
anexo obrigatório de balancete/DRE** (rotulado honestamente como "informado, não apurado pelo
sistema"). A automação do lucro entra numa fase posterior, atada à Controladoria F3.

---

## 3. Escopo

**Dentro (MVP):**
1. Estender `company_partners` com atributos de remuneração/beneficiário.
2. Regime de remuneração por sócio (`partner_compensation_settings`): pró-labore recorrente,
   vigência, dia de pagamento, centro de custo, conta bancária.
3. Folha de pró-labore mensal (`prolabore_payrolls` + `_items`) com cálculo INSS/IRRF via
   `fiscalService`/`payrollEngine`, gerando `internal_transactions`.
4. Distribuição de lucros (`profit_distribution_batches` + `_items`): proporcional automática,
   anexo de ata, aprovação, agregador mensal e **retenção 10%** parametrizável.
5. Recibo de pró-labore/dividendo via `.docx` + alerta > R$ 50k/mês por PF.

**Fora (Fase 2/3 — deferido):**
- Lucro distribuível apurado automaticamente (depende de Controladoria F3).
- Distribuição desproporcional com validação documental robusta.
- DRE por SPE, consolidação por holding, informes anuais.
- Simuladores de pró-labore ideal / projeção de caixa (Fase 3 — Inteligência).
- Execução de pagamento (PIX/boleto) — reusa `PLANO_MODULO_PAGAMENTO_TITULOS.md` quando sair.

**Nunca:** misturar com Suprimentos / Serviços / Vendas de Ativos. Remuneração societária é um
**quarto domínio financeiro** independente.

---

## 4. Modelo de dados (delta sobre o existente)

### 4.1 Estender `company_partners` (ALTER, não CREATE)

```sql
ALTER TABLE company_partners
  ADD COLUMN IF NOT EXISTS cpf_beneficiario     TEXT,   -- se documento guarda CNPJ da PJ
  ADD COLUMN IF NOT EXISTS beneficiario_tipo    TEXT CHECK (beneficiario_tipo IN
                              ('pf_residente','pj_residente','exterior')),
  ADD COLUMN IF NOT EXISTS dependentes_ir       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_account_id      UUID REFERENCES company_bank_accounts(id),
  ADD COLUMN IF NOT EXISTS pix_chave            TEXT,
  ADD COLUMN IF NOT EXISTS regime_remuneracao   TEXT CHECK (regime_remuneracao IN
                              ('prolabore','dividendos','ambos','nenhum')) DEFAULT 'nenhum';
```

### 4.2 `partner_compensation_settings`

```
id, partner_id (FK company_partners), company_id,
has_prolabore BOOL, prolabore_amount NUMERIC(15,2),
prolabore_start_date, prolabore_end_date,
cost_center_id UUID,          -- alocação (admin geral/holding/obra/CC)
payment_day INT, bank_account_id UUID,
created_at, updated_at
```

### 4.3 `prolabore_payrolls` / `prolabore_payroll_items`

```
prolabore_payrolls:
  id, company_id, competence_month DATE, status TEXT,
  gross_total, inss_total, irrf_total, net_total,
  approved_by, approved_at, created_at, updated_at

prolabore_payroll_items:
  id, payroll_id, partner_id, gross_amount, inss_amount, irrf_amount,
  net_amount, cost_center_id,
  financial_entry_id UUID,      -- FK internal_transactions
  receipt_document_id UUID,     -- FK opura_documents
  status, created_at, updated_at
```

Status: `rascunho → calculado → em_aprovacao → aprovado → enviado_financeiro → pago →
contabilizado → encerrado` (+ `cancelado`/`recalculado`/`bloqueado`).

### 4.4 `profit_distribution_batches` / `profit_distribution_items`

```
profit_distribution_batches:
  id, company_id, profit_period_start, profit_period_end,
  accounting_profit_amount, available_profit_amount,   -- MANUAL no MVP + anexo
  proposed_amount, approved_amount,
  approval_date, payment_date, distribution_rule TEXT,  -- proporcional/manual/acordo
  status, document_id UUID, created_by, approved_by, created_at, updated_at

profit_distribution_items:
  id, batch_id, partner_id, beneficiary_type,
  ownership_percentage, gross_amount,
  withholding_tax_amount,       -- retenção 10% quando aplicável
  net_amount, financial_entry_id, receipt_document_id, status, created_at, updated_at
```

### 4.5 Regra fiscal versionada (padrão `inss_brackets`, **não** `tax_rules` genérica)

```sql
CREATE TABLE dividend_withholding_rules (
  id UUID PK, year INT,
  beneficiary_type TEXT,        -- pf_residente
  monthly_threshold NUMERIC(15,2),  -- 50000.00
  rate NUMERIC(5,4),            -- 0.1000
  effective_from DATE, effective_to DATE, is_active BOOL
);
-- Seed: 2026 / pf_residente / 50000 / 0.10 / 2026-01-01
```

RLS em todas as tabelas novas seguindo o padrão de `company_partners` (org via
`companies.org_id` + `organization_members` com **dual-check uid+email**, conforme
[[feedback_rls_organization_members]]).

---

## 5. Motor de cálculo

### 5.1 Pró-labore
Reusa `fiscalService.getINSSBrackets/getIRRFBrackets(competence_month)` e
`lib/payrollCalc.calculateINSS/calculateIRRF` (+ `applyIRRFReducer` p/ ano ≥ 2026). O sócio
pró-labore **não tem FGTS** e não usa rubricas de folha CLT — chamamos o cálculo direto, sem
passar pelo `payrollEngine` completo (que é orientado a `Employee`/rubricas). Extrair as duas
funções puras é suficiente.

### 5.2 Dividendos — agregador mensal (peça central e nova)
```
para cada (company_id, partner_id PF residente) no mês:
  total_mes = Σ gross_amount de TODOS os itens pagos/creditados no mês (todos os batches)
  se total_mes > monthly_threshold:
     retencao = total_mes * rate  (recalculada sobre o total, creditando o já retido)
  distribui a retenção proporcionalmente entre os itens do mês
```
Isto **não existe** hoje e é o coração do compliance 2026. Implementar como função server-side
(RPC PL/pgSQL) para garantir atomicidade do "total do mês", evitando corrida entre dois
pagamentos concorrentes.

### 5.3 Distribuição proporcional
`gross_amount = available_profit × (participacao_pct / Σ participacao_pct dos ativos)`.
Manual/desproporcional exige `distribution_rule='manual'` + justificativa + documento anexado
+ permissão (Fase 2).

---

## 6. Integração financeira e contábil

- **Financeiro:** cada `_item` aprovado gera `internal_transactions` `direction='DEBIT'`,
  `source_system='PROLABORE'`/`'DIVIDENDOS'`, `category` própria, `cost_center_id`,
  `reference_id` = id do item, `status='PENDING'` → `CONCILIATED` na baixa. IRRF/INSS retidos
  geram lançamentos de **tributo a recolher** separados (mesmo padrão da costura AP do
  [[project_p2p_fluxo_integrado]]).
- **Contábil (quando F3 sair):** pró-labore → D: despesa remuneração de administradores /
  C: pró-labore a pagar / C: INSS a recolher / C: IRRF a recolher. Dividendos → D: lucros
  acumulados / C: dividendos a pagar / C: IRRF a recolher.
- **Comprovantes:** recibo e informe via `.docx` (`docxRenderService`), arquivados em
  `opura_documents` e linkados em `receipt_document_id`.

---

## 7. Governança (aprovação + segregação de funções)

Reusar `authority_limits` (alçadas) + `financialApprovalService`. Regra de SoD (§11.2): o
mesmo usuário **não** pode cadastrar, aprovar, marcar pago e contabilizar o mesmo batch —
enforcement na transição de status (checar `created_by`/`approved_by`). Ata/deliberação
anexada é **pré-condição** para o status `aprovado` de distribuição.

---

## 8. UI — RH → Remuneração Societária

Menu novo em `LaborModule` (NavItem `labor-remuneracao-societaria`), submenus:
1. **Sócios e Administradores** — lista consumindo `company_partners` (link p/ o cadastro em
   Empresas; aqui só o recorte de regime de remuneração).
2. **Pró-labore** — folha mensal, simulação de líquido, aprovação, geração de AP + recibo.
3. **Lucros e Dividendos** — proposta, `available_profit` manual + anexo, simulação
   proporcional, agregador/retenção, aprovação, envio ao financeiro.
4. **Aprovações** — fila reusando o workflow de alçadas.
5. **Comprovantes** — recibos/informe `.docx`.
6. **Relatórios / Dashboard** — pró-labore e dividendos por sócio/empresa/CC, alertas de risco.

Seguir primitivas de `UI_PATTERNS.md` (Sheet/Modal, `useConfirm` em vez de `confirm()` —
note que `CompanyPartnersTab` ainda usa `confirm()` nativo; o módulo novo não deve).

---

## 9. Faseamento

**Fase 1 — MVP funcional**
- ALTER `company_partners` + `partner_compensation_settings`.
- Pró-labore mensal (cálculo INSS/IRRF reusando fiscalService) → AP + recibo.
- Distribuição de lucros: proporcional automática, `available_profit` manual + anexo ata,
  aprovação, agregador mensal + retenção 10%, alerta > R$ 50k.
- Relatório por sócio/empresa.

**Fase 2 — Governança e compliance**
- Desproporcional validada, SoD completo, integração contábil (atrelada à Controladoria F3),
  informes anuais, múltiplas empresas do grupo, consolidação por holding, assinatura eletrônica.

**Fase 3 — Inteligência**
- Simulador pró-labore × dividendos, projeção de caixa para distribuição, recomendação segura,
  score de risco societário, detecção de anomalias.

---

## 10. Critérios de aceite (MVP)

**Pró-labore:** sócio-administrador ativo com pró-labore mensal; sistema calcula bruto/INSS/
IRRF/líquido; envia ao financeiro (`internal_transactions`); gera recibo `.docx`; histórico
mensal persistido; relatório por sócio/empresa.

**Dividendos:** criar distribuição por empresa; participação de cada sócio calculada
automaticamente; bloqueio se acima do `available_profit` informado; ata obrigatória para
aprovar; alerta/retenção quando PF residente ultrapassa R$ 50k/mês na mesma empresa (agregado);
lançamentos líquidos ao financeiro; relatório por sócio.

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Lucro distribuível não é apurado pelo sistema (Controladoria F3 pendente) | MVP usa entrada manual + anexo, rotulado; automação só na F3 |
| Regra fiscal 2026 muda | Tudo parametrizado por competência (`dividend_withholding_rules`), sem hardcode |
| Corrida entre 2 pagamentos no mesmo mês quebra o total agregado | Agregador em RPC server-side atômica |
| Duplicar sócio/motor fiscal | Reuso obrigatório de `company_partners` + `fiscalService` |
| RLS incorreta cross-tenant | Copiar padrão de `company_partners` (dual-check uid+email) — nunca inventar |
| Contaminar outros domínios financeiros | Domínio isolado; `source_system` próprio |
