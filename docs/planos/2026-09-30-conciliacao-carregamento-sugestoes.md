# Conciliação: Central mostra 0 sugestões com 741 no banco — carregamento

## Pedido original

> sim

Resposta de 30/09/2026 a: "Quer que eu publique a Central? E que ataque em seguida o
carregamento das sugestões?" (sessão df7b7923). O achado veio da verificação da migração
visual, registrado em `2026-09-30-conciliacao-central-migracao-visual.md` › Achados fora do escopo.

## Contexto (medido)

- `loadTransactions` (`components/BankReconciliation.tsx`) pedia as sugestões em **lotes de 100
  extratos, todos em paralelo**: 58 a 64 requisições na conta Sicredi da Alpa, cada uma com
  `select *` e o título sugerido inteiro embutido.
- No navegador, com o banco calmo, cada lote levou **mediana de 16,4 s e máximo de 17,3 s**,
  colado no corte de 20 s do cliente. Com o banco ocupado, tudo abortava e a tela mostrava 0.
- **Lote com erro era descartado em silêncio** (`.filter(r => !r.error)`).
- **Corrida:** trocar de conta com o carregamento em andamento deixava a resposta da conta
  anterior chegar depois e sobrescrever a da nova (55 de 64 lotes abortados na troca).
- No banco, como o usuário real (RLS): **1 lote = 1.047 ms (27 linhas); a conta inteira numa
  consulta, só com as colunas usadas = 43 ms (741 linhas).**

## Plano

### 1. `components/BankReconciliation.tsx` › `loadTransactions`
- Sugestões numa **consulta só por conta**: `reconciliation_suggestions` com o extrato embutido
  `!inner`, filtrado por conta, status e período, os mesmos recortes da lista de extratos.
  Paginada com `fetchAllPages`, só as colunas que a Central e a Pendentes usam, e ordenada por
  confiança desc (`topSuggestionByBankTxId` depende disso).
- Erro da consulta de sugestões **aparece** (feedback na tela), sem derrubar o resto.
- Sem extratos pendentes, as sugestões zeram. Antes ficava a lista da conta anterior.
- **Corrida:** um contador de chamada (`useRef`). A resposta de uma chamada antiga não grava
  estado.
- Erro geral do carregamento passa a aparecer na tela, além do console.
- **Pronto quando:** no navegador, na conta da Alpa, a Central mostra as sugestões com **1**
  requisição de sugestões (não ~60) e o número bate com o banco (741 linhas → 350 extratos com
  a melhor sugestão). Trocando de conta no meio do carregamento, fica a lista da conta NOVA.

## Estado (30/09/2026)

- [x] 1. Consulta única com o extrato embutido `!inner` e os mesmos recortes; erro visível;
  sugestões zeram sem extratos pendentes; contador de chamada contra a corrida; erro geral do
  carregamento visível.

**Medido no navegador** (conta de leitura, escritas bloqueadas = 0, erros = 0):
- Alpa, conta Sicredi: **1 requisição de sugestões em 1,4 s** (antes 58 a 64, de ~16 s cada),
  741 linhas e **340 cartões**. No banco: 340 extratos pendentes com sugestão, 741 linhas e 37
  de alta confiança, igual ao botão "Conciliar alta confiança (37)".
- Corrida: aberta na Alpa e trocada para a Garden 1,5 s depois. A chamada antiga foi descartada
  (nem pediu sugestões). Ficaram Regras (0) e 1 cartão, que é a Garden (no banco: 1 extrato,
  2 sugestões).
- `tsc` 0, `check-ui-standard` 0. Suíte: 6.529 + 33 pulados = 6.562, exit 0.
- **Não visto:** a aba Pendentes, que também usa as sugestões ("Conciliar Agora" na linha). Os
  campos usados lá (`id`, `description` do título) estão na consulta nova.

## Verificação
`tsc`, `check-ui-standard`, suíte completa (conta fechando), navegador com escritas
bloqueadas, contando requisições e tempo.
