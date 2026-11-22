# Portal de Crédito — Capacidade de Pagamento (extensão do Credit Room)

## Contexto
O usuário quer demonstrar a um banco a **capacidade de pagamento** da empresa para
pleitear um empréstimo: listar os empreendimentos (com fotos), os contratos de venda e
de locação, consolidar a renda mensal e mostrar um dashboard completo.

O **Credit Room** (Portal de Crédito) já está no ar desde 07/09/2026
(`docs/planos/2026-09-07-portal-credito-credit-room.md`): banco entra com login
`LENDER` + MFA, vê **versões congeladas** (snapshot JSON imutável), Data Room do GED,
covenants, desembolsos, auditoria. Hoje ele:
- liga **1** empreendimento por room (`credit_rooms.empreendimento_id`);
- tem só agregados de 12 meses (sem série mensal, sem lista de contratos);
- calcula DSCR **só com NOI** — `eligible_flows.receivables` cai em `fontes_ausentes`;
- não mostra foto nenhuma.

Esta entrega estende o Credit Room (não cria módulo novo). Princípio mantido do plano
original: *"Credit Room é camada de compartilhamento + snapshot, não de cálculo"* —
todo número novo nasce na coleta do `freezeVersion` e fica congelado na versão; o
banco nunca lê dado vivo.

## Decisões do usuário (21/11/2026)
1. **Escopo da renda:** opção no room — **Empresa tomadora (padrão)** ou **Grupo inteiro**.
2. **Lugar:** dentro do Credit Room (abas novas no interno e no portal do credor).
3. **Rendas que entram:** parcelas de venda a vencer · aluguéis contratados · recebido
   nos últimos 12 meses · estoque a vender.
4. **Primeira versão inclui:** mês a mês + valor máximo do empréstimo · teste de
   estresse · qualidade da renda · book em PDF com fotos · **também documentos e
   contratos** junto ao room.

## Abordagens consideradas
- **A — Coleta no cliente dentro do `freezeVersion` + conta em util puro (ESCOLHIDA).**
  Segue o padrão existente (`utils/creditRoomSnapshot.ts`, 15 testes). Volume pequeno
  (centenas de títulos). Contas testáveis com Vitest, sem RPC nova nem REVOKE novo.
- B — RPC SQL `fn_credit_capacity(orgs[], data_base)`. Mais rápida e reaproveitável,
  mas cai nas armadilhas conhecidas de plano genérico/plpgsql e exige autorização por
  org na função; não compensa para um snapshot que roda poucas vezes.
- C — Painel interno separado + PDF. Descartada pelo usuário (decisão 2).

## Desenho

### 1. Banco (migration aditiva, sem tabela nova)
`supabase/migrations/aplicar_<prefixo>_credit_room_capacidade.sql` (conferir TODOS os
prefixos antes — memória `feedback_migration_prefixo_conferir_todos_os_nomes`):
- `credit_rooms.escopo text not null default 'EMPRESA' check (escopo in ('EMPRESA','GRUPO'))`
- `credit_rooms.grupo_organization_ids uuid[] not null default '{}'` — orgs do grupo,
  marcadas pelo usuário entre as orgs de que é membro (não existe "grupo econômico"
  entre orgs no banco; `companies.is_headquarters` é dentro de uma org).
- `credit_rooms.empreendimento_ids uuid[] not null default '{}'` — vazio = todos do
  escopo; `empreendimento_id` atual continua como o **principal** (obra/EAC/vendas).
- `credit_rooms.parametros_capacidade jsonb not null default '{}'` —
  `{ dscr_minimo, taxa_mensal_pct, prazo_meses, carencia_meses, sistema: 'PRICE'|'SAC',
     horizonte_meses (default 36), haircut_estoque_pct, despesa_operacional: bool }`.
- Trigger BEFORE INSERT/UPDATE: cada id de `grupo_organization_ids` deve estar em
  `minhas_orgs_membro()` de quem grava, e deve incluir `organization_id` do room.
- Policies existentes de `credit_rooms` cobrem as colunas novas (sem policy nova).
  Rodar sonda com chave publicável (REGRA #7) para confirmar anon sem acesso.
- Rollback: `ALTER TABLE … DROP COLUMN` das 4 colunas + drop trigger (sem perda de
  dado anterior; versões congeladas não dependem delas) + reaplicar o corpo atual de
  `fn_credit_room_documents` (guardar em `…_rollback.sql`) + redeploy da Edge anterior.
- Aplicar por `npx supabase db query --linked -f`, **nunca** `db push`.

### 2. Snapshot schema 2 (`utils/creditRoomSnapshot.ts`, `types/creditRoom.ts`)
`CREDIT_ROOM_SNAPSHOT_SCHEMA = 2`. Versões schema 1 seguem renderizando (blocos novos
ausentes = `null` = "—", nunca zero). Blocos novos, cada um com `fonte` e `data_base`:
- `escopo`: `{ tipo, organizacoes: [{id, nome, cnpj}] }`.
- `empreendimentos[]`: id, nome, org, cidade/UF, objetivo (VENDAS/LOCACAO/MISTO),
  unidades total/vendidas/alugadas/disponíveis, VGV total/vendido/disponível,
  renda mensal atual (venda+aluguel do mês da data-base), `fotos[]` ({url, legenda},
  máx. 8), `capa` (1ª foto).
- `contratos[]` (rent roll + carteira de vendas): tipo VENDA/LOCACAO, empreendimento,
  unidade, **cliente mascarado** ("Comprador 01", "Locatário 03" — LGPD), valor do
  contrato, parcela/aluguel mensal, saldo a receber, vencido, 1º/último vencimento,
  status, `tem_parcelas` (bool), `contract_id` (para ligar documentos).
- `capacidade`:
  - `serie[]` por mês (horizonte, a partir do mês seguinte à data-base):
    `{ mes, vendas, alugueis, despesa_operacional, renda_liquida, servico_atual,
       servico_novo, folga, dscr }`.
  - `recebido_12m[]` por mês (realizado): `{ mes, vendas, alugueis }`.
  - `vencido_na_data_base` (não entra em mês futuro).
  - `estoque`: `{ vgv_disponivel, haircut_pct, valor_elegivel }` — **nunca entra no DSCR**,
    aparece como potencial/garantia.
  - `capacidade_maxima`: `{ parcela_maxima, valor_maximo, parametros }`.
  - `alertas[]`: vendas "vendidas" (regra `saleUnitClassifier`) **sem parcelas
    geradas** (qtd + VGV), locações ativas sem valor mensal, títulos sem empreendimento.
- `qualidade`: concentração top-5 pagadores (% da renda futura), WALE dos aluguéis
  (`lib/rentalExecutive.ts` `wale`), pontualidade 12m (% pago até o vencimento),
  inadimplência (faixas do aging atual).

`computeIndicators` passa a usar a `capacidade.serie` para o fluxo elegível quando
`eligible_flows.receivables` está marcado (DSCR atual/pós = 12 primeiros meses);
`receivables` deixa de ir para `fontes_ausentes`.

### 3. Regras de cálculo (util puro novo `utils/creditCapacity.ts` + testes)
**Fonte dos títulos (corrigido na revisão):** `fn_fi_ledger` **não** serve — não tem
data de pagamento, pagador, contrato nem org, e `realizado` = só CONCILIATED. Ler
`vw_receivables` por org do escopo (já usada em `coletarRecebiveis`) + a data de
pagamento de `internal_transactions` (coluna a conferir no `main`), ligando cada título
ao contrato por `lib/receivableRef.ts` (`originIdFromRef`, nunca `.eq` no uuid) →
`contracts.domain` (`'VENDAS'`/`'LOCACAO'`) → empreendimento via
`receivableService.resolveEmpreendimentos`. Sem RPC nova, sem mexer em `fn_fi_ledger`.
"Recebido" = `effective_status` RECEBIDO/PARCIAL (baixa no sistema), não só conciliado.
- **Vendas a vencer:** títulos de venda em aberto, agrupados pelo mês do vencimento
  (lógica de `receivableSchedule`, `lib/salesAnalysis.ts:509`).
- **Aluguéis contratados:** pelo **contrato vigente da cadeia de renovação**
  (`contracts.domain='LOCACAO'`, último filho de `contractRenewalService`, com
  `current_value` e `end_date`; `deal.installment_value` só quando não há contrato),
  mês a mês até `end_date`. Títulos futuros já gerados de qualquer contrato da cadeia
  **não** somam (evita 2×). Rótulo "contratado, sem reajuste".
- **Recebido 12m:** títulos RECEBIDO/PARCIAL de venda e aluguel, por mês do pagamento.
- **Despesa operacional:** média mensal da despesa 12m do `rentalNoiService`,
  descontada **só dos aluguéis** (liga/desliga em `parametros_capacidade`).
- **Fluxo elegível (sem contar 2×):** a série é a única fonte do DSCR —
  `vendas` entra se `eligible_flows.receivables`, `alugueis − despesa` entra se
  `eligible_flows.noi`. `computeIndicators` deixa de somar `noi_mensal × 12` quando a
  série existe (versões schema 1 seguem com a regra antiga).
- **Serviço atual:** `fn_debt_schedule_curve` por org, somado no grupo — **mesma fonte**
  para a série e para o `dscr_atual` dos indicadores (12 primeiros meses da curva), para
  os dois DSCR da tela baterem. **Serviço novo:** `buildSchedule`
  (`utils/debtAmortization.ts`) com os parâmetros do room, ou o cronograma da proposta
  vinculada se existir (`coletarNovoServico` atual).
- **Escopo GRUPO consolida tudo:** posição da dívida (`debtAnalyticsService.position`
  por org, somada), LTV/LTC, recebíveis, carteira e série; o snapshot guarda também a
  quebra por org.
- **Capacidade máxima:** `parcela_maxima = min_{12 primeiros meses}(renda_liquida / dscr_minimo − servico_atual)`;
  `valor_maximo` = maior principal cuja maior parcela dos 12 primeiros meses de
  `buildSchedule` ≤ `parcela_maxima` (busca binária).
- **Estoque:** VGV disponível das unidades dos empreendimentos do escopo × (1 − haircut).
- Filtro por `empreendimento_ids` aplicado a tudo que tem empreendimento; títulos
  sem empreendimento entram só no escopo EMPRESA/GRUPO total e geram alerta.

### 4. Teste de estresse (sem congelar)
Função pura `aplicarEstresse(serie, {inadimplencia_pct, vacancia_pct, distrato_pct})`
em `utils/creditCapacity.ts`; a UI recalcula ao vivo sobre a série congelada (banco
também pode mexer). Mostra DSCR mínimo, meses com folga negativa e nova capacidade
máxima. Cenários prontos: Base · Moderado (10/10/5) · Severo (25/20/15).

### 5. Coleta (`services/creditRoomService.ts`)
Novos coletores no `freezeVersion`, cada um `try/catch` → `null` (padrão atual):
`coletarEscopo`, `coletarEmpreendimentos` (via `empreendimentoService` +
`fotosDosEmpreendimentos` — hoje privada em `services/investorPortalService.ts:222`;
**mover para `services/empreendimentoMidiaService.ts`** e o investidor importa de lá;
capa da unidade de `commercial_properties.images[0]` só se a URL for pública —
conferir o bucket; se privado, ficar só com a mídia do empreendimento),
`coletarContratos`, `coletarCapacidade`, `coletarQualidade`.
Antes de congelar, Sheet de conferência mostra os `alertas` (ex.: "4 vendas sem
parcelas geradas — R$ X fora da renda") com atalho para Gerar parcelas.

### 6. UI
- `CreditRoomForm.tsx`: seção **Escopo** (Empresa tomadora / Grupo inteiro + seleção
  de orgs, usando as orgs de que o usuário é membro) e **Empreendimentos** (checklist,
  todos marcados por padrão); seção **Parâmetros da capacidade**. Seguir campos h-9,
  CC/Plano de Contas não se aplicam.
- Aba nova **Capacidade de pagamento** em `CreditRoomDetail.tsx` e
  `portal/LenderPortal.tsx`: KPIs (renda líquida mensal média, DSCR mínimo 12m,
  capacidade máxima, folga), gráfico mês a mês (barras empilhadas vendas/aluguéis +
  linha serviço da dívida; seguir §28 Gráficos do guia de UI), recebido 12m,
  estoque, painel de estresse, qualidade da renda, alertas.
- Aba nova **Empreendimentos e contratos**: cards com capa e galeria
  (`components/investor/PhotoGallery.tsx`), números por empreendimento, tabela de
  contratos (StandardTable) com filtro venda/locação e coluna "Documentos" (contagem
  dos docs do contrato compartilhados no room).
- Proveniência: entradas novas em `utils/creditRoomProvenance.ts` para cada KPI novo.
- Validar cada tela com `bash scripts/check-ui-standard.sh <arquivo>`.

### 7. Documentos e contratos
O Data Room já é o GED com audiência `credor`. Acrescentar no room interno o botão
**"Sugerir documentos"**: lista os docs do GED dos empreendimentos do escopo e da
carteira — por `contract_id` quando a venda/locação tem contrato, senão pelo
`client_id` (documentos do cliente moram em Meus Clientes) e pelo empreendimento —,
agrupados (contratos assinados, matrículas, alvarás, habite-se, projetos…), com
seleção em lote via `sharePortalDocumentsBatch` (audiência `credor` + `creditRoomId`),
que já existe. Nada de tabela nova; download segue pela Edge `credit-room-download`
(marca d'água + log).
⚠️ Hoje `fn_credit_room_documents` e a Edge só aceitam documento da org dona do room.
**Decisão do usuário (21/11):** no escopo GRUPO, aceitar documentos das orgs de
`grupo_organization_ids`. Mudar a checagem `doc.organization_id = r.organization_id`
para `doc.organization_id = r.organization_id OR (r.escopo='GRUPO' AND
doc.organization_id = ANY(r.grupo_organization_ids))` **nos dois lugares**:
`fn_credit_room_documents` e `supabase/functions/credit-room-download/index.ts`
(redeploy da Edge). O trigger da seção 1 garante que só entram orgs de que quem grava é
membro. Testar: org fora do grupo → recusado nas duas camadas; sonda anon (REGRA #7);
credor de outro room não vê.

### 8. Book de crédito em PDF
`utils/creditRoomBook.ts` gerado no navegador **a partir da versão congelada**
(jsPDF + jspdf-autotable, já no projeto): capa com foto do empreendimento principal,
resumo da operação e indicadores, gráfico mês a mês (html2canvas do gráfico),
empreendimentos com fotos, carteira de contratos mascarada, qualidade da renda,
estresse nos 3 cenários, índice do Data Room. Rodapé com versão/data-base; quando o
credor baixa, marca d'água com e-mail + data e `log('DOWNLOAD', 'book')`.

## Decisões tomadas por mim na revisão (conferir)
- Títulos lidos de `vw_receivables` + `internal_transactions`, não de `fn_fi_ledger`.
- "Recebido" = baixa no sistema (RECEBIDO/PARCIAL), não só conciliado.
- Aluguel = contrato vigente da cadeia de renovação.
- Série mensal é a fonte única do DSCR; despesa operacional só sobre aluguéis.
- Escopo GRUPO consolida dívida, LTV/LTC e tudo mais, com quebra por org.
- Documentos de venda sem contrato achados por cliente e empreendimento.

## Arquivos críticos
- `supabase/migrations/aplicar_<prefixo>_credit_room_capacidade.sql` (novo; inclui
  `CREATE OR REPLACE fn_credit_room_documents` com a regra do grupo)
- `supabase/functions/credit-room-download/index.ts` (regra do grupo + redeploy)
- `types/creditRoom.ts`, `utils/creditRoomSnapshot.ts`, `utils/creditRoomProvenance.ts`
- `utils/creditCapacity.ts` (novo) + `__tests__/creditCapacity.test.ts` (novo)
- `utils/creditRoomBook.ts` (novo)
- `services/creditRoomService.ts`, `services/empreendimentoMidiaService.ts` (novo,
  extraído de `services/investorPortalService.ts`)
- `components/credit/CreditRoomForm.tsx`, `CreditRoomDetail.tsx`,
  `portal/LenderPortal.tsx`, novos `CreditRoomCapacity.tsx`,
  `CreditRoomEmpreendimentos.tsx`, `CreditRoomSugerirDocumentos.tsx`

## Reaproveitado (não reescrever)
`fn_fi_ledger` / `fn_fi_targets`, `debtAnalyticsService` (`fn_debt_position`,
`fn_debt_schedule_curve`), `utils/debtAmortization.ts` `buildSchedule`,
`rentalNoiService.getNoiMetrics`, `lib/rentalExecutive.ts` `wale`,
`lib/salesAnalysis.ts` `receivableSchedule`/`saleUnitClassifier`,
`lib/rentalPortfolio.ts` `getDealInstallmentValue`, `lib/receivableRef.ts`,
`fotosDosEmpreendimentos`, `PhotoGallery`, `PortalKit` (`KpiStrip`, `PortalCard`),
fluxo de share GED `credor`, Edge `credit-room-download`.

## Fora desta entrega
Reajuste projetado dos aluguéis/parcelas (valores nominais), balanço/DFC, Open
Finance, scoring/IA, congelamento automático mensal.

## Execução
Frente nova de `origin/main` (`git worktree add /c/D/frentes/credit-capacidade origin/main`,
sem junção de node_modules), PR → CI → merge por mim (`gh pr merge`), deploy = push em main.
Fases sugeridas (um PR cada): F1 migration + util puro + snapshot schema 2 + coleta ·
F2 abas Capacidade/Empreendimentos + estresse · F3 Sugerir documentos + Book PDF.

## Verificação
1. `npx vitest run __tests__/creditCapacity.test.ts __tests__/creditRoomSnapshot*` —
   série mensal (venda + aluguel até end_date sem duplicar título gerado), capacidade
   máxima (Price e SAC), estresse, máscara de cliente, schema 1 ainda renderiza.
2. `npx tsc --noEmit` e os scripts `check-ui-standard`, `check-org-selector-guard`,
   `npx vitest run __tests__/orgContextGuard.test.ts`.
3. Migration: aplicar, sonda anon (REGRA #7), testar trigger recusando org de que não
   sou membro; rollback ensaiado.
4. Caso real: room CR-00001 (Garden Cambuhy) — congelar versão nova nos dois escopos;
   conferir a série contra SQL direto (`db query --linked`) no `fn_fi_ledger` e nos
   contratos de locação; conferir que os alertas mostram as vendas sem parcelas.
5. Portal do credor (Playwright, `agente-leitura` como CREDOR com MFA): abas novas,
   fotos carregam, estresse recalcula, baixar Documentos e Book gera linha
   `DOWNLOAD` na auditoria; versões antigas (schema 1) abrem sem erro.
