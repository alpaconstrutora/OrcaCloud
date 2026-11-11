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

## Estado

- [x] Design aprovado em 5 seções (2026-11-11)
- [ ] Plano de implementação detalhado
- [ ] F1 · [ ] F2 · [ ] F3 · [ ] F4 · [ ] F5

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
