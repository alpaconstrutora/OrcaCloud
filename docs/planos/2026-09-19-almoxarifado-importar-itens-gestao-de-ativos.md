# Almoxarifado › Importar Itens — nova aba "Gestão de Ativos"

## Pedido original
> Gestão de Almoxarifado < Importar Itens: criar nova aba Importar itens do Gestão de Ativos
>
> Sessão: c539c51b-6e2b-4564-bc58-aff385e788e4 · 2026-09-19

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-19 | Importar ativo lança saldo (1 UN) em almoxarifado? | **Opcional**, como na aba Planilha — checkbox "Lançar saldo inicial" + seletor de almoxarifado |
| 2026-09-19 | Quais ativos aparecem para seleção? | **Todos exceto `baixado`**, com busca (nome/código/marca/modelo) e filtro por categoria |

## Contexto

O modal `components/inventory/StockItemImportModal.tsx` (botão "Importar" da aba Itens do
`InventoryModule`) tinha três origens — Base de dados, Obra/Orçamento, Planilha — que
convergem num único `pendingRows: StockItemImportRow[]`, uma pré-visualização comum e o
botão "Importar N" → `inventoryService.importStockItems` (upsert em `stock_items` por
`(organization_id, input_code)`). A aba Planilha oferecia "Lançar saldo inicial" quando
alguma linha traz `initialQuantity`.

O módulo Gestão de Ativos (`OpuraAssetsModule.tsx` → `assetService.list(orgId)` →
`opura_assets`, tipo `OpuraAsset`) guarda equipamentos, ferramentas, veículos etc. com
`code` (UNIQUE por org), `name`, `category`, `brand`, `model`, `purchase_value`, `status`.
Não existia nenhuma ponte entre ativos e almoxarifado.

Resultado: quarta aba "Gestão de Ativos" no modal; os ativos escolhidos entram na mesma
pré-visualização e são gravados no catálogo com `source = 'ativos'`, `input_code = code
do ativo`, unidade `UN`, custo de referência = `purchase_value`, e opcionalmente 1 UN de
saldo inicial.

## Plano (um item por arquivo)

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20270919000048_stock_items_source_ativos.sql` | recria `chk_stock_items_source` com `'ativos'` | `pg_get_constraintdef` no banco mostra `'ativos'`; `migrationsPrefixo` + `segurancaMigrations` verdes |
| 2 | `types/inventory.ts` | `StockItemSource` ganha `'ativos'` | `npm run typecheck` limpo |
| 3 | `components/inventory/StockItemsTab.tsx` | `SOURCE_LABELS.ativos = 'Gestão de Ativos'` | coluna Origem mostra o rótulo |
| 4 | `utils/assetToStockItemRow.ts` | mapeador puro + `ASSET_CATEGORY_LABELS` | item 8 verde |
| 5 | `components/inventory/StockItemImportModal.tsx` | aba `ativos` (lista com busca/categoria/checkbox → Adicionar → prévia); bloco "Lançar saldo inicial" sai da aba Planilha para a área comum | `check-ui-standard.sh` só acusa a busca (§3.1, justificada); verificação de tela abaixo |
| 6 | este arquivo | plano com pedido original | — |
| 7 | `docs/planos/2026-08-21-almoxarifado-cadastro-de-itens.md` | linha (d) em §3.3 apontando para cá | — |
| 8 | `__tests__/assetToStockItemRow.test.ts` | 6 casos do mapeador | `npx vitest run __tests__/assetToStockItemRow.test.ts` |
| 9 | `components/InventoryModule.tsx` | `onImported({ stockLaunched })` → `load()` quando houve saldo inicial (antes só o catálogo recarregava e Saldos/KPIs ficavam velhos até F5); de quebra, §14 (`confirm()` nativo → `useConfirm`) e §7 (`font-bold` no total) que o `check-ui-standard.sh` acusava no arquivo tocado | após Importar com saldo, aba Saldos mostra 1 UN sem F5; `check-ui-standard.sh` limpo |
| 10 | `supabase/migrations/aplicar_20270919000049_fn_net_position_organization_id_ambigua.sql` | **achado durante a verificação** (decisão do usuário 2026-09-19: corrigir nesta frente): `fn_net_position` respondia `42702` ("organization_id" ambíguo entre coluna e OUT param, desde `20270129000004`) → `getNetPositions` lançava → `Promise.all` do `load()` rejeitava → Saldos/Movimentos/KPIs vazios para qualquer org. Corpo recriado a partir do ARQUIVO com `om.`/`bp.` + REVOKE/GRANT (REGRA #7) | `SELECT count(*) FROM fn_net_position(org)` não dá 42702; ACL sem PUBLIC/anon; aba Saldos lista os itens |

## Fora do escopo (registrado, não feito)
- Coluna `origin_asset_id` em `stock_items` (FK para `opura_assets`): `input_code = code do
  ativo` já faz a ponte; FK só se surgir tela que navegue do item para o ativo.
- Ponte inversa (Almoxarifado → Gestão de Ativos) e sincronização de status/baixa.
- Migrar o modal para `TabsBar`/`StandardTable` — as três abas existentes são hand-rolled;
  a quarta segue o mesmo desenho para não misturar dois padrões no mesmo modal.

## Registro de mudança de rumo
- 2026-09-19 (mesma sessão): as duas migrations nasceram como `000030`/`000031` e foram renumeradas para `000048`/`000049` — `origin/main` já tinha até `000047` (o checkout de integração estava atrasado quando o plano foi escrito). A `000048` foi aplicada no banco ainda com o nome antigo; conteúdo idêntico, não rodar de novo.
- 2026-09-19: o usuário decidiu corrigir `fn_net_position` nesta frente (item 10) porque sem isso a aba Saldos não exibe o que a importação grava.

## Estado
- [x] 1 — migration `000048` escrita e **aplicada no banco** (2026-09-19; CHECK conferido via `pg_get_constraintdef`)
- [x] 2 — `types/inventory.ts`
- [x] 3 — `StockItemsTab.tsx`
- [x] 4 — `utils/assetToStockItemRow.ts`
- [x] 5 — `StockItemImportModal.tsx`
- [x] 6 — este plano
- [x] 7 — referência cruzada no plano de 2026-08-21
- [x] 8 — teste (6/6)
- [x] 9 — `InventoryModule.tsx` (recarga de saldos + §14/§7)
- [x] 10 — migration `000049` escrita e **aplicada no banco** (2026-09-19; função responde, ACL só authenticated)
- [x] verificação na interface — Playwright em servidor da frente (porta 3123), org Alpa, usuário agente-leitura: 84 ativos listados sem baixados; busca "alicate" 5 · categoria Ferramenta 5 · Veículo 0; 2 selecionados → prévia 2 (código do ativo, UN, Novo) → saldo inicial + Almoxarifado Central → "Importação concluída, 2 itens criados"; aba Itens com Origem "Gestão de Ativos"; aba Saldos com os dois códigos a 1,00 UN; reimportação marca "Já existe". 0 erros de console, 0 HTTP 4xx/5xx (portão exit 0). Dados gravados de propósito na org Alpa (decisão do usuário): 6 itens `source=ativos` + 6 movimentos de 1 UN.
- [ ] push em `main` + `conferir-producao.sh`

## Verificação
1. `npm run typecheck`
2. `npx vitest run __tests__/assetToStockItemRow.test.ts __tests__/migrationsPrefixo.test.ts __tests__/segurancaMigrations.test.ts __tests__/orgContextGuard.test.ts`
3. `bash scripts/check-ui-standard.sh` em `StockItemImportModal.tsx`, `StockItemsTab.tsx`, `InventoryModule.tsx` — o modal acusa só
   `assetSearch` em `useState`: é a exceção §3.1 do guia (busca de seletor dentro de modal,
   zera ao fechar de propósito).
4. Migration aplicada e conferida via `pg_get_constraintdef` — antes do push.
5. Interface (org com ativos): Gestão de Almoxarifado › Itens › Importar › aba Gestão de
   Ativos → lista sem baixados; busca e categoria funcionam; selecionar 2 → Adicionar → prévia
   com código do ativo e UN; marcar saldo inicial + almoxarifado → Importar → "2 itens criados";
   aba Itens mostra Origem "Gestão de Ativos"; Saldos mostra 1 UN de cada. Reimportar o mesmo
   ativo → "Já existe" → "atualizado". Zero erros de console/PostgREST.
6. `git push origin HEAD:main` → `bash scripts/conferir-producao.sh "Gestão de Ativos"` →
   `bash scripts/fechar-frente.sh almoxarifado-importar-ativos`.
