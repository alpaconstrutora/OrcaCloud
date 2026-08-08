# Guia Unificado de UI/UX — Telas com Tabela (OrçaCloud / ÒPURA)

> **Este documento funde e substitui:**
> - `docs/ui_ux_standard_guide.md` (as 21 seções detalhadas + os dois checklists)
> - `UI UX tabela.md` (o método de auditoria, a anatomia top-to-bottom, os
>   padrões `tabsSlot`/`chromeSlot`, o alerta do `px-6`+`border-r` e o
>   checklist de fechamento)
>
> Os dois tratavam do **mesmo assunto** (tela de lista/tabela) com sobreposição
> grande. Aqui a estrutura numerada (§1–§21) vem do guia maior, e o que era
> exclusivo do `UI UX tabela.md` está injetado na seção correspondente — sem
> duplicar. Onde os dois divergiam sobre a **fonte da verdade**, esta versão
> reconcilia (ver abaixo).
>
> ✅ **Adotado como guia oficial em 2026-07-26.** Os dois arquivos antigos foram
> removidos do repo e as referências em `CLAUDE.md` (REGRA OBRIGATÓRIA #1) e em
> `scripts/check-ui-standard.sh` apontam para cá — justamente para não recriar o
> problema de "duas fontes da verdade" que esta fusão resolve. As menções aos
> nomes antigos daqui para baixo são históricas (de onde cada trecho veio), não
> arquivos que ainda existem.

---

## FONTE DA VERDADE (reconciliada)

Referência canônica hoje: **`components/BankReconciliation.tsx`, aba Extrato
Bancário** — a composição de título → abas → KPIs → botões de escopo → toolbar
acoplada à tabela é o melhor resultado que o app produziu (padrão adotado em
2026-07-16, ordem abas/KPIs corrigida em 2026-08-02), e é o alvo que telas
novas devem copiar. Complementam como
referência de **escala compacta madura**: `components/ClientList.tsx` (já
nasceu compacta), `components/SupplierList.tsx` (F4/F5: régua desaninhada,
resize, Shift+clique, sticky header) e `components/SupplyChainOrderList.tsx`
(estrutura geral de KPI/tabela/toolbar/ações).

> Este guia contém snippets reais copiados dos componentes de referência. Ao
> aplicar o padrão numa tela, **copie os snippets e adapte apenas os dados**
> (nomes de colunas, labels, ícones). Não interprete — cole.
> ⚠️ Onde um snippet ainda mostrar a escala de radius grande (`rounded-[2.5rem]`,
> `rounded-[1.25rem]`, `py-4`) — seções 4–9, mantidas como origem histórica da
> estrutura — **use a versão compacta equivalente do §16**, não o radius
> literal. O §16 manda sobre radius/altura; as seções 4–9 mandam sobre
> estrutura/tipografia/conteúdo.

---

## COMO AUDITAR (ler antes de começar)

Esta seção existe porque aplicações reais deste guia falharam por **método de
auditoria errado**, não por falta de informação. Os erros já cometidos:

1. **Auditar o arquivo em vez da tela.** Comparar nomes de classe dentro do
   `.tsx` não detecta o que salta aos olhos no navegador. Abrir a tela de
   referência (Extrato) e a tela alvo lado a lado — **print é o veredito, não
   o texto do código**. O que passou batido numa auditoria de Contas a Pagar
   (2026-07-19) foi a ausência total de separador vertical entre colunas
   (§6/§7): invisível no diff, gritante na tela.

2. **Racionalizar divergência como exceção.** "É o padrão consolidado do app",
   "a tela irmã também faz assim" **não são justificativas** — o alvo é este
   guia, não um módulo irmão que diverge igual. Se a divergência for
   intencional, documentar aqui; senão, corrigir.

3. **Auditar um arquivo quando o padrão é de módulo.** A barra de abas costuma
   morar no componente **pai**, não na tela (ver §19.3).

4. **Auditar arquivo por arquivo quando a tela é composta (pai+filho).** No
   caso `FiscalModule` (2026-07-19, quando a ordem vigente ainda era
   `título → KPIs → abas`), cada arquivo lido isoladamente estava certo, e a
   árvore composta saiu errada: `FiscalModule` (pai: título+abas+botões) e
   `FiscalDocuments` (filho: KPIs+tabela) passavam limpo cada um por si; só
   compondo os dois dava para notar que abas+botões apareciam *antes* do KPI
   do filho — inversão da ordem que valia então. (Com a ordem atual,
   §19.3/`tabsSlot`, abas antes de KPIs é o correto — mas o risco de auditar
   arquivo isolado em tela composta continua o mesmo.) **Título e abas
   raramente bastam de uma auditoria de arquivo único quando a tela é
   composta — sempre desenhar (ou pedir print) da árvore final.** Ver §19.4.

**Sempre rodar antes de reportar concluído:**

```bash
bash scripts/check-ui-standard.sh components/SuaTela.tsx
npx tsc --noEmit -p .   # build quebra com QUALQUER erro TS
```

O script pega violações mecânicas (radius proibido, pílula de status, busca sem
`usePersistedState`, `font-bold`/`font-black`/`font-mono` dentro de `<td>`,
`confirm()` nativo). **Passar no script não substitui a comparação visual** —
ele não vê ordem de blocos nem espaçamento. Se não deu para verificar
visualmente, **dizer isso** em vez de afirmar que está aplicado.

---

## ANATOMIA DA TELA (de cima para baixo)

```
1. Título (h1 + subtítulo)
2. Toolbar de abas          (só se a tela tiver abas — ver §19; costumam vir do PAI)
3. KPI cards                (os KPIs refletem a aba ativa — por isso vêm DEPOIS das abas)
4. Toolbar de botões        (só se a tela tiver controles de escopo / ação primária — §5.3)
5. Tabela com toolbar de busca acoplada (busca + filtro avançado + filtros rápidos + colunas)
```

Espaçamento vertical (ver §20.1): **24px do título até as abas**, depois
**12px** (`mb-3`) entre cada barra de cromo (abas → KPIs → botões → toolbar da
tabela).

⚠️ **A ordem não é sugestão.** O caso mais comum de quebra é a barra de abas
aparecer *antes* do título, porque o módulo pai a desenha no topo. É violação
da anatomia mesmo que cada bloco isolado esteja estilizado certo — ver §19.3
(`tabsSlot`) e §19.4 (`chromeSlot`).

> ⚠️ Ordem invertida até 02/08/2026 (KPIs antes de abas). Corrigido porque os
> KPIs mostram números da aba ativa — exibi-los antes da barra que decide qual
> aba está ativa inverte a leitura (o dado aparece antes do controle que o
> define). Referência: `BankReconciliation.tsx`.

---

## CHECKLIST DE APLICAÇÃO

Ao aplicar o padrão numa nova tela, marque cada item:

- [ ] **IMPORTS** — `ColumnConfig`, `useTableColumns`, `ColumnConfigButton`, `SortableHeader`, `usePersistedState` de `./ui/TableUtils`
- [ ] **Cabeçalho de tela (§20)** — `space-y-6` no container raiz, `<h1>` + `<p mt-1.5>` direto (sem card/hero), grid de KPI logo em seguida
- [ ] **COLUMNS const** — array `ColumnConfig[]` definido fora do componente
- [ ] **State** — `usePersistedState` para search/filtros, `useTableColumns` para colunas
- [ ] **KPI Cards** — usar o componente `components/ui/KpiCard.tsx` (não reimplementar à mão)
- [ ] **Toolbar** — search + filtros + `ColumnConfigButton` + botões grid/lista
- [ ] **`<thead>`** — `SortableHeader` em cada coluna (exceto a de ações)
- [ ] **Redimensionamento de colunas (§6.1), se usado** — `<table>` com largura explícita (soma das colunas), NUNCA `w-full`/100%; `<col />` espaçador **antes** de "Ações" (§6.1.1); botão de auto-ajuste na régua (§6.1.2)
- [ ] **`<tbody>` TDs** — classes de fonte corretas por tipo de dado; `py-2.5` em toda `<td>` (§7.2); `px-6` + `border-r border-gray-100 last:border-r-0` em toda célula
- [ ] **Campos editáveis inline (select/dropdown/LazySelect dentro de TD)** — MESMA tipografia do TD (`text-sm font-normal`), nunca `text-xs`/`font-bold`/`uppercase`
- [ ] **StatusBadge** — `text-sm font-normal` + cor de texto. ❌ sem pílula, fundo ou uppercase
- [ ] **Coluna de Ações** — sempre visível, botão "Ver Detalhes" em texto azul + ícones secundários (`<ActionIconButton>`)
- [ ] **Loading State** — spinner centralizado, `text-center py-12`
- [ ] **Empty State** — ícone grande + título + subtítulo
- [ ] **Toast de Notificação** — fixo `bottom-6 right-6`, verde=sucesso/vermelho=erro
- [ ] **Modal de Confirmação** — usar `useConfirm()` de `./ui/confirm` (nunca `window.confirm()`/`confirm()` nativo)
- [ ] **Atualização de estado após criar/editar/excluir (§22)** — atualizar o array local em vez de recarregar a tabela inteira; se a edição substitui a lista por página cheia, preservar `scrollTop` ao voltar

---

## CHECKLIST DE AUDITORIA COMPLETA

> Este checklist é **diferente** do `CHECKLIST DE APLICAÇÃO` acima. Aquele é
> pra quando você está construindo/corrigindo uma tela. Este é pra quando o
> pedido é um **levantamento** — "liste o que está e o que não está
> implementado", "audite 100% do padrão", "confere se bate com o guia" — e a
> resposta precisa ser confiável o suficiente pra não precisar ser refeita.
>
> **Origem:** em 2026-07-09, uma auditoria de `ClientList.tsx` pediu "liste
> 100% do padrão" e foi respondida por amostragem, pulando §6.1 e §17 inteiras.
> Quando perguntado "auditou 100%?", só o §17 foi corrigido — e mesmo assim a
> resposta declarou "18/18 seções auditadas". Uma auditoria "completa" que na
> verdade é parcial é pior que nenhuma, porque é reportada com confiança de que
> é definitiva.

**Regra mecânica:** toda seção numerada deste documento entra na saída para o
usuário, **uma por uma, sem pular nenhuma**, com veredito + evidência
(`arquivo:linha`) — inclusive as que estão OK, inclusive as que "obviamente não
se aplicam" (a razão de não se aplicar também é evidência, e tem que ser
específica da tela: "é opcional" não basta; "esta tela tem só 4 colunas e
nenhuma com dado longo, então redimensionamento não agrega" basta).

- [ ] §1 Imports obrigatórios
- [ ] §2 Columns — definição das colunas
- [ ] §3 State — filtros persistidos e colunas
- [ ] §4 KPI Cards (+ §4.1 `sub` opcional, §4.2 quebra de simetria, §4.3 uppercase por `size`, §4.4 variante divisor/tendência)
- [ ] §5 Toolbar (+ §5.1 desaninhada, §5.2 acoplada à tabela, §5.3 toolbar de botões — qual das três e por quê)
- [ ] §6 Tabela — container e `<thead>`
- [ ] §6.1 Redimensionamento de colunas — decisão explícita
- [ ] §6.1.1 Coluna espaçadora ANTES de "Ações" (nas 3 listas: colgroup/thead/tbody)
- [ ] §6.1.2 Botão de auto-ajuste ao conteúdo (`autoFit`) — presente se a tela redimensiona
- [ ] §6.2 `<thead>` sentence case (❌ se ainda uppercase)
- [ ] §6.3 Toda coluna de valor único é ordenável — exceções documentadas
- [ ] §6.4 Sem dropdown de ordenação fora do `<thead>`
- [ ] §6.5 Cabeçalho fixo (sticky) — decisão explícita
- [ ] §6.6 `px-6` + separador vertical (`border-r`) em toda célula e todo cabeçalho
- [ ] §7 Tabela — `<tbody>` e TDs (tipografia por tipo de dado)
- [ ] §7.1 Campos editáveis inline dentro de TD
- [ ] §7.2 Altura da linha — `py-2.5` em toda `<td>`
- [ ] §8 Status Badge
- [ ] §8.1 Rótulo de diagrama (exceção — exige os 3 critérios)
- [ ] §9 Coluna de Ações (+ §9.1 ação dominante via clique na linha, §9.2 `<ActionIconButton>`)
- [ ] §10 Barra de ações em lote (+ §10.1 Shift+clique) — decisão explícita
- [ ] §11 Loading State
- [ ] §12 Empty State
- [ ] §13 Toast de notificação
- [ ] §14 Modal de confirmação (`useConfirm()`, nunca nativo)
- [ ] §15 Responsividade
- [ ] §16 Escala de radius — compacta é o padrão único
- [ ] §17 Botão primário — variante compacta é a única válida
- [ ] §18 Não duplicar contexto já visível no shell
- [ ] §19 Navegação de módulos (+ §19.1 abas canônicas, §19.2 árvore lateral, §19.3 `tabsSlot`, §19.4 `chromeSlot`)
- [ ] §20 Cabeçalho de tela (título + subtítulo + KPIs)
- [ ] §20.1 Ritmo de espaçamento do cromo (24px → KPIs, 12px depois)
- [ ] §20.2 Gutter do container — a raiz da tela NÃO declara `px-*`/`pt-*`; full-bleed usa `-mx-4 md:-mx-6`
- [ ] §20.2.1 Se a tela é casca própria fora do `<Layout>` (portal público/token, standalone) — repete `p-4 md:p-6` à mão, não herda
- [ ] §21 Rótulo de campo e título de modal
- [ ] §22 Atualizar estado local em vez de recarregar a tabela inteira (criar/editar/excluir) + preservar scroll ao voltar de edição em página cheia
- [ ] §23 Migalha de pão — decisão explícita (usa `ui/Breadcrumb.tsx` com 3+ níveis internos, ou "Voltar" com 1 salto, ou nada por §18)

**Critério de "auditoria completa" cumprido:** todas as linhas acima aparecem
na resposta final com veredito. Não é permitido dizer "X% do padrão auditado"
ou "conforme" antes dessa lista existir por escrito, nem reaproveitar veredito
de uma auditoria anterior na mesma conversa sem revisitar o item.

---

## 1. IMPORTS OBRIGATÓRIOS

```tsx
// TableUtils — SEMPRE importar estes para qualquer tela com tabela
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import Button from './ui/Button'; // para Modal de Confirmação
```

---

## 2. COLUMNS — Definição das Colunas

Definir **fora** do componente, no topo do arquivo:

```tsx
const COLUMNS: ColumnConfig[] = [
    { key: 'number',    label: 'Número',      sortable: true  },
    { key: 'obra',      label: 'Obra',        sortable: true  },
    { key: 'orcamento', label: 'Orçamento',   sortable: true  },
    { key: 'supplier',  label: 'Fornecedor',  sortable: true  },
    { key: 'status',    label: 'Status',      sortable: true  },
    { key: 'date',      label: 'Data',        sortable: true  },
    { key: 'value',     label: 'Valor Total', sortable: true  },
    { key: 'actions',   label: 'Ações',       sortable: false },
];
```

> ⚠️ A coluna `actions` DEVE ter `sortable: false` e key `'actions'`.

---

## 3. STATE — Filtros Persistidos e Colunas

```tsx
// usePersistedState: filtros sobrevivem a navegação e reload (salvo no localStorage)
const [searchTerm, setSearchTerm] = usePersistedState<string>('nomeTela:search', '');
const [viewMode, setViewMode]     = usePersistedState<'grid' | 'list'>('nomeTela:viewMode', 'list');
const tableColumns = useTableColumns(COLUMNS, 'nomeTelaColumns'); // chave única por tela
```

> ✅ Usar `usePersistedState` para `searchTerm` e `viewMode` — nunca `React.useState` simples para esses.

---

## 4. KPI CARDS (Dashboards)

**Não reimplemente este card à mão.** Existe um componente canônico —
`components/ui/KpiCard.tsx` — que já aplica exatamente o snippet abaixo,
incluindo as 12 cores de paleta. Toda tela nova (ou corrigida) deve importar e
usar `<KpiCard>`, não copiar o JSX.

```tsx
import { KpiCard } from './ui/KpiCard';

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
  <KpiCard
    label="LABEL DO KPI"
    value={valor}
    sub="Legenda de apoio"
    icon={<IconName className="w-5 h-5" />}
    color="blue" // blue | emerald | amber | red | purple | gray | violet | orange | indigo | rose | teal | cyan
  />
</div>
```

- Grade simétrica `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` quando os KPIs têm
  o mesmo peso. **Cada KPI com sua própria cor semântica**, nunca monocromático.
- Label sempre `UPPERCASE` no `size="md"` (default).

Snippet de referência (o que `KpiCard.tsx` renderiza — só para entender, não copiar):

```tsx
<div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg hover:border-blue-100 transition-all">
  <div className="p-3.5 bg-blue-50 text-blue-600 rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform">
    <IconName className="w-5 h-5" />
  </div>
  <div className="min-w-0">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">LABEL DO KPI</p>
    <p className="text-2xl font-bold text-gray-900">{valor}</p>
    <div className="flex items-center gap-1.5 mt-0.5">
      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"></span>
      <p className="text-xs text-gray-400 font-medium truncate">Legenda de apoio</p>
    </div>
  </div>
</div>
```

> ❌ Nunca reimplementar o card manualmente numa tela nova — foi assim que o
> valor de um KPI apareceu com `font-normal` em vez de `font-bold` em
> `ProjectFinancialManager.tsx`. Use o componente.

### 4.1 `sub` é opcional — omita quando for redundante

O prop `sub` existe para dar contexto que o `label` sozinho não dá (ex:
"Confirmados" com sub "Baseado em 12 pedidos concluídos"). Se ele só repete o
que `label`/`value` já dizem (label "Total de Fornecedores", sub "Cadastrados
na organização"), **omita**. Menos uma linha por card reduz a altura do bloco
de KPIs sem perder informação.

### 4.2 Quebra de simetria — quando um KPI é "o principal"

Quando um dos KPIs é o total do qual os outros são a decomposição (Total →
PJ/PF/Categorias, ou Total → Pendente/Aprovado/Rejeitado), não renderize todos
com largura e destaque iguais. Use `size="lg"` + `className="col-span-2"` no
principal e `size="sm"` nos demais:

```tsx
<div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
  <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de Fornecedores" value={total} icon={<Truck className="w-4 h-4" />} color="blue" />
  <KpiCard shadow={false} size="sm" label="Pessoa Jurídica" value={pj} icon={<Building2 className="w-4 h-4" />} color="indigo" />
  <KpiCard shadow={false} size="sm" label="Pessoa Física" value={pf} icon={<Users className="w-4 h-4" />} color="purple" />
  <KpiCard shadow={false} size="sm" label="Categorias" value={categorias} icon={<Tag className="w-4 h-4" />} color="amber" />
</div>
```

> ℹ️ `size` aceita `'sm' | 'md' | 'lg'` (default `'md'`). `sm`/`lg` reduzem o
> padding e usam ícone solto (sem caixa circular) inline com o label.
> ℹ️ O contraste de escala principal↔secundário é `text-3xl` (`size="lg"`) vs
> `text-lg` (`size="sm"`) — não `text-2xl` vs `text-lg`.
> ℹ️ Ícone em `sm`/`lg`: `w-4 h-4` (16px), não `w-5 h-5`.
> ℹ️ Se todos os KPIs têm o mesmo nível de importância, mantenha a grade
> simétrica da §4 — a quebra de simetria é para quando a hierarquia existe de
> fato.

### 4.3 `sm`/`lg` também tiram o `uppercase` do label — escopo por `size`

Nos tamanhos `sm`/`lg`, o label sai de `uppercase tracking-wider` para sentence
case (o `md`, usado no resto do sistema, mantém uppercase). O componente decide
isso sozinho por `size`. Além disso, o espaçamento vertical usa `leading-none`
+ `mb-1.5` fixo em vez do `line-height` padrão do navegador — é essa folga de
`line-height` que normalmente infla a altura "vazia" abaixo do número.

### 4.4 Variante — divisor pontilhado + indicador de tendência (proposta, não implementada)

Inspirado num dashboard externo (FlowAI): separa o valor grande da legenda com
uma linha pontilhada fina, e troca o `sub` neutro por um indicador de tendência
colorido (↑ verde / ↓ vermelho) + texto. **Ainda não implementado** em
`KpiCard.tsx` — registrado aqui como variante proposta.

```tsx
{/* Estrutura de referência — NÃO é o KpiCard.tsx atual, é proposta de evolução */}
<div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100">
  <div className="flex items-center gap-2 mb-3">
    <div className="p-1.5 bg-gray-50 rounded-full"><IconName className="w-4 h-4 text-gray-500" /></div>
    <p className="text-sm text-gray-500 font-medium">Total Runs</p>
  </div>
  <p className="text-3xl font-bold text-gray-900">12,847</p>
  <div className="border-t border-dashed border-gray-200 my-3" />
  <div className="flex items-center gap-1.5">
    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> {/* TrendingDown + text-red-500 quando negativo */}
    <p className="text-xs text-gray-400 font-medium">+12% from last week</p>
  </div>
</div>
```

- **Vale considerar importar:** o divisor pontilhado (reforça hierarquia
  valor↔legenda) e o ícone de tendência colorido.
- **Não copiar:** ícone genérico igual em todos os cards e ausência de cor por
  métrica (monocromático) — o sistema de `color` por KPI (§4) já é padrão
  validado.
- Enquanto não for implementado no componente, **não** reproduzir manualmente
  numa tela — isso reintroduziria o problema que o componente único resolve.
  Primeiro atualizar `KpiCard.tsx` (ex: prop `trend?: { value: string;
  direction: 'up' | 'down' }` e `divider?: boolean`), depois usar em telas novas.

---

## 5. TOOLBAR (Barra de Pesquisa e Controles)

Copiar integralmente e substituir apenas os filtros específicos:

```tsx
<div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">

  {/* Search Input */}
  <div className="flex-1 relative w-full">
    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input
      type="text"
      placeholder="Buscar por número ou fornecedor..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
    />
  </div>

  {/* Filtros Rápidos (Toggle) + Botão Refresh */}
  <div className="flex items-center gap-2">
    <button
      onClick={() => setFiltroAtivo(f => f === 'ativo' ? 'all' : 'ativo')}
      className={`flex items-center gap-2 px-4 py-4 rounded-[1.25rem] transition-all active:scale-95 shadow-sm text-sm font-semibold uppercase tracking-wider whitespace-nowrap ${
        filtroAtivo === 'ativo' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white'
      }`}
    >
      <IconFiltro className="w-4 h-4" />
      Label Filtro
    </button>
    <button onClick={loadData} className="p-4 bg-blue-50 text-blue-600 rounded-[1.25rem] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm">
      <Filter className="w-4 h-4" />
    </button>
  </div>

  {/* Agrupador ViewMode + ColumnConfig */}
  <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm gap-1.5 shrink-0">
    <ColumnConfigButton
      columns={COLUMNS.filter(c => c.key !== 'actions')}
      visibleColumns={tableColumns.visibleColumns}
      showColumnConfig={tableColumns.showColumnConfig}
      onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
      onToggleColumn={tableColumns.toggleColumn}
      onReset={tableColumns.resetColumns}
    />
    <div className="w-px bg-gray-200 mx-1 my-1"></div>
    <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Visualização em Grade">
      <LayoutDashboard className="w-5 h-5" />
    </button>
    <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`} title="Visualização em Lista">
      <Table2 className="w-5 h-5" />
    </button>
  </div>
</div>
```

> ℹ️ Se a tela **não tem** modo grid/lista, omitir os dois botões de viewMode e
> deixar só o `ColumnConfigButton`.
> ✅ O botão ativo do toggle grid/lista usa só `bg-blue-600 text-white` — sem
> `shadow-lg shadow-blue-200`. A cor sólida já basta.

> ⚠️ **Este é o snippet histórico (escala grande).** Em tela nova, use a escala
> compacta do §16 — na prática isso significa preferir a variante §5.1
> (desaninhada) ou §5.2 (acoplada), ambas já compactas.

### 5.1 Variante desaninhada (sem card externo)

O snippet acima envolve a busca num card branco que por sua vez contém um
`<input>` com sua própria borda — duas molduras concêntricas. Em telas onde a
página já tem respiro (ex: logo abaixo de KPI cards), prefira a variante sem
card externo: a barra vira uma régua de controles direto sobre o fundo, mais
baixa e leve. Extraído de `components/SupplierList.tsx` (F5).

```tsx
{/* Sem card externo — controles direto sobre o fundo, todos com h-9 (36px) */}
<div className="flex flex-col md:flex-row gap-2.5 items-center">
  <div className="flex-1 relative w-full">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input
      type="text"
      placeholder="Buscar por nome, categoria, e-mail ou documento..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
    />
  </div>

  {/* Refresh — h-9 quadrado, ícone RefreshCw (não Filter/funil, para não colidir com "Filtro avançado") */}
  <button onClick={loadData} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95">
    <RefreshCw className="w-4 h-4" />
  </button>

  {/* Separador entre grupo "filtrar" e grupo "visualizar" — só nesta variante */}
  <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

  {/* ColumnConfig + Autofit + ViewMode: h-9 e radius 10px */}
  <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
    <ColumnConfigButton /* ...mesmas props da §5... */ />

    {/* Ajustar largura ao conteúdo — só quando a tela usa useResizableColumns (§6.1).
        Fica junto do ColumnConfigButton: os dois são "configurar as colunas".
        Ícone MoveHorizontal, neutro (não é toggle, não fica azul/ativo). */}
    <button
      onClick={() => cols.autoFit()}
      className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
      title="Ajustar largura das colunas ao conteúdo"
    >
      <MoveHorizontal className="w-4 h-4" />
    </button>

    <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
    <button className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
      <LayoutDashboard className="w-4 h-4" />
    </button>
    <button className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}>
      <Table2 className="w-4 h-4" />
    </button>
  </div>
</div>
```

> ✅ Escolha **uma das três variantes** por tela (§5 / §5.1 / §5.2) — não misture.
> ❌ Não empilhar as duas bordas (input com borda dentro de container com borda).
> ℹ️ Esta variante usa a escala compacta (§16): `10px` em containers, `6px` em
> inputs/botões.
> ℹ️ O botão de autofit fica **dentro do bloco `viewMode === 'list'`**, junto do
> `ColumnConfigButton` — em modo grade não há coluna para ajustar. Mecânica e
> regras de uso: §6.1.

### 5.2 Variante acoplada à tabela (toolbar + conteúdo em um único card)

A toolbar e a tabela/grid abaixo dividem **um único** container —
`border`/`rounded`/`shadow`/`overflow-hidden` só no pai, e a toolbar interna
sem moldura própria. A única linha visível entre os blocos é o `border-b` da
toolbar. Extraído de `components/OpuraDocsModule.tsx` e `components/BoletoManager.tsx`.

```tsx
<div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
  <div className="p-4 border-b border-gray-100 bg-white space-y-3">
    <div className="flex flex-col md:flex-row gap-2.5 items-center">
      {/* ...busca, filtros, ColumnConfigButton, toggle grid/lista — conteúdo do §5.1... */}
    </div>
    {showFiltros && (
      <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-4 space-y-4">
        {/* painel de filtros avançados */}
      </div>
    )}
  </div>

  {/* Conteúdo — SEM bg/border/rounded/shadow próprios (o card pai já supre) */}
  {loading ? (
    <div className="text-center py-12">{/* ... */}</div>
  ) : filtered.length === 0 ? (
    <div className="text-center py-12">{/* empty state */}</div>
  ) : viewMode === 'grid' ? (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">{/* cards */}</div>
  ) : (
    <div className="overflow-auto max-h-[70vh]">
      <table className="w-full text-left border-collapse">{/* ... */}</table>
    </div>
  )}
</div>
```

> ✅ Use quando a tela quer que toolbar e tabela **leiam como um só bloco**.
> ✅ O banner de erro (`{error && (...)}`) fica **fora** do card acoplado, antes
> dele — dentro ele quebra a costura do `border-b`.
> ❌ Não deixe a tabela/empty state com sua própria `bg-white rounded-[10px]
> border shadow-sm` dentro do card acoplado — duplica a moldura.

### 5.3 Toolbar de botões (controles de escopo, separada da busca)

**Referência canônica: `components/BankReconciliation.tsx`, aba Extrato.** São
os controles que definem **qual conjunto de dados a tela está olhando** (conta,
competência, período) mais a **ação primária** (§17). Barra própria, acima da
toolbar de busca, porque muda o escopo — não o recorte.

```tsx
<div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
  <div className="flex flex-wrap items-center gap-2">
    <select className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer">
      {/* ...conta, competência, período... */}
    </select>
    <input type="date" className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium" />
  </div>

  {/* Ação primária — §17, variante compacta */}
  <button className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0">
    <Upload className="w-[15px] h-[15px]" />
    Importar extrato
  </button>
</div>
```

> ✅ `justify-between`: escopo à esquerda, ação primária à direita. Quando a
> tela tem toolbar de botões, a ação primária mora **aqui**, não solta ao lado
> do `<h1>`.
> ✅ Todo controle em `h-9` + `rounded-[6px]`, para as três barras empilhadas
> lerem como uma escada regular.
> ❌ Não fundir escopo com busca na mesma barra ("qual conta/mês?" vs "qual
> linha?"). Se a tela não tem controles de escopo (a maioria dos CRUDs —
> Fornecedores, Clientes), ela simplesmente não tem esta barra: vai direto de
> KPIs para a toolbar de busca.

---

## 6. TABELA — Container e `<thead>`

```tsx
<div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
  <table className="w-full text-left border-collapse">

    <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
      <tr>
        {/* Checkbox (só se houver ações em lote) */}
        <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
            checked={allVisibleSelected} disabled={selectableVisible.length === 0} onChange={toggleAllVisible} />
        </th>

        {tableColumns.visibleColumns.includes('number') && (
          <SortableHeader colKey="number" label="Número"
            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
            onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
        )}
        {/* ... demais colunas seguem o mesmo padrão ... */}

        {/* Coluna de Ações — sempre a última, sem SortableHeader.
            ⚠️ precisa repetir manualmente `text-table-header font-semibold` — ver aviso abaixo. */}
        {tableColumns.visibleColumns.includes('actions') && (
          <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-400 uppercase tracking-wider">Ações</th>
        )}
      </tr>
    </thead>
```

> ⚠️ **A coluna "Ações" fica menor que as outras se você esquecer o
> `text-table-header font-semibold`.** `SortableHeader` aplica `text-table-header`
> (14px, igual ao `text-sm` do corpo) em toda coluna que passa por ele — mas
> "Ações" é um `<th>` cru, então sem essa classe herda o `text-xs` (12px) do
> `<thead>` pai. Diferença de 2px quase imperceptível em CAIXA ALTA, mas visível
> em sentence case (§6.2). Cor/case acompanha a variante: `text-gray-400
> uppercase tracking-wider` no padrão, `text-gray-500` na variante sentence case.
>
> 🔴 **Causa raiz mais profunda (corrigida em `index.css`, 2026-07-10):** o
> Tailwind v4 só reconhece o namespace `--text-*` para gerar classes
> `text-{nome}`. O `@theme` declarava `--font-size-table-header` etc., então
> `text-table-header`, `text-table-body`, `text-button`, `text-form-label`,
> `text-form-input`, `text-tooltip`, `text-modal-body`, `text-card-body` e
> `text-menu` eram classes **inertes** em ~285 arquivos. Corrigido renomeando
> as 9 variáveis para `--text-*`. Se ainda parecer com tamanho errado depois
> disso, é a classe de tamanho escolhida (ex: `text-xs` onde deveria ser
> `text-sm`), caso normal de tipografia (§7).

## 6.1 REDIMENSIONAMENTO DE COLUNAS (opcional)

Use o hook `useResizableColumns` (também em `./ui/TableUtils`) — arrastar a
borda direita do cabeçalho redimensiona; duplo clique restaura. Larguras
persistidas em localStorage por tela. Extraído de `BankReconciliation.tsx`.

```tsx
import { useResizableColumns } from './ui/TableUtils';

const DEFAULT_COL_WIDTHS: Record<string, number> = { nome: 220, categoria: 140, obra: 140, data: 100, valor: 130 };
const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'minhaTelaColWidths');

// ⚠️ NÃO uses w-full/100% no <table>. A largura é a SOMA exata das colunas visíveis.
const tableTotalWidth = 40 // checkbox
  + COLUMNS.filter(c => c.key !== 'actions')
      .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0)
  + cols.getWidth('actions');

<table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth }}>
  <colgroup>
    <col style={{ width: '40px' }} /> {/* checkbox */}
    {COLUMNS.filter(c => c.key !== 'actions').map(c => (
      tableColumns.visibleColumns.includes(c.key) && (
        <col key={c.key} data-col-key={c.key} style={{ width: `${cols.getWidth(c.key)}px` }} />
      )
    ))}
    {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
  </colgroup>
  <thead>
    <tr>
      <SortableHeader colKey="nome" label="Nome" sortColumn={...} sortDirection={...} onSort={...} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
        <cols.ResizeHandle colKey="nome" />
      </SortableHeader>
    </tr>
  </thead>
```

> ✅ `table-layout: fixed` é obrigatório para o `<colgroup>` controlar a largura.
> ✅ `SortableHeader` precisa de `overflow-hidden` quando tem `ResizeHandle` filho.
> ⚠️ Ao adotar, aplique em **todas as colunas de dado** — resize parcial é
> inconsistência visível. Checkbox é a única exceção.
> ⚠️ **`<table>` NUNCA com `w-full`/`width: 100%` quando usa
> `useResizableColumns`.** Bug real em `SupplierList.tsx` (2026-07-11): com
> `table-layout: fixed` + tabela em 100%, se a soma das colunas é menor que o
> container, o navegador **redistribui o espaço sobrando** — mesmo com `width`
> em px explícito no `<col>`. Sintoma: arrastar uma borda redimensiona a vizinha
> errada. Correção: `width` explícito igual à soma exata (`tableTotalWidth`,
> recalculado a cada resize/toggle). Exige também um `<col data-col-key>` para
> **cada** `<th>`/`<td>`, na mesma ordem — um `<col>` faltando desalinha todas
> as colunas seguintes.

#### 6.1.1 Coluna espaçadora vem ANTES de "Ações"

Quando a soma das colunas é menor que o container, a folga precisa ir para
algum lugar. Esse lugar é um `<col />` sem largura — mas a **posição** dele no
`<colgroup>` decide se a tabela fica alinhada ou não:

```tsx
<colgroup>
  {/* ...colunas de dado... */}
  <col />                                {/* espaçador: absorve a folga AQUI */}
  <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
</colgroup>
```

Com o espaçador **depois** de "Ações", toda a sobra vai para a direita dela — e
como essa sobra encolhe e cresce a cada arraste, a borda de "Ações" **anda** e
desalinha da toolbar acoplada acima. Com o espaçador antes, a folga é absorvida
no meio e "Ações" fica ancorada na borda direita.

> ⚠️ O espaçador entra nas **três** listas na mesma posição: `<col />` no
> colgroup, `<th aria-hidden="true" className="border-r border-gray-100" />` no
> thead e `<td aria-hidden="true"></td>` no tbody. Faltar em uma desalinha tudo
> daí para frente.
> ❌ **Não resolva isso com `sticky right-0` na coluna de Ações** — foi a
> primeira tentativa (2026-07-25) e não funciona: `position: sticky` só desloca
> o elemento quando ele *sairia da área visível*. Se a tabela é mais estreita
> que o container — exatamente o caso em que sobra folga — a coluna já está
> visível e o sticky vira código morto.
> ⚠️ Feche `<td aria-hidden>` com `</td>`. A tag self-closing (`<td … />`)
> quebra o parser do `check-ui-standard.sh`, que passa a tratar o resto do
> arquivo como se estivesse dentro de um `<td>` e cospe falso positivo de §7 em
> todo `font-bold` abaixo dela.

#### 6.1.2 Auto-ajuste da largura ao conteúdo (`autoFit`)

Larguras fixas em `DEFAULT_COL_WIDTHS` são chutes que não conhecem o dado real:
a mesma coluna que quebra em duas linhas numa organização sobra espaço em
outra. `cols.autoFit()` mede o conteúdo, ajusta cada coluna e distribui a folga
restante até a tabela preencher o container. Botão na régua de controles: §5.1.

```tsx
const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'minhaTelaColWidths');
cols.autoFit();                                   // padrão: 150 linhas, preenche o container
cols.autoFit({ sampleRows: 300, fill: false });   // só ajusta ao conteúdo, sem esticar
```

> ✅ **Sob comando explícito, nunca automático.** Recalcular a cada mudança de
> dado faz as colunas dançarem enquanto o usuário digita na busca — pior que a
> largura errada, porque tira a referência visual de onde cada coluna está. É a
> razão de Excel/Sheets só fazerem autofit sob gesto.
> ✅ **Não sequestre o duplo clique** no divisor: ele já significa "restaurar
> largura padrão". Autofit é botão próprio.
> ℹ️ A medição clona a tabela fora da tela com `table-layout: auto` e deixa o
> **navegador** calcular. Pega de graça o que medir texto erraria — avatar,
> ícones, célula de duas linhas, padding real — sem a tela declarar nada por
> coluna. Amostra limitada (150 linhas) porque nenhuma dessas tabelas usa
> virtualização.
> ⚠️ Colunas estruturais sem `data-col-key` mas com largura fixa (o checkbox de
> 40px de `SupplierList`) são descontadas do container — ignorá-las fazia a
> soma estourar nesses 40px e criar scroll lateral.
> ℹ️ Em uso: `ClientList.tsx`, `SupplierList.tsx`, `InvestorList.tsx`.
> `BankReconciliation.tsx` usa o hook mas ainda **não** tem o botão.

### 6.2 `<thead>` sentence case (padrão único, consequência do §16)

Desde que o §16 fechou a escala compacta como padrão único, toda tela usa
`<thead>` em sentence case. O `<thead>` `uppercase text-xs tracking-wider` da §6
é o padrão **antigo**, deprecado — só aparece hoje em telas não migradas.
`SupplierList.tsx`/`ClientList.tsx` já seguem; `InvestorList.tsx` ficou pra trás
numa correção (migrou a escala mas manteve `uppercase`).

> ⚠️ **`SortableHeader` força `uppercase tracking-wider` internamente** — trocar
> só a classe do `<tr>`/`<thead>` não muda nada nas colunas ordenáveis. Use o
> prop `uppercase={false}`:
>
> ```tsx
> <SortableHeader label="Fornecedor" colKey="name" uppercase={false} ... />
> ```
>
> **Exceção — siglas ficam maiúsculas mesmo em sentence case:** `ID`, `CNPJ`,
> `CPF`, `CNO`, `INSS`, `NF-e`, `XML`. `uppercase={false}` só normaliza
> `text-transform`/`tracking` — o texto do `label` já deve estar escrito como
> quer aparecer (`label="CNPJ"` sai `CNPJ`, `label="Fornecedor"` sai
> `Fornecedor`, nunca `FORNECEDOR`).

```tsx
<tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
```

### 6.3 Toda coluna de valor único é ordenável

Se a coluna representa **um único valor comparável** (texto, número, data,
dinheiro), ela é `sortable: true`. A exceção tem que ser justificada, não
omissão.

> ✅ Exceção legítima: colunas **compostas** (ex: "Contato" = e-mail + telefone
> na mesma célula). Documente com comentário no `COLUMNS`:
> ```tsx
> // Contato = e-mail + telefone combinados — sem valor único óbvio pra ordenar.
> { key: 'contact', label: 'Contato', sortable: false },
> ```
> ❌ Não é exceção: "raramente é usada pra ordenar", "dava mais trabalho".
> ❌ **Também não é exceção:** "é tela secundária/fallback/consolidada" — foi
> essa desculpa que deixou passar `OrganizationUsers.tsx` e a tabela "Todos os
> Usuários" de `OrganizationList.tsx` sem ordenação. O critério é sobre o
> **dado**, não sobre a importância da tela.
> ℹ️ A coluna `actions` nunca é ordenável — é estrutural, não exceção.

### 6.4 Sem dropdown de ordenação fora do `<thead>`

Se toda coluna relevante já ordena pelo cabeçalho (§6.3), não crie um `<select>`
de "Ordenar por" na toolbar. Se a tela tinha um `sortBy` com fallback
(`'name-asc'`), mova para dentro do `.sort()` como default quando nenhuma coluna
estiver selecionada:

```tsx
return result.sort((a, b) => {
  if (tableColumns.sortColumn) { /* ...ordena pela coluna clicada... */ }
  return a.name.localeCompare(b.name); // default sem seleção: nome A-Z
});
```

> ❌ Não confundir com o "Filtro Rápido" da §5 — aquilo é filtro (reduz o
> conjunto), isto é ordenação (reordena o mesmo conjunto).

### 6.5 Cabeçalho fixo (sticky) em tabelas longas

Se a tabela pode crescer além da altura de tela, o container ganha rolagem
vertical própria e o `<thead>` fica fixo no topo dessa área.

```tsx
<div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
  <div className="overflow-auto max-h-[70vh]">
    <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth }}>
      <colgroup>{/* ... */}</colgroup>
      <thead>
        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
          {/* ... */}
        </tr>
      </thead>
      <tbody>{/* ... */}</tbody>
    </table>
  </div>
</div>
```

> ✅ `sticky top-0 z-10` vai no `<tr>` do `<thead>`, com `bg-*` **opaco**
> (`bg-gray-50`), senão as linhas aparecem "por trás" ao rolar.
> ℹ️ `max-h-[70vh]` é ponto de partida — ajuste conforme KPIs/toolbar acima.

### 6.6 `px-6` + separador vertical (`border-r`) em toda célula e cabeçalho

> 🔴 **É a diferença mais visível entre uma tabela no padrão e uma fora dele, e
> a mais fácil de não enxergar lendo o diff.**
>
> - `<th>`: `px-6 py-2 border-r border-gray-100` (a última, "Ações", sem borda)
> - `<td>`: `px-6 py-2.5 border-r border-gray-100 last:border-r-0`
>
> Tabela com `px-4` e sem `border-r` **parece idêntica no código** e
> completamente diferente na tela. Conferir contra `BankReconciliation.tsx`. Em
> Contas a Pagar (2026-07-19) isso passou batido numa auditoria inteira e o
> usuário reportou "não foi aplicado nada" — com razão. Este item é o motivo
> nº 1 de "auditei o arquivo, não a tela" (ver COMO AUDITAR, erro 1).

---

### 6.7 Paginação — rodapé da tabela

Tabela que pode passar de algumas centenas de linhas tem rodapé de paginação.
Referência: `BankReconciliation.tsx`, aba Extrato.

**Regras:**

- **Nunca `.limit(N)` fixo na consulta.** O PostgREST corta em 1000 linhas por
  requisição; um `.limit()` no service vira teto silencioso e a tela some com
  dado sem avisar ninguém. Buscar o recorte inteiro paginando com `.range()`
  até a página vir incompleta; paginar depois, em memória, na renderização.
  Se paginar **no servidor**, então a contagem tem que vir de `count: 'exact'` —
  nunca do tamanho do array recebido.
- Ordenação da consulta paginada precisa de **desempate determinístico**
  (ex.: `.order('transaction_date').order('id')`). Só o campo visível empata e
  o Postgres não garante ordem estável entre páginas: linhas repetem ou somem.
- Rodapé: `flex items-center justify-between gap-4 px-6 py-3 border-t
  border-gray-100 text-sm text-gray-500`.
  - Esquerda: `"1–100 de 4.312"` + `<select>` de tamanho de página
    (50 / 100 / 200 / 500).
  - Direita: `Anterior` · `Página X de Y` · `Próxima`, botões
    `h-8 px-3 rounded-[6px] border border-gray-200 bg-white` com
    `disabled:opacity-40 disabled:cursor-not-allowed` nos extremos.
- **Tamanho da página persiste** (`usePersistedState`), **página atual não** —
  qualquer mudança de recorte (busca, filtro, período, conta) volta para a 1.
- "Selecionar todos" do `<thead>` marca **só a página visível**. Marcar linha
  que o usuário não está vendo é armadilha em ação de lote.
- Shift+clique (§10.1) recorta sobre a **lista inteira filtrada**, não sobre a
  página — passar o índice global (`pageStart + i`), não o índice da página.

### 6.8 Ícone de ordenação sempre visível, não só na coluna ativa

Toda coluna `sortable` mostra um ícone de ordenação no cabeçalho **o tempo
todo** — não só depois de clicada. Coluna inativa: `ChevronsUpDown`
(neutro, indica os dois sentidos) em `text-gray-300`, clareando para
`text-gray-400` no hover. Coluna ativa: `ChevronUp`/`ChevronDown` (direção
real) em `text-blue-600`, como já era.

Automático: é comportamento do próprio `SortableHeader` (`ui/TableUtils.tsx`),
não algo que cada tela precisa montar — quem já usa o componente ganhou o
ícone sem alterar nada. Existe porque, sem ele, nada no cabeçalho indica que
uma coluna que ainda não foi clicada é clicável — o cursor `pointer` sozinho
não é uma affordance visível o bastante.

---

## 7. TABELA — `<tbody>` e TDs

### Linha (`<tr>`)

```tsx
<tbody className="divide-y divide-gray-200">
  {filteredItems.map(item => (
    <tr
      key={item.id}
      className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${selectedIds.has(item.id) ? 'bg-blue-50/60' : ''}`}
      onClick={() => onViewDetails(item.id)}
    >
```

### Tipos de TD por Dado

| Tipo de dado | Classe |
|---|---|
| Texto padrão (nome, descrição, obra) | `text-sm font-normal text-gray-700` |
| Texto atenuado (data, contagem, número) | `text-sm font-normal text-gray-600` |
| Link / item relacionado | `text-sm font-normal text-blue-600` |
| Valor financeiro (único caso com `font-medium`) | `text-sm font-medium text-gray-800` |
| Select/LazySelect inline dentro de `<td>` | `text-sm font-normal` — mesma tipografia da célula de texto |
| Status | texto colorido simples `text-sm font-normal` + cor — sem pílula/fundo/uppercase |

```tsx
{/* Texto básico */}
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{item.nome}</td>
{/* Texto atenuado */}
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{item.number}</td>
{/* Link / Item relacionado */}
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-blue-600">{item.orcamento}</td>
{/* Valor financeiro — ÚNICO caso com font-medium */}
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800">{formatMoney(item.value)}</td>
```

> ❌ **NUNCA usar `font-mono`, `font-bold` ou `font-black` em TDs de dados comuns.**
> ✅ `font-medium` SOMENTE para valores financeiros.

### 7.1 Campos editáveis inline dentro de TD (select / dropdown / LazySelect)

Quando a célula é um campo editável, a regra de tipografia é **a mesma do TD de
texto comum**. Ser interativo não é motivo para `text-xs`, `font-bold` ou
`uppercase` — isso quebra a leitura horizontal da linha.

```tsx
<select
  className={`text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer ${
    value ? 'text-gray-900 bg-gray-50 border-gray-100' : 'text-gray-400 bg-white border-dashed border-gray-200'
  }`}
  ...
/>
```

> ✅ Pode variar `bg-*`/`border-*` para indicar estado preenchido vs. vazio (funcional).
> ❌ **NUNCA** `text-xs`, `font-bold`, `font-black` ou `uppercase tracking-wider`
> num campo editável dentro de TD, mesmo que pareça um "chip". Para badge visual
> de verdade, use §8.

### 7.2 Altura da linha — padding vertical padrão

Todo `<td>` de dado usa `py-2.5` (10px), inclusive a célula de checkbox. Não é
"escolha por tela": é o mesmo valor em toda tabela do sistema. Achado real
(2026-07-11): `SupplierList.tsx` estava em `py-4`, sobra de antes de migrar pra
escala compacta, deixando a linha visivelmente diferente de Clientes/Investidores
no mesmo módulo.

```tsx
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">...</td>
```

> ℹ️ A altura final da `<tr>` ainda varia por conteúdo (avatar, duas linhas
> empilhadas) — a régua é sobre o **padding**, não trava altura fixa em px.
> ❌ Não é exceção "esta tabela é mais densa"/"tem menos colunas" — se houver
> motivo real, documente aqui como seção própria antes de aplicar.

---

## 8. STATUS BADGE

**Texto simples colorido — sem pílula, sem fundo, sem uppercase.**

```tsx
const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
        'Confirmado': 'text-gray-800', 'Separação': 'text-blue-700', 'Em Trânsito': 'text-indigo-800',
        'Entregue': 'text-amber-800', 'Recebido': 'text-green-800', 'Divergência': 'text-red-600',
        'Rascunho': 'text-gray-600', 'Enviado': 'text-blue-600', 'Cancelado': 'text-red-600',
    };
    return <span className={`text-sm font-normal ${colors[status] || 'text-gray-600'}`}>{status}</span>;
};
```

> ❌ **NUNCA usar** `rounded-full`, `uppercase`, `font-black`, `bg-*` ou `px-2 py-1` no StatusBadge.
> ✅ Apenas `text-sm font-normal` + cor de texto.

### 8.1 Rótulo de diagrama não é status badge (exceção)

O §8 governa **status de registro**. Um **rótulo de diagrama** é legenda de
eixo/face dentro de um desenho técnico (planta baixa, matriz de torres) — não
descreve o estado de nenhum registro, descreve **posição no espaço do desenho** —
e não vive em `<td>` nem em card. Aí a pílula separa a legenda do conteúdo
desenhado.

```tsx
{/* ✅ Rótulo de diagrama — legenda de face na planta baixa (PropertyModal.tsx) */}
<div className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] border border-blue-200/50 bg-white px-4 py-1 rounded-full shadow-sm">
  Lado A (Topo/Frente)
</div>
```

**Critério (os três, juntos):**
1. O texto nomeia parte do **desenho** (face, eixo, torre, quadrante), não o estado de uma entidade;
2. Está **dentro** de um container de diagrama — nunca em `<td>`, card ou coluna;
3. Se virar texto solto colorido, **perde a função**.

> ❌ Não é exceção: "é um chip", "fica bonito", "é pequeno demais", "está num
> modal". Status dentro de modal continua §8 puro (ver §21). Falhou qualquer um
> dos três critérios → §8 se aplica inteiro.
> ℹ️ `scripts/check-ui-standard.sh` **continua acusando** essas linhas (o
> checador é textual). A saída correta é justificar apontando para esta seção,
> não silenciar o check. Ocorrências: `PropertyModal.tsx`, aba "Gestão de
> Unidades" (as 11 legendas da matriz geradora).

---

## 9. COLUNA DE AÇÕES

**Sempre visível.** Nunca usar `opacity-0 group-hover:opacity-100`.

```tsx
{tableColumns.visibleColumns.includes('actions') && (
  <td className="px-6 py-2.5 text-right">
    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>

      {/* Ação primária — botão de texto azul */}
      <button
        onClick={(e) => { e.stopPropagation(); onViewDetails(item.id); }}
        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
      >
        Ver Detalhes
      </button>

      {/* Ação secundária — apenas ícone (§9.2) */}
      <ActionIconButton kind="edit" onClick={(e) => { e.stopPropagation(); onEdit(item.id); }} />

      {/* Menu de ações terciárias */}
      <InlineDisclosureMenu
        menuItems={[
          { icon: <Truck className="w-[18px] h-[18px]" />, label: 'Logística', onClick: () => onViewLogistics(item.id) },
          { icon: <HugeiconsIcon icon={Copy01Icon} size={18} />, label: 'Duplicar', onClick: () => handleDuplicate(item.id) },
        ]}
        showDelete
        onDelete={async () => { await deleteItem(item.id); await loadData(); }}
        deleteDisabled={!canDelete(item.status)}
        deleteDisabledTitle={!canDelete(item.status) ? `Item "${item.status}" não pode ser excluído` : undefined}
      />
    </div>
  </td>
)}
```

> **Variante — bandeja de ícones (`InlineActionTray`).** Quando o objetivo é só
> **ocultar ícones secundários** de forma compacta (não transformá-los em texto),
> use `components/ui/InlineActionTray.tsx`. O gatilho é um `MoreVertical` (⋮)
> com o estilo de `<ActionIconButton>` neutro; ao clicar, os filhos aparecem num
> painel `absolute` que abre para baixo (não altera a largura da tabela).
> Mantenha ações primárias sempre visíveis, fora da bandeja. Em uso em
> `OpuraDocsModule.tsx`.

### 9.1 Ação dominante via clique na linha — quando não sobra "Ver Detalhes"

Quando clicar na linha já abre a única ação relevante (ex: editar, num CRUD
simples), não duplique como botão de texto — a linha inteira já é clicável. A
coluna de ações fica só com o que **não** é a ação dominante (tipicamente
exclusão, isolada de propósito):

```tsx
<td className="px-6 py-2.5 text-right">
  <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
    <InlineDisclosureMenu showDelete onDelete={() => performDelete(item.id)} />
  </div>
</td>
```

> ✅ Use **só quando o clique na linha já é inequívoco** (uma única ação óbvia).
> Se a linha tem múltiplas ações prováveis, volte para o padrão da §9.
> ❌ Não deixe um botão "Editar" fazendo a mesma coisa que o clique na linha.

### 9.2 Estilo do botão-ícone — usar sempre `<ActionIconButton>`

**Componente único e obrigatório:** `components/ui/ActionIconButton.tsx`. Não
escrever `className` de botão-ícone à mão — os dois estilos hand-rolled antigos
(o flat sem borda, e o `p-2.5 rounded-xl border-slate-200`) estão **ambos
deprecados**. Estilo canônico (já embutido no componente): `bg-white` + `border
border-gray-200` + `shadow-sm` + `rounded-[6px]` + `p-1.5` + `active:scale-95`,
cor neutra `text-gray-500`, mudando no hover conforme o `tone`:
- `neutral`: `hover:text-blue-600 hover:border-blue-200`
- `attention` (ex: `share`): `hover:text-orange-600 hover:border-orange-200`
- `danger` (ex: `delete`): `border-red-100 text-red-500 hover:bg-red-50`

```tsx
import ActionIconButton from './ui/ActionIconButton';

{/* kinds prontos: download · edit · settings · history · delete · view · share · qrcode · move · duplicate · annotate */}
<ActionIconButton kind="download" onClick={() => handleDownload(item)} />
<ActionIconButton kind="edit" onClick={() => onEdit(item.id)} />
<ActionIconButton kind="delete" onClick={() => onDelete(item.id)} />

{/* override pontual — só quando a semântica diverge do default do kind */}
<ActionIconButton kind="edit" title="Configurar" icon={<Settings className="w-4 h-4" />} onClick={() => onConfig(item.id)} />
```

> ✅ Use `kind` sempre que existir um dos 11 tipos prontos — resolve ícone,
> `title` e tom de hover.
> ℹ️ `gap-1.5` (não `gap-2`/`gap-3`) entre os botões da coluna de ações.
> ℹ️ Esta seção define só o **estilo/componente**. A **estrutura** continua a da
> §9 (texto azul para a ação dominante, 1-2 ícones secundários, `InlineDisclosureMenu`
> para o resto) — não transformar toda ação terciária em botão solto.
> Ações terciárias (3+): agrupar em `<InlineDisclosureMenu>` (kebab).

---

## 10. BARRA DE AÇÕES EM LOTE (F3)

**Fixa no rodapé, fora do fluxo normal da lista** (`position: fixed`), não
inline no topo. Colocar dentro do fluxo forçaria reflow de toda a lista a cada
seleção (visível em listas grandes). Paleta **azul**, não vermelha — vermelho
fica reservado para ações destrutivas específicas.

```tsx
{selectedIds.size > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
    <span className="flex-1 text-sm font-bold whitespace-nowrap">
      {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
      <span className="ml-2 font-normal opacity-75">· {formatMoney(totalSelecionado)}</span>
    </span>
    <Button variant="secondary" size="sm" onClick={() => setIsLoteEditOpen(true)} className="text-blue-700 border-none hover:bg-blue-50">
      <Pencil className="w-3.5 h-3.5" />
      Editar em Lote
    </Button>
    <button onClick={clearSelection} className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-400 transition-colors">
      <X className="w-3.5 h-3.5" />
      Desmarcar
    </button>
  </div>
)}
```

> ✅ A edição em lote deve abrir um **modal dedicado** ("Editar em Lote") — não
> empilhar múltiplos `<select>` inline na barra. Ver `BoletoEdicaoEmLoteModal.tsx`
> e `BankTxEdicaoEmLoteModal.tsx`.
> ℹ️ Checkboxes SÓ nas linhas que permitem ações em lote:
> `{canDelete(item.status) ? <input type="checkbox" ... /> : null}`

### 10.1 Seleção de intervalo com Shift+clique

Clicar num item define uma âncora; segurar **Shift** e clicar em outro seleciona
todos entre os dois — padrão universal de Explorer/Gmail/planilhas. Extraído de
`SupplierList.tsx` (F4).

```tsx
const [lastCheckedIndex, setLastCheckedIndex] = React.useState<number | null>(null);

const handleRowCheck = (id: string, index: number, shiftKey: boolean, visibleRows: Item[]) => {
  if (shiftKey && lastCheckedIndex !== null) {
    const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
    const rangeIds = visibleRows.slice(start, end + 1).map(r => r.id);
    setSelectedIds(prev => new Set([...prev, ...rangeIds]));
  } else {
    toggleSelected(id);
    setLastCheckedIndex(index);
  }
};

<input
  type="checkbox"
  title="Dica: segure Shift e clique para selecionar um intervalo"
  checked={selectedIds.has(item.id)}
  onChange={(e) => handleRowCheck(item.id, rowIndex, (e.nativeEvent as MouseEvent).shiftKey, visibleRows)}
/>
```

> ✅ A âncora só é atualizada em cliques **sem** Shift.
> ℹ️ Adicionar `title` no checkbox com a dica — a interação não é descobrível visualmente.

---

## 11. LOADING STATE

```tsx
{loading && (
  <div className="text-center py-12">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
    <p className="mt-2 text-gray-500">Carregando...</p>
  </div>
)}
```

---

## 12. EMPTY STATE

```tsx
{!loading && filteredItems.length === 0 && (
  <div className="text-center py-12 bg-white rounded-[2.5rem] shadow-sm border border-gray-100">
    <IconName className="w-12 h-12 text-gray-300 mx-auto mb-4" />
    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum registro encontrado</h3>
    <p className="text-sm text-gray-500">Tente ajustar seus filtros de busca.</p>
  </div>
)}
```

> ℹ️ Dentro da variante acoplada (§5.2) o empty state vai **sem** `bg-white
> rounded shadow border` próprios (o card pai já supre) — só `text-center py-12`.

---

## 13. TOAST DE NOTIFICAÇÃO

```tsx
// State: const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
// Helper: const notify = (message, type = 'success') => { setNotification({ message, type }); setTimeout(() => setNotification(null), 4500); };

{notification && (
  <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
  }`}>
    <AlertCircle className="w-4 h-4 shrink-0" />
    {notification.message}
  </div>
)}
```

---

## 14. MODAL DE CONFIRMAÇÃO (Destrutivo)

**Padrão oficial: `useConfirm()`** (`components/ui/confirm.tsx`), não um estado
`pendingConfirm` local. É um hook global Promise-based, substitui
`window.confirm()`/`confirm()` nativo, e evita reimplementar o modal em cada tela.

```tsx
import { useConfirm } from './ui/confirm';

const confirm = useConfirm();

async function handleDelete(id: string) {
  const ok = await confirm({
    title: 'Excluir item?',
    message: 'Essa ação não pode ser desfeita.',
    variant: 'danger', // 'danger' | 'warning' | 'default'
    confirmLabel: 'Excluir',
  });
  if (!ok) return;
  await deleteItem(id);
}
```

> ❌ **NUNCA usar `window.confirm()`/`confirm()` nativo** — quebra a identidade
> visual e não é acessível.
> ❌ Não reimplementar um modal local (`pendingConfirm`/`askConfirm`).
> ✅ `variant="danger"` para exclusão, `"warning"` para ações reversíveis mas
> sensíveis, `"default"` para confirmações neutras.

---

## 15. RESPONSIVIDADE

- **KPI Cards:** `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- **Toolbar:** `flex-col md:flex-row`
- **Tabela:** envolver em `overflow-x-auto` se necessário (ou `overflow-auto` no container quando usa sticky header, §6.5)

---

## 16. ESCALA DE RADIUS — compacta (padrão único do app)

**Critério fechado em 2026-07-10:** a escala compacta é o padrão único. Não é
mais "decisão por tela". A escala antiga (`rounded-[2.5rem]`) fica
**deprecated**: só existe nas telas não migradas e aparece nas §4–§9 por ser a
origem histórica da estrutura.

**Motivo da virada:** com duas escalas ambas "corretas" e a decisão por tela, o
app acabou com módulos vizinhos parecendo dois produtos diferentes — mesmo cada
tela batendo com alguma seção do guia. Consistência *entre* telas importa tanto
quanto conformidade *dentro* de uma tela.

| Elemento | Escala compacta (padrão único) | Escala antiga (deprecated) |
|---|---|---|
| Containers (tabela, cards, toolbar agrupada) | `rounded-[10px]` | `rounded-[2.5rem]` / `rounded-2xl` |
| Inputs, botões, chips | `rounded-[6px]` | `rounded-[1.25rem]` / `rounded-xl` |
| Altura dos controles da toolbar | `h-9` (36px) uniforme | `py-3`/`py-4` (variável) |

> ✅ Migrar da escala antiga para a compacta não é decisão de design — é correção
> de padrão. O único julgamento é de sequenciamento (qual migrar primeiro).
> ✅ Referência: `SupplyChainOrderList.tsx` (migrado) e `ClientList.tsx` (nasceu compacta).
> ⚠️ Não misturar as duas escalas dentro da mesma tela.
> ℹ️ Telas não migradas não são "N/A" numa auditoria — são ❌ pendentes de migração.

---

## 17. BOTÃO PRIMÁRIO — variante compacta (padrão único, consequência do §16)

O CTA primário antigo (`px-6 py-3 rounded-[1.25rem] uppercase tracking-widest
shadow-xl`) fica ~265×50px — pesado o bastante para competir com o próprio
título. **É o único botão primário válido**, ~150×40px (ou `h-9` se mora dentro
da régua de controles da §5.1/§5.3):

```tsx
<button className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
  <Plus className="w-[15px] h-[15px]" />
  Novo fornecedor
</button>
```

Diferenças: `font-medium` (não `font-black`), sentence case (não uppercase — o
`tracking-widest` da caixa alta inflava a largura), sem `shadow-xl`/glow, radius
`6px` alinhado aos inputs.

> ℹ️ **Onde colocar** depende da frequência: ação rara → dentro da régua (§5.1)
> ou na toolbar de botões (§5.3); ação frequente → isolado e alinhado ao título,
> mas no tamanho compacto — 50px de altura nunca se justifica só pela frequência.
> ✅ É o único elemento azul sólido da tela — já é ênfase suficiente. Caixa alta
> e sombra por cima é redundância.

---

## 18. NÃO DUPLICAR CONTEXTO JÁ VISÍVEL NO SHELL

Antes de um header de tela mostrar "onde estou" (logo + nome + filtro ativo),
confira se essa informação já não está persistente no shell (ex:
`activeContextLabel` no sidebar de `Layout.tsx`). Um segundo bloco de identidade
— geralmente puxando de fonte diferente (`nome_fantasia` vs `organizations.name`)
— ocupa altura à toa e pode divergir do primeiro. Extraído da simplificação do
header em `OrganizationList.tsx`: o bloco "logo + Minha Organização + Filtro
Ativo: X" foi removido, sobrando só um ícone-âncora com `title`.

---

## 19. NAVEGAÇÃO DE MÓDULOS (histórico: abas superiores → sidebar)

**Estado atual (2026-07-11): não existe mais barra de abas superior no módulo
Minha Organização.** A navegação foi movida para um dropdown na sidebar
(`Layout.tsx`, `NavDropdown label="Minha Organização"`). Cada item navega direto
pra aba (`onChangeView('organization')` + `setManagementTab(id)`), sem renderizar
barra dentro da tela. `OrganizationList.tsx` teve o bloco de abas removido.

> ⚠️ Consequência direta do §18: a barra de abas era navegação redundante — a
> sidebar já mostra "onde você está".
> ℹ️ Se um módulo novo precisar de barra de abas superior compartilhada por
> telas irmãs, aplique o vocabulário do §5.1/§16 (compacto) — mas prefira
> sidebar quando a navegação for de nível de módulo inteiro.

### 19.1 Toolbar de abas — anatomia canônica

Quando a barra de abas local **é** a escolha certa (sub-fluxos de uma mesma
tela, não navegação de módulo), esta é a forma canônica. **Referência:
`BankReconciliation.tsx`** (2026-07-16).

```tsx
{/* Toolbar de abas — card próprio, mb-3 pelo ritmo do §20.1 */}
<div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
  <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
    {VIEWS.map(v => (
      <button
        key={v.id}
        onClick={() => setActiveView(v.id)}
        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
          activeView === v.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        {v.label}
      </button>
    ))}
  </div>
</div>
```

> ✅ **Aba ativa = `bg-white text-blue-600 shadow-sm` sobre trilho `bg-gray-50`.**
> Não é o azul sólido do toggle grid/lista (§5) nem do botão primário (§17) —
> aba ativa é *estado de navegação*, não ação.
> ✅ **Aba inativa = `text-gray-700 hover:text-gray-900`.** Este trecho já pediu
> `text-gray-400 hover:text-gray-600`, e isso reprova WCAG AA: cinza 400 sobre o
> trilho claro dá ~2.5:1, contra os 4.5:1 mínimos para texto normal. Corrigido a
> pedido do usuário em 2026-08-04 (`RentalsModule.tsx`, commit `1b098fd`), mas o
> guia ficou para trás e passou a acusar como divergência justamente o código
> certo. **`text-gray-400` continua válido para os toggles de ÍCONE** (grade/
> lista/torre, autofit — §5.1/§5.2): ali não há texto, e o alvo de contraste é
> outro. A regra vale para rótulo de aba, que é texto.
> ✅ **`flex-wrap`, nunca `overflow-x-auto`.** Com muitas abas (o Extrato tem
> 11), rolagem horizontal corta o texto sem indício de que há mais abas.
> ✅ Abas em `h-7` dentro de um card `p-3` — mais baixas que o `h-9` do resto:
> navegação é secundária à tarefa.
> ℹ️ O título da tela (`<h1>`, §20) deve **mudar junto com a aba ativa** — um
> `Record<View, {title, subtitle}>` no topo do arquivo (como `VIEW_HEADERS` em
> `BankReconciliation.tsx`). Aba que troca o conteúdo inteiro sem trocar o título
> deixa o `<h1>` mentindo.
> ℹ️ O trilho interno é o que `components/ui/tabs.tsx` (`TabsList`/`TabsTrigger`)
> já renderiza — o que costuma faltar é o card branco em volta.

### 19.2 Árvore lateral dentro de uma tela (2 níveis, sem tocar no sidebar global)

Quando uma tela tem **muitas seções irmãs e pelo menos um grupo com sub-seções**
(ex: `Settings.tsx` — 6 seções, uma reagrupando 5 sub-telas), a barra horizontal
do §19.1 deixa de caber bem. Use uma coluna de navegação à esquerda **dentro do
conteúdo da tela** — não confundir com o sidebar global nem com o §19: aqui é
sub-navegação de uma única tela, então o racional do §18 não se aplica.

Referência: `Settings.tsx` (2026-07).

```tsx
<div className="flex gap-6 items-start">
  <aside className="w-64 shrink-0 bg-gray-50 border border-gray-100 rounded-[10px] p-2 flex flex-col gap-0.5">
    {/* nó de raiz (folha navegável) */}
    <button className={`flex items-center gap-2.5 w-full px-3 h-9 rounded-[6px] text-sm font-medium transition-all ${
      isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
    }`}>
      <Icon className="w-4 h-4" /> {label}
    </button>

    {/* nó de grupo (toggle, nunca navega sozinho) */}
    <button className={`flex items-center w-full px-3 h-9 rounded-[6px] text-sm font-medium justify-between transition-all ${
      hasActiveChild ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
    }`}>
      <span className="flex items-center gap-2.5"><Icon className="w-4 h-4" />{label}</span>
      <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
    </button>
    {isOpen && (
      <div className="mt-0.5 ml-4 pl-4 border-l border-gray-200 flex flex-col gap-0.5">
        <button className={`px-3 h-8 rounded-[6px] text-sm font-medium text-left transition-all ${
          isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
        }`}>{label}</button>
      </div>
    )}
  </aside>

  <div className="flex-1 min-w-0 space-y-6">{/* conteúdo da folha ativa */}</div>
</div>
```

> ✅ Folha ativa sempre `bg-white text-blue-600 shadow-sm` — mesma cor de "ativo"
> do §19.1. Nó de grupo nunca ganha `bg-white`/`shadow-sm` — só o texto vira
> `text-blue-600` quando algum filho está ativo.
> ✅ Indentação/chevron reaproveitam o vocabulário de `NavDropdown` (`Layout.tsx`):
> `ml-4 pl-4 border-l`, `ChevronRight` que gira `rotate-90`.
> ⚠️ **Quando usar cada um:** abas horizontais (§19.1) quando as seções são
> poucas (até ~6) e planas; árvore lateral (esta) quando há hierarquia de 2
> níveis na mesma tela; sidebar global (§19) quando é navegação entre módulos.

### 19.3 `tabsSlot` — abas do pai posicionadas antes dos KPIs do filho

**O conflito estrutural:** a anatomia exige `título → abas → KPIs`, mas as abas
costumam ser do componente **pai** enquanto título e KPIs são da tela filha.
Renderizar no pai põe as abas *antes* do título — fora de ordem. Foi exatamente
o erro em Contas a Pagar (2026-07-19): auditou-se `ContasPagarManager.tsx`
isolado, concluiu-se "tela sem abas", e a barra estava em
`ProjectFinancialManager.tsx` o tempo todo.

Antes de concluir que a §19 não se aplica, **procurar quem renderiza a tela**:

```bash
grep -rn "SuaTela" components/ --include=*.tsx | grep import
```

**Solução — `tabsSlot`** (implementada em `ProjectFinancialManager` →
`ContasPagarManager`, commit `cb6b0bd`): o pai monta a barra e passa como prop;
a tela a posiciona entre o título e os KPIs.

```tsx
// No pai: monta a barra uma vez
const tabsBar = ( /* card branco §19.1 com <Tabs>/<TabsList> + ação de export */ );

const TABS_RENDERED_BY_CHILD: TabKey[] = ['contas_pagar'];
const childOwnsTabsBar = TABS_RENDERED_BY_CHILD.includes(activeTab);

return (
  <div className="p-2 space-y-6">
    {!childOwnsTabsBar && tabsBar}
    {activeTab === 'contas_pagar' && <ContasPagarManager tabsSlot={tabsBar} … />}
  </div>
);
```

```tsx
// Na tela: prop opcional (ausente = usada fora do módulo, sem abas)
interface Props { tabsSlot?: React.ReactNode; }

<div className="space-y-6">
  <div>{/* 1. título */}</div>
  {tabsSlot}                       {/* 2. abas, na posição correta */}
  <div className="grid … mb-3">{/* 3. KPIs */}</div>
  <div className="… mb-3">{/* 4. escopo */}</div>
  <div>{/* 5. card da tabela */}</div>
</div>
```

> - Migrar mais uma aba = aceitar `tabsSlot` + listar em `TABS_RENDERED_BY_CHILD`.
> - **Efeito colateral na migração parcial:** ao alternar entre aba migrada e não
>   migrada, a barra "pula" de posição. É esperado e some quando todas migrarem —
>   vale avisar o usuário.
> - Alternativa (a que o Extrato usa): **um único componente dono de tudo** —
>   título via `Record<Aba, {titulo, subtitulo}>`, KPIs e abas no mesmo arquivo.
>   É o alvo final; `tabsSlot` é o caminho incremental quando os filhos já existem
>   separados.

### 19.4 `chromeSlot` — quando o pai monta abas §19.1 **e** botões §5.3

`FiscalModule.tsx` foi auditado, declarado "100% conforme" (cada arquivo lido
isoladamente estava certo) e mesmo assim saiu fora de ordem (na regra vigente
em 2026-07-19, `título → KPIs → abas`): abas e botões (ambos no pai)
apareciam *antes* dos KPIs, que vivem em cada filho
(`FiscalDocuments`/`FiscalJobs`/`FiscalRules`). O usuário só pegou com um print.
Com a ordem atual (`título → abas → KPIs`) esse arranjo específico passaria a
estar correto — mas a lição do episódio continua valendo: **auditar arquivo
por arquivo não basta quando título/abas e KPIs/botões pertencem a
componentes diferentes — o que importa é a ordem no HTML final.**

Generalização do `tabsSlot`: quando o pai monta **mais de um bloco de cromo**
(abas §19.1 + botões §5.3), combine num único `chromeSlot` e passe pronto — não
dois props separados, para não arriscar o filho renderizá-los fora de ordem:

```tsx
// No pai: um único nó combina abas + botões, na ordem entre eles que o §19.3/§5.3 pede
const chromeSlot = (
  <>
    <div>{/* abas §19.1 */}</div>
    <div>{/* botões §5.3 — escopo à esquerda, ação primária à direita */}</div>
  </>
);

{page === 'documents' && <FiscalDocuments chromeSlot={chromeSlot} … />}
{page === 'admin'     && <FiscalJobs      chromeSlot={chromeSlot} … />}
{page === 'rules'     && <FiscalRules     chromeSlot={chromeSlot} … />}
```

```tsx
// Em CADA filho — não só no que está sendo editado no momento
<div className="grid … mb-3">{/* 2. KPIs desta aba */}</div>
{chromeSlot}                  {/* 3+4. abas e botões do pai, nesta posição */}
<div>{/* 5. toolbar acoplada + tabela */}</div>
```

> Diferença para o `tabsSlot` (§19.3): lá só a aba migrada tinha KPI puxando a
> barra pra baixo, então dava para migrar uma de cada vez. Aqui, **se todas as
> abas do módulo têm KPI próprio**, não existe posição neutra para o cromo — ele
> tem que ir para dentro de **todas** de uma vez, ou nenhuma fica certa.

---

## 20. CABEÇALHO DE TELA (título + subtítulo + KPIs)

Todo container raiz usa `space-y-6` (não `space-y-4/5/8`). O bloco de título é
uma `<div>` simples — nunca embrulhado em card, banda colorida ou "hero" —
contendo só `<h1>` + `<p>`, seguido **imediatamente** pelo grid de `KpiCard`:

```tsx
<div className="space-y-6">
  <div>
    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Meus Fornecedores</h1>
    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua rede de parceiros e fornecedores.</p>
  </div>

  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
    <KpiCard ... />
  </div>
  {/* ...toolbar, tabela... */}
</div>
```

Referência: `SupplierList.tsx`, `ClientList.tsx`, `InvestorList.tsx`.

> ✅ `<h1>` solto, **nunca dentro de card/hero/banda colorida**. Subtítulo sempre
> `mt-1.5` (não `mt-1`, não `mt-0.5`, não ausente).
> ✅ Nenhum componente de listagem deve embrulhar seu título num card só porque o
> resto é card — o título é conteúdo de página. Corrigido em
> `FinancialRegistryManager.tsx` (estava dentro do card com `h2 text-2xl`).
> ✅ Toda tela com título tem que TER um título — `OrganizationUsers.tsx` (aba
> Usuários) não tinha `<h1>`, ia direto pra barra de sub-abas. Corrigido em 2026-07-11.
> ✅ Se a tela tem abas (§19.1) e cada aba muda o assunto, título/subtítulo mudam
> junto (um `Record<Aba, {titulo, subtitulo}>` no topo do arquivo).
> ❌ **Não é a mesma coisa que os cabeçalhos "hero"** (fundo escuro/gradiente,
> `h1` branco `text-4xl`, ex: `RentalsModule.tsx`, `SalesModule.tsx`,
> `ProjectOverview.tsx`) nem os cabeçalhos em card com breadcrumb
> (`OpuraAssetsModule.tsx`, `EmpreendimentoModule.tsx`, `LaborModule.tsx`) — são
> linguagens visuais deliberadamente diferentes, não inconsistência a corrigir
> aqui. Não migre sem decisão explícita (seria redesign).

### 20.1 Ritmo de espaçamento do cromo — 24px até as abas, 12px depois

O `space-y-6` (24px) do container raiz governa o **conteúdo** — título → abas, e
o último bloco de cromo → tabela. Já as barras de cromo empilhadas entre abas e
tabela (KPIs §4 → botões §5.3 → toolbar acoplada §5.2) respiram **12px** entre
si: são controles da mesma tarefa.

```tsx
<div className="space-y-6">
  <div>{/* h1 + p — §20 */}</div>

  {/* mb-3 quebra o ritmo de 24px a partir daqui: abas e cromo são um bloco só */}
  <div className="... rounded-[10px] border border-gray-100 shadow-sm mb-3">{/* abas — §19.1 */}</div>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">{/* KpiCard — §4 */}</div>
  <div className="... rounded-[10px] border border-gray-100 shadow-sm mb-3">{/* botões — §5.3 */}</div>

  <div>{/* toolbar acoplada + tabela — §5.2 */}</div>
</div>
```

> ✅ **`mb-3` no filho, não `space-y-3` no pai.** No Tailwind v4 o `space-y-6`
> compila com `:where()`, que zera a especificidade, então qualquer `mb-*` no
> filho vence limpo. **Não** vale para o Tailwind v3 (a técnica quebraria
> silenciosamente).
> ✅ O `mb-3` vai no **elemento de cima** de cada par: abas, KPIs e botões
> carregam `mb-3`; a toolbar acoplada não carrega nada (usa o `space-y-6`).
> ❌ Não aplicar `mb-3` no bloco de título — o respiro de 24px entre `<h1>` e
> abas separa "identidade da tela" de "controle da tela". Regra rápida: 24px
> sempre que a pergunta muda; 12px enquanto for a mesma pergunta.
> ℹ️ Referência: `BankReconciliation.tsx` (aba Extrato), 2026-07-16; ordem
> abas/KPIs corrigida em 2026-08-02.

### 20.2 Gutter do container — 16px no mobile, 24px no desktop

O respiro entre a moldura do app (sidebar, barra superior) e o conteúdo da tela
**não é decisão da tela**. Ele mora num lugar só:

```tsx
// components/Layout.tsx — <main>
<main className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-hide relative">
```

| | Gutter |
|---|---|
| Mobile (< 768px) | **16px** — piso; abaixo disso o conteúdo cola na borda |
| Desktop | **24px** — régua de app denso de dados; casa com o `px-6` das células (§6.6) |

> ✅ **A tela não declara padding lateral nem superior própria.** A raiz é
> `space-y-6 pb-20` e nada mais. Se você escreveu `px-*`/`pt-*` na raiz de uma
> tela, ou está duplicando o gutter ou está brigando com ele.
> ✅ **Full-bleed** (banner sangrando até a borda) é o único caso que cancela o
> gutter, e os valores **têm que acompanhar** o `<main>`: `-mx-4 md:-mx-6`.
> Com `md:-mx-8` contra um `md:p-6` sobra margem negativa e nasce scroll
> lateral. Referência: `SupplierDashboard.tsx` (casca do portal público).
> ❌ Não mexer no `<main>` para consertar UMA tela — é o container de todas.
> ℹ️ **Por que 24px e não 32px:** o vão do topo pesa mais do que mede. O `h1`
> de §20 é 30px numa caixa de linha de 36px, então ~8px de meia-entrelinha
> entram no espaço percebido — os 32px antigos liam como ~40px, e a tela
> gastava 324px (32% de um viewport de 1000px) antes da primeira linha de
> dado. Medido em `RentalsModule.tsx` com Playwright, 2026-08-07; a razão
> resultante entre o vão acima do título (~32px ópticos) e o de baixo (24px,
> §20.1) é 1,33:1, dentro da faixa saudável de 1,3–1,8:1.

### 20.2.1 Fora do `<Layout>` — Portais e acesso por link público NÃO herdam o gutter

O gutter de §20.2 só existe porque o `<main>` do `Layout.tsx` embrulha a tela.
Existe uma classe inteira de telas que **nunca passa por ali**: os guards de
acesso público em `App.tsx` (`if (portalToken) return <PortalTokenGate ... />`
e os equivalentes de corretor/parceiro/fornecedor/investidor/cliente) rodam
**antes** de `<Layout>` ser montado. O mesmo vale para `BrokerPortal.tsx` e
`partner/PartnerPortal.tsx` em modo standalone: são casca própria (`h-screen`,
header e `<main>` inclusos), não filhos do `<main>` do Layout.

> ✅ Cada uma dessas cascas próprias **repete o mesmo valor** à mão —
> `p-4 md:p-6` (ou `-mx-4 md:-mx-6` se for cancelar um pai que já tem
> padding). Não existe herança automática aqui; é responsabilidade de quem
> escreve a casca.
> ❌ **Não copie o padding "que já estava lá" sem checar contra este valor.**
> Foram encontrados três desvios reais, nenhum causado pela mesma pessoa/dia —
> prova de que sem um valor de referência escrito, cada wrapper novo inventa
> o próprio número:
>   - `App.tsx` (Portal do Fornecedor, guard de token) — `md:p-8`, o padrão
>     **antigo** (32px), nunca migrado por viver fora do Layout.
>   - `App.tsx` (Portal do Investidor, guard de token) e `BrokerPortal.tsx`
>     (standalone) — `p-6` fixo, sem o piso `p-4` do mobile.
>   - `fiscal/FiscalModule.tsx` — `px-7 py-6` (28px, valor que não existe em
>     nenhuma outra tela) num wrapper que já vive **dentro** do `<main>` do
>     Layout — chegava a somar com o gutter do Layout em vez de substituí-lo,
>     deixando Fiscal com MAIS respiro que qualquer outra tela do sistema.
> ⚠️ **`h-full` não convive com `-mt`/`-mb` de cancelamento.** `h-full` mede
> 100% do conteúdo já com o padding do pai descontado; uma margem negativa no
> eixo vertical desloca a caixa sem esticar a altura, sobrando um vão do
> tamanho da margem na borda oposta (medido com Playwright em
> `fiscal/FiscalModule.tsx`, 2026-08-08). Nesse caso cancele só o eixo
> horizontal (`-mx`) e aceite o padding vertical duplicado — invisível numa
> caixa que rola, ao contrário do lateral, que dobra a margem visível.
> ℹ️ Referência: `App.tsx:204,344`, `BrokerPortal.tsx:586`,
> `partner/PartnerPortal.tsx:1084`, `fiscal/FiscalModule.tsx`, 2026-08-08.

---

## 21. RÓTULO DE CAMPO E TÍTULO DE MODAL (formulários)

**Origem:** até 2026-07-15 os modais de formulário usavam `font-black uppercase
tracking-wider/widest` no título (`<h3>`/`<h4>`) e em todo `<label>` — o mesmo
estilo "gritado" que as §6.2/§8/§17 já removeram de tabela/badge/botão.
`SupplierModal.tsx` ainda usa o estilo antigo — **não é referência**, é o padrão
sendo deprecado a partir de `OpuraDocsModule.tsx`.

**Título de modal (`<h3>`):** sentence case, sem `uppercase`/`tracking-wider`. O
peso continua `font-black`:

```tsx
<h3 className="font-black text-slate-800 text-lg">Editar Metadados</h3>
```

**Rótulo de campo (`<label>`):** troca `text-form-label font-black uppercase
text-slate-400 tracking-wider` por `text-xs font-semibold text-slate-500` —
mesmo vocabulário do `<thead>` sentence case (§6.2):

```tsx
<label className="text-xs font-semibold text-slate-500">Nome do Documento</label>
```

> ✅ O texto do rótulo já deve estar em capitalização normal no código.
> ✅ **Badge/pill dentro de modal também segue §8** — histórico de versões,
> pareceres e trilha de auditoria de `OpuraDocsModule.tsx` viraram texto colorido
> simples.
> ✅ **Barra de sub-abas dentro de um modal** segue o vocabulário do §19: `h-9`,
> `text-sm font-medium`, sem `uppercase`/`tracking-wider`/`font-black`.
> ❌ Não é exceção "é só um modal" — o critério é sobre o elemento, não onde mora.
> ℹ️ **Exceção real:** token literal de máscara (`OBRA`, `DISCIPLINA`, `NUMERO`,
> `REVISAO`) continua em caixa alta porque é o nome exato do placeholder (como as
> siglas do §6.2). Também não se aplica a preview de impressão (etiqueta QR de
> canteiro em `#printable-qr-label`).
> ⚠️ **Pendência de propagação:** nasceu de correção pontual em
> `OpuraDocsModule.tsx`. `SupplierModal.tsx`, `ClientModal.tsx` etc. ainda não
> migraram — não tratar como "resolvido no app inteiro".

---

## 22. ATUALIZAR ESTADO LOCAL EM VEZ DE RECARREGAR A TABELA INTEIRA

**Origem:** `BoletoManager.tsx` (Captura de Boletos) recarregava a lista
inteira — boletos + centros de custo + obras + fornecedores, 4 consultas —
depois de qualquer criação, edição ou exclusão de **um único** item. Além do
custo de rede desnecessário, isso tinha um efeito colateral visível: abrir a
edição substitui a lista pelo formulário (página cheia); ao voltar, a `<div
overflow-auto>` da tabela é **recriada do zero** e o navegador zera o
`scrollTop` — na prática, "depois de editar, a tela sempre volta pra primeira
linha". Corrigido em 2026-07-28 trocando os três `carregar()` (criar/editar,
excluir 1, excluir em lote) por atualização direta do array em estado, e
restaurando o `scrollTop` salvo antes de abrir a edição.

### Criar/editar (formulário retorna o registro salvo)

```tsx
function handleSaved(updated: Item) {
    // Se a lista já é filtrada no servidor (status, obra, etc. — ver carregar()),
    // um item que deixou de bater com o filtro atual tem que ser removido, não
    // inserido, senão ele "vaza" para a aba/filtro errado.
    const combinaComFiltro = filtroStatus === 'todos' || updated.status === filtroStatus;
    setItens(prev => {
        const existe = prev.some(i => i.id === updated.id);
        if (!combinaComFiltro) return prev.filter(i => i.id !== updated.id);
        return existe ? prev.map(i => (i.id === updated.id ? updated : i)) : [updated, ...prev];
    });
}
```

### Excluir (1 item ou em lote)

```tsx
// 1 item
setItens(prev => prev.filter(i => i.id !== deletedId));

// Lote — só remove os que o backend confirmou (Promise.allSettled)
const excluidosIds = new Set(alvos.filter((_, i) => resultados[i].status === 'fulfilled').map(a => a.id));
setItens(prev => prev.filter(i => !excluidosIds.has(i.id)));
```

### Preservar scroll ao abrir edição em página cheia

Quando a edição substitui a lista por um componente de página cheia (em vez de
modal sobreposto), guardar o `scrollTop` do container rolável antes de trocar,
e restaurar depois de fechar (o container só existe de novo no próximo frame):

```tsx
const scrollContainerRef = useRef<HTMLDivElement>(null);
const savedScrollTopRef = useRef(0);

function abrirEdicao(item: Item) {
    savedScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
    setEditing(item);
    setIsModalOpen(true);
}

function fecharModal() {
    setIsModalOpen(false);
    setEditing(undefined);
    requestAnimationFrame(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = savedScrollTopRef.current;
    });
}
```

> ✅ Só recarregue a lista inteira quando o backend não devolve o registro
> completo, ou quando a operação afeta muitos itens de forma não previsível
> (ex: importação em lote que não retorna os itens criados).
> ⚠️ **Pendência de propagação:** corrigido só em `BoletoManager.tsx`. Outras
> telas do sistema (Contas a Pagar/Receber, Fornecedores, Clientes, Obras,
> Locações etc.) ainda chamam recarga completa depois de criar/editar/excluir
> um item — não tratar como "resolvido no app inteiro". Ao tocar em qualquer
> tabela com esse padrão, aplicar a mesma correção.

---

## 23. MIGALHA DE PÃO (trilha de navegação) — escopo restrito

**Componente único e obrigatório: `components/ui/Breadcrumb.tsx`.** Não escrever
a trilha à mão — foi assim que o app acumulou quatro variantes diferentes de
`<span>/</span>` antes desta seção existir (2026-08-03).

```tsx
import Breadcrumb from './ui/Breadcrumb';

<Breadcrumb
  items={[
    { label: 'Estruturas', onClick: () => { setAssembly(null); setElement(null) } },
    ...(assembly ? [{ label: assembly.nome, onClick: () => setElement(null) }] : []),
    ...(element ? [{ label: element.nome }] : []),
  ]}
/>
```

### Quando usar (os três critérios, juntos)

1. **A profundidade é interna à tela** — lista → item → sub-item, tudo no mesmo
   `view` do `AppRouter`. A trilha começa no nível da própria tela.
2. **Há pelo menos 2 saltos de profundidade** (3 crumbs). Com 1 salto, o padrão
   é o **botão "Voltar"** (`<ArrowLeft /> Voltar`, ~43 arquivos hoje, referência
   `empreendimento/EmpreendimentoDetail.tsx:144`) — não a trilha.
3. **Todo ancestral é clicável e pula direto para aquele nível.** Se os
   ancestrais são texto morto, a trilha vira legenda: use título + "Voltar".

O componente **renderiza `null` com menos de 2 itens** de propósito — é a trava
mecânica do critério 2.

### ❌ Quando NÃO usar

- **Caminho de módulo** (`Financeiro / Contas a Receber`, `Corporativo / Gestão
  de Bens`). É o §18 puro: a sidebar (`activeContextLabel` + item ativo de
  `Layout.tsx`) já diz onde o usuário está. Foi por isso que a barra de
  breadcrumb de `SalesManagementModule.tsx:77` foi removida.
- **Como navegação global.** O app **não tem roteamento por URL** (zero
  `react-router`/`useNavigate`): a navegação é estado em `AppRouter`. Trilha sem
  URL não é linkável, não sobrevive a F5 e não alimenta o Voltar do navegador —
  cada nível precisa de handler manual. Ampliar o escopo desta seção só faz
  sentido **depois** de existir roteamento por URL; até lá, é decisão explícita,
  não aplicação de padrão.
- **Chrome de app mobile** (`TasksMobileApp.tsx:797`) — lá o cabeçalho é
  botão-voltar + título, vocabulário de app nativo, fora do escopo deste guia.

### Estilo (já embutido no componente — não reescrever)

`text-xs font-medium text-gray-400`, separador `<ChevronRight className="w-3.5
h-3.5 text-gray-300" />`, ancestral clicável com `hover:text-blue-600`, nível
atual `text-gray-600 font-semibold` + `aria-current="page"`. `truncate
max-w-[16rem]` por crumb — nome de obra/unidade estoura a linha sem isso.
Semântica: `<nav aria-label="Trilha de navegação">`.

> ✅ Azul só no hover. A trilha é orientação, não ação — não compete com o botão
> primário (§17), que é o único azul sólido da tela.
> ✅ Quando existe, a trilha fica **acima do `<h1>`** dentro do mesmo bloco de
> título (§20), não numa barra própria.
> ℹ️ `text-xs` aqui (e não o `text-sm` do corpo) é deliberado: a trilha é
> secundária ao título que vem logo abaixo.

### Estado das ocorrências (2026-08-03)

| Arquivo | Veredito |
|---|---|
| `StructuralModule.tsx:368` | ✅ migrado — 3 níveis (Estruturas → estrutura → elemento), caso canônico |
| `OpuraCnoModule.tsx:810` | ✅ migrado — trilha navegável (o crumb raiz limpa a obra selecionada) |
| `OfficesDashboard.tsx:192` | ✅ N/A — era só um botão "Voltar" com comentário errado; comentário corrigido |
| `TasksMobileApp.tsx:797` | ✅ N/A — chrome mobile (exceção acima) |
| `OpuraAssetsModule.tsx:802` | ❌ pendente — `Corporativo / Gestão de Bens` é caminho de módulo estático, sem navegação: a correção é **remover**, não migrar. Não feito aqui porque mexe no cabeçalho em card que o §20 marca como "não migre sem decisão explícita". |

---

## CHECKLIST DE FECHAMENTO

Percorrer antes de dizer "aplicado". Reportar item a item, não em bloco.

| # | Verificar | Erro comum |
|---|---|---|
| 1 | `h1` solto + subtítulo `mt-1.5` (§20) | título dentro de card/hero |
| 2 | Abas em card branco, **antes dos KPIs** (§19.1/§19.3) | "tela sem abas" sem olhar o pai |
| 3 | `KpiCard`, cor semântica por KPI (§4) | card reimplementado à mão |
| 4 | Escopo em barra própria (§5.3) | escopo fundido na barra de busca |
| 5 | Toolbar acoplada; **`px-6` + `border-r` nas células** (§5.2/§6.6) | `px-4` sem separador |
| 5b | Se redimensiona: espaçador antes de "Ações" + botão de autofit (§6.1.1/§6.1.2) | borda de "Ações" anda ao arrastar coluna |
| 6 | `rounded-[10px]`/`rounded-[6px]`, controles `h-9` (§16) | `rounded-2xl`/`rounded-xl` sobrando |
| 7 | Tipografia da tabela (§7) | `font-bold`/`text-xs` em célula de dado |
| 8 | Ações como link de texto; destrutiva com `useConfirm()` (§9/§14) | botão com borda+sombra na linha |
| 9 | Criar/editar/excluir atualiza o array local, sem recarregar tudo; scroll preservado ao voltar de edição em página cheia (§22) | `carregar()`/refetch completo por 1 item; foco "volta pra primeira linha" |

Depois:

```bash
bash scripts/check-ui-standard.sh components/SuaTela.tsx   # violações mecânicas
npx tsc --noEmit -p .                                      # build quebra com QUALQUER erro TS
```

E abrir a tela no navegador ao lado do Extrato. Se não deu para verificar
visualmente, **dizer isso** em vez de afirmar que está aplicado.

---

*(Documento unificado e autocontido. Atualizar aqui diretamente quando o padrão
do Extrato / `SupplyChainOrderList.tsx` mudar. Fusão de
`docs/ui_ux_standard_guide.md` + `UI UX tabela.md`.)*
