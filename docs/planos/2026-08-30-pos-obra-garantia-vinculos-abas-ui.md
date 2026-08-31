# Pós-Obra & Garantia — vínculos (empreendimento/obra/cliente), aba Análise e padrão de UI

## Pedido original

Sessão de 2026-08-30. Mensagem do usuário, transcrita literalmente:

> Pós-Obra & Garantia
> 1.	Verifique o módulo Qualidade & Entrega, parece uma duplicação do módulo Pós-Obra & Garantia
> 2.	Criar coluna empreendimento e vincular com incorporação > empreendimento
> 3.	Cria coluna obra e vincular com a engenharia > obras
> 4.	Criar coluna cliente e vincular com minha organização > meus clientes
> 5.	Criar aba Analise e mover os kpis card. para essa página
> 6.	Aplicar o padrão ui_ux_guia_unificado.md: Aplicar toolbar de abas
> Toolbar acoplada a tabela + botão de ajuste automático de largura de colunas nas tabelas:
> 7.	Colunas ações: botão editar sempre visível
> 8.	Coluna status

### Decisões tomadas com o usuário na mesma sessão (respostas a perguntas de escopo)

| Pergunta | Resposta escolhida |
|---|---|
| Item 8 — a tabela já tem coluna "Estado" com os 10 estados; o que fazer? | **Só renomear para "Status"** |
| Item 2 — como vincular o empreendimento? | **Campo próprio** (`development_id`), selecionado no chamado, independente da obra |
| Item 4 — cliente é texto livre hoje; como vincular? | **Só seletor — cliente passa a ser obrigatório** |
| Item 5 — o que a aba Análise deve ter? | **KPIs + gráficos + recortes por empreendimento/obra** |

---

## Contexto

`components/WarrantyModule.tsx` (1470 linhas, arquivo único) é hoje uma lista plana de
chamados: 7 KPI cards no topo, uma faixa de pílulas de filtro por estado, e uma tabela de
8 colunas. Já tem toolbar acoplada, busca persistida, `useTableColumns` e autofit — falta
o que o pedido aponta:

1. **Não dá para responder "quantos chamados por empreendimento?"** — `warranty_claims`
   não tem coluna de empreendimento, e a obra só aparece como subtítulo cinza dentro da
   célula "Chamado", sem coluna própria nem ordenação.
2. **O cliente é texto livre.** A FK `client_id → clients` existe desde
   `20260708000000:48` e a RPC `open_warranty_claim` já aceita `p_client_id`, mas a tela
   **nunca manda** — grava só `client_name` digitado à mão.
3. **Os KPIs competem com a lista.** Sete cards no topo de uma tela cuja tarefa é operar
   chamados.
4. **A tela nunca recebeu a toolbar de abas** (§19.1) nem a coluna de ações do §9 — o
   botão de editar só existe dentro do modal de detalhe.

---

## Item 1 — Qualidade & Entrega: já consolidado; sobrou um resíduo

**Verificado no código, não é mais duplicação.** A consolidação aconteceu em 2026-08-26
(`docs/planos/2026-08-26-consolidar-qualidade-em-garantia.md`): `QualityModule.tsx` e
`components/quality/` foram apagados, o menu tem um item só (`Layout.tsx:937-941`), e
`AppRouter.tsx:1264-1272` mantém `case 'quality'` apenas como apelido da `activeView`
persistida na sessão.

**O resíduo real:** `components/OrganizationUsers.tsx:359-360` ainda lista **duas** linhas
de permissão — "Qualidade e Entrega" (`canViewQuality`/`canEditQuality`) e "Pós-Obra e
Garantia" (`canViewWarranty`/`canEditWarranty`). O roteador só consulta `canViewQuality`
(`AppRouter.tsx:326-327`): **`canViewWarranty` é chave órfã**, marcar ou desmarcar não
muda nada.

- **O que muda:** fundir as duas numa só, rotulada "Pós-Obra & Garantia", ligada a
  `canViewQuality`/`canEditQuality`; corrigir o rótulo de `:287` ("Qualidade & Pós-Obra"
  → "Pós-Obra & Garantia"). **Não renomear a chave** `canViewQuality` — está persistida
  nos perfis já gravados.
- **Pronto quando:** a tela de permissões mostra uma única linha para o módulo, e
  desmarcá-la some com o item do menu.

---

## Item 2 — Empreendimento

### `supabase/migrations/aplicar_20270914000011_warranty_development.sql` (novo)

PARTE 1 — coluna e índice, espelhando o que `20260708000000:47-48` já faz para
`project_id`/`client_id`:

```sql
ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS development_id UUID
    REFERENCES public.empreendimentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warranty_claims_development
  ON public.warranty_claims(development_id) WHERE development_id IS NOT NULL;
```

PARTE 2 — `open_warranty_claim` ganha `p_development_id` (13 → 14 parâmetros). Seguir a
lição de `aplicar_20270914000008`: **`DROP FUNCTION` da assinatura antiga ANTES de
recriar** — `CREATE OR REPLACE` com um parâmetro a mais cria *sobrecarga* e o PostgREST
passa a responder `PGRST203`.

> ⚠️ Aplicar por `npx supabase db query --linked -f <arquivo>`. **Nunca
> `supabase db push`** (histórico furado). Se for pelo SQL Editor do Supabase, clicar
> fora antes de executar — com trecho selecionado ele roda só a seleção, e foi assim que
> a PARTE 2 da consolidação ficou de fora em 26/08.

### Código

- `types/warranty.ts` — `development_id?: string` em `WarrantyClaim`,
  `WarrantyClaimInsert`, `OpenWarrantyClaimCommand` e `ClaimFilters`.
- `services/warrantyService.ts` — `open()` passa `p_development_id`; `list()` filtra por
  ele.
- `components/WarrantyModule.tsx` — select "Empreendimento" no modal de abertura e no
  modo edição do detalhe; coluna `development` na tabela.

**Fonte da lista:** `empreendimentoService.list(orgId)` (`services/empreendimentoService.ts:199`),
carregada **dentro do WarrantyModule** — não por prop (ver Item 6, REGRA #5).

**Não reimplementar a ponte obra↔empreendimento:**
`empreendimentoService.mapObrasToEmpreendimentos(orgId)` já resolve `projects.id →
{id, name, towerName}` pelos dois sentidos do vínculo (`empreendimentos.project_id` e
`empreendimento_towers.project_id`). Usar para **exibir** o empreendimento de chamados
antigos que têm obra e ainda não têm `development_id` — sem gravar nada.

**Markup dos selects:** copiar de `ContractModal.tsx:1623-1672` (ícone `Building2`
absoluto, `w-full pl-9 pr-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm
appearance-none`). Os selects atuais do WarrantyModule usam `rounded-xl px-3 py-2`, fora
da escala do §16 — alinhar os novos e os existentes.

**Pronto quando:** abrir um chamado escolhendo empreendimento, recarregar e ver o nome na
coluna; e um chamado antigo com obra mostrar o empreendimento derivado do mapa.

---

## Item 3 — Obra

`project_id` já existe e já é gravado; falta coluna própria.

- Nova coluna `obra` em `CLAIM_COLUMNS` / `CLAIM_COLUMN_HEADERS` / `CLAIM_COL_WIDTHS`,
  ordenável, renderizada em `renderClaimCell`.
- **Tirar a obra do subtítulo da célula "Chamado"** (`:224`) — com coluna própria, repetir
  ali é ruído.
- A lista continua vindo de `AppRouter.tsx:1274` (`typedProjects`), que por construção é
  **só `OBRA`** — REGRA #3 satisfeita na origem, sem filtro na tela.

**Pronto quando:** a coluna Obra ordena, respeita a engrenagem, e o subtítulo do Chamado
não repete o nome da obra.

---

## Item 4 — Cliente

- O `<input>` "Nome do cliente" (`:780-788`) vira `<select>` alimentado por
  `clientService.listClients(orgId)` (`services/clientService.ts:61`). **Obrigatório** —
  acrescentar à validação que já existe no submit (`:625`).
- Gravar `client_id` **e** `client_name` (snapshot): lista, detalhe e busca já leem
  `client_name`, e o snapshot preserva a leitura de chamado cujo cliente foi renomeado ou
  removido.
- Mesmo select no modo edição do detalhe (`:1163-1168`).
- Nova coluna `cliente`; tirar o cliente do subtítulo da célula "Chamado".

**Sem `NOT NULL` no banco e sem backfill.** Existem chamados antigos com `client_id` nulo
— a obrigatoriedade é de **formulário**, não de schema; um `NOT NULL` quebraria a leitura
do que já está lá.

**Pronto quando:** não é possível abrir chamado sem escolher cliente cadastrado; o
chamado novo tem `client_id` (conferir por `npx supabase db query --linked`); e um
chamado antigo sem `client_id` continua listando com o nome antigo.

---

## Item 5 — Aba Análise

Duas abas: **Chamados** (pílulas + toolbar acoplada + tabela) e **Análise**.

### Move para a Análise

Os 7 KPI cards (`:380-389`), **trocando o `KPICard` local (`:155-171`) pelo compartilhado
`components/ui/KpiCard.tsx`** — §4; o local é duplicata com `rounded-2xl`/`font-black`,
fora da escala do §16.

### Gráficos (recharts, já no `package.json`)

Todos derivados em memória, sem consulta nova:

| Gráfico | Dado |
|---|---|
| Chamados por sistema construtivo | `taxonomy.systemCode` → `taxonomyLabels.systems` |
| Top patologias recorrentes | `taxonomy.pathologyCode` |
| Origem provável | `origin` (`ORIGIN_LABELS`, `:52-59`) |
| Abertura × encerramento por mês | `created_at` / estado `ENCERRADO` |
| **Por empreendimento** e **por obra** | `development_id` / `project_id` |

Rótulo de mês por `formatMonthLabel` (`components/ui/Format.tsx`) — **nunca**
`new Date('YYYY-MM-01')`, que retrocede um mês em UTC-3.

### Refatoração que a aba exige

`load()` (`:322-339`) hoje faz **duas** consultas à mesma tabela (`list()` e `getKPIs()`)
e manda `filterState` ao **servidor**, enquanto busca e ordenação já são client-side. Com
uma aba de análise isso vira defeito: os gráficos mostrariam só o estado filtrado na
outra aba.

- `list()` passa a carregar **sem** filtro de estado; a pílula vira client-side.
- Extrair a agregação de `getKPIs()` (`services/warrantyService.ts:337-350`) para
  `computeWarrantyKPIs(rows)` em `utils/warrantyAnalytics.ts`, junto das agregações dos
  gráficos. O service delega (API pública intacta) e a tela usa direto sobre o array já
  carregado — **uma consulta em vez de duas**.
- Novo `__tests__/warrantyAnalytics.test.ts` (lógica pura, ambiente `node`).

**Pronto quando:** a aba Análise mostra os 7 KPIs e os gráficos; trocar a pílula na aba
Chamados **não** altera os números da Análise; `npx vitest run
__tests__/warrantyAnalytics.test.ts` passa.

---

## Item 6 — Padrão de UI

### Toolbar de abas — §19.1 (a implementar)

Forma canônica (`docs/ui_ux_guia_unificado.md:1480-1519`), referência
`BankReconciliation.tsx`: card branco `p-2 rounded-[10px]`, trilho interno `bg-gray-50
p-1`, abas `h-7`, ativa `bg-white text-blue-600 shadow-sm`, inativa `text-gray-700
hover:text-gray-900` (**não** `text-gray-400` — reprova WCAG AA), `flex-wrap`, nunca
`overflow-x-auto`. O `<h1>` muda com a aba (`Record<View,{title,subtitle}>`). Ritmo do
§20.1: 24px até as abas, 12px depois.

### Toolbar acoplada e autofit — §5.2 e §6.1 (**já existem**)

`:410-441` já traz busca com `usePersistedState('warranty:search')`, `ColumnConfigButton`
(engrenagem = quais colunas aparecem) e `MoveHorizontal` → `cols.autoFit()` (= largura),
com `<colgroup>` + coluna espaçadora antes de "Ações" + `cols.ResizeHandle` (`:500-524`).
**Verificar, não reimplementar.** Dois ajustes: o container usa `p-3` e o §5.2 pede
`p-2`; e as 3 colunas novas precisam entrar em `CLAIM_COL_WIDTHS`.

### REGRA #5 — de brinde, no caminho

`AppRouter.tsx:1273` passa `activeOrganizationId` **cru** e o módulo confia no prop.
Trocar por `useOrgContext()` dentro do módulo — fonte única, e é o que permite carregar
empreendimentos e clientes por conta própria sem mais props. `useOrgWriteTarget` já está
correto (`:298`), em modo `'single'` (exceção prevista para chamado de garantia).

**Pronto quando:** `bash scripts/check-ui-standard.sh components/WarrantyModule.tsx` sai
com 0 e `npx vitest run __tests__/orgContextGuard.test.ts` continua passando.

---

## Item 7 — Coluna de ações: editar sempre visível

Hoje a coluna tem só um `ChevronRight` decorativo (`:269-274`), justificado pelo §9.1. O
pedido é explícito: **editar sempre visível**.

- Trocar por `<ActionIconButton kind="edit">` + `<ActionIconButton kind="delete">` dentro
  de `<div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>`
  — §9/§9.2. Nunca `opacity-0 group-hover:opacity-100`.
- `WarrantyClaimDetail` ganha `initialEditMode?: boolean` (hoje `editMode` nasce sempre
  `false`, `:889`).
- Excluir reusa `warrantyService.delete()`, que passa pela RPC `delete_warranty_claim` e
  **confere quantas linhas apagou** — a `.delete()` direta reportava sucesso apagando
  zero (bug de 26/08). Manter `useConfirm()`, nunca `window.confirm` (§14).
- `CLAIM_COL_WIDTHS.actions`: 60 → 100.

**Pronto quando:** os dois ícones aparecem em toda linha sem hover; editar abre o detalhe
em modo edição sem disparar o clique da linha; excluir some com o chamado de verdade após
recarregar.

---

## Item 8 — Coluna status

Renomear o rótulo `'Estado'` → `'Status'` em `CLAIM_COLUMNS` (`:176`) e
`CLAIM_COLUMN_HEADERS` (`:191`).

⚠️ **Manter a `key` como `'state'`** — colunas visíveis, ordem e largura estão
persistidas em `localStorage` sob `warrantyClaimsColumns`/`warrantyClaimsColWidths`;
trocar a chave descartaria a configuração do usuário.

A pintura já está conforme o §8 (`STATE_COLORS`, `:29-40`). Nada a mudar ali.

---

## Arquivos

| Arquivo | O que muda |
|---|---|
| `supabase/migrations/aplicar_20270914000011_warranty_development.sql` | **novo** — coluna + índice + RPC com `p_development_id` (DROP antes de CREATE) |
| `components/WarrantyModule.tsx` | abas, 3 colunas novas, selects, coluna de ações, gráficos, `useOrgContext`, `KpiCard` compartilhado |
| `services/warrantyService.ts` | `development_id` no `open()`/`list()`; `getKPIs` delega à função pura |
| `types/warranty.ts` | `development_id` no claim, insert, comando e filtros |
| `utils/warrantyAnalytics.ts` | **novo** — `computeWarrantyKPIs` + agregações dos gráficos |
| `__tests__/warrantyAnalytics.test.ts` | **novo** |
| `components/OrganizationUsers.tsx` | funde as duas linhas de permissão (item 1) |

Reusados sem alteração: `components/ui/TableUtils.tsx`, `ActionIconButton.tsx`,
`KpiCard.tsx`, `Format.tsx`, `confirm.tsx`, `hooks/useOrgContext.tsx`,
`services/empreendimentoService.ts`, `services/clientService.ts`.

---

## Verificação

```bash
cd orçacloud-saas
bash scripts/check-ui-standard.sh components/WarrantyModule.tsx
bash scripts/check-project-classification.sh components/WarrantyModule.tsx
bash scripts/check-system-projects.sh components/WarrantyModule.tsx
npx vitest run __tests__/orgContextGuard.test.ts __tests__/warrantyAnalytics.test.ts
npm run ci
```

**Migration aplicada de verdade** (não confiar em "Success. No rows returned"):

```bash
npx supabase db query --linked -o table \
  "SELECT column_name FROM information_schema.columns
    WHERE table_name='warranty_claims' AND column_name='development_id'"
npx supabase db query --linked -o table \
  "SELECT proname, pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND proname='open_warranty_claim'"
```

A segunda tem de devolver **uma única linha, `pronargs = 14`**. Duas linhas =
sobrecarga = `PGRST203` — o `DROP` não rodou.

**Na tela** (`npm run dev` → Pós-Obra & Garantia), com uma organização selecionada no
topo **e** depois em "Todas as organizações" (não pode ficar em branco em "Todas"):

1. Abrir chamado com empreendimento, obra e cliente → as três colunas preenchidas.
2. Tentar abrir sem cliente → bloqueia com toast, não grava.
3. Engrenagem oculta/mostra as colunas novas; `MoveHorizontal` ajusta a largura delas;
   arrastar a borda redimensiona; recarregar preserva tudo.
4. Trocar de aba: o `<h1>` muda junto; a pílula da aba Chamados não mexe na Análise.
5. Editar pela coluna de ações abre o detalhe em edição; excluir some com o chamado
   **depois de recarregar** (não confiar no toast — foi esse o bug de 26/08).
6. Chamado antigo (sem `client_id`/`development_id`) continua listando, com o nome antigo
   e o empreendimento derivado da obra.

---

## Andamento (2026-08-30)

- [x] Item 1 — permissões fundidas numa linha em `OrganizationUsers.tsx`; rótulo do
      módulo corrigido. `canViewWarranty`/`canEditWarranty` saíram da tela.
- [x] Item 2 — `aplicar_20270914000023` **aplicada e conferida no banco**; types,
      service e UI de empreendimento
- [x] Item 3 — coluna Obra (e obra saiu do subtítulo do Chamado)
- [x] Item 4 — cliente vira seletor obrigatório, gravando `client_id` + snapshot do nome
- [x] Item 5 — aba Análise com os 7 KPIs (`KpiCard` compartilhado) + 7 gráficos;
      `utils/warrantyAnalytics.ts` + 16 testes
- [x] Item 6 — toolbar de abas §19.1, `<h1>` por aba, `useOrgContext`, toolbar `p-2`,
      escala compacta nos campos do modal
- [x] Item 7 — editar e excluir sempre visíveis na coluna de ações
- [x] Item 8 — rótulo "Status" (chave `state` preservada)

### Verificação executada

| O quê | Resultado |
|---|---|
| `npx tsc --noEmit` | limpo nos arquivos deste plano |
| `check-ui-standard.sh components/WarrantyModule.tsx` | exit 0 |
| `check-project-classification.sh` · `check-system-projects.sh` | exit 0 |
| `orgContextGuard` · `migrationsPrefixo` | passam |
| `__tests__/warrantyAnalytics.test.ts` | 16 testes |
| `__tests__/components/WarrantyModule.test.tsx` | 9 testes |
| `vite build` | ✓ |
| Coluna `development_id`, índice e FK no banco | conferidos numa execução separada |
| `open_warranty_claim` | **uma** assinatura, `pronargs = 14` — sem sobrecarga |
| Abertura com empreendimento (`BEGIN…ROLLBACK`) | gravou `development_id`; limpeza reconferida de fora |
| Empreendimento de outra organização | `P0004`, como projetado |

## Passada visual no navegador (2026-08-31)

Feita com um harness temporário (`__harness_warranty.html/.tsx`, **já apagado**)
que trocava os métodos dos três services em runtime e montava a tela em Chrome via
`playwright-core`, com `serviceWorkers: 'block'` — sem isso o PWA serve do cache.
Dispensa credencial de login, que não fica guardada.

**Achou seis defeitos que nada mecânico pegava.** Todos corrigidos e re-medidos:

| # | Defeito | Como se via | Correção |
|---|---|---|---|
| 1 | **Coluna Ações fora da tela** | tabela 1750px em container de 1550px; os botões que o §9 manda estar "sempre visíveis" só apareciam rolando | larguras refeitas, soma 1505px, com a conta registrada no código |
| 2 | Severidade **sem acento** ("Critica", "Media") | `capitalize` sobre o valor cru do banco, que é sem acento por CHECK constraint | `SEVERITY_LABELS` |
| 3 | Ordenar por severidade dava ordem **alfabética** (alta→baixa→critica→media) | `localeCompare` do valor cru | `SEVERITY_RANK` |
| 4 | KPI **truncado**: "R$ 4.…" e "FORA GARAN…" | 7 cards em `lg:grid-cols-7` dão ~200px cada | `lg:grid-cols-4` (o §4 nunca pediu 7) |
| 5 | Eixo dos gráficos folgava **até 4** com contagens de 1 | domínio automático do recharts | `domain={[0, 'dataMax']}` |
| 6 | Rodapé dos modais em **CAIXA ALTA + pílula** | `components/ui/Button.tsx:21` fixa `rounded-xl font-black uppercase tracking-widest`, a variante deprecada do §17 | botões §17 locais; o componente compartilhado **não** foi tocado (170 arquivos) |

Ajustes menores na mesma passada: rótulo de eixo quebrava em duas linhas
(`encurtar` 22→18, `width` 150→180); "Em Reparo" e o cabeçalho "Severidade"
quebravam/cortavam; `rounded-xl`/`rounded-2xl` restantes → `rounded-[10px]` (§16);
título do modal em sentence case (§21).

**Medições finais** (Chrome 1600×1000): tabela 1505px ≤ container 1550px · coluna
Ações dentro da área visível · zero `<th>` cortado · zero rótulo de eixo em duas
linhas · zero botão com `text-transform: uppercase` · zero erro de console.

## Passada com DADO REAL, logado no app (2026-08-31)

Feita com a senha do `agente-leitura@alpaconstrutora.com.br`, fornecida pelo usuário
na sessão e **não guardada** em lugar nenhum. Login pelo app em Chrome
(`playwright-core`, `serviceWorkers: 'block'`), navegando pela sidebar até
Pós-Obra & Garantia.

**Achou o defeito mais grave de todos, que o harness escondia.**

O harness renderizava a tela numa página sem sidebar: ~1550px de container. O app
real tem sidebar, e sobram **~1290px**. Eu havia dimensionado as colunas contra a
largura errada, então a tabela (1505px) estourava e a coluna de **Ações voltava a
nascer fora da área visível** — exatamente o que o item 7 pediu para não acontecer,
e que eu já havia "corrigido" uma vez contra a medida errada.

Só os cabeçalhos mínimos das 11 colunas somam ~1363px: **não cabe**, por mais que se
aperte. A saída foi marcar duas como `defaultHidden` — "Registro" (mede a qualidade
do CADASTRO, não do chamado) e "Abertura" (quem decide triagem é o SLA, que fica
visível). Ambas seguem a um clique na engrenagem. Soma das visíveis: 1280px.

> ⚠️ Quem **já usou a tela** tem colunas persistidas no `localStorage`, e
> `useTableColumns` (por desenho, corretamente) mantém visível o que já estava:
> esses usuários verão as 11 e terão rolagem lateral até esconderem duas ou usarem
> o autofit. Preferência do usuário vence o padrão novo — não foi silenciosamente
> sobrescrita.

Também corrigido nesta passada: `state` a 160px, porque "Fora de Garantia" e
"Visita Agendada" quebravam em duas linhas; e o rótulo de obra ausente nos gráficos
passou de "Obra removida" para **"Obra não acessível"** — ver o achado de dados
abaixo, que é o caso real.

**Medições finais no app real** (Chrome 1600×1000, logado): tabela 1280px ≤
container 1290px · coluna Ações dentro da área visível · zero `<th>` cortado · zero
valor de Status em duas linhas · sem rolagem lateral na página · **zero erro de
console vindo deste módulo**.

**O dado real confirmou o comportamento projetado:**

| Caso | Resultado |
|---|---|
| Chamado com obra "Bella Vista" e sem `development_id` | Empreendimento mostra **"007 - Bella Vista"** em cinza, deduzido pela obra — a ponte funciona em produção |
| Chamado migrado, com `project_id` de OUTRA organização | Empreendimento, Obra e Cliente em "—"; a tela degrada sem quebrar |
| Os 3 chamados existentes têm `client_id` nulo | Continuam listando pelo `client_name`. Confirma que **`NOT NULL` e backfill teriam quebrado a leitura** |
| RLS | O usuário de leitura vê 2 dos 3 chamados; o terceiro é de organização de que não é membro |

### Achado de DADOS, pré-existente, NÃO corrigido

O chamado `2f1ca2b5-…` ("Condição migrada do módulo Qualidade") está na organização
`926cf626-…` mas seu `project_id` aponta para a obra "Garden Cambuhy", da
organização `a2c4b292-…`. **Referência cruzada entre tenants**, deixada pelo backfill
da consolidação de 2026-08-26, que mapeou `asset_empreendimento_id → project_id` sem
conferir a organização.

Efeito hoje: a obra some da tela (a RLS a esconde), e o gráfico a rotula "Obra não
acessível". Não corrigi porque decidir entre apagar o vínculo (`project_id = NULL`)
ou reapontar para a obra certa é decisão de produto.

`open_warranty_claim` **já não repete essa classe de bug** para empreendimento: a RPC
nova valida que o `development_id` pertence à organização do chamado (`P0004`,
testado). `project_id` continua sem essa trava — pré-existente.

## Pedido posterior — coluna Unidade (2026-08-31)

> "criar coluna unidade e desimpilhar da coluna chamado"

`unidade_ref` era o subtítulo cinza empilhado sob o nome do chamado (e virava
"Sem unidade" quando vazio). Virou **coluna própria**, ordenável e ocultável, entre
Obra e Cliente — a ordem das colunas passa a contar a hierarquia física
**Empreendimento › Obra › Unidade**, com Cliente ("quem") logo depois. A célula
Chamado ficou com uma linha só.

Ordenação da Unidade usa `localeCompare(..., { numeric: true })`: sem isso "Apt 10"
viria antes de "Apt 9".

**Para abrir espaço, "Patologia" passou a `defaultHidden`** (segue a um clique na
engrenagem). Não cabia de outro jeito — ver a conta de largura acima. Foi a
candidata escolhida por ser a menos operacional: em produção **todos** os chamados
estão como "Não classificado", e recorrência de patologia é justamente o que a aba
Análise mostra melhor.

Visíveis por padrão agora: Chamado · Empreendimento · Obra · Unidade · Cliente ·
Status · Severidade · SLA · Ações — soma **1260px**.

**Verificado no app real, logado:** tabela 1260 ≤ 1290 · Ações dentro da área
visível · zero cabeçalho cortado · zero célula em duas linhas · altura das linhas
uniforme e menor (51px, contra 69/57 quando havia subtítulo empilhado) · unidade
"31" aparece na coluna nova · zero erro de console do módulo. 2075 testes passando.

## Pedido posterior — o chamado abre como TELA (2026-08-31)

> "ao clicar em um chamado, inves de abrir modal abrir página"

`WarrantyClaimDetail` era `fixed inset-0` + `bg-black/40 backdrop-blur-sm` com um
painel centralizado. Virou **troca de conteúdo in-flow**: quando há chamado
selecionado, `WarrantyModule` faz `return` antecipado e renderiza o detalhe **no
lugar** da lista. O shell (sidebar, topo) segue visível porque quem o desenha é o
`AppRouter`.

> ⚠️ **"Tela" tem significado técnico neste app** e já custou duas rodadas erradas
> numa tarefa anterior (ver `feedback_nunca_tela_cheia_para_paineis`): não é
> `fixed inset-0`, não é `Sheet`, não é modal. Os três são overlay. Padrão correto:
> `ContractDetailView.tsx` — seta voltar + `<h1 className="text-2xl font-black">`
> (2xl, porque 3xl é só topo de lista-raiz, §20), sem backdrop, scroll de página.

O que veio junto, porque a mudança de contexto exige:

- **§22 — scroll preservado.** Abrir o chamado substitui a lista, então o container
  rolável é recriado ao voltar e o navegador zera o `scrollTop`. Guarda-se a posição
  do `<main>` ao abrir e restaura-se no `requestAnimationFrame` do fechamento.
- **§25 — salvar não fecha.** Antes o `onRefresh` fazia `load(); setSelected(null)`,
  ou seja, salvar expulsava o usuário. Agora recarrega e **troca o selecionado pela
  versão fresca**, ficando na tela. Isso não é cosmético: as RPCs usam
  `expected_version` para concorrência otimista, e uma segunda ação sobre o objeto
  antigo mandaria versão obsoleta e falharia com `P0003`. Excluir continua voltando
  para a lista (`onDeleted`) — o registro não existe mais.
- **Abas do detalhe** passaram do strip com `border-b` para a forma canônica do
  §19.1 (card branco + trilho cinza, `h-7`), e ganharam rótulo por extenso
  ("Informações" no lugar de "Info").
- **Empreendimento deduzido também na tela.** A lista mostrava "007 - Bella Vista"
  derivado da obra e a tela não mostrava nada — o pai passa o rótulo já resolvido
  (`developmentLabel`), atenuado quando é dedução.
- O modal de **abrir** chamado continua modal: criar registro é interrupção, não
  navegação.

**Verificado no app real, logado:** a tabela sai do DOM ao abrir o chamado ·
`<h1>` vira o título do chamado · sidebar visível · `body` com scroll normal ·
`main` contém **zero** overlay ou backdrop (os 2 que existem na página são do shell,
`pointer-events:none`, e já estão lá antes de entrar no módulo) · a seta voltar
devolve para a lista · zero erro de console. 5 testes novos travam justamente essa
distinção tela × overlay, para ela não se perder de novo.

### Pendente

- **Chamados antigos continuam sem `client_id`** — de propósito (sem backfill, sem
  `NOT NULL`). Continuam listando pelo `client_name` que têm; ao editar um deles a
  tela avisa que o nome não está vinculado e exige escolher o cliente.
- A coluna Unidade **ainda não foi deployada** — o deploy de `30ca1b9` é anterior a ela.

### Dívida encontrada, NÃO corrigida (decisão de app inteiro)

`components/ui/Button.tsx:21` aplica `rounded-xl font-black uppercase
tracking-widest` a **todos** os botões do sistema — é o §17 deprecado, em 170
arquivos. Esta tela passou a usar botões §17 próprios, mas o resto do app continua
com o estilo antigo. Corrigir o componente é uma linha e um deploy de risco alto;
merece decisão explícita.

### Achado fora de escopo, NÃO corrigido

`triage_warranty_claim` ainda tem `EXECUTE` para `PUBLIC` (`information_schema.role_routine_grants`)
— as irmãs não têm. É `SECURITY INVOKER`, então a RLS ainda barra, mas destoa do
padrão do repo (`feedback_rpc_revoke_public_default`). Não mexi porque está fora do
que foi pedido e mudar permissão de RPC merece decisão explícita.
