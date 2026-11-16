# Rotinas automáticas — ligar e desligar pela tela

## Pedido original

> coloque todas com opcão para ativa-las e desativalas
>
> Sessão: 2e437bec-d976-4740-be05-59a4786c7e51 · 16/11/2026, ~14h15 (BRT)

Contexto imediato: na mesma sessão o usuário pediu a avaliação da proposta "ÒPURA CEO" e
depois perguntou *"o que cada uma esta fazendo"* sobre as 23 rotinas do `pg_cron`. A
resposta listou as 23 (o que fazem, frequência, o que produziram). Este pedido é sobre
essas 23.

Aprovação do desenho abaixo: *"sim"* (16/11/2026, mesma sessão).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 16/11 | ÒPURA CEO é para quem? | Uso interno da Alpa primeiro |
| 16/11 | A equipe cadastra a hierarquia? | Sim (fica para o CEO, não para este plano) |
| 16/11 | IA no MVP do CEO? | Desligada, mantendo a decisão de 15/11 |
| 16/11 | Desenho da tela de rotinas (abaixo) | Aprovado ("sim") |

## Desenho

### Por quê

Hoje ligar ou desligar uma rotina exige SQL no banco (`cron.alter_job`). Na avaliação do
CEO apareceram rotinas que são ruído (aviso de atraso para os 6 membros, 1.660 avisos de
SLA num dia), uma quebrada desde 06/08 (`daily-payment-tasks`, 59 falhas) e três que
nunca produzem nada. O usuário quer poder desligar qualquer uma sem pedir a ninguém. É
também o primeiro pedaço de "Configurações" do futuro ÒPURA CEO.

### Objetivo

Uma seção **Configurações › Rotinas automáticas**, só para superadmin, que lista TODAS
as rotinas do `pg_cron` com um interruptor Ligada/Desligada, a última execução e as
falhas recentes, e registra quem mudou o quê.

### Não-objetivos (fora deste plano)

- Mudar horário/frequência de uma rotina.
- Ligar/desligar **por organização**.
- Consertar a `daily-payment-tasks` (aparece como "falhando"; consertar ou eliminar é
  decisão separada do usuário).
- Limpar o histórico `cron.job_run_details` (474 mil linhas, 329 MB desde 25/02) — anotado
  como observação, não é pedido.

### Anti-objetivos (seria falha mesmo funcionando)

- Um membro comum conseguir desligar uma rotina (pela tela OU chamando a RPC direto).
- A tela mostrar "Ligada" quando o `pg_cron` está desligado (ou o contrário): o estado
  exibido é sempre o lido de `cron.job.active`, nunca um espelho guardado em outra tabela.
- Desligar a conciliação, o Asaas ou a NF-e por um clique distraído, sem aviso do que para.
- A tela travar a Configurações: a leitura do histórico não pode varrer as 474 mil linhas.

### Abordagens consideradas

| | Abordagem | Troca | Decisão |
|---|---|---|---|
| A | **Interruptor global = `cron.alter_job(active)`** via RPC `SECURITY DEFINER` restrita a superadmin | 1 migration, nenhuma das 23 rotinas muda; vale para as 8 orgs juntas | **Escolhida** |
| B | Tabela de "rotina ligada por organização" lida por cada uma das 23 funções | Granular, mas reescreve 23 funções (várias em Edge) para um uso que hoje é só da Alpa | Rejeitada |
| C | Flag própria "pausada" numa tabela, conferida no começo de cada rotina | Mesmo custo de B, e duplica o `active` que o `pg_cron` já tem | Rejeitada |

### Como funciona (decidido)

**Banco** — migration nova `aplicar_20271116XXXXXX_rotinas_automaticas_ligar_desligar.sql`
(prefixo: conferir o MAIOR do dia na hora do push; hoje o maior é `…850000`):

1. Tabela `rotinas_automaticas_alteracoes` (só acréscimo): `id`, `jobname`,
   `ativo_antes`, `ativo_depois`, `alterado_por` (uuid), `alterado_por_email`,
   `alterado_em`. RLS ligada, **sem policy** (leitura só pela RPC). `REVOKE ALL … FROM
   PUBLIC, anon, authenticated` — inclui TRUNCATE, que os default privileges dão.
2. `fn_rotinas_automaticas_listar()` `SECURITY DEFINER`, `search_path` fixo: recusa se
   `NOT is_superadmin()` (42501). Devolve, por job: `jobid`, `jobname`, `schedule`,
   `active`, última execução (`start_time`, `status`, `return_message` truncado),
   execuções e falhas dos últimos 7 dias, e a última alteração registrada (quem/quando/
   para qual estado).
   ⚠️ `cron.job_run_details` só tem índice em `runid`. A janela é por **`runid`**
   (`runid > max(runid) − N`, varredura do índice para trás), não por `start_time`. N
   cobre ≥ 35 dias (o relatório do investidor roda no dia 1); hoje são ~29 mil
   execuções/semana. Meta: < 500 ms medido com `EXPLAIN ANALYZE`.
3. `fn_rotina_automatica_definir(p_jobname text, p_ativo boolean)` `SECURITY DEFINER`:
   recusa se não superadmin; acha o job pelo nome (erro claro se não existir); se o
   estado já é o pedido, não faz nada e não registra; senão `cron.alter_job(jobid,
   active := p_ativo)` + linha na tabela de alterações, na mesma transação.
4. As duas funções: `REVOKE EXECUTE … FROM PUBLIC, anon` + `GRANT … TO authenticated`
   (REGRA #7, pergunta 2); a autorização de verdade é o `is_superadmin()` dentro.

**Front:**

- `utils/rotinasAutomaticas.ts` — catálogo `jobname → { nome, grupo, oQueFaz,
  sensivel, aoDesligar }` para as 23 de hoje, na linha do `notificationTypes.ts`: job
  sem entrada aparece com o nome técnico no grupo "Outras" (degrada, não quebra). Cada
  frase é conferida no código da rotina antes de escrita.
- `services/rotinasAutomaticasService.ts` — `listar()` e `definir(jobname, ativo)` sobre
  as duas RPCs.
- `components/settings/RotinasAutomaticasSettings.tsx` — tabela padrão (guia §6.10
  `StandardTable` ou o que o guia mandar para tabela agrupada §6.12), agrupada em
  Avisos à equipe · Dinheiro e sistemas externos · Relatórios · Técnicas · Outras.
  Colunas: Rotina (nome + o que faz), Quando roda (cron traduzido: "a cada minuto",
  "diária às 05h45"), Última execução, Falhas 7 dias (título com o último erro),
  Ligada (`TableSwitch`). Linha desligada mostra "Desligada por X em dd/mm".
- Desligar rotina `sensivel` → `useConfirm()` com o texto `aoDesligar`. Ligar e desligar
  as demais não pedem confirmação. Após gravar, atualiza só a linha (guia §22).
- `Settings.tsx` — folha nova "Rotinas automáticas" visível só quando
  `supabase.rpc('is_superadmin')` devolve `true` (a função já existe e já é executável
  por `authenticated`).

**Grupos e rotinas sensíveis (pedem confirmação ao desligar):**

| Grupo | Rotinas |
|---|---|
| Avisos à equipe | process-sla-sweep, process-overdue-sweep, daily-financial-notifications, daily-payment-tasks, task-alert-notifier, riscos-alertas-diarios, manutencao-vencimento-alerts, opura-docs-vencimento-alerts, daily-academy-alerts, warranty-sla-sweep, vencimento-portal-alerts |
| Dinheiro e sistemas externos (**todas sensíveis**) | dunning-notifier-hourly, asaas-status-sync, asaas-conta-extrato, reconciliation-engine-sweep, email-capture-sync, email-capture-busca-diaria, fiscal-fallback-polling |
| Relatórios | financial-report-hourly, hourly-bi-report-check, monthly-investor-report (**sensível**: investidor deixa de receber) |
| Técnicas | planta-webhooks-retentativas (**sensível**), opura-market-feeds-diario |

### Deixado para quem implementa

- Formato exato do texto "Quando roda" a partir da expressão cron (só os 9 formatos
  que existem hoje precisam sair bonitos; o resto mostra a expressão crua).
- Se o `pg_cron` religa um job ao reaplicar `cron.schedule` com o mesmo nome — não muda
  o desenho (a tela lê o estado real), mas vale anotar no plano se for verdade.

## Plano

> **Para quem executa:** um item por vez, com `- [ ]` marcado e o commit ao lado.
> Pastas e comandos relativos à frente `C:\D\frentes\rotinas-automaticas`.

**Objetivo:** Configurações › Rotinas automáticas, só superadmin, liga/desliga qualquer job do `pg_cron`.
**Arquitetura:** 2 RPCs `SECURITY DEFINER` (listar, definir) sobre `cron.job`/`cron.job_run_details` +
tabela de registro só-acréscimo; no front, catálogo puro → service → tela em `StandardTable` agrupada.
**Stack:** Postgres 15 + pg_cron 1.6.4 (`cron.timezone = GMT`; BRT = GMT−3, sem horário de verão), React 19, Vitest.

### Restrições globais

- Rótulos em sentence case, sem caixa alta (catraca #348); valor nunca em cinza-claro (guia §32).
- Migration nunca por `db push`; aplicar por `npx supabase db query --linked -f <arquivo>`.
- Toda função nova: `REVOKE EXECUTE … FROM PUBLIC, anon` + `GRANT … TO authenticated` (REGRA #7).
- Tabela nova: `REVOKE ALL … FROM PUBLIC, anon, authenticated` (default privileges dão TRUNCATE).
- Leitura do histórico SEMPRE por janela de `runid`, nunca `WHERE start_time` sozinho (474 mil linhas, só índice em `runid`).

### Foco da revisão (o que nenhum teste de unidade pega sozinho)

1. **Membro comum chamando a RPC direto** (DevTools) → 42501 nas duas funções. Testado no item 1 (prova SQL, perna "membro").
2. **Job que roda 1×/mês** (`monthly-investor-report`) → "Última execução" preenchida, não vazia: a janela de `runid` cobre ≥ 35 dias. Testado no item 1 (prova SQL).
3. **Clique duplo / estado já igual** → `definir` com o estado atual não grava linha de registro nem chama `alter_job`. Testado no item 1.
4. **Falha ao gravar** (rede, 42501) → o interruptor volta ao estado anterior e o erro aparece; nada fica "ligado na tela, desligado no banco". Testado no item 4.
5. **Job novo sem entrada no catálogo** → aparece no grupo "Outras" com o nome técnico, pode ser ligado/desligado. Testado nos itens 2 e 4.

---

### Task 1 — Item 1: Banco: tabela de registro + `fn_rotinas_automaticas_listar` + `fn_rotina_automatica_definir`

**Arquivos:**
- Criar: `supabase/migrations/aplicar_20271116XXXXXX_rotinas_automaticas_ligar_desligar.sql` (prefixo = maior do dia + 10000, conferido com `git ls-tree origin/main supabase/migrations/ | grep 20271116` NA HORA do push)
- Criar: `scripts/teste-rotinas-automaticas.sql` (prova, roda em `BEGIN … ROLLBACK`)

**Interfaces (produz):**
- `public.fn_rotinas_automaticas_listar() RETURNS TABLE (jobid bigint, jobname text, schedule text, active boolean, ultima_inicio timestamptz, ultima_status text, ultima_mensagem text, execucoes_7d int, falhas_7d int, alterado_em timestamptz, alterado_por_email text, alterado_ativo_depois boolean)` — ordenado por `jobname`.
- `public.fn_rotina_automatica_definir(p_jobname text, p_ativo boolean) RETURNS SETOF <mesma linha>` — devolve a linha do job depois da mudança.
- Erros: `42501 'apenas superadmin'`; `P0002 'rotina não encontrada: <nome>'`.

- [ ] **1.1 Escrever a prova** `scripts/teste-rotinas-automaticas.sql`, modelo `scripts/teste-tarefas-visibilidade.sql`
  (uid tirado de `auth.users` ANTES do `SET ROLE authenticated`; `request.jwt.claims` com o e-mail). Pernas:
  - superadmin: `listar()` devolve `count(*) = (select count(*) from cron.job)`; linha de `monthly-investor-report` tem `ultima_inicio IS NOT NULL`;
  - superadmin: `definir('hourly-bi-report-check', false)` → `active = false` na linha devolvida e em `cron.job`, +1 linha em `rotinas_automaticas_alteracoes` com `ativo_antes = true, ativo_depois = false`;
  - superadmin: `definir('hourly-bi-report-check', false)` de novo → 0 linhas novas no registro;
  - superadmin: `definir('nao-existe', true)` → erro `P0002`;
  - membro não-superadmin: `listar()` e `definir(...)` → `42501`;
  - `authenticated` direto: `select * from rotinas_automaticas_alteracoes` → `42501` (sem GRANT).
  - termina em `ROLLBACK`.
- [ ] **1.2 Rodar a prova** antes da migration: `npx supabase db query --linked -f scripts/teste-rotinas-automaticas.sql` → falha com "function … does not exist".
- [ ] **1.3 Escrever a migration.** Tabela `rotinas_automaticas_alteracoes (id uuid pk default gen_random_uuid(), jobname text not null, ativo_antes boolean not null, ativo_depois boolean not null, alterado_por uuid, alterado_por_email text, alterado_em timestamptz not null default now())` + índice `(jobname, alterado_em desc)`.
  As duas funções `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron, pg_temp`; primeira linha:
  `IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'apenas superadmin' USING ERRCODE = '42501'; END IF;`.
  Janela do histórico (o único trecho que não sai da assinatura):
  ```sql
  WITH janela AS (
    SELECT d.jobid, d.status, d.start_time, d.return_message, d.runid
    FROM cron.job_run_details d
    WHERE d.runid > (SELECT max(runid) FROM cron.job_run_details) - 150000  -- ≥ 35 dias hoje (~29 mil/semana)
  )
  ```
  `definir`: `SELECT jobid, active INTO … FROM cron.job WHERE jobname = p_jobname FOR UPDATE`; se não achou → P0002; se `active = p_ativo` → só devolve a linha; senão `PERFORM cron.alter_job(v_jobid, active := p_ativo)` + INSERT no registro com `auth.uid()` e `lower(auth.jwt() ->> 'email')`, e devolve a linha (reusar `listar()` filtrado, sem duplicar a consulta).
  Fecho: REVOKEs/GRANTs das restrições globais.
- [ ] **1.4 Rodar o teste do CI da migration:** `npx vitest run __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` → PASS.
- [ ] **1.5 Aplicar** (`db query --linked -f` da migration). Se o auto mode barrar como [Production Deploy], pedir ao usuário para rodar o mesmo comando no PowerShell da frente.
- [ ] **1.6 Rodar a prova de novo** → todas as pernas passam; `EXPLAIN ANALYZE SELECT * FROM fn_rotinas_automaticas_listar()` como superadmin < 500 ms (anotar o tempo aqui).
- [ ] **1.7 Commit** `feat(rotinas): RPCs listar/definir rotinas do pg_cron, só superadmin`.

### Task 2 — Item 2: Catálogo puro `utils/rotinasAutomaticas.ts`

**Arquivos:** criar `utils/rotinasAutomaticas.ts`; teste `__tests__/rotinasAutomaticas.test.ts`.

**Interfaces (produz):**
- `type GrupoRotina = 'avisos' | 'dinheiro' | 'relatorios' | 'tecnicas' | 'outras'`
- `GRUPOS_ROTINA: { id: GrupoRotina; rotulo: string }[]` na ordem: Avisos à equipe · Dinheiro e sistemas externos · Relatórios · Técnicas · Outras
- `interface MetaRotina { nome: string; grupo: GrupoRotina; oQueFaz: string; sensivel: boolean; aoDesligar?: string }`
- `rotinaMeta(jobname: string): MetaRotina` — sem entrada → `{ nome: jobname, grupo: 'outras', oQueFaz: '', sensivel: false }`
- `quandoRoda(schedule: string): string` — horário em BRT

- [ ] **2.1 Teste que falha** — `__tests__/rotinasAutomaticas.test.ts`:
  - `it('cobre as 23 rotinas de 16/11/2026')`: para cada nome da lista literal (as 23 da tabela de grupos do Desenho), `rotinaMeta(n).grupo !== 'outras'` e `oQueFaz.length > 0`;
  - `it('sensíveis são exatamente as 9 do desenho')`: os 7 de "Dinheiro e sistemas externos" + `monthly-investor-report` + `planta-webhooks-retentativas`; e toda sensível tem `aoDesligar`;
  - `it('job desconhecido cai em Outras com o nome técnico')`: `rotinaMeta('x-nova')` → `{ nome: 'x-nova', grupo: 'outras', sensivel: false }`;
  - `it('quandoRoda traduz os formatos de hoje para BRT')`, tabela de casos:
    `'* * * * *'→'A cada minuto'`, `'*/2 * * * *'→'A cada 2 min'`, `'*/10 * * * *'→'A cada 10 min'`, `'*/15 * * * *'→'A cada 15 min'`,
    `'0 * * * *'→'De hora em hora'`, `'7 * * * *'→'De hora em hora (minuto 7)'`,
    `'45 8 * * *'→'Diária às 05h45'`, `'0 6 * * *'→'Diária às 03h00'`, `'0 1 * * *'→'Diária às 22h00'`,
    `'0 6 1 * *'→'Mensal, dia 1 às 03h00'`, `'*/30 9-10 * * *'→'A cada 30 min, das 06h às 07h59'`;
  - `it('formato desconhecido devolve a expressão crua')`: `quandoRoda('0 9 * * 1-5') === '0 9 * * 1-5'`; mensal com hora < 3 GMT (o dia mudaria) também cru.
- [ ] **2.2 Rodar** `npx vitest run __tests__/rotinasAutomaticas.test.ts` → FAIL (módulo não existe).
- [ ] **2.3 Escrever o catálogo.** Cada `oQueFaz`/`aoDesligar` em linguagem de usuário, **conferido no código da rotina** (função SQL via `pg_get_functiondef`, ou `supabase/functions/<nome>/index.ts`) — não copiar da conversa sem conferir. Frases de `aoDesligar` partem do Desenho (ex.: Asaas status → "PIX e boletos pagos deixam de ser marcados como pagos sozinhos.").
- [ ] **2.4 Rodar** → PASS. **2.5 Commit** `feat(rotinas): catálogo das 23 rotinas e horário em BRT`.

### Task 3 — Item 3: Service `services/rotinasAutomaticasService.ts`

**Interfaces:** consome as RPCs do item 1. Produz:
- `interface RotinaAutomatica { jobid: number; jobname: string; schedule: string; ativa: boolean; ultima: { inicio: string; status: string; mensagem: string | null } | null; execucoes7d: number; falhas7d: number; ultimaAlteracao: { em: string; porEmail: string | null; ativaDepois: boolean } | null }`
- `rotinasAutomaticasService.listar(): Promise<RotinaAutomatica[]>`
- `rotinasAutomaticasService.definir(jobname: string, ativa: boolean): Promise<RotinaAutomatica>`
- `rotinasAutomaticasService.souSuperadmin(): Promise<boolean>` — `rpc('is_superadmin')`, erro → `false`

- [ ] **3.1 Teste que falha** `__tests__/rotinasAutomaticasService.test.ts` (mock de `../lib/supabase` como em `centralControleService.test.ts`):
  `listar` chama `fn_rotinas_automaticas_listar` sem argumentos e mapeia `ultima_inicio = null → ultima: null`, `alterado_em = null → ultimaAlteracao: null`;
  `definir('a', false)` chama `fn_rotina_automatica_definir` com `{ p_jobname: 'a', p_ativo: false }` e devolve a 1ª linha mapeada;
  `{ error: { message: 'apenas superadmin' } }` → `rejects.toThrow('apenas superadmin')`;
  `souSuperadmin` → `true` só com `data === true`; com `error` → `false`.
- [ ] **3.2** FAIL → **3.3** implementar → **3.4** PASS → **3.5 Commit** `feat(rotinas): service das rotinas automáticas`.

### Task 4 — Item 4: Tela `components/settings/RotinasAutomaticasSettings.tsx`

**Antes de editar:** ler `docs/ui_ux_guia_unificado.md` INTEIRO (REGRA #1) e `UI_PATTERNS.md` (REGRA #4).

**Interfaces:** consome itens 2 e 3; `TableSwitch`, `StandardTable` (com `agrupamento` §6.12, campo único "grupo", `padrao: 'grupo'`, ordem = `GRUPOS_ROTINA`), `useConfirm`.

- [ ] **4.1 Teste que falha** `__tests__/components/RotinasAutomaticasSettings.test.tsx` (service mockado; `ConfirmProvider` em volta):
  - mostra os grupos na ordem do catálogo e a linha "Prazo de processo (BPM)" com `quandoRoda` traduzido;
  - linha com `falhas7d: 3` mostra "3 falhas" com `title` = `ultima.mensagem`;
  - linha desligada com `ultimaAlteracao` mostra "Desligada por <e-mail> em dd/mm";
  - desligar rotina NÃO sensível chama `definir(jobname, false)` sem diálogo;
  - desligar rotina sensível abre diálogo com o texto `aoDesligar`; Cancelar → `definir` não é chamado; Confirmar → é;
  - ligar rotina sensível NÃO pede confirmação;
  - `definir` rejeita → o interruptor volta ao estado anterior e a mensagem de erro aparece;
  - job `x-nova` (fora do catálogo) aparece em "Outras".
- [ ] **4.2** FAIL → **4.3** implementar. Atualiza só a linha devolvida por `definir` (guia §22). Interruptor desligado enquanto grava, com `title` "Gravando…" (botão desligado diz o motivo). Erro conforme §13 do guia — conferir no navegador que aparece (memória do toast mudo).
- [ ] **4.4** PASS + `bash scripts/check-ui-standard.sh components/settings/RotinasAutomaticasSettings.tsx` exit 0.
- [ ] **4.5 Commit** `feat(rotinas): tela Configurações › Rotinas automáticas`.

### Task 5 — Item 5: Folha em `components/Settings.tsx`, só para superadmin

- [ ] **5.1** `SettingsLeafId` ganha `'rotinas-automaticas'`; nó `{ id: 'rotinas-automaticas', label: 'Rotinas automáticas', icon: Timer, leafId: 'rotinas-automaticas' }` depois de "Banco de dados"; o nó só entra na lista quando `souSuperadmin()` resolveu `true` (estado local, carregado no mount). Render: `{activeLeaf === 'rotinas-automaticas' && <RotinasAutomaticasSettings />}`.
- [ ] **5.2** `npx tsc --noEmit` (exit lido por grep — memória do tsc) + `npx vitest run __tests__/orgContextGuard.test.ts` → OK. `check-ui-standard.sh components/Settings.tsx` exit 0 (ou só as exceções já existentes no arquivo, listadas).
- [ ] **5.3 Commit** `feat(rotinas): folha Rotinas automáticas nas Configurações (superadmin)`.

### Task 6 — Item 6: Conferência real e publicação

- [ ] **6.1** App local da frente, logado como `desenvolvedor@`: abrir Configurações › Rotinas automáticas; conferir as 23 linhas contra `select jobname, active from cron.job`; desligar e religar `hourly-bi-report-check` (0 agendamentos de BI — inofensiva) e conferir `cron.job.active` + 2 linhas no registro; desligar uma sensível e **cancelar** no diálogo (nada muda no banco).
- [ ] **6.2** Como agente-leitura (login feito pelo usuário): a folha não aparece; `rpc('fn_rotinas_automaticas_listar')` pelo console → 42501.
- [ ] **6.3** Suíte: os 4 arquivos de teste novos + `segurancaMigrations` + `orgContextGuard` PASS; PR com CI verde → `gh pr ready` + `gh pr merge --squash` → `bash scripts/conferir-producao.sh "Rotinas automáticas"` → `bash scripts/fechar-frente.sh rotinas-automaticas --sem-publicar` (após provar conteúdo idêntico).

## Estado

- [x] Desenho aprovado pelo usuário (16/11)
- [x] Plano de implementação escrito (16/11)
- [x] Item 1 — banco: migration `aplicar_20271116900000` APLICADA em 16/11; prova TUDO OK
  (ensaio e banco aplicado); listar ≈ 420 ms como superadmin (3 medidas: 442/418/420 ms).
  `FOR UPDATE` em `cron.job` trocado por `pg_advisory_xact_lock` — o postgres do Supabase só
  tem SELECT em `cron.job` (42501 medido no ensaio).
- [x] Item 2 — catálogo: `utils/rotinasAutomaticas.ts` (23 rotinas, frases conferidas no código
  em 16/11), `__tests__/rotinasAutomaticas.test.ts` 16/16
- [x] Item 3 — service: `services/rotinasAutomaticasService.ts`, `__tests__/rotinasAutomaticasService.test.ts` 5/5
- [x] Item 4 — tela: `components/settings/RotinasAutomaticasSettings.tsx`, teste 8/8,
  `check-ui-standard.sh` exit 0. Interruptor NÃO vira antes de gravar (mostra só o estado do
  banco); o `title` das falhas mostra o erro só quando a ÚLTIMA execução falhou (a RPC devolve a
  mensagem da última execução, não da última falha).
- [x] Item 5 — folha nas Configurações: `components/Settings.tsx` (folha depois de "Banco de
  Dados", só com `is_superadmin()` = true), `__tests__/components/SettingsRotinasAutomaticas.test.tsx`
  2/2; `tsc --noEmit` 0 erros; 7 travas de UI/org 43/43; `check-ui-standard.sh` exit 0
- [ ] Item 6 — conferência real e publicação

## Verificação

De ponta a ponta: item 6. A prova do banco (`scripts/teste-rotinas-automaticas.sql`) fica
no repositório para rodar de novo depois de qualquer mudança nas duas funções.

## Observações (fora do pedido)

- `cron.job_run_details` cresce sem limpeza: 474 mil linhas / 329 MB desde 25/02/2026.
- `daily-payment-tasks` falha desde 06/08/2026 (59×): passa `p_priority := 1` (integer) para
  `create_task(…, smallint, …)`. Quando funcionava, criava uma tarefa por membro da org.
