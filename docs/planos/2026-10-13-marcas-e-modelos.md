# Marcas e Modelos (Configurações) → Ativos do edifício, Ativos Patrimoniais e Almoxarifado


## Pedido original
> Configurações do Sistema: criar gerenciamento de Marcas e modelos de equipamentos, componentes, materiais etc.
> Conectar com:
> 1. Comercial > Ativos do edifício
> 2. Gestão de Ativos > Ativos Patrimoniais

Sessão `36a3996f-7d6b-4de8-af01-563517bb81be` · 2026-10-13

### Pedido posterior — 13/10/2026 (mesma sessão, com print da folha Marcas)
> marcas e modelos nao deve ser separados, pois todo modelo esta vinculado a uma marca. Pode existir cadastro de marca sem modelo, mas nenhum, modelo sem marca.
> entao modelo deve ser fundido com marca. no proprio cadastro de marca, habilite cadastro de modelo e ficara resolvido

**Mudança de rumo:** a folha "Modelos" separada sai. Configurações ganha UMA folha
"Marcas e Modelos"; o painel da marca lista os modelos dela e cadastra/edita cada
um ali mesmo (o painel troca de conteúdo — sem drawer dentro de drawer, UI_PATTERNS
§4.4). Itens na seção "Fase 2 — fundir" abaixo.

## Contexto
- Marca e modelo do ativo são **texto livre** em `opura_assets.brand/model` (VARCHAR 100). As duas telas pedidas gravam nessa mesma tabela.
- Existe um catálogo só de marcas, `opura_asset_brands`. Ele tem `organization_id` sem FK, RLS por subselect `user_id` e só a Gestão de Ativos o usa. Mesmo assim o ativo grava o **nome** da marca, não o id.
- Cadastro de modelo não existe em lugar nenhum.
- Almoxarifado (`stock_items`) não tem marca nem modelo.
- Banco medido em 13/10: 88 ativos, 3 com marca, 0 com modelo, 1 marca no catálogo. O backfill é trivial.
- ⚠️ O checkout de integração `C:\D\ORÇACLOUD\orçacloud-saas` está **572 commits atrás** e tem alterações de outra sessão. Trabalhar só em uma frente nova (REGRA #8). As linhas abaixo foram conferidas em `origin/main` (9acfb6f7).
- ⚠️ Outra frente mexeu hoje em `AtivosTab`, `buildingAssetService` e `AtivosEdicaoEmLoteSheet` (edição em lote). Fazer rebase antes de tocar neles.

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 13/10 | Como o ativo guarda marca e modelo | **Id (FK) + texto espelhado automaticamente** |
| 13/10 | Digitar marca/modelo inexistente | **Cadastra na hora e seleciona**, nunca bloqueia |
| 13/10 | Campos do modelo | **Tipo de item, código do fabricante, categoria e vida útil padrão (autopreenche sem sobrescrever o manual), especificação + link da ficha técnica** |
| 13/10 | Almoxarifado | **Entra nesta entrega** |

## Decisões de desenho
- **Tabelas novas neutras** `product_brands` e `product_models`. O catálogo atende ativo e material.
  - A linha de `opura_asset_brands` é copiada com o mesmo id.
  - A tabela antiga fica deprecada. Ela é congelada (REVOKE de escrita) só **depois** do deploy; o drop é pendência futura.
- **A organização do modelo é a da marca**, e a do ativo/item é a do registro. FKs compostas `(brand_id, organization_id)` e `(model_id, brand_id)` barram cruzar organizações no banco.
- **O espelho de texto vem do banco**:
  - (a) trigger `BEFORE INSERT/UPDATE OF brand_id, model_id, brand, model, organization_id` em `opura_assets` e `stock_items`. Ele preenche o texto a partir dos ids, revincula pelo nome quando só o texto muda (lote ou cliente antigo) e anula `model_id` de outra marca.
  - (b) trigger `AFTER UPDATE OF name` em marcas/modelos, que propaga o novo nome. É `SECURITY DEFINER`, porque a RLS de `opura_assets`/`stock_items` é por e-mail e com INVOKER algumas linhas ficariam com o nome antigo sem erro.
  - Em toda função nova: `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` e delimitador `$function$` (o teste de segurança não lê `$fn$`).
- **Em Configurações**: criar marca usa `resolveWriteOrg('all-allowed')` + `forEachTargetOrg`. Criar modelo herda a org da marca, sem perguntar.
- **Ao excluir**: marca ou modelo com uso não se exclui, **inativa**. As FKs dos registros são `ON DELETE SET NULL (col)` e o texto fica.
- O modal central "Gerenciar Marcas" da Gestão de Ativos **sai**: a criação passa a ser no campo, e editar/renomear fica em Configurações.

## Plano (um item por arquivo; cada item diz o que muda e como sei que terminou)

### 0. Frente e diagnóstico
- [x] `bash scripts/nova-frente.sh marcas-modelos`. Copiar este plano para `docs/planos/2026-10-13-marcas-e-modelos.md`. **Pronto:** `HEAD` = origin/main e plano commitado.
- [x] Diagnóstico só de leitura: `select version()` (precisa PG ≥ 15 para `SET NULL (col)`), triggers não internos em `opura_assets`/`stock_items`, `pg_publication_tables`, `length(brand) > 100`, e se a org da marca antiga existe. **Pronto:** resultados colados no plano. Se o PG for < 15, a FK composta é trocada por validação no trigger.

### 1. Banco
- [x] `supabase/migrations/aplicar_20271013000100_catalogo_marcas_modelos.sql` (conferir o maior prefixo em origin/main na hora; molde `aplicar_20270921000061_blueprint_plugins.sql`). Blocos:
  1. `product_brands`:
     - `id`, `organization_id` FK CASCADE, `name` com CHECK 1–100 e espaços normalizados, `name_key` gerado com `lower(name)`;
     - `is_active`, `created_by`, `created_at`, `updated_at`;
     - UNIQUE `(organization_id, name_key)` e `(id, organization_id)`.
  2. `product_models`:
     - `brand_id`, `organization_id`, `name`, `name_key`;
     - `item_type` com CHECK `equipamento|componente|material|ferramenta|veiculo|tecnologia|mobiliario|outro`;
     - `manufacturer_code`;
     - `default_asset_category` com CHECK igual a `AssetCategory`, e `default_useful_life_months` 1–1200;
     - `technical_spec` (≤ 4000) e `datasheet_url` (`^https?://`);
     - `is_active`;
     - FK `(brand_id, organization_id)` RESTRICT, UNIQUE `(brand_id, name_key)` e `(id, brand_id)`.
  3. RLS `FOR ALL TO authenticated USING/WITH CHECK (is_org_member(organization_id))`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT S/I/U/D TO authenticated`, trigger `fn_set_updated_at`.
  4. Colunas `brand_id`/`model_id` em `opura_assets`, e `brand_id`/`model_id`/`brand`/`model` em `stock_items`. FKs compostas e índices parciais. `SET lock_timeout='5s'`.
  5. Backfill:
     - copiar `opura_asset_brands` com o mesmo id;
     - marcas a partir dos textos distintos (`ON CONFLICT DO NOTHING`);
     - `UPDATE opura_assets SET brand_id`;
     - modelos a partir dos textos, de forma genérica.
  6. Triggers (a) espelho e (b) propagação do nome.

  **Pronto:**
  - `npx vitest run __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` verde;
  - aplicado bloco a bloco com `npx supabase db query --linked -f`, nunca `db push`;
  - pós-check: os 88 ativos estão intactos e todo ativo com texto de marca tem `brand_id`;
  - `bash scripts/check-rls-postura.sh` sem achado novo.
- [x] `scripts/prova-marcas-modelos.sql` (`BEGIN … ROLLBACK`). **Pronto:** passa provando seis coisas:
  - renomear propaga para ativo e item;
  - FK cross-org é rejeitada;
  - modelo de outra marca vira NULL;
  - texto alterado no lote revincula;
  - excluir modelo mantém o texto;
  - trocar a marca do modelo leva os ativos junto.
- [x] `aplicar_20271013000200_congelar_opura_asset_brands.sql` (COMMENT DEPRECADA + REVOKE de escrita). Aplicado **depois** do deploy. **Pronto:** INSERT como authenticated falha com 42501.

### 2. Tipos, utilitários puros e service
- [x] `types/brandModel.ts`: `ProductBrand`, `ProductModel`, `ProductItemType`, `ITEM_TYPE_LABELS`. **Pronto:** tsc.
- [x] `utils/catalogoNome.ts`: `normalizarNome`, `chaveNome`, `chaveBusca` (sem acento, mesma `norm` de `components/inventory/StockItemSelect.tsx`), `deveOferecerCadastro` (ignora maiúsculas e acento). **Pronto:** `__tests__/catalogoNome.test.ts` verde.
- [x] `utils/catalogoAutopreencher.ts`: `aplicarPadroesDoModelo(campos com origem 'vazio'|'padrao'|'auto'|'manual', modelo)`. Nunca toca em `manual`, e trocar de modelo atualiza o que estava em `auto`. **Pronto:** `__tests__/catalogoAutopreencher.test.ts` verde, com o caso "não sobrescreve manual".
- [x] `services/brandModelService.ts`:
  - `listBrands`/`listModels(orgId?)`, que só aplicam `.eq` quando há org;
  - contagem de uso;
  - create/update/setActive/delete, com 23503 e 23505 traduzidos em mensagem;
  - `findOrCreateBrand`/`findOrCreateModel`: INSERT e, em 23505, SELECT por `name_key`;
  - `resolverMarcaModelo(orgId, valor, defaultItemType)`: ponto único dos salvar.

  **Pronto:** `__tests__/brandModelService.test.ts` (supabase mockado) verde.
- [x] `services/assetService.ts` L808-885 e `types/assets.ts` L156-166: remover `listBrands`/`createBrand`/`updateBrand`/`deleteBrand` e `OpuraAssetBrand*`, sem adaptador. `OpuraAsset` ganha `brand_id?`/`model_id?`. **Pronto:** `rg "assetService\.(list|create|update|delete)Brand"` vazio.

### 3. Componentes reutilizáveis
- [x] `components/ui/CreatableCombobox.tsx`:
  - input `h-9 text-sm font-normal`, busca sem acento, até 50 resultados;
  - última opção `+ Cadastrar "X"`, teclado ↑ ↓ Enter Esc;
  - lista por **portal fixed** (como `FilterPopover.tsx`), para não ser cortada no Sheet;
  - Esc com `stopPropagation`, para fechar só a lista;
  - valor legado sem id exibido com o hint "não vinculado ao catálogo".
- [x] `components/catalog/BrandModelPicker.tsx`:
  - marca e modelo em cascata, com `organizationId: string` não nulo e `itemTypes`/`defaultItemType`;
  - "Cadastrar" chama `findOrCreate*` na org do registro;
  - `onChange(valor, modelo)` devolve o modelo para o autopreenchimento;
  - mostra part number e o link "Ficha técnica ↗";
  - sem org, o campo fica desabilitado com "Escolha a organização proprietária" (nada de `if (!org) return`).

  **Pronto:** `__tests__/components/BrandModelPicker.test.tsx` verde, cobrindo cadastrar, não duplicar, modelo travado sem marca e Esc. `check-ui-standard.sh` nos dois arquivos (o `useState` da busca é a exceção §3.1, citada).
- [x] `docs/ui_ux_guia_unificado.md` nova **§7.1.2 "Campo de catálogo criável"** (anatomia, portal, Esc, "a org do registro decide", "nunca bloqueia", caso do lote) + uma linha em `UI_PATTERNS.md` §5.3. **Pronto:** seção commitada (REGRA #1 item 4).

### 4. Configurações do Sistema
- [x] `components/Settings.tsx`: nó "Marcas e Modelos" (ícone `Tags`) com as folhas `catalogo-marcas` e `catalogo-modelos`. Estender `SettingsLeafId` (L23-27) e as linhas de render (L454-472). **Pronto:** as duas folhas abrem.
- [x] `components/settings/BrandsSettings.tsx`:
  - `StandardTable` (§6.10) com Nome · Modelos · Em uso · Situação · Organização (só em "Todas") · Ações;
  - `Sheet size="sm"` com `dirty`;
  - criar com `resolveWriteOrg('all-allowed')` + `forEachTargetOrg`;
  - excluir só sem uso, via `useConfirm`, e no resto Inativar;
  - "Ver modelos" troca de folha com filtro;
  - §22: atualiza o estado local.
- [x] `components/settings/ProductModelsSettings.tsx`:
  - colunas Marca · Modelo · Tipo · Part number · Categoria padrão · Vida útil padrão · Ficha · Em uso · Situação · [Org] · Ações;
  - filtros Tipo e Marca (`FilterPopover`).
- [x] `components/settings/ProductModelSheet.tsx`:
  - `size="lg"` com malha §30, especificação em `col-span-2`;
  - a org vem da marca, sem `resolveWriteOrg`;
  - em "Todas", a marca aparece como "Marca · Org" quando o nome se repete.

  **Pronto:** `__tests__/components/BrandsModelsSettings.test.tsx` (molde `PortalHelpSettings.test.tsx`) verde, cobrindo:
  - "Todas" cria nas 2 orgs;
  - modelo não chama `resolveWriteOrg`;
  - coluna Organização só em "Todas";
  - `useConfirm` ao excluir.

  `check-ui-standard.sh` nos 4 arquivos.

### 5. Gestão de Ativos › Ativos Patrimoniais
- [x] `components/OpuraAssetsModule.tsx`:
  - **Sai:** estado e handlers de marca (L490-495, L580-591, L618-620, L644-690), botão "Gerenciar" (L2465-2477) e modal L2871-2968.
  - **Entra:** `BrandModelPicker` no grid (Marca · Modelo · Nº de série), sem `material`. A org é `activeOrganizationId ?? assetForm.organization_id`, ou `asset.organization_id` na edição; trocar a org zera os ids.
  - **Autopreenchimento:** mapa de origem para `category` e `useful_life_months`. Em novo é `padrao`; em edição é `manual` se houver valor, `vazio` se null. Para isso `formularioDoAtivo` (L1326) deixa de fazer `|| 60` antes de registrar a origem, e os onChange manuais marcam `manual`. Mostra o hint "Preenchido pelo modelo X".
  - **Salvar** (L744-784): `resolverMarcaModelo` + ids e textos.

  **Pronto:** tsc limpo, `check-ui-standard.sh`, e `rg isBrandManagerOpen` vazio.
- [ ] `components/AssetImportModal.tsx` L427-453: o laço de `createBrand` vira `findOrCreateBrand` por marca distinta e `findOrCreateModel` por par, com o tipo derivado da categoria. Os inserts levam os ids. **Pronto:** tsc, e na tela uma planilha com marca nova cria e vincula a marca.

### 6. Comercial › Condomínios › Ativos do edifício (rebase antes)
- [x] `services/buildingAssetService.ts`: `brand_id, model_id` em `ASSET_COLS`, `BuildingAsset` e no payload de `create`/`update`/`updateMany`. **Pronto:** tsc.
- [x] `components/condominio/AtivosTab.tsx`:
  - `FormAtivo`, `formVazio` e `formDoAtivo` com os ids (o Duplicar copia);
  - inputs L635-650 viram picker (`equipamento|componente|outro`, org = `empreendimento.organization_id`);
  - `salvar` chama `resolverMarcaModelo`.

  **Pronto:** tsc + `check-ui-standard.sh`.
- [x] `components/condominio/AtivosEdicaoEmLoteSheet.tsx` L175-176: um campo "Marca e modelo" com Não alterar/Definir (picker)/Limpar. O patch leva os 4 campos. **Pronto:** tsc + `check-ui-standard.sh`.

### 7. Almoxarifado (materiais)
- [x] `types/inventory.ts` (`StockItem` L288, `CreateStockItemInput` L307, `StockItemImportRow` L322): `brandId?`, `modelId?`, `brand?`, `model?`.
- [x] `services/inventoryService.ts`: `STOCK_ITEM_COLS`, `mapStockItem`, `upsertStockItem`, `importStockItems`.
- [x] `components/inventory/StockItemSheet.tsx`: picker entre Descrição e Categoria (`material|componente|ferramenta|outro`, default `material`); o salvar resolve os ids.
- [x] `components/inventory/StockItemsTab.tsx` + `InventoryModule.tsx`: coluna "Marca / modelo" e busca por ela.
- [x] `utils/assetToStockItemRow.ts`: propaga ids e textos; a descrição "Nome — Marca Modelo" não muda.

**Pronto:** `__tests__/assetToStockItemRow.test.ts` atualizado e verde, tsc, e `check-ui-standard.sh` nos tsx.

### 8. Fechamento
- [x] Suíte: `npx tsc --noEmit -p .` (exit lido por grep) + `npx vitest run` (conferir `Errors` além do JSON), incluindo `orgContextGuard` (o BASELINE não cresce). **Pronto:** os dois verdes.
- [x] Verificação na tela (skill `rodar-app`, com a org específica **e** com "Todas"):
  1. Criar uma marca em "Todas" e conferir que replicou.
  2. Criar um modelo com padrões.
  3. Num ativo novo, digitar uma marca inexistente, usar "Cadastrar" e ver a marca selecionada.
  4. Escolher o modelo e conferir categoria e vida útil preenchidas.
  5. Editar a vida útil à mão, trocar de modelo e conferir que o valor manual ficou.
  6. Renomear a marca e conferir que a lista de ativos mostra o nome novo.
  7. Condomínio: picker e edição em lote.
  8. Portal do Cliente › Equipamentos ainda mostra a marca.
  9. Almoxarifado: item com marca, e importação da Gestão de Ativos traz a marca.
  10. Apagar os dados de teste gravados.

  **Pronto:** zero erro de JS/console e nenhum 4xx/5xx do PostgREST. O checklist de aplicação do guia vai item a item no relatório (dizendo o que não se aplica).
- [x] Publicar:
  - `git rebase origin/main`, suíte de novo, `git push origin HEAD:main`;
  - ler o check-run `ci`;
  - `bash scripts/publicar-producao.sh` e `bash scripts/conferir-producao.sh "Marcas e Modelos"`;
  - aplicar a migration `…000200`;
  - `bash scripts/fechar-frente.sh marcas-modelos`.

  **Pronto:** SHA no bundle servido e o plano com todos os itens `[x]` ou "N de M".

## Estado — 13/10/2026

**Itens: 29 de 30.** Em aberto: a importação de ativos POR PLANILHA não foi
exercitada na tela (tsc ok; o caminho é o mesmo `resolverMarcaModelo` provado nas
outras três telas, mas sem prova própria).

Publicado em 13/10/2026: `913a0f6f` (banco + catálogo + Configurações + Gestão de
Ativos) e `90fb8e8b` (Condomínio, Almoxarifado, guia, correções da tela).
`conferir-producao.sh "Marcas e Modelos"`: o domínio serve exatamente `90fb8e8` e o
texto está no bundle. Check-run `ci` do commit: **success**.

Depois do deploy: `aplicar_20271013000200` aplicada — INSERT em `opura_asset_brands`
como `authenticated` recusado com **42501** (provado em transação), SELECT continua.
`check-rls-postura.sh`: limpa nas 9 verificações.

Pendência de acompanhamento (não é item desta entrega): DROP de `opura_asset_brands`
a partir de 20/10/2026, se nada reclamar do congelamento.

### Diagnóstico do banco (item 0.2, só leitura)
- PostgreSQL **17.6** → `ON DELETE SET NULL (coluna)` disponível, FK composta mantida.
- `opura_assets`: **nenhum** gatilho não interno; `stock_items`: `trg_stock_items_generate_code`
  e `trg_stock_items_updated_at`. Nenhuma das duas está em publicação de Realtime.
- 88 ativos; 3 com marca em texto (DeWalt, Elevacon, Menegotti — todos da Alpa); 0 com
  modelo; `length(brand) > 100` = 0; a única linha de `opura_asset_brands` (DeWalt) é de
  org existente.

### Migration `aplicar_20271013000100` (aplicada em 13/10)
- Pós-check: 88 ativos intactos, `marca_sem_id = 0`, DeWalt manteve o id antigo
  (`f9ee3bdd…`), 4 gatilhos e 2 policies no lugar.
- `scripts/prova-marcas-modelos.sql`: **PROVA_OK — 7 grupos de asserts** (renomear
  propaga a ativo e item; FK cross-org rejeitada; modelo de outra marca: a marca segue o
  modelo / trocar a marca solta o modelo; texto do lote revincula e texto livre
  desvincula; excluir modelo mantém o texto; marca com modelo não se exclui; mover modelo
  de marca leva os ativos; INSERT só com texto vincula e não cria). Nada gravado.
- `segurancaMigrations` + `migrationsPrefixo` verdes.

### Suíte
- `tsc --noEmit`: 0 erros (lido por grep). Vitest completo: **875 arquivos, 8.844
  testes, 0 falhas, 0 "Errors"**. Testes novos: `catalogoNome`, `catalogoAutopreencher`,
  `brandModelService`, `components/BrandModelPicker` (8), `components/BrandsModelsSettings` (6);
  `assetToStockItemRow` ampliado.
- `check-ui-standard.sh`: 0 violação em todos os .tsx tocados. `AssetImportModal.tsx`
  tinha violações ANTIGAS de §7/§8 na tabela de prévia (font-bold/pílula) — corrigidas
  (tabela em modal §6.9, status em texto §8) e ganhou a coluna Marca / modelo.

### Verificação na tela (rodar-app, servidor da frente :3117, conta agente-leitura)
Org Alpa, com escrita de dados `ZZTeste*` autorizada pelo usuário; tudo apagado no fim
e conferido no banco (0 restantes, 88 ativos, catálogo = DeWalt/Elevacon/Menegotti).
- Configurações › Marcas: criar → toast "Marca criada", linha nova; "Em uso" mostra
  "1 ativo" nas marcas migradas. Modelos: criar com tipo, part number, categoria
  padrão, vida útil 36 e ficha técnica.
- Gestão de Ativos: escolher o modelo preencheu **categoria = Ferramenta e vida útil = 36**,
  com o aviso "Categoria e vida útil preenchidas pelo modelo ZZT-100"; vida útil digitada
  (50) + trocar de modelo (ZZT-200 cadastrado na hora) e voltar → **ficou 50**. Banco:
  `category=ferramenta`, `useful_life_months=50`, ids ligados.
- Renomear a marca em Configurações → `opura_assets.brand` = nome novo no banco. (A lista
  da Gestão de Ativos abre em GRADE, que não mostra marca — a prova é a do banco.)
- Condomínio › Bella Vista › Ativos: marca escolhida do catálogo + modelo só digitado →
  cadastrado ao salvar (`item_type=equipamento`).
- Almoxarifado › Itens: marca só digitada → cadastrada ao salvar, mesma org; coluna
  "Marca / modelo" na lista.
- Topo em "Todas" (só leitura): coluna Organização nas duas folhas; **10 consultas ao
  catálogo, 0 com `organization_id=eq.`**. "Cadastrar ativo" já nascia desligado em
  "Todas" antes desta mudança (comportamento antigo, fora do escopo).
- Zero erro de JS/console e zero 4xx/5xx do PostgREST em todas as etapas.

**Defeitos achados na tela e corrigidos:**
1. Tab saindo do campo deixava a lista do combobox aberta por cima do formulário —
   `onBlur` agora fecha; teste novo reprova sem a correção (provado com stash).
2. Modelos com 9 colunas: "Ações" nascia fora da vista — categoria/vida útil padrão
   começam ocultas (engrenagem de colunas), soma ~950px.

### Checklist de aplicação do guia (REGRA #1.3) — telas novas de Configurações
- Imports TableUtils/StandardTable ✅ · Cabeçalho §20: segue o card + `h2` das folhas
  irmãs de Configurações (a tela-mãe tem o `h1`) ✅ · COLUMNS fora do componente ✅ ·
  busca persistida (StandardTable) ✅, filtro Tipo persistido; filtro Marca é estado do
  `Settings` (vem de "Ver modelos") · KPI cards: **não se aplica** (catálogo, sem
  métrica) · Toolbar acoplada §5.2 + FilterPopover §5.4 ✅ · SortableHeader ✅ ·
  Redimensionar/autofit (StandardTable) ✅ · TDs `text-sm font-normal`, py-2.5, px-6,
  border-r ✅ · campos inline em TD: **não há** · Status em texto colorido §8 ✅ · Ações
  com ActionIconButton, desligado diz o motivo ✅ · Loading/Empty ✅ · Toast ✅ ·
  `useConfirm` ✅ · §22 estado local ✅ · §25: formulário curto, criar e editar fecham
  (não é multi-aba) · Drawer §26 = `Sheet` ✅ · §27 identificador: **não se aplica** ·
  §30 malha no Sheet de modelo ✅ · Gráficos §28: **não se aplica** · grade/lista:
  **não se aplica**.

## Fase 2 — fundir Modelos dentro de Marcas (pedido posterior de 13/10)

- [x] `components/Settings.tsx`: "Marcas e Modelos" vira folha ÚNICA (sem filhos); sai o filtro "Ver modelos". **Pronto:** a árvore não tem mais "Modelos" (conferido na tela: 0 botões "Modelos").
- [x] `components/settings/ProductModelsSettings.tsx` e `ProductModelSheet.tsx`: **removidos** (lista de modelos separada e painel próprio).
- [x] `components/settings/ProductModelForm.tsx` (novo): formulário do modelo que vive DENTRO do painel da marca (devolve `SheetPanel` + `SheetFooter`; a marca é fixa, a org é a dela). **Pronto:** tsc + check-ui.
- [x] `components/settings/BrandsSettings.tsx`: lista de marcas (coluna Modelos = contagem; busca acha a marca pelo nome do modelo); painel `2xl` com a seção "Modelos (N)" — tabela `dense` com busca escopada pela marca, "Novo modelo", editar/excluir; o painel troca para o formulário do modelo com "← marca" e volta. Marca nova numa org só vira a edição dela ("cadastre os modelos abaixo"); replicada em N orgs, fecha e avisa. **Pronto:** `__tests__/components/BrandsModelsSettings.test.tsx` (10) verde.
- [x] Verificação na tela (:3118, Alpa, dados ZZTeste apagados e conferidos): criar marca → painel vira edição → "Novo modelo" → criar → volta à marca com "Modelos (1)" → lista mostra 1. Zero erro de JS/console/HTTP. **Achados e corrigidos na tela:** (1) tabela de modelos cortava "Tipo" e encostava "Ações" → colunas ~580px, "Em uso"/vida útil ocultas por padrão; (2) o toast do canto cobria "Fechar/Salvar" do painel → com o painel aberto o aviso vai no rodapé (`role=status`); (3) o temporizador do aviso anterior apagava o seguinte → um temporizador por vez.
- [x] Suíte: tsc 0 erros; Vitest 875 arquivos / 8.849 testes verdes.
- [ ] Publicar (push em main + conferir-producao + CI) e fechar a frente `marcas-modelos-fundir`.

## Riscos
- Lock da FK em `opura_assets` com o módulo aberto: `lock_timeout` e repetir se der 40P01.
- `useful_life_months` vem com 60 por padrão e há o `|| 60`: sem o mapa de origem, o autopreenchimento sobrescreve ou nunca preenche.
- Duplicata por acento ("Mitsubíshi"): o UNIQUE não pega, só `deveOferecerCadastro` na UI.
- Renomear uma marca altera o `updated_at` dos itens do almoxarifado (efeito aceito).
- Pendência para depois: dropar `opura_asset_brands` uma semana após o congelamento.
