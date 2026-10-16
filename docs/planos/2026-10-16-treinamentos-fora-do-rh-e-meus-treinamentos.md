# Treinamentos: gestão fora do RH, "Meus Treinamentos" com as abas do portal, e o defeito da lista vazia

## Pedido original

Sessão `61edd96c-0bd1-4786-b550-a4ff23a33593` · 16/10/2026, com print de "Meus Treinamentos"
(menu com "1", tela com "Nenhum treinamento atribuído"):

> hoje o Catálogo de treinamentos esta dentro de Recursos humanos > treinamentos., porem que atenderá opublico externo também, talvez nao seria interessante estar dentro de recursos humanos.
> talvez mover para Meus treinamentos. avalie

Avaliação devolvida (resumo): a gestão do catálogo não deve ir para "Meus Treinamentos" (item sem
trava de permissão — todo usuário passaria a criar e editar cursos); o público externo já tem o
catálogo de inscrição no Portal de Treinamentos. Propostas: (1) corrigir o defeito; (2) dar a
"Meus Treinamentos" as quatro abas do portal; (3) tirar a gestão do RH se quem gerencia não for só o RH.

Resposta do usuário (16/10/2026):

> 1. Corrigir já o defeito de "Meus Treinamentos": de acordo
> 2. Dar a "Meus Treinamentos" as quatro abas do portal, com o catálogo de inscrição: de acordo
> 3. não é (só) o RH.

## O que foi medido antes

- **Defeito**: `academyService.listEnrollments` pede `employee:employees!employee_id(...)`, mas
  `academy_enrollments` **não tem** FK para `employees` (de propósito, tabela quente). O PostgREST
  responde `PGRST200 Could not find a relationship…` (provado com a conta de teste), e
  `AcademyClassroomTab` tem `try/finally` sem `catch`: a lista fica `[]` e a tela diz "Nenhum
  treinamento atribuído". O contador do menu (`countMyPending`) não faz o join e por isso mostra 1
  (matrícula EXPIRADA de "Rastreamento de Concreto" da ficha de Altair Pereira da Rosa).
  "Meus Treinamentos" nunca listou nada para ninguém.
- **Catálogo do colaborador interno**: não existe. O portal tem Meus treinamentos · Catálogo ·
  Certificados · Histórico (RPCs `academy_portal_user_*`, que reconhecem o treinando pelo e-mail
  do JWT via `fn_academy_portal_user_employees`). "Meus Treinamentos" tinha só a primeira.
- **Gestão**: RH › Treinamentos (`labor-trainings`) é rota `labor-*`, travada por `canViewLabor`
  (AppRouter) e escondida com o menu do RH (`mod.rh`, Layout). `LaborTrainings` recebe
  `podeEditar` padrão `true`.
- Policies de `academy_enrollments`, `academy_certificates`, `employee_trainings`,
  `training_courses`: `is_org_member(org_id)` — a permissão por módulo é só de interface, como no
  resto do app.

## Decisões

| Data | Pergunta | Decisão |
|---|---|---|
| 16/10/2026 | Onde fica a gestão? | Item próprio **"Treinamentos"** no menu Operacional (logo abaixo de Pós-Obra & Garantia), fora do dropdown do RH. Rota `treinamentos`; o endereço antigo `labor-trainings` cai nela. |
| 16/10/2026 | Quem vê a gestão? | Chave nova **`canViewTrainings` / `canEditTrainings`** + módulo `treinamentos` na matriz por cargo. **Sem valor gravado, herda do RH** (`canViewLabor` / matriz `rh`): quem hoje gerencia continua gerenciando; o admin concede só Treinamentos a quem não é do RH (segurança do trabalho, engenharia de obra). |
| 16/10/2026 | Quem edita? | `canEditTrainings`; sem valor gravado, `canEditLabor`; sem ele, como hoje (quem vê, edita). Admin e desenvolvedor sempre. |
| 16/10/2026 | Como "Meus Treinamentos" ganha as abas do portal? | Mesmos dados (RPCs `academy_portal_user_*`); a peça central passa a reconhecer **também a ficha de colaborador do usuário logado** (`employees.user_id = auth.uid()`, ou e-mail igual quando a ficha não tem usuário e o logado é membro da organização dela — a mesma regra de `getMyEmployeeId`). O login do Portal de Treinamentos (`academy_portal_user_my_access`) **não** muda. |
| 16/10/2026 | Vocabulário visual | "Meus Treinamentos" é tela interna: vocabulário do app (§24 do guia — o kit do portal não vale dentro do app): `h1` por aba, `TabsBar`, `KpiCard`, cartões `rounded-[10px]`, `StandardTable`, azul. O player continua o do app (`createAppChannel`, log com canal APP). |
| 16/10/2026 | Organização do topo | Lista e catálogo recortam pela organização do topo; "Todas" mostra tudo, com a organização em cada item (REGRA #5). |

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `services/academyService.ts` | `listEnrollments` sem o join com `employees` (nomes resolvidos à parte) | consulta devolve as matrículas (sem PGRST200) |
| 2 | `supabase/migrations/aplicar_20271016200000_academy_minhas_fichas_no_app.sql` | `fn_academy_portal_user_employees` = identidades do portal ∪ ficha do usuário logado | aplicada; prova com `BEGIN … ROLLBACK` simulando o JWT de Altair: lista a matrícula EXPIRADA |
| 3 | `components/academy/MeusTreinamentosView.tsx` (+ `components/academy/meus/*`) | quatro abas (Meus treinamentos · Catálogo · Certificados · Histórico), vocabulário do app, player do app, certificado gerado pelo app quando ainda não há PDF | navegador: abas renderizam sem erro |
| 4 | `components/academy/AcademyClassroomTab.tsx` | sai (substituído pela aba 1) | grep sem uso |
| 5 | `types/users.ts`, `components/OrganizationUsers.tsx` | `canViewTrainings`/`canEditTrainings` (Permissões detalhadas, grupo próprio) e módulo `treinamentos` na matriz | typecheck; tela de usuários mostra a linha |
| 6 | `components/Layout.tsx`, `components/AppRouter.tsx`, `components/training/TrainingsModule.tsx` (novo) | item "Treinamentos" no Operacional; sai do dropdown do RH; rota `treinamentos` com trava própria e herança do RH; `labor-trainings` redireciona | navegador: menu e rota |
| 7 | `PLANO_MODULO_TREINAMENTOS.md` | §2.1 e §4 com o novo lugar e a nova permissão | — |

## Estado

- [x] 1 · `listEnrollments` sem o join — e o mesmo defeito em mais três consultas: `listCertificates`, `getCertificate` (gerar o PDF no app) e `getManagerPanel` (Treinamentos › Painéis). Ajudante único `colaboradoresPorId`.
- [x] 2 · migration aplicada (16/10/2026). Prova `BEGIN … ROLLBACK` com o JWT simulado de Altair: lista a matrícula EXPIRADA de "Rastreamento de Concreto"; usuário qualquer → `[]`; `academy_portal_user_my_access` continua `[]` (sem convite, sem portal).
- [x] 3 · `MeusTreinamentosView` + `components/academy/meus/*` (4 abas, vocabulário do app, player do app, PDF gerado no app)
- [x] 4 · `AcademyClassroomTab.tsx` removido (sem uso)
- [x] 5 · `canViewTrainings`/`canEditTrainings` (Permissões detalhadas, grupo "Treinamentos"), módulo `treinamentos` na matriz por cargo; a tela mostra a herança do RH e o clique inverte o valor exibido
- [x] 6 · item "Treinamentos" no Operacional, fora do dropdown do RH; rota `treinamentos` com `isModuleAllowed(..., herança do RH)`; `labor-trainings` redireciona antes da trava do RH; render de Treinamentos saiu do `LaborModule`
- [x] 7 · PRD atualizado (§2.1 e §4)
- [x] Tipos: rodada completa por arquivo achou 1 erro (conversão em `Layout.tsx`), corrigido e rechecado nos 6 arquivos tocados de interface — 0 erros; testes 66/66; `check-ui-standard` sem violação nos 10 `.tsx` tocados
- [x] Verificação no navegador (16/10/2026, `C:\tmp\pwtest\treinamentos-fora-do-rh\telas.js`, conta agente-leitura na Alpa, só leitura): item "Treinamentos" no menu e fora do RH; `#/treinamentos` abre a gestão; aba Painéis carrega sem erro (antes caía no PGRST200); `#/labor-trainings` vira `treinamentos`; "Meus Treinamentos" com as quatro abas e título por aba (a conta não tem ficha → aviso de vínculo). Sem erro de console nem 4xx/5xx. **Não verificado com dados na tela**: a conta de teste não é colaboradora; a leitura com dados está provada no banco (item 2).
- [x] Publicação: `main` em `9250b818` (16/10/2026); domínio conferido servindo o commit com o texto novo de "Meus Treinamentos" no bundle; check-run `ci` verde

## Verificação

1. Tipos (checagem por arquivo — o `tsc` desta máquina cai), `vitest` dos arquivos tocados, `check-ui-standard`.
2. Banco: `BEGIN … ROLLBACK` com o JWT simulado de quem tem ficha vinculada.
3. Navegador (agente-leitura): menu "Treinamentos" fora do RH; `#/labor-trainings` cai em `treinamentos`;
   "Meus Treinamentos" com as quatro abas (a conta de teste não tem ficha: estado "sem vínculo").
