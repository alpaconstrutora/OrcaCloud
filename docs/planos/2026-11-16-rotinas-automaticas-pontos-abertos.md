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

- [x] Prova SQL (`scripts/teste-tarefas-pagamento.sql`, BEGIN…ROLLBACK, conta e membros
      montados na transação): vermelho antes, verde depois:
  - cria 1 tarefa por membro para conta DEBIT vencendo em 2 dias, prioridade 1, link
    `/contas-a-pagar?tx=`;
  - não cria para conta com lançamento no intervalo mas vencimento fora;
  - não cria para `business_status = 'PAGO'`;
  - rodar de novo não duplica; concluir e rodar de novo não recria.
- [x] Migration `aplicar_20271116916400_tarefas_pagamento_corrige.sql`; ensaio; aplicar.
      RED: 42883 `create_task(… p_priority => integer …)`. Ensaio e banco aplicado: `TUDO OK`.
      A revisão do plano acrescentou: `authenticated` tinha EXECUTE (qualquer logado disparava a
      geração para todas as organizações) → REVOKE; ninguém no app chama a função.
- [x] ~~Rodar a rotina uma vez~~ — não rodei à mão: a prova chama a função sobre os dados reais
      (inclusive a conta do Garden que vence em 18/11) dentro da transação e passa. A primeira
      execução de verdade é 17/11 às 04:00 (1 conta × 6 membros).

### Tarefa 2 — Limpeza do histórico

- [x] Prova SQL (`scripts/teste-rotinas-limpar-historico.sql` — arquivo próprio): recusa 39 dias;
      com linhas montadas na transação (runid negativo, data antiga, e uma órfã), apaga só as
      antigas; o job `limpar-historico-rotinas` existe, ligado, às 06:30.
- [x] Migration `aplicar_20271116916300_rotinas_limpar_historico.sql`; ensaio; aplicar.
      RED: 42883 `fn_rotinas_limpar_historico(integer) does not exist`. Ensaio e banco: `TUDO OK`;
      `teste-rotinas-automaticas.sql` segue `TUDO OK`.
- [x] Catálogo: `limpar-historico-rotinas` em "Técnicas" (teste do catálogo primeiro: 2 RED → 20/20).
- [x] Rodar a limpeza uma vez: **242.865 linhas apagadas** em ~6 s (com a ida e volta do CLI).
      Antes 475.713 linhas desde 25/02 (330 MB); depois 232.850 desde 18/09.

### Tarefa 3 — Detalhes sem mouse

- [x] Testes da tela (vermelho antes — 4 RED "Unable to find role=button" → 26/26): o botão de falhas tem `aria-expanded`; clicar mostra o
      último erro e a frase da semana como texto; Enter também abre; "—" explica os 40 dias
      no detalhe; "Religada fora desta tela" explica no detalhe.
- [x] Implementar com `renderExpanded`; `check-ui-standard` exit 0; `tsc` 0 erros; 81/81 nos 6
      arquivos (rotinas, service, tela, segurança das migrations, prefixo, orgContextGuard).
- [x] Conferir na tela — **sem login** (a janela do Playwright esperou 2 × 15 min): página de
      teste local, fora do commit, com a tela REAL e a RPC respondida com as 24 linhas reais
      (lidas como superadmin, só leitura). Tabela rolada até o fim, detalhe aberto, medido:
      - 1º desenho (`max-w-[min(48rem,calc(100vw-2rem))]`): **cortava** ~100 px numa área de 680
        (notebook 1280) e ~14 px a 390 → o limite passou a vir do contêiner que rola, medido
        (`clientWidth − 24`, teto 768, `ResizeObserver`); teste RED (`expected '' to be '656px'`)
        → GREEN; medido de novo: cabe a 1440 (área 840), 1280 (680) e 390 (358);
      - a fonte Inter desenhava `=>` como `⇒` no último erro → ligadura desligada só ali
        (`font-feature-settings: 'calt' 0`), com teste.
      - A 390 px a página de Configurações inteira continua quebrada (o menu da página não recolhe
        — problema antigo, fora desta frente); a medida a 390 supõe a área toda para a tabela.

### Tarefa 4 — Publicação

- [ ] Revisão independente; PR; CI; merge; conferir produção; fechar a frente.

## Revisão independente (16/11) — 0 crítico, 3 importantes, 10 menores

Resolvidos nesta frente, cada um com teste ou prova que falhou antes:

- **I1 — detalhe abria fora da vista** com a tabela rolada (botão na última coluna; medido
  ~450 px fora a 390 px). O botão foi para a **coluna Rotina** (chevron, nome fixo "Detalhes de
  …", `aria-expanded`) e o bloco segue o §6.13 (`sticky left-3 max-w-[min(48rem,calc(100vw-2rem))]`).
  Resolve também M5 (botão passava da coluna de 90 px), M6 (disparador escondido na coluna
  Falhas) e M7 (nome mudava com o estado).
- **I2 — a tarefa não acompanhava a conta.** Migration `aplicar_20271116916500_…_acompanha_conta`
  (aplicada): conta paga/conciliada/cancelada/renegociada/apagada fecha as tarefas abertas;
  conta adiada muda a data delas; o vencimento entra na chave (`source_ref.due`) — concluída não
  volta, adiada para outro vencimento gera tarefa nova. Tarefa adiada pela pessoa (`snoozed`)
  conta como não concluída.
- **I3 — a prova passava com filtros errados.** Contas D (CREDIT), E (vencida ontem), F
  (`business_status` NULL), G (CONCILIATED), H (+4), I (hoje), J (+3, borda) e o ciclo de vida.
  Sabotagens conferidas: sem `direction = 'DEBIT'` → "FALHOU: D"; janela começando 30 dias atrás
  → "FALHOU: E".
- **M4** `role="region"` saiu do `<dl>` para um `<div>` em volta. **M8** sem `font-mono` na célula
  (§7) e o padrão registrado no §6.13 do guia. **M9** membro órfão (`user_id` fora de
  `auth.users`) derrubava a rotina inteira com 23503 — agora é pulado (RED reproduzido: 23503).
  **M11** prova da limpeza encostada na fronteira: `<=` no lugar de `<` → "FALHOU: veio 4".
  **M12** textos de privilégio corrigidos (postgres e service_role mantêm EXECUTE). **M13**
  `taskService.generatePaymentTasks` (lógica antiga, sem uso) apagado.

Decisões (minhas; o usuário pode corrigir):

- **M10 — tarefa EXCLUÍDA volta** na execução seguinte enquanto a conta estiver na janela (não
  há registro de "já gerada"). Concluir é o jeito de dispensar. Registrado na migration.
- Tarefa para **todos os membros** da organização (inclusive quem não vê o Financeiro) e os
  status RETIDO/AGUARDANDO_APROVACAO incluídos — segue o aviso irmão e a decisão de 03/09.

Fora desta frente (achado da revisão, anterior a ela): `create_task` é SECURITY DEFINER, tem
EXECUTE para `authenticated` e não confere nada por dentro — qualquer usuário logado cria tarefa
na agenda de qualquer pessoa de qualquer organização (REGRA #7). Pede frente própria: os módulos
que criam tarefa para outra pessoa precisam ser mapeados antes de travar.
