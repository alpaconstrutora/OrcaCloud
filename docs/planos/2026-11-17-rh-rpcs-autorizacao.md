# RH — 8 funções do banco sem autorização e a policy de `employees`

## Pedido original

> Sim

Sessão `2e437bec-d976-4740-be05-59a4786c7e51`, 17/11/2026 ~09:45. Resposta a esta pergunta minha:

> Começo pelas funções do RH?

A pergunta fechava a recomendação de próximo passo:

1. **Fechar as 8 funções do RH** que qualquer usuário logado executa em qualquer organização:
   - gravam: `hire_candidate`, `create_vacation_period`, `close_labor_diary`,
     `consolidate_evaluation_cycle`, `esocial_create_batch`, `esocial_generate_s2200`;
   - leem: `esocial_get_dashboard`, `sst_indicators`.
2. **Na mesma frente, a policy `employees_org_access`:** vale para tudo (ALL) sem regra própria de
   gravação, e por isso deixa mover um colaborador para outra organização.

A origem são os achados novos dos revisores da varredura Claude Security de 15/11, que não
entraram no relatório nem nos 22 patches do #514.

## Investigação (17/11)

### As 8 funções

- As 8 são `SECURITY DEFINER`. A ACL é `{postgres, authenticated, service_role}`: PUBLIC e anon já
  foram revogados em `aplicar_20270916000001`.
- **Nenhuma confere quem chama.** A busca por `auth.uid`, `is_org_member`, `minhas_orgs_membro`,
  `is_superadmin`, `has_permission` e `pode_` no corpo não achou nada.
- **Todas as tabelas que elas tocam têm a mesma RLS:** `org_id IN (SELECT minhas_orgs_membro())`.
  - Vale para `candidates`, `job_openings`, `vacation_balance`, `labor_diary_entries`,
    `evaluation_*`, `esocial_*` e `accidents`.
  - `labor_diary_workers` e `esocial_batch_events` seguem a org do registro-pai.
  - `time_entries` usa `can_access_employee`.
  - Ou seja: a função faz, com privilégio do banco, o que a RLS recusaria ao usuário.

| Função | Quem chama (tela) | De onde sai a organização |
|---|---|---|
| `hire_candidate(candidato, data)` | `LaborATS` | do candidato; a vaga é lida e fechada |
| `create_vacation_period(colaborador, org, data)` | `laborService.createEmployee` (org do colaborador) e `LaborAbsences` (org do topo) | parâmetro |
| `close_labor_diary(diário)` | `laborService.closeDiary` | do diário; cria `time_entries` para os presentes |
| `consolidate_evaluation_cycle(ciclo)` | `LaborEvaluation` | do ciclo |
| `esocial_create_batch(org, grupo, período)` | `LaborEsocial` | parâmetro |
| `esocial_generate_s2200(colaborador)` | `LaborEsocial` | do colaborador |
| `esocial_get_dashboard(org)` | `esocialService.getDashboard(orgId \| null)` | parâmetro; `null` ("Todas") devolve zeros |
| `sst_indicators(org, ano)` | `laborService.getSstIndicators(orgId \| null)` | parâmetro; idem |

**Nenhuma é chamada por pg_cron nem por Edge Function.**

**Dados em 17/11:**
- `vacation_balance`: 4 linhas, nenhuma em org diferente da do colaborador.
- `labor_diary_workers`: 0 linhas.
- `candidates`: 2, nenhum com vaga de outra org.
- `evaluation_cycles`, `esocial_events`, `esocial_batches` e `accidents`: vazias.

### `employees_org_access`

```
FOR ALL  USING ( org_id IN minhas_orgs_membro()  OR  is_employee_shared_with_user(id) )   -- sem WITH CHECK
```

Sem WITH CHECK próprio, o USING vale também para a linha nova. O ramo do compartilhamento
(`employee_org_shares`) libera a linha sozinho (REGRA #7, pergunta 1):

- **Quem recebe um colaborador disponibilizado** pode EDITAR e APAGAR esse colaborador. Também pode
  trazê-lo para a própria org (`UPDATE … SET org_id = <minha>`).
- **Quem é membro da org dona** pode disponibilizar o colaborador para uma org sua e depois mudar o
  `org_id` dele para uma org de que **não** é membro. A linha nova passa pelo ramo do
  compartilhamento, e o colaborador aparece no RH dessa outra org.

**Dados em 17/11:** são 15 compartilhamentos. **0 pessoas** enxergam um colaborador disponibilizado
sem ser membro da org dona. Por isso ninguém usa hoje a edição pelo compartilhamento.

## Decisões

1. **A regra das 8 funções é a mesma da RLS das tabelas.** A organização do registro (candidato,
   vaga, diário, ciclo, colaborador, ou a org passada) tem de estar em `minhas_orgs_membro()`.
   - Sem usuário na requisição (service_role, postgres) passa como antes, igual ao `create_task`.
   - A recusa é 42501, com mensagem que diz o que faltou.
2. **Colaborador** (`create_vacation_period`, presentes do `close_labor_diary`): basta ser um que
   quem chama enxerga, da org dele ou disponibilizado para uma delas. É a mesma regra do
   `create_task` (#533).
   - A tela de férias usa a org do topo e lista também os disponibilizados. Exigir a org dona
     quebraria esse uso.
3. **Leitura com organização `null`** (`esocial_get_dashboard`, `sst_indicators`) continua
   devolvendo zeros, como hoje: "Todas" nunca bloqueia leitura (REGRA #5). Uma org que não é do
   usuário dá 42501.
4. **`employees`:** ver continua igual (org do usuário ou disponibilizado para ele).
   - Criar, editar e apagar ficam só com membro da org dona, e a linha nova tem de ficar numa org
     do usuário.
   - Mover um colaborador de org exige ser membro das duas.
   - Mesma regra que já vale para `update_employee_rubrics` e `upsert_employee_allocations` desde
     11/10. Na palavra do usuário, o compartilhamento é para o colaborador "se movimentar" (prestar
     serviço, ser pago), e quem cuida dele é membro da org dona.
   - **Custo se estiver errada:** quem recebe um colaborador disponibilizado deixa de corrigir o
     cadastro dele. Hoje não há ninguém nessa situação.

## Plano

### Tarefa 1 — Prova (RED)

`scripts/teste-rh-rpcs-autorizacao.sql`, em BEGIN … ROLLBACK, no formato de
`teste-tarefas-create-task-trava.sql`.
- **Personagens:** `a`, membro comum da org A, fora da org B. A org C passa a ser dele dentro da
  transação.
- **Casos:**
  - cada função recusada na org B;
  - cada função aceita na org A;
  - `null` nas leituras;
  - service_role e postgres sem usuário;
  - anon sem EXECUTE;
  - colaborador não visível;
  - colaborador disponibilizado;
  - os cinco caminhos de `employees`.
- **Pronto quando:** contra o banco de hoje, falha em "a contrata candidato da org B" (o furo
  existe).

### Tarefa 2 — Migration (GREEN)

`supabase/migrations/aplicar_20271117910000_rh_rpcs_autorizacao.sql`
- **Helpers:** `_rh_exige_org(org, o_que)` e `_rh_exige_colaborador(colaborador)`.
  - Ambos são `SECURITY DEFINER`, com REVOKE de PUBLIC, anon e authenticated.
  - Só são chamados de dentro das 8.
- **As 8 funções:** CREATE OR REPLACE a partir da definição do banco (lida em UTF-8), com a checagem
  no início. Cada uma leva REVOKE de PUBLIC e anon e GRANT para authenticated e service_role.
- **`employees`:** a `employees_org_access` sai e entram `employees_select`, `_insert`, `_update` e
  `_delete`.
- **ROLLBACK no cabeçalho.**
- **Pronto quando:**
  - o ensaio (`montar-ensaio.sh`) dá `TUDO OK`;
  - `segurancaMigrations` e `migrationsPrefixo` passam;
  - nenhuma acentuação foi corrompida (`Ã§`, `â€`).

### Tarefa 3 — Aplicar e conferir

- Aplicar com `db query --linked -f`.
- Rodar a prova contra o banco aplicado.
- Conferir a ACL das 8 e dos helpers.
- Conferir as provas que já tocam `employees`: `teste-tarefas-create-task-trava` e
  `teste-colaborador-*`, se houver.
- **Pronto quando:** `TUDO OK` no banco aplicado e as provas vizinhas seguem `TUDO OK`.

### Tarefa 4 — Revisão independente, PR e publicação

- Revisor de contexto limpo sobre o diff.
- PR com evidência.
- CI.
- Merge.
- `conferir-producao`.
- Marcar aqui.
- Fechar a frente.

## Andamento

- [ ] Tarefa 1
- [ ] Tarefa 2
- [ ] Tarefa 3
- [ ] Tarefa 4
