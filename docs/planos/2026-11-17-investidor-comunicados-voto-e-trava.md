# Portal do Investidor › Comunicados — voto pelo link e trava no banco

## Pedido original

Sessão `5fa427cc-4815-4b9f-a225-07166ea8b809`, 17/11/2026, depois do relatório do #519
(CRUD do gestor, plano `2026-11-16-investidor-comunicados-crud.md`):

> implemente o Ficou de fora

O "Ficou de fora" daquele relatório tinha dois itens:

> - Pelo link, o investidor só tem o botão "Confirmar". Um comunicado do tipo Votação não
>   recebe voto de quem acessa pelo link.
> - A trava de comunicado com resposta existe só no app; o banco ainda aceitaria a
>   alteração direta.

## O que existe (origin/main `8b79a63df`, banco em 17/11)

- `fn_investor_portal_acknowledge(p_token, p_announcement_id, p_vote_option)` JÁ grava o voto,
  mas: aceita resposta em RASCUNHO (não confere `published_at`), aceita qualquer texto como voto,
  aceita votação sem voto, e `ON CONFLICT DO UPDATE` troca o voto (e zera, se vier sem).
- `fn_investor_portal_get_announcements` JÁ devolve `vote_option` da resposta do investidor.
- `PortalAnnouncements.tsx` só tem "Confirmar" e mostra o tipo cru (`votacao`).
  `investorPortalTokenService.acknowledgeByToken` ignora `{valid:false}` — a tela marcava
  "Confirmado" mesmo quando o banco recusava.
- `InvestorDashboard.tsx` tem uma 2ª lista de comunicados na aba Relatórios, presa em
  `!isPublicExperience && portalToken` — inalcançável (`isPublicExperience = isPreview || !!portalToken`).
- Tabelas: `investor_acknowledgments.announcement_id` → `investor_announcements` `ON DELETE CASCADE`;
  `investor_announcements.organization_id` → `organizations` `ON DELETE CASCADE`;
  `project_id` → `projects` `ON DELETE SET NULL`. Sem gatilho nenhum nas duas tabelas.
- Dados em 17/11: 3 comunicados, 0 votações, 0 respostas, 1 link ativo.

## Decisões (minhas, anunciadas no relatório)

1. **Voto é definitivo**, como no app (`CommunicationCenter` esconde os botões depois do voto).
   A RPC passa a `ON CONFLICT DO NOTHING` e devolve o que ficou gravado.
2. **Votação exige** Sim, Não ou Abstenção (`sim`/`nao`/`abstencao`, o vocabulário de
   `VOTE_LABELS`); nos outros tipos o voto é ignorado (gravado NULL).
3. **Só comunicado publicado** recebe resposta pelo link.
4. No portal, escolher o voto pede **um segundo clique de confirmação** na própria linha
   ("O voto não pode ser mudado depois") — o portal não tem modal próprio, e voto errado não se desfaz.
5. **Trava no banco** (gatilho BEFORE UPDATE OR DELETE em `investor_announcements`): com resposta,
   recusa mudar título, texto, tipo, pedido de confirmação, publicação, organização ou obra, e
   recusa excluir. Vale para todo papel (inclusive `postgres`).
   **Exceção:** quando a mudança vem de cascata (`pg_trigger_depth() > 1`) — excluir a
   organização ou a obra continua possível.
6. O erro do gatilho sai com `HINT = 'comunicado_com_respostas'` e `DETAIL` = nº de respostas; o
   serviço do app traduz para o `AnnouncementBlockedError` que a tela já trata.

## Itens

### 1. Migration `aplicar_20271117970000_investidor_comunicados_voto_e_trava.sql`
- [x] Gatilho da trava + RPC de resposta endurecida + `acknowledged_at` na leitura do link.
  **Terminou quando:** aplicada no banco e provada por DO com RAISE no fim (nada fica gravado):
  editar/excluir com resposta → recusa; sem resposta → passa; cascata → passa; RPC: rascunho →
  `not_found`, votação sem voto → `vote_required`, voto `sim` → grava, 2ª chamada com `nao` →
  continua `sim`. Anônimo segue executando a RPC (o link é anônimo).
  **Feito 17/11:** aplicada com `db query -f`; `scripts/teste-investidor-comunicados-voto-e-trava.sql`
  deu os 17 casos `ok` (00 cascata depth 1,2; 01–07 RPC; 08–11 trava como postgres; 12 aviso ignora
  voto; 13–16 como `authenticated` dono da org — a trava dispara sem EXECUTE na função do gatilho).
  Depois da prova: 3 comunicados, 0 respostas, 0 "PROVA" (nada ficou). ACL da RPC: anon e
  authenticated com EXECUTE; função do gatilho só postgres/service_role.
  ⚠️ A 1ª rodada deu 0 linhas nos casos 13–16: a policy de escrita identifica pelo **e-mail** do JWT
  (`auth.jwt()->>'email'`), não pelo `sub` — o teste passou a pôr os dois.

### 2. Portal (`PortalAnnouncements.tsx` + `investorPortalTokenService`)
- [x] Votação: Sim / Não / Abstenção → confirmação → grava; depois mostra "Seu voto: X".
  Tipo com rótulo ("Votação"), pendentes contam votação sem voto, recusa do banco vira mensagem.
  **Terminou quando:** teste de componente cobre os casos e a tela foi vista em 1440 px e 390 px.
  **Feito 17/11:** `__tests__/components/PortalAnnouncementsVoto.test.tsx` (10). Página temporária
  (apagada) com a RPC respondida pelo Playwright: votar Sim, recusa de link vencido, Confirmar de aviso,
  em 1440 e 390 px, sem sobra horizontal. A conferência achou 2 defeitos, corrigidos: (a) responder um
  comunicado apagava o aviso de erro de OUTRO (erro único → erro por comunicado, com teste); (b) no
  celular, situação/botão ao lado do texto espremiam título e data em 3 linhas → abaixo do texto até `sm`.

### 3. App (`announcementsService`)
- [x] Erro do gatilho → `AnnouncementBlockedError` em editar/excluir.
  **Terminou quando:** teste do serviço cobre o erro vindo do banco.
  **Feito 17/11:** a conferência prévia no app (`exigirSemRespostas`, 1 consulta a mais por gravação)
  saiu — o banco é a autoridade. `announcementsService.test.ts` 14 verdes (recusa com nº de respostas,
  outro erro passa como veio, gravar = 1 consulta).

### 4. `InvestorDashboard.tsx`
- [x] Remover a 2ª lista inalcançável; `onAcknowledged` leva o voto e a data.
  **Terminou quando:** tsc 0 e testes do InvestorDashboard verdes.
  **Feito 17/11:** tsc 0; InvestorDashboardSair/TodasOrgs, AnnouncementsManager, orgContextGuard e
  migrationsPrefixo verdes (57 no total com os novos); check-ui-standard e check-xss-sinks limpos.

### 5. Publicação
- [x] PR, CI verde, merge, `conferir-producao.sh`.
  **Feito 17/11:** PR #545 (CI 41 min verde), squash `a0d9577e`; `conferir-producao.sh` → o domínio
  serve `a0d9577` com "aguardando sua resposta" e "o voto não pode ser mudado" no bundle; CI da
  `main` (run 44131520062) verde no `a0d9577`. Migration aplicada antes do merge (item 1).

## Situação

5 de 5 itens. Fica de fora (não pedido): conferir no app logado e no link de um investidor real —
votar de verdade gravaria resposta de investidor; a prova do banco e a da tela cobrem o caminho.
