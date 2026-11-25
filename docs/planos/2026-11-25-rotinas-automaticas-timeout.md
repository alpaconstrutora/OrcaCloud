# Rotinas automáticas — tela em timeout e "Tarefas de pagamento" desligada

## Pedido original

> eu ha havia pedido para desativar essa coisa de tarefa automatica. verifique

> Configurações do Sistema > Rotinas automáticas: Nenhuma rotina encontrada
> mensagem de erro apos ficar long periodo carregando : Não foi possível carregar as rotinas: canceling statement due to statement timeout

> sim  *(resposta a: "Sigo com as duas coisas: a correção da tela e desligar a rotina com as tarefas?")*

Sessão: 2fa533a4-7f83-4970-b449-2ffbf1696cc3 · 25/11/2026, ~19h (BRT)

Contexto: a pergunta anterior foi por que apareceram várias tarefas "Pagar: …" de tributos em
Minhas tarefas. Eram 15 tributos (PIS/COFINS/INSS, vencimento 25/11) × 6 membros da Alpa = 90
tarefas, mais 6 de um pedido. A `daily-payment-tasks` não aplica o corte do #269 (tributo sem
DARF enviado não está em Contas a Pagar). Não foi encontrado registro de pedido anterior para
desligar a rotina (conversas desde 27/10, registro da tela, memórias e commits).

## Itens

### 1. Desligar a "Tarefas de pagamento" e fechar as tarefas dela — ✅ 25/11

- O que muda: `daily-payment-tasks` desligada por `fn_rotina_automatica_definir` (com as
  credenciais do usuário, fica no registro da tela); as tarefas abertas com
  `source_module = 'financeiro'` e `source_ref.type = 'internal_transaction'` vão para `done`.
- Como sei que terminou: `cron.job.active = false`; linha em `rotinas_automaticas_alteracoes`
  (22:39 GMT, desenvolvedor@); 96 tarefas em `done`, 0 abertas.

### 2. Tela de Rotinas sem timeout — migration `aplicar_20271125950000`

- O que muda: `ALTER FUNCTION fn_rotinas_automaticas_listar() SET enable_seqscan = off`.
  Causa e medidas no cabeçalho da migration.
- Como sei que terminou: `proconfig` da função contém `enable_seqscan=off`; EXPLAIN da janela
  mostra Bitmap Index Scan com ~13,9 mil páginas (antes Seq Scan com 40,8 mil); a tela carrega.

## Fora deste plano

- Se a rotina for religada um dia, ela precisa do mesmo corte de tributo do #269
  (`motivoForaDeContasAPagar` em `utils/darf.ts`) antes de gerar tarefa.
- O arquivo de `cron.job_run_details` só encolhe com VACUUM FULL pelo dono (supabase_admin).
