# CLAUDE.md — ORÇACLOUD / ÒPURA

> Este arquivo é carregado automaticamente em toda sessão. As regras abaixo
> **substituem qualquer atalho de conveniência** — não são sugestões.

---

## REGRA OBRIGATÓRIA #1 — Padrão de UI (`docs/ui_ux_standard_guide.md`)

**Gatilho:** qualquer edição que toque tabela, KPI card, toolbar, busca, badge de
status, coluna de ações, modal de confirmação, toast, ou **qualquer célula com
campo editável inline (select/dropdown/LazySelect dentro de `<td>`)**.

Isso já foi "aplicado" mais de uma vez de forma incompleta — a auditoria parou nos
elementos estruturais (thead/cards/busca) e não desceu ao nível dos componentes
internos das células (selects inline com `font-bold text-xs uppercase`, fora do
padrão, passaram despercebidos). **Não pode se repetir.** Por isso o protocolo
abaixo não é opcional e não é "boa vontade" — é passo obrigatório do trabalho.

### Protocolo (sem pular etapa, sem exceção)

1. **Antes de editar**: ler `docs/ui_ux_standard_guide.md` inteiro (não só a seção
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
`docs/ui_ux_standard_guide.md` (logo após o `CHECKLIST DE APLICAÇÃO`) — ele
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
que apontar isso pelo print. Ver `docs/ui_ux_standard_guide.md` §7.1.

2026-07-09: pedido explícito de "listar 100% do padrão" em `ClientList.tsx` foi
respondido com uma auditoria por amostragem (focada nos problemas mais óbvios),
não seção-por-seção do índice do guia. Resultado: §6.1 e §17 ficaram de fora da
primeira lista; quando o usuário perguntou diretamente "auditou 100%?", a
resposta consertou o §17 mas ainda não recontou §6.1/§6.2 do zero — e mesmo
assim foi declarado "18/18 auditado". O usuário perdeu a confiança no relatório
de conformidade por causa disso. Ver `CHECKLIST DE AUDITORIA COMPLETA` em
`docs/ui_ux_standard_guide.md`.

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
| `projectService.listProjects()` | filtre com `onlyObras()` (o service só tira projeto de sistema) |
| precisa de orçamento/planejamento/diário | `useStore().allProjects` + `onlyOrcamentos()` / `onlyPlanejamentos()` / `onlyDiarios()` |
| combinação (ex: obra + planejamento) | `onlyClassifications(lista, 'OBRA', 'PLANEJAMENTO')` |

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

## REGRA OBRIGATÓRIA #5 — "Todas as organizações" nunca esconde uma leitura

**Gatilho:** qualquer componente que carregue dados usando
`activeOrganizationId`/`organizationId` (lista, detalhe, aba, dashboard).

Quando o seletor de organização está em **"Todas as organizações"**,
`activeOrganizationId` chega `null` (`store/useStore.ts`). O bug mais repetido
do projeto é escrever:

```ts
const load = useCallback(async () => {
    if (!activeOrganizationId) return;   // nunca chama o service
    ...
}, [activeOrganizationId]);
```

Isso já foi "corrigido" pontualmente dezenas de vezes (Settings > Categorias,
SalesModule, QualityModule, investor/OpportunitiesTab, FinancialIntelligence,
ProcessosModule, OpuraGovernanceModule, ProlaboreReconciliationPanel,
WarrantyModule, InventoryModule, brokerService...) e sempre volta em tela
nova, porque quem escreve o componente novo não tem como adivinhar que
precisa tratar esse caso.

### Regra de decisão

1. **Ler/abrir** (lista, detalhe, aba) → **NUNCA bloquear**. Ou o service
   aceita `organizationId?: string | null` e só aplica `.eq(...)` quando
   presente (deixando a RLS filtrar pelas organizações do usuário), ou a
   entidade já aberta na tela carrega a própria org — derive dela:
   `const effectiveOrgId = organizationId || entity.organization_id;`
2. **Criar do zero** (sem entidade-pai de onde tirar a org) → legítimo exigir
   org, mas com **botão `disabled` + `title` explicando**, nunca botão morto
   ou ação que silenciosamente não faz nada.
3. **Operação inerentemente por-empresa** (fechamento de período contábil,
   rateio de depreciação, organograma, faixas de alçada) → pode exigir uma
   org específica, mas com **mensagem explícita** pedindo para selecionar uma
   organização — nunca uma tela em branco ou, pior, um estado padrão
   enganoso (ex: "pronto para fechar" quando na verdade não há dado nenhum
   carregado).

**Verificação** (lista candidatos para revisão manual — não é pass/fail
automático, porque distinguir leitura de criação exige julgamento):

```bash
bash scripts/check-org-selector-guard.sh          # repo inteiro
bash scripts/check-org-selector-guard.sh <arquivo>
```

### Por que isso existe

2026-07-18: usuário reportou 3 tabelas de "Configurações do Sistema" (Tipos de
Clientes, Categorias de Fornecedores, Tipos de Contrato) aparecendo vazias.
Causa raiz: os 3 componentes tinham `if (!activeOrganizationId) return` no
carregamento — com "Todas as organizações" selecionado, a lista nunca era
buscada. Ao investigar o padrão, uma varredura no repo achou o mesmo bug (ou
variações dele) em mais de 15 arquivos adicionais — companyService,
reportScheduleService, financial_approval_config, processTemplates, DivergencesPanel,
ProlaboreReconciliationPanel, WarrantyModule (clique morto no detalhe de um
chamado), botões de ação sem `disabled`/`title` em InventoryModule. Todos
corrigidos na mesma sessão seguindo a regra de decisão acima; script de
verificação criado para tornar a auditoria mecânica daqui em diante.

---

## Outros documentos de referência do projeto

- `GUIA_TABLE_UTILS.md` — `useTableColumns`/`ColumnConfigButton`/`SortableHeader`
- `RUNBOOK_DEPLOY.md` — processo de deploy
- `PLANO_MODULO_*.md` — PRDs de módulos em desenvolvimento (não implica que já
  estejam implementados — conferir estado real no código antes de assumir)
