---
type: módulo
title: "Financeiro: extratos e conciliação bancária"
description: Como o extrato bancário entra (parsers OFX/CSV/XLSX/HTML/CNAB, impressão digital SHA-256, registro por arquivo e saldo inicial), como o motor casa extrato com títulos (regras puras compartilhadas entre navegador e Edge Function, pares exatos, transferências internas, pontuação, aliases aprendidos) e como a confirmação baixa o título por RPC.
tags: [reconciliation, bank-statement, matching-engine, ofx, edge-function, finance]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-93cf2b76e99013d2d5ce0d79
    resource: repo://services/bankReconciliationService.ts
  - id: openwiki-source-28d5434c47b8a26a5213bde9
    resource: repo://services/bankStatementParsers.ts
  - id: openwiki-source-0106cdb455ac843549c3c886
    resource: repo://supabase/functions/reconciliation-engine/index.ts
  - id: openwiki-source-9496c9a9f9a9a7d99c8aa0e6
    resource: repo://utils/reconciliationRules.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Financeiro: extratos e conciliação bancária

**Conciliar** é ligar uma linha do extrato bancário (`bank_transactions`) a um
ou mais títulos do sistema (`internal_transactions`). Quando a ligação é
confirmada, o título fica `CONCILIATED` — que é diferente de apenas "pago".

Tela: `components/BankReconciliation.tsx` (~5.000 linhas; a aba **Extrato** é a
tela de referência do guia de UI) e `components/reconciliation/`. Serviço:
`services/bankReconciliationService.ts`. Motor no servidor: Edge Function
`reconciliation-engine`.

## 1. Importação do extrato

`services/bankStatementParsers.ts` converte arquivo em `ParsedStatement`
(cabeçalho da conta + `RawTransaction[]`). Formatos: `OFX`, `CSV`, `XLSX`,
HTML exportado como planilha, `CNAB240`, `CNAB400`. Detalhes que existem por
causa de extratos reais:

- `detectColumns` acha a linha de cabeçalho e as colunas por nome;
  `detectDelimiter` adivinha o separador do CSV;
- `parseAmountBR` / `parseDateCell` tratam formato brasileiro; datas **sem
  ano** (`dd/mm`) recebem o ano por `inferirDataDeReferencia` (do conteúdo ou do
  nome do arquivo);
- `isBalanceLine` descarta linhas de saldo;
- arquivo lido mas sem movimento devolve **recusa com motivo** (datas sem ano,
  HTML sem tabela…), não "extrato vazio".

`ingestMultipleFiles(files, bankAccountId, organizationId)`:

- recusa OFX de **outra conta** (compara o número da conta do arquivo com o
  cadastrado);
- na primeira importação da conta, exige o **saldo inicial** — sem ele todo
  saldo mostrado seria soma desde zero;
- cada linha recebe uma **impressão digital** SHA-256 de uma forma canônica
  (`fingerprintCanonical` → `generateFingerprint`), que deduplica reimportações
  e arquivos sobrepostos de formatos diferentes;
- grava **um registro por arquivo** (`registrarImportacoes`), para responder
  depois "o que importei bate com o saldo do banco?" e "falta pedaço de
  extrato?" (`conferirCompletude`, `fn_reconciliation_progress`).

Também há `applyCustomRules` (regras da organização que categorizam o
extrato), `gerarLancamentosDoExtrato` (criar título a partir de linha do
extrato) e `definirCorteHistorico` (ignorar extrato antes de uma data).

## 2. O motor de conciliação

### Regras puras, um arquivo só

`utils/reconciliationRules.ts` **não tem um único `import`**. É carregado
igual por Vite (navegador), Vitest (testes) e Deno (Edge Function). Motivo: as
regras são sutis — num mesmo dia erraram nas duas direções (ligaram 25 pares
sem relação, depois bloquearam 9 corretos) — e duas cópias garantiriam que uma
ficasse para trás. Nada que toque rede, banco ou `window` entra ali.

Peças principais:

| Função | Papel |
|---|---|
| `findExactUniquePairs` | pares determinísticos: valor e data batem e só há um candidato |
| `findInternalTransferPairs` | débito numa conta + crédito em outra = transferência interna |
| `scoreCandidate` | pontuação por valor, data, similaridade de texto (`calculateSimilarity`), documento (`documentMatches`), contraparte e juros esperados (`computeInterestExpectation`) |
| `contrapartesDiscordam` | veta par cujo nome no extrato contradiz a contraparte do título |
| `resolveBankParty`, `PartyIndex` | reconhece a contraparte pelo texto, inclusive por **alias** aprendido |
| `foraDaConciliacao` / `extratoForaDaConciliacao` | categorias excluídas pela organização (ex.: "Movimentação") e extrato sem contraparte |
| `valorParaConciliar`, `pontuarParcelaVariavel` | títulos com valor esperado/variável |
| `orgsDosTitulos`, `filtroOrgsOuGlobal` | uma conta pode atender títulos de mais de uma organização |

O plano completo (`PlanoDeConciliacao`) junta tudo isso; ele é calculado pelo
mesmo código nos dois lados.

### Onde roda

`runMatchingEngineTracked` chama **primeiro o servidor**: a Edge Function
`reconciliation-engine` roda o motor inteiro (determinístico + pontuação) e
registra a execução em `reconciliation_runs`. Rodar no navegador carregava
~6.000 lançamentos na memória da aba, dependia de alguém estar com a tela
aberta e falhava em silêncio com bundle velho em cache.

⚠️ A chamada sai do cliente global de propósito, com **corte próprio de 3 min**:
na maior organização a função leva 26–61 s. Com o corte de 20 s, o navegador
desistia, caía no fallback e rodava um **segundo motor** na mesma conta enquanto
o servidor ainda trabalhava. Agora só cai para o navegador quando o servidor
não está disponível.

A função também roda por cron (a cada 10 min), e a baixa que ela faz dispara o
Motor de Processos com o mesmo módulo do navegador (`services/processMotor.ts`).

Listas grandes usam `fetchAllPages` com ordem determinística — o motor chegou a
pontuar só ~17% do extrato pedindo `.limit(5000)` sob o teto de 1000 linhas
do PostgREST (ver [Estado e acesso a dados](../../arquitetura/estado-e-dados.md)).

### Sugestões e aprendizado

- Candidatos pontuados viram `reconciliation_suggestions`
  (`fn_replace_suggestions` substitui as da linha).
- Ao confirmar um par, `learnAliasFromMatch` grava em `reconciliation_aliases`
  um token do texto do extrato → contraparte. O alias também aprende **sem
  cadastro** (só pelo nome): fornecedor não tem `party_id` (a FK aponta só para
  `clients`), e exigir o id deixava a base sem nenhum alias de fornecedor com
  73% do extrato sendo débito.
- `services/reconciliationMemoryService.ts`, `reconciliationGroupService.ts`,
  `reconciliationAnomalyService.ts` e `reconciliationReprocessService.ts` cobrem
  memória, grupos (1 extrato ↔ N títulos), anomalias e reprocessamento.

## 3. Confirmar, desfazer, ignorar

| Operação | Caminho |
|---|---|
| ligar extrato ↔ título | `createMatch` → RPC `fn_reconcile_match` (o título vira `CONCILIATED` dentro da RPC) |
| 1 extrato ↔ vários títulos | `reconcileGroup` |
| desfazer | `unmatch`; transferência interna: `unpairInternalTransfer` → `fn_reconcile_untransfer` |
| ignorar linha | `ignoreBankTransactions` / `unignoreBankTransactions` |
| confirmar sem título | `confirmTransaction` |

Depois da RPC, fora da transação dela, saem os efeitos **best-effort**: se o
título é débito de um pedido, o fluxo P2P avança; baixa de título de qualquer
origem alimenta o Motor de Processos. Eles não podem desfazer uma conciliação
já gravada. A baixa também leva o boleto ligado a `pago` pelo gatilho do banco
(ver [Boletos, Asaas e cobrança](./boletos-asaas-e-cobranca.md)).

## Configuração por organização

`reconciliation_settings` (tolerâncias do motor, `loadSettings`), filtros
(`lerFiltrosDaConciliacao`: categorias excluídas, incluir extrato sem
contraparte) e regras (`reconciliation_rules`, com `simularRegraNaConta` para
prever o efeito antes de salvar) — tudo no painel Regras da Central.

## Onde olhar

| Pergunta | Arquivo |
|---|---|
| "por que este par (não) casou?" | `utils/reconciliationRules.ts` |
| formato de extrato novo | `services/bankStatementParsers.ts` |
| importação, motor, confirmação | `services/bankReconciliationService.ts` |
| execução no servidor | `supabase/functions/reconciliation-engine/index.ts` |
| telas | `components/BankReconciliation.tsx`, `components/reconciliation/` |

Como os títulos nascem: [Títulos e sincronização](./titulos-e-sincronizacao.md).
