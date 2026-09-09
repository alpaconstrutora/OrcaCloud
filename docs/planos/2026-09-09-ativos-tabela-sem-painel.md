# Gestão de Ativos — painel lateral vira coluna de tabela

## Pedido original

Sessão de 2026-09-09, mensagem literal do usuário (com print da tela
Corporativo › Gestão de Bens › Gestão de Ativos anexado):

> 1. Gestão de Ativos (veja print) : incluir os itens o painel laterial direto na tabela (os que ainda nao estao incluidos na tebela
> 2. depois de incluido na tabela, remover painel.

### Decisão complementar (mesma sessão)

Perguntado para onde iriam os itens do painel que não cabem em célula
(timeline de Histórico de Alocação, lista de Documentos & Seguros, QR Code e
os 6 botões de ação), o usuário escolheu, entre três opções:

> **"Tudo na tabela, sem painel nenhum"** — Histórico e Documentos viram
> colunas-resumo (ex.: 'Última movimentação', 'Nº de documentos'). Perde-se a
> timeline completa e a lista de anexos — só sobra o resumo. Ações continuam na
> coluna Ações.

Consequência aceita explicitamente na pergunta: **nenhum painel/drawer/modal de
detalhe substitui o painel removido.**

## O que muda, arquivo por arquivo

### 1. `services/assetService.ts`

Duas consultas novas, por organização, para alimentar as colunas-resumo sem uma
requisição por linha:

- `listLatestMovementsByOrg(organizationId?)` → `Record<assetId, OpuraAssetMovement>`
  com a movimentação mais recente de cada ativo.
- `listDocumentsByOrg(organizationId?)` → `Record<assetId, OpuraAssetDocument[]>`.

Ambas paginam com `.range()` até a página vir incompleta (§6.7 do guia de UI:
nunca `.limit(N)` fixo — o PostgREST corta em 1000 e a tela sumiria com dado
sem avisar).

**Pronto quando:** `npx tsc --noEmit` passa e a tabela mostra data de
movimentação e contagem de documentos em ativos que os têm.

### 2. `components/OpuraAssetsModule.tsx` — colunas novas

`ASSET_COLUMNS` ganha 6 chaves, todas com célula em `renderAssetCell` e
cabeçalho em `ASSET_COLUMN_HEADERS`:

| chave | conteúdo | origem no painel removido |
|---|---|---|
| `brand_model` | marca + modelo | "Marca / Modelo" |
| `allocation` | obra atual ou "Sede / Central" | "Alocação Atual" |
| `purchase_value` | valor de aquisição | "Valor Aquisição" |
| `useful_life` | vida útil em meses | "Vida Útil" |
| `last_movement` | data + destino da última movimentação | timeline "Histórico de Alocação" (resumo) |
| `documents` | nº de documentos + pior vencimento | lista "Documentos & Seguros" (resumo) |

`sortRows` passa a ordenar por essas chaves (data real em `last_movement`,
contagem em `documents`).

**Pronto quando:** as 6 colunas aparecem no `ColumnConfigButton`, ordenam pelo
cabeçalho e o `check-ui-standard.sh` do arquivo sai limpo.

### 3. `components/OpuraAssetsModule.tsx` — coluna de Ações

A coluna de Ações deixa de ser uma seta decorativa e recebe as ações que viviam
nos botões do painel (§9/§9.2):

- clique na linha = **Editar** (ação dominante, §9.1 — não duplicada como botão);
- `ActionIconButton kind="move"` = **Movimentar**;
- `InlineDisclosureMenu` = Reservar · Manutenção · Anexar documento · QR Code ·
  Duplicar · Excluir (`showDelete`, com a guarda de ativo `em_uso`).

**Pronto quando:** cada uma das 8 ações abre o mesmo modal que o painel abria.

### 4. `components/OpuraAssetsModule.tsx` — remoção do painel

Sai o `lg:col-span-2` + coluna da direita: a aba passa a ser uma coluna só, e a
tabela ocupa a largura inteira. Somem com o painel os estados `movements` e
`selectedAssetDocs`, os carregadores `loadAssetMovements`/`loadAssetDocuments` e
o handler `handleDeleteDocument` (sem lista de anexos não há alvo para ele).
`selectedAsset` permanece — passa a ser "o ativo alvo da ação", setado pelos
botões da linha.

**Pronto quando:** `grep -n "Painel da Direita" components/OpuraAssetsModule.tsx`
não retorna nada e a grade de cards (modo blocos) usa a largura toda.

## Regressão conhecida e aceita

Com o painel fora e sem substituto, deixam de existir na tela:

1. a **timeline completa** de movimentações (fica só a última, na coluna);
2. a **lista de anexos** — dá para anexar documento (menu de ações) e ver quantos
   existem (coluna), mas não para abrir o arquivo nem excluir um documento.

Foi a escolha explícita do usuário na pergunta acima. Se um dia isso incomodar,
o caminho previsto pela REGRA #4 é um `Sheet` aberto pela linha — não a volta do
painel fixo.

## Verificação

```bash
bash scripts/check-ui-standard.sh components/OpuraAssetsModule.tsx
npx tsc --noEmit -p .
npx vitest run
```
