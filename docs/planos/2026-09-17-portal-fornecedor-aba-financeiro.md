# Portal do Fornecedor — aba "Financeiro" (app + link público), conectada a Suprimentos › Pedidos › Financeiro

## Pedido original (2026-09-17, sessão 7e61fa9c)

> criar nos portais (visao do app e do fornecedor) aba financeiro e conectar com suprimentos < pedidos < aba financeiro

Decisões confirmadas com o usuário (AskUserQuestion, mesma sessão):
1. **Conteúdo = condições + parcelas reais.** Por pedido: forma/condição/prazo/nº de parcelas definidos em Suprimentos › Pedidos › aba Financeiro, e abaixo as parcelas reais do Contas a Pagar (vencimento, valor, Pago/Pendente/Vencido).
2. **Dimensões contábeis do comprador** (conta de pagamento, centro de custo, plano de contas, aprovação financeira) **ficam escondidas** do fornecedor — e a RPC do token, que hoje vaza esses campos, é cortada.
3. **Aba ligada para todos**: migration acrescenta `'financeiro'` às listas `suppliers.settings.supplierPortalTabs` já salvas (2 fornecedores); quem quiser esconder desliga em "Configurar abas".

## Contexto

O Portal do Fornecedor tem duas portas: fornecedor **logado no app** (`SupplierDashboard` via `AppRouter` quando `ProfileGroup.SUPPLIER`; também a impersonação do gestor em `SupplierPortalManager`) e **link público** (`/portal-fornecedor?token=`, `isPublicExperience`, vocabulário coral do §24). As abas hoje são Estatísticas · Lances · Cotações · Pedidos · Nota Fiscal. Não há aba Financeiro — o fornecedor não tem onde ver o que a construtora lhe deve e quando vence.

Do lado do comprador, Suprimentos › Pedidos › aba Financeiro é o painel `financeiro` de `SupplyChainOrderForm` (condição Vista/Parcelado, dias, parcelas, notas, alocação contábil). As **parcelas reais** nascem em `financialService.syncOrderToFinance` (pedido Entregue/Recebido/Divergência **com nota vinculada**) e vivem em `internal_transactions` (`direction='DEBIT'`), lidas por `vw_payables`.

**Estado medido em produção (17/09):**
- `internal_transactions.purchase_order_id` existe desde `20261221000001` mas **nunca é gravado**; `reference_id` das parcelas de pedido é o UUID do tx do JSON (`addTransaction` não recebe `referenceId`).
- **0** linhas `source_system='PURCHASE_ORDER'`. As **12** parcelas de pedido existentes estão como `source_system='PROJECT'`, `supplier_id` NULL, `party_name` NULL — porque `financialSyncService.syncFinancialData` (chamado por `BankReconciliation` e `ProjectFinancialManager`) faz **upsert de todas as transações do JSON da obra** com `source_system='PROJECT'`, `reference_id=tx.id`, conflito em `(organization_id, reference_id, entry_type)` — e cai em cima da linha do pedido, rebaixando-a.
- Backfill viável: **10** das 12 ainda casam pelo JSON da obra (`tx.orderId` ↔ `tx.id = reference_id`); as **2** órfãs (PO-955605, PO-829254) são de pedidos apagados — ficam como estão.
- Dados para verificar: fornecedor **MCC** (token ativo) com PO-391474 (1 parcela), PO-551252 (8 parcelas), PO-775868 (1 parcela).
- Fornecedor (logado ou anon) **não passa** em nenhuma policy de `internal_transactions`; `vw_payables` é `security_invoker` com REVOKE anon. O caminho é RPC `SECURITY DEFINER` com recorte de colunas (RLS não restringe coluna) — mesmo desenho de `purchase_order_comprador_json` (helper sem GRANT + casca de token + casca do logado).

Precedentes a copiar: `components/supplier/portal/PortalInvoices.tsx` (aba que carrega sozinha: `portalToken ? rpc : service`), `components/investor/portal/PortalFinance.tsx` (KpiStrip + PortalTabs com count + tabela), `services/pedidoCompradorService.ts` (mapper compartilhado), migrations `aplicar_20270919000032` (`purchase_orders_project_names`, RPC estreita em lote para o logado) e `aplicar_20270921000024` (helper sem GRANT).

## Decisões de desenho

- **Vínculo título→pedido = `purchase_order_id`.** NÃO mudar `reference_id` para composto: o upsert do `financialSyncService` por `reference_id=tx.id` criaria uma segunda linha (título duplicado). O helper SQL filtra só por `purchase_order_id`, nunca por `source_system`.
- **`effective_status` sem duplicar regra:** helper faz `internal_transactions it JOIN vw_payables v ON v.id = it.id` — ganha o recorte da view (DEBIT, não CANCELLED, não CONTRA) e a regra viva de PAGO/VENCIDO. Dentro de `SECURITY DEFINER` a view `security_invoker` lê como postgres, que é o que se quer.
- **Duas cascas de UI, uma lógica.** §24 autoriza `accent` para trocar cor, não vocabulário (KpiStrip×KpiCard, pílula×texto). Hook `useFinanceiroDoFornecedor` + helpers puros; `PortalFinanceiro.tsx` (kit coral, só `isPublicExperience`) e `SupplierFinanceiroTab.tsx` (app: `KpiCard` §4 + `StandardTable` §6.10).
- **Tabela plana**, uma linha por parcela, ordenada por vencimento; pedido sem parcela = uma linha com as condições e status "A gerar" (title: "geradas na entrega, com nota fiscal vinculada").
- **Detalhe do pedido** (aba Financeiro, visão fornecedor) ganha a lista de parcelas do mesmo helper — é literalmente a conexão com Suprimentos › Pedidos › Financeiro. A RPC `_get_order_detail` passa a devolver `financeiro` (uma chamada, não duas).
- Datas `DATE` → sempre `parseDate`/`fmtDate` (âncora meio-dia).

## Plano (um item por arquivo; "pronto" = critério cumprido)

### 1. `supabase/migrations/aplicar_20270921000026_portal_fornecedor_financeiro.sql` (novo)
Blocos, nesta ordem:
- **a. Medição** (comentada no topo): contagem de parcelas de pedido com/sem `purchase_order_id`, antes/depois.
- **b. Backfill passada A (JSON da obra):** `UPDATE internal_transactions it SET purchase_order_id = (tx->>'orderId')::uuid, supplier_id = COALESCE(it.supplier_id, po.supplier_id), party_type = 'SUPPLIER', party_name = COALESCE(it.party_name, s.name), source_system = 'PURCHASE_ORDER' FROM projects p, jsonb_array_elements(p.settings->'financialInfo'->'transactions') tx, purchase_orders po, suppliers s WHERE it.purchase_order_id IS NULL AND it.reference_id = tx->>'id' AND po.id = (tx->>'orderId')::uuid AND s.id = po.supplier_id`. Espera-se 10.
- **c. Backfill passada B (órfãs):** casa `substring(description from 'Pedido (\S+)') = po.number` **+ `project_id`** (não por `supplier_id`, que é NULL nessas linhas), só com casamento único (`count(*) OVER (PARTITION BY it.id) = 1`). Espera-se 0 (as 2 órfãs não têm pedido).
- **d. Helper sem GRANT** `purchase_order_financeiro_json(p_order_id uuid) RETURNS jsonb` — `{condicoes:{payment_method, payment_term_type, payment_days, payment_installments, notes}, parcelas:[{id, numero, total_parcelas, due_date, amount, payment_date, effective_status}]}` via JOIN em `vw_payables`, `row_number() OVER (ORDER BY due_date, created_at)`. `REVOKE ... FROM PUBLIC, anon, authenticated`.
- **e. Cascas:** `supplier_portal_get_financials(p_token)` (anon+authenticated; todos os pedidos não-rascunho via `supplier_portal_pedido_do_fornecedor`, com `order_id, number, status, project_name, total` (Σ `items[].total`, coluna é jsonb) e `financeiro`); `purchase_orders_financeiro(p_order_ids uuid[])` (authenticated; gate `purchase_order_is_buyer OR purchase_order_is_supplier` por pedido; devolve `jsonb_object_agg(id, financeiro)`).
- **f. Recorte + financeiro nas RPCs existentes:** `CREATE OR REPLACE` de `supplier_portal_get_orders` (base `aplicar_20270919000033`) e `supplier_portal_get_order_detail` (base `aplicar_20270921000024`, mantendo `project_name` e `comprador`), trocando `row_to_json(o)::jsonb` por `row_to_json(o)::jsonb - 'bank_account' - 'cost_center' - 'cost_center_id' - 'chart_of_accounts' - 'plano_de_contas_id' - 'is_financial_approved'`; o detalhe ganha `'financeiro', purchase_order_financeiro_json(p_order_id)`. Nenhum componente do portal lê esses campos (grep feito). Repetir REVOKE/GRANT.
- **g. Visibilidade:** `UPDATE suppliers SET settings = jsonb_set(settings, '{supplierPortalTabs}', (settings->'supplierPortalTabs') || '["financeiro"]') WHERE settings ? 'supplierPortalTabs' AND jsonb_typeof(settings->'supplierPortalTabs') = 'array' AND NOT (settings->'supplierPortalTabs') ? 'financeiro'`. Espera-se 2 linhas.
- `NOTIFY pgrst, 'reload schema'` + seção CONFERÊNCIA.

**Pronto quando:** `npx vitest run __tests__/segurancaMigrations.test.ts` verde; aplicada com `npx supabase db query --linked -f`; `pg_proc.proacl` do helper sem `=X/` e sem anon/authenticated, casca de token com `anon,authenticated`, casca do logado só `authenticated`; contagem "sem `purchase_order_id`" cai de 12 para 2 (as órfãs), registrada no plano; `supplier_portal_get_orders(<token>)->'data'->0 ? 'bank_account'` = false.

### 2. `services/financialService.ts`
`InternalTxSyncOptions.purchaseOrderId?: string | null`; `addTransaction` grava `purchase_order_id`; `syncOrderToFinance` passa `purchaseOrderId: orderId`, põe `supplierId: order.supplier_id` no tx do JSON (para o upsert do espelho não zerar `supplier_id`), e no re-sync apaga do razão as linhas `purchase_order_id = orderId AND status = 'PENDING'` antes de regerar (hoje limpa só o JSON e duplica no razão). Comentário explicando por que `reference_id` segue sendo o id do JSON.
**Pronto quando:** `__tests__/syncOrderToFinance.test.ts` (novo, mock do supabase) prova que o insert em `internal_transactions` leva `purchase_order_id` e `reference_id = id do JSON`; `tsc` limpo.

### 3. `services/financialSyncService.ts`
No upsert das transações do JSON: `purchase_order_id: tx.orderId ?? null` e `source_system: tx.orderId ? 'PURCHASE_ORDER' : sourceSystem` — para de rebaixar o título do pedido para `PROJECT`.
**Pronto quando:** teste unitário com tx contendo `orderId` → payload traz `purchase_order_id` e `source_system='PURCHASE_ORDER'`.

### 4. `types/supplyChain.ts`
`ParcelaStatus`, `ParcelaDoPedido {id, numero, totalParcelas, dueDate, amount, paymentDate?, status}`, `PedidoFinanceiro {condicoes, parcelas}`, `PedidoComFinanceiro {orderId, number?, projectName, status, total, financeiro}`; `PurchaseOrder.financeiro?: PedidoFinanceiro`.
**Pronto quando:** `tsc` limpo.

### 5. `services/pedidoFinanceiroService.ts` (novo, modelo `pedidoCompradorService.ts`)
`mapFinanceiroRow`, `mapPedidoComFinanceiroRow` (snake→camel, `Number(amount)`); `pedidoFinanceiroService.getForOrders(ids)` e `.get(id)` via RPC `purchase_orders_financeiro`. Helpers puros: `resumirParcelas(pedidos)` → `{emAberto, vencido, recebido, proximoVencimento?}` (aberto = PREVISTO/APROVADO/EMITIDO/ENVIADO/PARCIAL/RENEGOCIADO; vencido = VENCIDO; recebido = PAGO) e `linhasDaAbaFinanceiro(pedidos)` → `{pedido, parcela?}[]` (pedido sem parcela = 1 linha).
**Pronto quando:** `__tests__/pedidoFinanceiroService.test.ts` cobre mapper, `resumirParcelas` (PAGO 100 / VENCIDO 200 / PREVISTO 300) e `linhasDaAbaFinanceiro`.

### 6. `services/supplierPortalTokenService.ts`
`getFinancials(token): Promise<PedidoComFinanceiro[]>` via `supplier_portal_get_financials`; `mapOrderRow` ganha `financeiro: item.financeiro ? mapFinanceiroRow(item.financeiro) : undefined`.
**Pronto quando:** `curl` da RPC com chave anon + token real do MCC devolve `valid:true` e `data[].financeiro.parcelas` (PO-551252 com 8); token inválido → `valid:false`.

### 7. `hooks/useFinanceiroDoFornecedor.ts` (novo)
`({orders, portalToken, supplierId})` → `{pedidos, resumo, loading, error, reload}`. Token → `getFinancials`; app → `getForOrders(orders.map(o=>o.id))` combinado com os `orders` já carregados (`orderTotal` de `status.ts`, `projectName`). Sem gate por org (recorte é por fornecedor).
**Pronto quando:** os dois componentes (9, 10) usam só o hook.

### 8. `components/supplier/portal/status.ts`
`PAYABLE_STATUS: Record<ParcelaStatus, {label, tone}>` — PAGO good "Pago"; VENCIDO accent "Vencido"; PREVISTO/APROVADO/EMITIDO/ENVIADO neutral "Pendente"; PARCIAL/RENEGOCIADO info; CANCELADO muted. `SEM_PARCELAS = {label:'A gerar', tone:'muted'}`.
**Pronto quando:** teste garante entrada para todo `ParcelaStatus` (sem fallback silencioso).

### 9. `components/supplier/portal/PortalFinanceiro.tsx` (novo — link público/prévia)
Props `{supplier, orders, portalToken?, onOpenOrder}`. `KpiStrip` [Em aberto · Vencido · Recebido · Próximo vencimento (hint "em N dias")]; `PortalCard` + `CardHeader("Parcelas")` + `PortalTabs` [Todas/Em aberto/Vencidas/Pagas] com count; tabela `Th/Td`: Pedido (botão → `onOpenOrder`) · Obra · Parcela i/n · Vencimento (`fmtDate`) · Valor (`fmtBRLCents`, `tabular-nums`) · Status (`StatusPill`). Linha sem parcela: Parcela "—", Vencimento = "Parcelado 3x · 30 dias"/"À vista · 30 dias", Status "A gerar". `PortalLoading`/`PortalEmpty`; erro no card vermelho de `PortalInvoices`. Sem hex à mão.
**Pronto quando:** teste jsdom (item 14) verde; `check-ui-standard.sh` só acusa §8 pílula (exceção §24, reportada como tal).

### 10. `components/supplier/SupplierFinanceiroTab.tsx` (novo — app: fornecedor logado / impersonação)
Mesmo hook; vocabulário do guia: 4 `KpiCard` (`grid md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3`), `StandardTable` (`storageKey="supplierDashboard:financeiro"`, busca por nº pedido/obra, filtro de status, ordenação por vencimento/valor), status como texto colorido §8, Pedido como link `text-blue-600` → `onOpenOrder`, células `text-sm font-normal`, `font-medium` só no valor.
**Pronto quando:** `check-ui-standard.sh` exit 0; checklist do guia listado no relatório final (§3, §4, §6.10, §7, §8, §9.1, §11/§12; §14 n/a).

### 11. `components/SupplierDashboard.tsx`
`export type SupplierPortalTab = 'overview'|'negotiations'|'quotations'|'orders'|'documents'|'financeiro'` no topo, usado nas props e no `useState`; `TAB_META.financeiro = {title:'Financeiro', subtitle:'Condições de pagamento e parcelas dos seus pedidos.'}`; `TABS` += `{id:'financeiro', label:'Financeiro', icon: HandCoins}` (último); no `<main>`: `activeTab === 'financeiro' && effectiveSupplier && (isPublicExperience ? <PortalFinanceiro/> : <SupplierFinanceiroTab/>)` com `onOpenOrder={(id) => { setActiveTab('orders'); handleViewOrder(id, 'details'); }}`. Barra inferior mobile já manda a 6ª aba para "Mais"; "Configurar abas" itera `TABS` — nada a fazer.
**Pronto quando:** `__tests__/pedidoPerfilFornecedor.test.ts` verde (nenhum `!portalToken` novo como gate de exibição); `tsc` limpo.

### 12. `components/supplier/portal/PortalOverview.tsx` (l.19) e `components/AppRouter.tsx` (l.372)
Trocar as unions literais por `SupplierPortalTab`.
**Pronto quando:** `tsc` limpo; grep de `'documents'` só em `TABS`/switch.

### 13. `components/SupplyChainOrderDetails.tsx` (bloco "Condições de pagamento", visão fornecedor, ~l.1431-1486)
Estado `financeiroDoPedido`: token → `res.order.financeiro` (já vem no detalhe, item 1f); logado → `if (!ehComprador) pedidoFinanceiroService.get(orderId)`. Abaixo de "Observações do comprador", sub-bloco "Parcelas": tabela compacta Parcela · Vencimento · Valor · Status (texto §8) ou frase "Parcelas ainda não geradas — são geradas na entrega, com nota fiscal vinculada".
**Pronto quando:** Playwright abre PO-551252 pelo token e pelo login e a aba Financeiro do detalhe lista 8 parcelas com os mesmos valores da aba Financeiro do topo.

### 14. `__tests__/components/PortalFinanceiro.test.tsx` (novo, jsdom)
Mock de `getFinancials` com 2 pedidos (um com 3 parcelas PAGO/VENCIDO/PREVISTO, um sem parcelas Parcelado 2x/30d). Asserts: KPIs; "Vencidas (1)"; linha "Parcelado 2x · 30 dias" + "A gerar"; clique no pedido chama `onOpenOrder`.
**Pronto quando:** `npx vitest run __tests__/components/PortalFinanceiro.test.tsx __tests__/pedidoFinanceiroService.test.ts __tests__/syncOrderToFinance.test.ts __tests__/segurancaMigrations.test.ts __tests__/pedidoPerfilFornecedor.test.ts __tests__/orgContextGuard.test.ts` verde.

### 15. `docs/planos/2026-09-17-portal-fornecedor-aba-financeiro.md` (novo — REGRA #6)
Este plano, com `## Pedido original` literal + sessão/hora, as 3 decisões, itens 1-16 com critério, `## Estado (2026-09-17)

- [x] 1 migration — aplicada; `segurancaMigrations` verde; ACL: helper `{postgres,service_role}`, token `anon+authenticated`, logado `authenticated`; `get_orders` sem `bank_account`
- [x] 2 financialService — `__tests__/syncOrderToFinance.test.ts` (7 casos; 3 falham sem a correção)
- [x] 3 financialSyncService — `__tests__/financialSyncServiceParcelaDePedido.test.ts` (2 casos; 2 falham sem a correção). Achado extra: o ramo de despesas não emitia `party_*` e a união de chaves do PostgREST zerava a contraparte — corrigido
- [x] 4 tipos · [x] 5 pedidoFinanceiroService (9 casos) · [x] 6 token service (curl OK) · [x] 7 hook · [x] 8 status
- [x] 9 PortalFinanceiro · [x] 10 SupplierFinanceiroTab · [x] 11 SupplierDashboard · [x] 12 unions (`SupplierPortalTab`) · [x] 13 detalhe do pedido
- [x] 14 testes — 7 arquivos, 45 casos; suíte completa 340 arquivos / 4444 testes
- [x] 15 este plano
- [x] 16 verificação — feita: migration, curl (token MCC: 4 pedidos, PO-551252 com 8 parcelas; token inválido `valid:false`; helper com anon 401; `get_orders` sem campos contábeis), `check-ui-standard` exit 0 nos 4 arquivos, Playwright link público (aba, filtro Vencidas = 8, detalhe com 8 parcelas, mobile). Porta 2 provada com sessão real (agente-leitura): RPC `purchase_orders_financeiro` devolve 3 pedidos, helper direto 403, anon 401; Playwright gestor › Portal do Fornecedor › MCC › Financeiro (KpiCard + StandardTable, 11 linhas, mesmos valores) e detalhe com 8 parcelas.

### Backfill — medido

| | antes | depois |
|---|---|---|
| parcelas de pedido com `purchase_order_id` | 0 | **10** |
| sem `purchase_order_id` | 12 | **2** (PO-955605, PO-829254 — pedidos apagados; ficam) |
| `source_system='PURCHASE_ORDER'` | 0 | 10 |
| com `supplier_id` | 0 | 10 |

`supplierPortalTabs`: 2 fornecedores (MCC, Sebastião Eugênio) ganharam `financeiro`.

### Não coberto / dívidas
- PO-775868 é Parcelado 3x mas tem 1 parcela no razão (gerada quando era à vista) — a tela mostra o que existe.
- Títulos `source_system='NFE'` (via `nfe_invoices.purchase_order_id`) não aparecem.
- Fornecedor logado lê a linha inteira de `purchase_orders` (RLS não corta coluna); o recorte contábil cobre só o token.
- "Próximo vencimento" é a parcela EM ABERTO de menor data — se estiver vencida, mostra "N dias em atraso" (padrão do Portal do Investidor).


---

## Pedido 2 (2026-09-17, mesma sessão, após a publicação de ac485d2b)

> corrigir

Perguntado o quê (AskUserQuestion): os três itens de "Não coberto / dívidas" —
**PO-775868: 1 parcela em vez de 3**, **Fornecedor logado lê campos contábeis**,
**Títulos de NF-e não aparecem**.

### Medido antes

- PO-775868: Entregue, Parcelado 3x/30d, total 14.100; razão tem 1 parcela PENDING de 14.100 (gerada quando era à vista); JSON da obra tem o mesmo tx (PENDING). PO-551252 (8/8) e PO-391474 (1/1) estão coerentes.
- NF-e: 3 títulos `source_system='NFE'` PRINCIPAL/DEBIT, todos com `nfe_invoices.purchase_order_id` mas sem `internal_transactions.purchase_order_id` e **sem `due_date`** (nunca vencem). Os pedidos são Rascunho — hoje nenhum fornecedor os veria; a correção é estrutural. Risco anotado: pedido com NF-e aprovada no Fiscal E entregue com nota no portal geraria dois títulos (fluxos distintos, `nfe_invoices` × `invoices`).
- Fornecedor logado: `po_select_org_or_supplier` dá SELECT na tabela crua; 22 leituras diretas no front, mas o fornecedor logado só passa por `orderService.listOrders/getOrderById/updateOrder`. Tirar o SELECT derruba o UPDATE dele (WHERE exige policy de SELECT) → escritas do logado vão por RPC, como no token. `receipts_select_supplier` (storage) lê `purchase_orders` cru → migra para `purchase_order_is_supplier`. MCC = `agente-leitura@` — dá para logar como fornecedor e testar.

### Itens

1. `supabase/migrations/aplicar_20270921000027_portal_fornecedor_correcoes.sql`
   a. Reparcelar pedidos Entregue/Recebido/Divergência cujas parcelas no razão são TODAS PENDING e o nº difere de `payment_installments` (hoje só PO-775868): apaga as PENDING do razão e do JSON da obra, regera pelas condições atuais (base = actual_delivery_date||delivery_date, +dias×(i+1), resíduo na última) nos dois lugares. Pronto: PO-775868 com 3×4.700 (venc. 28/03, 27/04, 27/05/2026) no razão e no JSON.
   b. NF-e: backfill `purchase_order_id` de `nfe_invoices.purchase_order_id` nas linhas NFE; `due_date = COALESCE(due_date, transaction_date)`; `business_status = COALESCE(business_status,'PREVISTO')`. Pronto: 0 linhas NFE PRINCIPAL sem `purchase_order_id`/`due_date` quando a NF-e tem pedido.
   c. View `purchase_orders_fornecedor` **com `security_invoker = on`** (trava `viewSecurityGuard`: view que roda como dona é o que vazou 24 views em 08/2026) — sozinha respeita a RLS e não devolve nada ao fornecedor; a leitura é pela RPC `pedidos_do_fornecedor()` (`SETOF` da view, SECURITY DEFINER, só authenticated), que aceita `select`/filtros/`order` como tabela (pegadinha medida: `order` só por coluna que está no `select`). Colunas internas numa lista única (`purchase_order_colunas_internas()`: as 6 contábeis + `share_token` + `approval_*`), usada também pelas RPCs de token. Policy `po_select_org_or_supplier` → `po_select_org` (só membro). RPC `purchase_order_update_as_supplier(...)` gated por `purchase_order_is_supplier` (status, datas de logística, cotação; `forbidden` para quem não é o fornecedor). `receipts_select_supplier` via `purchase_order_is_supplier`. Pronto: view = tabela − internas (0 diff); `proacl` ok; com sessão MCC: RPC devolve 4 pedidos sem `bank_account` (400 ao pedir), update do próprio pedido `valid:true`, de pedido alheio `forbidden`; anon 401.
2. `services/nfeService.ts` — `approveAndLink` grava `purchase_order_id`, `due_date` e `business_status` no par de partidas. Pronto: teste unitário.
3. `services/orderService.ts` — `listOrders` com fornecedor lê pela RPC `pedidos_do_fornecedor`; `getOrderById` cai na RPC quando a tabela não devolve; `updateAsSupplier` → RPC, com `forbidden` caindo no `updateOrder` (gestor em "Visualizar como"). Pronto: `__tests__/fornecedorLogadoLeituraEstreita.test.ts` (7 casos; 6 falham sem a correção).
4. `components/SupplyChainOrderDetails.tsx` e `components/SupplierDashboard.tsx` — escritas do fornecedor (status, valor cotado, logística) por `ehComprador ? updateOrder : (portalToken ? token : updateAsSupplier)`; o detalhe carrega os pedidos com `listarPedidosDoLeitor()` (fornecedor → `listOrders` com e-mail → RPC; antes `listOrders()` sem argumentos devolveria vazio ao fornecedor puro). Pronto: travas verdes; Playwright logado como MCC (perfil FORNECEDOR): 0 leituras da tabela crua, 3 pela RPC; Financeiro com PO-775868 3×4.700; detalhe com Comprador; comprador (mesmo usuário em "Portal do Colaborador") continua lendo a tabela em Suprimentos › Pedidos.
5. Verificação — feita (17/09): itens acima + suíte 343 arquivos / 4515 testes; `check-ui-standard` exit 0. **Limite honesto:** a prova negativa "fornecedor puro não lê a tabela" não é possível com o `agente-leitura` (também é membro da org); a evidência é a policy `po_select_org` sem a perna do fornecedor + o front não consultando a tabela no perfil FORNECEDOR. Não testado: confirmar/negociar de verdade (mudaria status de pedido real); coberto pela RPC provada por curl.

### Medido depois
- PO-775868: 3 parcelas de 4.700 (28/03, 27/04, 27/05/2026) no razão e no JSON da obra.
- NF-e: 0 títulos com pedido sem `purchase_order_id`/`due_date`; `nfeService.approveAndLink` grava os dois.
- Risco anotado (não tratado): pedido com NF-e aprovada no Fiscal E entregue com nota no portal gera dois títulos (fluxos distintos).
