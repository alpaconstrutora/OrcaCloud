# Portal de Treinamentos (RH › Treinamento)

## Pedido original

> recursos humanos > treinamento: criar portal para treinamentos

Sessão `61edd96c-0bd1-4786-b550-a4ff23a33593` · 2026-10-15.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-15 | Quem acessa o portal? | **Colaboradores + terceirizados/prestadores** |
| 2026-10-15 | Como a pessoa entra? | **E-mail + senha com convite** (igual ao Portal do Parceiro) |
| 2026-10-15 | Relação com o Portal do Colaborador (`/portal?token=`, aba "Trein.")? | **Portal novo e dedicado** (`/portal-treinamentos`, casca no padrão dos portais externos: header, menu, Meus dados, Ajuda e tour). A aba do Portal do Colaborador continua existindo. |
| 2026-10-15 | O que o portal mostra? | **Meus treinamentos + sala de aula · Certificados · Histórico e vencimentos · Catálogo com inscrição** |

## O que já existia (levantado antes de desenhar)

- **Academia ÒPURA** (`PLANO_MODULO_TREINAMENTOS.md`): `training_courses` → `academy_course_versions` →
  módulos/aulas/materiais → `academy_assignments` → `academy_enrollments` → progresso/log/tentativas →
  `academy_certificates` → escreve de volta em `employee_trainings` (`origem='ACADEMIA'`).
- Gestão em **RH › Treinamentos** (`components/LaborTrainings.tsx`, 4 abas). Consumo em
  "Meus Treinamentos" (logado, `employees.user_id`) e na aba "Trein." do **Portal do Colaborador**
  por token (`components/LaborPortal.tsx`, RPCs `academy_portal_*(p_token)`).
- O player, o quiz e a sala são os mesmos nos dois canais (`AcademyPlayerView` + `AcademyChannel`).
- Padrão de portal por e-mail: Portal do Parceiro (`partner_users`, Edge Function
  `partner-invite-user` com `auth.admin.generateLink` + Resend, rota `/portal-parceiro` que força o
  grupo de login, `validateAccess` por e-mail, casca própria fora do `<Layout>`).
- Ajuda/tour dos portais: `utils/portalHelpDefaults.ts` (padrão em código), `portal_help_items`
  (sobrescritas por org), `PortalHelp` + `usePortalHelp`, RPC `portal_help_get_mine(p_portal, p_org)`.

### Achado: o motor da Academia não estava no banco

A migration `20270850000006_academy_engine.sql` (heartbeat, concluir aula, prova, aceite, finalizar,
`fn_academy_recompute_progress`, cascas `academy_*` do app) **nunca tinha sido aplicada** — as RPCs de
portal (`academy_portal_heartbeat` etc.) existiam e chamavam funções inexistentes. É pré-requisito de
qualquer sala de aula — a migration só cria funções (sem DDL de tabela) e precisa ser aplicada com
`npx supabase db query --linked -f supabase/migrations/20270850000006_academy_engine.sql`
(a tentativa de 2026-10-15 nesta sessão foi bloqueada pela permissão de escrita no banco).

## Desenho

### Identidade: `academy_portal_users`

Quem entra no Portal de Treinamentos. Uma linha por (organização, e-mail).

| coluna | o que é |
|---|---|
| `org_id` | organização dona (quem convida) |
| `email` (minúsculo), `name`, `phone`, `cpf` | identificação |
| `tipo` | `COLABORADOR` (já existe em `employees`) ou `TERCEIRO` (prestador/terceirizado) |
| `employee_id` | **sempre preenchido**. Colaborador: a ficha escolhida. Terceiro: uma ficha criada pelo próprio cadastro com `contract_type='EMPREITEIRO'`, `base_salary=0`, `academy_externo=TRUE` |
| `empresa_terceira`, `contractor_id` | para o terceiro: nome da empresa (texto) e, se houver, o empreiteiro cadastrado |
| `is_active`, `invited_at`, `last_access_at`, `created_by` | ciclo de vida |

Por que o terceiro ganha uma ficha em `employees`: toda a cadeia da Academia (matrícula, progresso,
certificado, `employee_trainings.employee_id` com FK) é por colaborador. Criar um segundo "sujeito"
exigiria reescrever o motor. `EMPREITEIRO` já é um tipo de contrato reconhecido no RH (rótulo
"Empreiteiro" na lista de colaboradores); `academy_externo` marca a origem e deixa a lista do RH
filtrar/ocultar quando quiser. A folha não gera linha para quem não tem salário/rubrica.

### Acesso

- Grupo de login novo `ProfileGroup.TRAINEE = 'TREINANDO'` (`types/users.ts`), cartão no
  `LoginGateway`, tema no `Auth`, papel em `useAuthSync`, render em `App.tsx` antes do `<Layout>`.
- `validateAccess(TRAINEE)` → RPC `academy_portal_user_my_access()` (SECURITY DEFINER, authenticated):
  devolve as identidades ativas do e-mail do JWT. Vazio = "Seu e-mail não está cadastrado no Portal de
  Treinamentos".
- Rota `/portal-treinamentos` sem token força o grupo TREINANDO (mesmo efeito do `/portal-parceiro`,
  reafirmado a cada mudança de grupo, só em memória). É para onde o convite aponta.
- Convite: Edge Function `academy-portal-invite` (clone do `partner-invite-user`): `exigirMembro(org)`,
  `generateLink` (`invite` → `recovery` se já existe conta), Resend, grava `invited_at`.

### Leitura e ações (tudo por RPC, REGRA #7)

Núcleo privado `fn_academy_portal_user_employees()` → `employee_id[]` do e-mail do JWT (identidades
ativas). Cascas `authenticated` (`REVOKE FROM PUBLIC, anon`), todas `SECURITY DEFINER`:

| RPC | faz |
|---|---|
| `academy_portal_user_my_access()` | identidades (org, nome, tipo, employee) |
| `academy_portal_user_list_enrollments()` | matrículas das identidades (payload do `academy_portal_list_enrollments` + `org_nome`) |
| `academy_portal_user_get_content(p_enrollment_id)` | conteúdo do player (mesmo payload do portal por token) |
| `academy_portal_user_heartbeat / complete_lesson / start_attempt / submit_attempt / ack_version / accept / finalize` | delegam às `fn_academy_*_internal` com `canal='PORTAL'`, depois de `fn_academy_portal_user_assert_enrollment` |
| `academy_portal_user_certificate(p_enrollment_id)` e `academy_portal_user_certificates()` | certificado de uma matrícula / todos os certificados |
| `academy_portal_user_history()` | `employee_trainings` das identidades (presencial + EAD), com validade/status |
| `academy_portal_user_catalog()` | cursos com `inscricao_aberta=TRUE`, ativos, com versão PUBLICADA, nas orgs das identidades, marcando `ja_matriculado` |
| `academy_portal_user_enroll(p_course_id)` | cria matrícula `origem='INSCRICAO'` (CHECK ampliado), prazo = `inscricao_prazo_dias` do curso |
| `academy_portal_user_media_path(p_lesson_id / p_material_id / p_certificate_id)` | devolve o `storage_path` só se a identidade for dona; usada pela Edge Function |

Mídia: `academy-portal-media` passa a aceitar **ou** `token` (portal por link, como hoje) **ou**
`Authorization` de um treinando (valida pela RPC acima e assina com service role).

### Catálogo com inscrição

`training_courses` ganha `inscricao_aberta BOOLEAN DEFAULT FALSE` e `inscricao_prazo_dias INTEGER`.
O RH marca no formulário do curso (`AcademyCourseSheet`). Só curso com versão publicada aparece no
catálogo; a inscrição cria a matrícula na versão vigente.

### Portal (`components/training/TrainingPortal.tsx` + `components/training/portal/*`)

Casca no padrão dos portais externos (§24 do guia, `PortalKit`): banner não há (não é link público),
header com selo "Portal de Treinamentos" + nome do treinando, botão `?` (`data-tour="ajuda"`), menu
de conta (`data-tour="conta"`: Meus dados em drawer, Ajuda, Sair), sidebar `w-64` no desktop
(`data-tour="menu"`, `data-tour="aba-<id>"`) e barra inferior no celular. Abas
(`utils/trainingPortalTabs.ts`): `treinamentos` · `catalogo` · `certificados` · `historico`.

- **Meus treinamentos**: KPIs (pendentes, em atraso, concluídos, total) + cartões (progresso, prazo,
  reciclagem); "Começar/Continuar/Rever" abre a **sala de aula in-flow** (`AcademyPlayerView` com um
  `AcademyChannel` novo, `createTraineeChannel()`, ligado às RPCs `academy_portal_user_*`).
- **Catálogo**: cursos abertos; "Inscrever-se" → matrícula aparece em Meus treinamentos.
- **Certificados**: número, curso, emissão, validade, situação (válido/vencendo/vencido/revogado),
  baixar PDF (Edge Function) e copiar link de validação (`/publico/validar-certificado/:codigo`).
- **Histórico**: registros de `employee_trainings` (presencial e EAD) com validade e situação.
- **Meus dados** (drawer): nome, e-mail, tipo, empresa, organização(ões).
- Ajuda e tour: `Portal = 'treinamentos'` em `portalHelpDefaults.ts` (seções, artigos, FAQ, tours,
  checklist), `portal_help_get_mine` aceita `'treinamentos'` e resolve as orgs por
  `academy_portal_users`; CHECKs de `portal_help_items`/`portal_tour_progress` ampliados.

### Gestão (RH › Treinamentos, aba nova **"Portal"**)

`components/academy/AcademyPortalAccessTab.tsx`: tabela (nome, e-mail, tipo, colaborador/empresa,
convite, último acesso, situação, ações) com busca acoplada (§5.2), botão "Adicionar acesso" (drawer:
tipo → colaborador existente com e-mail preenchido da ficha, ou terceiro com nome/e-mail/CPF/empresa/
função), ações: enviar/reenviar convite, editar, ativar/desativar. Serviço `academyPortalUsersService`.

## Plano

| # | Arquivo(s) | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20271015000100_academy_portal_users.sql` | tabela `academy_portal_users` (RLS por `is_org_member`), `employees.academy_externo`, `training_courses.inscricao_aberta/inscricao_prazo_dias`, CHECK de `origem` com `INSCRICAO`, RPC `academy_portal_users_create` (cria ficha do terceiro + acesso na mesma transação) | aplicada com `db query -f`; `segurancaMigrations.test` verde; `SELECT` nas colunas novas |
| 2 | `supabase/migrations/aplicar_20271015000200_academy_portal_user_rpcs.sql` | núcleo + as RPCs da tabela acima + `media_path` | aplicada; chamada com a conta de um treinando devolve as matrículas dele e `42501` fora delas |
| 3 | `supabase/migrations/aplicar_20271015000300_portal_help_treinamentos.sql` | CHECKs de portal ampliados; `portal_help_get_mine` e `portal_help_orgs_of` conhecem `'treinamentos'` | `portal_help_get_mine('treinamentos')` devolve `orgs` do treinando |
| 4 | `supabase/functions/academy-portal-invite/index.ts` | convite por e-mail | publicada; POST sem Authorization → 401; com membro → `{ok:true, kind}` |
| 5 | `supabase/functions/academy-portal-media/index.ts` | aceita Authorization de treinando além do token | publicada; treinando abre aula com mídia |
| 6 | `types/users.ts`, `components/LoginGateway.tsx`, `components/Auth.tsx`, `services/profileService.ts`, `hooks/useAuthSync.ts`, `App.tsx` | grupo TREINANDO, cartão, tema, validação, rota `/portal-treinamentos`, render do portal | `/portal-treinamentos` abre a tela de login do Portal de Treinamentos; conta não cadastrada é recusada com a mensagem certa |
| 7 | `types/academy.ts`, `services/academyPortalUserService.ts`, `components/academy/academyChannel.ts` | tipos, serviço do treinando, `createTraineeChannel` | typecheck |
| 8 | `utils/trainingPortalTabs.ts`, `components/training/TrainingPortal.tsx`, `components/training/portal/*.tsx` | o portal (casca + 4 abas + Meus dados + sala de aula) | prints das 4 abas; sala de aula registra heartbeat e conclui |
| 9 | `utils/portalHelpDefaults.ts`, `services/portalHelpService.ts`, `components/PortalHelpSettings.tsx`, testes `portalHelp*`/`portalTour*` | ajuda, tour, checklist do portal novo | testes verdes; `?` abre a central com artigos do portal |
| 10 | `components/academy/AcademyPortalAccessTab.tsx`, `services/academyPortalUsersService.ts`, `components/LaborTrainings.tsx`, `components/academy/AcademyCourseSheet.tsx` | aba Portal (acessos + convites) e flag de inscrição no curso | criar acesso de colaborador e de terceiro; enviar convite; marcar curso como aberto |
| 11 | `docs/planos/…` (este), `PLANO_MODULO_TREINAMENTOS.md` §2.1 | documentação | tabela de canais com a linha do Portal de Treinamentos |

## Estado

- [x] Levantamento e decisões (2026-10-15)
- [x] Motor da Academia (`20270850000006`) aplicado no banco (2026-10-15, `db query -f`; 8 `fn_academy_*_internal` conferidas)
- [x] 1 · 2 · 3 — migrations aplicadas (2026-10-15): tabela, 18 RPCs `academy_portal_user_*`, CHECKs ampliados, ACL de `my_access` = `authenticated` + `service_role` (anon → 42501, sondado de fora)
- [x] 4 · 5 — Edge Functions publicadas (2026-10-15): `academy-portal-invite` (POST sem auth → 401, com anon → 401) e `academy-portal-media` (sem token nem auth → 401)
- [x] 6 · 7 — grupo TREINANDO, cartão, tema, `validateAccess`, rota `/portal-treinamentos`, render no App; tipos, `academyTraineeService`, `createTraineeChannel`
- [x] 8 — portal (`components/training/`): casca + 4 abas + Meus dados + sala de aula in-flow
- [x] 9 — ajuda, tour e checklist (`treinamentos` em `portalHelpDefaults.ts`; testes `portalHelp*`/`portalTour*` verdes, 127 testes)
- [x] 10 — RH › Treinamentos › aba **Portal** (`AcademyPortalAccessTab`, StandardTable) + "Aberto para inscrição" no formulário do curso
- [x] 11 — documentação (`PLANO_MODULO_TREINAMENTOS.md` §2.1)
- [x] Prova da camada de dados (2026-10-15, `BEGIN … ROLLBACK`, nada gravado): gestor cria TERCEIRO pela RPC → ficha `EMPREITEIRO`/`academy_externo`/salário 0; treinando vê 1 identidade, 1 curso no catálogo, inscreve-se (prazo +30 dias, origem `INSCRICAO`), lista a matrícula, lê o conteúdo (v2, 1 módulo), `ja_matriculado` vira `true`; leitura direta da tabela = 0 linhas; intruso: `my_access` = `[]` e `get_content` alheio → `42501`
- [x] Verificação no navegador com login (2026-10-15, Playwright, `C:\tmp\pwtest\portal-treinamentos\logado.js`): RH › Treinamentos › Portal em "Todas" (botão desligado dizendo o motivo) e na Alpa → "Liberar acesso" de um TERCEIRO com o e-mail da conta de teste → linha na tabela + toast; `/portal-treinamentos` com a mesma conta → casca, tour do portal (8 passos), checklist "Primeiros passos", 4 abas (estados vazios corretos), mini-tours por aba, Ajuda (artigos por seção + FAQ), Meus dados, celular (barra inferior). Sem erro de console nem 4xx/5xx. Dado de teste removido depois (acesso, ficha de terceiro e progresso de tour).
- [ ] Convite por e-mail real (exige caixa de entrada do usuário) — a Edge Function foi sondada só sem credencial (401)
- [ ] Publicação em `main`

## Verificação

1. `npm run typecheck` e `npx vitest run __tests__/segurancaMigrations.test.ts __tests__/portalHelpDefaults.test.ts __tests__/portalHelpSections.test.ts __tests__/portalTourAnchors.test.ts __tests__/orgContextGuard.test.ts`.
2. Banco: `SELECT academy_portal_user_my_access()` com a conta de um treinando (via `agente-leitura`
   não serve — precisa de conta cadastrada na tabela); `42501` ao chamar `get_content` com matrícula alheia.
3. Edge Functions: `curl -X POST …/functions/v1/academy-portal-invite -d '{}'` → 401.
4. Navegador (`/rodar-app`): RH › Treinamentos › Portal → adicionar colaborador e terceiro → convite
   (caixa de entrada real do usuário) → `/portal-treinamentos` → criar senha → 4 abas → inscrição no
   catálogo → assistir aula → certificado.
5. `bash scripts/check-ui-standard.sh` nos `.tsx` tocados.
