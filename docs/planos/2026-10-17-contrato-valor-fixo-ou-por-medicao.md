# Contrato: valor das parcelas fixo ou por medição (variável)

## Pedido original

> Criar uma opcao para o usuário informar se os valores das parcelas são valores fixos ou depende de medicao e que neste caso podem variar

Sessão 75841d62-8ffb-4424-aa94-4d65426f215e · 17/10/2026. Continuação de
`docs/planos/2026-10-17-recibo-extrato-debora.md`: o contrato de faxina da Débora gera
R$ 600 fixos por mês, mas o pagamento real é por faxina (R$ 600 ou R$ 750 por mês, às
vezes dividido em dois PIX).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 17/10/2026 | Onde o valor real de cada mês é informado? | **Na baixa e na conciliação**: o valor pago vira o valor da parcela |
| 17/10/2026 | Motor de conciliação com parcela variável de valor diferente | **Só sugerir**: mesmo fornecedor e mês → sugestão; ao aceitar, a parcela assume o valor do extrato. Nunca automático |
| 17/10/2026 | Aplicar ao contrato da Débora? | **Sim**: marcar como variável e conciliar os meses com PIX do fornecedor (R$ 750 e o 06/2025 com 450+150), com backup |

## Diagnóstico (17/10/2026)

1. Não existe flag "valor fixo × variável". `billing_mode = 'MEDICAO'` é a medição FORMAL
   (itens, aprovação, exige obra) e não serve para serviço recorrente simples.
2. O valor da parcela recorrente sai de `contracts.original_value`
   (`contractService.syncRecurringToFinance`), e o `upsert` regrava `amount`, `status` e
   `business_status` de TODAS as parcelas, inclusive as pagas e conciliadas: clicar
   "Lançar Financeiro" de novo devolve parcela paga para PENDING com o valor do contrato.
   `generateRecurringInstallmentsForPeriod` tem o mesmo upsert.
3. A conciliação proíbe "Ajustar valor" para `CONTRACT_*` (`c_origens_sync` em
   `fn_reconcile_group` = `ORIGENS_VALOR_SINCRONIZADO` no front), por causa do item 2.
4. Aceitar sugestão (`fn_reconcile_match`) não mexe no valor: a parcela fica CONCILIATED
   com o valor previsto, diferente do que saiu do banco.
5. O motor (`planMatching`) só considera título com valor entre 90% e 101% do extrato:
   parcela de R$ 600 nunca é candidata a um PIX de R$ 750.
6. A baixa manual (`BaixaRecebivelSheet` → `darBaixa`) não recebe valor pago.
7. Toda parcela `CONTRACT_RECURRING` tem `contract_id` (384 de 384); `CONTRACT_AVISTA`
   tem 5 sem. `CONTRACT_PARCELADO` é apagado e regravado a cada sync (sem poupar pago).

**Escopo:** a opção vale para contrato RECORRENTE (o caso de medição mensal). No
parcelado, o valor de cada parcela já é digitado no cronograma, e o sync dele
apaga e regrava tudo — ficaria para outro plano.

## Itens

### 1. Banco: modo do contrato e coluna calculada da parcela
- **O que muda:** `contracts.installment_value_mode` text NOT NULL DEFAULT 'FIXO',
  CHECK ('FIXO','VARIAVEL'). Função `valor_variavel(internal_transactions)` (campo
  computado, como `valor_esperado`): true quando o título é `CONTRACT_RECURRING` de
  contrato VARIAVEL. `fn_reconcile_group` deixa o modo `ADJUST_VALUE` passar para título
  com `valor_variavel` (os outros `CONTRACT_*` seguem bloqueados). REVOKE/GRANT da função nova.
- **Como sei que terminou:** migration aplicada; `select valor_variavel(t)` responde;
  `segurancaMigrations.test` verde; ADJUST_VALUE em parcela variável passa e em parcela
  fixa continua recusado (prova por DO + RAISE com ROLLBACK, sem gravar).
- **Status:** ✅ aplicada em 17/10 (a pedido do usuário) e conferida: coluna com padrão FIXO nos 43 contratos, `valor_variavel` e `fn_reconcile_group` com ACL sem anon, exceção do ADJUST_VALUE no corpo

### 2. Sincronização não regrava parcela paga
- **O que muda:** `syncRecurringToFinance` e `generateRecurringInstallmentsForPeriod`
  deixam fora do upsert as parcelas que já existem baixadas (CONCILIATED, PAGO/RECEBIDO).
  Vale para contrato fixo também (corrige o defeito do diagnóstico 2).
- **Como sei que terminou:** teste: parcela paga existente não entra no upsert; parcela
  em aberto continua sendo atualizada.
- **Status:** ✅ `semParcelasBaixadas` em `syncRecurringToFinance` + testes (`__tests__/contratoParcelaVariavel.test.ts`)

### 3. Cadastro do contrato: a opção
- **O que muda:** em Condições de Pagamento, com contrato recorrente: "Valor das parcelas:
  Fixo | Variável (por medição)", com a explicação do que muda. Com Variável, o campo de
  valor vira "Valor estimado por ciclo". Tipo, create/update e leitura do contrato.
- **Como sei que terminou:** typecheck; `check-ui-standard.sh` nos arquivos; conferido na
  tela (gravar e reabrir mantém a escolha).
- **Status:** ✅ conferido em PRODUÇÃO (Playwright, usuário de leitura, escritas bloqueadas): contrato da Débora em Financeiro › Dados Gerais mostra "Variável (por medição)" marcado e "Valor Estimado por Ciclo"; sem erro de console

### 4. Baixa manual com valor pago
- **O que muda:** no painel de baixa, título único e variável mostra "Valor pago"
  (padrão = valor previsto). `darBaixa` grava o valor junto. Em lote, o valor não muda.
- **Como sei que terminou:** teste de componente: título variável mostra o campo e envia
  o valor; título fixo não mostra.
- **Status:** ✅ código + 2 testes de componente (`BaixaRecebivelSheet.test.tsx`)

### 5. Conciliação: sugestão e aceite com o valor do extrato
- **O que muda:** `planMatching` aceita parcela variável fora da faixa de valor quando o
  fornecedor é reconhecido, com pontuação limitada abaixo do automático (só sugestão) e
  motivo explícito. Aceitar sugestão de parcela variável com valor diferente usa
  `ADJUST_VALUE` (a parcela assume o valor do extrato; o anterior fica na auditoria).
  "Ajustar valor" do dock libera para parcela variável. As consultas de títulos pedem
  `valor_variavel`. A Edge Function `reconciliation-engine` é republicada (mesmo código).
- **Como sei que terminou:** testes do motor (variável R$ 600 × PIX R$ 750 do mesmo
  fornecedor = sugestão, nunca automático; fornecedor diferente = nada; fixo = como antes);
  teste da regra do dock.
- **Status:** ✅ código + testes; Edge Function `reconciliation-engine` republicada e sonda 401 (sem header e com a chave anon)

### 6. Contrato da Débora
- **O que muda:** contrato `5e415c72…` vira VARIAVEL; meses com PIX livre do CPF dela
  (único no mês) são conciliados com ADJUST_VALUE; 06/2025 (450 + 150) em grupo. Meses
  sem PIX e ago/2021 seguem em aberto. Backup em tabela de reversão.
- **Como sei que terminou:** seleção conferida a seco antes; depois, as parcelas
  CONCILIATED com o valor do PIX.
- **Status:** ✅ aplicada e conferida: contrato VARIAVEL; 14 parcelas = R$ 750 e 06/2025 = R$ 600 (2 vínculos), todas CONCILIATED; 14 ADJUST_VALUE na auditoria com antes = 600. Em aberto até jul/26: 15 (ago/21, abr/24, ago/24 parciais + 12 meses sem PIX)

## Ordem de publicação (importante)

O código pede o campo computado `valor_variavel` nas consultas da conciliação e lê
`installment_value_mode` do contrato: **publicar antes da migration 050000 quebra a tela
de conciliação e a leitura de contrato**. Ordem: (1) usuário aplica 050000; (2) push do
código + republicar a Edge Function `reconciliation-engine` e a sonda 401; (3) usuário
aplica 050100 (dados da Débora).

## Publicação

- 17/10/2026: migration 050000 aplicada → push `7ebe7d8f` → Edge `reconciliation-engine`
  republicada (sonda 401) → migration 050100 aplicada. Produção conferida servindo
  `7ebe7d8` com o texto novo. Suíte completa antes: 1 falha (`PainelVersoes`, tempo
  esgotado na rodada cheia; passa sozinho 26/26). **Plano: 6 de 6.**
