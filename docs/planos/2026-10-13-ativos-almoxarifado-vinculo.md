# Ativos patrimoniais ↔ Almoxarifado: vínculo real, sincronia e caminho de volta

## Pedido original

> Sessão 3be6bf12-b300-4f07-8c44-5f5b33ef403b · 13/10/2026
>
> 1. corrigir: importar de novo um ativo que já está no catálogo, com almoxarifado de destino, lança mais 1 UN de saldo. O cadastro do item é só atualizado, mas a entrada é criada outra vez. Resultado: um bem unitário pode aparecer com saldo 2, 3… Se quiser, a correção é só lançar saldo para item recém-criado.
>
> 2. Implementar:
> 2.1. Não há vínculo permanente no banco: só o código patrimonial liga um ao outro.
> 2.2 Depois da importação nada se sincroniza. Editar, baixar ou mover o ativo não altera o item nem o saldo do almoxarifado.
> 2.3 A aba Retirada (entrega e devolução à obra) não mexe no estoque. Os dois controles são independentes.
> 2.4 O caminho contrário (item do almoxarifado virar ativo) não existe.

Pedido anterior na mesma sessão, que originou a avaliação citada acima:

> 3. Verificar a conexão entre Gestão de Ativos > ativos patrimoniais e suprimentos < almoxarifado e informar

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 13/10/2026 | Quais ativos passam a existir no almoxarifado? | Só os vinculados (importação ou "Guardar no almoxarifado") |
| 13/10/2026 | Entregar à obra pela Retirada / movimentar faz o quê no estoque? | Saída do almoxarifado; devolução = entrada de volta nele |
| 13/10/2026 | Como item do almoxarifado vira ativo? | Escolhe quantas unidades; cada uma vira ativo com código próprio e saldo 1; saem N UN do item original |

## Estado

- [x] 1. Reimportar não duplica saldo — `StockItemImportModal`: saldo inicial só para item `created`; linha de ativo vincula em vez de lançar
- [x] 2. Migration — `aplicar_20271013160000_ativos_almoxarifado_vinculo.sql` aplicada em 13/10/2026 (`db query -f`); conferido no banco: 3 colunas, 4 gatilhos, 1 ativo vinculado pelo backfill, 0 movimentos lançados, `anon` sem EXECUTE na RPC
- [x] 3. Vincular ativo → almoxarifado — `assetService.guardarNoAlmoxarifado`, ação no ⋮ + painel, coluna "Almoxarifado", aba Ativos do importador marca o já guardado
- [x] 4. Editar sincroniza — gatilho; campo Código travado (com motivo) para ativo vinculado
- [x] 5. Baixar/Reativar ativo — ⋮ com `useConfirm`; desligado com motivo quando está numa obra
- [x] 6. Retirada/Movimentar mexem no estoque — gatilho; `required` removido do destino do Movimentar (Sede voltou a ser escolhível)
- [x] 7. Item → ativo — RPC `fn_patrimoniar_item_de_estoque` + `PatrimoniarItemSheet` + botão no catálogo de itens
- [x] 8. Plano e memória
- [x] 9. Verificação (publicação conferida no fechamento):
  - [x] banco: `scripts/teste-ativos-almoxarifado-vinculo.sql` (25 asserções, BEGIN…ROLLBACK) passou com a migration dentro da transação, ANTES de aplicar. A re-rodada contra o schema já aplicado foi bloqueada pelo classificador de permissões da sessão
  - [x] Vitest: `ativosAlmoxarifadoVinculo.test.ts` novo + guardas; suíte inteira 8918 ✓ + 34 pulados + 2 timeouts em `PainelVersoes` (26/26 isolado) = 8954
  - [x] `tsc` 0 erros; `verificar:build` ok; `check-ui-standard` limpo nos arquivos tocados (o aviso §3 do importador é a exceção §3.1 já documentada)
  - [x] tela de verdade (Playwright, `c:/tmp/pwtest/ativos-almox-vinculo.mjs`, org Alpa, escrita autorizada em 13/10/2026): guardar → 1 UN e coluna "Almoxarifado Central"; reabrir com o mesmo almoxarifado deixa o botão desligado; Movimentar para obra → 0, de volta à Sede → 1; baixar → 0, reativar → 1; 5 movimentos `in · out · in · adjust_out · adjust_in`; catálogo mostra "Ativo patrimonial"; transformar 1 de 2 UN → item fica com 1 e o ativo novo nasce com 1 UN no Almoxarifado Central. Zero erro de página. Limpeza conferida no banco: 0 ativos, itens, movimentos e saldos de teste
  - [x] publicação

## Contexto

A avaliação de 13/10/2026 mostrou que a única ponte entre Gestão de Ativos e
Almoxarifado é a aba "Gestão de Ativos" do Importar Itens: copia o ativo para
`stock_items` uma vez (código patrimonial = `input_code`, sem FK) e pode lançar
1 UN. Depois disso nada conversa, e reimportar lança saldo de novo (bem unitário
com saldo 2, 3…). O usuário pediu: (1) corrigir a duplicação; (2) vínculo
permanente, sincronia em editar/baixar/mover, aba Retirada mexendo no estoque e
item do almoxarifado virando ativo.

Decisões do usuário (13/10/2026, AskUserQuestion):
- **Só ativos vinculados** entram no almoxarifado (importação ou ação "Guardar no
  almoxarifado"); elevador/imóvel ficam de fora.
- **Entregar à obra = saída** do almoxarifado onde o bem mora; **devolver = entrada**
  de volta nele.
- **Item → ativo escolhendo quantas unidades**: N unidades viram N ativos, cada um
  com código próprio e saldo 1; saem N UN do item original.

Passo 0 (REGRA #6 e #8): `bash scripts/nova-frente.sh ativos-almoxarifado-vinculo`
e copiar este plano para `docs/planos/2026-10-13-ativos-almoxarifado-vinculo.md`
com `## Pedido original` transcrito literalmente (as duas mensagens do usuário).
Ler `docs/ui_ux_guia_unificado.md` inteiro e `UI_PATTERNS.md` antes de tocar tela.

## Desenho: o banco reconcilia estado, não soma eventos

A causa do bug 1 é "lançar movimento a cada evento". A sincronia não pode repetir
o erro, e o ativo é escrito por vários caminhos (`assetService.update`,
`createMovement`, `startReservation`, `finalizeReservation`, Condomínio). Por isso a
sincronia mora **no banco, como reconciliação idempotente**:

- Saldo **desejado** do ativo vinculado = 1 UN em `opura_assets.warehouse_id` se
  `status <> 'baixado'` e `current_project_id IS NULL` (está "em casa"); senão 0.
  Manutenção não tira o bem do almoxarifado. `warehouse_id` nulo = não guardado:
  a função não mexe em saldo.
- `fn_reconciliar_estoque_do_ativo(asset_id)` lê `stock_balances` do `input_code`
  do item em todos os almoxarifados da org e lança só a diferença. Rodar duas
  vezes não lança nada na segunda; esse é o critério que mata a classe do bug 1.
- O tipo do movimento sai do motivo: obra → `out` ("Retirada do ativo para a obra X");
  volta → `in` ("Devolução do ativo da obra X"); `baixado` → `adjust_out` ("Baixa do
  ativo"); troca de almoxarifado → `transfer_out`/`transfer_in`; primeiro vínculo →
  `in` com `unit_cost = purchase_value` ("Saldo inicial do ativo").

## Itens

### 1. Reimportar não duplica saldo
- **O que muda:** em `components/inventory/StockItemImportModal.tsx` (~linha 301),
  o loop só lança `createMovement` quando `r.status === 'created'`. A prévia diz
  "Já existe: sem saldo novo" nas linhas existentes, e a frase "N de M trazem
  quantidade → entram em X" passa a contar só os novos. Vale para toda origem
  (planilha, catálogo, orçamento): é "saldo inicial". Na aba Ativos, o saldo passa
  a vir do item 3 (vínculo + reconciliação), não deste loop.
- **Pronto quando:** importar o mesmo ativo/planilha 2× com destino deixa saldo 1
  (teste de banco do item 9 + tela).

### 2. Migration: vínculo e rastreio
`supabase/migrations/aplicar_<próximo prefixo>_ativos_almoxarifado_vinculo.sql`,
aplicada com `npx supabase db query --linked -f` (nunca `db push`). Conteúdo:
- `opura_assets.stock_item_id uuid REFERENCES stock_items(id) ON DELETE SET NULL`,
  com índice único parcial (um item ↔ um ativo).
- `opura_assets.warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL`.
- `stock_movements.asset_id uuid REFERENCES opura_assets(id) ON DELETE SET NULL`:
  rastreio na aba Movimentos.
- `fn_reconciliar_estoque_do_ativo`, SECURITY INVOKER (RLS de membro vale nas duas
  tabelas). Valida que item, almoxarifado e ativo são da mesma org e dá RAISE
  claro se não forem.
- Gatilho AFTER INSERT/UPDATE OF `status, current_project_id, warehouse_id,
  stock_item_id` em `opura_assets` chama a função.
- Gatilho AFTER UPDATE OF `name, brand, model, brand_id, model_id, category,
  purchase_value` espelha no item: descrição "Nome — Marca Modelo", categoria
  rotulada, `unit_cost_hint`, marca/modelo. O CASE de rótulos em SQL tem teste que
  o compara com `ASSET_CATEGORY_LABELS` (item 9).
- BEFORE UPDATE OF `code`: recusa trocar o código de ativo vinculado (o código do
  item é imutável, `inventoryService.upsertStockItem`).
- BEFORE DELETE em `opura_assets`: zera o saldo (`adjust_out`, "Ativo excluído")
  e desativa o item.
- BEFORE INSERT em `stock_movements`: recusa movimento de item vinculado sem
  `asset_id` ("Este item é o ativo X. Movimente pela Gestão de Ativos"). Fecha a
  saída manual, a requisição e a transferência que dessincronizariam o bem.
- Backfill: o item `source='ativos'` que já existe (1 hoje, 0 órfãos) recebe
  `stock_item_id`; `warehouse_id` = almoxarifado onde há saldo > 0.
- REGRA #7: toda função nova leva `REVOKE … FROM PUBLIC, anon` + `GRANT …
  authenticated` na mesma migration; perguntas 1 e 2 respondidas no cabeçalho.
- **Pronto quando:** `__tests__/segurancaMigrations.test.ts` verde, migration
  aplicada, colunas lidas no banco (`information_schema`) e backfill conferido por
  SELECT.

### 3. Vincular ativo → almoxarifado (2.1)
- **O que muda:**
  - `services/assetService.ts` ganha `guardarNoAlmoxarifado(asset, warehouseId)`:
    upsert do item via `assetToStockItemRow` + `inventoryService.upsertStockItem`
    (reuso), depois `update` de `stock_item_id` + `warehouse_id`. O saldo vem do
    gatilho.
  - Em `OpuraAssetsModule.tsx`: ação "Guardar no almoxarifado" / "Trocar
    almoxarifado" no ⋮ (`acoesSecundariasDoAtivo`), abrindo um Sheet com os
    almoxarifados **da org do ativo** (memória: lista ≠ org de gravação).
  - Nova coluna "Almoxarifado" na tabela: nome, ou "—" quando não guardado.
  - Na aba Ativos do `StockItemImportModal`: com destino escolhido, importar chama
    o mesmo `guardarNoAlmoxarifado`; sem destino, só vincula o item. A tabela marca
    o ativo já vinculado ("No almoxarifado X").
  - `types/assets.ts` ganha `stock_item_id`, `warehouse_id` e `location`.
- **Pronto quando:** guardar um ativo cria o item e 1 UN uma vez só; guardar de
  novo não muda nada.

### 4. Editar sincroniza (2.2)
- **O que muda:** nada no cliente: o gatilho do item 2 espelha nome, marca/modelo,
  categoria e valor. O campo Código fica desabilitado para ativo vinculado, com o
  motivo no `title` (memória: botão desligado diz por quê).
- **Pronto quando:** editar o nome do ativo muda a descrição do item no
  Almoxarifado sem F5 manual do banco (teste de banco + tela).

### 5. Baixar ativo (2.2): hoje não existe
- **O que muda:** ação "Baixar ativo" no ⋮ com `useConfirm` (§14). Grava
  `status='baixado'` (`assetService.baixar`) e o gatilho tira a 1 UN. Ativo
  baixado mostra "Reativar" (volta a `disponivel`, e a UN volta se estiver guardado).
  Bloqueada com motivo quando o bem está numa obra ("Registre a devolução antes").
- **Pronto quando:** baixar → saldo 0 com `adjust_out`; reativar → saldo 1.

### 6. Retirada e Movimentar mexem no estoque (2.3)
- **O que muda:** nada no service: `startReservation`/`finalizeReservation`/
  `createMovement` já gravam `current_project_id`, e o gatilho faz a saída e a
  entrada. Também corrijo o modal Movimentar (`OpuraAssetsModule.tsx` ~2592): o
  `<select required>` com a opção Sede de valor `""` impede devolver à sede, então
  tiro o `required`.
- **Pronto quando:** Entregar → `out` de 1 UN com `asset_id`; Devolver → `in`;
  Movimentar para a Sede funciona.

### 7. Item do almoxarifado vira ativo (2.4)
- **O que muda:**
  - RPC `fn_patrimoniar_item_de_estoque(p_item_id, p_warehouse_id, p_quantidade,
    p_categoria, p_vida_util_meses, p_valor_unitario, p_nome)` numa transação:
    valida saldo ≥ quantidade, lança `adjust_out` da quantidade no item original
    ("Patrimoniado em N ativos"), cria N `opura_assets` (código `OPR-PAT-xxxxxx`
    com nova tentativa se colidir no UNIQUE), N `stock_items` `source='ativos'` e
    vincula cada um, e o gatilho lança 1 UN de cada.
  - Fica na mesma migration do item 2 (ou numa irmã), com REVOKE/GRANT.
  - Serviço: `inventoryService.patrimoniarItem`.
  - UI: terceiro `ActionIconButton` "Transformar em ativo patrimonial" em
    `components/inventory/StockItemsTab.tsx` (~138). Sheet com almoxarifado (só os
    com saldo do item), quantidade (máx. = saldo), categoria (`ASSET_CATEGORIES`),
    vida útil, valor unitário (padrão: custo médio do saldo) e nome (padrão:
    descrição).
  - Desabilitado com motivo para item já vinculado a ativo ou sem saldo.
  - `SOURCE_LABELS` mostra "Ativo patrimonial" para item vinculado.
- **Pronto quando:** item com 3 UN, patrimoniar 2 → item original 1 UN, dois
  ativos novos com 1 UN cada, tudo ou nada se algo falhar.

### 8. Plano e memória
- **O que muda:** o plano em `docs/planos/` é atualizado item a item. A memória
  `project_almoxarifado_importar_ativos.md` registra o modelo (reconciliação no
  banco, gatilho que trava movimento manual).
- **Pronto quando:** os dois arquivos refletem o que foi publicado.

### 9. Verificação
- **Banco:** script SQL em transação (`BEGIN … ROLLBACK`, com asserções por
  `RAISE EXCEPTION`, porque `db query` só devolve o último resultado). Cobre:
  - guardar 2×;
  - reimportar 2×;
  - entregar e devolver;
  - trocar de almoxarifado;
  - baixar e reativar;
  - editar o nome;
  - movimento manual recusado;
  - patrimoniar 2 de 3;
  - patrimoniar mais do que o saldo, recusado sem efeito parcial.
- **Vitest:**
  - `assetToStockItemRow.test.ts` continua verde;
  - teste novo que lê a migration e compara o CASE de rótulos com
    `ASSET_CATEGORY_LABELS`;
  - `orgContextGuard` e `segurancaMigrations`;
  - suíte inteira com a conta fechando;
  - `npm run verificar:build`.
- **UI:** `bash scripts/check-ui-standard.sh` em `OpuraAssetsModule.tsx`,
  `StockItemsTab.tsx`, `StockItemImportModal.tsx` e no Sheet novo. Relatório final
  lista os itens do CHECKLIST DE APLICAÇÃO.
- **Tela de verdade** (harness Playwright, `index_harness_navegador.md`), na org
  Alpa: guardar um ativo, entregar e devolver pela Retirada, conferir Saldos e
  Movimentos, baixar, patrimoniar 1 UN de um item. **Apagar tudo o que for gravado
  no teste.**
- **Publicação:** push em `main`, `conferir-producao.sh "Transformar em ativo
  patrimonial"`, check-run `ci` lido, depois `fechar-frente.sh`.

## Fora deste plano (registrar no doc)
- O código patrimonial aleatório (`OPR-PAT-` + 6 dígitos, gerado no cliente) pode
  colidir no UNIQUE. A RPC já tenta de novo; o formulário de ativo segue como está.
- `stock_movements` sem gatilho em UPDATE/DELETE (saldo pode divergir se alguém
  editar o razão) é dívida antiga do almoxarifado, não deste pedido.
