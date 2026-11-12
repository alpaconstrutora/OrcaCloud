# RLS com `is_org_member` por linha — onde vale trocar pelo conjunto de orgs

**Pedido do usuário (11/11/2026):** "Abrir frente com as 610 regras" — depois de
`aplicar_20271111940000` (extrato e títulos) baixar a Central de ~6 s para 0,8 s.
Frente: `C:\D\frentes\rls-por-conjunto` (branch `feat/rls-por-conjunto`).

## Estado

- [x] Inventário das 614 policies e medição do custo de RLS por tabela (abaixo).
- [x] Escopo decidido pelo usuário (11/11/2026): **todas as 614** (eu recomendei Fases
      1 e 2; a escolha foi trocar todas). Abordagem para isso ser provável em escala:
      ver "Troca mecânica" abaixo — substitui a proposta por tabela.
- [x] Gerador `scripts/rls-trocar-is-org-member.mjs` (retrato em
      `2026-11-11-rls-is-org-member/policies-antes.json`): 614 policies, **852 chamadas
      trocadas**; confere por policy que o nº de trocas = nº de chamadas e que não sobra
      nenhuma. `validar.sql` (EXPLAIN, sem trava): **823 de 823 expressões válidas**.
- [x] Prova da troca (desfeita): 12 usuários (inclui anon com JWT vazio, papel anon,
      com o GRANT do lote 2) × 9 valores de X (7 orgs + NULL + uuid inexistente) =
      **108 pares, 0 diferenças; 0 também com NOT**.
- [x] Conferência sobre os dados (`comparar-lote-N.sql`, só leitura): para cada
      expressão e cada usuário, linhas com `(antiga) IS DISTINCT FROM (nova)` na mesma
      consulta: lote 1 = 336 comparações, lote 2 = 9.132, lote 3 = 408 — **0 linhas
      diferentes em 9.876**.
- [x] Storage: `postgres` NÃO é dono de storage.objects (supabase_storage_admin), mas o
      ALTER POLICY é permitido (testado com a expressão atual, desfeito).
- [x] Lote 1 `aplicar_20271112700000` (21 policies, 10 tabelas ≥ 300 linhas) aplicado pelo
      usuário (12/11/2026). Conferido: 21 de 21 com `minhas_orgs_membro`, 0 com
      `is_org_member`. Medido (mesmo script, como authenticated, JWT real, desenvolvedor@),
      custo de RLS por `count(*)`, mesmas linhas visíveis:
      boletos_auditoria 316 → 3,4 ms · reconciliation_classification_memory 103 → 1,7 ·
      boletos 38 → 1,4 · blueprint_objects 31 → 1,2 · supplier_org_shares 24 → 1,0 ·
      blueprint_audit_events 15 → 1,0 · contract_precedent_conditions / invoices /
      suppliers 11–13 → 1,0–1,1 · notifications 150 → 38 ms. Em notifications o resto é a
      outra perna do OR, `lower(recipient_email) = lower(auth.jwt()->>'email')`, que lê o
      JWT por linha — fora da troca mecânica (candidata: `(SELECT lower(auth.jwt()->>'email'))`).
- [x] Lote 2 `aplicar_20271112710000` (564 policies, 332 tabelas; GRANT anon) aplicado pelo
      usuário (12/11/2026). Conferido: schema public com 587 policies em
      `minhas_orgs_membro` (21 + 564 + as 2 do extrato), 344 tabelas, **0 com
      `is_org_member`**; ACL de `minhas_orgs_membro` com anon. Leitura (só `count(*)`) de
      todas as 344 tabelas: authenticated (desenvolvedor@) 344 de 344 sem erro; anon (JWT
      vazio) 172 sem erro, nas outras falta SELECT na própria tabela (igual a antes), nenhum
      erro de função. Custo de RLS: as tabelas de 40–170 linhas caíram de 2–5 ms para
      ~1 ms; reconciliation_audit_log 35 → 1,1 ms. Exceção esperada:
      reconciliation_suggestions / reconciliation_matches 6–7 → ~10 ms — a policy é
      `EXISTS (bank_transactions bt WHERE bt.id = … AND <org>)` e agora o planejador faz
      UMA varredura do extrato (hashed SubPlan, ~10 ms, fixo) em vez de 1 chamada por linha
      (linear: empata em ~250 linhas). Leitura por id continua por índice (1 linha do
      extrato). Não muda nada.
- [x] Lote 3 `aplicar_20271112720000` (29 policies do storage) aplicado pelo usuário
      (12/11/2026). Conferido: **0 policies com `is_org_member` no banco inteiro**; 587 em
      public + 29 em storage com `minhas_orgs_membro`. storage.objects visível ao
      desenvolvedor@: 2.054, igual a antes. Custo do `count(*)` no storage: ~94 ms (antes
      80–170, variável) — o que resta NÃO é is_org_member: planejamento de 38 ms (29
      policies → ~400 subplans), `storage.foldername()` repetido por linha e
      `purchase_order_is_buyer/supplier` por linha nos buckets de pedido. O app não varre o
      storage inteiro (lista por bucket + prefixo, pelo índice); não mexer sem medir o
      caminho real.
- [x] Renomeadas para 20271112700000/710000/720000 (12/11/2026): os prefixos 300000/310000/
      320000 foram ocupados no main pela frente do Imovib enquanto esta estava aberta. Os
      arquivos foram APLICADOS com os nomes antigos; o conteúdo é o mesmo.
- [x] Teste do usuário pelo app (12/11/2026): anexos do Diário de Obra e do Financeiro — ver,
      enviar e remover — funcionaram. Velocidade percebida: "melhorou bastante".

## Troca mecânica (escolhida em 11/11/2026)

Cada ocorrência `is_org_member(X)` vira
`COALESCE((X) IN (SELECT public.minhas_orgs_membro()), false)`.

- **Mesmo valor booleano sempre.** `is_org_member` nunca devolve nulo; `X IN (…)`
  devolve nulo quando X é nulo — o `COALESCE` devolve falso, como a função. Por isso a
  troca vale dentro de qualquer contexto (OR, AND, NOT, EXISTS, CASE).
- **A prova é uma só**, não 614: para cada usuário (todo e-mail de
  organization_members/broker_profiles + JWT vazio) e para cada X possível — toda org
  que aparece em organizations, organization_members e broker_profiles, mais NULL e
  um uuid que não existe —, `is_org_member(X) = COALESCE(X IN (SELECT …), false)`.
  Fora desses valores as duas formas dão falso por construção (nenhuma linha de
  membro/corretor com aquela org).
- `minhas_orgs_membro` passa a ser executável também por `anon` (120 policies de
  papel `{public}`), pelo mesmo motivo de `is_org_member` (aplicar_20271111930000):
  o anon avalia a policy; para JWT vazio a função devolve conjunto vazio.
- Aplicação com `SET lock_timeout = '2s'`: cada `ALTER POLICY` trava a tabela por
  milissegundos; tabela ocupada faz o comando falhar (e a migration ser rodada de
  novo) em vez de enfileirar as leituras do app atrás dele.

## O que a medição mostrou

Custo de RLS = `count(*)` como `authenticated` com JWT real (desenvolvedor@) menos
`count(*)` sem RLS. Melhor de 2 leituras. Todas as tabelas com policy que usa
`is_org_member` e ≥ 40 linhas (26 tabelas):

| tabela | linhas | custo de RLS | formato da policy |
|---|---|---|---|
| boletos_auditoria | 9.554 | 315 ms | `is_org_member(organization_id)` (SELECT, INSERT) |
| storage.objects | 2.058 | 168 ms | 29 policies, 3 formatos (pasta → org/parceiro) |
| notifications | 4.620 | 149 ms | e-mail do destinatário **OR** membro da org |
| reconciliation_classification_memory | 3.190 | 103 ms | `is_org_member(organization_id)` (ALL) |
| boletos | 1.154 | 37 ms | `is_org_member(organization_id)` (4 comandos) |
| reconciliation_audit_log | ~1.050 | 35 ms | `is_org_member(organization_id)` (SELECT, INSERT) |
| blueprint_objects | 941 | 31 ms | simples |
| supplier_org_shares | 737 | 24 ms | `is_org_member(target_org_id) OR is_superadmin()` |
| blueprint_audit_events | 447 | 15 ms | simples |
| contract_precedent_conditions / invoices / suppliers | 336–376 | 11–13 ms | simples / simples / OR com compartilhamento |
| 14 tabelas de 40–170 linhas | — | 1–7 ms cada | — |

Regra prática: **~33 ms de RLS a cada 1.000 linhas** visíveis. As 4 primeiras somam
~735 dos 959 ms medidos. As outras ~160 tabelas têm < 40 linhas.

Formatos das 614 policies: 305 `is_org_member(organization_id)` puro (187 tabelas),
130 com outra coluna, 33 dentro de subconsulta, 100 com OR, 46 outros.

## Proposta

Trocar só onde a medição mostra custo, com a mesma técnica e a mesma prova de
`aplicar_20271111940000` (`organization_id IN (SELECT public.minhas_orgs_membro())`).

**Fase 1 — ≥ 1.000 linhas, policy simples ou com OR claro (≈ 600 ms por leitura):**

| tabela | policies | expressão nova |
|---|---|---|
| boletos_auditoria | audit_select, audit_insert | `organization_id IN (SELECT public.minhas_orgs_membro())` |
| reconciliation_classification_memory | reconciliation_memory_org (USING + CHECK) | idem |
| boletos | select, insert, update, delete | idem |
| reconciliation_audit_log | View…, Create… | idem |
| notifications | notifications_rw | USING: `lower(recipient_email) = (SELECT lower(auth.jwt()->>'email')) OR (organization_id IS NOT NULL AND organization_id IN (SELECT public.minhas_orgs_membro()))`; CHECK: `organization_id IS NULL OR organization_id IN (SELECT …)` |

`notifications`: as duas pernas do OR continuam as mesmas (Regra #7, Pergunta 1 — o
e-mail do destinatário já liberava sozinho e continua liberando, nada novo); o
e-mail do JWT passa a ser lido uma vez (`SELECT` sem correlação).

**Fase 2 — 300–1.000 linhas (≈ 100 ms somados):** blueprint_objects,
supplier_org_shares (`target_org_id IN (SELECT …) OR (SELECT is_superadmin())`),
blueprint_audit_events, contract_precedent_conditions, invoices, suppliers (o OR com
`supplier_org_shares` fica; só a chamada direta muda).

**Storage — fase própria:** 29 policies, 3 formatos, a org vem de
`storage.foldername(name)` com conversão para uuid. Conversão de texto que não é uuid
dá ERRO — a forma nova tem de manter a mesma conversão (`(foldername)[1]::uuid IN
(SELECT …)`), e um formato usa `partner_users` (portal de parceiro). Investigar e
medir pelo caminho real (download/listagem) antes de propor.

**Fase 3 — não trocar:** ~180 tabelas com < 300 linhas custam de 1 a 7 ms. Mexer em
~580 policies de segurança por esse ganho não compensa. Rever quando alguma crescer —
a medição acima é um script de leitura que pode rodar de novo.

## Regra #7

- Pergunta 1: nenhuma perna de OR nova; onde há OR (notifications, supplier_org_shares,
  suppliers), as mesmas pernas, só a chamada por linha vira conjunto.
- Pergunta 2: nenhuma função nova (reusa `minhas_orgs_membro`, já `authenticated`).
  Todas as policies das Fases 1 e 2 são `TO authenticated`. Policies de papel
  `{public}` estão fora (o anon não executa `minhas_orgs_membro`).

## Equivalência (o que provar antes de cada migration, sem trava de tabela)

Para cada um dos 12 usuários (todo e-mail de organization_members/broker_profiles +
JWT vazio), em cada tabela da fase: o conjunto de linhas visível pela policy atual
(como `authenticated`) = o conjunto selecionado pela expressão nova avaliada como dono
com as orgs daquele usuário. Para INSERT/UPDATE (WITH CHECK) a expressão é a mesma
função de org já provada (84 pares, 0 diferenças).

## Risco e volta

`ALTER POLICY` trava cada tabela por milissegundos ao aplicar. Cada migration traz o
`ALTER POLICY` de volta (expressão antiga) comentado no cabeçalho.
