# Importação de competências SINAPI

Pipeline para carregar novas referências SINAPI (ex.: 01/2026, 02/2026...) mantendo
as anteriores coexistindo. Cada competência é identificada por `reference_date`
(1º dia do mês, ex. `2026-03-01`) e exibida com o `label` (`03/2026`).

## Pré-requisito (uma vez)

Aplicar a migration **`supabase/migrations/20261203000000_sinapi_versioning.sql`**
no Supabase (SQL Editor ou `supabase db push`). Ela:
- adiciona `reference_date` em `sinapi_items` e troca a PK para `(code, reference_date)`;
- cria a tabela `sinapi_references` (fonte do dropdown de competência no app);
- faz backfill do que já existe para `2025-12-01` (12/2025).

## Passo a passo de cada importação

### 1. Gerar o modelo (uma vez, ou quando quiser um arquivo limpo)
```powershell
node scripts/generateSinapiTemplate.mjs
```
Gera `Modelo_SINAPI.xlsx` na raiz, com duas abas:

**Aba `Itens`** — 1 linha por código:
| coluna | descrição |
|--------|-----------|
| `codigo` | código SINAPI |
| `descricao` | descrição |
| `unidade` | unidade (M2, H, UN...) |
| `tipo` | `COMPOSITION`, `INPUT` ou `SERVICE` |
| `natureza` | `Material`, `Mão de Obra`, `Equipamento` ou `Composição` |
| `grupo` | categoria/agrupamento |
| `<UF>_sem` / `<UF>_com` | preço por UF, sem/com desoneração (54 colunas; preencha só as UFs que tiver) |

**Aba `Composicoes`** — 1 linha por componente (relação pai→filho):
| coluna | descrição |
|--------|-----------|
| `codigo_pai` | código da composição |
| `codigo_item` | código do componente |
| `descricao_item`, `unidade_item`, `tipo_item` | dados do componente |
| `coeficiente` | quantidade do componente na composição |

### 2. Preencher a planilha
Cole os dados da competência. UFs ausentes viram preço 0. A coluna `price`
denormalizada é calculada automaticamente (SP/sem como fallback).

### 3. Carregar
```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = Read-Host "Cole a sb_secret_..."
node scripts/loadSinapi.mjs ./SINAPI_03_2026.xlsx 2026-03-01 "03/2026"
```

O script faz upsert em lotes (`ON CONFLICT code,reference_date`) e registra a
competência em `sinapi_references` com `status='published'`. É **idempotente**:
re-rodar a mesma competência sobrescreve.

### 4. Conferir no app
A nova competência aparece no dropdown **Referência** em Composições e no
Orçamento (lido de `sinapi_references`). Orçamentos existentes continuam fixados
na competência em que foram criados (pin) — ver Fase 3/4 do versionamento.

## Notas
- `search_tsv` não é enviado pelo script (coluna gerada/populada pelo banco).
- A chave de serviço (`sb_secret_...`) nunca deve ser commitada nem exposta no front.
- Para despublicar uma competência sem apagar: `UPDATE sinapi_references SET status='archived' WHERE reference_date='...'`.
