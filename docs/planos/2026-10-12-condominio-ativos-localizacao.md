# Condomínio › Ativos do edifício: coluna "Localização" + drawer de edição

## Pedido original

Sessão `b1a5373a`, 12/10/2026:

> na aba Ativos do edifício, crie uma coluna chamada Localização, com campo de texto livre para indentificar aonde o ativo esta localizado

Respostas às perguntas de esclarecimento (mesma sessão):
- Equipamentos já cadastrados (a aba não tinha edição) → **"Criar drawer de edição"**
- Mostrar também no Portal do Cliente → **"Sim, mostrar no portal"**

## Contexto

A aba Ativos (`components/condominio/AtivosTab.tsx`) lista `opura_assets` do
empreendimento e só **criava e excluía**. Um campo só no cadastro deixaria os
equipamentos existentes para sempre sem localização. `opura_assets` não tinha coluna
de localização (`tracking_code` é rastreio do módulo de Bens; `current_project_id` é a
obra do bem de canteiro). `buildingAssetService.update()` existia sem uso.

## Itens

### 1. Migration — coluna `location` ✅
`supabase/migrations/aplicar_20271012000010_opura_assets_location.sql`: `ADD COLUMN IF
NOT EXISTS location text` + comentário. Aplicada com `db query --linked -f`.
**Pronto quando:** `information_schema.columns` mostra `opura_assets.location text`.
→ Conferido em 12/10: `text`.

### 2. Migration — RPC do portal leva `localizacao` ✅
`aplicar_20271012000020_condominio_portal_ativo_localizacao.sql`. Corpo tirado do
`pg_get_functiondef` do banco (md5 `14143575c586f4478b030b0eca9744ef`, igual à
`aplicar_20270924000050`), não do arquivo. Única mudança: `'localizacao', a.location`.
REVOKE + COMMENT junto (REGRA #7).
**Pronto quando:** o diff contra a definição do banco é só essa linha; a função
devolve `localizacao`; `segurancaMigrations.test.ts` passa.
→ Diff de 1 linha conferido; aplicada; ACL `{postgres=X, service_role=X}`.

### 3. Service — `services/buildingAssetService.ts` ✅
`location` em `ASSET_COLS`, em `BuildingAsset` e no payload de `create`.
**Pronto quando:** tsc passa.

### 4. Tela — `components/condominio/AtivosTab.tsx` ✅
- Coluna "Localização" depois de "Sistema": `COLUMNS`, `SortableHeader`, `<td>`
  (`'—'` vazio), ordenação e busca.
- Drawer único para criar e editar (`editando`). "Editar" é `ActionIconButton
  kind="edit"` na coluna Ações (§9.2) — o plano de sessão dizia item de menu; o guia
  manda ícone para ação secundária, e o excluir continua no menu.
- Edição: título "Editar equipamento" + código; botão "Salvar alterações" desabilitado
  sem alteração (com `title` dizendo por quê); `dirty` no `Sheet` + guarda própria no
  X/Voltar (§25); atualiza só a linha (§22).
- Rascunho do cadastro novo guardado à parte: editar não vaza para o próximo "Novo
  equipamento", e sistema/marca/data seguem sobrevivendo entre cadastros como antes.
- Malha §30 aplicada ao formulário (pares `space-y-1.5`, grade `gap-x-6 gap-y-4`,
  campos curtos em duas colunas).
- `_dias_garantia` do item recém-salvo passa a vir de `diasAte()` (data pura) em vez de
  `Date.parse` (UTC — errava 1 dia conforme a hora).
**Pronto quando:** `check-ui-standard.sh` exit 0, tsc passa, verificação no app.

### 5. Portal — `services/clientPortalService.ts` + `components/client/CondominioTab.tsx` ✅
Tipo ganha `localizacao`; ficha (bloco Identificação) ganha `CampoFicha "Localização"`.
**Pronto quando:** tsc passa e a ficha mostra o valor.

## Verificação

Registrada no relatório da sessão (tsc, check-ui-standard, vitest de segurança e de
org, banco, app).
