# Link do celular — Diário mostra os diários de TODAS as organizações de que o usuário é membro

## Pedido original

Sessão de 2026-11-27 (Claude Code, VS Code).

1ª mensagem:

> operacional > diario de obras: Verifique por o usuário Iago marques nao consegue visualizar o diario 001 garden cambuhy

Resposta às perguntas de diagnóstico: o sintoma é **"Diário some da lista"**; aparelho: **"todos"**.

2ª mensagem (depois do diagnóstico — o link do Iago é da org Alpa Construtora e o diário é da Garden Cambuhy SPE):

> Gerar um segundo link é uma pessima ideia . Imagine o usuario ter que ter que gerenciar varios links. imagine se ele participar de 20 organizacoes.
> Link para todas as organizações: Outra pessima ideia sua. Dessa forma ele tem acesso a organizacoes que ele nao participa. Isto é uma quebra de seguranca enorme.
> O correto: Diário mostra tudo das organizações que o usuário participa. Isto era para ser óbvio,

## Diagnóstico (2026-11-27, banco de produção)

- Iago (`f9809eae…`) é `member` da **Alpa Construtora e Incorporadora** e da **Construção do Edifício Garden
  Cambuhy SPE**, com `canViewDiary` nas duas.
- Diário "Garden Cambuhy" código 001 (`5627cec6…`): `organization_id` NULL, `settings.organizationId` = Garden SPE.
- RLS de `projects` simulada com as claims do Iago: o 001 volta. O app logado lista o 001 (store com
  `includeOrphans`, `DiaryProjectsList`/`DiaryMobileApp` sem filtro de org). Os 2 registros mais recentes do 001
  foram gravados pelo Iago **logado** (`celular_diario_salvar` recusaria: org diferente da do link).
- Link do celular do Iago (`user_mobile_links`, criado 11/11): `org_id` = **Alpa**. `celular_diarios_listar`
  filtra `coalesce(organization_id, settings.organizationId) = org do link` → o 001 não aparece no link.
- Mesmo padrão do caso de 16/11 (tarefas do `desenvolvedor@`): o link vale para UMA organização.

## Decisão

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-11-27 | Segundo link por organização? | **Não** — o usuário não gerencia N links |
| 2026-11-27 | Escopo do Diário no link | **Todas as organizações de que o dono do link é MEMBRO** (conferido no banco a cada chamada; nenhuma org de que ele não participa) |

Substitui, **só para o Diário**, a regra do design de 11/11 "toda celular_* fica presa à org do link". O link
continua sendo um por pessoa por organização (`user_mobile_links_org_user_key`) e continua ancorado na org em que
foi gerado: o resolver ainda exige que o dono seja membro dela (sair dessa org revoga o link — gatilho existente).
Tarefas e Pedido Fast pelo link **não mudam** nesta frente (seguem na org do link).

## Desenho

"Org do diário" = `coalesce(organization_id, settings.organizationId)` (`_celular_org_do_projeto`, inalterada).
"Pode" = `is_org_member_de(dono do link, org do diário)` — a mesma pergunta que o núcleo `_diary_upsert_core` já faz.

- `_celular_orgs_do_usuario(p_user)` (nova, interna, sem EXECUTE para a API): conjunto das orgs de que o usuário é
  membro — mesmo casamento de `is_org_member_de`/`minhas_orgs_membro` (user_id; e-mail só em linha legada).
- `celular_diarios_listar`: projetos cuja org do diário ∈ orgs do dono.
- `celular_diario_abrir`, `_salvar`, `_excluir`, `_autoriza`, `_midia_orfa`, `celular_planejamento_ler`,
  `_gravar_evolucao`: a trava deixa de ser "= org do link" e passa a ser "dono é membro da org do diário"; daí em
  diante tudo usa a org DO DIÁRIO (path da mídia, planejamento aceito, orçamento da obra-pai).
- `celular_diario_abrir` devolve `pode_aprovar` = `fn_pode_aprovar_diario_de(dono, org do diário)`. O botão de
  aprovar no link passa a seguir o diário aberto, não a org do link (o banco já decidia pela org do diário).
- `celular_diario_midia_permitida`: path `{org}/…` com org ∈ orgs do dono, citado por registro de projeto DA MESMA org.
- `celular_efetivo_listar`: colaboradores ATIVOS das orgs do dono (e compartilhados com elas) — o mesmo que o app
  logado em "Todas as organizações".
- `celular_sessao`: inalterada (o campo `pode_aprovar_diario` fica, o front deixa de usá-lo).
- Edge `celular-diario-midia`: código inalterado (o path já vem da org que `celular_diario_autoriza` devolve).

## Itens

1. **Migration** `aplicar_20271127100000_link_celular_diario_todas_orgs.sql` — as funções acima, REVOKE da nova
   interna. Pronto quando: aplicada e a prova (item 3) dá `TUDO OK` no banco de produção.
2. **Front** — `DiaryMobileApp` usa `pode_aprovar` do diário aberto no link; `fonteDiarioDoLink` perde a opção
   `podeAprovar`; `CelularTokenGate` deixa de montar a fonte do Diário com a sessão. Pronto quando: `tsc` sem erro
   novo e os testes `diarioFonte`, `DiaryMobileAppFonte`, `CelularTokenGate`, `DiarioDoLink` verdes.
3. **Prova** `scripts/teste-link-celular-diario.sql` — seção B passa a usar como "outra org" uma de que o dono NÃO
   é membro (recusas continuam); seção D nova: org de que o dono É membro (diário com `organization_id` NULL, como o
   001) → lista, abre com `pode_aprovar` da org do diário, grava, exclui, sobe/assina/órfã mídia, lê e grava
   evolução do planejamento da mesma org; planejamento da org do link num diário de outra org → recusa; deixa de
   ser membro → recusa. Pronto quando: `TUDO OK` em produção depois do item 1.
4. **Caso real** — o link do Iago lista o Diário 001 Garden Cambuhy (`celular_diarios_listar` pelo token dele, sem
   expor o token: conferido pela função com o `user_id`). Pronto quando: o id `5627cec6…` aparece na lista.

## Andamento

- 2026-11-27: plano escrito.
- 2026-11-27: itens 1–3 escritos. Ensaio (prova com a migration em BEGIN…ROLLBACK no banco de produção): `TUDO OK`;
  contraprova sem a migration: falha em "listar = todos os projetos das orgs de que o dono do link é membro".
  Front: `tsc` 0 erro; 7 arquivos de teste, 113 testes verdes. Aplicar a migration foi barrado pelo modo automático —
  **pendente: o usuário aplica**; depois, prova em produção (item 3), caso real (item 4) e merge do front.
- 2026-11-27: **item 1 feito** — migration aplicada pelo usuário (1ª tentativa rodou de `C:\D\frentes\sindico-g7-ficha`,
  pasta sem `supabase/.temp/project-ref`: saiu sem erro e sem aplicar nada; a 2ª, da pasta desta frente, aplicou).
  Conferido no banco: `_celular_orgs_do_usuario` existe, `celular_diarios_listar` e `celular_diario_abrir` novos.
  **Item 3 feito** — prova em produção: `TUDO OK`. **Item 4 feito** — orgs do Iago pela função nova: lista os diários
  Coronel Lambert e Igreja (Alpa) e **Garden Cambuhy `5627cec6…` (Garden SPE)**; o link dele (org Alpa) segue válido.
  Item 2: aguardando CI do PR #789 para o merge.
- 2026-11-27: item 2 feito — PR #789 mesclado com a CI verde (`e603c7c`), produção conferida servindo `e603c7c`,
  CI da `main` 18/18 verde. **Diário: 4 de 4.**

## Pedido 3 (2026-11-27) — Tarefas e Pedido Fast

> Verifique os demais acessos via link se seguem essa mesma regra (tarefas e pedidos): link por organização está descartado, e o escopo padrão é sempre "as orgs de que a pessoa é membro".

### Verificação (banco de produção e `origin/main`, 27/11)

Nenhum dos dois seguia a regra — tudo preso à org em que o link foi gerado:

- **Tarefas:** `celular_tarefas_listar`, `celular_espacos_listar`, `celular_status_listar`, `celular_responsaveis_listar`,
  `celular_tarefa_criar` (sempre na org do link; `org_id` recusado como chave estranha) e `celular_tarefa_atualizar`
  (`t.org_id = org do link`).
- **Pedido Fast:** `_celular_pedido_fast_autoriza` exigia Compras na org do link; `celular_obras_listar` só obras da org
  do link; Edge `pedido-fast` recusava obra de outra org (`orgId !== orgDoLink` → 404).

### Desenho

- Mesma regra do Diário: o que a pessoa vê e grava pelo link = orgs de que ela é membro (`_celular_orgs_do_usuario`,
  `is_org_member_de`), conferido a cada chamada. O link continua ancorado na org em que foi gerado.
- **Tarefas:** ler/editar uma tarefa usa a org DA TAREFA (gestor, status, responsável). Criar: com espaço → org do
  espaço; sem espaço → a tela pergunta a org entre as do dono quando há mais de uma (REGRA #5, o mesmo modal do app
  logado em "Todas"; `useOrgWriteTarget` aceita a lista vinda de fora) e manda `org_id`; sem `org_id` (front antigo) →
  org do link. `celular_responsaveis_listar(p_token, p_org)` — os da org da tarefa.
- **Sessão:** `celular_sessao` + `orgs` [{id, name}]. Cabeçalho do link: "nome · N organizações" quando há mais de uma.
- **Pedido Fast:** autoriza = `fn_pode_criar_pedido_em_alguma_de` (a mesma do app logado); obras = OBRA das orgs em que
  ele pode pedir; Edge decide por obra (`fn_pode_criar_pedido_de(user, org da obra)`, já existente) e perde a trava
  "obra da org do link".

### Itens

5. **Migration** `aplicar_20271127200000_link_celular_tarefas_pedidos_todas_orgs.sql`. Pronto quando: aplicada e as
   provas do item 7 dão `TUDO OK` em produção.
6. **Front + Edge** — `tarefasFonte` (org_id, p_org), `TasksMobileApp` (pergunta a org no link), `useOrgWriteTarget`
   (lista de fora), `CelularTokenGate` (orgs e cabeçalho), Edge `pedido-fast`. Pronto quando: `tsc` 0, testes verdes,
   PR mesclado com a CI verde e a Edge publicada.
7. **Provas** — `teste-link-celular-tarefas.sql` (B nas orgs do dono; "token de outra org" com quem não é membro de o;
   seção D nova), `teste-link-celular-pedido-fast.sql` (item 6 novo; membro sem owner/admin), `teste-link-celular-diario.sql`
   (chaves da sessão com `orgs`). Pronto quando: `TUDO OK` em produção depois do item 5.

### Andamento

- 2026-11-27: itens 5–7 escritos. Ensaio no banco de produção (migration em BEGIN…ROLLBACK): Tarefas, Pedido Fast e
  Diário `TUDO OK`. Contraprova sem a migration: Tarefas falha em "criar com org_id … → 42501 (veio 22023: campo não
  aceito: org_id)"; Pedido Fast falha em "membro de o2: obras da org do link E de o2". Front: `tsc` 0; 12 arquivos,
  140 testes verdes (novo: `TasksMobileAppLinkTodasOrgs`). Pendente: o usuário aplica a migration; Edge publicada pelo
  usuário depois do merge.
- 2026-11-27: **item 5 feito** — migration aplicada pelo usuário (da pasta desta frente). Conferido no banco:
  `celular_responsaveis_listar(text, uuid)` é a única sobrecarga, `celular_sessao` com `orgs`, `_celular_pedido_fast_autoriza`
  com `fn_pode_criar_pedido_em_alguma_de`. **Item 7 feito** — em produção: Tarefas, Pedido Fast e Diário `TUDO OK`.
  Caso do Iago: orgs Alpa (4 tarefas abertas visíveis, pode pedir, 16 obras) e Garden SPE (pode pedir, 2 obras) —
  as obras da Garden entram na lista do Pedido Fast pelo link. Item 6: CI do PR #790, merge, publicar a Edge.
