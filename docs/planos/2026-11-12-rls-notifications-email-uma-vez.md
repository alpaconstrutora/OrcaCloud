# notifications: e-mail do JWT lido uma vez por consulta

**Pedido do usuário (12/11/2026):** depois da troca das 614 policies
(`docs/planos/2026-11-11-rls-is-org-member-tabelas-grandes.md`), ofereci corrigir o
custo que sobrou em `notifications` → "prepare a correção".

## Estado

- [x] Prova sem ALTER (como dono, só leitura): 16 identidades × USING antigo vs novo =
      **0 linhas diferentes**; filtro com JWT real 37,4 → 5,4 ms (4.604 linhas).
- [ ] Usuário aplica `aplicar_20271112900000_rls_notifications_email_uma_vez.sql`.
- [ ] Conferir a policy no banco e medir o custo de RLS de notifications.

## Por quê

Custo de RLS de `notifications` depois do lote 1: ~38 ms, quase todo na perna
`lower(recipient_email) = lower((auth.jwt() ->> 'email'))` — `auth.jwt()` converte o
JSON das claims a cada linha. A troca: `(SELECT lower((auth.jwt() ->> 'email')))`, uma
subconsulta escalar sem correlação (InitPlan, 1× por consulta). Mesmo valor sempre; o
WITH CHECK não usa o e-mail e fica igual.

## Fora do escopo

Outras policies com JWT por linha em tabelas ≥ 200 linhas: `internal_transactions`
(policy de parceiro, ~8 ms medidos), `storage.objects` (70 policies), 
`opura_market_listings` (358 linhas). Nenhuma com custo que justifique hoje.

## Regra #7

- Pergunta 1: as mesmas duas pernas do OR; nada novo libera.
- Pergunta 2: nenhuma função nova; papel/comando iguais.

## Volta

`ALTER POLICY` com a expressão antiga — no cabeçalho da migration.
