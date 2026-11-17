# Itens que ficaram de fora do #530 — trava do `create_task`, Configurações no celular, planos

## Pedido original

> Corrigir os itens que ficaram de fora

Sessão `2e437bec-d976-4740-be05-59a4786c7e51`, 17/11/2026 ~06:10. "Os itens" são os três que o
fechamento do #530 listou em "Ficou de fora":

1. **Segurança:** qualquer usuário logado consegue criar tarefa na agenda de qualquer pessoa de
   qualquer organização (`create_task`).
2. **Configurações no celular:** a página segue quebrada a 390 px, porque o menu lateral não recolhe.
3. **Plano:** o item "Publicação" ficou sem marcar no `main`, como nos dois PRs anteriores.

## Investigação (17/11)

### 1. `create_task`

- `create_task(p_user_id, p_org_id, p_title, p_due, p_source_module, p_source_ref, p_priority,
  p_description)` é `SECURITY DEFINER`, com ACL `{postgres, authenticated, service_role}`, e só faz
  `INSERT … ON CONFLICT DO NOTHING`. Ela não confere nem a organização nem a pessoa.
- **Quem chama:**

  | Origem | Para quem | Organização |
  |---|---|---|
  | `generate_payment_tasks` (pg_cron, sem usuário) | membros da org da conta | da conta |
  | `docGenDocumentoService.garantirTarefaDePrazo` | quem está logado | do ofício |
  | `servicesCommercialService.createOpportunityTask` | quem está logado | da oportunidade |
  | `riskService.espelharEmTarefas` | **outra pessoa**: o responsável da ação, escolhido entre os membros da org do risco (`useMembrosComConta`) | do risco |
  | `taskService.ensureTaskForWorkOrder` | **outra pessoa**: o login do colaborador responsável, escolhido entre TODOS os colaboradores visíveis (inclui os disponibilizados por outra org, `employee_org_shares`) | da ordem |

  Nenhuma Edge Function chama, e nenhuma outra função do banco.
- **Mais uma porta, na mesma tabela:**
  - `tasks_insert` só exige `user_id = auth.uid()` (e o espaço), sem conferir a organização.
  - `tasks_update` também não confere a organização, então o dono troca `org_id` à vontade.
  - Com `org_id` de outra organização e `assignee_employee_id` de um colaborador dela, a tarefa
    aparece para esse colaborador e para os gestores daquela organização.
- **Dados (17/11):**
  - 66 tarefas, todas com `user_id` membro do `org_id`; nenhuma com `org_id` nulo (a coluna é NOT NULL).
  - 6 tarefas têm responsável colaborador de OUTRA org. É o compartilhamento entre empresas do
    grupo, feito de propósito (memória `project_employee_org_shares_intencional`).
  - As tarefas de risco, ofício, serviços e ordem de execução nunca foram usadas em produção (0).
  - Hoje às 04:00 a rotina de pagamento criou as 6 tarefas, a primeira execução real depois do #530.

### 2. Configurações a 390 px

- `components/Settings.tsx`: `<div class="flex gap-6">` com `<aside class="w-64 shrink-0">`
  (guia §19.2). A 390 px a árvore toma 256 px e sobram ~70 px para a folha.
- O menu global do app some abaixo de `md` e ocupa 260 px acima disso. Com a árvore ao lado, um
  tablet de 768 px fica com ~180 px de conteúdo. Por isso o ponto de quebra é `lg`.
- A §19.2 do guia não diz nada sobre o celular.

### 3. Planos

`2026-11-16-rotinas-automaticas-ligar-desligar.md` (6.3), `…-pendencias-menores.md` (5) e
`…-pontos-abertos.md` (Tarefa 4) seguem com "Publicação" aberta. Os três PRs estão no ar:
#513 = `3913ba0`, #522 = `025bc0d`, #530 = `197e4af`.

## Decisões

1. **Quem passa no `create_task`:**
   - **Sem usuário na requisição** (`auth.uid()` nulo): é chamada interna (pg_cron como postgres,
     service_role) e passa como hoje. `anon`/PUBLIC perdem o EXECUTE, então todo chamador da API
     tem usuário.
   - **Com usuário:**
     - a organização tem de ser uma das dele (`minhas_orgs_membro()`, que já inclui os superadmins);
     - a pessoa tem de ser ele mesmo, ou alguém da organização: membro (`organization_members`) ou
       login de colaborador da organização, próprio ou disponibilizado para ela (`employee_org_shares`).
       O último caso cobre a ordem de execução com colaborador emprestado.
       **Revisto em 17/11 (revisão, I2):** vale o colaborador que QUEM CRIA enxerga (de uma org
       dele, ou disponibilizado para uma delas), porque é essa a lista que a ordem de execução oferece.
   - O que não passa recebe 42501 com uma mensagem em português.
2. **Inserção direta:** `tasks_insert` ganha `org_id IN (SELECT minhas_orgs_membro())`, a forma de
   conjunto do #382.
3. **Trocar a organização de uma tarefa:** um gatilho `BEFORE UPDATE OF org_id` exige o mesmo, mas só
   quando `org_id` MUDA. Não vai no `WITH CHECK` do `tasks_update`, senão quem saiu de uma
   organização não conseguiria mais concluir as próprias tarefas antigas de lá. Sem usuário
   (rotinas), o gatilho não confere.
4. **Configurações abaixo de `lg`:**
   - a árvore vira um bloco de largura total acima da folha;
   - fecha atrás de um botão "Seção: <grupo › folha>", com `aria-expanded`;
   - escolher uma folha fecha o bloco; abrir um grupo não fecha;
   - de `lg` para cima nada muda;
   - a §19.2 do guia ganha esse comportamento.

## Plano

### Tarefa 1 — Trava do `create_task` e da tabela `tasks`

- [x] Prova `scripts/teste-tarefas-create-task-trava.sql` (BEGIN…ROLLBACK, contas reais, papel
      `authenticated` com claims). Casos:
      - **passam:** a para si na org A; a para b (membro de A); a para e (login de colaborador de A,
        não membro); a para f (colaborador de B disponibilizado para A); service_role e postgres
        sem usuário para qualquer pessoa;
      - **recusados com 42501:** a na org B; a para x (fora de A); a para g (colaborador de B NÃO
        disponibilizado); anon; inserção direta de a em B; a trocando a própria tarefa de A para B;
      - **segue funcionando:** a muda o título da própria tarefa antiga em B (ex-membro);
      - **privilégios:** ACL sem PUBLIC/anon.
      **Pronto quando:** a prova FALHA antes da migration. ✅ RED: `FALHOU: a cria tarefa na org B (veio ok:d69a…)`
      — as quatro chamadas legítimas antes dela passaram.
- [x] Migration `aplicar_20271117900000_tarefas_create_task_trava.sql`:
      - `create_task` com a autorização por dentro (assinatura igual, CREATE OR REPLACE);
      - REVOKE de PUBLIC/anon;
      - `tasks_insert` com a organização;
      - gatilho `_tasks_org_so_das_minhas`.
      **Pronto quando:** o ensaio (`montar-ensaio.sh`) dá TUDO OK e `segurancaMigrations` +
      `migrationsPrefixo` passam. ✅ ensaio TUDO OK; 15/15. Sabotagens: colaborador de qualquer org
      passando → `FALHOU: a cria tarefa para g`; organização no `WITH CHECK` do `tasks_update` →
      `FALHOU: a conclui a própria tarefa antiga da org B`.
- [x] Aplicar e rodar de novo. **Pronto quando:**
      - a prova nova dá TUDO OK no banco;
      - `teste-tarefas-pagamento.sql`, `teste-tarefas-visibilidade.sql`,
        `teste-tarefas-responsavel.sql` e `teste-tarefas-superadmin.sql` seguem TUDO OK.

### Tarefa 2 — Configurações no celular

- [x] Testes RED em `__tests__/components/SettingsMenuCelular.test.tsx`:
      - o botão "Seção: Nomenclatura" começa fechado e controla a lista (`aria-controls`);
      - escolher uma folha fecha a lista e troca o nome do botão;
      - abrir um grupo não fecha;
      - o nome inclui o grupo ("Tributos e Impostos › INSS");
      - de `lg` para cima a lista é sempre visível (classes `lg:flex`/`lg:hidden`).
      ✅ RED: 4/4 "Unable to find … role \"button\" and name `/^Seção:/`".
- [x] Implementar em `components/Settings.tsx`; §19.2 do guia atualizada. **Pronto quando:**
      - GREEN, com `SettingsRotinasAutomaticas.test.tsx` também verde;
      - `check-ui-standard` sem achado novo;
      - `tsc` sem erros.
      ✅ 6/6 (os 4 novos + os 2 da folha de Rotinas); `check-ui-standard` exit 0; `tsc` 0 erros.
- [x] Conferir no navegador (página de teste local, fora do commit) a 390, 768, 1024 e 1440.
      **Pronto quando:**
      - a página não rola na horizontal;
      - abaixo de 1024 o menu fica fechado e a folha usa a largura toda;
      - abrir, escolher e fechar funciona com clique;
      - de 1024 para cima a árvore fica ao lado, como hoje.
      ✅ Medido com Chrome (Supabase abortado; casca com menu global de 260 px a partir de `md`):

      | Largura | Rola na horizontal? | Menu | Folha |
      |---|---|---|---|
      | 390 | não (382/382) | fechado, "Seção: Nomenclatura", 332 px | embaixo, 350 px |
      | 768 | não (500/500) | fechado | embaixo, 452 px |
      | 1023 | não (755/755) | fechado | embaixo, 707 px |
      | 1024 | não | árvore ao lado, 256 px | 428 px |
      | 1440 | não | árvore ao lado, 256 px | 844 px |

      Abaixo de 1024: abrir mostra a lista; "Banco de Dados" fecha e mostra a folha; abrir
      "Tributos e Impostos" mantém aberto; "INSS" fecha com "Seção: Tributos e Impostos › INSS".
      0 erros de página. A página de teste pediu `QueryClientProvider` para a folha do INSS (o app
      já tem; foi defeito só da página de teste).

### Tarefa 3 — Planos

- [x] Marcar a Publicação nos três planos de 16/11, com PR, commit e conferência de produção.
      ✅ #513 `3913ba0`, #522 `025bc0d`, #530 `197e4af`: os três com `ci` SUCCESS e ancestrais do
      `main`; `conferir-producao.sh` (17/11) — o domínio serve `6b055c1` e tem "Rotinas automáticas".

### Tarefa 4 — Publicação

- [x] Revisão independente (ver a seção abaixo).
- [x] PR; CI; merge; conferir produção; fechar a frente; memória.
      - **PR e merge:** PR #533, com `ci` SUCCESS no commit da frente (`451892e`), mesclado em
        17/11 às 07:34 como `5e45cb9`.
      - **Produção:** na 3ª tentativa, `conferir-producao.sh` mostrou que o domínio serve
        exatamente o `main` (`5e45cb9`), com "Seções das configurações" no bundle.
      - **CI do `main` depois do merge:** success.
      - **Frente:** os 10 arquivos dela são idênticos aos do `main`; foi fechada com
        `fechar-frente.sh --sem-publicar`.
      - **Memória:** `project_tarefas_trava_create_task_org` (nova) e
        `project_rotinas_automaticas_pg_cron_liga_desliga`.
      - Esta marcação foi feita num PR só de documentação, depois do merge, para não repetir o
        item 3 do pedido.

## Andamento

- [x] **Tarefa 1** (17/11) — aplicada; as cinco provas de tarefas TUDO OK no banco.
  - **Achado no caminho:** `teste-tarefas-responsavel` caiu: o responsável que leva a tarefa para
    outra org seguia recusado (42501), mas com a mensagem do gatilho novo, porque gatilhos BEFORE
    disparam em ordem alfabética e `trg_tasks_org_so_das_minhas` vinha antes de
    `trg_tasks_responsavel_so_conteudo`. Renomeado para `trg_tasks_troca_de_org`, que dispara depois,
    e o responsável volta a ler "o responsável só altera …". A prova confere o nome e a ordem: RED com
    o nome antigo no banco, GREEN depois de reaplicar (a migration é idempotente e remove o nome antigo).
- [x] **Tarefa 2** (17/11) — menu recolhível abaixo de `lg`, conferido de 390 a 1440.
- [x] **Tarefa 3** (17/11) — Publicação marcada nos três planos de 16/11.
- [x] **Revisão independente** (17/11): 0 crítico, 2 importantes, 5 menores; mais um achado meu (Envolvidos).

## Revisão independente (17/11) — 0 crítico, 2 importantes, 5 menores

Corrigidos (migration `aplicar_20271117900100_tarefas_trava_revisao.sql`, aplicada; cada caso
novo na prova falhou antes e passou depois; as cinco provas de tarefas TUDO OK):

- **I1 — ex-membro reabria a tarefa antiga para a organização de onde saiu.**
  - **Como:** ele punha um colaborador de lá como responsável, ou trocava o espaço. A tarefa
    aparecia para esse colaborador e para os gestores da organização.
  - **Correção:** o gatilho `trg_tasks_troca_de_org` agora olha também responsável, espaço, pasta,
    obra e tarefa-mãe. Numa tarefa de organização que não é do usuário, esses campos ficam como
    estão; conteúdo e andamento seguem editáveis.
  - **Prova:** RED `ok:1`. Sabotagem (sem a comparação do responsável) → `FALHOU: a põe
    colaborador de B como responsável da tarefa antiga`.
- **I2 — a ordem de execução oferece colaboradores de TODAS as organizações do usuário.**
  - **Como:** a primeira regra só aceitava colaborador da organização da tarefa, e o
    `.catch(() => {})` da tela engolia a recusa.
  - **Decisão:** a regra da pessoa passou a ser a da tela. Vale o login de colaborador que quem
    cria enxerga: de uma organização dele, ou disponibilizado para uma delas (a RLS de
    `employees`). Quem é de fora de todas as organizações do usuário segue recusado.
  - **Custo, se estiver errado:** uma tarefa da org A pode ir para o login de um colaborador da
    org C, quando quem cria é membro das duas.
  - **Prova:** caso `h`, RED → GREEN.
- **Achado meu, ao conferir o I1 — Envolvidos (`task_collaborators`).**
  - **Como:** quem criou a tarefa punha como envolvido um colaborador de QUALQUER organização,
    e ele passava a ver a tarefa.
  - **Correção:** as policies de inserir e alterar exigem que a tarefa seja de uma organização do
    usuário e que o colaborador seja um que ele enxerga.
  - **Prova:** três casos RED → GREEN. Sabotagem (sem o EXISTS em `employees`) → `FALHOU: a põe
    colaborador da org B … como envolvido`.
  - **Dados:** 2 envolvidos hoje, nenhum de fora.
- **M4 — a checagem de ordem dos gatilhos comparava dois textos fixos.** Era sempre verdadeira.
  Saiu; a ordem é provada por `teste-tarefas-responsavel.sql`.
- **M6 — comentário impreciso** sobre o menu de `lg` para cima. Corrigido.
- **M7 — leitor de tela.**
  - **Correção:** a folha ativa ganhou `aria-current="page"` e o nó de grupo, `aria-expanded`.
  - **Prova:** teste RED → GREEN; o guia §19.2 registra.

Ficaram de fora (menores):

- **M3:**
  - quem recebe tarefa sem ser membro da organização dela (colaborador de outra org) não cria
    subtarefa nela;
  - colaborador desligado (`employees.status`) segue recebendo tarefa.

  São decisões de produto, sem nenhum caso hoje.
- **M5:**
  - **Membro só por e-mail:** sem caso na prova. O gatilho `trg_org_member_fill_user_id` preenche
    o `user_id` e não deixa montar.
  - **Corretor:** `broker_profiles` não entra como pessoa no `create_task`, e nenhuma tela cria
    tarefa para corretor.
