# Processos — F3.2: responsável por Departamento ou Cargo

## Pedido original

> responsável por Departamento ou Cargo em vez de uma pessoa.
>
> Sessão: 8d15a5ed · 2026-09-29

Decisão do usuário, mesma sessão, depois da medição abaixo (pergunta "Como o sistema
deve saber quem pertence a cada departamento/cargo para receber a etapa?"):

> Vínculo em Processos (Recommended)

## Medição que decidiu o desenho (produção, 2026-09-29)

| | |
|---|---|
| Fichas de colaborador (`employees`) | 8 no total — **0** ligadas a login (`user_id`), 1 com e-mail, **0** com departamento, 5 com cargo |
| Membros com login (`organization_members`) | 11, todos com `user_id`; **nenhum** tem ficha ligada |
| Departamentos (`company_departments`) | 66 — 33 na Alpa (1 das 2 empresas), 33 no Garden; nomes sem repetição dentro da org |
| Cargos (`org_roles`) | 13 — 11 na Alpa, 1 no Garden, 1 na ALPA Empreendimentos |
| Papéis personalizados | 0 |

O desenho que estava no plano da F3 ("resolver pela ficha de RH") **não alcançaria
ninguém** hoje. Opções apresentadas: vínculo em Processos · ficha de RH (exige cadastro
prévio) · papel de acesso (grosso demais). Escolhida: **vínculo em Processos** — reusa o
catálogo de departamentos e cargos que já existe; quem pertence a cada um é marcado numa
aba nova de Processos, sobre os membros com login.

## Achado no caminho: "Assumir etapa" não existe

`processService.claimStep` filtra `.eq('status', 'PENDENTE')`, mas a etapa atual está
sempre `EM_ANDAMENTO` — a função nunca age sobre a etapa que importa — e **nenhuma tela
a chama**. Mesmo assim:
- o comentário da F1 em `advanceToNextStep` diz "DEPARTMENT/ROLE ficam sem responsável
  — usuário assume via Assumir etapa";
- a notificação de escalonamento da F3 (`fn_process_sla_sweep`) diz "Abra Processos
  para assumir".

Responsável por grupo depende exatamente disso: a etapa vai para o grupo e UMA pessoa
dele a assume. Por isso o conserto do `claimStep` + botão entra neste plano.

## Decisões

| Data | Pergunta | Decisão |
|---|---|---|
| 2026-09-29 | Fonte de "quem é do departamento/cargo" | Vínculo em Processos (usuário) |
| 2026-09-29 | Grupo = catálogo novo ou o existente? | **Existente** (`company_departments`, `org_roles`), via `companies.org_id`. Nada de catálogo paralelo de "equipes" |
| 2026-09-29 | Etapa de grupo: quem vê e quem age? | Todos os membros do grupo veem em "Pendente comigo" e recebem o aviso de atraso; **um** assume (vira `responsible_user_id`) e aí ela sai da fila dos outros |
| 2026-09-29 | Quem pode assumir etapa de grupo? | Só membro do grupo. Etapa sem responsável nenhum (nem pessoa nem grupo): qualquer membro da organização |
| 2026-09-29 | Escalonamento continua só para pessoa? | Sim — escalar é "chamar alguém específico" |
| 2026-09-29 | Aviso de atraso de etapa de grupo sem ninguém assumido | Vai para **cada** membro do grupo que ainda é membro da organização (o sweep cruza com `organization_members`, então vínculo antigo de quem saiu da org não recebe nada) |

## Plano

Um item por arquivo. Cada item: **o que muda** · **como sei que terminou**.

### 1. Banco — `supabase/migrations/aplicar_2027092900000N_processos_f32_responsavel_grupo.sql`
- O que muda:
  - Tabela `process_group_members` (`organization_id`, `group_type` 'DEPARTMENT'|'ROLE',
    `group_id`, `user_id` → `auth.users`, `created_by`, `created_at`), UNIQUE
    (org, tipo, grupo, usuário). RLS com a policy de sempre de Processos
    (`organization_id IN (SELECT proc_user_org_ids())`, uma perna só — REGRA #7 P1).
  - `process_instance_steps`: `responsible_type` (CHECK USER/DEPARTMENT/ROLE),
    `responsible_ref_id` — snapshot do responsável do template, como `condition` e
    `escalation_*`.
  - `fn_process_sla_sweep` reescrita **a partir do arquivo** `aplicar_20270929000002`
    (não do banco): etapa de grupo sem ninguém assumido → notifica cada membro do grupo
    que é membro da org; mensagem do escalonamento mantida ("Abra Processos para assumir"
    — agora verdade). REVOKE repetido.
- Como sei que terminou: `segurancaMigrations` e `migrationsPrefixo` passam; aplicada com
  `db query -f`; `pg_policies` mostra a policy da tabela nova; prova no item 5.

### 2. `types/process.ts`
- O que muda: `ProcessInstanceStep.responsible_type/responsible_ref_id`;
  `ProcessGroup { type, id, name, companyName, memberUserIds }`; `PendingStepItem.via_group?`.
- Como sei que terminou: `tsc` limpo.

### 3. `services/processService.ts`
- O que muda:
  - `startInstance` copia `default_responsible_type/id` para `responsible_type/ref_id`.
  - `claimStep(stepId, instanceId, userId)` reescrito: age na etapa atual `EM_ANDAMENTO`
    (e em `PENDENTE`, por compatibilidade); recusa se já tem responsável que não é o
    próprio usuário; em etapa de grupo, exige que o usuário seja membro do grupo;
    grava `responsible_user_id`, ajusta a instância de `AGUARDANDO_RESPONSAVEL` para o
    "aguardando" do tipo da etapa (ATRASADO permanece ATRASADO); log `STEP_CLAIMED`.
  - `listMyPendingSteps` soma as etapas de grupo sem responsável dos grupos do usuário,
    marcando `via_group` com o nome.
  - `listGroups(orgId)` (departamentos + cargos das empresas da org, com membros) e
    `setGroupMembers(orgId, tipo, grupoId, userIds)` (diff: insere/remove).
- Como sei que terminou: `__tests__/processServiceResponsavelGrupo.test.ts` (banco em
  memória): snapshot no `startInstance`; membro do grupo assume, não-membro é recusado,
  etapa já assumida por outro é recusada, instância sai de AGUARDANDO_RESPONSAVEL;
  `listMyPendingSteps` traz a etapa do grupo e deixa de trazer depois que outro assume;
  `setGroupMembers` faz o diff certo.

### 4. UI — `components/ProcessosModule.tsx` (REGRA #1: `check-ui-standard.sh` depois)
- 4.1 Aba **Equipes**: tabela (`StandardTable`, §6.10) dos departamentos e cargos da org
  — Nome, Tipo, Empresa, Membros; ação "Editar membros" abre `Sheet` com a lista de
  marcação dos membros com login. Grupo sem membro mostra "Ninguém — etapas deste grupo
  ficam sem dono".
- 4.2 Criador de template: o seletor "Responsável" ganha os grupos (Pessoas ·
  Departamentos · Cargos), com a contagem de membros e aviso quando o grupo está vazio.
- 4.3 Drawer da instância: etapa atual mostra "Responsável: <pessoa>" ou "Com o
  departamento/cargo <X> — ninguém assumiu"; botão **Assumir etapa** para quem pode
  (e, quando não pode, o motivo em texto).
- 4.4 "Pendente comigo": etapa de grupo aparece com "via <grupo>".
- Como sei que terminou: `check-ui-standard.sh` limpo; `tsc`; conferência visual do usuário.

### 5. Prova em produção
- Template de teste com etapa atribuída a um departamento da Alpa; `altair.rosa@…` como
  membro do departamento → instância aparece em "Pendente comigo" via grupo; etapa
  vencida → sweep notifica o membro do grupo; assumir → sai da fila do grupo. Limpeza no
  fim (cancelar instância, arquivar template, remover o vínculo de teste).
- Como sei que terminou: consultas no banco antes/depois, registradas aqui.

## Estado

- [x] Frente `processos-f32-responsavel-grupo` aberta a partir de `origin/main` `0ecf76ed`
- [x] Medição + decisão do usuário
- [x] Este plano
- [x] 1 migration **escrita** — `aplicar_20270929000003_processos_f32_responsavel_grupo.sql`: `process_group_members` + RLS de Processos; `responsible_type/ref_id` na etapa da instância; `fn_process_sla_sweep` reescrita a partir do arquivo `…000002` (etapa de grupo sem dono avisa cada membro do grupo que é membro da org; grupo vazio cai na cadeia antiga) + REVOKE. `segurancaMigrations`/`migrationsPrefixo` passam. **Aplicação pendente de OK** — obrigatória antes de publicar (o `startInstance` grava `responsible_type/ref_id`)
- [x] 2 tipos — `ProcessGroup`, `PendingStepItem.via_group`, `responsible_type/ref_id`
- [x] 3 motor — snapshot do responsável no `startInstance`; `claimStep(stepId, instanceId, userId)` reescrito (etapa atual, 4 regras, instância sai de AGUARDANDO_RESPONSAVEL, ATRASADO fica, log `STEP_CLAIMED`); `listMyPendingSteps` com a fila do grupo (`via_group`); `listGroups`; `setGroupMembers` (diff). `__tests__/processServiceResponsavelGrupo.test.ts` — 13 casos, harness com `.in()`/`.is()`/caminho aninhado filtrando de verdade
- [x] 4.1 aba **Equipes** — `StandardTable` (§6.10) Nome/Tipo/Empresa/Membros, "Editar membros" abre `Sheet` com a lista de marcação dos membros com login; grupo vazio em âmbar "Ninguém — etapas deste grupo ficam sem dono"; salvar atualiza a linha local (§22)
- [x] 4.2 criador — `ResponsavelSelect` com grupos Pessoas · Departamentos · Cargos, contagem de membros e aviso de grupo vazio no próprio rótulo
- [x] 4.3 painel — "Responsável: <pessoa>" / "Com o departamento X — ninguém assumiu" / "Sem responsável"; **Assumir etapa** (desabilitado com o motivo em texto para quem não é do grupo); membros e grupos lidos da org DA INSTÂNCIA (topo pode estar em "Todas")
- [x] 4.4 "Pendente comigo" — "· via <grupo> — ninguém assumiu"
- `check-ui-standard.sh` limpo; `tsc` limpo; **não verificado no navegador**
- [x] 1 **APLICADA no remoto em 2026-09-29** (OK do usuário): tabela com RLS e 1 policy; 2 colunas; ACL do sweep só `postgres`/`service_role`; rodada manual `{atrasadas: 0, escaladas: 0}`
- [x] 5 prova em produção (2026-09-29 05:07 UTC) — departamento **Tesouraria** (Alpa) com `altair.rosa@` marcado; etapa atribuída ao departamento, vencida há 1 h, sem ninguém assumido:
  | passo | esperado | obtido |
  |---|---|---|
  | consulta da fila de grupo acha a etapa | 1 | 1 |
  | sweep avisou o membro do grupo ("…ainda sem ninguém assumido") | 1 | 1 (`atrasadas: 1`) |
  | instância virou ATRASADO | ATRASADO | ATRASADO |
  | 2ª passada não repete | 1 | 1 |
  | depois de assumida sai da fila do grupo | 0 | 0 |
  | limpeza: vínculo de teste removido | 0 | 0 |
  Instância de teste CANCELADA, template ARQUIVADO, vínculo removido. A notificação ficou no sino para conferência visual
