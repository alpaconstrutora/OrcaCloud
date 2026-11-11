# Link do celular — Minhas Tarefas e Diário de Obras por token, sem login

## Pedido original

> minhas tarefas versão mobilie: como acessar? qual o link?

Resposta: não havia link próprio — Tarefas é navegação interna do app logado; a versão
mobile aparece com a janela < 768 px.

> criar links proprios como nos portais

Sessão: `dac20e1e-e944-41c5-bafb-71f69696d5e3` · 2026-11-11

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

## Estado

- [x] Design aprovado em 5 seções (2026-11-11) — `eb6661b5`
- [x] Plano de implementação Parte 1 (F1 + F2)
- [x] Task 1 `f4a8922d` · [x] Task 2 `57e99095` · [x] Task 3 `1f8cc825` · [x] Task 4 `1c38a778` · [x] Task 5 `c4cc0bf1` · [x] Task 6 `fdfbdc7f` · [ ] Task 7
- [x] Correções da revisão final (gestor só gera para `member`, revogação com a tela aberta,
  gatilho de saída da org, criar = `tasks_insert`, sem barra de aba única) — `fa2a00e6`
  (banco), `3f1c251e` (front). Ensaio BEGIN/ROLLBACK com as duas migrations → `TUDO OK`;
  migrations ainda NÃO aplicadas.
- [ ] Plano de implementação Parte 2 (F3–F5) — depois de F2 no ar
- [ ] F1 · [ ] F2 · [ ] F3 · [ ] F4 · [ ] F5

## Rollback (Parte 1)

Desfaz as duas migrations (`aplicar_20271111900000…` e `aplicar_20271111910000…`). Os
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
