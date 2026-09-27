# Suprimentos › Solicitações de Compra (SC)


## Pedido original
> suprimentos: implementar módulo solicitacoes
> Sessão 865acbe8 · 26/09/2026

## Decisões tomadas com o usuário (26/09/2026)
| Pergunta | Resposta |
|---|---|
| O que é "Solicitação" | **Solicitação de Compra**: obra pede material/serviço, aprova, vira Cotação ou Pedido |
| Aprovação | **Alçadas do motor de aprovação** (`approvalService`), não aprovar/reprovar simples |
| Origem dos itens | **As 4**: orçamento da obra, avulso, cadastro do almoxarifado, Plano de Aquisições |
| Saída | **Cotação ou Pedido**, com vínculo guardado na SC |
| Obra do teste de ponta a ponta (produção) | **Casa de Formação** (Alpa, sem pedidos nem plano) |
| Escopo do teste | **Tudo, inclusive conversões** — aceito o número pulado no contador de cotação/pedido da obra; apagar tudo ao final |
| Origem "Plano" no teste | **Gerar o plano da obra teste** e apagar ao final |

## Contexto
Hoje não existe a entidade SC. O `PLANO_MODULO_PLANO_AQUISICOES.md:45` diz: "Solicitação de Compra (SC) — não há entidade. O fluxo real é cotação → pedido". A etapa "Solicitação" do quadro P2P (`p2pFlowService.ts:172-176`) conta `procurement_plan_items` como substituto. O que já existe e será **reusado, não reimplementado**:
- **Aprovação:** `approvalService` (`submit`/`approve`/`reject`, faixas em `financial_approval_config`), fila `fn_approval_action_queue`, Central de Aprovações (`FinancialApprovalModule.tsx`, `CentralControle.tsx`).
- **Numeração:** motor genérico `services/documentNumbering/` (`fn_next_document_seq`).
- **Conversão:** `procurementService.generateQuotationFromItems` / `generateOrderFromItems` (`procurementService.ts:696-788`), que cria cotação/pedido pelo serviço e marca a origem. É o molde.
- **Itens do orçamento:** `projectService.loadProject` + `resolveProjectBudget` (`services/budgetResolver`) + `MaterialSelectionModal` (usados em `SupplyChainQuotationForm.tsx:236,1047`).
- **Itens do almoxarifado:** `inventoryService.listStockItems` / `listBalances`.

`material_requests` (Almoxarifado › Requisições) é **saída de estoque**, outra coisa, e não é tocada.

## Desenho

**Organização:** a SC pendura na **obra** (`project_id NOT NULL`: cotação e numeração exigem obra), e `organization_id` = org dona da obra. A lista de obras vem de `useStore().projects` (já só OBRA, sem projeto de sistema, respeitando o topo), portanto **não há modal de organização** (REGRA #5, item 5). Leitura: `service.list(orgId)` com `.eq` só se houver org.

**Status sem duplicar estado:** a aprovação vive em `approval_status` (RASCUNHO/PENDENTE/APROVADO/REJEITADO, do motor); o atendimento é derivado dos itens; o cancelamento usa `cancelled_at`. O status exibido é **derivado** por função pura:
`cancelada > rascunho > em aprovação > reprovada > aprovada (nenhum item atendido) > em atendimento (parte) > atendida (todos)`.
Não existe coluna `status` que possa divergir.

**Aprovação:** `submit('purchase_request', id, {}, { organizationId, amount: totalEstimado, semFaixa: 'exigir1' })`. Toda SC exige ao menos o nível 1, mesmo sem preço (amount 0). A faixa só sobe para 2 níveis por valor. `exigir1` é deliberado: com `liberar` (usado no pedido), SC sem preço se autoaprovaria. Como consequência, na fila a SC entra como o ramo `blueprint_snapshot`: **lista toda PENDENTE**, sem exigir que o valor caia numa faixa, senão SC com valor 0 ficaria pendente e invisível.

**Edição:** só em RASCUNHO ou REJEITADO. Reenviar reprovada volta ao PENDENTE. Aprovada fica travada (só cancelar/converter). Existe trava no banco (trigger), além da UI.

**Conversão:** pelo **serviço**, igual ao Plano de Aquisições. O usuário marca itens aprovados e não atendidos, e escolhe entre:
- **Gerar cotação**: `quotationService.createRequest` com status 'Aberta', depois navega para editar a cotação e convidar fornecedores.
- **Gerar pedido**: pede o fornecedor (`SupplierSelect`), chama `orderService.createOrder` em 'Rascunho', depois navega para o pedido.

Os itens recebem `quotation_request_id` / `purchase_order_id`. Item vindo do Plano de Aquisições também atualiza a linha do plano (`quoted`/`ordered` + `generated_*_id`), mantendo o rastro que o plano já usa. A operação não é atômica (mesmo padrão existente). Se o 2º passo falhar, a mensagem diz o número da cotação/pedido já criado.

**Layout (UI_PATTERNS / REGRA #4):**
- **Lista:** `StandardTable` + `TabsBar` + `KpiCard`.
- **Detalhe/aprovação/conversão:** `Sheet` lateral ("revisar fila = lista + lateral").
- **Criar/editar:** tela in-flow (muitos itens de 4 origens), igual Cotação/Pedido, sem overlay. Os seletores de origem abrem como `Sheet` a partir da tela (não é drawer aninhado).

## Plano (um item por arquivo)

### Fase 1: banco, tipos, regra pura, serviço
1. **`supabase/migrations/aplicar_<próximo prefixo de origin/main>_solicitacoes_compra.sql`**
   - `purchase_requests`: `id, organization_id NOT NULL FK, project_id NOT NULL FK, number, title, justification, need_date, priority ('normal'|'urgente'), cost_center_id FK cost_centers_v2, plano_de_contas_id FK, requested_by uuid, requested_by_name, estimated_total numeric, approval_status, approval_chain jsonb, approval_required_levels, cancelled_at, cancel_reason, created_at, updated_at`, e UNIQUE parcial em `(organization_id, number)`.
   - `purchase_request_items`: `id, request_id FK CASCADE, organization_id, source ('orcamento'|'avulso'|'almoxarifado'|'plano'), input_code, description, unit, quantity, estimated_unit_price, need_date, notes, stock_item_id, procurement_plan_item_id, budget_ref jsonb, quotation_request_id FK SET NULL, purchase_order_id FK SET NULL, cancelled_at`.
   - Trigger que copia `organization_id` do cabeçalho para o item.
   - Trigger de trava: UPDATE/DELETE de item fora das colunas de conversão bloqueado com cabeçalho PENDENTE/APROVADO.
   - RLS `is_org_member(organization_id)` nas 2 tabelas, sem `OR` solto (REGRA #7, pergunta 1).
   - Drop + re-add do CHECK `doc_type IN (...)` de `document_numbering_settings` e dos counters com `'SC'`.
   - Toda função com `REVOKE ... FROM PUBLIC, anon` + `GRANT authenticated`.
   - **Pronto quando:** aplicada com `db query -f`; `segurancaMigrations.test.ts` e `migrationsPrefixo.test.ts` verdes; `select` das 2 tabelas com usuário de leitura devolve só as orgs dele.
2. **`types/purchaseRequest.ts`**: `PurchaseRequest`, `PurchaseRequestItem`, `PurchaseRequestSource`, `PurchaseRequestDisplayStatus`. **Pronto:** `npm run typecheck`.
3. **`utils/solicitacaoCompra.ts`** (puro):
   - `statusDaSolicitacao`, `podeEditar`, `podeEnviar`, `podeCancelar`, `itensConvertiveis`, `totalEstimado`.
   - `itensParaCotacao` / `itensParaPedido`, no formato de `QuotationRequestItem` / `PurchaseOrderItem`.
   - Motivo textual de cada botão desabilitado (feedback "botão desligado diz o porquê").

   **Pronto quando:** `__tests__/solicitacaoCompra.test.ts` cobre cada ramo do status derivado, travas de edição e mapeamentos.
4. **`services/documentNumbering/types.ts` + `catalog.ts`** + adaptador `services/purchaseRequestNumberingService.ts`, no molde de `quotationNumberingService.ts`. Tipo `SC`, máscara padrão prefixo + empreendimento + obra, 4 dígitos. **Pronto:** a SC criada no teste de ponta a ponta nasce `SC-…-0001`, e Configurações › Nomenclatura lista "Solicitação de Compra".
5. **`services/purchaseRequestService.ts`**:
   - `list(orgId|null, filtros)`, `get`, `create`, `update` (grava itens + `estimated_total`), `cancel`.
   - Aprovação: `submitForApproval`, `approve`, `reject`, envolvendo o `approvalService`.
   - Conversão: `generateQuotation(requestId, itemIds, opts)`, `generateOrder(requestId, itemIds, supplierId, opts)`.
   - Seletores de origem: `listPlanoPendentes(projectId)` exclui itens de plano já presos a SC aberta.

   **Pronto:** typecheck, e o fluxo de ponta a ponta abaixo passa.

### Fase 2: aprovação no motor
6. **`services/approvalService.ts`**: `purchase_request` em `ApprovalEntity` + `ENTITY_META` (`purchase_requests`, `estimated_total`). **Pronto:** o compilador passa a exigir o rótulo em `CentralControle.tsx`.
7. **`components/FinancialApprovalModule.tsx`**: tag em `ENTITY_TAG` + ramos em `dispatchSubmit/Approve/Reject` + `ENTITY_LABEL`. O comentário em l.33-36 avisa que ramo ausente aprova em `internal_transactions`. **Pronto:** aprovar a SC pela Central muda a SC, e não um lançamento (conferido no banco).
8. **`components/CentralControle.tsx`**: rótulos singular/plural. **Pronto:** typecheck.
9. **`supabase/migrations/aplicar_<prefixo>_fila_aprovacao_solicitacao.sql`**: `CREATE OR REPLACE fn_approval_action_queue` com o corpo **copiado da versão vigente em origin/main** (não do checkout atrasado), mais o ramo `UNION ALL` para SC PENDENTE, `ORDER BY` no fim e `REVOKE`. **Pronto:** SC enviada aparece na Central de Controle e no badge de pendências (`fn_approval_pending_summary` agrega sozinha).

### Fase 3: telas e navegação
10. **`components/suprimentos/SolicitacoesCompraList.tsx`**: título + `TabsBar` (Todas / Rascunho / Em aprovação / Aprovadas / Em atendimento / Reprovadas / Canceladas, com contagem) + `KpiCard` (abertas, em aprovação, valor estimado aprovado a atender, urgentes) + toolbar §5.2 (busca persistida acoplada, `ColumnConfigButton`) + `StandardTable`. Colunas: Nº, Obra, Título, Solicitante, Necessidade, Itens, Valor estimado, Status (texto colorido, sem pílula §8). A ação primária "Nova solicitação" fica na linha do título. **Pronto:** `check-ui-standard.sh` exit 0 + checklist do guia listado no relato.
11. **`components/suprimentos/SolicitacaoCompraForm.tsx`** (tela in-flow):
    - Cabeçalho: obra, título, justificativa, necessidade, prioridade, CC e Plano de Contas **no drawer padrão hierárquico com `parentId`**.
    - Tabela de itens editável, com botões "Do orçamento", "Do almoxarifado", "Do Plano de Aquisições", "Item avulso".
    - Salvar rascunho / Enviar para aprovação.

    **Pronto:** cria e edita SC com itens das 4 origens; botão desabilitado mostra o motivo; `check-ui-standard.sh` exit 0.
12. **Seletores de origem** em `components/suprimentos/`: `SCOrcamentoPicker.tsx` (orçamento da obra via `resolveProjectBudget`, composição via `MaterialSelectionModal`), `SCAlmoxarifadoPicker.tsx` (itens + saldo atual como informação), `SCPlanoPicker.tsx` (itens pendentes do plano da obra). Todos são `Sheet`. **Pronto:** cada um adiciona linhas com `source` correto no teste de ponta a ponta.
13. **`components/suprimentos/SolicitacaoCompraSheet.tsx`**: detalhe, itens com situação (pendente / em cotação X / em pedido Y) e cadeia de aprovação. Ações conforme o estado: editar, enviar, aprovar, reprovar com motivo, cancelar com `useConfirm`, e a seção de conversão com seleção de itens, Gerar cotação e Gerar pedido (+ `SupplierSelect`). Depois de converter, navega para a cotação/pedido gerado. **Pronto:** as duas conversões funcionam e o status derivado vira "em atendimento" / "atendida".
14. **`components/AppRouter.tsx`**: `case 'supplies-solicitacoes'` (lista, form in-flow ou Sheet). O prefixo `supplies-` herda o guard `canViewOrders`/`compras`: **nenhuma chave de permissão nova** (o comentário em `AppRouter.tsx:307-310` proíbe chave não aplicada). **Pronto:** usuário sem `compras` não entra na rota.
15. **`components/Layout.tsx`**: `suprimentosViews` (:483), item no dropdown antes de Cotações (:1033), lista recolhida/mobile (:1339) e `commandItems` (:517). **Pronto:** o menu abre e destaca o grupo na nova tela, desktop e mobile.
16. **`hooks/usePersistenceSync.ts:117`** (`isSuppliesView`) e **`.claude/skills/rodar-app/varrer-abas.cjs:45`** (varredura). **Pronto:** a varredura visita a aba sem erro.
17. **`components/OrganizationUsers.tsx:280`**: descrição do módulo inclui "Solicitações". **Pronto:** texto visível na tela de usuários.

### Fase 4: costuras
18. **`components/ProcurementModule.tsx`**: na barra de seleção (:556-578), botão "Gerar solicitação" que cria SC rascunho com os itens `source='plano'` e abre o form. **Pronto:** a SC nasce com os itens selecionados do plano.
19. **`components/notifications/notificationTypes.ts`** + service: tipo `solicitacao_compra_decidida` (categoria suprimentos). O solicitante é avisado ao aprovar/reprovar, sempre com `organizationId`. `solicitacao_aprovacao` não é reusado (já é de documentos). **Pronto:** notificação aparece para o solicitante no teste.
20. **`services/p2pFlowService.ts:172-176`**: etapa "Solicitação" passa a contar `purchase_requests` abertas e aponta para `supplies-solicitacoes`. Antes, conferir se a frente `p2p-kpi-drawer` mexe no mesmo trecho. **Pronto:** o card do P2P bate com a contagem da lista.

## Execução (REGRA #8)
- `bash scripts/nova-frente.sh solicitacoes-compra`, a partir de `origin/main` (o checkout de integração está 27 commits atrás e com árvore suja de outra frente).
- Prefixos de migration escolhidos **dentro da frente**, acima do maior de `origin/main` (hoje `aplicar_20270926000110`).
- Publicar = `git push origin HEAD:main` depois de `npm run ci`; conferir com `bash scripts/conferir-producao.sh "Solicitações de Compra"`.

## Verificação
1. `npm run ci` (typecheck + suíte + build), incluindo `solicitacaoCompra.test.ts`, `orgContextGuard.test.ts`, `segurancaMigrations.test.ts`, `migrationsPrefixo.test.ts`.
2. `bash scripts/check-ui-standard.sh` em cada `.tsx` novo/tocado; `check-system-projects.sh`, `check-project-classification.sh`, `check-org-selector-guard.sh`, `check-rls-postura.sh`.
3. Ponta a ponta com a skill `rodar-app`, **em obra de teste combinada com o usuário** (o app grava no banco de produção). Passos:
   - Criar uma SC com 1 item de cada origem.
   - Enviar e aprovar pela Central de Aprovações.
   - Converter 2 itens em cotação e 2 em pedido.
   - Conferir no banco os vínculos (`quotation_request_id`, `purchase_order_id`, plano `quoted`/`ordered`) e o status derivado.
   - Repetir a leitura com o topo em "Todas", em uma org e em uma empresa.
   - Limpar os registros de teste ao final.

## Estado
Frente `C:/D/frentes/solicitacoes-compra` (branch `feat/solicitacoes-compra`, a partir de origin/main `5e9f845f`).

- [x] 1 migration tabelas — aplicada 26/09; 8 travas provadas no banco com roteiro que desfaz (obra de outra org, org do item, trava PENDENTE/APROVADO no item e no cabeçalho, aprovar/converter/cancelar passam, excluir só rascunho, cascata)
- [x] 2 tipos · [x] 3 regra pura + 13 testes · [x] 4 numeração (`PURCHASE_REQUEST`, prefixo `SC`) · [x] 5 serviço
- [x] 6 approvalService · [x] 7 FinancialApprovalModule · [x] 8 CentralControle · [x] 9 fila de aprovação — aplicada 26/09
- [x] 10 lista · [x] 11 form · [x] 12 seletores · [x] 13 sheet · [x] 14 AppRouter · [x] 15 Layout · [x] 16 persistência/varredura · [x] 17 OrganizationUsers
- [x] 18 Plano de Aquisições · [x] 19 notificação · [x] 20 P2P
- [x] Verificação de ponta a ponta no app (26/09, obra Casa de Formação, Playwright com o agente-leitura) — ver "Resultado da verificação".
- [ ] Publicação (push em main)

"Pronto" dos itens 1–20 acima = código escrito + `tsc` + checadores. Os critérios que dependem do app rodando
(SC nasce `SC-…-0001`, aparece na Central, conversões, notificação, card do P2P) só fecham com a verificação de ponta a ponta.

## Registro
- 26/09: corpo de `fn_approval_action_queue` conferido — arquivo `aplicar_20270921000025` == banco (normalizado, 4819 chars). É a base do item 9.
- 26/09 — **desvio no item 12**: o seletor do orçamento NÃO usa o `MaterialSelectionModal`. A composição é desdobrada
  nos próprios insumos dentro da lista do seletor (linha "Insumo de <código>", qtd = coeficiente × qtd orçada).
  Motivo: o seletor já é um `Sheet`; abrir o modal por cima empilharia duas sobreposições (UI_PATTERNS §4).
- 26/09 — item 20: a etapa "Solicitação" do P2P lê pelo `purchaseRequestService` + `statusDaSolicitacao` (status é
  derivado dos itens, não há coluna para contar). Conta = abas Rascunho + Em aprovação + Aprovadas + Em atendimento.
  As frentes `p2p-kpi-drawer`/`p2p-padding-lateral` já estavam em main (0 commits fora) — sem conflito.
- 26/09 — achado FORA do escopo, não corrigido: os 2 pedidos criados nos últimos 30 dias estão com
  `purchase_orders.organization_id` NULL (o formulário não grava `empresa_id`, e o trigger só deriva a org dele).
  O pedido gerado pela SC segue o mesmo caminho (`orderService.createOrder`), então herda o comportamento.

## Resultado da verificação (26/09/2026)
- **SC criada pela tela** com 1 item de cada origem (orçamento 674 linhas no seletor, almoxarifado, plano, avulso) →
  número `SC-002-0001` (o empreendimento da obra não tem código: o slot some, nunca bloqueia), total R$ 8.714,20 conferido.
- **Enviada** → PENDENTE com **2 níveis** (faixa da Alpa). Apareceu na **Central de Aprovações** ("Nível 1/2");
  nível 1 aprovado lá, nível 2 pelo painel da SC → APROVADO, cadeia com os 2 passos, notificação ao solicitante com org.
- **Conversão**: 2 itens → `COT-0001` (abriu a edição da cotação); 2 itens → pedido `PCO-169-0001` em Rascunho;
  linha do plano ficou `ordered` + vinculada. Status derivado: Em atendimento → Atendida.
- **Plano de Aquisições › Gerar Solicitação**: criou `SC-002-0002` só com a linha livre (a outra já estava numa SC
  aberta e ficou de fora). Enviada → **reprovada com motivo** (botão desabilitado sem motivo) → notificação com o
  motivo → **cancelada**.
- **Varredura** `varrer-abas.cjs` em Todas / organização / empresa: 18 telas, 0 falhas objetivas, 0 filtro de org vazando em "Todas".
- **Corrigido durante o teste**: (1) `Sheet` fechado continua montado — os 3 seletores passaram a montar só quando
  abertos (o botão "Adicionar" achado era o do seletor escondido); (2) colunas dos seletores e do painel cortadas —
  larguras refeitas / painel `4xl`; (3) "Solicitação Solicitação SC-…" na Central — título da fila sem a palavra
  (migration 131 reaplicada); (4) rodapé vazio no painel de SC atendida/cancelada; (5) aviso de "item já em outra SC"
  no Plano sumia com a troca de tela — passou para o toast global.
- **Plano de teste**: a obra não tem cronograma, então "Gerar Plano" não gera nada; as 2 linhas de plano foram
  inseridas por SQL (com `suggested_buy_date`, que é o que põe a linha no Calendário selecionável).
- **Limpeza**: SCs, itens, COT-0001, PCO-169-0001, linhas de plano, notificações e o contador `PURCHASE_REQUEST`
  apagados numa transação com conferências; confirmado por consulta separada (tudo 0). Os contadores de cotação e
  pedido da obra ficaram avançados (decisão do usuário): a próxima cotação real sai 0002, o próximo pedido 0002.
- **Achado fora do escopo, não corrigido**: `SupplyChainQuotationForm.tsx:798` usa `key={code}` e o orçamento da
  obra repete a composição 103675 → aviso de React "duas crianças com a mesma chave" ao abrir qualquer cotação dessa obra.
- 27/09 — **prefixos renomeados antes do push**: `origin/main` ganhou `aplicar_20270926000120_portal_recebiveis_com_recibo.sql`
  (frente de recibos) enquanto esta frente estava aberta. As migrations daqui viraram `aplicar_20270926000130_solicitacoes_compra.sql`
  e `aplicar_20270926000131_fila_aprovacao_solicitacao_compra.sql`. Só o nome do arquivo mudou — o conteúdo já está no banco.
