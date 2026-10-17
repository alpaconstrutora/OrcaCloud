# Extrato importado em dobro, saques marcados como Débora e recibo de pagamento

## Pedido original

> Ainda falta, se você quiser:
> 1. Corrigir a importação de extrato para recusar cópias pelo mesmo critério usado aqui (conta + data + valor + direção), e limpar as tags </FITID>/</REFNUM> que sobram do OFX. Sem isso, importar o mesmo período em outro formato duplica de novo: Implementar
> 2. Rever a regra que marca 47 saques no caixa eletrônico como pagos à Débora: Implementar
> 3. Decidir sobre o contrato da Débora e o recibo nº 000001. O contrato é de R$ 600 fixos, mas os pagamentos reais variam conforme o número de faxinas, e o recibo traz 28/09/2026 como data de um pagamento que não aconteceu nesse dia: Implementar
> 4. Ajustar o recibo: o endereço da Alpa aparece logo abaixo do nome do credor, e a forma de pagamento não é obrigatória: Implementar

Sessão 75841d62-8ffb-4424-aa94-4d65426f215e · 17/10/2026 ~17:30.

Contexto: a análise do recibo nº 000001 (pagamento à Débora Cristina Duarte, faxina) levou
à descoberta de que o extrato Sicredi de jan–jun/2024 tinha sido importado duas vezes
(OFX em 09/07/2026 e outro formato em 02/08/2026). O lote duplicado (339 linhas) já foi
removido nesta sessão, com aval do usuário: backup em
`extrato_duplicado_{linhas,matches,sugestoes,gemeas}_reversao_20261017` (NÃO apagar).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 17/10/2026 | Remover o lote duplicado de 02/08? | Sim. Executado pelo próprio usuário (script da sessão) |
| 17/10/2026 | Parcelas ago/2021–jul/2026 do contrato da Débora (R$ 600 fixos × PIX de 600/750) | **Manter R$ 600 fixos**: conciliar só os meses com PIX de exatamente R$ 600 ainda livres; os de R$ 750 e os meses sem PIX ficam em aberto |
| 17/10/2026 | Recibo nº 000001 | **Cancelar e refazer**: estornar a baixa manual (o recibo fica CANCELADO no histórico, o número não volta). A parcela passa a seguir a regra acima; se houver pagamento real que a quite, emite-se recibo novo |

## Diagnóstico (17/10/2026, conferido no banco e no código)

1. **Importação** (`services/bankReconciliationService.ts` `ingestMultipleFiles`): a única
   checagem de duplicidade é o `fingerprint`, que inclui a DESCRIÇÃO. O mesmo movimento
   exportado em outro formato (OFX × CSV/XLS) tem outra descrição e entra de novo. O
   `.in('fingerprint', …)` também não divide em blocos.
2. **Tags OFX**: o parser atual (`services/bankStatementParsers.ts`, desde 3723d072 em
   05/09/2026) não deixa tag. As 4.907 linhas sujas (2 orgs) vêm do parser antigo
   (`<FITID>(.*)` lia até o fim da linha): `external_id` = `13247103932</FITID>` e
   descrição com `</REFNUM>`. A migration 000013 só limpou `</MEMO>`, e o
   `description_normalized` ainda carrega `MEMO`/`REFNUM`. Sem colisão no
   `UNIQUE(bank_account_id, external_id)` ao limpar (medido: 0).
3. **Saques como Débora**: não é regra cadastrada. Em 01/10, uma conciliação manual de um
   saque no caixa com a parcela da Débora fez `learnAliasFromMatch` aprender o apelido
   `DINHEIRO ATM CE0230099 MEMO` → Débora (`extractAliasToken` não trata o jargão de saque
   nem o código do terminal). O motor (`resolveBankParty` + `partyUpdates`) passou a carimbar
   `counterparty_name` = Débora em todo saque daquele terminal. É o único apelido inválido
   da base (9 no total).
4. **Recibo**: na seção 3 do PDF, o bloco de contato do EMITENTE fica logo abaixo do
   destinatário ("Pago a:"/"Recebemos de:") e parece ser dele. O rodapé já traz o mesmo
   contato. A forma de pagamento é opcional no painel de baixa (`BaixaRecebivelSheet`,
   padrão "Não informada") e sai "—" no recibo.

## Itens

### 1. Importação recusa cópia de outro formato
- **O que muda:** função pura `separarGemeasDeOutroFormato` (`utils/extratoDuplicidade.ts`).
  Por chave conta+data+valor+direção, as linhas que já existem na conta consomem as do
  arquivo: só entra `max(0, N_arquivo − N_banco)`. Mesmo `external_id` também conta como
  já existente. `ingestMultipleFiles` carrega as linhas da conta no período do arquivo
  (paginado), aplica a função e informa quantas foram recusadas por já existirem em outro
  formato. O `.in('fingerprint')` passa a ser em blocos. O texto da regra no drawer de
  importação descreve o critério.
- **Como sei que terminou:** testes da função pura (cópia OFX×CSV recusada; dois movimentos
  iguais no mesmo dia com só um no banco → entra um; mesmo `external_id` recusado; período
  novo entra inteiro). Typecheck limpo.
- **Status:** ✅ código + 9 testes (`__tests__/extratoDuplicidade.test.ts`); typecheck limpo

### 2. Limpar as tags que sobraram do parser antigo
- **O que muda:** migration que tira `</TAG>` de `external_id` e `description_raw` e
  recalcula `description_normalized` (mesma regra de `normalizeText`). Backup em tabela de
  reversão. Teste de regressão do parser com OFX SGML de fechamento na mesma linha.
- **Como sei que terminou:** depois de aplicar, 0 linhas com `</` em `external_id`,
  `description_raw` e 0 com `MEMO`/`REFNUM` no `description_normalized` vindas da tag;
  teste do parser verde.
- **Status:** ✅ código/teste ✅ (2 casos novos em `bankReconciliation.parsers.test.ts`); migration `aplicar_20271017988000_extrato_limpar_tags_ofx.sql` escrita, aplicada pelo usuário em 17/10 e conferida (ver Publicação)

### 3. Apelido não se aprende de movimento sem nome
- **O que muda:** `tokenDeAliasAprendivel` (`utils/reconciliationRules.ts`) = token de
  `extractAliasToken` sem palavras com dígito (código de terminal) e sem jargão de saque
  (DINHEIRO, ATM, TERMINAL, MEMO, REFNUM…). `learnAliasFromMatch` usa essa função.
  `extractAliasToken` NÃO muda: a Edge Function do motor pontua com ela, e mudá-la exigiria
  republicar o motor. Dados: apagar o apelido `DINHEIRO ATM CE0230099 MEMO` e limpar
  `counterparty_name` = Débora dos saques (backup).
- **Como sei que terminou:** teste: saque ("SAQUE DINHEIRO ATM-CE0230099 …", "Saque terminal")
  dá token vazio; PIX com nome continua dando o nome. No banco: 0 saques com contraparte
  Débora e o apelido apagado.
- **Status:** ✅ código + 3 testes ✅; dados na migration `aplicar_20271017988100_debora_saques_e_parcelas.sql` (seleção conferida a seco: 1 apelido, 47 saques), aplicada pelo usuário em 17/10 e conferida (ver Publicação)

### 4. Contrato da Débora e recibo nº 000001 (dados)
- **O que muda:** estornar a baixa manual da parcela (1) ago/2021 com a mesma gravação de
  `payableService.updateStatus('PREVISTO')` (o gatilho cancela o recibo 000001). Conciliar
  com `fn_reconcile_match` as parcelas em aberto cujo mês tem um PIX livre de exatamente
  R$ 600: fev/2022, mar/2022, nov/2024, dez/2024, mai/2026.
- **Como sei que terminou:** recibo 000001 com `cancelled_at`; parcela ago/2021 em
  PREVISTO/PENDING; as 5 parcelas CONCILIATED com 1 vínculo cada.
- **Status:** ✅ migration `aplicar_20271017988100` escrita; seleção conferida a seco: fev/22↔14/02, mar/22↔14/03, nov/24↔11/11, dez/24↔11/12, mai/26↔19/05; aplicada pelo usuário em 17/10 e conferida (ver Publicação)

### 5. Recibo: contato do emitente fora do lado do destinatário
- **O que muda:** `montarReciboPdf` deixa de desenhar o bloco de contato do emitente na
  seção 3 (ao lado do valor, abaixo do destinatário), nos dois tipos de recibo. O contato
  continua no rodapé "CONTATO". Recibos já emitidos não mudam (o PDF guardado vale).
- **Como sei que terminou:** teste do recibo verde; PDF de conferência renderizado sem o
  bloco.
- **Status:** ✅ código + teste (contato do emitente sai 1 vez); PDF do 000001 renderizado e conferido

### 6. Forma de pagamento obrigatória quando o recibo vai ser emitido
- **O que muda:** no `BaixaRecebivelSheet`, com "Emitir recibo" marcado, o botão de
  confirmar fica desligado até escolher a forma, e diz o motivo. Sem recibo, segue opcional.
- **Como sei que terminou:** typecheck; conferência na tela; `check-ui-standard.sh` no arquivo.
- **Status:** ✅ código + teste; `check-ui-standard.sh` sem violação

## Publicação

- 17/10/2026: código publicado em `main` (`7806a3f7` + `8207002c`). Suíte completa antes do
  push: 5 falhas — 3 eram testes de tela que confirmavam a baixa sem forma de pagamento
  (comportamento novo, testes ajustados) e 2 do `PainelVersoes`, em cascata de 2 workers
  do Vitest que caíram (o arquivo passa sozinho). Typecheck limpo (1ª tentativa caiu com
  rc=139, Node 24).
- Migrations `aplicar_20271017988000` e `aplicar_20271017988100`: **não aplicadas** — a
  aplicação pelo agente é barrada pela permissão automática; ficam com o usuário.
- 17/10/2026: as duas migrations foram aplicadas pelo usuário. Conferido de fora: 0 linhas
  com tag de OFX (4.907 no backup); apelido do saque apagado e 0 saques com a Débora;
  parcela ago/2021 em PREVISTO/PENDING sem data e recibo 000001 cancelado (`estorno`);
  fev/22, mar/22, nov/24, dez/24 e mai/26 CONCILIATED com 1 vínculo e a data do PIX;
  RLS ligada nas 5 tabelas de reversão. **Plano concluído: 6 de 6.**
