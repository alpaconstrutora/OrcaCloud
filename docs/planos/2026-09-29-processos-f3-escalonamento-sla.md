# Processos — F3: escalonamento por SLA, bloqueio e responsável (restante da Fase 3)

## Pedido original

> f3
>
> Sessão: 8d15a5ed · 2026-09-29 (madrugada)

Contexto do pedido (mesma sessão, minutos antes): ao fechar as pendências do plano
`2026-09-28-torre-p2p-processos.md`, listei o que restava do roadmap de
`PLANO_MODULO_PROCESSOS.md` e recomendei: *"o próximo passo natural é a F3 restante
(escalonamento por SLA vencido, agora que o prazo por etapa nasce na hora certa)"*.
O usuário respondeu "f3".

## O que "F3 restante" significa (de `PLANO_MODULO_PROCESSOS.md` §7)

> Fase 3 — Regras e automações: `process_rules` (condição por valor/obra/fornecedor),
> **escalonamento, bloqueio, gatilho automático**.

Condição por etapa e gatilhos automáticos já foram entregues (Passos 3 e 4 do plano
de 28/09). Sobram **escalonamento**, **bloqueio** e o **responsável por
departamento/cargo** (F1 deixou: "DEPARTMENT/ROLE ficam sem responsável — usuário
assume via Assumir etapa").

## O que já existe e será reaproveitado (lido em `origin/main` em 2026-09-29)

| Peça | Estado | Uso aqui |
|---|---|---|
| `process_instance_steps.due_at` | nasce quando a etapa começa (Passo 4, 28/09) | é a régua do SLA |
| `ProcessInstanceStatus` | já tem `ATRASADO` e `BLOQUEADO` no CHECK desde a F0 — nunca usados | passam a ser gravados |
| `ProcessInstanceStepStatus` | `PULADO` em uso; nada de "atrasado" no passo (atraso é derivado de `due_at`) | mantém |
| `fn_warranty_sla_sweep()` + `cron.schedule('warranty-sla-sweep')` | sweep **SQL puro** em `pg_cron`, `SECURITY DEFINER`, idempotente por (registro, prazo), diário | **molde** — sem Edge Function, sem `CRON_SECRET`, sem HTTP |
| `notifications` (`recipient_email, title, message, link, type, organization_id`) | sino do app, por e-mail | destino dos avisos de atraso/escalonamento |
| `organization_members` (`user_id, email, name, role`) | lista de membros com e-mail | seletor de responsável/escalado e resolução `user_id → email` |
| `employees` (`user_id, department_id, role_id`) · `company_departments` · `org_roles` | vínculo pessoa ↔ departamento/cargo existe | F3.2 (fora deste plano) |
| `process_audit_logs` | log por instância | `STEP_OVERDUE`, `STEP_ESCALATED`, `INSTANCE_BLOCKED/UNBLOCKED` |
| Torre P2P (`instanciaAtrasada`) e `fn_process_bottlenecks` | já derivam atraso de `due_at`/status | ganham o status `ATRASADO` gravado de graça |

## Decisões tomadas

| Data | Pergunta | Decisão |
|---|---|---|
| 2026-09-29 | Edge Function por cron (padrão `task-alert-notifier`) ou sweep SQL (padrão Garantia)? | **Sweep SQL em `pg_cron`.** Tudo que precisa está no banco (etapas, prazos, membros, notificações); HTTP + segredo + bundle de function só adicionariam pontos de falha (a `task-alert-notifier` já ficou aberta na internet uma vez). |
| 2026-09-29 | Frequência | **De hora em hora** (`5 * * * *`). SLA é em horas; diário (Garantia) atrasaria o aviso em até 23 h. A cada minuto não muda nada: o cron não corrige atraso, só avisa. |
| 2026-09-29 | Escalonar = reatribuir ou avisar? | **Avisar + registrar**, sem trocar `responsible_user_id`. Reatribuir automaticamente tira a etapa de quem estava fazendo e esconde o atraso; o escalado recebe o aviso e usa "Assumir etapa" se quiser puxar. |
| 2026-09-29 | Onde mora a configuração de escalonamento? | **Na etapa do template** (`escalation_user_id`, `escalation_after_hours`), copiada para a etapa da instância no `startInstance` (snapshot, como `condition`). Fallback de destinatário quando a etapa não tem responsável nem escalado: `process_templates.owner_user_id`. |
| 2026-09-29 | Bloqueio | **Manual**, com motivo obrigatório, pelo drawer da instância. Instância `BLOQUEADO` sai do sweep (o relógio do SLA não conta parada declarada). Desbloquear devolve o status "aguardando X" da etapa atual. |
| 2026-09-29 | Responsável por DEPARTMENT/ROLE | **Fora deste plano (F3.2)**: exige snapshot de `responsible_type/ref_id` na etapa da instância, resolução via `employees.department_id/role_id` no sweep e no "Pendente comigo". Registrado abaixo com o desenho, para não se perder. |

## Plano

Um item por arquivo. Cada item: **o que muda** · **como sei que terminou**.

### 1. Banco

**1.1 `supabase/migrations/aplicar_20270929000002_processos_f3_sla_escalonamento.sql`**
- O que muda:
  - `process_template_steps`: `escalation_user_id uuid REFERENCES auth.users ON DELETE SET NULL`, `escalation_after_hours numeric` (ambos NULL = sem escalonamento).
  - `process_instance_steps`: as mesmas duas colunas (snapshot) + `overdue_notified_at timestamptz`, `escalated_at timestamptz` (as duas marcas de idempotência do sweep).
  - `process_instances`: `blocked_reason text`, `status_before_block text` (para desbloquear voltando ao status certo).
  - `fn_process_sla_sweep() RETURNS jsonb`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`:
    1. etapas `EM_ANDAMENTO` com `due_at < now()`, instância não em `CONCLUIDO/CANCELADO/BLOQUEADO`, `overdue_notified_at IS NULL` → marca `overdue_notified_at`, instância `status = 'ATRASADO'`, `notifications` para o responsável (e-mail via `organization_members.user_id` → `email`; sem responsável → escalado; sem escalado → `owner_user_id` do template), `process_audit_logs` `STEP_OVERDUE`;
    2. etapas com `escalation_user_id` e `due_at + escalation_after_hours * interval '1 hour' < now()`, `escalated_at IS NULL` → marca `escalated_at`, `notifications` para o escalado, log `STEP_ESCALATED`.
    Idempotente pelas duas marcas; devolve `{atrasadas, escaladas, executadoEm}`.
  - `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` (REGRA #7 — quem chama é o cron, dono do objeto).
  - `cron.unschedule` se existir + `cron.schedule('process-sla-sweep', '5 * * * *', $$ SELECT public.fn_process_sla_sweep(); $$)`.
- Como sei que terminou: `__tests__/segurancaMigrations.test.ts` passa (REVOKE presente); aplicada com `db query -f` (nunca `db push`); `select * from cron.job where jobname='process-sla-sweep'` devolve 1 linha; `select public.fn_process_sla_sweep()` roda à mão e devolve o jsonb; reexecutar a migration não duplica nada.

### 2. Tipos e motor

**2.1 `types/process.ts`**
- O que muda: `ProcessTemplateStep` e `ProcessInstanceStep` ganham `escalation_user_id?`, `escalation_after_hours?`; `ProcessInstanceStep` ganha `overdue_notified_at?`, `escalated_at?`; `ProcessInstance` ganha `blocked_reason?`, `status_before_block?`.
- Como sei que terminou: `tsc` limpo.

**2.2 `services/processService.ts`**
- O que muda:
  - `startInstance` copia `escalation_user_id`/`escalation_after_hours` do template para a etapa (snapshot, junto de `condition`).
  - `advanceToNextStep`: ao iniciar a próxima etapa, se a instância estava `ATRASADO`, volta ao status "aguardando X" normal (já faz — só garantir que o `ATRASADO` não fica preso).
  - `blockInstance(id, userId, reason)`: exige motivo; grava `status_before_block = status`, `status = 'BLOQUEADO'`, `blocked_reason`; log `INSTANCE_BLOCKED`.
  - `unblockInstance(id, userId)`: restaura `status_before_block` (ou recalcula pela etapa atual), limpa `blocked_reason`; log `INSTANCE_UNBLOCKED`.
  - `listInstances` já traz o status; nada a fazer.
- Como sei que terminou: `__tests__/processServiceBloqueio.test.ts` (banco em memória, mesmo harness do `processServiceCondicaoEtapa`): bloquear sem motivo lança; bloquear grava os 3 campos + log; desbloquear restaura o status anterior; `startInstance` copia os campos de escalonamento.

### 3. UI (REGRA #1 — ler o guia inteiro antes; `check-ui-standard.sh` depois)

**3.1 `components/ProcessosModule.tsx` — criador de template**
- O que muda: por etapa, além de nome/tipo/condição: **SLA (h)**, **Responsável** (seletor de membros da org — `organization_members` via `organizationService`; grava `default_responsible_type='USER'` + `default_responsible_id=user_id`), **Escalonar para** (mesmo seletor) + **após (h)**. Hoje o criador não grava `sla_hours` nem responsável — a F1 só os semeou por migration.
- Como sei que terminou: template criado na tela persiste `sla_hours`, `default_responsible_*`, `escalation_*`; instância iniciada dele nasce com `responsible_user_id` e `due_at` corretos; `check-ui-standard.sh` limpo.

**3.2 `components/ProcessosModule.tsx` — drawer da instância**
- O que muda: etapa atual atrasada mostra "Atrasada há Xh" (texto vermelho §8, sem pílula) e, se escalada, "Escalonada para <nome> em <data>"; botão **Bloquear** (abre campo de motivo, `useConfirm`-style) / **Desbloquear**; instância `BLOQUEADO` mostra o motivo no cabeçalho e desabilita as ações de etapa **dizendo por quê** (botão desabilitado sempre diz o motivo).
- Como sei que terminou: fluxo bloquear → ações desabilitadas com motivo → desbloquear → ações voltam; `check-ui-standard.sh` limpo.

**3.3 `components/ProcessosModule.tsx` — lista/Kanban**
- O que muda: `INSTANCE_STATUS_LABEL/COLOR` já têm `ATRASADO`/`BLOQUEADO`; só conferir que a coluna do Kanban existe e o filtro de status os oferece.
- Como sei que terminou: instância marcada pelo sweep aparece na coluna "Atrasado".

### 4. Prova em produção

**4.1** Aplicar a migration (com OK do usuário) → `select public.fn_process_sla_sweep()` à mão → a instância `2c8d805b…` (PC-013-013-0002, etapa "Conferência Fiscal" com prazo 01/10 00:18) **ainda não** está vencida em 29/09; criar um template de teste com SLA de 0,01 h e iniciar uma instância → rodar o sweep → `notifications` ganha a linha e a instância vira `ATRASADO`; cancelar a instância de teste depois.
- Como sei que terminou: linha em `notifications` com `type='process_sla'` e o sino do app mostrando o aviso (conferência visual do usuário).

## Publicação

| Data | Commit | Prova |
|---|---|---|
| 2026-09-29 | `7d9c12d6` (2º push; o 1º perdeu a corrida para outra frente durante os testes) | `conferir-producao.sh "Escalonar para" "Ações suspensas: processo bloqueado"` → carimbado `7d9c12d`, os dois textos presentes |

Pendente: conferência visual do criador (SLA/responsável/escalonamento), do drawer (bloquear/desbloquear, "Atrasada há Xh") e das 2 notificações de teste no sino.

## Fora deste plano (F3.2 — responsável por Departamento/Cargo)

Desenho para quando for feito: `process_instance_steps.responsible_type/responsible_ref_id`
(snapshot de `default_responsible_type/id`); `listMyPendingSteps` inclui etapas sem
`responsible_user_id` cujo `(type, ref)` casa com `employees.department_id/role_id` do
usuário logado; o sweep notifica todos os `employees.user_id` do departamento/cargo.
Depende de `employees.user_id` estar preenchido para quem usa o app — verificar cobertura
antes de prometer.

## Estado

- [x] Frente `processos-f3-escalonamento` aberta a partir de `origin/main` (2026-09-29)
- [x] Este plano escrito
- [x] 1.1 migration **escrita** (`aplicar_20270929000002_processos_f3_sla_escalonamento.sql`): colunas, `fn_process_email_do_usuario` (membro → e-mail, `auth.users` de reserva), `fn_process_sla_sweep` (atraso + escalonamento, idempotente por marca, ignora BLOQUEADO), REVOKE dos dois (REGRA #7 — `segurancaMigrations.test.ts` passa), cron `process-sla-sweep` `5 * * * *`. **Aplicação no remoto pendente de OK** — obrigatória antes de publicar (o `startInstance` grava `escalation_*`)
- [x] 2.1 tipos — `escalation_*`, `overdue_notified_at`, `escalated_at`, `blocked_reason`, `status_before_block`, `ProcessAssignableMember`
- [x] 2.2 motor — snapshot do escalonamento no `startInstance`; `blockInstance` (motivo obrigatório, guarda status anterior, log), `unblockInstance` (restaura; anterior ATRASADO recalcula pela etapa), `listAssignableMembers` (membro sem `user_id` vem com `userId: null`, a UI desabilita com motivo). `__tests__/processServiceBloqueio.test.ts` (8 casos)
- [x] 3.1 criador de template — por etapa: SLA (h), Responsável e Escalonar para… (+ após h) com `MembroSelect` (membro sem login vinculado aparece desabilitado **com o motivo**); escalado sem SLA bloqueia o salvar com texto. Antes o criador não gravava `sla_hours` nem responsável — só a F1 semeava por migration
- [x] 3.2 drawer — cabeçalho com motivo do bloqueio, Bloquear (campo de motivo inline; botão desabilitado diz por quê) / Desbloquear (`useConfirm`); etapa atual mostra "Prazo …" ou "Atrasada há Xh" (vermelho, §8) e "escalonada em …"; com processo bloqueado as ações da etapa somem e aparece "Ações suspensas: processo bloqueado". `check-ui-standard.sh` limpo; **não verificado no navegador**
- [x] 3.3 lista/Kanban — `KANBAN_COLUMNS` já tinha `BLOQUEADO` e `ATRASADO` (F0); nada a mudar
- [x] 1.1 **APLICADA no remoto em 2026-09-29** (autorizada pelo usuário): cron `process-sla-sweep` ativo (`5 * * * *`); ACL das duas funções = `postgres` + `service_role` só (sem PUBLIC/anon/authenticated — REVOKE efetivo); `select fn_process_sla_sweep()` à mão → `{atrasadas: 0, escaladas: 0}` (nenhuma etapa real vencida)
- [x] 4.1 prova em produção (2026-09-29, 04:16 UTC) — template `[TESTE F3]` na org Alpa com etapa vencida há 1 h, responsável/escalado = `altair.rosa@…`, escalonar após 0 h → sweep gerou **2 notificações** `process_sla` ("Etapa atrasada" e "Escalonado para você"), 1 log `STEP_OVERDUE` + 1 `STEP_ESCALATED`; **segunda passada não repetiu** (idempotência); instância de teste CANCELADA e template ARQUIVADO no fim. As 2 notificações ficaram no sino de propósito, para conferência visual

## Verificação de ponta a ponta

1. Criar template "Teste SLA" com 1 etapa manual, SLA 0,01 h, responsável = eu, escalonar para = eu após 0 h.
2. Iniciar instância → etapa com `due_at` ≈ +36 s.
3. `select public.fn_process_sla_sweep()` → `{atrasadas: 1, escaladas: 1}`; instância `ATRASADO`; 2 linhas em `notifications`; sino mostra.
4. Bloquear a instância com motivo → sweep não a toca; desbloquear → volta a `AGUARDANDO_RESPONSAVEL`.
5. Concluir a etapa → instância `CONCLUIDO`. Cancelar/arquivar o template de teste.
6. `npm run ci` limpo; publicar; `conferir-producao.sh "Escalonar para"`.
