# Conciliação › Pendentes: paginação das duas listas (+ pasta solta da frente anterior)

## Pedido original

> resolver os dois

Sessão df7b7923 · 2026-10-01. Os "dois" eram os pendentes deixados no fim da entrega anterior:
(1) a Pendentes desenha todos os ~5.700 extratos de uma vez; (2) a pasta
`C:\D\frentes\conciliacao-pendentes-conciliar` ficou no disco depois de a frente ser fechada.

## Contexto (medido em 30/09–01/10)

- A Pendentes desenhava a lista inteira: **7.299 linhas de tabela** na conta Sicredi da Alpa,
  **~40 s** de navegador ocupado (dos 15 s aos 56 s no registro), **~860 MB** de memória na
  página. O navegador sem tela chegou a travar ("Page crashed"), e requisição em voo durante o
  desenho estourava o corte de 20 s do cliente.
- O rodapé de paginação §6.7 já existia copiado em três lugares (Extrato, StandardTable, Contas
  a Pagar).

## Plano

### 1. Pasta solta
- Conferir antes: junção de `node_modules` (a memória registra que apagar uma junção leva o
  `node_modules` do repositório real) e trabalho não commitado.
- **Pronto quando:** a pasta não existe mais.

### 2. `components/ui/RodapePaginacao.tsx` (novo)
- `usePaginacaoEmMemoria(rows, storageKey, resetKeys)` + `<RodapePaginacao>` no desenho §6.7.
  O tamanho persiste, a página não; voltar à 1 a cada recorte; cair na última página válida.
  Variante `compacto` para coluna estreita.
- **Pronto quando:** `check-ui-standard` 0.

### 3. `components/BankReconciliation.tsx` › Pendentes
- As duas listas (Extrato e Lançamentos), em grade e em tabela, percorrem só a página.
  "Selecionar todos" marca só a página (§6.7). Dock, lote e totais seguem sobre a seleção
  inteira. A aba Extrato mantém o rodapé que já tinha.
- **Pronto quando:** no navegador, cada lista mostra 100 linhas e o rodapé "1–100 de N";
  "Próxima" avança; "selecionar todos" leva o dock a 100; o tempo e a memória da página caem.

## Estado (01/10/2026)

- [x] 1. A pasta estava **vazia** (nenhum arquivo, nenhuma junção). Removida, só com a
  condição "continua vazia" verificada no próprio comando. `Test-Path` → False.
- [x] 2. `RodapePaginacao.tsx` criado; `check-ui-standard` 0. (Não troquei as três cópias
  antigas: fora do pedido.)
- [x] 3. Pendentes paginada. **Medido no navegador** (conta de leitura, escritas bloqueadas = 0,
  erros = 0):

  | | Antes | Agora |
  |---|---|---|
  | Linhas de tabela desenhadas | 7.299 | **214** |
  | Memória da página | ~860 MB | **113–121 MB** |
  | Tela pronta | ~56 s | **~10 s** |

  - Rodapés: Extrato "1–100 de 5.710 · Página 1 de 58"; Lançamentos "1–100 de 1.587 · Página 1
    de 16". Print conferido: empilhados na coluna, "Anterior" desabilitado na página 1.
  - "Próxima" → "101–200 de 5.710 · Página 2 de 58" em 0,9 s, com as 13 sugestões daquela página.
  - "Selecionar todos" do Extrato → dock "100 itens selecionados".
  - `tsc` 0; `check-ui-standard` 0; `orgContextGuard` verde; suíte 6.546 + 33 = 6.579, exit 0.
  - **Não visto:** o modo grade das duas listas (mesma troca de array, sem rodapé próprio
    conferido em print).

**Erro meu durante a execução:** o primeiro script de edição usou um marcador de fim que também
casava como pedaço de uma linha mais indentada e colou o rodapé no meio de
`const internalAcoplada`. O arquivo foi revertido (`git checkout`) e a edição refeita com o
marcador ancorado na quebra de linha. O typecheck pegou um segundo erro (hooks antes da
declaração de `competencia`/`startDate`/`endDate`), corrigido movendo o bloco.

## Verificação
`tsc`, `check-ui-standard` nos 2 arquivos, suíte completa (conta fechando), navegador com
escritas bloqueadas, medindo linhas, memória e tempo.
