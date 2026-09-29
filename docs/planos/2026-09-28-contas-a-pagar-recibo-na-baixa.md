# Contas a Pagar — recibo de pagamento na baixa (espelho do Recibo de Contas a Receber)

## Pedido original

> da mesma forma que O "Recibo" foi implementado em financeiro < contas a receber implemente também em Contas a Pagar

Sessão bb2c0b2c-6a6a-4d7c-99c3-fe5ae62db2ee · 28/09/2026. Plano aprovado em plan mode na mesma sessão.

## Decisões tomadas com o usuário (28/09/2026)

| Pergunta | Resposta |
|---|---|
| Que documento sai ao pagar? | **Recibo para o credor assinar**: o credor declara que recebeu da organização |
| A baixa muda? | **Sim, igual a Receber**: painel com data, forma de pagamento e "Emitir recibo"; 1 ou vários títulos; 1 PDF por título; numerado e salvo; coluna Recibo |
| Numeração | **Sequência própria** por organização, separada dos recibos de recebimento |
| Portal | **Sim, junto**: o credor vê e baixa o recibo no portal dele |
| Em quais títulos | **Todos, exceto Folha** (título com vários colaboradores = vários signatários). Em **Boleto** a caixa "Emitir recibo" vem **desmarcada** |
| Quais portais | **Os dois**: Fornecedor (parcelas de pedido) e Parceiro (parcelas de contrato/medição) |
| Entrega | **Fase 1 app, Fase 2 portal** |

## Contexto

Em Contas a Receber (commits `9831ea1`, `4cde2e3`, `78c2e56`, `08954df`), a baixa abre `BaixaRecebivelSheet` (data + forma + "Emitir recibo"). O recibo é numerado por organização, congelado em `financial_receipts`, e o PDF fica guardado no bucket `financial-receipts`. A coluna Recibo baixa o PDF, e o Portal do Cliente também. Em Contas a Pagar, o botão "Pago" (`ContasPagarParcelas.marcarStatus`) só faz `business_status='PAGO'`/`status='CONCILIATED'`: a data vem de `trg_payment_date_na_baixa` (sempre hoje) e nada grava a forma de pagamento.

**Por que não dá para só chamar o que existe:**
- `emitir_recibo_recebimento` recusa `direction <> 'CREDIT'` e exige `RECEBIDO`.
- As triggers de cancelamento filtram `OLD.direction='CREDIT'`.
- O contador é um por organização, o que misturaria as duas séries.
- O texto do PDF diz "Recebemos de {pagador}", com a assinatura da organização.

**O que se reaproveita sem mudar:**
- `fn_cancelar_recibo_recebimento()`: o corpo é genérico, age por `transaction_id`.
- `registrar_arquivo_recibo`.
- O bucket e as policies de storage (pasta = organização).
- `guardarPdf`, `logoComoDataUrl` e `baixarPdf` do `financialReceiptService`.
- `utils/baixaRecebivel.ts` (`FORMAS_PAGAMENTO`, `hojeLocal`, `motivoBaixaBloqueada`, `mensagemResultadoBaixa`).
- O layout de `montarReciboPdf`.

## Pré-requisitos

- `bash scripts/nova-frente.sh recibo-contas-pagar` (REGRA #8). Nunca trabalhar no checkout de integração.
- Ler `docs/ui_ux_guia_unificado.md` inteiro antes de tocar em `.tsx` (REGRA #1). Atenção a §30 (malha do painel), §6.1 (coluna nova: 4 listas) e §24 (portal).
- Reescrever SQL a partir dos **arquivos** de migration, nunca de `pg_get_functiondef` (acentuação corrompe no Windows).

## Itens

### 1. Migration `supabase/migrations/aplicar_20270928000110_recibos_pagamento.sql`
Aplicada à mão com `npx supabase db query --linked -f`, nunca `db push`. **Não toca em `emitir_recibo_recebimento`.**
- `financial_receipts`:
  - `ADD kind text NOT NULL DEFAULT 'RECEBIMENTO' CHECK (kind IN ('RECEBIMENTO','PAGAMENTO'))`
  - `ADD payee_name text, payee_document text`: quem recebe e assina, só para PAGAMENTO
  - trocar `UNIQUE (organization_id, receipt_number)` por `UNIQUE (organization_id, kind, receipt_number)`. As linhas atuais ficam `RECEBIMENTO` pelo default, então o contador de recebimento continua válido.
- Nova tabela `financial_payment_receipt_counters`, igual à de recebimento: RLS ligada, sem policy, `REVOKE ALL`.
- RPC `emitir_recibo_pagamento(p_transaction_id uuid) RETURNS financial_receipts`, SECURITY DEFINER, copiada da versão 000120 da RPC de recebimento, com estas diferenças:
  - exige `direction = 'DEBIT'`
  - "baixado" = `status='CONCILIATED' OR business_status='PAGO'`
  - recusa `source_system = 'LABOR'` (Folha) com mensagem clara
  - `kind='PAGAMENTO'`
  - `issuer_*` = a organização (cabeçalho e logo): `name`, `cnpj`, endereço como hoje
  - `payee_*` = credor: `suppliers.name` e `suppliers.document` via `supplier_id` (a memória manda cadastro antes de `party_name`); reserva `party_name` / `entity_name`
  - `contract_number` pelo mesmo `reference_id` → `contracts.number`
  - idempotente: devolve o recibo ativo, se houver
  - `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT authenticated` (REGRA #7)
- Triggers novas, com a mesma função `fn_cancelar_recibo_recebimento`:
  - `trg_cancelar_recibo_pagamento_no_estorno`: AFTER UPDATE, `WHEN OLD.direction='DEBIT' AND OLD baixado(PAGO) AND NOT NEW baixado`
  - `trg_cancelar_recibo_pagamento_na_exclusao`: BEFORE DELETE, `WHEN OLD.direction='DEBIT'`

**Pronto quando:**
- `segurancaMigrations.test.ts` verde.
- Depois de aplicar, no banco:
  - as RPCs existem, com ACL sem `anon` e sem `=X`
  - `SELECT kind, count(*) FROM financial_receipts` mostra os antigos como `RECEBIMENTO`
  - a checagem de mojibake em `prosrc` dá falso
- Um teste transacional (`BEGIN … ROLLBACK`) como `authenticated`: emite para um DEBIT pago, recusa um CREDIT, recusa um aberto, e o estorno cancela.

### 2. `types/financial.ts`
- `FinancialReceipt` ganha `kind`, `payee_name` e `payee_document`.
- `PayablePaymentType` = o mesmo tipo de `ReceivablePaymentType`.

**Pronto quando:** `tsc` limpo.

### 3. `services/payableService.ts` — `darBaixa(id, { paymentDate, paymentType })`
Espelho de `receivableService.darBaixa`: `business_status='PAGO'`, `status='CONCILIATED'`, `payment_date`, `payment_type`, `updated_at`.

**Pronto quando:** há um teste do payload, como em `receivableService.test.ts:105-125`.

### 4. `utils/reciboRecebimento.ts` — variante PAGAMENTO, no mesmo arquivo e com o mesmo layout
- `textoRecibo` decide pelo `kind`. Em PAGAMENTO: "Recebi de {org} (CNPJ …) a importância de R$ X (extenso), referente a {descrição}."
  - "Recebi" se o documento do credor é CPF, "Recebemos" se é CNPJ, "Recebi(emos)" sem documento.
- Assinatura em PAGAMENTO: `payee_name` + CPF/CNPJ do credor, e uma linha "Local e data: ___".
- O cabeçalho continua sendo a organização (`issuer_*`).
- `nomeArquivoRecibo` em PAGAMENTO: `Recibo_Pagamento_000001_<Credor>.pdf`.

**Pronto quando:** `reciboRecebimento.test.ts` cobre PF, PJ, sem documento, nome do arquivo e o PDF de 1 página, com e sem CANCELADO. Os testes antigos continuam verdes, e um recibo sem `kind` é tratado como RECEBIMENTO.

### 5. `services/financialReceiptService.ts`
- `emitir(txId, kind = 'RECEBIMENTO')` escolhe a RPC.
- `baixarPdf(txId, { logoUrl, kind })` repassa o `kind`.
- Novo `listarAtivosDaOrg(orgId | null, kind)`: uma consulta com `fetchAllPages` sobre `financial_receipts` (`kind`, `cancelled_at IS NULL`, org quando houver). Mesma lição da apropriação: ~800 títulos pagos em `.in()` de 200 seriam 4 idas em série.

**Pronto quando:** as chamadas atuais de Receber compilam sem mudar (o default é RECEBIMENTO) e há um teste do `listarAtivosDaOrg`.

### 6. `components/financeiro/BaixaRecebivelSheet.tsx` → painel genérico
Uma prop `tipo: 'receber' | 'pagar'` troca só os rótulos:
- "Confirmar recebimento/pagamento"
- "Pagador/Credor"
- descrição do painel

Os títulos entram como `{ id, contraparte, descricao, vencimento, valor }`; Receber mapeia os seus na chamada. Nova prop `emitirReciboPadrao` (false quando o lote é só de Boleto) e `reciboIndisponivel` (Folha: a caixa some, com o motivo escrito).

**Pronto quando:** Contas a Receber abre e baixa igual a antes (teste de componente) e o `check-ui-standard.sh` está limpo.

### 7. `components/ContasPagarParcelas.tsx`
- O botão "Pago" abre o painel em vez de chamar `marcarStatus`.
- A barra de lote ganha "Dar baixa" para as selecionadas em aberto.
- `confirmarBaixa`, em sequência, como em `ContasReceberManager.tsx:928-966`: `darBaixa` → `baixarPdf(kind PAGAMENTO)` se pedido e se não for Folha → `onRowChanged` com PAGO → toast `mensagemResultadoBaixa`.
- Coluna **Recibo** antes de Status, nas 4 listas (`PARCELAS_COLUMNS`, `PARCELAS_COLUMN_HEADERS`, `DEFAULT_COL_WIDTHS` 130, `renderParcelaCell`):
  - "Nº 000001" com download
  - "Emitir" para pago sem recibo
  - "—" para aberto ou Folha
  - ordenável por número
- `ActionIconButton` Receipt nas pagas.
- O estorno tira o recibo do Map local; o cancelamento no banco é pela trigger.
- Recibos carregados com `listarAtivosDaOrg` depois da lista, sem bloquear a tabela e com guarda `seq`, como na apropriação.
- Logo: `organizations` do pai (`ContasPagarManager` já recebe a prop), passado adiante como `logoDaOrg`.

**Pronto quando:**
- Testes de componente: o painel abre pelo "Pago"; o lote abre com N títulos; Boleto vem desmarcado; Folha sem recibo; a coluna mostra o número; o estorno limpa.
- O deep-link e a paginação continuam verdes.
- `check-ui-standard.sh` limpo.

**Fase 1 = itens 1–7.** Publicar, o usuário conferir um recibo real, e só então a Fase 2.

## Fase 2 — portais do credor (decisão: **os dois**)

O credor vê títulos em dois portais, com recortes diferentes. Títulos manuais ou de boleto sem pedido nem contrato não aparecem em nenhum deles; é limitação atual dos portais, fica registrada e não é resolvida aqui.
- **Portal do Fornecedor**, parcelas de **pedido de compra**. O núcleo é `purchase_order_financeiro_json` (`aplicar_20270921000026_portal_fornecedor_financeiro.sql:100-140`), usado por `supplier_portal_get_financials` (token), `purchase_orders_financeiro` (logado) e `supplier_portal_get_order_detail`.
- **Portal do Parceiro**, parcelas de **contrato e medição**. O núcleo é `partner_ws_financials` (`aplicar_20270920000009_partner_financials_medicao_e_retencao.sql:32-120`), usado por `partner_portal_get_financials` (token) e `partner_get_financials` (app).

### 8. Migration `aplicar_20270928000120_portais_recibo_pagamento.sql`
Acrescenta `recibo_numero` nos dois núcleos: o recibo `PAGAMENTO` ativo do título, ou null. É o mesmo padrão de `fn_portal_receivables_payload` (`aplicar_20270926000120`). As funções são reescritas a partir desses **arquivos**, e os invólucros não mudam.

**Pronto quando:** as RPCs devolvem `recibo_numero` para um título pago com recibo (conferido no banco como `authenticated`) e as ACLs não mudam.

### 9. Edge Functions, copiadas de `client-portal-recibo-download`
O caminho é o mesmo: autorizar pela **mesma RPC do portal** com a credencial de quem chama, conferir que o título está no payload (anti-IDOR), e só então usar a service_role para ler `file_path` e assinar a URL por 15 min.
- `supplier-portal-recibo-download`, com `{ token }` ou `{ orderId }` (logado) + `transactionId`.
- `partner-portal-recibo-download`, com `{ token }` ou `{ workspaceId }` + `transactionId`. O teste do payload é `valid`, não `ok`.
- Deploy igual ao da função de cliente (conferir `config.toml`).

**Pronto quando:**
- Pergunta 3 da REGRA #7: sonda sem header e sonda com token de **outro** credor devolvem 401/403; o dono recebe `url`.
- Os nomes não reusam `receipts`/`purchase_receipts`, que no portal significam recebimento de mercadoria.

### 10. Telas dos portais
- `supplier/portal/PortalFinanceiro.tsx` (vocabulário do kit, §24): coluna "Recibo" com botão do `PortalKit`, "Nº 000001", nas parcelas PAGO.
- `supplier/SupplierFinanceiroTab.tsx` (vocabulário do app): coluna Recibo.
- A aba Financeiro do pedido em `SupplyChainOrderDetails.tsx:1617-1633`.
- `partner/PartnerPortal.tsx:1851-1864`: link "Recibo Nº X" ao lado do rótulo de status.
- Tipos e mapeamento: `ParcelaDoPedido` + `mapFinanceiroRow` (`services/pedidoFinanceiroService.ts:32-54`) e as parcelas do parceiro.
- Métodos de download em `supplierPortalTokenService`/`pedidoFinanceiroService` e em `partnerService`/`partnerPortalTokenService`. Tratam o corpo 4xx como `clientPortalService.baixarReciboDoPortal` (`:484-500`).

**Pronto quando:**
- Os testes de mapeamento cobrem `recibo_numero`.
- O `check-ui-standard.sh` está limpo nos arquivos do app (os do portal seguem a §24).
- O usuário baixa o recibo nos dois portais em produção.

⚠️ Visto na exploração e não corrigido aqui sem aval: `PartnerPortal.tsx` mostra "Pago" para qualquer status diferente de `PENDING`, inclusive CANCELLED. O link do recibo usa o recibo ativo, não esse rótulo.

## Fora do escopo
- A visão "Notas fiscais" (tabela `invoices`): o recibo é só da visão Parcelas, a única com ids de `internal_transactions`.
- Juros, multa, desconto e baixa parcial com valor diferente do título (também ficou fora em Receber).
- Recibo individual por colaborador da Folha.

## Verificação (em cada fase)
1. Na frente: `npm run ci` (typecheck, suíte e build) e `npm run verificar:build`, lendo o resumo antes de qualquer push.
2. Migration aplicada com `db query -f` (escrita no banco remoto, que faz parte do plano aprovado) e o teste transacional do item 1 (Fase 1) ou a conferência do item 8 (Fase 2).
3. Publicar com push em `main`, com aval do usuário, e `bash scripts/conferir-producao.sh "<texto novo da tela>"`.
4. Fase 1, pelo usuário ou por print:
   - dar baixa num título de Contas a Pagar com recibo
   - conferir o PDF: org no cabeçalho, credor na assinatura, nº 000001 da série de pagamento
   - reimprimir: tem de sair o mesmo arquivo
   - estornar: o recibo fica cancelado
   - conferir que a série de recebimento não andou
5. Fase 2: sondas das Edge Functions (item 9) e o download nos dois portais.

## Estado

### Fase 1
- [x] 1. Migration `aplicar_20270928000110_recibos_pagamento.sql`, aplicada no banco remoto em 28/09/2026.
  - Conferido: os 5 recibos antigos ficaram `RECEBIMENTO`; a ACL de `emitir_recibo_pagamento` não tem `anon`; as 2 triggers novas existem; a unicidade é `(organization_id, kind, receipt_number)`; sem mojibake.
  - Teste transacional como `authenticated`, desfeito no fim: emite o nº 1 PAGAMENTO com credor e CNPJ do cadastro, é idempotente, recusa CREDIT, título aberto e Folha, e o estorno cancela.
  - ⚠️ **Bug achado nesse teste e corrigido antes de qualquer uso:** com `business_status` NULL (222 títulos DEBIT em aberto), `NOT (false OR NULL)` é NULL e a RPC emitia recibo para título NÃO pago. Corrigido com `COALESCE`. A mesma checagem existe em `emitir_recibo_recebimento` e ficou **sem mexer**: hoje nenhum título a receber está nesse caso. Registrado para decisão do usuário.
- [x] 2. Tipos: `FinancialReceipt.kind`/`payee_*` e `FinancialReceiptKind`. `PayablePaymentType` ficou exportado de `payableService.ts`, ao lado de `darBaixa`, e não em `types/financial.ts`.
- [x] 3. `payableService.darBaixa` + `__tests__/payableServiceDarBaixa.test.ts`.
- [x] 4. `utils/reciboRecebimento.ts`: variante PAGAMENTO (`verboDoCredor`, corpo, assinatura do credor com "Local e data", `Recibo_Pagamento_…`) + 5 testes em `reciboRecebimento.test.ts`; os antigos seguem verdes.
- [x] 5. `financialReceiptService`: `emitir(tx, kind)`, `baixarPdf({ kind })`, `listarAtivosDaOrg` + `__tests__/financialReceiptService.test.ts`.
- [x] 6. `BaixaRecebivelSheet` genérico (`tipo`, `TituloDaBaixa`, `emitirReciboPadrao`, `reciboIndisponivel`, `avisoRecibo`; o reset é pela chave dos ids). Receber passa `baixando.map(tituloDeRecebivel)`. Coberto por `__tests__/components/BaixaRecebivelSheet.test.tsx`.
- [x] 7. `ContasPagarParcelas`: "Pago" abre o painel, lote "Dar baixa", coluna Recibo antes de Status, ícone de recibo nas pagas, o estorno limpa. Coberto por `__tests__/components/ContasPagarRecibo.test.tsx` (5 testes); deep-link e paginação (8) seguem verdes; `check-ui-standard.sh` limpo.
- [x] `npm run ci` completo na frente (518 arquivos / 5.882 testes); após rebase, 5.897 testes verdes
- [x] Publicação — push `7f6bf64b..1d16990f`; `conferir-producao.sh` provou o domínio em `1d16990` com "Confirmar pagamento" no bundle
- [x] Usuário confere um recibo real — 28/09/2026: *"1,2 e 3 estao ok"* (baixa com recibo nº 000001, PDF com a empresa no cabeçalho e o credor na assinatura, reimpressão idêntica)

### Correção pedida depois da Fase 1 (28/09/2026)

> 1. Sim
> 2. Sim

(Respostas a: "1. Corrijo o mesmo defeito na função de recibo de Contas a Receber?" e
"2. No Portal do Parceiro, parcelas canceladas aparecem como 'Pago'. Corrijo junto na Fase 2?")

- [x] 1. `aplicar_20270928000111_recibo_recebimento_coalesce.sql` (aplicada): `emitir_recibo_recebimento` reescrita a partir do arquivo 000120, com só a checagem de baixa trocada por `COALESCE`, e `trg_cancelar_recibo_no_estorno` com `COALESCE` do lado NEW. O teste transacional, antes/depois, mostrou:
  - título a receber em aberto com `business_status` NULL: antes emitia recibo, depois é recusado;
  - estorno deixando NULL: antes não cancelava, depois cancela.
  - ACL igual, sem mojibake, e 5 recibos antes e depois.
- [x] 2. Portal do Parceiro: parcela CANCELLED aparecendo como "Pago" — corrigido na Fase 2 (ver item 10).

### Fase 2
- [x] 8. `aplicar_20270928000120_portais_recibo_pagamento.sql` (aplicada): os dois núcleos, reescritos dos arquivos (conferido que são as versões vivas), com `recibo_numero` via LEFT JOIN no recibo PAGAMENTO ativo. ACL igual, sem mojibake. `partner_ws_financials` do workspace do credor do recibo real devolve `recibo_numero = 1` na parcela paga.
- [x] 9. Edge Functions `supplier-portal-recibo-download` e `partner-portal-recibo-download`, publicadas com o deploy padrão da função de cliente. Sondas da Pergunta 3:
  - sem header: 401 (as duas);
  - chave anon com token falso: 403 "Link inválido ou expirado" (as duas);
  - chave anon com o workspace real, sem sessão: 403 "Entre no portal…";
  - chave anon com um pedido, sem sessão: 403.
  - O caminho do dono (token real do credor) é uma credencial e fica para a conferência do usuário no portal.
- [x] 10. Telas:
  - `PortalFinanceiro` (link público, com o elemento novo `TextLinkButton` no `PortalKit`, §24);
  - `SupplierFinanceiroTab` (app, coluna Recibo no `StandardTable`);
  - aba Financeiro do detalhe do pedido (`SupplyChainOrderDetails`);
  - `PartnerPortal` (link "Recibo Nº X" ao lado do status).
  - Serviço `reciboPagamentoPortalService` (+ `rotuloRecibo`, sem puxar o jsPDF para o portal).
  - **Status do parceiro:** `utils/situacaoParcelaParceiro.ts` passa a ser o predicado único de `PartnerPortal` e `PartnerWorkspaceManager`; cancelada vira "Cancelado" e deixa de somar no "pago" do gestor. Status reais das parcelas de contrato em 28/09/2026: só PENDING, CONCILIATED e CANCELLED; a regra nova só muda as 5 canceladas.
  - Testes: `situacaoParcelaParceiro.test.ts`, `pedidoFinanceiroService.test.ts` (recibo_numero) e `PortalFinanceiro.test.tsx` (2 novos).
- [x] `npm run ci` (525 arquivos / 5.932 testes) e, após o rebase, 5.959 testes verdes; publicação com push `ee357200..ee283003`; `conferir-producao.sh` provou o domínio em `ee28300` com "Baixar o recibo deste pagamento" no bundle
- [x] Conferência do usuário, 29/09/2026: *"consegui visualizar o recebi no portal do parceiro"*. O recibo nº 000001 (parcela de contrato) baixou pelo Portal do Parceiro.
- [ ] Portal do Fornecedor: coluna publicada e testada, mas ainda sem recibo real para conferir, porque nenhuma parcela de PEDIDO foi baixada com recibo até 29/09/2026. Fica para o primeiro uso.
