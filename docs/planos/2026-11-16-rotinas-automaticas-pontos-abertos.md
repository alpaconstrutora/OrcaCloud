# Rotinas automáticas — os três pontos que ficaram de fora do #522

## Pedido original

> Corrigir os pontos citados

Referência: os três pontos do fechamento do PR #522
(`docs/planos/2026-11-16-rotinas-automaticas-pendencias-menores.md`):

1. **Histórico de execuções:** `cron.job_run_details` guarda ~475 mil linhas (329 MB) e nunca é
   limpo.
2. **Informação só ao passar o mouse:** na tela Configurações › Rotinas automáticas, o último
   erro e a contagem de execuções moram só no `title` — quem usa só teclado ou tela de toque não
   vê.
3. **"Tarefas de pagamento"** (`daily-payment-tasks`) falha todo dia em que há conta vencendo.

## O que a investigação achou

### 3. Tarefas de pagamento — nunca criou uma tarefa

- `generate_payment_tasks(3)` chama `create_task(…, p_priority := 1, …)`. O literal `1` é
  `integer`; o parâmetro é `smallint`, que só aceita conversão por atribuição — não na escolha
  da função. Erro 42883 `function public.create_task(…) does not exist`.
- Só quebra quando chega no `create_task`, isto é, quando há conta no intervalo. Nos dias sem
  conta "dá certo" (`1 row`). Histórico de 19/09 a 16/11: falha em todo dia com conta.
  `tasks` tem **0** tarefas com `source_module = 'financeiro'`: nunca funcionou.
- Mais dois defeitos que a correção do tipo exporia:
  - filtra por `transaction_date` (data do lançamento), não por `due_date` (vencimento), e não
    olha `business_status` — o aviso irmão `fn_notif_pagamento_proximo` (migration
    `20270919000002`, decisão do usuário em 03/09: "tarefa E notificação para o mesmo fato") usa
    `due_date` e exclui `PAGO`, `RECEBIDO`, `CANCELADO`, `RENEGOCIADO`;
  - a idempotência é o índice `uq_tasks_source_open`, que só cobre tarefa **aberta**: a pessoa
    conclui a tarefa e, no dia seguinte (a janela é de 3 dias), ela volta;
  - o link da tarefa é `route: 'financial'`, uma tela que não existe; o aviso usa
    `/contas-a-pagar?tx=<id>`, que abre a tela já no título.
- Volume hoje: 1 conta (Garden Cambuhy) × 6 membros = 6 tarefas.
- `services/taskService.ts › generatePaymentTasks` repete a lógica antiga no cliente, mas
  ninguém chama — fica fora (não é o job).

### 1. Histórico — 475 mil linhas, ~4 mil por dia

- A tela olha 40 dias (última execução) e 7 dias (falhas). Nada mais no código lê
  `cron.job_run_details` (só migrations das rotinas e o teste de segurança).
- `cron.job_run_details` só tem índice na chave `runid`; filtrar por data varre a tabela.

### 2. Tela — o que mora só no `title`

- Falhas: "N de M execuções nos últimos 7 dias falharam" e o último erro com data e mensagem.
- Última execução: a situação "concluída"; o "—" (nenhuma em 40 dias).
- "Religada fora desta tela": a explicação.
- "O que faz" cortado em 2 linhas: o texto inteiro.

## Decisões (minhas, pelo pedido; o usuário pode corrigir)

- **3:** corrigir `generate_payment_tasks` (mesma assinatura → CREATE OR REPLACE):
  - `p_priority := 1::smallint`;
  - mesmo filtro do aviso: `due_date` entre hoje e hoje + N, `status = 'PENDING'`,
    `business_status` fora de `PAGO/RECEBIDO/CANCELADO/RENEGOCIADO`, organização preenchida;
  - uma tarefa por pessoa por conta, **nunca recriada**: pula se já existe tarefa
    `financeiro`/`internal_transaction` para aquela pessoa e conta, em qualquer situação;
  - link `/contas-a-pagar?tx=<id>`; descrição "Vencimento em dd/mm/aaaa • R$ …" (`fn_brl`);
  - segue criando para cada membro da organização (desenho original + decisão de 03/09).
- **1:** rotina nova `limpar-historico-rotinas`, todo dia às 06:30 GMT (03:30 de Brasília):
  `fn_rotinas_limpar_historico(60)` apaga as execuções com mais de **60 dias**.
  - Corte achado pela mesma busca binária no `runid` da tela; apaga `runid < corte` (pela chave,
    e leva junto as órfãs de reinício, que não têm data).
  - Recusa menos de 40 dias (22023): a tela olha 40.
  - Só `postgres` executa (REVOKE de PUBLIC, anon e authenticated).
  - Entra no catálogo, grupo "Técnicas", não sensível.
  - A primeira execução apaga ~235 mil linhas; o espaço volta para a tabela (autovacuum), o
    arquivo não encolhe.
- **2:** "Falhas em 7 dias" vira um **botão** (teclado e toque) que abre uma linha de detalhes
  abaixo da rotina (`renderExpanded`, padrão da tabela): o que faz por inteiro, nome técnico e
  expressão do horário, última execução com a situação, a frase das execuções da semana, o último
  erro completo, e a explicação do "Religada fora desta tela" quando for o caso. `aria-expanded`
  no botão.

## Plano

### Tarefa 1 — Tarefas de pagamento

- [ ] Prova SQL (`scripts/teste-tarefas-pagamento.sql`, BEGIN…ROLLBACK, conta e membros
      montados na transação): vermelho antes, verde depois:
  - cria 1 tarefa por membro para conta DEBIT vencendo em 2 dias, prioridade 1, link
    `/contas-a-pagar?tx=`;
  - não cria para conta com lançamento no intervalo mas vencimento fora;
  - não cria para `business_status = 'PAGO'`;
  - rodar de novo não duplica; concluir e rodar de novo não recria.
- [ ] Migration `aplicar_20271116916400_tarefas_pagamento_corrige.sql`; ensaio; aplicar.
- [ ] Rodar a rotina uma vez e conferir as tarefas criadas.

### Tarefa 2 — Limpeza do histórico

- [ ] Prova SQL (`scripts/teste-rotinas-automaticas.sql`, pernas novas): recusa 39 dias;
      com linhas montadas na transação (runid negativo, data antiga, e uma órfã), apaga só as
      antigas; o job `limpar-historico-rotinas` existe, ligado, às 06:30.
- [ ] Migration `aplicar_20271116916300_rotinas_limpar_historico.sql`; ensaio; aplicar.
- [ ] Catálogo: `limpar-historico-rotinas` em "Técnicas" (teste do catálogo primeiro).
- [ ] Rodar a limpeza uma vez; anotar linhas apagadas e o tempo.

### Tarefa 3 — Detalhes sem mouse

- [ ] Testes da tela (vermelho antes): o botão de falhas tem `aria-expanded`; clicar mostra o
      último erro e a frase da semana como texto; Enter também abre; "—" explica os 40 dias
      no detalhe; "Religada fora desta tela" explica no detalhe.
- [ ] Implementar com `renderExpanded`; `check-ui-standard` e `tsc`.
- [ ] Conferir na tela.

### Tarefa 4 — Publicação

- [ ] Revisão independente; PR; CI; merge; conferir produção; fechar a frente.
