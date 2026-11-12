# Link do celular — Minhas Tarefas e Diário de Obras por token, sem login

## Pedido original

> minhas tarefas versão mobilie: como acessar? qual o link?

Resposta: não havia link próprio — Tarefas é navegação interna do app logado; a versão
mobile aparece com a janela < 768 px.

> criar links proprios como nos portais

Sessão: `dac20e1e-e944-41c5-bafb-71f69696d5e3` · 2026-11-11

Pedido posterior (2026-11-11, mesma sessão):

> acessei as tarefas do Iago marques, porem não aparecem as mesmas tarefas para ele

Pedido posterior (2026-11-12): resposta "Sim, fechar as duas (Recomendado)" à pergunta sobre as
brechas `employees.user_id` gravável por qualquer membro e `task_collaborators` sem WITH CHECK.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-11-11 | Link com login (`/tarefas`) ou público com token, como os portais? | **Público com token** |
| 2026-11-11 | Quais telas? | **Tarefas + Diário de Obras mobile** |
| 2026-11-11 | O que o link pode fazer sem login? | **Tarefas e Diário completos, com foto** |
| 2026-11-11 | Abordagem: sessão real do usuário (A) ou RPCs próprias de mínimo privilégio (B)? | **B** — link vazado = só o que o celular faz, não a conta inteira |
| 2026-11-11 | Seção 1 (dados e token): um link por pessoa por organização; admin/owner gera para qualquer membro, cada um para si | aprovada |
| 2026-11-11 | Seção 2 (RPCs): "uma regra, dois chamadores" — núcleo do Diário com `p_ator`, RPCs atuais viram chamadores | aprovada |
| 2026-11-11 | Seção 3 (mídia): Edge `celular-diario-midia` com upload assinado direto ao storage | aprovada |
| 2026-11-11 | Seção 4 (telas): mesmas telas com "fonte de dados" trocável; efetivo e cronograma entram no link | aprovada |
| 2026-11-11 | Seção 5 (fases, provas, ordem de deploy) | aprovada ("continue") |
| 2026-11-11 | Design escrito neste arquivo | aprovado ("design certo"), commit `eb6661b5` |
| 2026-11-11 | Gestor gera link de outro owner/admin? | **Não** — gestor só gera para `member`; admin/owner geram o próprio (revisão final). Revogar e consultar continuam para qualquer membro |
| 2026-11-11 | Responsável vê a tarefa? | **Sim, vê e pode concluir/editar (app e link)** |
| 2026-11-11 | Vincular o colaborador do Iago à conta? | **Sim** (gravado pelo controlador: employees `175d203c…` `user_id = f9809eae…`) |
| 2026-11-12 | Fechar as brechas do vínculo (`employees.user_id`) e de `task_collaborators`? | **Sim, as duas** — só owner/admin vinculam; envolvidos só por quem gere a tarefa |
| 2026-11-12 | Fechar a frente ou manter para a Parte 2? | **Manter para a Parte 2** |

### Ajustes ao ler o código para o plano (2026-11-11)

- `celular_tarefa_concluir` / `_reabrir` / `_editar` viram **uma** RPC,
  `celular_tarefa_atualizar(p_token, p_task_id, p_patch)`: a tela já calcula o patch
  (`doneStatusOfOrg`, `status_id` anterior no Desfazer, edição) e a lógica não deve ser
  duplicada em SQL. A RPC aceita só as colunas da lista branca e valida cada valor.
- A tela também lê espaços (`taskSpaceService.listSpaces`), status da org
  (`taskStatusService.list`) e responsáveis (`listAssignable`: `employees` +
  `employee_org_shares`) → RPCs `celular_espacos_listar`, `celular_status_listar`,
  `celular_responsaveis_listar`.
- Nome da obra das tarefas vem junto da lista (`celular_tarefas_listar` devolve
  `nomes_obras`), como a tela já faz em duas consultas.
- Nome da pessoa: `profiles.name`; gestor: `is_org_manager(org_id)` (existe no banco).
- O plano detalha a **Parte 1 (F1 + F2)** — Tarefas pelo link, publicável sozinha. A
  Parte 2 (F3–F5, Diário) é detalhada neste arquivo depois de F2 no ar, relendo o código.

### Ajustes da revisão final da Parte 1 (2026-11-11)

- **Link revogado/vencido com a tela aberta:** `fonteDoLink(token, { aoRecusar })` — no
  ponto único de chamada, 42501 com a mensagem exata `link inválido ou vencido` chama
  `aoRecusar` (e ainda lança). Outro 42501 (recusa de uma ação) não dispara.
  `CelularTokenGate` vai a `invalido` (desmonta Minhas Tarefas) e reconfere
  `celular_sessao` no `visibilitychange`. A fonte segue estável (`useMemo` só com o token).
- **Sair da org revoga o link:** gatilho `AFTER DELETE ON organization_members`
  (`_mobile_link_revoga_ao_sair_da_org`) preenche `revoked_at` do link da pessoa naquela
  org; reinserir a pessoa não ressuscita o link antigo. Conferido antes: nenhum fluxo
  normal apaga e reinsere membros existentes (`updateOrganization` apaga só quem saiu da
  lista e faz upsert em `organization_id,email`; `invite-member` só faz upsert).
- **`celular_tarefa_criar` = `tasks_insert`:** espaço só se o dono do link for MEMBRO
  (`is_task_space_member_de`); ser `owner_user_id` do espaço não basta (R5).
- **Gestor × admin/owner:** `mobile_link_generate` recusa (42501) o gestor gerando para
  quem não é `member`; no Editar membro, "Gerar link" fica desligado com o motivo.
- **Barra de aba única:** a barra de seções do `/celular` só aparece com 2+ abas.

### Ajustes — responsável vê e edita (2026-11-11)

- **Iago via 2 tarefas no link, não 7:** nenhuma regra de `tasks` olhava o responsável
  (`assignee_employee_id`) — só dono, membro do espaço e colaborador — e o colaborador
  dele (`175d203c…`, e-mail `''`) não tinha vínculo com a conta. Migration
  `aplicar_20271111995000_tarefas_responsavel_ve_e_edita.sql`: `is_employee_do_usuario(_de)`,
  policies `tasks_select_assignee` / `tasks_update_assignee` (o responsável vê e edita, não
  passa a tarefa adiante nem apaga; só em org de que é membro — `is_org_member(org_id)`, porque
  `employees.user_id` é gravável por qualquer membro da org do colaborador), gatilho
  `trg_tasks_responsavel_so_conteudo` (BEFORE UPDATE: quem não é dono nem membro do espaço, via
  API, só muda título, descrição, datas, prioridade e status — sem ele o responsável tomava a
  posse com `SET user_id`, porque os WITH CHECK de UPDATE se somam por OR) e a mesma perna em
  `_celular_tarefa_visivel` / `celular_tarefa_atualizar`. Prova:
  `scripts/teste-tarefas-responsavel.sql` (`TUDO OK`, 2 + 5 = 7). Quem pode gravar
  `employees.user_id` fica para decisão do usuário.

### Ajustes — brechas do vínculo e dos envolvidos (2026-11-12)

- Migration `aplicar_20271112800000_vinculo_colaborador_e_envolvidos_trava.sql`, prova
  `scripts/teste-vinculo-colaborador-envolvidos.sql` (RED sem ela: "membro comum vinculando o
  colaborador à própria conta → 42501 (veio ok:1)"; com ela, `TUDO OK`).
- **Vínculo:** gatilho `trg_employees_vinculo_so_gestor` — via API, só owner/admin da org do
  colaborador (ou superadmin) grava/troca/limpa `employees.user_id` ou, num UPDATE, troca o
  e-mail para o de um login que não seja a conta já vinculada (as regras do responsável e do
  envolvido também casam pelo e-mail). E-mail que não é login segue livre; INSERT com e-mail
  também (`hire_candidate`, `academy_portal_users_create`; colaborador novo não tem tarefa).
  Na ficha, "Usuário do sistema" fica desligado com o motivo (`lib/vinculoColaboradorUsuario.ts`).
- **Envolvidos:** medido antes — a brecha não chegava a acontecer porque TODO acesso pela API a
  `task_collaborators` dava 42501 *permission denied for table users* (as policies liam
  `auth.users`), inclusive para o dono: os "Envolvidos" do TaskForm nunca carregavam nem
  gravavam (o erro é ignorado lá). Agora uma policy por comando: INSERT/UPDATE/DELETE = dono ou
  membro do espaço (`pode_gerir_envolvidos_da_tarefa`, com WITH CHECK); SELECT = isso OU
  envolvido (`is_task_collaborator`). Efeito visível: os envolvidos voltam a funcionar.

### Ajustes — depois da Parte 2 no ar (2026-11-12)

Pedido literal (com print do celular):

> implementar Melhorias menores que ficaram para depois:
> 1. falta limite de uso na Edge, faltam alguns testes extras e há uma organização interna de código a fazer.
> 2. Veja print: Os botoes do hearder ( tarefas e diario) ficaram iguais ao outros dois botões logo acima ( entrada e espacos). achei que por ficarem sem diferenciacao ficou confuso. avalie se os dois botões no header ( tarefas e diario)  precisa de mais destaque

Decisões (2026-11-12): seções = **pílula no topo** (Tarefas | Diário no cabeçalho, ativa azul cheio; o rodapé fica só
com a barra da tela); nome vazio no cabeçalho → só a org (ou e-mail), sem "·" sobrando. Limite de uso por link:
**120 envios de foto/hora** e **600 pedidos de assinatura/hora**, contados no banco (`user_mobile_link_uso`, RLS sem
policy) dentro de `celular_diario_autoriza` / `celular_diario_midia_permitida`; estouro → ERRCODE `54000` → Edge 429 →
"Limite de uso do link atingido — tente de novo na próxima hora." Mais os testes extras e a organização de código
apontados nas revisões da Parte 2 (carregador do planejamento no serviço, `toResult` sem duplicata, `removerFotos` em
paralelo com uma recusa só, `pode_aprovar_diario` obrigatório, `IS NOT TRUE` nas checagens de planejamento).
Cabeçalho sem nome: cai só na organização — `celular_sessao` não devolve e-mail, então não há e-mail para o fallback.

### Ajustes — superadmin vê e edita toda tarefa (2026-11-12)

Pedido literal (com prints do celular e do desktop):

> verifique uma divergencia entre minhas tarefas na versão mobilie a na versão desktop para o usuario Iago marques.
> 6 tarefas na versão mobilie e 4 tarefas  versão desktop

Medido no banco: o celular do Iago estava certo (6 abertas: 4 como responsável + 2 criadas por ele). O desktop estava
logado como **desenvolvedor@** (superadmin), que só via tarefas de espaço: as 2 do Altair e as 2 do Iago **sem espaço**
ficavam de fora — a regra "superadmin tem acesso a tudo" (`aplicar_20271024950000`) só o pôs como owner de todo espaço.
Decisão do usuário (2026-11-12): **"Ver e editar todas"** — apagar não muda.
Migration `aplicar_20271112995000_tarefas_superadmin_ve_e_edita.sql` (policies `tasks_select_superadmin` /
`tasks_update_superadmin` com `(SELECT public.is_superadmin())`; superadmin fora da trava do responsável; gere envolvidos
de qualquer tarefa). Prova `scripts/teste-tarefas-superadmin.sql`. Rollback: `DROP POLICY tasks_select_superadmin` e
`tasks_update_superadmin` + recriar `_tasks_responsavel_so_conteudo` do arquivo `aplicar_20271111995000` e
`pode_gerir_envolvidos_da_tarefa` do arquivo `aplicar_20271112800000`. Fora do escopo (não pedido): o link do celular de
um superadmin continua mostrando só as tarefas dele (regra do link = a pessoa, sem a perna de superadmin).

## Design

### Contexto medido (origin/main e banco, 2026-11-11)

- `TasksMobileApp` grava direto em `tasks` (`supabase.from('tasks').insert/update`);
  `TasksModule.tsx:68` abre a versão mobile com `innerWidth < 768`.
- RLS de Tarefas (lida em `pg_policies`): `tasks_select` = dono OU membro do espaço;
  `tasks_select_collaborator` = `is_task_collaborator(id)`; excluir em espaço exige
  `task_space_members.role = 'owner'`; `task_statuses` por `is_org_member(org_id)`.
- Diário: registro só por `diary_upsert_entry` / `diary_delete_entry` (SECURITY
  INVOKER, `aplicar_20271014600000_diario_aprovacao_permissao.sql`); a RLS de
  `projects` (`projects_org_access` = `is_org_member`) decide quem grava; aprovação por
  `fn_pode_aprovar_diario(org)`. Salvar no mobile também lê efetivo
  (`laborService.listEmployees`), planejamento vinculado (`useDiaryLinkedPlanning`) e
  grava a evolução no cronograma (`sincronizarEvolucaoNoPlanejamento` → `saveProject`).
- Mídia: bucket privado `diario-midia`, path `{org}/{projeto}/{uuid}.{ext}`; portal por
  token já assina pela Edge `client-portal-diary-download` (molde).
- Helpers de autorização — **nenhum recebe o usuário**: `is_org_member(org_id)` (plpgsql,
  `auth.uid()` + fallback `auth.jwt()->>'email'` + `broker_profiles`),
  `is_task_space_member(p_space_id)`, `is_task_collaborator(p_task_id)` (e-mail de
  `auth.users` via `auth.uid()`), `fn_pode_aprovar_diario(p_org)`.
- `/m/<slug>` já é rota (marketplace, `App.tsx:687`) → o link usa **`/celular`**.
- ⚠️ Não copiar `broker_portal_tokens`: a policy `broker_tokens_anon_select` deixa a
  chave anon listar todos os tokens ativos.

### 1. Dados e token

Tabela `user_mobile_links`:

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid → `organizations` ON DELETE CASCADE | |
| `user_id` | uuid → `auth.users` ON DELETE CASCADE | |
| `token_hash` | text UNIQUE | SHA-256 hex do token; o token em claro nunca é gravado |
| `expires_at` | timestamptz | padrão `now() + 90 days` |
| `revoked_at` | timestamptz NULL | |
| `last_used_at` | timestamptz NULL | |
| `created_by` | uuid | quem gerou |
| `created_at` | timestamptz | |

- `UNIQUE (org_id, user_id)` — um link por pessoa por organização; regenerar troca o hash.
- RLS ligada e **nenhuma policy**: ninguém lê a tabela direto, nem `authenticated`.
- `_mobile_link_resolver(p_token text) → (user_id, org_id)`: hash, confere
  `revoked_at IS NULL AND expires_at > now()`, **reconfere `is_org_member_de(user, org)`**
  (saiu da org → link morto), grava `last_used_at`. Sem GRANT para ninguém. Token
  inválido → `RAISE ... USING ERRCODE = '42501'` com mensagem única (não diz se existe).
- Gestão (`authenticated`, autorização dentro): `mobile_link_generate(p_user_id, p_org_id)`
  → token em claro uma vez; `mobile_link_revoke(p_user_id, p_org_id)`;
  `mobile_link_status(p_user_id, p_org_id)` → `{existe, expires_at, last_used_at,
  revogado}`. Pode: admin/owner da org para qualquer membro; o próprio usuário para si.
- Token: 32 bytes aleatórios (`gen_random_bytes`) em base64url — não `gen_random_uuid()`.

### 2. Autorização — "uma regra, dois chamadores"

Cada helper ganha o gêmeo que recebe o usuário:

| hoje | gêmeo | o original passa a |
|---|---|---|
| `is_task_space_member(space)` | `is_task_space_member_de(user, space)` | chamar o gêmeo com `auth.uid()` |
| `is_task_collaborator(task)` | `is_task_collaborator_de(user, task)` | chamar o gêmeo |
| `fn_pode_aprovar_diario(org)` | `fn_pode_aprovar_diario_de(user, org)` | chamar o gêmeo |
| `is_org_member(org)` | `is_org_member_de(user, org)` (e-mail lido de `auth.users`) | **não muda** — caminho quente de toda a RLS e usa `auth.jwt()`; equivalência provada por SQL (Verificação) |

Gêmeos: `SECURITY DEFINER`, `REVOKE ... FROM PUBLIC, anon, authenticated` — só as
funções do link e os núcleos os chamam.

Núcleo do Diário: o corpo de `diary_upsert_entry` / `diary_delete_entry` (copiado do
**arquivo** `aplicar_20271014600000`, não do banco) vira `_diary_upsert_core(p_ator,
p_project_id, p_entry)` / `_diary_delete_core(p_ator, p_project_id, p_entry_id)`:
`SECURITY DEFINER`, checagem **explícita** `is_org_member_de(p_ator, org do projeto)` no
lugar da RLS, aprovação por `fn_pode_aprovar_diario_de(p_ator, org)`, mesma marca de
gatilho (`orcacloud.diario_escrita`), mesmo retorno `{entries, anterior}`, mesmos
ERRCODEs e mensagens. As RPCs atuais mantêm assinatura e chamam o núcleo com
`auth.uid()` (e recusam `auth.uid() IS NULL`).

### 3. RPCs do link

Todas `(p_token text, …)`, `SECURITY DEFINER`, começam por `_mobile_link_resolver`,
`REVOKE FROM PUBLIC` + `GRANT EXECUTE TO anon, authenticated`.

| Sessão / Tarefas | Diário |
|---|---|
| `celular_sessao` → nome, org, `pode_aprovar_diario` | `celular_diarios_listar` (DIARIO da org do link) |
| `celular_tarefas_listar` (+ espaços, pastas, status da org) | `celular_diario_registros(p_project_id)` |
| `celular_tarefa_criar` | `celular_diario_salvar` → `_diary_upsert_core` |
| `celular_tarefa_concluir` / `celular_tarefa_reabrir` (`status` + `status_id`, como `TasksModule.toggleDone`) | `celular_diario_excluir` → `_diary_delete_core` |
| `celular_tarefa_editar` | `celular_efetivo_listar` (só nome e função) |
| | `celular_planejamento_vinculado(p_diario_id)` |
| | `celular_planejamento_gravar_cronograma(p_diario_id, p_schedule)` — só `settings.schedule`, só do planejamento ligado àquele diário, mesma org |
| | `celular_diario_autoriza(p_project_id)` — usada pela Edge de mídia |

Escopo de Tarefas no link = o mesmo da RLS (dono, membro do espaço, colaborador), pelos
gêmeos; nunca tarefa de outra org.

### 4. Mídia — Edge `celular-diario-midia`

`verify_jwt` desligado; o token no corpo é o único portão. Ações:

- `subir {project_id, ext, tipo}` → `celular_diario_autoriza` → path montado no servidor
  (`{org}/{projeto}/{uuid}.{ext}`) + `createSignedUploadUrl`; o celular sobe direto ao
  storage (sem passar pela função — fora do corte de 20 s). `comprimirFoto` continua no
  celular.
- `assinar {paths}` → só path referenciado em registro de diário da org do link →
  `createSignedUrls`.
- `remover {project_id, paths}` → só path com prefixo `{org}/{projeto}/` que nenhum
  registro do projeto referencia mais (conferido na hora) → `remove`.

### 5. Telas, rota e gestão

- `services/celular/tarefasFonte.ts` — interface `TarefasFonte`; `fonteLogada` (o código
  de `supabase.from('tasks')` que hoje está no componente, movido sem mudar) e
  `fonteDoLink(token)` (RPCs `celular_*`). `services/celular/diarioFonte.ts` — mesmo
  molde, cobrindo registros, efetivo, planejamento, mídia e aprovação.
- `TasksMobileApp` e `DiaryMobileApp` recebem `fonte` (padrão `fonteLogada`): fora do
  link nada muda. No link, a org é a do token — `resolveWriteOrg` não pergunta.
- `App.tsx`: `/celular?token=` → `CelularTokenGate` antes do `<Layout>` (junto dos outros
  gates). Casca: cabeçalho com nome e org, abas Tarefas | Diário, sem ☰. Token inválido →
  "Link inválido ou vencido — peça um novo ao administrador", sem dado.
- Gestão: bloco "Link do celular" no usuário em Usuários da Organização (Gerar, Copiar,
  WhatsApp, Revogar com `useConfirm`, validade, último uso); "Meu link do celular" no
  menu da conta. REGRA #1 nas duas telas.

## Plano

Fases entregues e publicadas uma a uma. As tarefas de cada fase (um item por arquivo,
com critério) são escritas na etapa de plano de implementação, neste mesmo arquivo.

| Fase | O que entra | Pronto quando |
|---|---|---|
| F1 Banco: link + Tarefas | tabela, resolver, gêmeos, gestão, `celular_sessao`, `celular_tarefa*` | prova SQL F1 verde |
| F2 Tela: Tarefas pelo link | `TarefasFonte`, `/celular`, casca, gestão na UI | link real abre as tarefas; app logado igual |
| F3 Banco: núcleo do Diário | núcleos, RPCs atuais como chamadores, `celular_diario*`, efetivo, planejamento | regressão do app logado verde + prova F3 |
| F4 Mídia | Edge `celular-diario-midia` | sonda de fora: 401 sem token, 403 outra org, 200 válido |
| F5 Tela: Diário pelo link | `DiarioFonte`, aba Diário | registro com foto pelo link aparece no desktop e no cronograma |

## Plano de implementação — Parte 1 (F1 + F2: Tarefas pelo link)

> **Para quem executa:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans. Passos com `- [ ]`.

**Goal:** abrir `/celular?token=…` no celular, sem login, e usar Minhas Tarefas
(listar, criar, editar, concluir, desfazer) da pessoa dona do link, na org do link.

**Architecture:** tabela `user_mobile_links` (hash, sem policy) + RPCs `SECURITY DEFINER`
que resolvem o token e autorizam com gêmeos `*_de(p_user, …)` dos helpers da RLS. No
front, `TasksMobileApp` lê e grava por uma `TarefasFonte` (contexto React): `fonteLogada`
(o código atual) ou `fonteDoLink(token)` (RPCs). `CelularTokenGate` antes do `<Layout>`.

**Tech Stack:** Postgres/Supabase (plpgsql, pgcrypto em `extensions`), React 19 + Vite,
Vitest, Playwright (harness fora do repo).

**Spec:** a seção **Design** acima, neste mesmo arquivo.

### Global Constraints

- Trabalhar só em `C:\D\frentes\link-celular` (branch `feat/link-celular`). Nunca no checkout de integração.
- Migration: arquivo `supabase/migrations/aplicar_<14 dígitos>_<nome>.sql`; prefixo **maior que o maior do dia** — conferir com `ls supabase/migrations | grep 20271111` na hora (último visto: `20271111850000`). Aplicar com `npx supabase db query --linked -f`, **nunca** `db push`.
- ⚠️ Aplicar migration em produção e publicar (push em `main`) **só com aval explícito do usuário na hora**.
- Toda função nova: `REVOKE EXECUTE … FROM PUBLIC, anon` (e `authenticated` nos internos). `GRANT … TO anon, authenticated` **só** nas `celular_*`; `TO authenticated` só nas `mobile_link_*`.
- Funções `SECURITY DEFINER` com `SET search_path = public, pg_temp`; pgcrypto qualificado: `extensions.digest`, `extensions.gen_random_bytes`.
- Token: 32 bytes de `extensions.gen_random_bytes`, base64url sem `=`; guardado só `encode(extensions.digest(token,'sha256'),'hex')`.
- Recusa de token (inválido, vencido, revogado, ex-membro): sempre `RAISE EXCEPTION 'link inválido ou vencido' USING ERRCODE = '42501'` — mesma mensagem.
- Endereço: `/celular?token=`. Texto da recusa: "Link inválido ou vencido — peça um novo ao administrador".
- REGRA #1 (`scripts/check-ui-standard.sh`) em todo `.tsx` tocado; REGRA #5 (`__tests__/orgContextGuard.test.ts`) verde.
- Português em código, comentários, mensagens e commits.

### Review Focus

1. Pessoa removida da org com link vivo → o link para de funcionar na próxima chamada (resolver reconfere membro). Teste no SQL (Task 1).
2. Navegador com sessão logada de **outra** pessoa abrindo `/celular?token=` → mostra as tarefas do dono do link, nunca as da sessão: `fonteDoLink` não pode chamar `supabase.from`. Teste em `tarefasFonte.test.ts` (Task 3).
3. `p_patch` forjado (`status_id` de outra org, `user_id`, `org_id`, `space_id` fora da lista branca, responsável de outra org) → recusa 42501/22023. Teste no SQL (Task 2).
4. Criar em espaço/pasta de outra org, ou pasta que não é do espaço → recusa. Teste no SQL (Task 2).
5. `/celular` sem token, token vazio ou com espaço/encoding quebrado → tela de recusa sem chamar RPC de dados. Teste em `celularRota.test.ts` (Task 5).

### Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/aplicar_<p1>_link_celular_tabela_e_gemeos.sql` | tabela, hash, resolver, gêmeos, gestão (`mobile_link_*`) |
| `supabase/migrations/aplicar_<p2>_link_celular_rpcs_tarefas.sql` | `celular_sessao` + RPCs de Tarefas |
| `scripts/teste-link-celular-tarefas.sql` | prova `BEGIN … ROLLBACK` das duas migrations |
| `services/celular/tarefasFonte.ts` | interface `TarefasFonte`, `fonteLogada`, `fonteDoLink`, contexto |
| `services/celular/celularLinkService.ts` | gerar / revogar / status, `celularSessao`, `urlDoLinkCelular`, `tokenDoCelularDaUrl` |
| `components/TasksMobileApp.tsx` | passa a usar `useTarefasFonte()` — sem mudar comportamento logado |
| `components/celular/CelularTokenGate.tsx` | valida a sessão do link e monta a casca |
| `components/celular/LinkDoCelularBloco.tsx` | bloco Gerar / Copiar / WhatsApp / Revogar |
| `App.tsx` | rota `/celular` antes do `<Layout>` |
| `components/OrganizationUsers.tsx` (Edit Member Modal, ~l.1487) | usa `LinkDoCelularBloco` |
| `components/Layout.tsx` (menu da conta, ~l.1467) | item "Meu link do celular" |
| `__tests__/tarefasFonte.test.ts`, `__tests__/celularRota.test.ts` | unitários |

---

### Task 1: Banco — tabela, resolver, gêmeos e gestão do link

**Files:**
- Create: `supabase/migrations/aplicar_<p1>_link_celular_tabela_e_gemeos.sql`
- Create: `scripts/teste-link-celular-tarefas.sql` (seção A)

**Interfaces:**
- Produces (SQL):
  - `user_mobile_links` (colunas da Design §1; `UNIQUE (org_id, user_id)`; RLS on, zero policies)
  - `_mobile_link_hash(p_token TEXT) RETURNS TEXT` IMMUTABLE
  - `_mobile_link_resolver(p_token TEXT, OUT user_id UUID, OUT org_id UUID)` — grava `last_used_at`
  - `is_org_member_de(p_user UUID, p_org UUID) RETURNS BOOLEAN` — mesmo corpo de `is_org_member`, com `auth.uid()` → `p_user` e o e-mail de `auth.jwt()` → `auth.users.email` de `p_user`
  - `is_task_space_member_de(p_user UUID, p_space_id UUID)`, `is_task_collaborator_de(p_user UUID, p_task_id UUID)`; os originais (mesmos nomes de parâmetro: `p_space_id`, `p_task_id`) passam a `RETURN …_de(auth.uid(), …)`
  - `mobile_link_generate(p_user_id UUID, p_org_id UUID) RETURNS TEXT` (token em claro; upsert por `(org_id,user_id)`, zera `revoked_at`, `expires_at = now()+90 days`, `created_by = auth.uid()`)
  - `mobile_link_revoke(p_user_id UUID, p_org_id UUID) RETURNS VOID`
  - `mobile_link_status(p_user_id UUID, p_org_id UUID) RETURNS JSONB` → `{existe, expires_at, last_used_at, revogado}`
  - Autorização das três `mobile_link_*`: `auth.uid()` não nulo **e** (`is_org_manager(p_org_id)` **ou** `p_user_id = auth.uid() AND is_org_member(p_org_id)`) **e** `is_org_member_de(p_user_id, p_org_id)`; senão 42501.

- [ ] **Step 1: Escrever a seção A de `scripts/teste-link-celular-tarefas.sql`** no molde de `scripts/teste-codigo-patrimonial.sql` (`BEGIN; -- MIGRATION … pg_temp.confere … ROLLBACK;`, linha final `SELECT 'TUDO OK'`). Escolhe um membro real `u` de uma org `o` (`organization_members` com `user_id`) e um não membro `x`. Asserções, simulando o chamador com `set_config('request.jwt.claims', json_build_object('sub',…,'role','authenticated')::text, true)` + `SET LOCAL ROLE authenticated`/`anon` (e `RESET ROLE` entre blocos):
  - `u` gera o próprio link → token com 43 caracteres `[A-Za-z0-9_-]`; a linha guarda `token_hash = _mobile_link_hash(token)` e **não** contém o token.
  - `_mobile_link_resolver(token)` → `(u, o)` e `last_used_at` preenchido.
  - `x` (não gestor, não dono) gerando link de `u` → 42501.
  - Como `anon`: `SELECT` em `user_mobile_links` → 0 linhas ou 42501; `_mobile_link_resolver` → 42501 de privilégio (sem GRANT).
  - Revogado → resolver 42501 `'link inválido ou vencido'`; vencido (`UPDATE expires_at = now() - interval '1 s'`) → idem; `DELETE` de `u` em `organization_members` → idem (mesma mensagem nos três).
  - Equivalência: para toda linha de `organization_members` com `user_id` (limite 500), `is_org_member_de(user_id, organization_id)` = `is_org_member(organization_id)` avaliado com `request.jwt.claims` daquele usuário (sub + email de `auth.users`).
  - `is_task_space_member(s)` com claims de um membro real de `task_space_members` = TRUE e = `is_task_space_member_de(…)`.
- [ ] **Step 2: Rodar e ver falhar** — `npx supabase db query --linked -f scripts/teste-link-celular-tarefas.sql` → FAIL com `function public.mobile_link_generate(...) does not exist`.
- [ ] **Step 3: Escrever a migration** com as interfaces acima e os REVOKE/GRANT das Global Constraints (`_mobile_link_*` e gêmeos: `REVOKE … FROM PUBLIC, anon, authenticated`).
- [ ] **Step 4: Ensaio sem aplicar** — gerar `C:\tmp\ensaio-link-celular-a.sql` = teste com o conteúdo da migration no lugar de `-- MIGRATION`; rodar com `db query -f` → última linha `TUDO OK`.
- [ ] **Step 5: Travas** — `npx vitest run __tests__/segurancaMigrations.test.ts` → PASS.
- [ ] **Step 6: Commit** — `git add` dos dois arquivos; `feat(banco): link do celular — tabela, resolver e gêmeos de autorização`.

### Task 2: Banco — RPCs de Tarefas do link

**Files:**
- Create: `supabase/migrations/aplicar_<p2>_link_celular_rpcs_tarefas.sql` (`<p2>` > `<p1>`)
- Modify: `scripts/teste-link-celular-tarefas.sql` (seção B; o ensaio passa a inlinear as duas migrations)

**Interfaces:**
- Consumes: Task 1 (`_mobile_link_resolver`, gêmeos).
- Produces (todas `(p_token TEXT, …)`, `GRANT TO anon, authenticated`):
  - `celular_sessao(p_token) RETURNS JSONB` → `{user_id, nome (profiles.name), org_id, org_nome}`
  - `celular_tarefas_listar(p_token, p_space_id UUID DEFAULT NULL, p_folder_id UUID DEFAULT NULL, p_sem_pasta BOOLEAN DEFAULT FALSE) RETURNS JSONB` → `{tarefas: [colunas de TASK_COLS], nomes_obras: {id: nome}}`. Filtro = o de `loadTasks` (`status='open'`, `parent_task_id IS NULL`, ordem `due_date ASC NULLS LAST, priority ASC`, limite 300) **e** `org_id = org do link` **e** visibilidade de `tasks_select` ∪ `tasks_select_collaborator` via gêmeos.
  - `celular_espacos_listar(p_token) RETURNS JSONB` → array no formato `TaskSpaceWithMeta` (`folders`, `member_count`, `open_task_count`), só espaços da org do link visíveis por `task_spaces_select` (dono ou membro).
  - `celular_status_listar(p_token) RETURNS JSONB` → `task_statuses` da org do link (mesmas colunas de `taskStatusService.list`).
  - `celular_responsaveis_listar(p_token) RETURNS JSONB` → `[{id, name}]`, mesma regra de `listAssignable` (ATIVO; da org ou compartilhado por `employee_org_shares.target_org_id`).
  - `celular_tarefa_criar(p_token, p_dados JSONB) RETURNS JSONB` (linha com `TASK_COLS`). Aceita: `title` (obrigatório, trim não vazio → senão 22023), `description`, `start_date`, `due_date`, `priority` (1–4), `space_id`, `folder_id`. Força `user_id` = dono do link, `org_id` = org do link, `status='open'`, `source_module='manual'`. `space_id` precisa ser da org do link e `is_task_space_member_de` ou dono; `folder_id` precisa ser do `space_id`.
  - `celular_tarefa_atualizar(p_token, p_task_id UUID, p_patch JSONB) RETURNS JSONB` (linha com `TASK_COLS`). Lista branca: `title, description, start_date, due_date, priority, status ('open'|'done'), status_id, assignee_employee_id`; chave fora dela → 22023. Tarefa da org do link e editável por `tasks_update` (dono ou membro do espaço — colaborador só lê) → senão 42501. `status_id` precisa ser de `task_statuses` da org do link; responsável precisa estar em `celular_responsaveis_listar`.

- [ ] **Step 1: Seção B do teste**, com token de `u` gerado na seção A:
  - `celular_tarefas_listar` como `anon` devolve exatamente as tarefas abertas que `SELECT … FROM tasks` devolve com claims de `u` na mesma org (comparar conjuntos de `id`).
  - Tarefa de outro usuário, fora de espaço de `u`, não aparece; tarefa onde `u` é só colaborador aparece, mas `celular_tarefa_atualizar` nela → 42501.
  - `criar` com `space_id` de outra org → 42501; com `folder_id` de outro espaço → 22023; com título `'  '` → 22023; criada sai com `user_id = u`, `org_id = o`.
  - `atualizar` com `{"org_id": …}` ou `{"user_id": …}` → 22023; com `status_id` de outra org → 42501; com `{"status":"done","status_id":<concluído da org>}` → `status='done'` e `completed_at` preenchido (gatilho existente).
  - Token de outra org não lista nada de `o`.
- [ ] **Step 2: Rodar** → FAIL `function public.celular_tarefas_listar(...) does not exist`.
- [ ] **Step 3: Escrever a migration** com as interfaces acima.
- [ ] **Step 4: Ensaio** com as duas migrations inlineadas → `TUDO OK`.
- [ ] **Step 5:** `npx vitest run __tests__/segurancaMigrations.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(banco): RPCs de Tarefas do link do celular`.

### Task 3: `TarefasFonte` — fonte logada e fonte do link

**Files:**
- Create: `services/celular/tarefasFonte.ts`
- Test: `__tests__/tarefasFonte.test.ts`

**Interfaces:**
- Consumes: RPCs da Task 2; tipos `Task`, `TaskStatus` (de onde `TasksMobileApp` importa hoje), `TaskSpaceWithMeta`.
- Produces:
  ```ts
  export interface EscopoTarefas { spaceId?: string; folderId?: string; semPasta?: boolean }
  export interface NovaTarefa { orgId: string; title: string; description: string | null; start_date: string | null; due_date: string | null; priority: number; space_id: string | null; folder_id: string | null }
  export type PatchTarefa = Partial<Pick<Task, 'title'|'description'|'start_date'|'due_date'|'priority'|'status'|'status_id'|'assignee_employee_id'>>
  export interface TarefasFonte {
    modo: 'logado' | 'link'
    listarTarefas(orgId: string | undefined, escopo: EscopoTarefas | null, limite: number): Promise<{ tarefas: Task[]; nomesObras: Map<string, string> }>
    listarEspacos(orgId: string | undefined): Promise<TaskSpaceWithMeta[]>
    listarStatus(orgId: string | undefined): Promise<TaskStatus[]>
    listarResponsaveis(orgId: string): Promise<{ id: string; name: string }[]>
    criarTarefa(dados: NovaTarefa): Promise<Task>
    atualizarTarefa(id: string, patch: PatchTarefa): Promise<Task>
  }
  export const fonteLogada: TarefasFonte
  export function fonteDoLink(token: string): TarefasFonte
  export const TarefasFonteContext: React.Context<TarefasFonte>   // padrão: fonteLogada
  export function useTarefasFonte(): TarefasFonte
  ```
  `fonteLogada` = o código que hoje está em `TasksMobileApp` (`loadTasks`, `listAssignable`, insert, update), movido sem mudar consultas; `criarTarefa` lê o usuário de `supabase.auth.getUser()` e lança `'Sua sessão expirou. Entre de novo para criar a tarefa.'` sem usuário. Em `fonteDoLink`, `orgId` recebido é ignorado (a org é a do token).

- [ ] **Step 1: Testes** (`vi.mock('../lib/supabase')` no molde de `__tests__/alcadaDaBaixa.test.ts`, com `rpc` e `from` espiões):
  - `fonteDoLink('tk').listarTarefas(undefined, {spaceId:'s', folderId:'f'}, 300)` chama `rpc('celular_tarefas_listar', {p_token:'tk', p_space_id:'s', p_folder_id:'f', p_sem_pasta:false})` e devolve `nomesObras` como `Map`.
  - `semPasta: true` → `p_folder_id: null, p_sem_pasta: true`.
  - `atualizarTarefa('t1', {status:'done', status_id:'d'})` → `rpc('celular_tarefa_atualizar', {p_token:'tk', p_task_id:'t1', p_patch:{status:'done', status_id:'d'}})`.
  - Em **toda** chamada de `fonteDoLink`, `supabase.from` **não** é chamado (Review Focus 2).
  - Erro do `rpc` vira `throw` (a tela já trata com `falha(...)`).
- [ ] **Step 2:** `npx vitest run __tests__/tarefasFonte.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `services/celular/tarefasFonte.ts`.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** — `feat(tarefas): fonte de dados trocável (logado × link do celular)`.

### Task 4: `TasksMobileApp` passa a usar a fonte

**Files:**
- Modify: `components/TasksMobileApp.tsx` (`listAssignable` l.117, `TaskEditSheet` l.562, `AddTaskSheet` l.699, `loadTasks` l.793, `loadSpaces` l.831, status l.846, `reopen` l.852, `complete` l.866, `resolveCreateOrg` l.940)

**Interfaces:**
- Consumes: `useTarefasFonte()` (Task 3).
- Produces: `TasksMobileApp` com o mesmo `Props`; com `fonte.modo === 'link'`, `resolveCreateOrg` devolve `selectedSpace?.org_id ?? orgId` sem `resolveWriteOrg`.

- [ ] **Step 1:** trocar cada acesso a dados pela chamada da fonte; o arquivo não importa mais `supabase` nem `taskSpaceService`/`taskStatusService`.
- [ ] **Step 2: Verificar** — `grep -nE "supabase\.|taskSpaceService|taskStatusService" components/TasksMobileApp.tsx` → nada; `npx tsc --noEmit -p .` sem erro novo (ver `index_publicacao_build.md` para o Node 24); `npx vitest run __tests__/tasksMobileAgenda.test.ts __tests__/tarefasFonte.test.ts __tests__/orgContextGuard.test.ts` → PASS; `bash scripts/check-ui-standard.sh components/TasksMobileApp.tsx` → exit 0.
- [ ] **Step 3: Prova de não regressão (logado)** — harness Playwright com stub do PostgREST (molde em `C:\tmp\pwtest`, ver `index_harness_navegador.md`), viewport 390×844: lista, concluir + Desfazer, criar e editar disparam as mesmas requisições de antes (mesmas URLs/corpos de `tasks`).
- [ ] **Step 4: Commit** — `refactor(tarefas): TasksMobileApp lê e grava pela TarefasFonte`.

### Task 5: Rota `/celular` e `CelularTokenGate`

**Files:**
- Create: `services/celular/celularLinkService.ts`, `components/celular/CelularTokenGate.tsx`
- Modify: `App.tsx` (memo junto de `supplierPortalToken` ~l.657; render junto dos gates ~l.790)
- Test: `__tests__/celularRota.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function tokenDoCelularDaUrl(pathname: string, search: string): string | null  // '/celular' ou '/celular/'; token trim, só [A-Za-z0-9_-]{20,}; senão null
  export function urlDoLinkCelular(token: string, origin?: string): string               // `${origin ?? window.location.origin}/celular?token=${token}`
  export interface SessaoCelular { user_id: string; nome: string; org_id: string; org_nome: string }
  export async function celularSessao(token: string): Promise<SessaoCelular | null>      // 42501 → null; outro erro → throw
  export async function gerarLinkCelular(userId: string, orgId: string): Promise<string>  // devolve a URL
  export async function revogarLinkCelular(userId: string, orgId: string): Promise<void>
  export async function statusLinkCelular(userId: string, orgId: string): Promise<{ existe: boolean; expires_at: string | null; last_used_at: string | null; revogado: boolean }>
  ```
  `CelularTokenGate: React.FC<{ token: string | '' }>` — estados `carregando | invalido | erro | ok`. `ok`: cabeçalho (nome · org), `TarefasFonteContext.Provider value={fonteDoLink(token)}` envolvendo `<TasksMobileApp orgId={sessao.org_id} />`. `invalido`: texto das Global Constraints. `erro` (rede): "Não foi possível abrir. Verifique a conexão." + Tentar de novo. Barra de abas só com "Tarefas" (Diário entra na F5).
  `App.tsx`: `pathname` `/celular` ou `/celular/` **sempre** renderiza o gate (token `null` → `''` → estado `invalido` sem chamar RPC), antes de `<Layout>` e da checagem de login.

- [ ] **Step 1: Testes** — `tokenDoCelularDaUrl('/celular', '?token=abcDEF_123-xyzxyzxyzxyz')` → o token; `'/celular/'` idem; `'?token='`, `'?token=%20%20'`, `'?token=a b'`, `'?token=<script>'`, token com 10 caracteres → `null`; `'/m/loja'` → `null`; `urlDoLinkCelular('t','https://x')` → `'https://x/celular?token=t'`.
- [ ] **Step 2:** `npx vitest run __tests__/celularRota.test.ts` → FAIL.
- [ ] **Step 3: Implementar** serviço, gate e rota.
- [ ] **Step 4:** testes → PASS; `bash scripts/check-ui-standard.sh components/celular/CelularTokenGate.tsx` → exit 0; `orgContextGuard` → PASS.
- [ ] **Step 5: Harness** (stub de `rpc/celular_*`): sem token → tela de recusa e **nenhuma** chamada `rpc/`; token recusado (stub 42501) → recusa; token válido → cabeçalho com nome e org e a lista; com cookie de sessão de outra pessoa no navegador, as chamadas continuam sendo só `rpc/celular_*`.
- [ ] **Step 6: Commit** — `feat(celular): rota /celular com token abre Minhas Tarefas sem login`.

### Task 6: Gestão do link no app logado

**Files:**
- Create: `components/celular/LinkDoCelularBloco.tsx`
- Modify: `components/OrganizationUsers.tsx` (Edit Member Modal ~l.1487), `components/Layout.tsx` (menu da conta, junto de "Minha conta" ~l.1467)

**Interfaces:**
- Consumes: `gerarLinkCelular`, `revogarLinkCelular`, `statusLinkCelular`, `urlDoLinkCelular` (Task 5).
- Produces: `LinkDoCelularBloco: React.FC<{ userId: string; orgId: string; nomePessoa: string }>` — mostra validade e último uso; **Gerar** (ou **Gerar novo**, que avisa que o anterior para de funcionar, via `useConfirm`); depois de gerar, mostra a URL uma vez com **Copiar** e **WhatsApp** (`https://wa.me/?text=` + texto "Seu link do OrçaCloud no celular: <url>"); **Revogar** com `useConfirm`. Botão desabilitado diz o motivo (`title`).
  No Layout: item "Meu link do celular" abre `Sheet` com o bloco para o usuário logado; org = `useOrgContext().orgId`; em "Todas", `resolveWriteOrg('single')` (REGRA #5).

- [ ] **Step 1: Implementar** bloco e as duas entradas.
- [ ] **Step 2: Verificar** — `bash scripts/check-ui-standard.sh components/celular/LinkDoCelularBloco.tsx components/OrganizationUsers.tsx components/Layout.tsx` → sem item novo; `npx vitest run __tests__/orgContextGuard.test.ts` → PASS; `npx tsc --noEmit -p .` sem erro novo.
- [ ] **Step 3: Harness** (stub das `mobile_link_*`): gerar mostra a URL `…/celular?token=…`, Copiar põe no clipboard, Revogar pede confirmação; usuário em "Todas" vê o seletor de org antes de gerar.
- [ ] **Step 4: Commit** — `feat(usuarios): gerar, copiar e revogar o link do celular`.

### Task 7: Publicar a Parte 1

- [ ] **Step 1:** suíte — `npx vitest run` (ver `index_publicacao_build.md`) e `npm run build` → verdes; ler a saída antes de seguir.
- [ ] **Step 2: ⚠️ com aval do usuário** — aplicar `aplicar_<p1>` e `aplicar_<p2>` com `npx supabase db query --linked -f`; rodar `scripts/teste-link-celular-tarefas.sql` (sem `-- MIGRATION` preenchido) → `TUDO OK`; `bash scripts/check-rls-postura.sh` → verde.
- [ ] **Step 3: Sonda de fora** — `curl` em `rest/v1/user_mobile_links` com a chave anon → `[]` ou 401/42501; `rest/v1/rpc/celular_sessao` com token falso → 42501.
- [ ] **Step 4: ⚠️ com aval do usuário** — `git push origin HEAD:main`; `bash scripts/conferir-producao.sh "Meu link do celular"` → SHA e texto no bundle.
- [ ] **Step 5: Prova real** — o usuário gera o próprio link, abre no celular, conclui e desfaz uma tarefa; registrar o resultado em **Estado**.

## Plano de implementação — Parte 2 (F3–F5: Diário de Obras pelo link)

> **Para quem executa:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans. Passos com `- [ ]`.

**Goal:** no `/celular?token=…`, uma segunda aba **Diário** com o mesmo `DiaryMobileApp` do app
logado: escolher diário, criar/editar/excluir registro com foto, efetivo do RH, vínculo com o
cronograma — tudo como a pessoa dona do link, na org do link.

**Architecture:** o corpo de `diary_upsert_entry`/`diary_delete_entry` vira núcleo
`SECURITY DEFINER` com o ator explícito (`_diary_*_core(p_ator, …)`); as RPCs atuais passam a
chamá-lo com `auth.uid()` e as `celular_diario_*` com o dono do link. Fotos por uma Edge
(`celular-diario-midia`) que autoriza por RPC e assina com service role; o celular sobe direto
ao storage por URL assinada. No front, `DiaryMobileApp` lê e grava por uma `DiarioFonte`
(contexto), no molde de `TarefasFonte`.

**Tech Stack:** Postgres/Supabase (plpgsql), Edge Function Deno (`@supabase/supabase-js`),
React 19 + Vite, Vitest.

**Spec:** a seção **Design** acima (§2 núcleo, §3 RPCs, §4 mídia, §5 telas). Mapa do código
do Diário em `main` levantado em 2026-11-12 (resumo nas decisões abaixo).

### Decisões da Parte 2 (onde o Design deixava escolha)

| # | Decisão | Por quê |
|---|---|---|
| D1 | A lista de diários do link vem de `celular_diarios_listar`: **todos** os projetos da org do link em formato enxuto (`settings` só com `classification`, `linkedProjectId`, `linkedProjectName`, `organizationId` e, nos DIARIO/OBRA, `diaryEntries` reduzidos a `{id, date, impediments}`) | `DiaryMobileApp` filtra e resume a lista em memória e `resolverPlanejamentoDoDiario` (JS) precisa de `{id, classification, linkedProjectId}` de todos — o vínculo continua **uma peça só** (memória do Diário) |
| D2 | `celular_diario_registros` do Design vira `celular_diario_abrir` (devolve o diário com `diaryEntries` completos) | é o `loadProject` da tela; nome diz o que faz |
| D3 | Cronograma pelo link: o celular calcula com `aplicarEvolucaoNoCronograma` (JS, igual ao logado) e manda **só** `{itemId: pct}`; `celular_planejamento_gravar_evolucao` grava só `manualRealPct` desses itens | servidor não reimplementa a regra; o link nunca regrava `settings`/`budget` inteiros (o `saveProject` logado regrava) |
| D4 | Planejamento aceito pelo link: da org do link **e** (`PLANEJAMENTO` **ou** o próprio `linkedProjectId` do diário — o fallback do resolver) | o membro logado já grava qualquer projeto da org; o link fica mais estreito que isso |
| D5 | Efetivo no link = colaboradores do RH (`celular_efetivo_listar`); as sugestões de equipes/cargos de `organizations.resources` (store logado) não entram | YAGNI; o campo continua aceitando texto livre |
| D6 | Aprovação no link: `celular_sessao` ganha `pode_aprovar_diario` (`fn_pode_aprovar_diario_de`); a tela usa `{pode}` dele no lugar de `useDiaryAprovacao` | sem store no link; o banco segue decidindo. `pode_aprovar_diario` é lido **uma vez, quando o link abre**; se a permissão for revogada com o link aberto, o botão continua aparecendo, mas o banco recusa com a mensagem certa (aceito) |
| D7 | `assinar` só assina path com prefixo `{org do link}/` **e** citado em registro de diário da org; os outros são omitidos (sem 403) | um registro do link pode citar path forjado de outra org — sem o prefixo, a Edge vazaria foto alheia |
| D8 | Regras puras da Edge (validar pedido, extensões) em `supabase/functions/celular-diario-midia/regras.ts`, sem import Deno, testadas no Vitest | mesmo arranjo de outras Edges do projeto |

### Global Constraints (Parte 2)

- Valem todas as da Parte 1 (frente, prefixo maior que o maior do dia **na hora** — último visto `20271112900000`, `db query -f`, nunca `db push`, aval do usuário para aplicar e publicar, REVOKE/GRANT, `search_path`, recusa `'link inválido ou vencido'` 42501, REGRA #1/#5, português).
- Corpo do núcleo copiado do **arquivo** `aplicar_20271014600000_diario_aprovacao_permissao.sql` — nunca do banco nem da `…500000` (a checagem de aprovação some em silêncio).
- Escrita em `settings.diaryEntries` só com a marca `set_config('orcacloud.diario_escrita','on',true)` … `'off'` (gatilho `trg_projects_diary_entries_guard`).
- Mensagens e ERRCODEs do núcleo idênticos aos de hoje (`'registro do diário sem id'`/`'sem data'` 22023; `'diário não encontrado ou sem permissão'` 42501; as duas de aprovação; `'sem permissão para gravar neste diário'` 42501). Projeto fora da org do link → `'diário não encontrado ou sem permissão'` 42501.
- Bucket `diario-midia`, path `{org}/{projeto}/{uuid}.{ext}`; extensões aceitas no link: `jpg, jpeg, png, webp, gif, heic, heif`. URL assinada de leitura: 3600 s.
- Edge `celular-diario-midia`: `[functions.celular-diario-midia] verify_jwt = false` em `supabase/config.toml`; env `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; RPCs chamadas com a chave **anon** (sem repassar o `Authorization` do pedido); service role só para o storage. Deploy: **o usuário** roda `cd C:\D\frentes\link-celular; npx supabase functions deploy celular-diario-midia --no-verify-jwt` no PowerShell (o auto mode barra).
- Ordem de publicação: migrations → Edge → front.

### Review Focus (Parte 2)

1. Registro do link citando foto de **outra org** (`images: ['<outraOrg>/<proj>/x.jpg']`) → `assinar` não assina. Teste SQL de `celular_diario_midia_permitida` (Task 2).
2. App logado depois da troca para o núcleo: membro grava; não membro 42501; diário com `organization_id` NULL e `settings.organizationId` grava; aprovação igual a antes. Regressão SQL (Task 1).
3. Registro **Aprovado** editado ou excluído pelo link de quem não aprova → 42501 com a mesma mensagem do app. Teste SQL (Task 2) e botão travado com o motivo (Task 5).
4. Navegador com sessão logada de outra pessoa abrindo o link → a fonte do link nunca usa `supabase.from`, `storage…upload/createSignedUrls/remove` nem `projectService`. Teste Vitest (Task 4).
5. Evolução forjada (pct 150, `"abc"`, chave não-objeto, planejamento de outra org ou que não é `PLANEJAMENTO` nem o vínculo do diário) → 22023/42501; e a gravação muda **só** `manualRealPct` dos itens enviados. Teste SQL (Task 2).

### Arquivos (Parte 2)

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/aplicar_<p3>_diario_nucleo_com_ator.sql` | `fn_pode_aprovar_diario_de`, núcleos `_diary_*_core`, RPCs atuais como chamadores |
| `supabase/migrations/aplicar_<p4>_link_celular_rpcs_diario.sql` | `celular_sessao` (+aprovação) e as `celular_diario*`, efetivo, planejamento, mídia |
| `scripts/teste-link-celular-diario.sql` | prova `BEGIN … ROLLBACK` (seção A: núcleo/regressão; B: link) |
| `supabase/functions/celular-diario-midia/{index.ts,regras.ts}` + `supabase/config.toml` | Edge `subir` / `assinar` / `remover` |
| `services/celular/diarioFonte.ts` | `DiarioFonte`, `fonteDiarioLogado`, `fonteDiarioDoLink`, contexto |
| `hooks/useDiaryMediaUrls.ts`, `hooks/useDiaryLinkedPlanning.ts` | parâmetro opcional de assinatura / carga (padrão = hoje) |
| `components/DiaryMobileApp.tsx` | lê e grava pela fonte |
| `components/celular/DiarioDoLink.tsx`, `components/celular/CelularTokenGate.tsx`, `services/celular/celularLinkService.ts` | aba Diário no link |
| `__tests__/diarioFonte.test.ts`, `__tests__/celularDiarioMidiaRegras.test.ts`, `__tests__/components/DiaryMobileAppFonte.test.tsx`, `__tests__/components/CelularTokenGate.test.tsx` | unitários |

---

### Task 8: Banco — núcleo do Diário com ator explícito

**Files:**
- Create: `supabase/migrations/aplicar_<p3>_diario_nucleo_com_ator.sql`
- Create: `scripts/teste-link-celular-diario.sql` (seção A)

**Interfaces:**
- Consumes: `is_org_member_de(p_user, p_org)` (Parte 1).
- Produces (SQL):
  - `fn_pode_aprovar_diario_de(p_user UUID, p_org UUID) RETURNS BOOLEAN` STABLE DEFINER — corpo do arquivo 600000 com `auth.uid()` → `p_user` e `auth.jwt()->>'email'` → e-mail de `auth.users` de `p_user`; `REVOKE … FROM PUBLIC, anon, authenticated`. `fn_pode_aprovar_diario(p_org)` passa a `RETURN fn_pode_aprovar_diario_de(auth.uid(), p_org)` (mesmos privilégios de hoje).
  - `_diary_upsert_core(p_ator UUID, p_project_id UUID, p_entry JSONB) RETURNS JSONB` e `_diary_delete_core(p_ator UUID, p_project_id UUID, p_entry_id TEXT) RETURNS JSONB` — VOLATILE DEFINER; corpos do arquivo 600000 com: depois do `SELECT … FOR UPDATE`, `IF v_org IS NULL OR NOT is_org_member_de(p_ator, v_org) THEN RAISE 'diário não encontrado ou sem permissão' 42501`; aprovação por `fn_pode_aprovar_diario_de(p_ator, v_org)`; `REVOKE … FROM PUBLIC, anon, authenticated`.
  - `diary_upsert_entry(p_project_id, p_entry)` / `diary_delete_entry(p_project_id, p_entry_id)`: mesma assinatura e privilégios; `auth.uid() IS NULL` → 42501 `'sem permissão para gravar neste diário'`; senão `RETURN _diary_*_core(auth.uid(), …)`.

- [ ] **Step 1: Seção A da prova** (molde `scripts/teste-vinculo-colaborador-envolvidos.sql`: `pg_temp.confere`, `pg_temp.como(user, sql)` com claims sub+email+role). Fixtures na transação: diário `DIARIO` na org 926cf626 (`organization_id` preenchido) e um com `organization_id NULL` + `settings.organizationId`; membro comum `m` sem `canApproveDiary`, admin `g` (fixture), não membro `x`. Asserções:
  - `m` salva registro Rascunho → `entries` com ele, `anterior` NULL; salva de novo → `anterior` = o primeiro.
  - `m` no diário de `organization_id NULL` → grava.
  - `x` → 42501 `'diário não encontrado ou sem permissão'`.
  - `m` muda para `Aprovado` → 42501 com a mensagem de aprovação; `g` aprova → ok; `m` edita / exclui o aprovado → 42501 (mensagens de "alterá-lo"/"excluí-lo").
  - `UPDATE projects SET settings = settings - 'diaryEntries'` como postgres sem marca → `diaryEntries` intacto (gatilho segue valendo).
  - Equivalência: para cada membro com `user_id` (limite 500), `fn_pode_aprovar_diario_de(user, org)` = `fn_pode_aprovar_diario(org)` com as claims dele.
  - Forma: núcleos e `_de` DEFINER, `search_path=public, pg_temp`, sem EXECUTE para PUBLIC/anon/authenticated; `diary_*_entry` com EXECUTE só `authenticated`.
- [ ] **Step 2: RED** — `npx supabase db query --linked -f scripts/teste-link-celular-diario.sql` → FAIL `function public.fn_pode_aprovar_diario_de(…) does not exist`.
- [ ] **Step 3: Migration** com as interfaces acima.
- [ ] **Step 4: Ensaio** (migration no lugar de `-- MIGRATION`) → `TUDO OK`; confirmar que nada ficou no banco.
- [ ] **Step 5:** `npx vitest run __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(diario): núcleo de gravação com ator explícito (app logado chama com auth.uid())`.

### Task 9: Banco — RPCs do Diário pelo link

**Files:**
- Create: `supabase/migrations/aplicar_<p4>_link_celular_rpcs_diario.sql` (`<p4>` > `<p3>`)
- Modify: `scripts/teste-link-celular-diario.sql` (seção B; o ensaio inlineia as duas)

**Interfaces:**
- Consumes: Task 8; `_mobile_link_resolver`.
- Produces (todas `(p_token TEXT, …)`, VOLATILE DEFINER, `GRANT TO anon, authenticated`; "projeto da org" = `coalesce(organization_id, nullif(settings->>'organizationId','')::uuid) = org do link`):
  - `celular_sessao` — corpo do arquivo `aplicar_20271111960000…` + `pode_aprovar_diario: fn_pode_aprovar_diario_de(user, org)`.
  - `celular_diarios_listar(p_token) RETURNS JSONB` — D1; ordem `updated_at DESC`.
  - `celular_diario_abrir(p_token, p_project_id UUID) RETURNS JSONB` → `{id, name, organization_id, settings: {classification, linkedProjectId, linkedProjectName, organizationId, diaryEntries}}`; fora da org → 42501.
  - `celular_diario_salvar(p_token, p_project_id UUID, p_entry JSONB)` / `celular_diario_excluir(p_token, p_project_id UUID, p_entry_id TEXT) RETURNS JSONB` — projeto da org, senão 42501; depois `_diary_*_core(dono do link, …)`.
  - `celular_efetivo_listar(p_token) RETURNS JSONB` → `[{id, name, role, status}]`, `status='ATIVO'`, `org_id` = org do link **ou** `id IN employee_org_shares(target_org_id = org)`, por `name`.
  - `celular_planejamento_ler(p_token, p_diario_id UUID, p_planejamento_id UUID) RETURNS JSONB` → `{schedule, budget}`; diário e planejamento da org; planejamento conforme D4, senão 42501; `budget` = do planejamento ou, vazio, do projeto `settings.linkedProjectId` dele (mesma org); cada item reduzido a `{id, quantity, sinapiItem: {description}}`.
  - `celular_planejamento_gravar_evolucao(p_token, p_diario_id UUID, p_planejamento_id UUID, p_evolucao JSONB) RETURNS JSONB` (o `schedule` gravado) — mesma autorização de `ler`; `p_evolucao` objeto de até 2000 chaves, valor número 0–100, senão 22023; para cada chave: `manualRealPct` no `itemSchedules` de mesmo `id` ou `{id, manualRealPct}` acrescentado (o fallback do JS); só `settings.schedule` muda.
  - `celular_diario_autoriza(p_token, p_project_id UUID) RETURNS UUID` — a org, se o projeto é da org e `DIARIO`/`OBRA`; senão 42501.
  - `celular_diario_midia_permitida(p_token, p_paths TEXT[]) RETURNS TEXT[]` — D7; mais de 100 paths → 22023.
  - `celular_diario_midia_orfa(p_token, p_project_id UUID, p_paths TEXT[]) RETURNS TEXT[]` — paths com prefixo `{org}/{projeto}/` que nenhum registro do projeto cita (`images`, `videos`, `documents[].url`); projeto fora da org → 42501.

- [ ] **Step 1: Seção B**, com token de `m` gerado por `mobile_link_generate` (claims de `m`) e chamadas como `anon`:
  - `celular_sessao` → `pode_aprovar_diario` false para `m`, true para o link de `g`.
  - `celular_diarios_listar` → contém os diários da org e nenhum projeto de outra org; `diaryEntries` só com `id, date, impediments`.
  - `abrir`/`salvar`/`excluir` em diário de outra org → 42501; `salvar` grava (o registro aparece em `settings.diaryEntries`, lido como postgres) e `excluir` o tira; Aprovado pelo link de `m` → 42501 de aprovação.
  - Review Focus 5: `gravar_evolucao` com `{"i": 150}`, `{"i": "abc"}`, `'[1]'` → 22023; planejamento de outra org → 42501; válido → só `manualRealPct` dos itens enviados mudou (comparar `settings` antes/depois sem `schedule.itemSchedules[*].manualRealPct`) e `diaryEntries` intacto.
  - Review Focus 1: registro salvo pelo link citando `'<outraOrg>/<p>/x.jpg'` e `'<org>/<p>/y.jpg'` → `midia_permitida` devolve só o segundo; path não citado não sai.
  - `midia_orfa`: devolve o path do projeto não citado; não devolve o citado nem o de outro projeto.
  - Forma: todas as `celular_*` novas com EXECUTE para anon/authenticated e sem PUBLIC.
- [ ] **Step 2: RED** → FAIL `function public.celular_diarios_listar(…) does not exist`.
- [ ] **Step 3: Migration.**
- [ ] **Step 4: Ensaio** com as duas → `TUDO OK`.
- [ ] **Step 5:** segurança + prefixo (Vitest) → PASS.
- [ ] **Step 6: Commit** — `feat(banco): RPCs do Diário pelo link do celular`.

### Task 10: Edge `celular-diario-midia`

**Files:**
- Create: `supabase/functions/celular-diario-midia/regras.ts`, `supabase/functions/celular-diario-midia/index.ts`
- Modify: `supabase/config.toml` (bloco `[functions.celular-diario-midia]`, `verify_jwt = false`)
- Test: `__tests__/celularDiarioMidiaRegras.test.ts`

**Interfaces:**
- Consumes: `celular_diario_autoriza`, `celular_diario_midia_permitida`, `celular_diario_midia_orfa` (Task 9).
- Produces: `POST` JSON (CORS `*`, `OPTIONS` → `ok`):
  - `{acao:'subir', token, project_id, ext}` → `{path, token: <token de upload assinado>}` (`createSignedUploadUrl(path)`; path montado no servidor com `crypto.randomUUID()`).
  - `{acao:'assinar', token, paths}` → `{urls: {[path]: url}}` (só os permitidos; `createSignedUrls(…, 3600)`).
  - `{acao:'remover', token, project_id, paths}` → `{removidos: string[]}`.
  - Erros: pedido inválido → 400 `{error}`; RPC 42501 → 403 `{error: <mensagem do banco>}`; outro → 500.
  - `regras.ts`: `export type PedidoMidia = …` e `export function validarPedido(body: unknown): { ok: true; pedido: PedidoMidia } | { ok: false; erro: string }` (ação conhecida; token string não vazia; `project_id` uuid em `subir`/`remover`; `ext` minúscula na lista das Global Constraints; `paths` array de 1–100 strings não vazias); `export function montarPath(org: string, projeto: string, uuid: string, ext: string): string`.

- [ ] **Step 1: Testes** de `validarPedido`/`montarPath`: ação desconhecida, token vazio, `ext` `'html'`/`'JPG '`, `paths` vazio e com 101 → erro; `{acao:'subir', token:'t', project_id:<uuid>, ext:'jpg'}` → ok; `montarPath('o','p','u','jpg')` → `'o/p/u.jpg'`.
- [ ] **Step 2:** `npx vitest run __tests__/celularDiarioMidiaRegras.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `regras.ts` e `index.ts` (molde `client-portal-diary-download/index.ts`) e o bloco do `config.toml`.
- [ ] **Step 4:** teste → PASS; `npx tsc --noEmit -p .` sem erro novo.
- [ ] **Step 5: Commit** — `feat(diario): Edge de mídia do link do celular (subir, assinar, remover)`.

### Task 11: `DiarioFonte` e os dois hooks

**Files:**
- Create: `services/celular/diarioFonte.ts`
- Modify: `hooks/useDiaryMediaUrls.ts`, `hooks/useDiaryLinkedPlanning.ts`
- Test: `__tests__/diarioFonte.test.ts`

**Interfaces:**
- Consumes: Tasks 9–10; `salvarRegistroDiario`, `excluirRegistroDiario`, `sincronizarEvolucaoNoPlanejamento`, `DiaryWriteResult` (`services/diaryEntryService.ts`); `uploadDiaryMedia`, `removeDiaryMedia`, `signDiaryMediaUrls`, `isDiaryStoragePath` (`services/diaryMediaService.ts`); `comprimirFoto`; `aplicarEvolucaoNoCronograma`; `ehRecusaDoLink`/`MENSAGEM_LINK_RECUSADO` (de `tarefasFonte.ts` — reaproveitar, não duplicar).
- Produces:
  ```ts
  export interface DiarioCarregado { id: string; name: string; organization_id?: string | null; settings: Record<string, any> }
  export interface ColaboradorRh { id: string; name: string; role: string | null; status: string }
  export interface DiarioFonte {
    modo: 'logado' | 'link'
    /** null no logado (vale useDiaryAprovacao); no link, o que celular_sessao disse. */
    podeAprovarNoLink: boolean | null
    carregarDiario(projectId: string): Promise<DiarioCarregado>
    salvarRegistro(projectId: string, entry: DiaryEntry): Promise<DiaryWriteResult>
    excluirRegistro(projectId: string, entryId: string): Promise<DiaryWriteResult>
    listarColaboradores(orgId: string | null): Promise<ColaboradorRh[]>
    carregarPlanejamento(diarioId: string, planejamentoId: string): Promise<{ schedule: ProjectSchedule | null; budget: BudgetEntry[] }>
    gravarEvolucao(diarioId: string, planejamentoId: string, entries: DiaryEntry[]): Promise<ProjectSchedule | null>
    subirFoto(args: { orgId: string; projectId: string; file: File }): Promise<string>
    assinarFotos(paths: readonly string[]): Promise<Record<string, string>>
    removerFotos(projectId: string, paths: readonly string[]): Promise<void>
  }
  export interface DiarioFonteDoLink extends DiarioFonte { listarProjetos(): Promise<ProjetoDoLink[]> }  // ProjetoDoLink = item de celular_diarios_listar
  export const fonteDiarioLogado: DiarioFonte          // os serviços de hoje, sem mudar consultas
  export function fonteDiarioDoLink(token: string, opts: { aoRecusar?: () => void; podeAprovar: boolean }): DiarioFonteDoLink
  export const DiarioFonteContext: React.Context<DiarioFonte>   // padrão: fonteDiarioLogado
  export function useDiarioFonte(): DiarioFonte
  ```
  No link: `subirFoto` = `comprimirFoto` → Edge `subir` (ext por `diaryMediaExtension`) → `storage.from('diario-midia').uploadToSignedUrl(path, token, arquivo, {contentType})` → `path`; `assinarFotos` filtra `isDiaryStoragePath` e chama a Edge `assinar` (sem path → `{}` sem chamada); `removerFotos` = Edge `remover` (falha só `console.warn`, como hoje); `gravarEvolucao` = `carregarPlanejamento` → `aplicarEvolucaoNoCronograma` → sem mudança `null`, senão `celular_planejamento_gravar_evolucao` com `{itemId: manualRealPct}` dos itens mudados.
  `useDiaryMediaUrls(refs, portalToken?, assinar?)`: com `assinar`, usa-o no lugar de `signDiaryMediaUrls`. `useDiaryLinkedPlanning(linkedProjectId, projects, carregar?)`: com `carregar(planejamentoId)`, usa-o no lugar das duas `loadProject` (o fallback do orçamento do pai fica no carregador padrão).

- [ ] **Step 1: Testes** (molde `__tests__/tarefasFonte.test.ts`, `vi.mock('../lib/supabase')` com `rpc`, `from`, `functions.invoke`, `storage.from` espiões):
  - `salvarRegistro('p', e)` no link → `rpc('celular_diario_salvar', {p_token:'tk', p_project_id:'p', p_entry:e})`.
  - `gravarEvolucao` sem mudança → nenhuma chamada de gravação, `null`; com mudança → `p_evolucao` só com os itens mudados.
  - `subirFoto` → `functions.invoke('celular-diario-midia', {body:{acao:'subir', token:'tk', project_id:'p', ext:'jpg'}})` e `uploadToSignedUrl` com o path devolvido.
  - `assinarFotos(['data:x', 'o/p/a.jpg'])` → só `'o/p/a.jpg'` vai à Edge.
  - Review Focus 4: em toda chamada do link, `from`, `storage…upload`, `createSignedUrls` e `remove` não são chamados.
  - 42501 `'link inválido ou vencido'` → `aoRecusar` e `throw`; outro 42501 (aprovação) → só `throw`.
  - Hooks: `useDiaryMediaUrls(['o/p/a.jpg'], undefined, assinar)` usa `assinar`; sem ele, `signDiaryMediaUrls` como hoje.
- [ ] **Step 2:** `npx vitest run __tests__/diarioFonte.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** → PASS; `npx vitest run __tests__/diaryMediaService.test.ts __tests__/diaryPlanningLink.test.ts` → PASS (o logado não mudou).
- [ ] **Step 5: Commit** — `feat(diario): fonte de dados trocável (logado × link do celular)`.

### Task 12: `DiaryMobileApp` passa a usar a fonte

**Files:**
- Modify: `components/DiaryMobileApp.tsx` (`loadProject` ~l.1078, `listEmployees` ~l.1037, `useDiaryLinkedPlanning` l.1093, `persist` l.1107–1150, `useDiaryAprovacao` l.1031, `useDiaryMediaUrls` l.381 e l.488, upload em `addFotos` l.536, `removeDiaryMedia` em `cancelar` l.491 e `persist`)
- Test: `__tests__/components/DiaryMobileAppFonte.test.tsx`

**Interfaces:**
- Consumes: `useDiarioFonte()` (Task 11).
- Produces: mesmo `Props`. `aprovacao` = `fonte.podeAprovarNoLink === null ? useDiaryAprovacao(org) : (podeAprovarNoLink ? {pode:true} : {pode:false, motivo: MOTIVO_SEM_PERMISSAO_APROVAR})` (o hook continua sendo chamado sempre — regra dos Hooks). O carregador de `useDiaryLinkedPlanning` e o `assinar` de `useDiaryMediaUrls` vêm da fonte em `useCallback` estável (R8 da Parte 1: função nova a cada render recarrega em laço).

- [ ] **Step 1: Teste de componente** (molde `__tests__/components/TasksMobileAppPrioridadeClassificar.test.tsx`; `vi.mock('../../lib/supabase', () => ({ supabase: {} }))` — qualquer acesso direto quebra): com fonte falsa `modo:'link'`, `podeAprovarNoLink:false` e um diário com um registro Aprovado:
  - abrir o diário → `carregarDiario('d1')`; os registros aparecem;
  - criar registro (data + descrição) e salvar → `salvarRegistro('d1', …)` uma vez;
  - registro Aprovado: lixeira e Salvar desabilitados com o motivo `MOTIVO_REGISTRO_APROVADO` no `title`;
  - foto: `subirFoto` chamado com `{orgId, projectId:'d1'}`.
- [ ] **Step 2:** → FAIL (a tela ainda chama `projectService`).
- [ ] **Step 3: Trocar** cada acesso pela fonte; o arquivo não importa mais `projectService`, `laborService`, `diaryEntryService` (exceto tipos), `uploadDiaryMedia` nem `removeDiaryMedia`.
- [ ] **Step 4:** teste → PASS; `grep -nE "projectService|laborService|uploadDiaryMedia|removeDiaryMedia|supabase\." components/DiaryMobileApp.tsx` → nada; `bash scripts/check-ui-standard.sh components/DiaryMobileApp.tsx` → exit 0; `orgContextGuard` → PASS; `tsc` sem erro novo.
- [ ] **Step 5: Commit** — `refactor(diario): DiaryMobileApp lê e grava pela DiarioFonte`.

### Task 13: Aba Diário no link

**Files:**
- Create: `components/celular/DiarioDoLink.tsx`
- Modify: `components/celular/CelularTokenGate.tsx` (`ABAS` l.32–35), `services/celular/celularLinkService.ts` (`SessaoCelular` + `pode_aprovar_diario: boolean`)
- Test: `__tests__/components/CelularTokenGate.test.tsx`

**Interfaces:**
- Consumes: `fonteDiarioDoLink` (Task 11), `DiaryMobileApp` (Task 12).
- Produces: `DiarioDoLink: React.FC<{ fonte: DiarioFonteDoLink }>` — carrega `fonte.listarProjetos()` (carregando / erro com Tentar de novo / ok) e renderiza `<DiarioFonteContext.Provider value={fonte}><DiaryMobileApp projects={projetos} /></…>`. No gate: abas **Tarefas | Diário** (a barra volta a aparecer — 2 abas); `fonteDiario` em `useMemo([token, sessao.pode_aprovar_diario])` com o mesmo `aoRecusar` das Tarefas.

- [ ] **Step 1: Testes** (no arquivo existente): com sessão ok, a barra mostra "Tarefas" e "Diário"; tocar "Diário" monta `DiarioDoLink` (mock) com fonte `modo:'link'`; recusa do token numa RPC do Diário desmonta a tela e mostra o texto de recusa (mesmo caminho das Tarefas). Ajustar o teste antigo "com uma aba só não há barra" para o novo estado.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** → PASS; `check-ui-standard` nos dois `.tsx` → exit 0.
- [ ] **Step 5: Commit** — `feat(celular): aba Diário de Obras no link do celular`.

### Task 14: Publicar a Parte 2

- [ ] **Step 1:** suíte Vitest (ver `index_publicacao_build.md`) e `npm run verificar:build` → verdes; ler a saída antes de seguir.
- [ ] **Step 2: ⚠️ com aval do usuário** — prefixos conferidos na hora; aplicar `<p3>` e `<p4>` com `db query -f`; `scripts/teste-link-celular-diario.sql`, `teste-link-celular-tarefas.sql` e `teste-tarefas-responsavel.sql` no banco real → `TUDO OK`; `check-rls-postura.sh` → verde.
- [ ] **Step 3: ⚠️ o usuário publica a Edge** — `cd C:\D\frentes\link-celular; npx supabase functions deploy celular-diario-midia --no-verify-jwt` no PowerShell.
- [ ] **Step 4: Sonda de fora** (`curl` em `functions/v1/celular-diario-midia`): sem token → 400; token falso → 403; token válido + `assinar` de path de outra org → `{urls:{}}`; `subir` válido → `{path, token}` com path `{org}/{projeto}/…`.
- [ ] **Step 5: ⚠️ com aval do usuário** — `git push origin HEAD:main`; `bash scripts/conferir-producao.sh` → domínio = `origin/main`.
- [ ] **Step 6: Prova real** — pelo link no celular: registro com foto e atividade vinculada; conferir no desktop (registro e foto no diário, evolução no cronograma). Registrar em **Estado**.

## Estado

- [x] Design aprovado em 5 seções (2026-11-11) — `eb6661b5`
- [x] Plano de implementação Parte 1 (F1 + F2)
- [x] Task 1 `f4a8922d` · [x] Task 2 `57e99095` · [x] Task 3 `1f8cc825` · [x] Task 4 `1c38a778` · [x] Task 5 `c4cc0bf1` · [x] Task 6 `fdfbdc7f` · [ ] Task 7
- [x] Correções da revisão final (gestor só gera para `member`, revogação com a tela aberta,
  gatilho de saída da org, criar = `tasks_insert`, sem barra de aba única) — `fa2a00e6`
  (banco), `3f1c251e` (front). Ensaio BEGIN/ROLLBACK com as duas migrations → `TUDO OK`.
  (Hashes de antes do rebase em `origin/main`; no `main` os commits têm outros SHAs.)
- [x] Visualizador também sem "Gerar link" do gestor (decisão do usuário, 2026-11-11: "só `member`, ajustar a tela").
- [x] Prefixos: o `main` recebeu `aplicar_20271111900000_imovib_scenarios` e `aplicar_20271111910000_imovib_risks`
  no mesmo dia → migrations do link renomeadas para **`aplicar_20271111950000_link_celular_tabela_e_gemeos.sql`** e
  **`aplicar_20271111960000_link_celular_rpcs_tarefas.sql`** (conteúdo igual).
- [x] Task 7 · Step 1: suíte 13.128 testes (conta fecha) — 1 falha **pré-existente** fora desta frente
  (`espelhoDoInvestidor.test.ts` lê `aplicar_20271110200000_torre_contorno_na_planta.sql`, idêntico ao `main`, CRLF ×
  `\n` no teste; CI do `main` verde no mesmo commit de base); `npm run build` ✓; `verificar:build` exit 0.
- [x] Task 7 · Step 2 (aval do usuário, 2026-11-11): ensaio final `TUDO OK` sem resíduo → as duas migrations
  **aplicadas em produção** (exit 0); `scripts/teste-link-celular-tarefas.sql` no banco real → `TUDO OK`;
  `check-rls-postura.sh` 9/9; `anon` executa só `celular_*`; `user_mobile_links` com RLS e 0 policy.
- [x] Task 7 · Step 3: sonda com a chave anon — tabela, resolver e `mobile_link_generate` → *permission denied*;
  `celular_sessao`/`celular_tarefas_listar` com token falso → 42501 `link inválido ou vencido`.
- [x] Task 7 · Step 4: push em `main` + `conferir-producao.sh` (domínio em `6787b03`, com o responsável)
- [x] Step 5: prova real no celular — o usuário confirmou em 2026-11-12 que o link do Iago mostra as mesmas tarefas do app
- [x] Brechas do vínculo e dos envolvidos (`aplicar_20271112800000`): APLICADA e publicada (`61b32d8f`)
- [x] Plano de implementação Parte 2 (F3–F5) — escrito em 2026-11-12 (Tasks 8–14, decisões D1–D8)
- [x] Tasks 8–13 (cada uma revisada; revisão geral "pronto com correções" → leva única de correções: Rollback (Parte 2), sugestões de efetivo no link, título "Abrindo…", `--no-verify-jwt`)
- [x] Task 14 (2026-11-12): suíte 13.489 (1 falha pré-existente, CRLF); `aplicar_20271112950000` e `…960000` APLICADAS; provas diario/tarefas/responsavel/vinculo no banco real `TUDO OK`; `check-rls-postura` 9/9; Edge `celular-diario-midia` publicada (`--no-verify-jwt`); sonda de fora 400/403/400; push `67e18f12..47cb60a1` + texto do link `2822b0da` + folga de teste `11bf400e`; CI verde; domínio = `origin/main`
- [ ] Prova real da Parte 2 no celular (usuário): registro com foto e atividade vinculada pelo link; conferir no desktop e no cronograma
- [x] F1 · [x] F2 · [x] F3 · [x] F4 · [x] F5 (no ar; falta só a prova real da Parte 2)

## Rollback (Parte 2)

Desfaz as migrations da Parte 2 (`aplicar_20271112950000_diario_nucleo_com_ator.sql`,
`aplicar_20271112960000_link_celular_rpcs_diario.sql` e, se aplicada, o limite de uso
`aplicar_20271112990000_link_celular_limite_de_uso.sql`) e devolve o Diário logado ao estado
de `aplicar_20271014600000_diario_aprovacao_permissao.sql`. **Rodar ANTES do "Rollback
(Parte 1)"** — o Rollback (Parte 1) apaga `is_org_member_de`, que os núcleos
`_diary_upsert_core`/`_diary_delete_core` chamam; plpgsql não rastreia dependência, então o
`DROP` passaria sem erro e todo salvar do Diário logado quebraria em tempo de execução. (E
`user_mobile_link_uso` tem FK para `user_mobile_links`: o `DROP TABLE user_mobile_links` do
Rollback (Parte 1) falharia com ela ainda de pé.)

O limite de uso (`…990000`) recria `celular_diario_autoriza`, `celular_diario_midia_permitida`,
`celular_planejamento_ler` e `celular_planejamento_gravar_evolucao` com a cota / `IS NOT TRUE`.
No rollback completo não é preciso reaplicar o `…960000` antes: o passo 2 apaga essas quatro
de qualquer jeito, e só depois delas apaga `_celular_cota` e a tabela — estado final = antes
da Parte 2. Para desfazer **só** o limite de uso, ver "Rollback só do limite de uso" abaixo.

Ordem (importa: nunca há janela em que uma RPC logada chame um núcleo já apagado):

1. **Recriar as três RPCs logadas** — reaplicar o arquivo antigo inteiro; só tem as três
   funções (`fn_pode_aprovar_diario`, `diary_upsert_entry`, `diary_delete_entry`, INVOKER nas
   duas últimas, com os `REVOKE`/`GRANT` do arquivo) e é idempotente (`CREATE OR REPLACE`):

   ```bash
   cd C:\D\frentes\link-celular
   npx supabase db query --linked -f supabase/migrations/aplicar_20271014600000_diario_aprovacao_permissao.sql
   ```

2. **Apagar o que a Parte 2 criou** (e devolver o `celular_sessao` da Parte 1, cujo corpo é o
   de `aplicar_20271111960000_link_celular_rpcs_tarefas.sql`, bloco `celular_sessao`):

```sql
BEGIN;

-- celular_sessao como era (sem pode_aprovar_diario) ANTES de apagar o gêmeo que ela chama.
CREATE OR REPLACE FUNCTION public.celular_sessao(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    RETURN jsonb_build_object(
        'user_id',  v_user,
        'nome',     (SELECT p.name FROM public.profiles p WHERE p.id = v_user),
        'org_id',   v_org,
        'org_nome', (SELECT o.name FROM public.organizations o WHERE o.id = v_org));
END;
$$;

-- RPCs do link (Parte 2)
DROP FUNCTION IF EXISTS public.celular_diarios_listar(TEXT);
DROP FUNCTION IF EXISTS public.celular_diario_abrir(TEXT, UUID);
DROP FUNCTION IF EXISTS public.celular_diario_salvar(TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS public.celular_diario_excluir(TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.celular_efetivo_listar(TEXT);
DROP FUNCTION IF EXISTS public.celular_planejamento_ler(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS public.celular_planejamento_gravar_evolucao(TEXT, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.celular_diario_autoriza(TEXT, UUID);
DROP FUNCTION IF EXISTS public.celular_diario_midia_permitida(TEXT, TEXT[]);
DROP FUNCTION IF EXISTS public.celular_diario_midia_orfa(TEXT, UUID, TEXT[]);

-- Limite de uso (…990000): a cota e a contagem, DEPOIS das RPCs que chamam a cota.
DROP FUNCTION IF EXISTS public._celular_cota(TEXT, TEXT, INTEGER);
DROP TABLE IF EXISTS public.user_mobile_link_uso;

-- Internos do link (Parte 2)
DROP FUNCTION IF EXISTS public._celular_org_do_projeto(UUID, JSONB);
DROP FUNCTION IF EXISTS public._celular_classificacao(JSONB);
DROP FUNCTION IF EXISTS public._celular_settings_enxuto(JSONB);
DROP FUNCTION IF EXISTS public._celular_registros(JSONB);
DROP FUNCTION IF EXISTS public._celular_midias_citadas(JSONB);
DROP FUNCTION IF EXISTS public._celular_midia_path_ok(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS public._celular_confere_paths(TEXT[]);
DROP FUNCTION IF EXISTS public._celular_planejamento_aceito(UUID, UUID, JSONB, JSONB, UUID);

-- Núcleos e gêmeo (as RPCs logadas do passo 1 já não os chamam)
DROP FUNCTION IF EXISTS public._diary_upsert_core(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public._diary_delete_core(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_pode_aprovar_diario_de(UUID, UUID);

COMMIT;
```

3. **Edge** (o usuário roda, o auto mode barra): `npx supabase functions delete celular-diario-midia`
   (e tirar o bloco `[functions.celular-diario-midia]` de `supabase/config.toml` ao reverter o front).
4. **Front:** `git revert` dos commits da Parte 2 (a aba Diário some do `/celular`; `DiaryMobileApp`
   volta a ler/gravar direto).

Ensaiado em `BEGIN … ROLLBACK` contra o banco: migrations `…950000` e `…960000` → passo 1 →
este SQL → conjunto de funções `diary_*`/`_diary_*`/`fn_pode_aprovar_*`/`*celular*` idêntico ao de
antes, `diary_upsert_entry` INVOKER de novo, `celular_sessao` sem `pode_aprovar_diario` e os
corpos das quatro funções restauradas iguais aos de antes → `TUDO OK`.

### Rollback só do limite de uso (`…990000`), mantendo a Parte 2

Ordem (importa: `celular_diario_autoriza`/`celular_diario_midia_permitida` chamam
`_celular_cota`; apagá-la primeiro quebraria todo envio e toda assinatura de foto pelo link):

1. **Reaplicar o `…960000` inteiro** — recria as quatro funções sem a cota e com o `NOT`
   original, com os mesmos `REVOKE`/`GRANT`; é idempotente (`CREATE OR REPLACE`):

   ```bash
   npx supabase db query --linked -f supabase/migrations/aplicar_20271112960000_link_celular_rpcs_diario.sql
   ```

2. **Só então** apagar a cota e a contagem:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public._celular_cota(TEXT, TEXT, INTEGER);
DROP TABLE IF EXISTS public.user_mobile_link_uso;
COMMIT;
```

3. Edge e front podem ficar: sem o 54000 o 429 nunca acontece.

Ensaiado em `BEGIN … ROLLBACK` contra o banco (2026-11-12): `…990000` → passo 1 → passo 2 → as
quatro funções iguais às de produção (corpo sem `\r`, ACL, DEFINER, volatilidade, search_path),
sem `_celular_cota`, sem tabela e nenhuma função citando a cota → OK. E o "Rollback (Parte 2)"
completo com o `…990000` aplicado antes (passo 1 + o SQL do passo 2) → nenhuma função da Parte 2
nem a tabela sobram, nenhuma função cita a cota nem os núcleos, `celular_sessao` sem
`pode_aprovar_diario` → OK.

## Rollback (Parte 1)

**Rodar só DEPOIS do "Rollback (Parte 2)"** (senão `is_org_member_de` some e o Diário logado quebra ao salvar).

Desfaz as duas migrations (`aplicar_20271111950000…` e `aplicar_20271111960000…`). Os
corpos de `is_task_space_member` e `is_task_collaborator` abaixo são os ORIGINAIS, lidos com
`pg_get_functiondef` em produção em 2026-11-11, antes de aplicar. Ensaiado em
`BEGIN … ROLLBACK` (migrations → este SQL → originais idênticos, salvo `\r\n` do corpo
antigo e a ordem do ACL; nenhuma função/tabela/gatilho novo restante) → `ROLLBACK OK`.
Apaga os links gerados (a tabela inteira) — quem tinha link perde o acesso pelo celular.

```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_org_members_revoga_link_celular ON public.organization_members;

DROP FUNCTION IF EXISTS public.celular_sessao(TEXT);
DROP FUNCTION IF EXISTS public.celular_tarefas_listar(TEXT, UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.celular_espacos_listar(TEXT);
DROP FUNCTION IF EXISTS public.celular_status_listar(TEXT);
DROP FUNCTION IF EXISTS public.celular_responsaveis_listar(TEXT);
DROP FUNCTION IF EXISTS public.celular_tarefa_criar(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.celular_tarefa_atualizar(TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS public._celular_tarefa_json(public.tasks);
DROP FUNCTION IF EXISTS public._celular_tarefa_visivel(UUID, UUID, public.tasks);
DROP FUNCTION IF EXISTS public._celular_responsaveis(UUID);
DROP FUNCTION IF EXISTS public._celular_data(JSONB, TEXT);
DROP FUNCTION IF EXISTS public._celular_uuid(JSONB, TEXT);
DROP FUNCTION IF EXISTS public._celular_prioridade(JSONB);

DROP FUNCTION IF EXISTS public.mobile_link_generate(UUID, UUID);
DROP FUNCTION IF EXISTS public.mobile_link_revoke(UUID, UUID);
DROP FUNCTION IF EXISTS public.mobile_link_status(UUID, UUID);
DROP FUNCTION IF EXISTS public._mobile_link_resolver(TEXT);
DROP FUNCTION IF EXISTS public._mobile_link_revoga_ao_sair_da_org();

-- Originais de volta ANTES de apagar os gêmeos (hoje eles chamam os *_de).
CREATE OR REPLACE FUNCTION public.is_task_space_member(p_space_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.task_space_members
        WHERE space_id = p_space_id
          AND user_id  = auth.uid()
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_task_collaborator(p_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_collaborators tc
    JOIN public.employees emp ON emp.id = tc.employee_id
    WHERE tc.task_id = p_task_id
      AND emp.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
$function$;

-- Privilégios como eram antes (inclusive o EXECUTE de PUBLIC que a migration tirou).
GRANT EXECUTE ON FUNCTION public.is_task_space_member(uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_task_collaborator(uuid) TO PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.is_task_space_member_de(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_task_collaborator_de(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_org_member_de(UUID, UUID);
DROP FUNCTION IF EXISTS public._mobile_link_hash(TEXT);

DROP TABLE IF EXISTS public.user_mobile_links;

COMMIT;
```

Front: reverter os commits da Parte 1 (a rota `/celular` sem as RPCs mostra a recusa).

## Verificação

- **SQL sem persistir:** `BEGIN; … ROLLBACK;` com `DO` + `RAISE` (`db query` só devolve o
  último resultado). Gera link de teste, `SET LOCAL ROLE anon`, chama as RPCs: válido
  lista; vencido / revogado / ex-membro → 42501; tarefa alheia fora do espaço → recusa;
  registro aprovado → recusa para quem não aprova; token de outra org não enxerga nada.
- **Equivalência dos gêmeos:** para cada linha de `organization_members` com `user_id`,
  `is_org_member_de(u, o)` = `is_org_member(o)` avaliado com `request.jwt.claims` de `u`.
- **Regressão do app logado (F3):** como `authenticated` + `request.jwt.claims`: membro
  grava, não membro 42501, aprovação idêntica à de antes.
- **Travas:** `__tests__/segurancaMigrations.test.ts`, `__tests__/orgContextGuard.test.ts`,
  `scripts/check-ui-standard.sh` nas telas tocadas, `scripts/check-rls-postura.sh` depois
  de aplicar.
- **Unitários:** contrato das duas fontes (mesma ação → mesma forma de resultado).
- **Tela:** harness Playwright com stub do PostgREST em `/celular` (inválido, Tarefas,
  Diário). Prova com link real que grava: com o usuário, ou com aval explícito na hora.
- **Deploy:** migrations por `db query -f` (nunca `db push`) → Edge → front (push em
  `main`). As RPCs atuais mantêm assinatura: o front antigo segue funcionando no intervalo.
