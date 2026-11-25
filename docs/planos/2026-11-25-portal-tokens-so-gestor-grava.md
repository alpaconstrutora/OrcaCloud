# Links do Portal do Cliente e do Colaborador — só owner/admin grava

## Pedido original

Sessão `9f7567f5-eb4c-4754-b44f-4c4b4ce8c3c1` · 2026-11-25

Contexto: ao conferir como os portais guardam o link (pedido do "Copiar link" do celular), apontei
que `client_portal_tokens` e `portal_tokens` têm uma policy ALL para qualquer membro da org.

> Uma observação à parte: nos Portais do Cliente é so visualizacao, como o cliente poderia alterar ou apagar os links pela API?

> pergunta: como o cliente atraves do portal consegue apagar o link pela API?

Resposta (provada num BEGIN…ROLLBACK): o cliente (anon) é recusado; quem consegue é a equipe
interna — um membro comum, ou rebaixado a visualizador, leu, desativou e APAGOU os 7 links de
portal de cliente da org. Proposta: "leitura continuaria liberada para quem já vê a tela, e criar,
alterar ou apagar link de portal ficaria só para owner e admin. Faço?"

> sim

## Itens

- [x] `supabase/migrations/aplicar_20271125913700_portal_tokens_so_gestor_grava.sql` — troca a policy
  ALL de membro por SELECT de membro + INSERT/UPDATE/DELETE de gestor (`minhas_orgs_gestor`), nas duas
  tabelas. **Pronto quando:** `scripts/teste-portal-tokens-so-gestor-grava.sql` falha sem a migration
  ("membro comum NÃO desativa (veio ok:7)") e dá TUDO OK com ela (ensaiado 25/11).
- [x] `services/clientPortalService.ts` / `services/atsService.ts` — revogar confere as linhas
  devolvidas (0 = lança `MSG_LINK_PORTAL_SO_GESTOR`, nunca finge); 42501 de gerar vira a mesma
  mensagem (`utils/portalLinkPermissao.ts`). **Pronto quando:** `__tests__/portalLinkPermissao.test.ts`
  verde (8/8).
- [x] `components/client/ClientPortalLinkModal.tsx` — o toast mostra a mensagem de permissão em vez
  de "Erro ao gerar/revogar". A tela do RH (`LaborPortal`) já mostrava `e.message`.
- [x] Publicar o front ANTES da migration (o front novo funciona com as duas policies; o antigo, com a
  policy nova, diria "Acesso revogado" sem revogar). **Pronto quando:** `conferir-producao.sh` mostra o
  commit do merge servido. (25/11: PR #757, `24eed26` servido antes de aplicar.)
- [x] Aplicar a migration (`db query -f`). **Pronto quando:** a prova dá TUDO OK sozinha e
  `pg_policies` mostra as 4 policies novas em cada tabela. (25/11: aplicada; prova TUDO OK; 4 policies
  em cada tabela; `check-rls-postura.sh` limpa nas 9 verificações.)

Todos os itens concluídos.
