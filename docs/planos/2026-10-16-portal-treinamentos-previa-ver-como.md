# Portal de Treinamentos — prévia mobile na gestão, "vendo como" a pessoa

## Pedido original

Sessão `61edd96c-0bd1-4786-b550-a4ff23a33593` · 16/10/2026, logo depois de publicar a versão celular
do portal (`docs/planos/2026-10-16-portal-treinamentos-mobile.md`):

> implemente previa da versao mobile

Esclarecido com o usuário: a prévia é **na gestão** (Portais › Portal de Treinamentos › aba Portal) e
**escolhe a pessoa** — o telefone mostra as matrículas, o catálogo, os certificados, o histórico e a
sala de aula daquela pessoa, sem gravar nada.

## O que impedia

Toda RPC `academy_portal_user_*` descobre a pessoa pelo e-mail do JWT (núcleo
`fn_academy_portal_user_employees()`); `my_access` ainda grava `last_access_at`; o serviço, o canal do
player, as quatro abas e as chaves de query não têm noção de "quem". Por isso `PortalHelpSettings`
mantinha a prévia de Treinamentos desligada. O precedente da casa é a "casca por id com dupla
autorização" dos portais Cliente (`fn_portal_get_*_for_client`: dono OU `is_org_member`) e Parceiro
(`partner_can_access_workspace`: integrante OU membro interno "manutenção/preview").

## Decisões

| Data | Pergunta | Decisão |
|---|---|---|
| 16/10/2026 | Como o gestor vê como a pessoa? | `p_ver_como uuid DEFAULT NULL` (= `academy_portal_users.id`) só nas RPCs de **leitura**; autoriza por `is_org_member(org da pessoa)` — a régua de `academy_portal_users_create` e do RLS da tabela. Sem o parâmetro nada muda. |
| 16/10/2026 | Escritas? | Não ganham `p_ver_como`: continuam presas ao JWT (gestor com a matrícula da pessoa → 42501, como hoje). No front o canal da prévia tem escritas no-op e "Inscrever-se" fica desabilitado dizendo por quê. |
| 16/10/2026 | Rastro | Com alvo, `my_access` não grava `last_access_at` e `media_path` não insere em `academy_access_logs`. |
| 16/10/2026 | Cache | `academyKeys.trainee*(alvo)` — `'eu'` sem alvo — para não misturar com Meus Treinamentos do gestor (mesmo QueryClient dentro do iframe). |
| 16/10/2026 | Ajuda/tour | `PortalHelp` com `modoPrevia`, `tourKey` nulo, org da pessoa. `portal_help_orgs_of` já inclui `organization_members` pelo e-mail — o gestor recebe a ajuda da org sem mudança no banco. |
| 16/10/2026 | Onde fica | Ação por linha na aba Portal (ícone de celular), para quem vê a aba. `PortalHelpSettings` só aponta para lá. |
| 16/10/2026 | Sobrecarga no PostgREST | As assinaturas antigas são **derrubadas** antes de criar as novas; bloco `DO` confirma 1 assinatura por função, com `p_ver_como`. |

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20271017000100_academy_portal_previa_ver_como.sql` | núcleo com alvo `fn_academy_portal_user_employees_ou_previa`; `assert_enrollment(…, p_ver_como)`; leituras (`my_access`, `list_enrollments`, `get_content`, `certificate`, `certificates`, `history`, `catalog`, `media_path`) com `p_ver_como`; travas | aplicada; prova SQL em ROLLBACK |
| 2 | `supabase/functions/academy-portal-media/index.ts` | `verComo` no corpo → `p_ver_como` | deploy |
| 3 | `services/academyTraineeService.ts`, `lib/queryKeys.ts`, `components/academy/academyChannel.ts` | leituras com `verComo`; chaves com alvo; `createTraineePreviewChannel` | typecheck |
| 4 | `components/training/portal/verComo.tsx` (novo), `Trainee*Tab.tsx`, `useTrainingPortal.ts`, `TrainingPortalMobile.tsx` | contexto "ver como"; abas e hook leem o alvo; faixa "nada é gravado"; ajuda em `modoPrevia` | teste jsdom |
| 5 | `components/academy/AcademyPortalAccessTab.tsx` | ação por linha → `MobilePreviewFrame` + `TrainingPortalMobile` (lazy) com `verComo` | navegador |
| 6 | `components/PortalHelpSettings.tsx` | comentário/mensagem apontam para a aba Portal | — |

## Estado

- [x] 1 · 2 · 3 · 4 · 5 · 6 — migration aplicada (`db query -f`, 16/10/2026); Edge Function `academy-portal-media` publicada; tipos dos 17 arquivos tocados/consumidores: 0 erros; `check-ui-standard` limpo
- [x] Banco (`prova-ver-como.sql`, ROLLBACK, JWT do administrador): `my_access(ver_como)` devolve a pessoa sem tocar `last_access_at`; `list_enrollments` traz a NR-18; `get_content` abre; `catalog/certificates/history` respondem; `media_path(aula, ver_como)` resolve sem nova linha em `academy_access_logs`; `heartbeat` do gestor na matrícula dela → 42501 "Acesso negado"; `my_access()` sem alvo continua `[]` para o gestor; JWT de quem não é membro → 42501 "Sem acesso a esta organização" em `my_access` e `list_enrollments`; o próprio treinando sem alvo continua vendo a si mesmo — 11/11
- [x] Vitest: `TrainingPortalMobile.test.tsx` 7/7 (ver como: serviço chamado com o alvo, cache `'pu-9'` separado de `'eu'`, faixa "nada é gravado", `modoPrevia` + `tourKey` nulo, sem "Sair", "Inscrever-se" desligado com motivo); `portalTourAnchors` 25/25
- [x] Navegador (16/10/2026, `C:/tmp/pwtest/portal-treinamentos-previa/prova.js`, agente-leitura, só leitura): aba Portal → ícone de celular na linha do Altair → iframe `data-modo=previa` / `data-ver-como=<id>`, cabeçalho com a org dele, faixa "Prévia — vendo como Altair. Nada é gravado.", cartão NR-18, sala de aula com vídeo assinado pela Edge Function (`verComo` no corpo), barra inferior some na aula, Catálogo/Certificados/Histórico trocam, ajuda abre dentro do telefone, "Fechar Prévia" remove o iframe. Todas as 10 chamadas levaram `p_ver_como`; **0 escritas** disparadas; sem erro de console nem 4xx.
- [ ] Publicação
