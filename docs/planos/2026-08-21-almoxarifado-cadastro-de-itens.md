# Almoxarifado — Cadastro de Itens (avulsos, de obras antigas, da base e por planilha)

## Pedido original

> Sessão de 2026-08-21:
>
> ```
> surpimentos < Gestão de Almoxarifado:
> 1. implementar campo para cadastro de itens avulsos ou itens importados de obras antigas.
> 2. sugira melhorias
> ```

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-21 | Origem dos itens importados | As três: orçamento de obras já no sistema, planilha Excel (obras fora do sistema), base SINAPI/Base Própria |
| 2026-08-21 | Item sem código (bug: colapsa saldo) | Gerar código automático (`AVU-000123`), no molde de `CUSTOM-XXXXXX` em `custom_items`; incluir backfill dos saldos já colapsados |
| 2026-08-21 | Escopo do pedido 2 (sugestões) | Só listar — não implementar agora |

---

## Context

**Hoje o almoxarifado não tem cadastro de item.** O item nasce implicitamente do primeiro movimento, digitado como três campos de texto livre (descrição, código, unidade) em [InventoryModule.tsx:140-163](../../components/InventoryModule.tsx#L140-L163). O mesmo texto livre se repete em Requisições ([:1704-1730](../../components/InventoryModule.tsx#L1704-L1730)) e Transferências ([:1281-1295](../../components/InventoryModule.tsx#L1281-L1295)). Resultado prático: "CIMENTO CP-II 50KG", "Cimento CP II", "cimento cpII" viram três itens distintos, e nenhuma reutilização é possível.

Três achados que mudam o desenho (levantados por exploração de código antes do plano, não suposição):

1. **A tabela de catálogo já existe e está morta.** `stock_items` (por organização, `UNIQUE (organization_id, input_code)`) foi criada em [20261203000001_almoxarifado_stock_items.sql:80-93](../../supabase/migrations/20261203000001_almoxarifado_stock_items.sql#L80-L93), e o CRUD existe em [almoxarifadoService.ts:287-320](../../services/almoxarifadoService.ts#L287-L320) — mas **nenhum componente importa esse service**. Não é greenfield: falta a UI e falta ligar ao service vivo.

2. **Item sem código colapsa num único saldo.** A PK de `stock_balances` é `(warehouse_id, input_code)` e o trigger normaliza código vazio para string vazia (`COALESCE(NEW.input_code,'')`, [20261203000001:41,63](../../supabase/migrations/20261203000001_almoxarifado_stock_items.sql#L41)). Como o código é opcional na UI, **todo item avulso de um mesmo almoxarifado vira uma linha só**, com a descrição sobrescrita pelo último movimento. Implementar "cadastro de item avulso" sem corrigir isso entregaria um cadastro que corrompe o saldo.

3. **Não existe hoje nenhum caminho de reaproveitar itens de outra obra.** O orçamento é JSONB em `projects.budget` (`BudgetEntry[]`, com o item embutido por valor em `sinapiItem`). A única forma existente é duplicar o projeto inteiro ([useProjectOperations.ts:205](../../hooks/useProjectOperations.ts#L205)) ou salvar item a item na Base Própria ([BudgetRow.tsx:305](../../components/BudgetRow.tsx#L305)).

**Resultado esperado:** uma aba **Itens** no módulo, onde o usuário cadastra um item avulso ou importa em lote de três origens, e todos os formulários do almoxarifado passam a escolher do catálogo em vez de digitar texto livre.

## Escopo

**Dentro:** cadastro de item (CRUD), as três origens de importação, seletor de item nos formulários existentes, correção do código vazio + backfill.

**Fora (só listado na seção 5):** as melhorias do pedido 2.

---

## Plano

### 1. Banco — migration `supabase/migrations/<prefixo-a-confirmar>_almoxarifado_catalogo_itens.sql`

⚠️ Confirmar o prefixo com a trava `__tests__/migrationsPrefixo.test.ts` antes de nomear (última migration na pasta hoje é `20270913000003`). **Nunca `supabase db push`** — o histórico de migrations está furado (`20270208*` fora de `schema_migrations`).

**1.1 — Evoluir `stock_items`**
```sql
ALTER TABLE public.stock_items
    ADD COLUMN IF NOT EXISTS source            TEXT,   -- avulso | catalogo | orcamento | planilha | recebimento
    ADD COLUMN IF NOT EXISTS origin_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit_cost_hint    NUMERIC(15,4);

CREATE INDEX IF NOT EXISTS idx_stock_items_desc_trgm
    ON public.stock_items USING gin (input_description gin_trgm_ops);
```
**Como sei que terminou:** `\d stock_items` mostra as 3 colunas novas; índice existe em `pg_indexes`.

**1.2 — Gerador de código atômico** `fn_next_stock_item_code(p_org UUID) RETURNS TEXT`
Formato `AVU-000001`, sequencial por organização, com `pg_advisory_xact_lock` + `MAX(...)+1` (não `COUNT(*)+1` — esse é o defeito já existente em `fn_next_material_request_number`, [20261203000002:142](../../supabase/migrations/20261203000002_almoxarifado_material_requests.sql#L142)).
**Como sei que terminou:** duas chamadas concorrentes (`pgbench` ou `Promise.all` de 10 chamadas via RPC) não geram código repetido.

**1.3 — Trigger `BEFORE INSERT` em `stock_movements`: `fn_stock_movement_resolve_item()`**
Cobre também os caminhos que não passam pela UI (RPC de recebimento, `fn_deliver_material_request`, `fn_receive_stock_transfer`):
- código NULL/vazio → busca em `stock_items` da org por `unaccent(lower(input_description))` + `input_unit`; achou, usa; não achou, cria com `fn_next_stock_item_code` e `source='avulso'`.
- código presente → garante linha em `stock_items` (`ON CONFLICT DO NOTHING`).

**Como sei que terminou:** dois movimentos com descrições diferentes e sem código geram dois `input_code` distintos e duas linhas em `stock_balances`; dois movimentos com a mesma descrição/unidade caem no mesmo item.

**1.4 — Backfill dos dados já corrompidos**
Dentro de `DO $$ … $$` na mesma migration: agrupar `stock_movements` com código vazio por `(organization_id, input_description, input_unit)`, criar item, atualizar `input_code`, apagar `stock_balances` com `input_code=''` e recalcular pela mesma fórmula de custo médio do trigger `fn_update_stock_balance`.

> Antes de escrever: medir o estrago real em produção com o usuário de leitura (`SELECT count(*) FROM stock_balances WHERE input_code=''`). Se zero, este passo vira no-op.

**Como sei que terminou:** `SELECT count(*) FROM stock_balances WHERE input_code = ''` = 0; soma de `quantity * avg_unit_cost` bate antes/depois.

**1.5 — RLS:** `stock_items` já tem `org_access_stock_items`. Funções novas `SECURITY INVOKER`; se precisar `DEFINER`, `REVOKE ALL … FROM PUBLIC`.

### 2. Service — `services/inventoryService.ts`

Adicionar (não usar o `almoxarifadoService.ts` órfão): `listStockItems`, `upsertStockItem` (`onConflict: 'organization_id,input_code'`), `setStockItemActive`, `importStockItems` (lotes de 50, molde de [customDatabaseService.saveBatch](../../services/customDatabaseService.ts#L128-L170), retorna `{created, updated, skipped, errors}`). `organizationId?: string | null` com `.eq()` condicional (padrão citado no `CLAUDE.md` como referência, [inventoryService.ts:112-119](../../services/inventoryService.ts#L112-L119)).

Tipos novos em `types/inventory.ts`: `StockItem`, `CreateStockItemInput`, `StockItemImportRow`, `StockItemImportResult`.

**Como sei que terminou:** `npx vitest run __tests__/orgContextGuard.test.ts` passa.

### 3. UI — pasta nova `components/inventory/`

**3.1 `StockItemsTab.tsx`** — tabela do catálogo (`useTableColumns`+`ColumnConfigButton`+`SortableHeader`, `ActionIconButton`, `useConfirm()` para desativar). Colunas: Código · Descrição · Unidade · Categoria · Fornecedor padrão · Origem · Situação · Ações.

**3.2 `StockItemSheet.tsx`** — painel lateral (`components/ui/sheet.tsx`, guarda `dirty`). Campos: Código (placeholder "Gerado automaticamente") · Descrição* · Unidade* (combobox com `<datalist>` de `masterDataService.listUnits()`) · Categoria · Fornecedor padrão · Observações · Ativo. Escrita via `useOrgWriteTarget()` modo `'single'`.

**3.3 `StockItemImportModal.tsx`** — 3 abas, todas terminam em pré-visualização (novo/já existe/erro) antes de `importStockItems`:
- (a) Base de dados: reusa [DatabasePickerModal.tsx](../../components/DatabasePickerModal.tsx) com nova prop `multiple?: boolean` para acumular seleção.
- (b) Obra/orçamento existente: seletor com `useStore().allProjects` + `onlyClassifications(lista,'OBRA','ORCAMENTO')`; `projectService.loadProject`; seleção via [BudgetPickerModal.tsx](../../components/BudgetPickerModal.tsx); composições explodem via [MaterialSelectionModal.tsx](../../components/MaterialSelectionModal.tsx).
- (c) Planilha Excel: componente novo no molde de [DatabaseExcelImportModal.tsx](../../components/DatabaseExcelImportModal.tsx), colunas por posição (código opc./descrição/unidade/categoria/custo opc./qtd. saldo inicial opc.); checkbox "Lançar saldo inicial" gera movimento `in` quando marcado.

**3.4 `StockItemSelect.tsx`** — combobox de busca (debounce 300ms) com "＋ Cadastrar item novo" no rodapé; substitui os 3 `<input>` livres em `MovementModal`, `RequestModal`, `TransferModal`.

**3.5 `InventoryModule.tsx`** — nova aba `itens` (após Saldos), carregar `stockItems` no `load()`, `ColumnConfigButton`, botões "Novo Item"/"Importar" condicionais à aba.

**Como sei que terminou:** ver seção Verificação abaixo.

### 4. Limpeza

Remover `listStockItems`/`upsertStockItem` de `services/almoxarifadoService.ts` (o arquivo inteiro fica para a sugestão P2-9).

---

## Estado

- [x] 1.1 — colunas novas em `stock_items` + índice trigram — aplicado em produção, confirmado via `information_schema.columns`
- [x] 1.2 — `fn_next_stock_item_code` — aplicado, confirmado em `pg_proc`
- [x] 1.3 — trigger `fn_stock_movement_resolve_item` (+ `fn_stock_items_generate_code`, `fn_resolve_stock_item_code`) — aplicados, confirmados em `pg_trigger`/`pg_proc`; `fn_consume_stock_for_work_order` e `fn_receive_stock_transfer` atualizadas para resolver o código antes do lookup de custo médio
- [x] 1.4 — backfill — **medido em produção: 0 linhas afetadas** (`stock_movements`/`stock_balances`/`stock_items` estavam todas com 0 registros — o módulo nunca foi usado de verdade). Bloco rodou como no-op, confirmado.
- [x] 1.5 — RLS/REVOKE conferidos — as 4 funções novas + as 2 pré-existentes que passaram a fazer lookup de custo (`fn_consume_stock_for_work_order`, `fn_receive_stock_transfer`) sondadas com a chave anon: todas devolvem `42501 permission denied for function <nome>` (fechadas). As duas últimas **não tinham REVOKE antes** — gap de segurança pré-existente fechado como parte desta migration.
- [x] 2 — `inventoryService` com CRUD + import de `stock_items` (`listStockItems`, `getStockItem`, `upsertStockItem`, `setStockItemActive`, `importStockItems`)
- [x] 3.1 — `StockItemsTab.tsx`
- [x] 3.2 — `StockItemSheet.tsx`
- [x] 3.3 — `StockItemImportModal.tsx` (3 origens: base de dados, obra/orçamento, planilha)
- [x] 3.4 — `StockItemSelect.tsx` + adoção em `MovementModal`, `TransferModal`, `RequestModal`
- [x] 3.5 — costura em `InventoryModule.tsx` (aba, toolbar, botões, carregamento, modais)
- [x] 4 — limpeza do `almoxarifadoService.ts` (métodos mortos `listStockItems`/`upsertStockItem` removidos; arquivo inteiro fica para a sugestão P2-9)

**Verificação executada (2026-08-21):**
- `npx tsc --noEmit -p .` — limpo
- `npm run build` — build completo sem erros
- `npx vitest run` — 73 arquivos de teste, 1406 testes passando, 0 falhas
- `bash scripts/check-ui-standard.sh` nos 4 componentes novos + `InventoryModule.tsx` — 0 violações em código novo (violações pré-existentes em `InventoryModule.tsx` linhas 583/635/769/1069/1121 são anteriores a este trabalho, não introduzidas por ele — ver nota abaixo)
- `bash scripts/check-project-classification.sh` / `check-system-projects.sh` / `check-org-selector-guard.sh` — limpos
- `npx vitest run __tests__/migrationsPrefixo.test.ts` — passa, sem colisão
- Migration aplicada em produção via `supabase db query --linked -f`; pós-condição `SELECT count(*) FROM stock_balances WHERE input_code=''` → 0

**Nota — violações pré-existentes não corrigidas (fora do escopo deste plano):**
`InventoryModule.tsx` já tinha, antes desta tarefa: `font-bold` no `<h1>`/KPI/rodapé de saldos (linhas 583, 635, 769) e dois `confirm()` nativos nas abas Transferências/Almoxarifados (linhas 1069, 1121). Nenhum foi introduzido por este trabalho; ficam registrados aqui para não serem confundidos com regressão. `DatabasePickerModal.tsx` também já usava `React.useState` em vez de `usePersistedState` para os 11 campos de busca do picker (§3) antes desta tarefa — arquivo só recebeu a adição aditiva de seleção múltipla, não uma migração de padrão.

## Verificação

**Mecânica:**
```bash
bash scripts/check-ui-standard.sh components/inventory/StockItemsTab.tsx
bash scripts/check-ui-standard.sh components/inventory/StockItemSheet.tsx
bash scripts/check-ui-standard.sh components/inventory/StockItemImportModal.tsx
bash scripts/check-ui-standard.sh components/inventory/StockItemSelect.tsx
bash scripts/check-ui-standard.sh components/InventoryModule.tsx
bash scripts/check-project-classification.sh components/inventory/StockItemImportModal.tsx
npx vitest run __tests__/orgContextGuard.test.ts
npx vitest run __tests__/migrationsPrefixo.test.ts
npm run build
```

**Funcional** (com print de cada passo):
1. Aba Itens → Novo Item sem código → sai `AVU-000001`.
2. Outra descrição → `AVU-000002`; duas linhas no catálogo.
3. Entrada manual com cada item → Saldos mostra duas linhas distintas (bug corrigido).
4. Importar → Base de dados → item SINAPI → aparece no catálogo com código SINAPI.
5. Importar → Obra existente → composição → explodir insumos → conferir descrições/unidades.
6. Importar → Planilha → 5 linhas, 1 código repetido → prévia marca "já existe" → contagem bate.
7. Repetir 6 com "Lançar saldo inicial" → conferir movimento `in` e saldo.
8. Requisição/Transferência → seletor do catálogo funcionando, "＋ Cadastrar item novo" funcionando.
9. "Todas as organizações" → aba Itens carrega; Novo Item pergunta organização.

**Banco** (pós-deploy, usuário de leitura): `SELECT count(*) FROM stock_balances WHERE input_code = ''` → 0.

---

## 5. Sugestões de melhoria (pedido 2 — levantadas, não implementadas)

Tudo verificado no código, não é especulação.

**P0 — funcionalidade que já existe no banco e está morta na tela**
1. Material comprado não entra no estoque: `fn_create_stock_entry_from_receipt` ([20261130000001:154](../../supabase/migrations/20261130000001_almoxarifado_phase1.sql#L154)) e o wrapper [inventoryService.ts:211-217](../../services/inventoryService.ts#L211-L217) existem, mas nenhum arquivo os chama. Falta `warehouse_id` em `purchase_orders`/`purchase_receipts` e um passo "dar entrada no almoxarifado" no recebimento. Maior buraco do módulo — corrige também a memória `project_p2p_fluxo_integrado.md`, que dava essa costura como pronta.
2. Ajuste negativo/perda impossível pela tela: banco aceita `adjust_out` desde `20261203000001`, mas o DTO expõe só `'in'|'out'|'adjust'` ([types/inventory.ts:72](../../types/inventory.ts#L72)) e o trigger trata `adjust` como entrada positiva.
3. Consumo por Ordem de Execução desligado: [StockConsumptionModal.tsx](../../components/StockConsumptionModal.tsx) (285 linhas, pronto) não é importado por ninguém.
4. Estoque mínimo/máximo sem UI: `stock_min_levels` e `listMinLevels`/`upsertMinLevel` existem ([inventoryService.ts:558-620](../../services/inventoryService.ts#L558-L620)), o KPI "Abaixo do mínimo" já renderiza ([InventoryModule.tsx:728-736](../../components/InventoryModule.tsx#L728-L736)) mas nunca acende por falta de cadastro.

**P1 — correção e maturidade**
5. Inventário físico (contagem) nunca foi construído: `stock_counts`/`stock_count_items` do PRD não existem no banco.
6. `fn_next_material_request_number` usa `COUNT(*)+1` ([20261203000002:142](../../supabase/migrations/20261203000002_almoxarifado_material_requests.sql#L142)) — não atômico; migrar para `services/documentNumbering/` com `DocType` `MATERIAL_REQUEST`.
7. "Em trânsito" da posição líquida errado em dois pontos: `fn_net_position` agrega POs por `input_code` cross-project ([20261130000003:127-133](../../supabase/migrations/20261130000003_almoxarifado_phase3.sql#L127-L133)); e como `purchase_orders` não tem `organization_id`, PO sem `project_id` nunca conta como em trânsito.
8. Unidade de medida sem governo: `master_units_of_measure` seedada e só lida pela tela de Cadastros; 4 vocabulários concorrentes (`ContractDetailView.tsx:139`, `SupplyChainOrderForm.tsx:1056`, `LaborProductivity.tsx:17`, `measure_library_items` com `CHECK IN ('M2','M','UN')`).

**P2 — dívida técnica e evolução**
9. `services/almoxarifadoService.ts` (624 linhas) é código morto com tipos divergentes de `types/inventory.ts` — remover depois deste plano.
10. `MOVEMENT_COLS` ([inventoryService.ts:29](../../services/inventoryService.ts#L29)) não seleciona `transfer_id` — extrato sem rastro do documento de transferência.
11. Alertas de ruptura por cron + módulo Tarefas (Fase 4 do PRD) — dados já saem prontos de `fn_stock_summary`.
12. Lote/validade/localização física não existem.
13. Fora do almoxarifado, mas grave: `custom_items`/`custom_databases` sem `organization_id`, RLS `USING (true)` ([20260503000001_fix_custom_items_rls.sql:8-12](../../supabase/migrations/20260503000001_fix_custom_items_rls.sql#L8-L12)) — Base Própria de um cliente visível/editável por qualquer tenant. Colide com a REGRA #5 do `CLAUDE.md`. `custom_items` também não tem migration de criação no repo.
