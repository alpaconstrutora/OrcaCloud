# Eliminar a rotina de avisos de renovação de contratos

## Pedido original

Sessão 6c0adccf-b0a9-4fb9-8f72-0d2151bc86c4, 16/11/2026, nesta ordem:

> "exclua renovar contrato"

> "1. excluir completamente  2. me explica como funciona as renovações e copias por pessoa"

> "aonde edito essas renovacoes automaticas?"

> "que coisa sem sentido essa rotina! Elimine isso!"

## Contexto

O usuário pediu para conferir a tela do celular do Iago, e ela mostrava duas tarefas "Renovar contrato" (001 e 010). Elas vinham de uma rotina automática.

- **Quando rodava:** o job `daily-rental-renewal-alerts`, todo dia às 04:30 BRT, chamava `generate_rental_renewal_alerts(60)`.
- **Que contratos pegava:** contratos Ativo/Assinado de Locação, Serviços ou Suprimentos, com fim entre hoje−30 e hoje+60 e sem contrato-filho.
- **O que criava:** para cada contrato, **uma tarefa por membro da organização** (agenda pessoal, sem responsável) e um aviso no sininho a cada 7 dias.
- **Por que voltava:** a tarefa só não duplicava enquanto a cópia da pessoa estava aberta. Concluir ou excluir fazia ela voltar no dia seguinte.
- **Por que acumulava:** as cópias eram independentes. O Altair concluiu a dele do contrato 010, e as dos outros seguiram abertas.
- **Sem tela para ajustar:** a regra não tinha tela de configuração. O "prazo de aviso" por contrato (`renewal_notice_days`) existe no banco, mas não tem campo no app.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 16/11/2026 | Excluir as tarefas "Renovar contrato"? | "exclua renovar contrato" |
| 16/11/2026 | Até onde vai a exclusão? | "Elimine isso!": a rotina inteira, com tarefas e avisos. Leitura minha, a mesma opção que eu tinha descrito como "desligo a rotina inteira e apago as 53 notificações" |

## Plano

| Item | O que muda | Como sei que terminou |
|---|---|---|
| Tarefas existentes | `DELETE` das 10 tarefas `source_ref.type = 'contract_renewal'` (contratos 001 e 010). Backup em `c:/tmp/backup_tasks_renovar_contrato_2026-11-16.json` | `count = 0` |
| Rotina | `supabase/migrations/aplicar_20271116600000_eliminar_rotina_renovacao_contratos.sql` desagenda o job e remove a função | `cron.job` sem o job e `pg_proc` sem a função |
| Avisos existentes | `DELETE` das 53 notificações `contrato_vencimento` (`rental_renewal`: 0). Backup em `c:/tmp/backup_notifications_renovacao_2026-11-16.json` | `count = 0` |
| `components/notifications/notificationTypes.ts` | Comentário dizendo que o produtor foi eliminado. Os rótulos ficam para o caso de restaurar o backup | O comentário existe |

## Estado

- [x] 10 tarefas excluídas, com backup
- [x] Migration aplicada no remoto em 16/11/2026: `job_existe = 0`, `funcao_existe = 0`
- [x] 53 avisos excluídos, com backup. Conferido: 0 avisos e 0 tarefas restantes
- [ ] PR, CI e merge

## O que NÃO muda

- **Renovação de Locação pela tela** (Comercial › Locações › Renovações): ela renova criando um contrato-filho e não dependia da rotina.
- **Contratos:** status, datas e aditivos não foram tocados. O contrato 001 (Energia Elétrica) segue Ativo, com fim em 01/01/2027.
- **Avisos de reajuste de contrato** (`contrato_reajuste`) e os financeiros (`pagamento_*`): são outras rotinas e continuam.

## Rollback

1. Recriar a função a partir de `20270919000002_notificacoes_avisos_financeiros.sql`, mais o REVOKE de anon de `aplicar_20270916000001`.
2. Reagendar o job:
   `SELECT cron.schedule('daily-rental-renewal-alerts', '30 7 * * *', 'SELECT public.generate_rental_renewal_alerts(60);');`
3. Se quiser os registros antigos de volta, reinserir as linhas dos dois backups.
