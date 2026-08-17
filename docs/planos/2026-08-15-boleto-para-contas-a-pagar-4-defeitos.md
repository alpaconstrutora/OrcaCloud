# Fluxo Boletos a Pagar → Contas a Pagar: os 4 defeitos da travessia

## Pedido original

Sessão `6d6cee0a-c071-43a3-b7eb-6a233ebb378b` · 2026-08-15 (continuação do
`2026-08-15-contas-a-pagar-tela-dedicada.md`, mesma sessão)

> fluxo para analisar.
> 1. Boletos a Pagar: os boletos a pagar que foram aprovados devem ser lançados no contas a pagar. dessa forma o boletos a pagar serve para analise e aprovacao de quais boletos devem ou nao ser lançados

Depois da análise, o pedido de solução:

> qual a melhor forma de resolver os 4 defeitos?

E a decisão do portão que ficou aberto:

> deve passar pela alcada

## Diagnóstico

O fluxo pedido **já existe**: `boletoService.aprovarECriarInvoice` cria uma
`invoices` + uma `internal_transactions` (DEBIT), e a `vw_payables` leva essa
transação para Contas a Pagar › Parcelas. O que está quebrado é a travessia.

### Correção de um diagnóstico meu, anterior

Na primeira análise eu disse que "o título chega como Previsto, nunca Aprovado" era
defeito. **Não é.** `business_status='APROVADO'` já tem dono: é a alçada
(`financialApprovalService.ts:107`, junto com `AGUARDANDO_APROVACAO` e `BLOQUEADO`).
`PREVISTO` é o status correto de um título recém-aberto. O que sobrou ali é outra
coisa — o boleto pulava a alçada — e virou o item 3 deste plano por decisão do usuário.

### Defeito A — baixa não atravessa (o mais grave)

`vw_payables.effective_status` deriva **só** de `business_status`. Mas cinco
produtores gravam `status='CONCILIATED'` sem tocar em `business_status`:

| Produtor | Linha |
|---|---|
| `bankReconciliationService` | 727 |
| `divergenceService` | 167 |
| `financialService` | 81 |
| `financialSyncService` | 80, 105 |
| `boletoService.marcarPago` | 520 |

Consequência: **conciliar no extrato ou pagar o boleto não dá baixa em Contas a
Pagar** — o título fica "Previsto"/"Vencido". O boleto era só o sintoma visível.

O argumento que decide o formato da correção: os outros leitores do sistema **já
checam os dois campos** (`commercialFinanceService:451`, `taxPayableService:710`:
`status !== 'CONCILIATED' && business_status !== 'PAGO'`). A `vw_payables` é a única
que olha um campo só. Corrigir na **view** conserta os 5 de uma vez, retroativamente,
e os que ainda não existem — é a mesma lição que `20270840000000` já escreveu para o
`COALESCE`: *"a view não pode depender de o produtor lembrar de preencher a coluna"*.

### Defeito B — sem caminho de volta

Baixa dada pelo Contas a Pagar (`payableService.updateStatus`) não volta para o
boleto, que continua `aprovado`. E a baixa pode vir de 3 telas (Contas a Pagar,
Conciliação, Divergências) — consertar em cada chamador repete o defeito A.

### Defeito C — origem crua e não filtrável

`ORIGEM_PT` tem 5 chaves; o código grava pelo menos 12 `source_system`. Faltam
**BOLETO, NFE, LABOR, PROLABORE, DIVIDENDOS, CONTRACT_AVISTA, CONTRACT_RECURRING**.
Hoje não dá para filtrar Folha, NF-e, Pró-labore ou Dividendos em Contas a Pagar, e
os sete aparecem em caixa alta.

### Defeito D — boleto pulava a alçada

`aprovarECriarInvoice` gravava `approval_status: 'APROVADO'` direto no insert: o
título nascia autoaprovado e nunca entrava em `listPendingQueue` (que filtra
`approval_status='PENDENTE'`).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-15 | Título vindo de boleto deve passar pela alçada financeira, ou a aprovação na tela de Boletos já vale como final? | **Deve passar pela alçada** |

Consequência aceita: o título passa a nascer `AGUARDANDO_APROVACAO`. Sem faixa
configurada em `financial_approval_config`, `resolveRequiredLevels` devolve null e
`approvalService.submit` assume **1 nível** — ou seja, todo boleto aprovado fica
parado até alguém aprovar em Financeiro › Aprovações.

## Plano

### 1. `supabase/migrations/20270909000000_effective_status_conciliated.sql` (novo)

**O que muda:** recria `vw_payables` e `vw_receivables` com o `effective_status`
considerando `status='CONCILIATED'` como baixa efetiva, sem atropelar um
`business_status` posto de propósito:

```sql
CASE
  WHEN it.status = 'CONCILIATED'
   AND COALESCE(it.business_status,'PREVISTO') NOT IN ('PARCIAL','RENEGOCIADO')
  THEN 'PAGO'   -- 'RECEBIDO' na vw_receivables
  WHEN COALESCE(it.business_status,'PREVISTO')
       IN ('PREVISTO','EMITIDO','ENVIADO','APROVADO')
   AND it.due_date IS NOT NULL AND it.due_date < CURRENT_DATE
  THEN 'VENCIDO'
  ELSE COALESCE(it.business_status,'PREVISTO')
END
```

Duas decisões dentro disso, ambas sinalizadas ao usuário:
- `PARCIAL`/`RENEGOCIADO` sobrevivem ao CONCILIATED (são estados que alguém escolheu).
- `APROVADO` entra na regra de VENCIDO: título liberado pela alçada e com vencimento
  no passado hoje mostra "Aprovado", escondendo o atraso. `AGUARDANDO_APROVACAO`
  **fica de fora** de propósito — ainda não é obrigação a pagar, vive na fila de
  aprovação.

Manter `security_invoker=on` e o `REVOKE PUBLIC` das duas views.

**Como sei que terminou:** um título com `status='CONCILIATED'` e `business_status`
nulo aparece como **Pago** em Contas a Pagar; um `PARCIAL` conciliado continua Parcial.

### 2. `supabase/migrations/20270909000001_trg_boleto_baixa.sql` (novo)

**O que muda:** trigger AFTER UPDATE em `internal_transactions`: quando
`source_system='BOLETO'` e a linha passa a `status='CONCILIATED'` ou
`business_status='PAGO'`, atualiza `boletos.status='pago'` (por `reference_id`) e a
`invoices` associada para `paid`. Precedente: `trg_strip_system_project_from_internal_tx`.

**Como sei que terminou:** marcar PAGO em Contas a Pagar deixa o boleto como "Pago"
em Boletos a Pagar, sem passar pela tela de boletos.

### 3. `services/boletoService.ts` (editado)

**O que muda:** `aprovarECriarInvoice` para de gravar `approval_status: 'APROVADO'` no
insert e passa a submeter a transação à alçada via
`financialApprovalService.submitForApproval(txId)` — que resolve os níveis pela faixa
e grava `approval_status='PENDENTE'` + `business_status='AGUARDANDO_APROVACAO'`.

**Como sei que terminou:** aprovar um boleto faz o título aparecer em Financeiro ›
Aprovações; aprovado lá, vira `APROVADO` e some da fila.

### 4. `components/ContasPagarParcelas.tsx` (editado)

**O que muda:** `ORIGEM_PT` completo (12 origens); o filtro Origem passa a ser
derivado dos `source_system` **presentes nas linhas carregadas**, não de uma
constante — origem nova nunca mais nasce invisível; rótulo com fallback title-case.
`STATUS_PT`/`STATUS_COLORS`/`STATUS_FILTROS` ganham `AGUARDANDO_APROVACAO` e
`BLOQUEADO`, que passam a existir de verdade por causa do item 3.

**Como sei que terminou:** a coluna Origem mostra "Boleto"/"Folha"/"NF-e" em vez do
código; o filtro lista só as origens que existem nos dados; boleto recém-aprovado
aparece como "Aguardando aprovação".

### 5. Verificações (REGRA #1)

`check-ui-standard.sh` nos arquivos tocados, `tsc --noEmit`, `npm run build`,
`orgContextGuard`, `migrationsPrefixo`.

## Estado

Código implementado em 2026-08-15. **As duas migrations NÃO foram aplicadas** —
não tenho credencial de escrita no banco. Sem elas, os itens 3 e 4 rodam mas os
defeitos A e B continuam de pé.

- [x] Item 1 — migration `20270909000000_effective_status_conciliated.sql` **escrita,
      não aplicada**
- [x] Item 2 — migration `20270909000001_trg_boleto_baixa.sql` **escrita, não aplicada**
- [x] Item 3 — `boletoService.aprovarECriarInvoice` submete o título à alçada
- [x] Item 4 — `ContasPagarParcelas`: 12 origens, filtro derivado dos dados, status de
      alçada com rótulo e cor
- [x] Item 5 — verificações mecânicas

### Ordem de aplicação

As migrations são independentes entre si, mas o item 3 **depende da 20270909000000**
para o dia a dia fazer sentido: sem ela, um boleto submetido à alçada e depois pago
continuaria aparecendo como "Aguardando aprovação"/"Vencido" em Contas a Pagar.
Aplicar `20270909000000` primeiro, depois `20270909000001`, ambas pelo SQL Editor.

O bloco 3 da conferência da `20270909000001` lista as divergências **herdadas**
(boleto ainda 'aprovado' com título já conciliado) — a trigger só age em updates
futuros. O backfill está escrito e comentado ali, para rodar depois de conferir.

### O que foi verificado

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | passa |
| `npm run build` | passa |
| `check-ui-standard.sh` em `ContasPagarParcelas.tsx` | 1 acusação, **falso positivo** (ver abaixo) |
| `orgContextGuard` | 14/14 |
| `migrationsPrefixo` | 3/3 (prefixos `20270909*` livres) |

**Falso positivo do §7:** o checker acusa
`<h3 className="text-lg font-bold …">Nenhuma parcela encontrada</h3>`. Não é célula
de tabela — é o **empty state (§12)**, que o guia prescreve exatamente com
`text-lg font-bold text-gray-900 mb-2`. O awk trava aberto no `<td>` que aparece
**dentro do comentário** da linha 153 (armadilha já conhecida). Confirmado
preexistente: a mesma linha é acusada na versão em `HEAD`, antes desta tarefa.

### Verificação no banco (2026-08-15, migrations aplicadas pelo usuário)

| Conferência | Resultado |
|---|---|
| `vw_payables` / `vw_receivables` existem e negam anon | HTTP 401 (tabela inexistente devolve 404 — calibrado) |
| **Defeito A em dado real:** `effective_status` dos `CONCILIATED` | **569 linhas, todas `PAGO`** |

As 569 apareciam como Previsto/Vencido antes — muitas já pagas e marcadas em vermelho
como atrasadas. É a medida do estrago que o defeito A causava.

### Achados de dados durante a conferência (não são desta tarefa)

1. **9 boletos herdados** ficaram `aprovado` com título já conciliado — a trigger só
   age em updates futuros. Nenhum cancelado, então o backfill pega os 9. O backfill
   do bloco 3 da `20270909000001` foi **corrigido depois de aplicada** (só o
   comentário): a primeira versão esquecia as `invoices`.
2. **6 desses 9 estão `CONCILIATED` sem `payment_date`.** Título liquidado sem data de
   pagamento; o suspeito é `financialService.ts:81`, que grava o status sem a data.
   Atrapalha qualquer relatório por data de pagamento.
3. **Três boletos com vencimento em 2017** — investigados e **descartados como bug**:
   `metodo_extracao='pdf_text'`, `confidence_score=100`, `checksum_valido=true`, e o
   fator de vencimento (~7141) resolve corretamente pela regra antiga. São documentos
   antigos de verdade, regularizados em 2026.
4. **Risco latente no parser FEBRABAN:** `fatorVencimentoToDate`
   (`utils/febrabanRules.ts:95`) desambigua o ciclo antigo × novo por **proximidade de
   `new Date()`**. O mesmo boleto pode ser lido com vencimentos diferentes conforme
   *quando* é importado, e na faixa de fator 1000–1666 um boleto de 2000–2002 é lido
   como vencendo nos próximos meses. O item 3 provou que o sistema recebe documentos
   de 9 anos atrás, então a faixa não é hipotética.

### REGRESSÃO introduzida pelo defeito A, encontrada em 2026-08-15

O usuário desfez uma conciliação e isso expôs um efeito colateral da correção da view.

`payableService.updateStatus` (e os espelhos em `receivableService` e
`taxPayableService`) só sabiam empurrar o status para frente:

```ts
if (newStatus === 'PAGO')      updates.status = 'CONCILIATED';
if (newStatus === 'CANCELADO') updates.status = 'CANCELLED';
// voltar para PREVISTO não mexia em `status` — ficava CONCILIATED
```

Enquanto `effective_status` derivava só de `business_status`, isso era inofensivo:
desmarcar "Pago" gravava `PREVISTO` e a tela obedecia. **Depois de
`20270909000000`, a view lê os dois campos** — e o estado contraditório
`status='CONCILIATED'` + `business_status='PREVISTO'` volta a ser lido como **PAGO**.
Ou seja: dava para marcar como pago, mas não para desmarcar.

Corrigido nos três serviços: voltar para estado aberto agora zera `status` para
`PENDING` e `payment_date` para `NULL`. `PARCIAL`/`RENEGOCIADO` ficam de fora — a
view os respeita explicitamente e eles guardam um pagamento parcial real.

**A tela de Conciliação já fazia certo**: `handleUndoMatch`
(`components/BankReconciliation.tsx:2064`) sempre devolveu `status='PENDING'`,
`payment_date=NULL` e reverteu boleto+invoice. Foi o modelo da correção — e é por
isso que o caminho que o usuário usou não quebrou.

Junto, `20270909000003` torna a trigger do boleto **reversível**: a de
`20270909000001` só tratava a ida, então desmarcar "Pago" pelo Contas a Pagar
deixava o boleto preso em 'pago'. Agora a função decide a direção, e na volta só
desfaz o que ela mesma fez (não encosta em 'cancelado'/'rascunho'/'revisao').

### O que NÃO foi verificado

Nada foi aberto no navegador. Os itens 3 e 4 do plano (alçada e origens) têm o
comportamento provado só por `tsc`/`build` — falta o passo a passo da seção seguinte.
O backfill dos 9 boletos ainda não foi confirmado como executado.

## Verificação de ponta a ponta

1. Aprovar um boleto → título aparece em Contas a Pagar como "Aguardando aprovação" e
   na fila de Financeiro › Aprovações.
2. Aprovar na alçada → título vira "Aprovado" (ou "Vencido", se atrasado).
3. Marcar Pago em Contas a Pagar → boleto vira "Pago" em Boletos a Pagar (trigger).
4. Conciliar um lançamento DEBIT qualquer no extrato → o título correspondente aparece
   como "Pago" em Contas a Pagar (defeito A, valendo para os 5 produtores).
5. Filtro Origem lista Boleto/Folha/NF-e/etc. conforme os dados presentes.
