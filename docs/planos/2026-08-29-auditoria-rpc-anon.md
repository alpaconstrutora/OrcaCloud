# Auditoria — RPCs `SECURITY DEFINER` abertas a `anon`

## Pedido original

> 1. sim
> 2. sim

(2026-08-29) Resposta ao que eu havia oferecido ao fechar a migration
`aplicar_20270915000006_debt_revoke_anon_functions.sql`:

> **1.** Outras RPCs com o mesmo furo. A própria `000006` documenta que
> `fn_dre_summary`, `fn_dre_spe_summary`, `fn_opura_pivot` e
> `fn_contract_guarantees_expiring` têm `EXECUTE` para `anon` desde antes deste
> módulo. Ela deliberadamente não mexeu nelas: algumas RPCs do sistema são
> `SECURITY DEFINER` e os portais públicos chamam justamente como `anon` —
> revogar em lote derrubaria portal. Quer que eu levante quais são de portal e
> quais são vazamento, para decidir caso a caso?
>
> **2.** O front do módulo de dívidas não está deployado. […] Quer que eu publique?

Este documento é o item 1. O item 2 (deploy) foi feito na mesma sessão.

## Por que isto existe

O Supabase mantém, por padrão:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
```

Ou seja, **toda função nova nasce com grant explícito para `anon`**, e
`REVOKE ... FROM PUBLIC` **não** remove grant de papel nomeado. É a mesma
armadilha que a `000006` corrigiu para as funções `fn_debt_*`.

## O levantamento

Consulta usada (exclui funções de extensão e funções de trigger, que o PostgREST
não expõe como RPC):

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and has_function_privilege('anon', p.oid, 'EXECUTE')
   and p.prorettype <> 'pg_catalog.trigger'::regtype
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
```

**177 funções** `SECURITY DEFINER` chamáveis por `anon`, em três famílias:

| Família | Nº | Veredito |
|---|---:|---|
| **A — Portal público** (`*_portal_*`, `fn_proposal_public`, `qr_checkin`, `get_order_by_share_token`, `academy_validate_certificate`, `submit_public_interest`, `get_public_marketplace`) | 99 | **Legítimas.** Os portais chamam como `anon` por construção, com token próprio. Não mexer. |
| **B — Helper de RLS** (`is_org_member`, `is_superadmin`, `check_user_*`, `fiscal_*`, `*_user_org_ids`, `seed_*`) | 16 | **Avaliar.** Chamadas de dentro das policies; expostas, permitem sondar pertencimento. Baixo impacto, mas sem motivo para estarem abertas. |
| **C — Internas** | 62 | **Fechar.** Nenhuma é de portal. A lista completa está abaixo. |

## O que foi PROVADO (não suposto)

Testado com `BEGIN; SET LOCAL ROLE anon; …; ROLLBACK;` no banco de produção.

### 🔴 1. Enumeração de workspaces por e-mail — vazamento de leitura

```sql
BEGIN; SET LOCAL ROLE anon;
  SELECT count(*) FROM public.get_workspaces_for_member('<email>');      -- 7
  SELECT count(*) FROM public.get_user_partner_workspaces('<email>');    -- 1
ROLLBACK;
```

Sem login, um e-mail devolve os UUIDs dos workspaces daquele usuário. A `anon key`
é pública (vai no bundle do front), então isto é alcançável de fora.

### 🔴 2. `create_organization_v2` — ESCRITA sem login

```sql
BEGIN; SET LOCAL ROLE anon;
  SELECT public.create_organization_v2('ZZ_TESTE…','000…','x@x.com',NULL,NULL,NULL,NULL,'x@x.com');
  -- devolve a organização criada, com id
ROLLBACK;
```

A organização foi de fato criada dentro da transação. **O teste rodou com
`ROLLBACK` e foi conferido depois** (`select count(*) … where name = 'ZZ_TESTE…'`
→ `0`): nada ficou no banco. Qualquer um com a `anon key` pode criar organização.

### 🟡 3. O que NÃO vaza (medido, não presumido)

`rh_kpis(p_org_id, p_ref_date)` e similares que recebem `p_org_id` **retornam
zeros** para `anon`, inclusive apontando para uma org com funcionários — o RLS
das tabelas internas segura. Vale o mesmo veredito da `000006`: é **superfície
desnecessária**, não vazamento de dado. Não confundir os dois ao priorizar.

## Família C — as 62 a fechar

Agrupadas por risco. `(E)` = faz escrita.

**Alto — escrita ou identidade, sem depender de org:**
`create_organization_v2` (E) · `upsert_profile` (E) · `get_workspaces_for_member` ·
`get_user_partner_workspaces` · `master_city_add` (E) · `hire_candidate` (E) ·
`replay_dead_letter` (E) · `dismiss_dead_letter` (E)

**Médio — escrita com `p_org_id`/id de recurso:**
`generate_hr_monthly_snapshot` (E) · `close_labor_diary` (E) ·
`consolidate_evaluation_cycle` (E) · `create_task` (E) · `create_vacation_period` (E) ·
`update_employee_rubrics` (E) · `upsert_employee_allocations` (E) ·
`fpa_duplicate_budget_with_adjustment` (E) · `esocial_create_batch` (E) ·
`esocial_generate_s2200` (E) · `dispatch_communication` (E) ·
`fn_activate_commercial_price_table` (E) · `fn_activate_rental_price_table` (E) ·
`fn_set_broker_property_access` (E) · `fn_lock_opura_document` (E) ·
`fn_unlock_opura_document` (E) · `approve_area_version` (E) · `lock_area_version` (E) ·
`supersede_area_version` (E) · `validate_area_version` (E) · `calculate_area_version` (E) ·
`trigger_monthly_investor_report` (E) · `generate_monthly_investor_reports` (E) ·
`generate_payment_tasks` (E) · `generate_rental_renewal_alerts` (E) ·
`fn_warranty_sla_sweep` (E) · `fn_opura_docs_vencimento_alerts` (E)

**Baixo — leitura, protegida por RLS (superfície):**
`rh_kpis` · `sst_indicators` · `esocial_get_dashboard` · `fn_planning_for_client` ·
`fn_build_planning_json` · `fn_project_measurements_by_budget_item` ·
`fn_process_bottlenecks` · `fn_maintenance_due_alerts` · `fn_supplier_warranty_alerts` ·
`fn_vencimento_alerts` · `get_distinct_categories` · `get_terrain_radius_statistics` ·
`calculate_polygon_area` · `imovib_unit_instance_org_check` · os 13 `get_next_*_code`
(estes são `(E)` de fato — incrementam contador)

## Plano de correção (as guardas exigidas antes de aplicar)

Uma migration `aplicar_2027xxxx_revoke_anon_rpcs_internas.sql` no mesmo molde da
`000006`: varre por nome, revoga de `anon` e de `PUBLIC`, concede a
`authenticated`, e **aborta se não achar nada**.

⚠️ **Não fazer em lote cego.** Três guardas antes:

1. **Provar que nenhuma é chamada como `anon` pelo front.** `grep -rn "\.rpc('<nome>'"`
   e conferir se o arquivo pertence a fluxo de portal público. `create_organization_v2`
   é o caso a olhar com cuidado — se o cadastro de nova organização acontece
   ANTES do login, revogar quebra o onboarding. Se acontece depois, é `authenticated`
   e revogar é seguro.
2. **Fechar em ondas**, começando pelo grupo Alto, com verificação entre elas.
3. **Conferência obrigatória depois de cada onda** — `has_function_privilege('anon', …)`
   deve virar `false` e `('authenticated', …)` seguir `true`. `rows: []` do
   SQL Editor não prova nada (ver `project_verificar_deploy_e_migration_de_fora`).

## Correção — APLICADA em 2026-08-29

O usuário confirmou que `create_organization_v2` **roda depois do login**, o que
liberou fechar a família inteira de uma vez em vez de em ondas.

`supabase/migrations/aplicar_20270916000001_revoke_anon_rpcs_internas.sql` —
61 funções, varridas por nome com a assinatura resolvida via `pg_proc` (cobre as
sobrecargas, como `get_next_contract_number`). Aborta se não achar nada e
**avisa** os nomes da lista que não existem mais no banco, para a lista não
envelhecer em silêncio.

### Guardas antes de aplicar

1. Cada nome cruzado com `grep -rn "rpc('<nome>'"` no front.
2. A única que aparecia em arquivo de portal era `fn_planning_for_client`
   (`services/clientPortalService.ts`) — e ali o próprio código diz
   *"Caminho autenticado (prévia do admin, sem token público)"*. O portal
   público usa `fn_portal_get_planning(p_token)`, que **não** entrou na lista.
3. `create_organization_v2` pós-login, confirmado pelo usuário.

### Conferência (feita, não presumida)

| Verificação | Resultado |
|---|---|
| Família C ainda aberta a `anon` | **62 → 0** |
| Família A (portal público) | **99 → 99**, intacta |
| `get_workspaces_for_member` como `anon` | `42501: permission denied` ✅ |
| `create_organization_v2` — `anon` / `authenticated` | `false` / `true` ✅ |
| `fn_portal_get_planning` para `anon` | `true` (portal de pé) ✅ |
| App após o REVOKE (login + 4 telas) | sem 4xx novo |

⚠️ **Achado alheio, registrado e NÃO corrigido aqui:** `fn_top_suppliers_ap`
responde **HTTP 400** no Dashboard Financeiro. Não é efeito do REVOKE — ela não
está na lista, não é `SECURITY DEFINER` e segue com `anon=true`/`auth=true`; os
parâmetros do front batem com a assinatura do banco. É defeito pré-existente da
própria função, para outra tarefa.

## Estado

- [x] Levantamento feito e classificado (177 funções, 3 famílias).
- [x] Vazamento de leitura provado (`get_workspaces_for_member`).
- [x] Escrita sem login provada e revertida (`create_organization_v2`).
- [x] Medido que a família de `p_org_id` **não** vaza dado (RLS segura).
- [x] **Família C fechada** — migration aplicada e conferida.
- [x] **Família B — investigada e DELIBERADAMENTE mantida aberta** (ver abaixo).
- [x] `fn_top_suppliers_ap` HTTP 400 — corrigido por
  `aplicar_20270916000002_fix_fn_top_suppliers_ap_ambiguo.sql`.

## Família B — por que NÃO deve ser fechada

O pedido foi fechá-la junto com a C. **Medi antes de aplicar, e o resultado diz
para não aplicar.**

Os 16 helpers (`is_org_member`, `is_superadmin`, `fiscal_member_of`, …) **não são
RPC de tela — são parte da avaliação das policies RLS**. 63 tabelas têm policy
com `roles = {public}` (que inclui `anon`) citando um deles, e **61 dessas
tabelas têm `SELECT` concedido a `anon`**. O GRANT da tabela é checado antes do
RLS, então hoje o caminho é: `anon` entra na tabela → a policy roda →
`is_org_member(...)` devolve `false` → **zero linhas**, sem vazamento.

Simulado em transação revertida (revogando de `anon` **e** de `PUBLIC`, que é o
que de fato fecha):

```sql
BEGIN;
  REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM anon;
  REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
  SET LOCAL ROLE anon;
  SELECT count(*) FROM public.employees;
ROLLBACK;
-- ERROR: 42501: permission denied for function is_org_member
```

Ou seja: revogar troca **"0 linhas"** por **erro** em 61 tabelas — o PostgREST
passaria a responder 500 onde hoje responde lista vazia. Nenhum dado a mais fica
protegido, porque nenhum estava exposto.

⚠️ Um teste anterior deu falso negativo por revogar só de `anon`: o privilégio
vinha de `PUBLIC`. É a mesma armadilha da `000006` — **`REVOKE ... FROM anon`
sozinho não fecha nada**.

**Veredito:** manter. O risco descrito no levantamento ("permite sondar
pertencimento") não se sustenta: para `anon`, `auth.uid()` é nulo e
`is_org_member` devolve `false` para qualquer uuid — não há o que sondar.

**O caminho certo, se um dia se quiser fechar**, não é mexer nos helpers e sim
tirar o `SELECT` de `anon` das 61 tabelas: aí a policy nem chega a ser avaliada.
É mudança maior, com risco próprio (algum portal pode ler alguma delas como
`anon`), e fica registrada aqui como trabalho separado.
