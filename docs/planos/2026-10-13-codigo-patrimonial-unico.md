# Código patrimonial único e sequencial (com renumeração dos existentes)

## Pedido original

> Sessão 3be6bf12-b300-4f07-8c44-5f5b33ef403b · 13/10/2026
>
> o numero patrimonial deve ser unico (Ficou de fora: o código patrimonial continua sendo um número aleatório gerado no navegador, com pequena chance de colidir com outro já existente. Só a transformação de item em ativo tenta outro número quando isso acontece.)
> proponha um plano para correcao

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 13/10/2026 | Único em que escopo? | Por organização |
| 13/10/2026 | Como numerar? | Renumerar todos (etiquetas impressas deixam de bater) |

## Estado

- [x] 1. Gerador atômico e unicidade normalizada — `aplicar_20271013170000_codigo_patrimonial_unico.sql`, aplicada em 13/10/2026
- [x] 2. Renumeração — ensaio em BEGIN…ROLLBACK passou; aplicada: 84 ativos → OPR-PAT-000001…000084, 0 fora da série, 84 com `codigo_anterior`, item vinculado acompanhou (000036), índice `uq_opura_assets_codigo_org` criado. Tabela `opura_assets_renumeracao_20271013` — NÃO APAGAR
- [x] 3. Frontend sem gerador no navegador (`e161f42f`) — cadastro, importação e Condomínio mandam código vazio; 23505 vira frase; busca e tooltip pelo código anterior
- [x] 4. Testes — `codigoPatrimonialUnico.test.ts` (trava contra gerador no navegador); `scripts/teste-codigo-patrimonial.sql` e `teste-ativos-almoxarifado-vinculo.sql` passaram sobre a migration; suíte 9007 ✓ + 34 pulados = 9041; `verificar:build` ok; CI verde
- [x] 5. Tela de verdade (produção `e161f42f`, `c:/tmp/pwtest/codigo-patrimonial.mjs`): cadastro sem código → 000085; minúsculas duplicadas recusadas; lote → 000086/000087; busca por OPR-PAT-835808 acha a Trena 10m (000010); item → ativo → 000088 com item de mesmo código. Limpeza conferida no banco (0 sobras; maior código volta a 000084)

Observação: o build local (`vite build`) da frente falhou no plugin de PWA (`this.createScope is not a function`), problema do ambiente da frente; o build do Vercel do mesmo commit passou.

Pendência fora do plano: o "QR" da etiqueta é um desenho fixo, não codifica nada.

## Contexto

Pedido (13/10/2026): *"o numero patrimonial deve ser unico … proponha um plano para correcao"*.

O que existe hoje (lido em `origin/main` e no banco):
- O banco já tem `UNIQUE (organization_id, code)` (`uq_asset_code_org`). Hoje não há duplicata nem dentro de uma organização, nem entre organizações, nem ignorando caixa e espaço.
- **O problema é quem gera o código.** São três geradores diferentes, todos no navegador:
  - `OpuraAssetsModule.tsx:754` e `AssetImportModal.tsx:295` sorteiam `OPR-PAT-` + 6 dígitos. Se o número sorteado colidir, o cadastro falha com erro do banco.
  - `buildingAssetService.proximoCodigo` (Condomínio) faz `OPR-PRE-` + (maior + 1), sem trava: dois cadastros ao mesmo tempo pegam o mesmo número.
  - `fn_patrimoniar_item_de_estoque` sorteia e tenta de novo até achar um número livre.
- Também falta tratar caixa e espaço: hoje "opr-pat-1 " e "OPR-PAT-1" passariam como códigos diferentes.
- Existem 88 ativos: 84 `OPR-PAT` aleatórios (de 106268 a 980308, todos na Alpa) e 4 `OPR-PRE-0001…0004`.
- O código aparece em três lugares fora de `opura_assets`:
  - 1 `stock_items.input_code`: o item vinculado, sem movimentos;
  - 1 `internal_transactions.description`: título de manutenção, achado pela `reference_id`, não pelo código;
  - 27 `notifications.message`: histórico.

Decisões do usuário (13/10/2026):
- **Escopo:** único **por organização**.
- **Numeração:** **renumerar todos** em sequência, sabendo que etiquetas QR já impressas deixam de bater.

## Desenho

O número passa a nascer **no banco**, numa função atômica: trava por organização (advisory lock) e maior + 1. É o mesmo padrão de `fn_next_stock_item_code` (`20270913000004_almoxarifado_catalogo_itens.sql:49`). Nenhum código é mais gerado no navegador. Quem cadastra deixa o campo vazio e o gatilho preenche. Quem digita um código próprio continua podendo, mas a unicidade passa a ignorar caixa e espaço.

Prefixos: `OPR-PAT-000001` (6 dígitos) para os bens; `OPR-PRE-0001` (4 dígitos) para os ativos prediais do Condomínio, que já são sequenciais. Cada prefixo tem a sua série, por organização.

## Itens

Passo 0 (REGRAS #6 e #8): `bash scripts/nova-frente.sh codigo-patrimonial-unico` e copiar este plano para `docs/planos/2026-10-13-codigo-patrimonial-unico.md`, com o pedido literal e as duas decisões.

### 1. Migration: gerador atômico e unicidade normalizada
Arquivo `aplicar_<próximo prefixo>_codigo_patrimonial_unico.sql`, aplicado com `db query -f`:
- `fn_proximo_codigo_patrimonial(p_org uuid, p_prefixo text)`: `pg_advisory_xact_lock(hashtext('asset_code:'||org||prefixo))`; maior número dos códigos `^PREFIXO-\d+$` da organização, mais 1; preenche com zeros (6 dígitos para PAT, 4 para PRE).
- Gatilho `BEFORE INSERT` em `opura_assets`:
  - normaliza: `code := upper(btrim(code))`;
  - se o código vier vazio, gera com o prefixo da categoria (`sistema_predial` → `OPR-PRE`, as demais → `OPR-PAT`);
  - preenche `tracking_code` quando vazio.
- Gatilho `BEFORE UPDATE OF code`: só normaliza. A trava de ativo vinculado já existe.
- Troca `uq_asset_code_org` por um índice único em `(organization_id, upper(btrim(code)))`.
- Coluna nova `codigo_anterior text`: guarda o código aleatório antigo, para a busca achar o bem pela etiqueta velha.
- REGRA #7: REVOKE/GRANT em toda função nova.
- **Pronto quando:** inserir 2 ativos sem código na mesma transação dá 000001 e 000002; um código manual duplicado com outra caixa é recusado (23505).

### 2. Migration: renumeração (no mesmo arquivo, depois do item 1)
- Tabela de reversão `opura_assets_renumeracao_20271013 (asset_id, organization_id, codigo_antigo, codigo_novo)`. **Não apagar depois:** é a prova e o caminho de volta.
- Ordem da numeração: por organização, pelo `created_at` e depois pelo `id`. Só entram os códigos que seguem o padrão `OPR-PAT-*`. Os `OPR-PRE-*` já são sequenciais e ficam como estão.
- Numa só transação:
  - `codigo_anterior := code`; `code` e `tracking_code` recebem o novo;
  - itens do Almoxarifado vinculados: `stock_items.input_code`, mais `stock_balances` e `stock_movements` do mesmo código, se houver. A trava de código de ativo vinculado é desligada só dentro da migration, por um GUC transacional;
  - `internal_transactions.description`: troca o código antigo pelo novo no texto. Só o texto: nem valor nem status mudam;
  - `notifications` ficam como estão (são histórico; a busca pelo `codigo_anterior` cobre).
- Ensaio antes: rodar a migration inteira dentro de `BEGIN … ROLLBACK`, com asserções:
  - 84 renumerados de 000001 a 000084, sem buraco nem repetição;
  - o item vinculado acompanha (`input_code` igual ao `code`);
  - o saldo do item não muda;
  - a tabela de reversão tem 84 linhas.
- **Pronto quando:** o ensaio passa, a migration é aplicada, e um SELECT confirma 0 códigos aleatórios e o `max` igual a `OPR-PAT-000084` na Alpa.

### 3. Frontend: nenhum gerador no navegador
- `OpuraAssetsModule.tsx:754`: manda `code` vazio (`null`) quando o campo está em branco. O campo continua opcional, com placeholder "Gerado ao salvar (OPR-PAT-000085…)". Duplicar ativo limpa o código.
- `AssetImportModal.tsx:295`: linha sem código vai sem código, e o banco numera. A prévia mostra "Gerado ao importar". A checagem de código repetido na planilha passa a comparar `upper(trim)`.
- `buildingAssetService.ts`: remove `proximoCodigo` e manda sem código; o gatilho usa `OPR-PRE` pela categoria.
- `fn_patrimoniar_item_de_estoque`: troca o sorteio por `fn_proximo_codigo_patrimonial`. Isso vai numa migration nova que recria a função; a de 13/10 já aplicada não se edita.
- Erro 23505 do código traduzido para "Já existe um ativo com o código X nesta organização". O ponto único de tradução é o `assetService`.
- A busca da lista de ativos também procura em `codigo_anterior`. O ativo mostra "Código anterior: OPR-PAT-740466" (tooltip na coluna Código e no formulário em modo leitura).
- `types/assets.ts`: `codigo_anterior`.
- **Pronto quando:** `git grep "Math.random() \* 900000"` não acha nada; cadastrar, importar, duplicar, ativo predial e transformar item em ativo geram o próximo número da série.

### 4. Testes
- Vitest:
  - teste novo que lê a migration e confere a trava, o índice normalizado e o REVOKE;
  - `assetToStockItemRow.test` continua verde;
  - guardas (`segurancaMigrations`, `migrationsPrefixo`, `orgContextGuard`);
  - suíte inteira com a conta fechando.
- Script de banco reaproveitável: `scripts/teste-codigo-patrimonial.sql` (BEGIN…ROLLBACK). Cobre:
  - sequência;
  - duas séries (PAT e PRE) independentes;
  - código manual que pula a série (digitar 000200 faz o próximo ser 000201);
  - duplicata com outra caixa recusada;
  - organizações diferentes podendo repetir o mesmo número.
- `scripts/teste-ativos-almoxarifado-vinculo.sql` volta a passar, agora com o código gerado pelo banco.
- **Pronto quando:** tudo verde, e o `tsc` sem erro lido por grep.

### 5. Tela de verdade e publicação
- Playwright, com a conta de teste e escrita autorizada:
  - cadastrar 1 ativo sem código (vira o próximo número, 000085);
  - importar uma planilha de 2 linhas sem código (000086 e 000087);
  - buscar por um código antigo (acha o bem renumerado);
  - transformar 1 UN de um item em ativo (próximo número);
  - apagar tudo no fim.
- ⚠️ Os números apagados no teste ficam "queimados" só se forem os maiores: maior + 1 volta a reaproveitá-los depois da limpeza, porque a série não usa contador. Isso é aceitável e esperado.
- Push em `main`, `conferir-producao.sh "Gerado ao salvar"`, ler o check-run `ci`, `fechar-frente.sh`. Atualizar a memória `project_almoxarifado_importar_ativos` e criar uma memória curta sobre a numeração.

## Riscos e o que avisar ao usuário
- **Etiquetas impressas** com o código antigo deixam de bater. O "QR" da etiqueta (`OpuraAssetsModule.tsx:2955`) é um desenho SVG fixo, que não codifica nada: quem identifica o bem é o código impresso em texto. Mitigação: `codigo_anterior` na busca (quem digitar o código velho acha o bem) e a tabela de reversão. Etiquetas novas saem pela ação "QR Code" do ⋮. Que o QR não seja real é uma pendência à parte, fora deste plano (registrar no doc).
- Renumerar é decisão do usuário, já tomada. A tabela de reversão permite desfazer.
