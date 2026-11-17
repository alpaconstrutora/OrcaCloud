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

- [x] **Tarefa 1:** a prova falhou contra o banco de 17/11 com `FALHOU: a contrata candidato da
  org B (veio ok:ea28…, esperava 42501:sem acesso: você não é membro da organização do
  candidato)`. Um membro da org A contratou um candidato da org B; a transação foi desfeita.
- [x] **Tarefa 2:** o ensaio deu `TUDO OK`.
  - **Diff contra o banco:** nas 8 funções só entraram as linhas `PERFORM public._rh_exige_*`.
  - **Travas do CI:** `segurancaMigrations` e `migrationsPrefixo` passam (15/15).
  - **Sabotagens pegas (5), cada uma no caso certo:**

    | Versão errada da migration | Caso que falhou |
    |---|---|
    | sem o ramo do disponibilizado em `_rh_exige_colaborador` | "período para colaborador disponibilizado" |
    | `hire_candidate` sem conferir a vaga | "vaga da org B" |
    | diário sem conferir os presentes | "presente da org B que ele não enxerga" |
    | `employees_update` com o ramo do compartilhamento no USING | "edita colaborador da org B só porque foi disponibilizado" |
    | `sst_indicators` recusando org nula | "SST em Todas" |
- [x] **Tarefa 3:** migration aplicada em 17/11, e a prova dá `TUDO OK` no banco.
  - **Postura no banco:** as 8 são DEFINER, executáveis por authenticated e não por anon, e
    chamam `_rh_exige_*`. Os 2 helpers não são executáveis nem por authenticated nem por anon.
    Nenhuma acentuação corrompida.
  - **`employees`:** tem as 4 policies novas, todas `TO authenticated`.
  - **Provas vizinhas, todas `TUDO OK`:** `teste-tarefas-create-task-trava`, `-responsavel`,
    `-visibilidade`, `-superadmin`, `-pagamento`, `teste-vinculo-colaborador-envolvidos`,
    `teste-link-celular-diario` e `teste-link-celular-tarefas`.
  - **`check-rls-postura.sh`:** "postura limpa nas 9 verificações".
- [ ] Tarefa 4 — revisão feita e corrigida (seção abaixo); falta PR, CI, merge e publicação.

## Revisão independente (17/11) — 0 crítico, 2 importantes, 8 menores

O revisor (contexto limpo, sonda própria em BEGIN … ROLLBACK) não achou caminho para agir ou ler em
organização de que não se é membro pelas 8 funções nem por `employees`. Achados e destino:

### Corrigidos

Tudo com teste que falhou antes. Migration `aplicar_20271117910100_rh_rpcs_autorizacao_revisao`
(aplicada), mais tela e serviço.

| Achado | Gravidade | O que era | Correção | Prova |
|---|---|---|---|---|
| I1 | importante | `consolidate_evaluation_cycle` somava respostas de OUTRA org gravadas no ciclo. A RLS de `evaluation_responses` só confere o `org_id` da resposta. O revisor mediu: nota 5,00 → 3,50, e resultado criado para colaborador de B. | as 4 leituras filtram a org do ciclo | caso "nota final … = 5" e "colaborador de B não ganha resultado"; 2 sabotagens pegas |
| I2 | importante | Lista de colaboradores: depois da policy nova, quem só recebeu o colaborador disponibilizado via Excluir "dar certo" (0 linhas, toast "Colaborador excluído."). Editar e Inativar davam PGRST116. | Editar, Disponibilizar, Inativar e Excluir desligados na linha, com o motivo no invólucro. `removeEmployee` pede de volta o que apagou e falha com 0 linhas. | `LaborEmployeeListDisponibilizado.test.tsx` (2 RED → GREEN) e `laborServiceRemoveEmployee.test.ts` (2 RED → GREEN) |
| M3 | menor | `hire_candidate` fechava a vaga contando CONTRATADOS de outra org (mesma brecha em `candidates.job_id`) | a contagem filtra a org do candidato | caso "vaga A2 segue aberta" (RED contra o banco) |
| M4 + M5 | menor | o colaborador de férias e do diário podia ser um disponibilizado para QUALQUER org do usuário, não para a do registro; a prova não pegava o ramo sem `target_org_id` | `_rh_exige_colaborador(colaborador, org, de_quem)`: da org do registro, ou disponibilizado PARA ela. A versão de 1 argumento saiu. | casos B→C, B→D e diário com B→C recusados; B→C na org C e diário com disponibilizado para A aceitos; 3 sabotagens pegas, inclusive a do revisor |

O §9.2 do guia de UI ganhou o padrão "`<ActionIconButton>` desligado: motivo no invólucro".

### Ficam de fora

Menores. Nenhum tem efeito hoje.

- **M4, resto:** o índice único `vacation_balance (employee_id, periodo_inicio)` vale entre orgs. A
  org que recebeu o colaborador ainda pode criar o período primeiro e ocupar o da org dona.
  - Isso é decisão de produto: a org que recebe deve abrir férias? Pela regra da folha (11/10), a
    folha é da org dona.
- **M6:** a regra de "disponibilizado" difere entre a função e a RLS.
  - `is_employee_shared_with_user`: e-mail com distinção de caixa, sem `user_id` e sem corretor.
    Também é VOLATILE e roda por linha.
  - A função usa `minhas_orgs_membro()`.
  - Unificar pede um helper DEFINER por conjunto (padrão #382).
- **M7:** `close_labor_diary` grava `time_entries` de um colaborador disponibilizado, que a RLS
  (`can_access_employee`, org dona) não mostra a quem fechou o diário. Também não confere a org de
  `project_id` e `team_id` do diário.
  - Não há leitura afetada (o revisor procurou em pg_proc e nas views).
- **M8:** `_rh_exige_org` usa `NOT IN`. É seguro enquanto `minhas_orgs_membro()` filtrar NULL, como
  faz hoje.
- **M9:** um corretor ativo passa como membro, igual a toda a RLS. Achado F5–F7 da varredura; hoje
  são 0 corretores com login fora de `organization_members`.
- **M10:** 42501 × "não encontrado" revela se o registro existe. Irrelevante com UUID.
