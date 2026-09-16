# Extrato Itaú em "Excel": HTML disfarçado e data sem ano

## Pedido original

Sessão de 2026-09-15 (~21h30), três mensagens:

> financeiro < extrato bancario: verifique por que o ultimo extrato importado reportou este erro: Nenhuma transação encontrada no arquivo. Verifique se é um extrato válido (OFX, CSV, CNAB ou Excel).

> acabei de subir referente ao 03-2019. verifique

> implemente

## Diagnóstico (reproduzido com os arquivos reais baixados do bucket `bank-statements`)

Oito importações na conta Itaú 12263-9, todas com `lines_read = 0` em
`bank_statement_imports`. Dois defeitos independentes em `services/bankStatementParsers.ts`:

1. O `.xls` exportado pelo Itaú é **HTML** (`<html xmlns:x=...`, windows-1252, `<td />`
   auto-fechado, `x:num="-35.00"` nas células de valor). `XLSX.read` abre sem erro e
   devolve range lixo (`UVXWK10000001:A1`) e 0 linhas. Valores em formato US (`-1,013.21`).
2. As datas vêm como `"01/03  "` (dd/mm, **sem ano**). Mesmo re-salvo pelo Excel em
   `.xlsx` real, `parseDateCell` exige 3 partes → null → toda linha pulada em silêncio.
   O ano só existe no nome do arquivo (`03-2019.xlsx`) ou, no HTML, na célula
   "Data: 04/04/2019" (data da extração).

Em ambos os casos o parser devolve 0 transações **sem aviso**, e a tela traduz isso
como "extrato inválido".

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `services/bankStatementParsers.ts` | `parseAmountBR` decide o separador decimal pelo ÚLTIMO símbolo (`1.234,56` BR · `1,013.21` US) | teste unitário com os dois formatos |
| 2 | `services/bankStatementParsers.ts` | `parseDateCell(raw, ref?)` aceita `dd/mm` quando há data de referência; ano = ref.y, ou ref.y−1 se dd/mm cair depois da referência (virada de ano) | teste: `01/03` com ref 04/04/2019 → 2019-03-01; `28/12` com ref 05/01/2020 → 2019-12-28 |
| 3 | `services/bankStatementParsers.ts` | `inferirDataDeReferencia(rows, fileName)`: 1º data completa nas 20 primeiras linhas da planilha, 2º nome do arquivo (`dd-mm-aaaa`, `mm-aaaa`, `aaaa-mm`, `mm-aa`, `aaaa`) | teste com os três nomes reais (`03-2019.xlsx`, `03-19.xls`, sem pista) |
| 4 | `services/bankStatementParsers.ts` | `parseHTMLTable(html)` → linhas; trata `<td />`, `colspan`, `x:num`, entidades; `parseStatementFile` detecta HTML pela assinatura dos bytes em `.xls/.xlsx` e decodifica pelo `charset` do meta | teste com fixture sintética no formato Itaú (mesma estrutura do arquivo real) |
| 5 | `services/bankStatementParsers.ts` | `ParsedStatement.avisos: string[]` — o parser explica 0 linhas: "N linha(s) com data sem ano e nenhuma referência", "N linha(s) com data ilegível (ex.: …)", "HTML sem tabela" | teste: xlsx sem ano e sem pista no nome → aviso |
| 6 | `services/bankStatementParsers.ts` | cabeçalho da planilha Itaú preenche `header.acctId` ("Conta:" / "Agência/Conta:") para `accountMatches` funcionar também em Excel/HTML | teste: fixture Itaú → `acctId` termina com `12263-9` |
| 7 | `services/bankReconciliationService.ts` | arquivo com 0 transações **e** avisos entra em `rejected` com os avisos como motivo (chega à tela pelo caminho já existente) | leitura do código + teste de parser; fluxo de tela conferido no navegador |
| 8 | `__tests__/bankReconciliation.parsers.test.ts` | cobre os itens 1–6 | `npx vitest run __tests__/bankReconciliation.parsers.test.ts` verde |

## Progresso

- [x] 1 `parseAmountBR` — último separador decide (`-1,013.21` → −1013.21) — teste em `utilidades › parseAmountBR`
- [x] 2 `parseDateCell(raw, ref)` — dd/mm com referência, virada de ano coberta — teste `parseDateCell — dd/mm sem ano`
- [x] 3 `inferirDataDeReferencia` — planilha, depois nome do arquivo — teste com `03-2019.xlsx`, `03-19.xls`, `extrato.xlsx` (null)
- [x] 4 `parseHTMLTable`/`parseHTML`/`pareceHTML`/`decodeHTMLBuffer` — `<td />`, colspan, `x:num`, windows-1252 — testes `parseHTML — extrato Itaú`
- [x] 5 `ParsedStatement.avisos` — sem ano / data ilegível / HTML sem tabela / sem cabeçalho — testes `sem nenhuma pista de ano`, `HTML sem tabela`
- [x] 6 `extrairContaDoCabecalho` — "Conta:" e "Agência/Conta:" → `acctId`; `accountMatches` vale em Excel/HTML — teste `lê a conta do cabeçalho`
- [x] 7 `ingestMultipleFiles` — 0 transações + avisos → `rejected` com o motivo (com 1 arquivo, vira "Erro na importação: <arquivo>: <motivo>" na tela, pelo caminho já existente)
- [x] 8 `__tests__/bankReconciliation.parsers.test.ts` — 36 testes; suíte completa 323 arquivos verdes em 2026-09-15

### Prova com os arquivos reais (baixados do bucket, não commitados — têm dados pessoais)

| arquivo | antes | depois |
|---|---|---|
| `03-19.xls` (HTML do Itaú) | 0 linhas | 79 movimentos, 2019-03, conta `7824/12263-9` |
| `03-2019.xls` (re-salvo, OLE2) | 0 linhas | 79 movimentos, 2019-03, conta `12263-9` |
| `03-2019.xlsx` (re-salvo) | 0 linhas | 79 movimentos, 2019-03, mesma soma |
| `extrato.xlsx` (sem pista de ano) | 0 linhas, silêncio | 0 linhas + aviso "100 linha(s) têm data sem ano… renomeie com mês e ano ou exporte em OFX" |

Os três formatos com dados produzem exatamente o mesmo conjunto (mesma soma), o que
prova que o parser HTML e o de planilha estão alinhados.
