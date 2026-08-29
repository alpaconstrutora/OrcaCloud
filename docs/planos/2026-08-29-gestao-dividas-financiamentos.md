# Gestão de Dívidas e Financiamentos — avaliação e plano

## Pedido original

> Sessão: eec65ad5-08c5-4260-8056-ed9ed6cd9ac4 · 2026-08-29

```
avalie: Novo módulo ÒPURA: Gestão de Dívidas e Financiamentos

A denominação mais adequada é Gestão de Dívidas e Financiamentos, pois o escopo deve abranger não apenas empréstimos bancários, mas todas as obrigações financeiras contratadas pela holding, empresas, SPEs e obras.

O módulo não deve ser uma simples duplicação do Contas a Pagar. Ele será o controlador do contrato financeiro e da evolução da dívida, enquanto o Financeiro continuará responsável pela liquidação e conciliação dos pagamentos.

1. Objetivo

Centralizar todo o ciclo de vida das operações de crédito:

O módulo deverá responder com precisão:

Quanto cada empresa deve?
Quanto será pago nos próximos meses?
Quanto corresponde a principal, juros, encargos e tarifas?
Qual instituição possui maior exposição?
Qual é o custo efetivo de cada operação?
Quais garantias estão comprometidas?
Qual dívida financia cada obra, imóvel, veículo ou equipamento?
Existem parcelas, documentos ou covenants em risco?
Qual o impacto das dívidas no caixa projetado?
2. Tipos de operação

O cadastro deve admitir:

Capital de giro;
Conta garantida;
Crédito rotativo;
Antecipação de recebíveis;
Empréstimo com garantia;
Financiamento imobiliário;
Financiamento à produção;
Plano Empresário;
Financiamento de máquinas e equipamentos;
FINAME/BNDES;
Financiamento de veículos;
Crédito para energia solar;
Cédula de Crédito Bancário — CCB;
Leasing e arrendamento mercantil;
Consórcio;
Mútuo entre empresas do grupo;
Mútuo com sócios;
Dívida com investidores;
Debêntures ou instrumentos equivalentes;
Operações personalizadas.

É importante distinguir:

Instituições financeiras;
Partes relacionadas;
Investidores e terceiros.

Essa separação afeta contabilidade, governança, tributação e consolidação do grupo.

3. Cadastro do contrato financeiro
Identificação
Empresa, SPE ou holding contratante;
Instituição financeira e agência;
Número do contrato;
Modalidade;
Finalidade do recurso;
Data da contratação;
Data da liberação;
Data do primeiro vencimento;
Data do vencimento final;
Responsável interno;
Status da operação.
Valores
Valor contratado;
Valor efetivamente liberado;
Liberações parciais;
Valor retido;
Tarifas descontadas;
IOF;
Seguros;
Custos cartorários;
Outras despesas;
Valor líquido recebido.
Condições financeiras
Taxa fixa ou variável;
Taxa nominal;
Taxa efetiva;
Periodicidade da taxa;
Indexador: CDI, IPCA, TR, Selic ou personalizado;
Percentual do indexador;
Spread bancário;
CET;
Carência de principal;
Carência de juros;
Capitalização de juros;
Periodicidade das parcelas;
Multa e juros por atraso.
Sistemas de amortização
SAC;
Price;
SACRE;
Americano;
Bullet;
Juros periódicos e principal no vencimento;
Parcelas manuais;
Fluxo irregular;
Sistema personalizado.
4. Motor de cálculo financeiro

O sistema deverá gerar a memória completa de cada parcela, separando:

Componente	Tratamento
Saldo inicial	Saldo antes da movimentação
Amortização	Redução efetiva do principal
Juros	Custo financeiro do período
Correção monetária	Variação do indexador
IOF	Imposto da operação
Seguro	Encargo contratual
Tarifas	Custos bancários
Multa e mora	Encargos por atraso
Parcela total	Valor devido
Saldo final	Principal remanescente

Também deverá calcular:

CET por fluxo de caixa;
Taxa interna efetiva da operação;
Saldo devedor em qualquer data;
Juros apropriados por competência;
Valor para liquidação antecipada;
Economia estimada com antecipação;
Impacto de amortizações extraordinárias;
Recalculo por alteração de indexadores;
Comparação entre proposta e execução real.
Regra arquitetural indispensável

O sistema deve manter três camadas separadas:

Cronograma contratual original;
Cronograma vigente ou revisado;
Movimentações efetivamente realizadas.

Uma renegociação nunca deve sobrescrever o contrato original. Ela deve gerar uma nova versão, preservando toda a rastreabilidade.

5. Simulador e comparação de propostas

Antes da contratação, o usuário poderá cadastrar propostas de diferentes bancos e compará-las.

Comparações
Valor bruto e líquido liberado;
Taxa nominal;
Taxa efetiva;
CET;
Total de juros;
Total de encargos;
Valor das parcelas;
Carência;
Prazo total;
Garantias exigidas;
Covenants;
Custo da liquidação antecipada;
Impacto mensal no caixa;
Custo total da operação.

O sistema deve permitir simular:

SAC versus Price;
Prazos diferentes;
Entrada ou amortização inicial;
Carências alternativas;
Cenários de CDI e IPCA;
Amortizações extraordinárias;
Refinanciamento de dívida existente.

A recomendação não deve considerar apenas a menor taxa: garantias, covenants, concentração bancária e pressão sobre o caixa também precisam entrar na análise.

6. Gestão das parcelas

Cada contrato deverá gerar automaticamente seu cronograma financeiro.

Situações da parcela
Prevista;
Provisionada;
A vencer;
Em aprovação;
Paga;
Parcialmente paga;
Vencida;
Renegociada;
Antecipada;
Cancelada.
Funcionalidades
Geração de títulos no Contas a Pagar;
Baixa automática ou manual;
Pagamento parcial;
Antecipação de parcelas;
Amortização extraordinária;
Reclassificação de encargos;
Registro de divergência bancária;
Anexação do comprovante;
Conciliação com extrato bancário;
Histórico completo de alterações.

O módulo da dívida será a fonte do cronograma; o Contas a Pagar receberá os títulos correspondentes. Isso evita dois cadastros independentes produzindo saldos diferentes.

7. Destinação dos recursos

Cada liberação poderá ser vinculada a:

Empresa;
SPE;
Obra;
Empreendimento;
Centro de custo;
Projeto;
Imóvel;
Máquina;
Equipamento;
Veículo;
Conta bancária;
Contrato com cliente;
Aquisição específica.

Também deve ser possível ratear uma operação entre múltiplos destinos.

Isso permitirá medir, por exemplo, a dívida e o custo financeiro real de cada empreendimento.

8. Garantias
Tipos de garantia
Imóvel;
Terreno;
Unidade imobiliária;
Recebíveis;
Aplicação financeira;
Veículo;
Máquina ou equipamento;
Aval;
Fiança;
Seguro garantia;
Alienação fiduciária;
Hipoteca;
Penhor;
Cessão fiduciária;
Garantia cruzada entre empresas.
Controles
Valor de mercado;
Valor aceito pelo banco;
Percentual comprometido;
Proprietário do bem;
Contratos vinculados;
Documentos;
Registro em cartório;
Data de avaliação;
Validade da avaliação;
Liberação da garantia;
Indicador loan-to-value — LTV.

Deve haver alerta para um mesmo ativo oferecido em mais de uma operação incompatível.

9. Covenants e obrigações contratuais

Cadastro e monitoramento de:

Limite de endividamento;
Dívida líquida/EBITDA;
Cobertura do serviço da dívida;
Patrimônio líquido mínimo;
Manutenção de saldo bancário;
Índice de liquidez;
Limite de distribuição de dividendos;
Obrigação de envio de balanços;
Seguro obrigatório;
Atualização periódica das garantias;
Restrições para novas dívidas;
Condições específicas do contrato.

O sistema deverá registrar:

Fórmula;
Periodicidade;
Meta ou limite;
Resultado apurado;
Margem de segurança;
Evidências;
Responsável;
Situação: regular, atenção ou violado.
10. Dashboard gerencial
Indicadores principais
Dívida total;
Dívida líquida;
Saldo por empresa e SPE;
Curto e longo prazo;
Principal versus encargos;
Custo médio ponderado da dívida;
Prazo médio da dívida;
Parcelas nos próximos 30, 90 e 365 dias;
Serviço mensal da dívida;
Juros projetados;
Dívidas vencidas;
Garantias comprometidas;
Concentração por instituição;
Concentração por indexador;
Percentual da dívida fixa e variável;
Covenants em risco;
DSCR;
Dívida líquida/EBITDA.
Visualizações
Curva de amortização;
Calendário de vencimentos;
Evolução do saldo devedor;
Fluxo mensal de principal e juros;
Dívida por empresa;
Dívida por obra;
Dívida por banco;
Dívida por modalidade;
Mapa de garantias;
Cenários de exposição a CDI e IPCA.
11. Integrações com o ÒPURA
Módulo	Integração
Contas a Pagar	Geração e baixa das parcelas
Tesouraria	Planejamento das saídas de caixa
Conciliação Bancária	Identificação dos pagamentos
Contabilidade	Principal, juros, encargos e apropriações
FP&A	Cenários, orçamento e projeções
Obras	Alocação da dívida e dos juros por projeto
Incorporação	Financiamento à produção e recebíveis vinculados
Gestão de Bens	Controle dos ativos dados em garantia
DMS/ÒPURA Docs	Contratos, aditivos e comprovantes
Societário	Mútuos entre empresas e sócios
Notificações	Vencimentos, covenants e documentos
Aprovações	Contratação, renegociação e amortização
12. Relatórios
Posição consolidada da dívida;
Extrato por contrato;
Evolução do saldo devedor;
Cronograma de amortização;
Obrigações por período;
Principal e juros por competência;
Custo financeiro por empresa;
Custo financeiro por obra;
Dívida por instituição;
Dívida por indexador;
Garantias vinculadas;
Covenants;
Contratos próximos do vencimento;
Operações renegociadas;
Dívidas de curto e longo prazo;
Projeção de juros;
Relatório para auditoria;
Relatório para diretoria;
Relatório de circularização bancária.
13. MVP recomendado
MVP 1 — Controle operacional
Cadastro de instituições;
Cadastro dos contratos;
SAC, Price, Bullet e parcelas manuais;
Taxas fixas e indexadas;
Cronograma de parcelas;
Separação entre principal, juros e encargos;
Liberações totais e parciais;
Geração de Contas a Pagar;
Registro de pagamentos;
Amortização extraordinária;
Saldo devedor;
Anexos e documentos;
Alertas de vencimento;
Dashboard consolidado;
Relatórios básicos.
MVP 2 — Gestão estratégica
Simulador de propostas;
CET;
Cenários de CDI e IPCA;
Garantias;
Covenants;
Renegociações e versionamento;
Concentração bancária;
Projeção de caixa;
Apropriação contábil;
Rateio por obra ou empreendimento.
MVP 3 — Inteligência financeira
Importação automática de contratos e planilhas bancárias;
APIs bancárias;
Conciliação automática;
Leitura de contratos por IA;
Extração de taxas, garantias e covenants;
Detecção de divergências;
Recomendação de amortização;
Simulação de refinanciamento;
Alertas de risco;
Benchmark entre instituições;
Consolidação automática da dívida do grupo.
Diretriz final

O ponto mais crítico é não permitir que o módulo seja apenas um cadastro de contratos com parcelas. O valor estratégico estará na combinação de:

contrato original + saldo efetivo + projeção de caixa + garantias + covenants + custo por empresa ou empreendimento.

Assim, o ÒPURA passa a oferecer uma verdadeira visão de endividamento consolidado para a ALPA Holding, suas empresas, SPEs e obras.
```

---

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-29 | Dívida com investidores / debêntures — o ÒPURA já tem Portal do Investidor. Onde vive? | **Só instituições financeiras + partes relacionadas.** O Portal do Investidor continua dono; o módulo apenas consolida o saldo dele em leitura. |
| 2026-08-29 | Mútuo entre empresas do grupo é passivo numa e ativo na outra. Como tratar? | **Espelho automático** — um cadastro gera as duas pontas, cronogramas vinculados, eliminação na consolidação. |
| 2026-08-29 | Como a parcela (principal + juros + correção + seguro + tarifa) chega no Contas a Pagar? | **Decomposta em várias linhas**, uma por componente, cada uma com sua categoria do plano de contas. |
| 2026-08-29 | MVP 1 tem 15 itens — entregar de uma vez ou fatiar? | **Fatiar em 3 entregas**: F1a cadastro+motor+cronograma · F1b ponte AP+pagamentos+saldo · F1c dashboard+alertas+relatórios. |

⚠️ A escolha "decomposta" tem uma consequência **verificada** no código — ver Risco 1. É
implementável, mas exige corrigir a `fn_dre` no mesmo lote de migrations.

---

## O que a investigação achou antes de qualquer código

**Veredito:** o diagnóstico do PRD está correto — **não existe nada de dívida/financiamento
no ÒPURA**. Zero tabelas, zero services, zero telas; a palavra `covenant` não aparece em
nenhum arquivo do repositório. A dívida só existe hoje como *percentual de funding* num
estudo de viabilidade (`types/imovib.ts:393` — `financing_percent`, `financing_rate_annual`),
sem contrato, sem cronograma, sem saldo.

Mas **não é greenfield**. Reuso estimado: **45–55%**.

### 1. O que já existe e deve ser reusado (não reconstruído)

| Peça | Onde | Cobre do PRD |
|---|---|---|
| Ledger + Contas a Pagar | `internal_transactions` (`20240313000000_bank_reconciliation.sql:5`) → view `vw_payables` (`aplicar_20270914000014_vw_payables_obra.sql:42`) → `services/payableService.ts` → `components/ContasPagarParcelas.tsx` | 6 — geração de títulos, baixa, status |
| Indexadores | `contract_index_values` (`20261102000007`) + `services/contractIndexService.ts` + `components/ContractIndexManager.tsx`, com seed 2025-2026 | 3 — indexador; 4 — correção monetária |
| Garantias | `contract_guarantees` + `contract_guarantors` + `guarantee_documents` + **`guarantee_deposit_events`** (ledger de caução) + RPC `fn_contract_guarantees_expiring` (`aplicar_20270836000000/parte1..6`) | 8 — quase inteiro |
| Motor financeiro puro | `utils/financialMath.ts` — `calculatePMT` (**é a fórmula Price**), `calculateNPV`, `calculateIRR`; testado em `__tests__/financialMath.test.ts` | 4 — CET/TIR; 5 — comparação |
| Motor de fluxo com correção | `services/salesPlanService.ts` → `simulatePayment()` puro e determinístico, `cashFlow[]` mensal, VPL | 5 — simulador (o inverso: recebível) |
| Conciliação | `bank_transactions` + `reconciliation_matches` + `services/bankReconciliationService.ts` | 6 e 11 — funciona de graça para qualquer `internal_transaction` |
| Contraparte, tomador, ativos | `suppliers` (com CNPJa; `email` já é nullable desde `20260223000000`), `companies.tipo IN ('holding','spe',…)`, `opura_assets` | 2, 3, 7, 8 |
| Dimensões contábeis | `cost_centers_v2`, `plano_de_contas`, `financial_categories` (já tem `dre_group='PASSIVO'` e `nature='LIABILITY'` desde `20260628000004:24`) | 7 — destinação; 11 — contabilidade |
| Alçada de aprovação | `financial_approval_config` + `services/financialApprovalService.ts` | 11 — aprovações |
| Padrão de alerta por cron | `fn_contract_guarantees_expiring`, `fn_warranty_sla_sweep` | 9 — covenants; 10 — alertas |

### 2. Os três gaps que não têm nada aproveitável

- **Motor de amortização.** `calculatePMT` dá a prestação, mas **não existe gerador de
  cronograma**: nenhuma decomposição principal/juros/saldo por parcela, nenhum SAC (o
  literal `SAC` não aparece em nenhum `.ts`/`.tsx`), nenhum XIRR — só IRR de fluxo uniforme,
  e em **duas implementações duplicadas** (Newton-Raphson em `utils/financialMath.ts:27`,
  bissecção em `hooks/useImovibMath.ts:38`).
- **Cronograma versionado em 3 camadas.** `ContractInstallment` é literalmente
  `{ date: string; value: number }` (`types/contracts.ts:161`). Não cabe parcela de dívida.
- **Covenants.** Zero ocorrências no repositório.

### 3. Por que NÃO estender `contracts` com `domain='FINANCIAMENTO'`

Foi a primeira hipótese e **não se sustenta**:

1. `contracts_domain_check` hoje é `('SUPRIMENTOS','SERVICOS','LOCACAO','VENDAS')`
   (`20261228000003_contracts_domain_discriminator.sql:29`) e o `domain` é a **fonte de
   verdade da direção de caixa** — `isReceivableContract()` em `services/contractService.ts`
   roteia CREDIT/DEBIT em 3 funções de sync que já foram corrigidas em produção depois de um
   bug de R$ 188 mil. Acrescentar um domínio novo mexe nesse roteamento.
2. `payment_schedule` é JSONB de `{date,value}`. Uma parcela de dívida tem 10 componentes.
3. `contracts` já carrega medição, aditivo, retenção, BDI, matriz de suprimento — semântica
   de obra, não de crédito. `parent_contract_id` existe para *renovação*, que não é a mesma
   coisa que renegociação com preservação do cronograma original.

**Decisão: tabelas novas `debt_*`, reusando tudo da tabela do item 1.** Isso não duplica o
motor de título — o título continua nascendo em `internal_transactions`, como Contratos e
Suprimentos já fazem.

### 4. Regras da casa que incidem

- **REGRA #6**: este arquivo, vivo, com o pedido literal acima.
- **REGRA #5**: `useOrgContext()` é a única fonte de org; `orgId === null` é "Todas" e
  **nunca** bloqueia leitura. Catraca no CI: `__tests__/orgContextGuard.test.ts`.
- **REGRA #2/#3**: `project_id` de projeto de sistema é sempre `NULL`; seletor de obra usa só
  `OBRA` (default de `listProjects`).
- **REGRA #1 + #4**: `docs/ui_ux_guia_unificado.md` inteiro antes de editar tela;
  `UI_PATTERNS.md` → `Sheet` é o padrão (70–80%), não modal, não tela cheia.
- **Migrations**: prefixo `aplicar_<14 dígitos>_slug.sql`, aplicadas **à mão pelo SQL
  Editor** — nunca `supabase db push`. Prefixo único travado por
  `__tests__/migrationsPrefixo.test.ts`. Último ocupado: `20270914000022`.
- RLS de tabela nova: `FOR ALL TO authenticated USING (public.is_org_member(organization_id))`
  + `REVOKE ALL … FROM anon`. RPC nova: `REVOKE ALL … FROM PUBLIC` + `GRANT EXECUTE TO
  authenticated`. Exemplar: `aplicar_20270914000005_employee_cost_splits.sql`.

---

## Riscos verificados (ler antes de começar)

**1. 🔴 A decomposição em N linhas deforma a DRE — bloqueante, corrigir no mesmo lote.**
`fn_dre_summary` calcula `= Resultado Líquido` como
`SUM(CASE WHEN dre_group NOT IN ('SEM_CLASSIFICACAO') …)`
(`20270128000000_financial_reports_todas_organizacoes.sql:222-224`). Como
`financial_categories` já aceita `dre_group='PASSIVO'`, a linha de **amortização de
principal** entraria no somatório e reduziria o resultado como se fosse despesa — o principal
não é despesa, é movimento de passivo. Correção junto: excluir `PASSIVO`/`ATIVO` do
`= Resultado Líquido` (o `= EBITDA` lista grupos explicitamente e já está correto) e
acrescentar a linha memo `(o) Amortização de Principal`.

**2. 🔴 `reference_id` composto casa vazio em silêncio.** É `{origem}-p{vencimento}`, não FK —
`.eq()`/`.in()` com UUID puro devolve `[]` **sem erro**, e já causou "inadimplência de
Locações sempre 0" sem ninguém notar. Usar o padrão de `lib/receivableRef.ts`
(`refPrefixOrFilter`, curinga `*`, `null` para lista vazia) num `lib/debtRef.ts` irmão.

**3. 🟡 Período fechado bloqueia regeneração.** `trg_block_period_internal_tx` +
`financial_period_locks` impedem escrita em período fechado. Renegociação só pode cortar e
regerar **o futuro** — copiar `contractService.removeTransactionsFrom(date)` (`:209`).

**4. 🟡 A projeção de caixa ignora o que é previsto.** `vw_fpa_cashflow_projection`
(`20270107000000_fpa_cashflow_projection.sql:16`) é UNION de três fontes:
`internal_transactions` **só `status='CONCILIATED'`**, `client_charges` e
`supplier_payments`. Não lê `vw_payables`. Sem estender, a parcela futura de financiamento —
o fluxo mais previsível que existe — não aparece no item 10 do PRD.

**5. 🟡 Três conceitos de conta bancária** convivem: `payment_accounts`, `bank_accounts`
(conciliação) e `company_bank_accounts` (cadastro da empresa, tem `limite_credito`). A
liberação do crédito precisa escolher uma; a recomendação é `payment_accounts` (é a que o
razão já referencia), com ponte para `bank_accounts` na conciliação.

**6. 🟡 `contract_index_values.index_name` não tem CDI, SELIC nem TR** — o `CHECK`
(`20261102000007_fase4_contract_index_values.sql:13`) só cobre
INCC/INCC-M/IPCA/IGP-M/CUB/OUTROS. É um `CHECK` a estender, mais a decisão de armazenar o
**fator mensal acumulado** (não a taxa a.a.) para CDI/SELIC.

---

## Plano

### Fase 1a — Cadastro, motor de cálculo e cronograma visível

**1. `docs/planos/2026-08-29-gestao-dividas-financiamentos.md`** (este arquivo)
Plano oficial com pedido literal, decisões e itens com critério de pronto.
**Como sei que terminou:** arquivo existe, começa por `## Pedido original`, e o PRD está lá
inteiro, sem paráfrase. ✅

**2. `supabase/migrations/aplicar_20270915000001_debt_core.sql`** (novo)
- `debt_contracts` — `organization_id`, `company_id` (empresa/SPE/holding, FK `companies`),
  `counterparty_kind CHECK ('INSTITUICAO_FINANCEIRA','PARTE_RELACIONADA','TERCEIRO')`,
  `institution_supplier_id` (FK `suppliers`), `related_company_id`,
  `mirror_debt_contract_id` (auto-FK, o espelho do mútuo), `modality` (as ~20 do item 2 do
  PRD, via `CHECK` + `OUTRO`), `contract_number`, `purpose`, datas
  (contratação/liberação/1º vencimento/final), `owner_user_id`, `status`; valores
  (`principal_contracted`, `principal_released`, `retained_amount`, `fees`, `iof`,
  `insurance`, `notary_costs`, `other_costs`, `net_received`); condições (`rate_type`,
  `nominal_rate`, `rate_period`, `index_name`, `index_pct`, `spread`, `cet_annual`,
  `grace_principal_months`, `grace_interest_months`, `capitalize_interest`,
  `installment_period`, `late_fine_pct`, `late_interest_month_pct`);
  `amortization_system CHECK ('SAC','PRICE','SACRE','AMERICANO','BULLET','MANUAL','IRREGULAR')`.
- `debt_schedules` — **as três camadas**: `kind CHECK ('CONTRATUAL','VIGENTE')`, `version`,
  `supersedes_id`, `reason`, `is_active`. A `CONTRATUAL` nasce na v1 e **nunca** é
  reescrita; renegociação cria uma `VIGENTE` nova. Índice único parcial garantindo uma só
  ativa por contrato.
- `debt_installments` — filha de `debt_schedules`: `seq`, `due_date`, `opening_balance`,
  `amortization`, `interest`, `monetary_correction`, `iof`, `insurance`, `fees`,
  `late_fine`, `late_interest`, `total`, `closing_balance`, `status` (as 10 situações do
  item 6 do PRD).
- `debt_disbursements` — liberações totais/parciais com retenções e líquido.
- `debt_allocations` — rateio do item 7: `target_kind CHECK
  ('COMPANY','PROJECT','EMPREENDIMENTO','COST_CENTER','ASSET','PROPERTY','UNIT','BANK_ACCOUNT')`,
  `target_id`, `pct`; trava de soma = 100 por contrato.
- RLS `is_org_member`, `REVOKE anon`, `COMMENT ON` em toda coluna não óbvia, bloco final
  `-- CONFERÊNCIA`.

**Como sei que terminou:** `SELECT relrowsecurity` = `t` nas 5 tabelas; `pg_policies` mostra
`{authenticated}`/`ALL`; `GET /rest/v1/debt_contracts` com a chave anon devolve `[]` ou 401.

**3. `supabase/migrations/aplicar_20270915000002_debt_indexadores_e_garantias.sql`** (novo)
- Estende `contract_index_values.index_name` com `CDI`, `SELIC`, `TR`, com `COMMENT` dizendo
  que o valor gravado é o **fator mensal acumulado**.
- Generaliza `contract_guarantees` / `contract_guarantors` / `guarantee_documents`:
  `contract_id` passa a nullable, entra `debt_contract_id` + `CHECK` de exatamente um dono;
  `kind` ganha `HIPOTECA`, `ALIENACAO_FIDUCIARIA`, `CESSAO_FIDUCIARIA_RECEBIVEIS`, `PENHOR`,
  `APLICACAO_FINANCEIRA`, `GARANTIA_CRUZADA`; entram `market_value`, `accepted_value`,
  `committed_pct`, `owner_party`, `ltv`, `valuation_date`, `valuation_valid_until`,
  `asset_id` (FK `opura_assets`).

**Como sei que terminou:** uma garantia existente de contrato continua legível em
`components/ContractGuaranteeModal.tsx`, e uma garantia nova criada só com
`debt_contract_id` grava sem violar o `CHECK`.

**4. `utils/debtAmortization.ts`** (novo — o motor, puro e determinístico)
`buildSchedule(params): DebtInstallmentRow[]` cobrindo SAC, Price, SACRE, Americano, Bullet,
manual e fluxo irregular; carência de principal e de juros, capitalização, indexação pela
série de `contract_index_values`, e as 10 colunas do item 4 do PRD. Mais
`outstandingBalanceAt(date)`, `earlySettlementValue(date)`,
`accruedInterestByCompetence(period)` e `cet(cashFlow)`. Reusa `calculatePMT`/`round2` de
`utils/financialMath.ts`; acrescenta `xirr()` **dentro de `financialMath.ts`** — o
repositório já tem duas implementações duplicadas de IRR e esta é a hora de não criar a
terceira.

**Como sei que terminou:** `__tests__/debtAmortization.test.ts` com casos de mesa conferidos
contra planilha — SAC 120×, Price 60× com carência de 6 meses, Bullet, e um caso indexado a
IPCA; `Σ amortização == principal liberado` e `closing_balance` da última parcela `== 0`
(tolerância de 1 centavo, por `round2`).

**5. `types/debt.ts` + `services/debtService.ts`** (novos)
CRUD de contrato/liberação/rateio, `generateSchedule(contractId)` (grava `CONTRATUAL` v1 +
`VIGENTE` v1), `getActiveSchedule`, `getBalanceAt`. Assinatura de org no padrão da casa:
`organizationId?: string | null` e `.eq()` só se houver valor (modelo:
`services/inventoryService.ts:112-119`).

**Como sei que terminou:** `npx tsc --noEmit` limpo; `npx vitest run
__tests__/orgContextGuard.test.ts` passa **sem entrada nova no BASELINE**.

**6. `components/debt/`** (novo) — `DebtModule.tsx` (lista + KPIs), `DebtForm.tsx` (`Sheet`,
não modal), `DebtDetail.tsx` com abas Visão / Cronograma / Liberações / Rateio / Garantias.
A aba Cronograma mostra a memória de cálculo completa, uma coluna por componente. Kit
obrigatório: `useTableColumns` + `ColumnConfigButton` + `SortableHeader` +
`usePersistedState` + `KpiCard` + `ActionIconButton` + `useConfirm`.

**Como sei que terminou:** `bash scripts/check-ui-standard.sh` sai 0 em cada arquivo novo, e
o relatório ao usuário lista item a item o `CHECKLIST DE APLICAÇÃO` do guia.

**7. `components/AppRouter.tsx` + `components/Layout.tsx`** (edição)
`React.lazy` + `case 'dividas-financiamentos'` no switch (a partir da linha 403; molde:
`case 'fpa-module'` na 404). No Layout, o id entra em `financeiroViews` (~486), no command
palette (~520) e como `DropdownItem` no `NavDropdown "Financeiro"` (~1016-1066).

**Como sei que terminou:** o item aparece no menu, a tela abre, e o dropdown fica marcado
como ativo ao navegar.

### Fase 1b — Ponte com o Financeiro, pagamentos e saldo efetivo

**8. `supabase/migrations/aplicar_20270915000003_debt_ap_bridge.sql`** (novo)
- `debt_component_accounts` — por organização, o de-para
  `componente → financial_categories.id + plano_de_contas_id`, com seed:
  `AMORT → dre_group='PASSIVO'/nature='LIABILITY'`;
  `JUROS · CORRECAO · IOF · TARIFA · MORA → 'FINANCEIRO'`; `SEGURO` configurável.
- **Correção da `fn_dre`/`fn_dre_summary`** (Risco 1): `= Resultado Líquido` passa a excluir
  `PASSIVO` e `ATIVO`; entra a linha memo `(o) Amortização de Principal`.
- `debt_events` — movimentações realizadas (a 3ª camada do item 4 do PRD): pagamento,
  pagamento parcial, amortização extraordinária, antecipação, renegociação, reclassificação
  de encargo, divergência bancária, com `payload JSONB` e autor.

**Como sei que terminou:** rodar `fn_dre` num período com parcela de dívida decomposta e
conferir que `= Resultado Líquido` **não muda** ao lançar a linha de amortização, e que a
linha memo mostra o valor.

**9. `lib/debtRef.ts`** (novo) — `reference_id` = `debt-{debtContractId}-p{seq}-{COMPONENTE}`,
com `debtRefFor()`, `originFromDebtRef()`, `installmentPrefix()` e `refPrefixOrFilter()`
espelhando `lib/receivableRef.ts`.

**Como sei que terminou:** teste cobrindo que um id que é **prefixo** de outro id não casa, e
que lista vazia devolve `null` em vez de string vazia.

**10. `services/debtFinanceService.ts`** (novo) — materializa cada parcela como **N linhas**
em `internal_transactions`, uma por componente não-zero, `source_system='DEBT_INSTALLMENT'`,
`direction='DEBIT'`, `due_date` e `business_status` **sempre preenchidos** (sem isso a
parcela nasce sem vencimento e nunca vira VENCIDO), `supplier_id` = a instituição,
`project_id`/`cost_center_id` vindos do rateio — com `project_id = NULL` se o alvo for
projeto de sistema (REGRA #2). Idempotência pela unique
`(organization_id, reference_id, entry_type)`. Baixa **agrupada**: liquidar a parcela marca
as N linhas do mesmo prefixo, com `.select('id')` e conferência de `data.length`. Molde:
`contractService.syncParceladoScheduleToFinance` (`:455`) e `removeTransactionsFrom` (`:209`).

**Como sei que terminou:** gerar um contrato de 12 parcelas, abrir Contas a Pagar › Parcelas
e ver as linhas com credor, obra e vencimento certos; reprocessar o contrato e confirmar que
**não** duplica; dar baixa numa parcela e ver as N linhas irem a PAGO juntas.

**11. `components/ContasPagarParcelas.tsx`** (edição) — `ORIGEM_PT` (`:22`) ganha
`DEBT_INSTALLMENT: 'Financiamento'`.
**Como sei que terminou:** a coluna Origem mostra "Financiamento", não a sigla crua.

**12. Amortização extraordinária, antecipação e renegociação** em `debtService` +
`DebtDetail` — recalcula pelo motor (reduzir prazo ou reduzir parcela), grava um
`debt_schedules` **novo** com `supersedes_id`, corta e regera **só o futuro** no razão, e
registra em `debt_events`. O cronograma `CONTRATUAL` permanece intocado.

**Como sei que terminou:** depois de uma renegociação, a aba Cronograma oferece o seletor
Contratual / Vigente / Realizado, as três divergem corretamente, e nenhum título de período
fechado foi tocado.

**13. Espelho de mútuo intercompany** — `debtService.createIntercompanyMirror` cria o par
passivo/ativo, vincula por `mirror_debt_contract_id`, e o lado credor gera `CREDIT`. Antes de
implementar, **conferir** `vw_intercompany_transactions` e `vw_company_consolidated` (existem,
mas não foram lidas nesta investigação) para saber se a eliminação na consolidação já tem
gancho ou precisa de flag nova.

**Como sei que terminou:** um mútuo de R$ 100 mil entre duas empresas da mesma organização
aparece como passivo numa e recebível na outra, e a consolidação do grupo não o conta duas
vezes.

### Fase 1c — Dashboard, alertas e relatórios

**14. `supabase/migrations/aplicar_20270915000004_debt_kpis.sql`** — `fn_debt_position`
(dívida total/líquida, curto×longo prazo, principal×encargos, custo médio ponderado, prazo
médio, serviço da dívida em 30/90/365d, concentração por instituição e por indexador,
% fixa×variável) e `vw_debt_by_target` (dívida e custo financeiro por empresa / obra /
empreendimento, a partir de `debt_allocations`). `REVOKE PUBLIC` + `GRANT authenticated`.
**Como sei que terminou:** a RPC responde para uma org com contratos e o total bate com a
soma de `closing_balance` da parcela vigente mais recente de cada contrato.

**15. `supabase/migrations/aplicar_20270915000005_fpa_projection_payables.sql`** — quarto
UNION em `vw_fpa_cashflow_projection` lendo `vw_payables` em status previsto/a vencer, com
`confidence_level='HIGH'` para origem `DEBT_INSTALLMENT`. Fecha o Risco 4 e resolve, de
quebra, a ausência de parcelas de Contratos e Pedidos na projeção.
**Como sei que terminou:** `components/fpa/CashflowProjectionPage.tsx` mostra as parcelas
futuras do financiamento e o total previsto sobe pelo valor esperado.

**16. `components/debt/DebtDashboard.tsx`** — KPIs do item 10 do PRD + curva de amortização,
calendário de vencimentos, evolução do saldo devedor e dívida por obra/banco/modalidade
(recharts, molde `CentralObra.tsx`). Alertas de parcela vencendo e de documento pendente.
**Como sei que terminou:** os KPIs batem com `fn_debt_position` e os gráficos renderizam com
dado real, sem erro no console.

**17. Relatórios** (item 12 do PRD) — posição consolidada, extrato por contrato, cronograma
de amortização, principal e juros por competência, dívida por instituição e por indexador,
com export CSV no padrão de `components/OpuraReports.tsx`.
**Como sei que terminou:** cada relatório exporta CSV que abre no Excel com acentuação certa
e os totais conferem com o dashboard.

---

## O que este plano NÃO faz

- **Investidores, debêntures e instrumentos equivalentes** — decisão do usuário: continuam no
  Portal do Investidor; o dashboard apenas consolida o saldo em leitura.
- **Simulador e comparação de propostas (item 5), covenants (item 9), CET completo e cenários
  de CDI/IPCA** — são o MVP 2. O motor da F1a já é a base deles, mas nada de UI aqui.
- **MVP 3 inteiro** (APIs bancárias, leitura de contrato por IA, benchmark).
- **Partida dobrada / balancete** — o razão continua partida simples; a apropriação por
  competência sai da memória de cálculo, não de lançamento contábil.
- **Leasing e consórcio com contabilização própria** — cadastráveis como modalidade com
  cronograma manual; o tratamento específico (CPC 06 / carta de crédito) fica de fora.

---

## Estado

- [x] 1 — plano oficial em `docs/planos/` com o pedido literal
- [x] 2 — `aplicar_20270915000001_debt_core.sql` — **APLICADA e conferida 29/08**
- [x] 3 — `aplicar_20270915000002_debt_indexadores_e_garantias.sql` — **APLICADA e conferida 29/08**
- [x] 4 — `utils/debtAmortization.ts` + `calculateXIRR()` em `financialMath.ts` — 55 testes passando
- [x] 5 — `types/debt.ts` (+ export em `types/index.ts`) + `services/debtService.ts` — `tsc --noEmit` limpo
- [x] 6 — `components/debt/` (DebtModule, DebtForm, DebtDetail) — `check-ui-standard.sh` limpo nos 3
- [x] 7 — wiring em `AppRouter.tsx` (lazy + `case 'dividas-financiamentos'`) e `Layout.tsx` (grupo "Dívida" + paleta)
- [x] 8 — `aplicar_20270915000003_debt_ap_bridge.sql` — **APLICADA e conferida 29/08**. Corrigiu **três** funções, não uma
- [x] 9 — `lib/debtRef.ts` — 18 testes
- [x] 10 — `services/debtFinanceService.ts`
- [x] 11 — `ORIGEM_PT` em `ContasPagarParcelas.tsx` (`DEBT_INSTALLMENT: 'Financiamento'`) — adiantado da F1b
- [x] 12 — `debtService.rebuildScheduleFrom` + `components/debt/DebtRenegotiateSheet.tsx` + aba "Realizado"
- [x] 13 — `debtService.createIntercompanyMirror` + `consolidateMirrors` + coluna `mirror_role`
- [x] 14 — `aplicar_20270915000004_debt_kpis.sql` — **APLICADA e conferida 29/08**
- [x] 15 — `aplicar_20270915000005_fpa_projection_payables.sql` — **APLICADA e conferida 29/08**
- [ ] 18 — `aplicar_20270915000006_debt_revoke_anon_functions.sql` — corretiva, ensaiada, **PENDENTE de aplicar**
- [x] 16 — `components/debt/DebtDashboard.tsx` + `services/debtAnalyticsService.ts`
- [x] 17 — relatórios em CSV (posição, cronograma, concentração, por destino, extrato por contrato)

---

## Registro de execução

### 2026-08-29 · Fase 1a, itens 1–5 (backend)

Mecânica verificada, nesta ordem:

| Verificação | Resultado |
|---|---|
| `npx vitest run __tests__/migrationsPrefixo.test.ts` | ✅ 3 testes — `20270915000001/2` não colidem |
| `npx vitest run __tests__/debtAmortization.test.ts` | ✅ **55 testes** |
| `npx tsc --noEmit` (projeto inteiro) | ✅ **0 erros** |
| `npx vitest run __tests__/orgContextGuard.test.ts` | ✅ sem entrada nova no BASELINE |
| `npx vitest run __tests__/financialMath.test.ts` | ✅ o `calculateXIRR` novo não quebrou o existente |

⛔ **As duas migrations NÃO foram aplicadas** — são `aplicar_*`, rodam à mão no
SQL Editor. Nada do módulo funciona contra o banco até isso acontecer.

**Casos de mesa conferidos** (números de planilha, não recalculados pelo próprio
motor — teste que recalcula a fórmula valida o defeito):
SAC 120× a 1% sobre R$ 120.000 → 1ª parcela R$ 2.200 (1.000 + 1.200 de juros),
Σ juros R$ 72.600; Price 60× a 1% sobre R$ 100.000 → prestação R$ 2.224,44;
Bullet 12× → saldo final R$ 111.566,83 (100.000 × 1,01¹¹); semestral → juros de
6,152% (1,01⁶ − 1), não 1% cru.

**Dois desvios do plano, deliberados, com o motivo:**

1. **`CESSAO_FIDUCIARIA_RECEBIVEIS` não foi criado.** `CESSAO_FIDUCIARIA` já
   existia em `contract_guarantees.kind` (parte1) e é a mesma figura jurídica;
   dois códigos para a mesma coisa quebrariam relatório por modalidade.
2. **A trava de rateio = 100% virou `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY
   DEFERRED`**, não um `CHECK`. Um `CHECK` de tabela não enxerga as outras
   linhas, e uma trava imediata rejeitaria a primeira instrução de uma
   transação válida (a tela salva o rateio em bloco: apaga tudo e reinsere).
   Diferida, a validação acontece no COMMIT. Rateio vazio continua permitido —
   o PRD diz que a destinação "poderá" ser vinculada.

**Três decisões de modelagem que o PRD não fecha, resolvidas e documentadas no
código:**

- **Conversão de taxa anual → mensal** é parâmetro explícito
  (`annualConversion`), não default escondido: 12% a.a. dá 1,0000% a.m. no
  critério LINEAR e 0,9489% a.m. no GEOMÉTRICO (default), e a escolha muda o
  valor da parcela.
- **Carência de juros sem capitalização**: os juros acumulam e caem inteiros na
  primeira parcela após a carência (a alternativa — sumir — perderia receita do
  banco e dinheiro da conciliação).
- **Price indexado recalcula a prestação** quando há correção no período. Com a
  prestação congelada, os juros comeriam a amortização inteira e o contrato
  nunca amortizaria.

### 2026-08-29 · Fase 1a, itens 6–7 (UI e wiring) — **FASE 1a COMPLETA**

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` (projeto inteiro) | ✅ **0 erros** |
| `check-ui-standard.sh` em `DebtModule`/`DebtForm`/`DebtDetail` | ✅ exit 0 nos três |
| `check-system-projects.sh` · `check-project-classification.sh` | ✅ exit 0 |
| `vitest` (amortização + org guard + prefixo + view security) | ✅ **74 testes** |

**Guia de UI aplicado** (REGRA #1 — guia lido inteiro antes de editar). Itens do
`CHECKLIST DE APLICAÇÃO` verificados em `DebtModule.tsx`:
§1 imports de `TableUtils` · §2 `COLUMNS` fora do componente, `actions` com
`sortable:false` · §3 `usePersistedState('dividas:search')` + `useTableColumns` ·
§4 `KpiCard` (5 KPIs, cor semântica por métrica, nenhum card reimplementado) ·
§5.2 toolbar acoplada + §5.3 barra de escopo com a ação primária à direita ·
§6.2 `<thead>` sentence case via `uppercase={false}` · §6.3 toda coluna de valor
único ordenável · §6.4 fallback dentro do `.sort()`, sem dropdown "Ordenar por" ·
§6.5 sticky header · §6.6 `px-6` + `border-r` em toda célula e cabeçalho ·
§6.1.2 `truncate` sempre com `block` + `title` nas células de texto livre ·
§7 tipografia por tipo de dado (`font-medium` só em valor financeiro) ·
§7.2 `py-2.5` · §8 status como texto colorido, sem pílula · §9/§9.1 coluna de
ações sempre visível, com o clique na linha como ação dominante ·
§9.2 `ActionIconButton` · §11/§12 loading e vazio · §14 `useConfirm()` ·
§16 escala compacta `rounded-[10px]`/`rounded-[6px]`, controles `h-9` ·
§17 botão primário compacto · §19.1 abas do detalhe no card branco ·
§20/§20.1 `<h1>` solto + `mt-1.5`, ritmo 24px/12px com `mb-3` ·
§20.2 raiz sem `px-*`/`pt-*` própria · §21 rótulos em sentence case ·
§22 estado local atualizado após criar/editar/excluir · §23 "Voltar" (1 salto),
não migalha · §25 salvar não fecha em edição, com `useUnsavedChanges` +
`SaveStatus`.

**Não se aplicam, com a razão:** §6.1/§6.1.1 (redimensionamento) — a tabela tem 9
colunas de largura previsível e nenhuma de texto longo; §10/§10.1 (ações em lote)
— não há operação em lote sobre contrato de dívida; §13 (toast) — os erros são
mostrados em banner acima da tabela, não em toast flutuante; §18 (contexto
duplicado) — a tela não repete organização nem empresa do shell; §24 (portais
externos) — tela interna.

⚠️ **NÃO verificado no navegador.** As duas migrations da F1a não foram
aplicadas, então a tela não tem contra o que consultar. O veredito acima é
mecânico (script + `tsc` + testes) e por leitura do guia — falta a comparação
visual lado a lado com a aba Extrato, que só faz sentido depois das migrations.

### 2026-08-29 · Fase 1b, itens 8–13 — **FASE 1b COMPLETA**

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` (projeto inteiro) | ✅ **0 erros** |
| `vitest` (amortização, debtRef, prefixo, org guard, view security, financialMath) | ✅ **114 testes** |
| `check-ui-standard.sh` nos 7 arquivos tocados | ✅ exit 0 em todos |
| `check-system-projects.sh` · `check-project-classification.sh` | ✅ exit 0 |

⛔ **As três migrations continuam NÃO aplicadas.**

#### O defeito da DRE era maior do que o plano dizia

O plano previa corrigir `fn_dre`/`fn_dre_summary`. A leitura do código achou
**três** funções erradas, cada uma de um jeito — e a pior não era a prevista:

| Função | Linha | O que fazia |
|---|---|---|
| `fn_dre_summary` | `= Resultado Líquido` | excluía só `SEM_CLASSIFICACAO`; o principal derrubava o lucro |
| `fn_dre_spe_summary` | `ebitda` | 🔴 o `NOT IN` não tinha PASSIVO/ATIVO, então a amortização entrava **dentro do EBITDA** — o indicador que existe justamente para medir resultado antes do efeito da dívida |
| `fn_dre_spe_summary` | `resultado_liquido` | mesmo defeito do summary |
| `fn_dre_projects_summary` | `margem` | somava todo CREDIT−DEBIT conciliado; a parcela derrubaria a margem da obra |

`custo` de `fn_dre_projects_summary` já estava certo **por acaso**: filtra
`nature IN ('COST','EXPENSE')`, e a categoria de amortização nasce `LIABILITY`.

Não mexi em `fn_cash_flow` (amortização É saída de caixa), `fn_balancete`
(balancete mostra movimento de passivo por definição) nem `fn_dre` (devolve
linhas por grupo; quem agrega é a tela).

**O compilador achou a segunda tela.** Ao acrescentar `PASSIVO`/`ATIVO` ao tipo
`DREGroup`, o `tsc` apontou `BalanceteReport.tsx`, que também mantinha um
`Record<DREGroup, string>` — foi por isso que o grupo virou tipo em vez de
string solta.

#### Três decisões de desenho, com o motivo

1. **`reference_id` usa a SEQUÊNCIA, não a data de vencimento.** O contrato de
   obra grava `{id}-p{data}`; aqui é `debt-{id}-p007-JUROS`. Renegociar muda as
   datas, e com a data na chave a parcela 7 renegociada viraria uma linha nova,
   deixando a antiga órfã e em aberto no Contas a Pagar. O padding de 3 dígitos
   evita `p7-` casar `p70-`.
2. **Renegociar preserva o `seq` do passado.** A versão VIGENTE nova copia as
   parcelas anteriores à data de efeito com o mesmo número e só renumera a
   continuação — é o que mantém os títulos já emitidos casando.
3. **`project_id`/`cost_center_id` só são preenchidos com rateio de destino
   único.** A linha do razão tem UMA coluna de obra; com dois destinos, escolher
   um poria a dívida inteira na obra errada. Com rateio múltiplo o vínculo fica
   em `debt_allocations`, que é de onde a F1c lê "dívida por obra".

#### Item 13 — a investigação que o plano exigia mudou o desenho

O plano mandava **conferir** `vw_intercompany_transactions` e
`vw_company_consolidated` antes de implementar. Conferido:
**nenhuma das duas elimina intercompany.** A primeira
(`20260705000001`) só lista PEDIDOS DE COMPRA entre empresas do grupo, via
`suppliers.empresa_vinculada_id`, e nem toca `internal_transactions`; a segunda
é roll-up de contagens e receita contratada. Não havia gancho nenhum.

Daí a coluna `mirror_role` (`DEVEDORA`/`CREDORA`) e
`debtService.consolidateMirrors()`, já aplicada nos KPIs da lista. Sem ela, o
mútuo entraria duas vezes na dívida do grupo.

**A coluna entrou na migration ...000003, não na ...000001** — de propósito: se
a primeira já tiver sido aplicada, alterá-la seria mentir sobre o que rodou.

Se a criação da segunda perna falhar, a primeira é apagada: um passivo sem
contrapartida infla a dívida do grupo e é pior do que não ter criado nada.

### 2026-08-29 · As três migrations APLICADAS e conferidas no banco remoto

Conferência feita por mim, direto no banco (`npx supabase db query --linked`),
não por relato — "Success. No rows returned" é ambíguo e o SQL Editor roda só a
seleção.

| Conferência | Resultado |
|---|---|
| 7 tabelas `debt_*` existem com `relrowsecurity = t` | ✅ |
| 8 policies, todas `{authenticated}` | ✅ |
| Grants a `anon` nas `debt_*` | ✅ **nenhum** |
| `contract_index_values_index_name_check` | ✅ com CDI, SELIC, TR |
| `contract_guarantees_scope_chk` | ✅ com DIVIDA |
| `contract_guarantees_dono_unico` | ✅ exatamente um dono |
| `debt_contracts_mirror_role_chk` | ✅ DEVEDORA/CREDORA |
| `trg_debt_allocations_soma_100` | ✅ `tgdeferrable = t`, `tginitdeferred = t` |
| Seed do de-para (7 componentes) | ✅ 7 linhas, só AMORT é PASSIVO/LIABILITY |
| Garantia existente preservada | ✅ 1 linha, 0 órfã |
| `fn_dre_summary` · `fn_dre_spe_summary` · `fn_dre_projects_summary` | ✅ contêm PASSIVO |
| `fn_dre` | ✅ **não** contém — intacta, como planejado |

#### 🔴 A aritmética da DRE, provada com dado real (transação + ROLLBACK)

Simulei uma parcela decomposta de R$ 10.000 (R$ 8.000 de principal + R$ 2.000
de juros) na organização Alpa, medindo a DRE antes e depois **dentro de uma
transação revertida** — resíduo conferido depois: 0 linhas.

| Linha | Antes | Depois | Variação |
|---|---|---|---|
| `= EBITDA` | 0 | 0 | **0,00** |
| `(-) Resultado Financeiro` | 0 | 2.000,00 | 2.000,00 |
| `= Resultado Líquido` | 0 | −2.000,00 | **−2.000,00** |
| `(o) Amortização de Principal` | 0 | 8.000,00 | 8.000,00 |

É exatamente o comportamento correto: o resultado cai **só pelos juros**, o
EBITDA não se move, e o principal aparece na linha memo. Antes da correção,
essa mesma parcela derrubaria o Resultado Líquido em R$ 10.000.

**O risco bloqueante que abriu este plano está fechado.**

### 2026-08-29 · Fase 1c, itens 14–17 — **FASE 1c COMPLETA (migrations pendentes)**

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` (projeto inteiro) | ✅ **0 erros** |
| `npx vitest run` (suíte completa) | ✅ **1859 testes**, 24 pulados, nada quebrado |
| `check-ui-standard.sh` em `DebtDashboard` e `DebtModule` | ✅ exit 0 |
| Ensaio das duas migrations no banco real (BEGIN … ROLLBACK) | ✅ compilam e rodam |

#### O ensaio pegou um defeito antes de chegar em produção

Primeira execução falhou com `42883: function pg_catalog.extract(unknown, integer)
does not exist`. Causa: no Postgres **`date - date` devolve `integer` (dias), não
`interval`**, então o `EXTRACT(EPOCH FROM ...)` do prazo médio não existia.
Corrigido para divisão direta por 30.44. Teria estourado na cara do usuário no
SQL Editor.

#### Conferências do ensaio, contra dado real

| Conferência | Resultado |
|---|---|
| `fn_debt_position` sem dívida | 0 contratos / saldo 0 / prazo 0,00 — zeros, não NULL nem erro |
| `fn_debt_schedule_curve` | 24 linhas mesmo sem dívida (mês sem parcela vem zerado, não some) |
| `fn_debt_concentration` | roda, 0 linhas |
| `vw_debt_by_target` | 0 linhas |
| **Títulos em aberto que a projeção ignorava** | 🔴 **1.393 títulos / R$ 2.736.616,17** |
| Títulos pagos (excluídos do ramo novo) | 583 — já vinham pelo ramo REALIZED |
| **Sobreposição entre o ramo 1 e o ramo 4** | ✅ **0** |

O Risco 4 tinha número: a projeção de caixa do FP&A estava cega para
**R$ 2,7 milhões** de saídas já contratadas — parcelas de Contratos e Pedidos que
existiam no razão e não entravam em projeção nenhuma. O módulo de Dívidas só
levantou a pedra; o buraco já estava lá.

#### Decisões de leitura que mudam o número

1. **Saldo devedor = Σ amortização em aberto**, não o `closing_balance` da última
   parcela vencida — esse depende de existir parcela vencida, e em carência não
   existe. Como `Σ amortização == principal` por construção do motor, o número é
   o mesmo e fica aditivo (soma por obra, por banco, sem recalcular).
2. **A perna CREDORA do mútuo fica fora de todo indicador**, via
   `vw_debt_open_installments`. Uma view intermediária, e não o filtro repetido
   em cada função: repetir seria a garantia de esquecer numa.
3. **Custo médio ponderado pelo saldo**, com a taxa convertida para mês antes de
   entrar na média — contrato a 12% a.a. não pode somar com outro a 1% a.m.
4. **`LANGUAGE sql`, não plpgsql**: `RETURNS TABLE` em plpgsql cria parâmetros
   OUT que colidem com colunas homônimas (é o erro 42702 que derrubou as quatro
   telas de Análise de Dados em 2026-07-16).

#### Item 17 — o que os relatórios cobrem

Posição consolidada, cronograma de amortização, concentração (nas 5 dimensões),
dívida por destino e extrato por contrato — todos em CSV com `;`, decimal com
vírgula e BOM UTF-8, para o Excel brasileiro abrir por duplo clique sem
assistente e sem `Ã§`. "Principal e juros por competência" sai da curva mensal.
Fora: relatório de circularização bancária e o pacote para auditoria/diretoria,
que são formatação de documento, não dado novo.

⛔ **As migrations 4 e 5 NÃO foram aplicadas** — o ensaio prova que rodam, mas
escrever em produção continua sendo decisão sua.

### 2026-08-29 · Fase 1c aplicada — e um defeito MEU achado na conferência

| Conferência | Resultado |
|---|---|
| `vw_debt_open_installments` · `vw_debt_by_target` · `vw_fpa_cashflow_projection` | ✅ `{security_invoker=on}`, 0 grants a `anon` |
| `fn_debt_position` sem dívida | ✅ 0 contratos / saldo 0 — zeros, não NULL |
| `fn_debt_schedule_curve` | ✅ 24 linhas |
| Projeção de caixa, ramo novo | ✅ `PAYABLE_OPEN` = 1.393 eventos / **R$ 2.736.616,17** |
| Projeção, ramo antigo | `REALIZED` = 583 / R$ 426.150,77 · `RECEIVABLE` = 1 |

#### 🔴 O defeito: `REVOKE FROM PUBLIC` não fecha função para `anon`

As migrations ...000001 e ...000004 faziam `REVOKE ALL ON FUNCTION … FROM
PUBLIC` + `GRANT … TO authenticated`, e mesmo assim
`has_function_privilege('anon', …, 'EXECUTE')` continuava **true** nas cinco
funções `fn_debt_*`.

**Causa:** o Supabase mantém `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
ALL ON FUNCTIONS TO anon, authenticated, service_role`. Toda função nova nasce
com grant **explícito** para `anon`, e `REVOKE … FROM PUBLIC` não remove grant
explícito de papel nomeado. É **a mesma armadilha que a ...000001 já
documentava para TABELAS** — e que eu não apliquei às FUNÇÕES.

**Quanto vazou: nada.** Medido com `SET LOCAL ROLE anon`, não suposto:

| Objeto acessado como `anon` | Resultado |
|---|---|
| `debt_contracts` · `debt_installments` | `42501 permission denied for table` |
| `vw_debt_open_installments` · `vw_debt_by_target` | `42501 permission denied for view` |
| `vw_fpa_cashflow_projection` | `42501 permission denied for view` |

A RPC era **chamável** por anon, mas morria em 42501 ao tocar qualquer objeto.
O que protegia o dado eram os REVOKEs de tabela/view — que estavam certos. O
que sobrava era superfície desnecessária e violação da regra da casa.

**Correção:** `aplicar_20270915000006_debt_revoke_anon_functions.sql`, ensaiada
com ROLLBACK — as 5 funções passam a `anon_pode = false`, `auth_ok = true`.
Varre por `proname LIKE 'fn_debt\_%'` em vez de listar assinaturas à mão:
assinatura copiada é onde o REVOKE erra de alvo sem ninguém notar.

#### ⚠️ Achado sistêmico, FORA do escopo deste plano

A mesma varredura mostrou `anon_pode = true` em funções que **não são deste
trabalho**: `fn_dre_summary`, `fn_dre_spe_summary`, `fn_opura_pivot`,
`fn_contract_guarantees_expiring`. Não mexi nelas: parte das RPCs do sistema é
`SECURITY DEFINER` e é chamada pelos portais públicos justamente como `anon`, e
revogar em lote sem separar as duas famílias derrubaria portal. Fica registrado
para decisão do usuário.

---

## Verificação de ponta a ponta

1. `npx tsc --noEmit` limpo no projeto inteiro.
2. `npx vitest run` — inclui `debtAmortization.test.ts`, `migrationsPrefixo.test.ts`,
   `orgContextGuard.test.ts`, `viewSecurityGuard.test.ts`.
3. `bash scripts/check-ui-standard.sh` em cada `.tsx` novo (exit 0), mais
   `check-system-projects.sh` e `check-project-classification.sh`.
4. Migrations aplicadas **à mão pelo SQL Editor** (nunca `db push`), uma por vez, rodando o
   bloco `-- CONFERÊNCIA` de cada uma e registrando os contadores aqui.
5. Prova de segurança: `GET /rest/v1/debt_contracts` com a chave **anon** → `[]` ou 401.
6. Teste na interface real, com a skill `rodar-app` (Playwright, `serviceWorkers:'block'` — o
   PWA engole `page.route` sem isso): cadastrar um financiamento SAC de 120 parcelas com
   carência, conferir o cronograma contra a planilha, gerar os títulos, achar as linhas em
   Contas a Pagar › Parcelas, dar baixa numa parcela, fazer uma amortização extraordinária e
   verificar que o cronograma Contratual continua intacto ao lado do Vigente.
7. Conferir a DRE antes e depois de lançar uma parcela decomposta: `= Resultado Líquido` deve
   variar **só** pelos componentes de encargo, nunca pela amortização de principal.
8. Rodar com uma organização selecionada e no modo "Todas" — nenhuma tela pode ficar em
   branco.
