# CLAUDE.md — ORÇACLOUD / ÒPURA

> Este arquivo é carregado automaticamente em toda sessão. As regras abaixo
> **substituem qualquer atalho de conveniência** — não são sugestões.

---

## REGRA OBRIGATÓRIA #1 — Padrão de UI (`docs/ui_ux_guia_unificado.md`)

**Gatilho:** qualquer edição que toque tabela, KPI card, toolbar, busca, badge de
status, coluna de ações, modal de confirmação, toast, ou **qualquer célula com
campo editável inline (select/dropdown/LazySelect dentro de `<td>`)**.

Isso já foi "aplicado" mais de uma vez de forma incompleta — a auditoria parou nos
elementos estruturais (thead/cards/busca) e não desceu ao nível dos componentes
internos das células (selects inline com `font-bold text-xs uppercase`, fora do
padrão, passaram despercebidos). **Não pode se repetir.** Por isso o protocolo
abaixo não é opcional e não é "boa vontade" — é passo obrigatório do trabalho.

### Protocolo (sem pular etapa, sem exceção)

1. **Antes de editar**: ler `docs/ui_ux_guia_unificado.md` inteiro (não só a seção
   que parece relevante — o documento é curto o suficiente para ler completo).
2. **Depois de editar**: rodar `scripts/check-ui-standard.sh` **nos arquivos
   que você tocou**, não em amostra, não "por cima":

   ```bash
   bash scripts/check-ui-standard.sh <arquivo_editado>.tsx
   ```

   Ele checa mecanicamente (exit code ≠ 0 se achar algo): §3 busca sem
   `usePersistedState`, §7 `font-bold`/`font-black`/`font-mono` dentro de
   `<td>` (inclui selects/LazySelect dentro da célula — não só o texto
   solto), §8 pílula `rounded-full`+`uppercase` (badge/status), §14
   `confirm()`/`window.confirm()` nativo em vez de `useConfirm()`. Qualquer
   resultado que não seja uma exceção **documentada no próprio guia** (seção
   7.1 cobre editáveis inline) é não-conformidade e deve ser corrigida antes
   de reportar a tarefa como concluída.
3. **Ao reportar ao usuário**: não basta dizer "apliquei o padrão". Listar
   explicitamente quais itens do `CHECKLIST DE APLICAÇÃO` (topo do guia) foram
   verificados, incluindo o item de campos editáveis inline. Se algo do guia não
   se aplica à tela (ex: não tem toggle grade/lista), dizer isso explicitamente —
   não apenas omitir.
4. Se encontrar um padrão visual que o guia **não cobre** (ex: um tipo de célula
   novo), a saída correta é **atualizar o guia** com uma seção nova (como a 7.1
   foi criada), não inventar um estilo ad-hoc e seguir em frente.

### Quando o pedido for "liste/audite 100% do padrão"

O protocolo de cima é pra quando você está editando uma tela. Quando o pedido
é um **levantamento** ("liste o que está e o que não está implementado",
"audite 100%", "confere se bate com o guia"), use o
**`CHECKLIST DE AUDITORIA COMPLETA`** que fica dentro do próprio
`docs/ui_ux_guia_unificado.md` (logo após o `CHECKLIST DE APLICAÇÃO`) — ele
lista todas as seções do guia e exige veredito + evidência (`arquivo:linha`)
para cada uma, sem pular nenhuma, mesmo as que "obviamente não se aplicam".
Só é permitido declarar "100% auditado" depois dessa lista existir por
escrito na resposta.

### Por que isso existe

2026-07-07: a aba Extrato (`BankReconciliation.tsx`) foi corrigida para o padrão
do guia (KPI cards, busca persistida, ColumnConfigButton), mas os `LazySelect`
dentro das colunas Cliente/Fornecedor, Categoria, Obra e Centro de Custo
continuaram com `text-xs font-bold uppercase` — fora do padrão — porque a
verificação não olhou para dentro dos componentes das células. O usuário teve
que apontar isso pelo print. Ver `docs/ui_ux_guia_unificado.md` §7.1.

2026-07-09: pedido explícito de "listar 100% do padrão" em `ClientList.tsx` foi
respondido com uma auditoria por amostragem (focada nos problemas mais óbvios),
não seção-por-seção do índice do guia. Resultado: §6.1 e §17 ficaram de fora da
primeira lista; quando o usuário perguntou diretamente "auditou 100%?", a
resposta consertou o §17 mas ainda não recontou §6.1/§6.2 do zero — e mesmo
assim foi declarado "18/18 auditado". O usuário perdeu a confiança no relatório
de conformidade por causa disso. Ver `CHECKLIST DE AUDITORIA COMPLETA` em
`docs/ui_ux_guia_unificado.md`.

---

## REGRA OBRIGATÓRIA #2 — Projetos de sistema nunca aparecem como obra

**Gatilho:** qualquer código que liste, filtre ou conte projetos/obras.

"Gestão Comercial" é um projeto criado pelo sistema
(`services/commercialFinanceService.ts`) para pendurar as parcelas e transações
da área comercial. Ele é gravado com `classification: 'OBRA'`, então toda
consulta que pede "as obras" o traz junto — e ele aparece em tabela como se
fosse uma obra real.

**Não escreva `p.name !== 'Gestão Comercial'`.** Essa foi a defesa antiga: 28
ocorrências em 18 arquivos, e mesmo assim o bug voltava, porque **toda tela nova
nasce errada** — quem escreve não tem como adivinhar que precisa daquele filtro.

O corte agora é na origem, e é seguro por padrão:

| De onde vêm os projetos | O que fazer |
|---|---|
| `useStore().projects` | **nada** — já vem sem projetos de sistema |
| `projectService.listProjects()` | **nada** — já filtra (passe `includeSystemProjects=true` se precisar deles) |
| `supabase.from('projects')` direto | `.not('name', 'in', SYSTEM_PROJECT_NAMES_SQL)` |
| precisa DO projeto de sistema | `useStore().systemProjects` ou `isSystemProject()` |

Fonte da verdade e razão de cada decisão: **`utils/systemProjects.ts`**.

### A regra vale também na ESCRITA (não só na listagem)

A tabela acima cobre **leitura**. O mesmo projeto de sistema não pode ser
gravado como *dimensão obra* de um lançamento: **`project_id` de um projeto de
sistema é sempre `NULL`**. Parcela do comercial (Vendas/Locações) não tem obra.

Se você for gravar `project_id` (ou qualquer FK para `projects`) a partir de um
objeto de projeto, corte antes:

```ts
const projectId = isSystemProject(project) ? null : (project.id ?? null);
```

O banco também trava isso (`trg_strip_system_project_from_internal_tx`,
migration `20270819000003`), mas a trava é rede de segurança — não desculpa
para gravar errado e deixar o banco consertar.

**Verificação (exit ≠ 0 se achar comparação literal):**

```bash
bash scripts/check-system-projects.sh          # repo inteiro
bash scripts/check-system-projects.sh <arquivo>
```

### Por que isso existe

2026-07-18: a tela de seleção de obra do ÒPURA CNO foi construída lendo
`projects` do store e listou duas linhas "Gestão Comercial" como obras. Era a
enésima repetição do mesmo bug — o usuário pediu para resolver de forma
definitiva, não mais um filtro pontual. A correção foi mover o corte para o
store + `projectService`, fazer o backfill de `settings.isSystemProject`
(migration `20270718000001`) e travar o padrão antigo no script acima.

2026-07-19: o bug voltou por uma camada que a regra **não cobria** — a escrita.
`financialSyncService` gravava `project_id = project.id` sem exceção; o
comentário no código dizia "vaults org-level ficam null", mas o vault tem id
real, então o id dele ia para a coluna e toda parcela de Vendas/Locações
aparecia em Contas a Receber com Obra = "Gestão Comercial" — e como obra falsa
no Scorecard e nos alertas ("Risco de caixa: Gestão Comercial"). Nenhum filtro
de listagem resolvia: o dado já nascia errado. Daí a seção de ESCRITA acima e a
trigger no banco. Lição: ao ver este projeto num lugar novo, pergunte se é
leitura **ou escrita** antes de assumir que a regra já cobre.

---

## REGRA OBRIGATÓRIA #3 — Obra nunca vem misturada com orçamento/planejamento

**Gatilho:** qualquer código que liste, filtre, conte ou monte seletor de obras.

A tabela `projects` guarda **quatro coisas diferentes** separadas só por
`settings.classification`: `OBRA`, `ORCAMENTO`, `PLANEJAMENTO`, `DIARIO`
(+ o legado `COST_ESTIMATION`).

**Regra de produto: quando a tela fala em "obra", ela mostra SÓ `OBRA`.**
Orçamento e planejamento aparecem apenas quando a tela pede por eles
explicitamente (Engenharia › Orçamentos, Planejamento, seletor de "vincular
orçamento"). Nunca misturados num seletor genérico de obra.

**Não escreva `p.settings?.classification === 'OBRA'`.** O corte é na origem:

| De onde vêm os projetos | O que fazer |
|---|---|
| `useStore().projects` | **nada** — já é só OBRA |
| `projectService.listProjects()` | **nada** — o default é `classifications: ['OBRA']` |
| precisa de orçamento/planejamento/diário | `listProjects({ classifications: ['ORCAMENTO'] })`, ou `useStore().allProjects` + `onlyOrcamentos()` / `onlyPlanejamentos()` / `onlyDiarios()` |
| combinação (ex: obra + planejamento) | `listProjects({ classifications: ['OBRA', 'PLANEJAMENTO'] })` |
| precisa dos quatro tipos | `listProjects({ classifications: 'ALL' })` — e diga no código por quê |

⚠️ **`listProjects` recebe um OBJETO de opções, não parâmetros posicionais**
(`{ clientId, organizationId, includeOrphans, empresaId, includeSystemProjects,
classifications }`). A assinatura é objeto de propósito: `classifications` tem
default seguro e a troca obrigou o **compilador** a apontar as 30 chamadas
existentes, uma a uma. É a trava que o shell script não conseguia ser.

⚠️ **`AppRouter` passa `typedAllProjects` (lista completa) só para
`ProjectList`, `PlanningDashboard`, `DiaryDashboard`, `LaborDashboard`,
`ProjectOverview`, `ProjectDiaryManager` e `FinancialSchedule`.** Todo o resto
recebe `typedProjects` (só obras). Se uma tela nova precisa dos outros tipos,
passe `typedAllProjects` explicitamente — e diga no código por quê.

Fonte da verdade: **`utils/projectClassification.ts`**. Projeto **sem**
classificação **não** conta como obra (`TRATAR_SEM_CLASSIFICACAO_COMO_OBRA =
false`) — é a única linha que decide isso; diagnóstico do banco em
`scripts/diagnostico-classificacao-projetos.sql`.

**Verificação (exit ≠ 0 se achar comparação literal):**

```bash
bash scripts/check-project-classification.sh          # repo inteiro
bash scripts/check-project-classification.sh <arquivo>
```

### Por que isso existe

2026-07-18: a tela de seleção de obra do ÒPURA CNO listava obra, orçamento e
planejamento juntos. Não era um caso isolado — havia **dois padrões conflitantes**
(61 lugares com `=== 'OBRA'` estrito; outros com uma lista de exclusão que
deixava passar projeto sem classificação) e dezenas de telas sem filtro nenhum,
porque cada uma decidia sozinha. O usuário pediu correção definitiva, não mais
um filtro pontual.

---

## REGRA OBRIGATÓRIA #4 — Layout de interação (`UI_PATTERNS.md`)

Antes de decidir entre modal, painel lateral (`Sheet`) ou página dedicada para
qualquer nova interação, ler `UI_PATTERNS.md`. Painel lateral é o padrão para
70–80% dos casos — modal central só para interrupções críticas.

---

## REGRA OBRIGATÓRIA #5 — O seletor de organização do topo é a autoridade

**Gatilho:** qualquer código que precise saber "de qual organização" — ler,
listar, filtrar, criar, gravar.

### A regra de produto (definida pelo usuário em 2026-08-03)

1. **O seletor do topo manda.** Apontando para uma organização, o sistema usa
   ela e **não pergunta nada, nunca** — nem modal, nem seletor extra na tela.
2. Só quando o topo está em **"Todas as organizações"** o sistema pergunta.
3. Perguntado, se o usuário **mantiver "Todas"**, o item é replicado em **cada
   organização de que ele é membro** (`forEachTargetOrg`).

   ⚠️ **"Todas" nunca é `organization_id = NULL`.** O sistema é multi-tenant
   (`is_org_member` sobre `organization_members`) e a policy de leitura de
   registro global é `organization_id IS NULL OR is_org_member(...)` — um NULL
   apareceria para **todos os clientes do SaaS**, não só para as organizações
   de quem criou. `NULL` fica reservado aos seeds do sistema (ex.: as 38
   categorias financeiras padrão). Replicação parcial não é erro: a
   organização que já tem o item falha no UNIQUE e as demais seguem.
4. **Exceção:** operação que exige organização específica por natureza
   (fechamento contábil, faixa de alçada, chamado de garantia) → modo
   `'single'`, sem a opção "Todas" no modal.
5. **Empresa/obra selecionada no topo herda** a organização dona dela. O
   rótulo do topo mostra o nível mais específico (empresa → obra → org), então
   com uma empresa escolhida o usuário TEM contexto: não se pergunta.

### Como escrever (caminho único)

**`hooks/useOrgContext.tsx` é a fonte única da verdade.** Ele lê do store —
nunca de prop, porque prop é o que se deforma no caminho.

```ts
// LER: null = "Todas". NUNCA bloqueie o carregamento por causa disso.
const { orgId } = useOrgContext();
const dados = await service.list(orgId);   // service só aplica .eq() se houver org

// CRIAR:
const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
const target = await resolveWriteOrg('all-allowed');   // catálogo; ou 'single'
if (!target) return;                                   // cancelou
const { ok, failed } = await forEachTargetOrg(target, orgId =>
    service.create(orgId, dados));                     // 1 org, ou todas as do usuário
// …e renderize {orgTargetModal} no JSX.
```

Do lado do service: `organizationId?: string | null` e
`if (organizationId) q = q.eq('organization_id', organizationId)` — a RLS
recorta o resto. Modelo: `services/inventoryService.ts:112-119`.

**Quatro padrões proibidos** (o teste abaixo quebra o build):

| Padrão | Por que é bug |
|---|---|
| `organizations[0]` como org | pega a PRIMEIRA da lista, não a selecionada — grava na org errada, calado |
| `activeOrganizationId \|\| ''` | terceira sentinela; `??` não pega `''` → botão morto |
| `if (!organizationId) return` em carregamento | tela em branco em "Todas" |
| `enabled: !!organizationId` | idem |

### Verificação

```bash
npx vitest run __tests__/orgContextGuard.test.ts   # ou scripts/check-org-selector-guard.sh
```

**Roda sozinho no CI** (`.github/workflows/ci.yml`) a cada push e PR para
`main`. É uma **catraca**: o `BASELINE` no teste é a dívida herdada de
2026-08-03 e só pode diminuir. Arquivo fora do baseline com violação = código
novo = build quebrado. **Não adicione entrada ao BASELINE para "fazer
passar"** — se o seu arquivo não está lá, ele nasceu depois da regra.

### Por que isso existe

2026-07-18: 3 tabelas de "Configurações do Sistema" apareciam vazias por
`if (!activeOrganizationId) return`. Corrigido em ~15 arquivos, e criado um
shell script de verificação.

2026-08-03: **voltou de novo** — um modal pedindo organização apareceu com o
topo já mostrando um contexto. A investigação mostrou que o problema nunca foi
falta de cuidado tela a tela; eram 5 defeitos estruturais:

- **três sentinelas** para "Todas" (`null`, `undefined`, `''` — 72 passagens
  de `|| ''`), e `??` não dispara para string vazia;
- **o topo é hierárquico mas só a org era propagada**: com empresa
  selecionada, `activeOrganizationId` seguia `null` e o sistema perguntava,
  ignorando `Company.org_id` — foi essa a causa do modal indevido;
- **18 fallbacks `organizations[0]`**, incluindo `App.tsx` (criar obra nascia
  na primeira organização da lista) e formulários de pedido que ofereciam
  conta bancária de outra empresa;
- ~80 guards escondendo leitura;
- **o script de verificação nunca rodava no CI** — dependia de alguém lembrar.
  Essa é a razão real de o bug ter voltado, e por isso a trava virou teste.

---

## REGRA OBRIGATÓRIA #6 — Todo plano vive em `docs/planos/`, com o pedido original

**Gatilho:** qualquer plano de implementação — saiu do plan mode, foi pedido
("faça um plano"), ou o trabalho é grande o bastante para precisar de um.

### O que fazer

1. **Salvar em `docs/planos/AAAA-MM-DD-assunto.md`** (data do PEDIDO), versionado no
   git. Não em `~/.claude/plans/`, que fica fora do repositório e com nome ilegível.
2. **A primeira seção é `## Pedido original`**, com a mensagem do usuário
   **transcrita literalmente** — não parafraseada, não resumida. Inclua a sessão e o
   horário. Se pedidos posteriores mudarem o rumo, acrescente cada um com data.
3. **Um item por arquivo**, e cada item diz **o que muda** e **como sei que
   terminou**. Item sem critério verificável não é item de plano, é intenção — e
   intenção não pode ser marcada como concluída.
4. **O plano é vivo**: atualize o MESMO arquivo conforme o trabalho anda. Nunca crie
   um arquivo novo "que substitui" outro, nem apague decisão já registrada.
5. **Nunca declarar uma fase concluída com item em aberto.** Se sobrou item,
   reporte "Fase X: 5 de 9" — não "Fase X concluída".

Formato completo e exemplo: `docs/planos/README.md`.

### Por que isso existe

2026-08-03: o pedido foi *"Configurações do Sistema: permita criar Quando estiver
selecionado todas as organizações"*. Virou um plano em `~/.claude/plans/` com nome
gerado (`com-esse-entendimento-voce-rippling-shell.md`), que **não guardava o pedido**
— só a solução. Consequências, todas na mesma sessão:

- A Fase 3 do plano listava 9 telas de catálogo. Foram feitas 5, e a fase foi
  **reportada como concluída**. O usuário descobriu ao abrir Tipos de Empreendimento
  e encontrar o modal que o pedido original mandava eliminar.
- Quando o usuário pediu a primeira mensagem da sessão, respondi de memória, com
  confiança, sem verificar o transcript — duas vezes. E afirmei que a mensagem "veio
  cortada", o que era falso: era desculpa para a minha leitura errada.
- Ao reescrever o plano, criei arquivo novo dizendo "substitui o anterior". Pareceu
  que o trabalho tinha sido descartado.

Com o pedido literal no topo do plano, e critério de pronto por item, essas três
falhas ficam visíveis antes de virarem relatório errado.

---

## REGRA OBRIGATÓRIA #7 — Toda migration que cria policy ou função passa por duas perguntas

**Gatilho:** qualquer migration com `CREATE POLICY` ou `CREATE FUNCTION`.

A auditoria de 2026-09-01 (`docs/security-audit/`) achou 22 falhas. Os **quatro
achados críticos** — todos comprovados em produção, não inferidos — vieram de
apenas duas perguntas que ninguém fez na hora de escrever o SQL.

### Pergunta 1 — "esta perna do OR sozinha basta para liberar a linha?"

```sql
-- ❌ o que estava escrito
USING (is_org_member(organization_id) OR is_shared)
```

`OR is_shared` é verdadeiro sozinho: não diz **com quem** o registro é
compartilhado. Não era "compartilhado com o grupo" — era com todo o SaaS. São
127 cadastros (119 fornecedores, com CPF/CNPJ e endereço) legíveis por qualquer
conta autenticada. E o nome da policy de `suppliers` era *"Users can view
suppliers of their organization"* — o nome descrevia uma regra que a expressão
não implementava, e é esse descompasso que faz o defeito passar em revisão.

O caso extremo da mesma pergunta: `WITH CHECK (true)` em `organization_members`
deixava qualquer autenticado se declarar `owner` de qualquer organização. Como
`is_org_member()` e `is_org_manager()` leem essa tabela, **um único INSERT
anulava a RLS inteira** — medido: 0 → 2.214 lançamentos financeiros visíveis.

### Pergunta 2 — "quem mais pode executar esta função?"

```sql
-- ❌ o que estava escrito
CREATE FUNCTION client_portal_generate_token(...) SECURITY DEFINER ...;
GRANT EXECUTE ON FUNCTION client_portal_generate_token(uuid, uuid) TO authenticated;
```

Parece restrito a `authenticated`. Não é: **o PostgreSQL concede EXECUTE a
PUBLIC por padrão**, e `GRANT` não revoga esse default. A ACL efetiva ficava
`{=X/postgres, ..., anon=X, ...}` — o `=X` inicial é o PUBLIC. Resultado: 8 RPCs
que **emitem credencial de portal** eram chamáveis com a chave anon (que vai no
bundle), e a família de leitura do Portal do Colaborador entregava folha de
pagamento só com o UUID — mesmo `anon` não tendo `GRANT SELECT` em `employees`.

**Toda função nova leva o REVOKE junto, na mesma migration:**

```sql
REVOKE EXECUTE ON FUNCTION public.minha_funcao(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.minha_funcao(uuid) TO authenticated;
```

E, se a função é `SECURITY DEFINER`, a autorização vai **dentro** dela também —
`GRANT` é privilégio de chamada, não regra de negócio.

### Pergunta 3 — "esta Edge Function é protegida por código, ou só pelo gateway?"

Vale para `supabase/functions/`, e é a mesma pergunta 2 num outro andar.

**`verify_jwt: true` não é autorização.** O gateway do Supabase só confere que o
token é uma chave válida *do projeto* — e a chave **anon** é uma delas, publicada
no bundle do frontend. Uma function sem gate próprio, "protegida" pelo
`verify_jwt`, está aberta para qualquer um que abra o DevTools.

Foi o caso da `fiscal-nfe-processor`: nenhum gate no código, e a sonda com a
publishable key respondeu **200**. Ela aceita `body.record` e processa com
service_role — dava para injetar job forjado no pipeline de NF-e.

E o inverso também morde: **`--no-verify-jwt` transfere a autorização inteira
para o código da function.** Só é seguro depois de PROVAR, com uma requisição sem
header nenhum, que o gate está no *bundle publicado*. A `task-alert-notifier`
tinha o gate no repositório e não no deploy — com o gateway desligado, respondia
200 sem Authorization. **O arquivo local não é evidência de nada.**

```bash
# a única prova que vale, depois de todo deploy de function de cron:
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/functions/v1/<fn>" -d '{}'   # tem de dar 401
```

Chamada banco → function autentica com `CRON_SECRET` (`_shared/auth.ts` →
`chamadaDeCron`), nunca com a service_role key: a chave que ignora toda a RLS não
precisa trafegar em header a cada minuto.

### Verificação

```bash
npx vitest run __tests__/segurancaMigrations.test.ts   # roda no CI, pega o padrão antes do merge
bash scripts/check-rls-postura.sh                      # confere a postura REAL do banco remoto
```

A `check-rls-postura.sh` tem 8 verificações; as 5 a 8 nasceram deste caso e cada
uma cobre um ponto cego da anterior: **5** placeholder de segredo (no comando, no
Vault ou em GUC inexistente), **6** resposta HTTP real do `pg_net`, **7** job que
falha antes de sair do banco (invisível para a 6, porque não gera resposta HTTP),
**8** sonda HTTP com a chave pública (invisível para todas as outras, porque o
defeito não está no banco).

As duas são complementares e nenhuma substitui a outra: o teste lê o texto da
migration (o CI não tem credencial do banco, e não deve ter); o script lê o
banco, que é onde o drift mora. O teste vale para migrations a partir do prefixo
`20270918000000` — o histórico anterior já foi aplicado e não se reescreve.

### Por que isso existe

Antes da auditoria, o projeto **acertou** o desenho: RLS habilitada em toda a
base, `is_org_member`/`is_org_manager` corretas, 81 policies `anon` de
desenvolvimento removidas numa limpeza documentada. O que falhou não foi o
desenho — foi não haver trava mecânica para as duas perguntas acima, então cada
migration nova dependia de alguém lembrar. Ver `docs/planos/2026-09-02-correcao-auditoria-seguranca.md`.

---

## Outros documentos de referência do projeto

- `docs/planos/` — planos de implementação (REGRA #6); `README.md` traz o formato
- `GUIA_TABLE_UTILS.md` — `useTableColumns`/`ColumnConfigButton`/`SortableHeader`
- `RUNBOOK_DEPLOY.md` — processo de deploy
- `PLANO_MODULO_*.md` — PRDs de módulos em desenvolvimento (não implica que já
  estejam implementados — conferir estado real no código antes de assumir)
