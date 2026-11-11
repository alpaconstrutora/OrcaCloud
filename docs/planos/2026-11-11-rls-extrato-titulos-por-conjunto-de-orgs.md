# RLS do extrato e dos títulos: conjunto de organizações calculado uma vez

**Pedido do usuário (11/11/2026):** "o carregamento esta lento. verifique" →
"continue investigando esses 3,3" → escolheu, entre as correções propostas, também
"Policies das tabelas grandes" (com a condição: plano antes; medir exige travar a
tabela, então só com o ok dele e em horário combinado).

## Estado

- [x] Medição sem DDL (abaixo).
- [x] Ok do usuário para este plano (11/11/2026, "ok"); aplicação quando ele rodar a migration.
- [x] Teste a seco da função `minhas_orgs_membro()` (só a função, sem ALTER POLICY, desfeito):
      12 usuários (todo e-mail de organization_members/broker_profiles + JWT vazio) × 7
      organizações lidas como dono = **84 pares, 0 diferenças** com `is_org_member`; e as
      linhas do extrato que cada um vê pela policy atual = as do conjunto, **12 de 12**
      (de 0 a 13.962). Migration: `aplicar_20271111940000_rls_extrato_titulos_por_conjunto.sql`.
- [x] Migration aplicada pelo usuário (11/11/2026). Conferido: as duas policies com
      `organization_id IN (SELECT minhas_orgs_membro())`, mesmo nome/papel/comando,
      WITH CHECK só em internal_transactions; `minhas_orgs_membro` sem PUBLIC e sem anon.
- [x] Medida de fora (11/11/2026, desenvolvedor@, "Todas"):
      varredura do extrato 625–774 ms → 4–8 ms; títulos 111–116 ms → 5–16 ms;
      bootstrap com JWT real 2,1–2,7 s → 0,54–0,58 s; **Central na produção: primeira
      carga 0,83 s, Atualizar 0,72–0,83 s** (de manhã: 5,6–5,9 s); caixa 2,0–2,4 s → 0,28 s.
      Dados conferidos na tela (títulos, obras, % conciliado, caixa, aprovações, alertas,
      divergências) e nenhuma requisição com erro. Conciliação não medida.
- [ ] Próxima etapa (não começada): as outras ~610 policies com `is_org_member`, tabela
      a tabela, com a mesma prova de equivalência.

## Por quê

As duas tabelas que o bootstrap da Central (e a Conciliação, o Financeiro…) mais
varrem têm a mesma policy:

| tabela | policy | expressão | linhas |
|---|---|---|---|
| `bank_transactions` | Manage bank_transactions as member (ALL, authenticated) | `is_org_member(organization_id)` | 13.962 |
| `internal_transactions` | Manage internal_transactions as member (ALL, authenticated) | `is_org_member(organization_id)` (USING e WITH CHECK) | 2.232 |

`is_org_member` é `plpgsql SECURITY DEFINER` e roda **uma vez por linha**: uma
consulta em `organization_members` (e em `broker_profiles` quando não acha) mais a
leitura do JWT. Medido em 11/11/2026, como `authenticated` com JWT no formato real,
3 rodadas, contagens iguais nas duas formas:

| varredura | policy atual | filtro por conjunto (`organization_id = ANY(orgs)`) |
|---|---|---|
| extrato (13.962) | 625–774 ms | 3 ms |
| títulos (2.232) | 111–116 ms | 1 ms |

Toda leitura do extrato, em qualquer tela, paga ~0,6 s só de RLS. A otimização de
`is_org_member` (ler o JWT uma vez — `aplicar_20271111930000`) baixa o custo por
chamada, mas continua sendo uma chamada por linha.

## Proposta

1. Função nova `public.minhas_orgs_membro()` → `SETOF uuid`: as organizações em que
   `is_org_member` daria verdadeiro, calculadas **uma vez**, com **a mesma lógica**:
   - `organization_members` com `user_id = auth.uid()`, ou, nas linhas legadas sem
     `user_id`, `lower(email) = lower(e-mail do JWT)`;
   - `broker_profiles` ativo com o e-mail do JWT.
   `STABLE SECURITY DEFINER`, `search_path = public, pg_temp`.
2. As duas policies passam a
   `organization_id IN (SELECT public.minhas_orgs_membro())` — subconsulta sem
   correlação: o PostgreSQL a executa uma vez por consulta e confere cada linha
   contra o conjunto (hash). `ALTER POLICY` mantém nome, comando e papéis.
   `internal_transactions` mantém o WITH CHECK com a mesma expressão;
   `bank_transactions` continua sem WITH CHECK explícito (ALL usa o USING).
3. A policy de parceiro de `internal_transactions` (`internal_transactions_select_partner`)
   **não muda**.

Só essas duas tabelas nesta etapa. As outras ~610 policies que usam
`is_org_member` ficam para depois, tabela a tabela, se a medição desta etapa confirmar
o ganho — trocar tudo de uma vez seria o maior raio de impacto possível em segurança.

## Regra #7

- **Pergunta 1 — perna do OR:** a expressão nova não tem OR; é a mesma pergunta
  ("a org da linha é uma das minhas?"), feita uma vez. A policy de parceiro
  continua sendo a única outra perna em `internal_transactions`, intocada.
- **Pergunta 2 — quem executa:** `minhas_orgs_membro()` é nova →
  `REVOKE EXECUTE … FROM PUBLIC, anon; GRANT … TO authenticated`. As duas policies
  são só para `authenticated`. Ela só devolve as orgs do PRÓPRIO usuário do JWT.

## Equivalência (o que precisa ser provado antes de aplicar)

Para cada usuário que aparece em `organization_members` ou `broker_profiles` (e para
um JWT anônimo/vazio), e para cada organização:
`is_org_member(org) = (org IN (SELECT minhas_orgs_membro()))`.
`organization_id NULL`: `is_org_member(NULL)` é falso; `NULL IN (…)` é nulo → a
linha não passa. Mesmo resultado.

## Risco e volta

- **Trava:** `ALTER POLICY` pega trava exclusiva na tabela até o fim da transação. A
  migration é só os dois ALTER (milissegundos); o teste a seco com a policy trocada
  seguraria a trava pelo tempo do teste, por isso a medição fim a fim é depois de
  aplicar, não num teste a seco.
- **Volta:** reaplicar a expressão antiga (`is_org_member(organization_id)`) nas duas
  policies — script pronto na própria migration, comentado.
- **O que pode dar errado:** a função nova divergir de `is_org_member` para algum
  caso de borda (membro sem `user_id`, corretor inativo, e-mail com caixa diferente).
  É exatamente o que o teste de equivalência cobre, para TODOS os usuários reais.

## Medida de sucesso

Central ("Todas", desenvolvedor@) e a aba de divergências da Conciliação, medidas na
produção com o laço do Atualizar (4 cliques) antes e depois. Hoje, com
`aplicar_20271111920000` aplicada: Central 3,2–3,4 s.
