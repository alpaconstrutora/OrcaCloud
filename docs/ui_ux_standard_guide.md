# Padrão Global de UI e UX — OrçaCloud SaaS

> **FONTE DA VERDADE:** `components/SupplyChainOrderList.tsx`
>
> Este guia contém snippets reais copiados diretamente do componente de referência.
> Ao aplicar o padrão em qualquer tela, **copie os snippets abaixo e adapte apenas os dados**
> (nomes de colunas, labels, ícones específicos). Não interprete — cole.

---

## CHECKLIST DE APLICAÇÃO

Ao aplicar o padrão em uma nova tela, marque cada item:

- [ ] **IMPORTS** — `ColumnConfig`, `useTableColumns`, `ColumnConfigButton`, `SortableHeader`, `usePersistedState` de `./ui/TableUtils`
- [ ] **COLUMNS const** — array `ColumnConfig[]` definido fora do componente
- [ ] **State** — `usePersistedState` para search/filtros, `useTableColumns` para colunas
- [ ] **KPI Cards** — usar o componente `components/ui/KpiCard.tsx` (não reimplementar à mão)
- [ ] **Toolbar** — search + filtros + `ColumnConfigButton` + botões grid/lista
- [ ] **`<thead>`** — `SortableHeader` em cada coluna (exceto a de ações)
- [ ] **`<tbody>` TDs** — classes de fonte corretas por tipo de dado
- [ ] **Campos editáveis inline (select/dropdown/LazySelect dentro de TD)** — MESMA tipografia do TD (`text-sm font-normal`), nunca `text-xs`/`font-bold`/`uppercase` só porque "parece um chip"
- [ ] **StatusBadge** — `text-sm font-normal` + cor de texto. ❌ sem pílula, fundo ou uppercase
- [ ] **Coluna de Ações** — sempre visível, botão "Ver Detalhes" em texto azul + ícones secundários
- [ ] **Loading State** — spinner centralizado, `text-center py-12`
- [ ] **Empty State** — ícone grande + título + subtítulo
- [ ] **Toast de Notificação** — fixo `bottom-6 right-6`, verde=sucesso/vermelho=erro
- [ ] **Modal de Confirmação** — usar `useConfirm()` de `./ui/confirm` (nunca `window.confirm()`/`confirm()` nativo)

---

## CHECKLIST DE AUDITORIA COMPLETA

> Este checklist é **diferente** do `CHECKLIST DE APLICAÇÃO` acima. Aquele é
> pra quando você está construindo/corrigindo uma tela. Este é pra quando o
> pedido é um **levantamento** — "liste o que está e o que não está
> implementado", "audite 100% do padrão", "confere se bate com o guia" — e a
> resposta precisa ser confiável o suficiente pra não precisar ser refeita.
>
> **Origem:** em 2026-07-09, uma auditoria de `ClientList.tsx` pediu "liste
> 100% do padrão" e foi respondida por amostragem (focando nos problemas mais
> visíveis), pulando as seções §6.1 e §17 inteiras. Quando perguntado
> "auditou 100%?", o §17 foi corrigido mas o §6.1 e o §6.2 continuaram fora —
> e mesmo assim a resposta declarou "18/18 seções auditadas". Isso não pode
> se repetir: uma auditoria "completa" que na verdade é parcial é pior do que
> nenhuma, porque é reportada com confiança de que é definitiva.

**Regra mecânica:** toda seção numerada deste documento (a lista abaixo é a
lista real, hoje — se o documento ganhar/perder seções, atualize a lista
antes de rodar a auditoria) entra na saída para o usuário, **uma por uma,
sem pular nenhuma**, com veredito + evidência (`arquivo:linha`) — inclusive
as que estão OK, inclusive as que "obviamente não se aplicam" (a razão de
não se aplicar também é evidência, e tem que ser específica da tela, não
genérica: "é opcional" não é razão suficiente, "esta tela tem só 4 colunas e
nenhuma com dado longo, então redimensionamento não agrega" é razão
suficiente).

- [ ] §1 Imports obrigatórios
- [ ] §2 Columns — definição das colunas
- [ ] §3 State — filtros persistidos e colunas
- [ ] §4 KPI Cards (+ §4.1 `sub` opcional, §4.2 quebra de simetria, §4.3 uppercase por `size`)
- [ ] §5 Toolbar (+ §5.1 variante desaninhada — qual das duas foi escolhida e por quê)
- [ ] §6 Tabela — container e `<thead>`
- [ ] §6.1 Redimensionamento de colunas — decisão explícita (tem ou não tem, por quê)
- [ ] §6.2 `<thead>` sentence case vs uppercase — decisão explícita (qual escala, por quê)
- [ ] §6.3 Toda coluna de valor único é ordenável — conferir cada coluna, exceções documentadas
- [ ] §6.4 Sem dropdown de ordenação fora do `<thead>`
- [ ] §6.5 Cabeçalho fixo (sticky) — decisão explícita
- [ ] §7 Tabela — `<tbody>` e TDs (tipografia por tipo de dado)
- [ ] §7.1 Campos editáveis inline dentro de TD
- [ ] §8 Status Badge
- [ ] §9 Coluna de Ações (+ §9.1 ação dominante via clique na linha, se aplicável)
- [ ] §10 Barra de ações em lote (+ §10.1 seleção de intervalo Shift+clique) — decisão explícita se a tela tem seleção múltipla
- [ ] §11 Loading State
- [ ] §12 Empty State
- [ ] §13 Toast de notificação
- [ ] §14 Modal de confirmação (`useConfirm()`, nunca `confirm()`/`window.confirm()` nativo)
- [ ] §15 Responsividade
- [ ] §16 Escala de radius — padrão vs compacta (qual foi usada, consistente na tela toda?)
- [ ] §17 Botão primário — variante compacta vs padrão (decisão explícita, não default herdado de componente compartilhado)
- [ ] §18 Não duplicar contexto já visível no shell

**Critério de "auditoria completa" cumprido:** todas as linhas acima aparecem
na resposta final com veredito. Não é permitido dizer "X% do padrão auditado"
ou "conforme" antes dessa lista existir por escrito, nem reaproveitar
veredito de uma auditoria anterior na mesma conversa sem revisitar o item —
o histórico já mostrou que "essa já tinha sido checada" às vezes não tinha.

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
// Copiado de SupplyChainOrderList.tsx L43-L47
// usePersistedState: filtros sobrevivem a navegação e reload (salvo no localStorage)
const [searchTerm, setSearchTerm] = usePersistedState<string>('nomeTela:search', '');
const [viewMode, setViewMode]     = usePersistedState<'grid' | 'list'>('nomeTela:viewMode', 'list');
const tableColumns = useTableColumns(COLUMNS, 'nomeTelaColumns');
//                                             ^^^^^^^^^^^^^^^^
//                                             chave única por tela
```

> ✅ Usar `usePersistedState` para `searchTerm` e `viewMode` — nunca `React.useState` simples para esses.

---

## 4. KPI CARDS (Dashboards)

**Não reimplemente este card à mão.** Existe um componente canônico —
`components/ui/KpiCard.tsx` — que já aplica exatamente o snippet abaixo,
incluindo as 12 cores de paleta disponíveis. Toda tela nova (ou corrigida) deve
importar e usar `<KpiCard>`, não copiar o JSX.

```tsx
import { KpiCard } from './ui/KpiCard';

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <KpiCard
    label="LABEL DO KPI"
    value={valor}
    sub="Legenda de apoio"
    icon={<IconName className="w-5 h-5" />}
    color="blue" // blue | emerald | amber | red | purple | gray | violet | orange | indigo | rose | teal | cyan
  />
</div>
```

Snippet de referência (o que `KpiCard.tsx` renderiza por baixo — só para
entender a estrutura, não para copiar):

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

> ❌ Nunca reimplementar o card manualmente numa tela nova — isso é como o
> valor de um KPI já apareceu com `font-normal` em vez de `font-bold` em
> `ProjectFinancialManager.tsx`: um "conserto" manual que só troca um erro por
> outro. Use o componente.

### 4.1 `sub` é opcional — omita quando for redundante

O prop `sub` (legenda de apoio) existe para dar contexto que o `label` sozinho
não dá (ex: "Confirmados" com sub "Baseado em 12 pedidos concluídos"). Não
preencha `sub` só para preencher — se ele só repete o que `label` e `value`
já dizem (ex: label "Total de Fornecedores", sub "Cadastrados na
organização"), omita o prop. Menos uma linha por card reduz a altura do bloco
de KPIs sem perder informação.

### 4.2 Quebra de simetria — quando um KPI é "o principal"

Quando um dos KPIs é o total do qual os outros são a decomposição (ex: Total
→ PJ/PF/Categorias, ou Total → Pendente/Aprovado/Rejeitado), não renderize
todos como cards de largura e destaque iguais — isso comunica "importância
igual" quando não é o caso. Use `size="lg"` + `className="col-span-2"` no
KPI principal e `size="sm"` nos demais:

```tsx
<div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
  <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de Fornecedores" value={total} icon={<Truck className="w-4 h-4" />} color="blue" />
  <KpiCard shadow={false} size="sm" label="Pessoa Jurídica" value={pj} icon={<Building2 className="w-4 h-4" />} color="indigo" />
  <KpiCard shadow={false} size="sm" label="Pessoa Física" value={pf} icon={<Users className="w-4 h-4" />} color="purple" />
  <KpiCard shadow={false} size="sm" label="Categorias" value={categorias} icon={<Tag className="w-4 h-4" />} color="amber" />
</div>
```

> ℹ️ `size` aceita `'sm' | 'md' | 'lg'` (default `'md'`, idêntico ao histórico
> — telas existentes não são afetadas). `sm`/`lg` reduzem o padding do card
> (`px-3.5 py-2.5` / `px-4 py-2.5` vs `p-5` do `md`) e usam ícone solto (sem
> caixa circular colorida) inline com o label, em vez do bloco de ícone à
> esquerda do `md`.
> ℹ️ O contraste de escala entre principal e secundários é `text-3xl` (30px,
> `size="lg"`) vs `text-lg` (18px, `size="sm"`) — não `text-2xl` vs `text-lg`;
> a diferença menor não lia como hierarquia num teste real.
> ℹ️ Ícone em `size="sm"`/`"lg"`: use `w-4 h-4` (16px), não `w-5 h-5` — o ícone
> aqui é decorativo ao lado do label, não o elemento dominante do card como no
> bloco circular do `md`.
> ℹ️ Se os KPIs são todos do mesmo nível de importância (sem "um total dos
> outros"), mantenha a grade simétrica `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
> da seção 4 — a quebra de simetria é para quando a hierarquia existe de fato,
> não um estilo padrão.

### 4.3 `sm`/`lg` também tiram o `uppercase` do label — escopo por `size`

Nos tamanhos `sm`/`lg`, o label do KPI sai de `uppercase tracking-wider` para
sentence case (o `md`, usado no resto do sistema, mantém uppercase
intacto — é o padrão oficial da seção acima, não mudou). O componente decide
isso sozinho por `size`, nada a fazer na tela que usa `<KpiCard>`. Além disso,
o espaçamento vertical do label/valor usa `leading-none` + `mb-1.5` fixo em
vez do `line-height` padrão do navegador — é essa folga de `line-height`, não
o padding do card, que normalmente infla a altura "vazia" abaixo do número.

---

## 5. TOOLBAR (Barra de Pesquisa e Controles)

Copiar integralmente e substituir apenas os filtros específicos:

```tsx
<div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">

  {/* Search Input — não alterar classes */}
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

  {/* Filtros Rápidos (Toggle) + Botão Refresh — adaptar filtros específicos */}
  <div className="flex items-center gap-2">
    {/* Filtro Rápido Toggle — exemplo com cor amber */}
    <button
      onClick={() => setFiltroAtivo(f => f === 'ativo' ? 'all' : 'ativo')}
      className={`flex items-center gap-2 px-4 py-4 rounded-[1.25rem] transition-all active:scale-95 shadow-sm text-sm font-semibold uppercase tracking-wider whitespace-nowrap ${
        filtroAtivo === 'ativo'
          ? 'bg-amber-500 text-white'
          : 'bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white'
      }`}
    >
      <IconFiltro className="w-4 h-4" />
      Label Filtro
    </button>

    {/* Botão Refresh — não alterar classes */}
    <button
      onClick={loadData}
      className="p-4 bg-blue-50 text-blue-600 rounded-[1.25rem] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm"
    >
      <Filter className="w-4 h-4" />
    </button>
  </div>

  {/* Agrupador ViewMode + ColumnConfig — não alterar estrutura */}
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
    <button
      onClick={() => setViewMode('grid')}
      className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid'
        ? 'bg-blue-600 text-white'
        : 'text-gray-400 hover:text-gray-600'
      }`}
      title="Visualização em Grade"
    >
      <LayoutDashboard className="w-5 h-5" />
    </button>
    <button
      onClick={() => setViewMode('list')}
      className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
        ? 'bg-blue-600 text-white'
        : 'text-gray-400 hover:text-gray-600'
      }`}
      title="Visualização em Lista"
    >
      <Table2 className="w-5 h-5" />
    </button>
  </div>

</div>
```

> ℹ️ Se a tela **não tem** modo grid/lista (ex: Recebimento), omitir os dois botões de viewMode
> e deixar apenas o `ColumnConfigButton` com um `<div className="w-px bg-gray-200 mx-1 my-1">`.
> ✅ O botão ativo do toggle grid/lista usa só `bg-blue-600 text-white` — sem
> `shadow-lg shadow-blue-200`. A cor sólida já basta pra indicar o estado
> selecionado; sombra em cima disso é o mesmo problema do botão primário (§17):
> dois elementos competindo por destaque quando um já resolve sozinho.

### 5.1 Variante desaninhada (sem card externo)

O snippet acima envolve a busca num card branco (`bg-white p-5 rounded-[2.5rem]
border shadow-sm`) que por sua vez contém um `<input>` com sua própria borda —
duas molduras concêntricas ("caixa dentro de caixa"). Em telas onde a página já
tem respiro suficiente (ex: logo abaixo de KPI cards), prefira a variante sem
card externo: a barra vira uma régua de controles direto sobre o fundo da
página, mais baixa e mais leve. Extraído de `components/SupplierList.tsx` (F5).

```tsx
{/* Sem card externo — controles direto sobre o fundo da página, todos com h-9 (36px) */}
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

  {/* Refresh — h-9 quadrado, ícone RefreshCw (não Filter/funil: esse ícone já
      é usado por "Filtro avançado" ao lado; dois funis lado a lado para ações
      diferentes é o tipo de ambiguidade que esta variante evita) */}
  <button onClick={loadData} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95">
    <RefreshCw className="w-4 h-4" />
  </button>

  {/* Separador entre o grupo "filtrar" (busca/ordenar/filtro avançado/refresh)
      e o grupo "visualizar" (colunas/grid/lista) — só nesta variante, porque
      sem o card externo os dois grupos perdem o limite visual que a borda do
      container dava */}
  <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

  {/* ColumnConfig + ViewMode: mesmo agrupador da seção 5, mas h-9 e radius 10px
      (não rounded-2xl) para acompanhar o resto da régua */}
  <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
    <ColumnConfigButton /* ...mesmas props da seção 5... */ />
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

> ✅ Escolha **uma das duas variantes** por tela — não misture card externo em
> alguns controles e régua nua em outros na mesma toolbar.
> ✅ Ambas as variantes são válidas; a com card (§5) tem mais peso visual e
> funciona bem como primeiro elemento da página. A desaninhada (§5.1) é mais
> leve e funciona melhor quando já há KPI cards acima dando contexto.
> ❌ Não empilhar as duas bordas (input com borda dentro de um container com
> borda) — isso é o defeito que esta variante corrige.
> ℹ️ Esta variante usa a escala de radius compacta (§16): `10px` em containers,
> `6px` em inputs/botões — não a escala `rounded-[1.25rem]`/`rounded-2xl` da §5.
> Ver §16 antes de decidir qual escala usar numa tela nova.

---

## 6. TABELA — Container e `<thead>`

```tsx
<div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
  <table className="w-full text-left border-collapse">

    {/* THEAD — não alterar classes do <thead> nem do <tr> */}
    <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
      <tr>
        {/* Coluna de Checkbox (apenas se houver ações em lote) */}
        <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
            checked={allVisibleSelected}
            disabled={selectableVisible.length === 0}
            onChange={toggleAllVisible}
          />
        </th>

        {/* Colunas com SortableHeader — não alterar props, apenas mudar colKey/label/className */}
        {tableColumns.visibleColumns.includes('number') && (
          <SortableHeader
            colKey="number"
            label="Número"
            sortColumn={tableColumns.sortColumn}
            sortDirection={tableColumns.sortDirection}
            onSort={tableColumns.handleColumnSort}
            className="px-6 py-2 border-r border-gray-100"
          />
        )}
        {tableColumns.visibleColumns.includes('obra') && (
          <SortableHeader colKey="obra" label="Obra"
            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
            onSort={tableColumns.handleColumnSort}
            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
        )}
        {/* ... demais colunas seguem o mesmo padrão ... */}

        {/* Coluna de Ações — sempre a última, sem SortableHeader */}
        {tableColumns.visibleColumns.includes('actions') && (
          <th className="px-6 py-2 text-right">Ações</th>
        )}
      </tr>
    </thead>
```

---

## 6.1 REDIMENSIONAMENTO DE COLUNAS (opcional)

Quando a tela tem muitas colunas ou o usuário precisa ajustar a largura para
ler melhor um dado específico, use o hook `useResizableColumns` (também em
`./ui/TableUtils`) — arrastar a borda direita do cabeçalho redimensiona;
duplo clique restaura a largura padrão. Larguras persistidas em localStorage
por tela. Extraído de `components/BankReconciliation.tsx` (tabela de Extrato)
para virar padrão reutilizável — não é obrigatório em toda tabela, só onde
fizer sentido (tabelas com muitas colunas/dado variável).

```tsx
import { useResizableColumns } from './ui/TableUtils';

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  nome: 220, categoria: 140, obra: 140, data: 100, valor: 130,
};
const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'minhaTelaColWidths');

<table ref={cols.tableRef} className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
  <colgroup>
    <col style={{ width: '40px' }} /> {/* checkbox */}
    {COLUMNS.filter(c => c.key !== 'actions').map(c => (
      tableColumns.visibleColumns.includes(c.key) && (
        <col key={c.key} data-col-key={c.key} style={{ width: `${cols.getWidth(c.key)}px` }} />
      )
    ))}
    {tableColumns.visibleColumns.includes('actions') && <col style={{ width: '160px' }} />}
  </colgroup>
  <thead>
    <tr>
      {/* ... */}
      <SortableHeader colKey="nome" label="Nome" sortColumn={...} sortDirection={...} onSort={...} className="px-6 py-2 border-r border-gray-100 overflow-hidden">
        <cols.ResizeHandle colKey="nome" />
      </SortableHeader>
    </tr>
  </thead>
```

> ✅ `table-layout: fixed` no `<table>` é obrigatório para o `<colgroup>` controlar a largura de fato.
> ✅ `SortableHeader` precisa da classe `overflow-hidden` quando tem `ResizeHandle` como filho (evita que o texto do rótulo vaze sobre a alça).
> ℹ️ Se uma coluna não tem campo de ordenação correspondente no estado da tela, use `sortable={false}` nela — ela ainda ganha a alça de redimensionar, só não fica clicável para ordenar.
> ⚠️ Ao adotar redimensionamento numa tela, aplique em **todas as colunas de
> dado** (não só nas "principais") — coluna parcial de resize é inconsistência
> visível (o usuário não entende por que só algumas bordas arrastam). A coluna
> de checkbox é a única exceção aceitável: é utilitária, não é dado.

### 6.2 Variante `<thead>` sentence case (densidade alta)

**Regra:** toda tela que adota a escala de radius compacta (§16) usa `<thead>`
em sentence case — não é mais "teste e decida", é acoplado. `SupplierList.tsx`
e `ClientList.tsx` já seguem isso; `InvestorList.tsx` ficou pra trás numa
correção (2026-07-10) — a escala compacta foi migrada mas o `<thead>` continuou
`uppercase`, gerando inconsistência visível entre telas irmãs do mesmo módulo
(Fornecedores/Clientes em sentence case, Investidores em caixa alta). Antes
disso, o `<thead>` da seção 6 (`uppercase text-xs tracking-wider`) era o
"padrão oficial e continua valendo por padrão" — texto que deixava a decisão
solta demais e permitiu a inconsistência. Não decida "por tela" sem comparar
com as telas do mesmo módulo/nível — a régua abaixo é a régua nova:

- Escala **padrão** (§16) → `<thead>` uppercase (seção 6, sem mudança).
- Escala **compacta** (§16) → `<thead>` sentence case (esta seção), sempre.

Cada tabela ainda define seu próprio `<thead>` no código (não é componente
compartilhado), então a troca continua sendo local a um arquivo — só o
critério de quando trocar deixou de ser "teste e veja" e virou consequência
direta da escolha de escala do §16.

> ⚠️ **`SortableHeader` força `uppercase tracking-wider` internamente** —
> trocar só a classe do `<tr>`/`<thead>` não muda nada nas colunas ordenáveis
> (foi um erro real: uma tela ficou marcada como "sentence case" no código sem
> ter efeito visual nenhum). Use o prop `uppercase={false}`:
>
> ```tsx
> <SortableHeader label="Fornecedor" colKey="name" uppercase={false} ... />
> ```
>
> **Exceção — siglas ficam maiúsculas mesmo em sentence case:** `ID`, `CNPJ`,
> `CPF`, `CNO`, `INSS`, `NF-e`, `XML`. `uppercase={false}` só normaliza o
> `text-transform`/`tracking` do cabeçalho — o texto do `label` já deve estar
> escrito como quer aparecer (ex: `label="CNPJ"` continua saindo `CNPJ`,
> `label="Fornecedor"` sai `Fornecedor`, nunca `FORNECEDOR`).

```tsx
<tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
```

> ⚠️ Diferente do label do KPI Card (§4.3), aqui não há um prop que isole a
> variante — é uma troca manual de classe por tela. Se decidir adotar em mais
> de uma tela, o texto do label (`'Fornecedor'`, `'Categoria'`...) já deve
> estar em capitalização normal no código — a versão uppercase antiga
> dependia só da classe CSS `uppercase` para transformar o texto.

### 6.3 Toda coluna de valor único é ordenável

Regra: se a coluna representa **um único valor comparável** (texto, número,
data, dinheiro), ela é `sortable: true`. Não deixe coluna sem ordenação só
porque "não pensei nisso" — a exceção tem que ser justificada, não omissão.

> ✅ Exceção legítima: colunas **compostas**, que juntam mais de um dado sem
> um valor dominante óbvio para ordenar (ex: "Contato" = e-mail + telefone na
> mesma célula). Documente a exceção com um comentário no `COLUMNS`, como em
> `components/SupplierList.tsx`:
> ```tsx
> // Contato = e-mail + telefone combinados — sem valor único óbvio pra ordenar.
> { key: 'contact', label: 'Contato', sortable: false },
> ```
> ❌ Não é exceção legítima: "a coluna raramente é usada pra ordenar" ou
> "dava mais trabalho implementar" — se o dado é comparável, é ordenável.
> ℹ️ A coluna `actions` nunca é ordenável (seção 2) — isso não é uma exceção
> no mesmo sentido, é estrutural (não existe "valor" numa coluna de botões).

### 6.4 Sem dropdown de ordenação fora do `<thead>`

Se toda coluna relevante já ordena pelo próprio cabeçalho (§6.3), não crie um
`<select>` de "Ordenar por" na toolbar — são dois controles fazendo a mesma
coisa, e o dropdown nem cobre as mesmas opções que os cabeçalhos (fica preso a
2-3 critérios hardcoded enquanto o `<thead>` cobre todas as colunas
ordenáveis). Se a tela tinha um `sortBy` com fallback tipo `'name-asc'`,
mova esse fallback pra dentro do `.sort()` como default **quando nenhuma
coluna estiver selecionada** — sem expor um controle pra isso:

```tsx
return result.sort((a, b) => {
  if (tableColumns.sortColumn) {
    // ...ordena pela coluna clicada...
  }
  return a.name.localeCompare(b.name); // default sem seleção: nome A-Z
});
```

> ❌ Não é o mesmo caso do "Filtro Rápido" da seção 5 — aquilo é um filtro
> (reduz o conjunto), isto é ordenação (reordena o mesmo conjunto). Ordenação
> já tem seu controle nativo no `<thead>`; filtro rápido não.

### 6.5 Cabeçalho fixo (sticky) em tabelas longas

Se a tabela pode crescer além da altura confortável de tela (listas com
muitos registros), o container da tabela ganha altura própria com rolagem
vertical, e o `<thead>` fica fixo no topo dessa área — sem isso o usuário
rola a lista, perde a referência de qual coluna é qual, e tem que rolar de
volta pra conferir.

```tsx
<div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
  <div className="overflow-auto max-h-[70vh]">
    <table ref={cols.tableRef} className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
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

> ✅ `sticky top-0 z-10` vai no `<tr>` do `<thead>` (não só no `<thead>`) —
> precisa também ter um `bg-*` **opaco** (`bg-gray-50`, não transparente),
> senão as linhas da tabela aparecem "por trás" do cabeçalho ao rolar.
> ✅ Isso troca a página de "rola inteira" para "tabela rola dentro de uma
> altura fixa" (`overflow-auto` no container, não mais só `overflow-x-auto`)
> — o scroll horizontal (se houver) continua funcionando no mesmo container.
> ℹ️ `max-h-[70vh]` é ponto de partida, não valor fixo — ajuste conforme o
> resto da tela (KPI cards, toolbar) para a tabela não ficar cortada acima da
> dobra. Extraído de `components/SupplierList.tsx`.

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

```tsx
{/* Texto básico (nome, fornecedor, obra) */}
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
  {item.nome}
</td>

{/* Texto atenuado (número, data, contagem) */}
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
  {item.number}
</td>

{/* Link / Item relacionado (ex: orçamento vinculado) */}
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-blue-600">
  {item.orcamento}
</td>

{/* Valor financeiro — ÚNICO caso que usa font-medium */}
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800">
  {formatMoney(item.value)}
</td>
```

> ❌ **NUNCA usar `font-mono`, `font-bold` ou `font-black` em TDs de dados comuns.**
> ✅ `font-medium` SOMENTE para valores financeiros.

### 7.1 Campos editáveis inline dentro de TD (select / dropdown / LazySelect)

Quando uma célula não é texto estático, e sim um campo editável (ex: `<select>` de categoria,
combobox de fornecedor/cliente, `LazySelect`), a regra de tipografia é **a mesma do TD de texto
comum**. O fato de o campo ser interativo não é motivo para usar `text-xs`, `font-bold` ou
`uppercase` — isso quebra a leitura horizontal da linha (a célula fica com peso/tamanho diferente
das demais na mesma linha).

```tsx
{/* Select/LazySelect dentro de TD — mesma tipografia do TD comum */}
<select
  className={`text-sm font-normal px-2 py-1 rounded border transition-all appearance-none cursor-pointer ${
    value ? 'text-gray-900 bg-gray-50 border-gray-100' : 'text-gray-400 bg-white border-dashed border-gray-200'
  }`}
  ...
/>
```

> ✅ Pode variar `bg-*`/`border-*` para indicar estado preenchido vs. vazio (isso é funcional, não tipográfico).
> ❌ **NUNCA** `text-xs`, `font-bold`, `font-black` ou `uppercase tracking-wider` num campo editável dentro de TD — mesmo que pareça estilizado como "chip"/"pill". Se precisar de um badge visual de verdade, use o padrão da seção 8 (StatusBadge).

---

## 8. STATUS BADGE

**Texto simples colorido — sem pílula, sem fundo, sem uppercase.**

```tsx
// Copiado de SupplyChainOrderList.tsx L133
const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
        'Confirmado':  'text-gray-800',
        'Separação':   'text-blue-700',
        'Em Trânsito': 'text-indigo-800',
        'Entregue':    'text-amber-800',
        'Recebido':    'text-green-800',
        'Divergência': 'text-red-600',
        'Rascunho':    'text-gray-600',
        'Enviado':     'text-blue-600',
        'Cancelado':   'text-red-600',
    };
    return (
        <span className={`text-sm font-normal ${colors[status] || 'text-gray-600'}`}>
            {status}
        </span>
    );
};
```

> ❌ **NUNCA usar** `rounded-full`, `uppercase`, `font-black`, `bg-*` ou `px-2 py-1` no StatusBadge.
> ✅ Apenas `text-sm font-normal` + cor de texto.

---

## 9. COLUNA DE AÇÕES

**Sempre visível.** Nunca usar `opacity-0 group-hover:opacity-100`.

```tsx
{tableColumns.visibleColumns.includes('actions') && (
  <td className="px-6 py-2.5 text-right">
    <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>

      {/* Ação primária — botão de texto azul */}
      <button
        onClick={(e) => { e.stopPropagation(); onViewDetails(item.id); }}
        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
      >
        Ver Detalhes
      </button>

      {/* Ação secundária — apenas ícone */}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(item.id); }}
        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors ml-1"
        title="Editar"
      >
        <Pencil className="w-4 h-4" />
      </button>

      {/* Menu de ações terciárias (Logística, Duplicar, Excluir) */}
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

### 9.1 Ação dominante via clique na linha — quando não sobra "Ver Detalhes"

Nem toda tela tem uma tela de detalhes separada. Quando clicar na linha já
abre a única ação relevante (ex: editar, num CRUD simples de cadastro), não
duplique essa ação como botão de texto na coluna — a linha inteira já é
clicável (`onClick` no `<tr>`, `cursor-pointer`, `hover:bg-blue-50/50` da
seção 7 já sinalizam isso visualmente). Nesse caso a coluna de ações fica só
com o que **não** é a ação dominante — tipicamente exclusão, isolada de
propósito para não ser acionada sem querer:

```tsx
<td className="px-6 py-2.5 text-right">
  {/* Editar = clique na linha (ação dominante). Kebab só tem o que sobra. */}
  <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
    <InlineDisclosureMenu showDelete onDelete={() => performDelete(item.id)} />
  </div>
</td>
```

> ✅ Use isto **só quando o clique na linha já é inequívoco** (uma única ação
> óbvia). Se a linha tem múltiplas ações prováveis (ver detalhes ≠ editar ≠
> duplicar), volte para o padrão da seção 9 — "Ver Detalhes" + ícone + menu.
> ❌ Não deixe um botão de texto "Editar" fazendo a mesma coisa que o clique
> na linha já faz — são dois controles para uma ação, não dois controles para
> duas ações. Extraído de `components/SupplierList.tsx`.

---

## 10. BARRA DE AÇÕES EM LOTE (F3)

**Fixa no rodapé, fora do fluxo normal da lista** (`position: fixed`), não
inline no topo da tabela. Isso é deliberado: colocar a barra dentro do fluxo
normal forçaria reflow de toda a lista a cada seleção/desmarcação (fica visível
em listas grandes — foi assim que o padrão abaixo nasceu, em
`components/BoletoManager.tsx`). Paleta **azul**, não vermelha — vermelho fica
reservado para ações destrutivas específicas (botão Excluir dentro da barra,
Modal de Confirmação da seção 14), não para o estado de seleção em si.

```tsx
{selectedIds.size > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
    <span className="flex-1 text-sm font-bold whitespace-nowrap">
      {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
      <span className="ml-2 font-normal opacity-75">· {formatMoney(totalSelecionado)}</span>
    </span>
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setIsLoteEditOpen(true)}
      className="text-blue-700 border-none hover:bg-blue-50"
    >
      <Pencil className="w-3.5 h-3.5" />
      Editar em Lote
    </Button>
    <button
      onClick={clearSelection}
      className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-400 transition-colors"
    >
      <X className="w-3.5 h-3.5" />
      Desmarcar
    </button>
  </div>
)}
```

> ✅ A edição em lote (categoria, obra, fornecedor/cliente, centro de custo etc.)
> deve abrir um **modal dedicado** ("Editar em Lote") a partir do botão acima —
> não empilhar múltiplos `<select>` inline dentro da própria barra. Ver
> `components/BoletoEdicaoEmLoteModal.tsx` e `components/BankTxEdicaoEmLoteModal.tsx`
> como referência de modal de edição em lote.
> ℹ️ Checkboxes SÓ aparecem nas linhas que permitem ações em lote.
> Verificar permissão: `{canDelete(item.status) ? <input type="checkbox" ... /> : null}`

### 10.1 Seleção de intervalo com Shift+clique

Além do clique individual, o checkbox de cada linha deve suportar **seleção de
intervalo**: clicar num item define uma âncora; segurar **Shift** e clicar em
outro item seleciona automaticamente todos os itens entre os dois (para cima
ou para baixo na lista) — padrão universal de Explorer/Gmail/planilhas.
Extraído de `components/SupplierList.tsx` (F4).

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

// No <input type="checkbox"> de cada linha:
<input
  type="checkbox"
  title="Dica: segure Shift e clique para selecionar um intervalo"
  checked={selectedIds.has(item.id)}
  onChange={(e) => handleRowCheck(item.id, rowIndex, (e.nativeEvent as MouseEvent).shiftKey, visibleRows)}
/>
```

> ✅ A âncora (`lastCheckedIndex`) só é atualizada em cliques **sem** Shift —
> um Shift+clique repetido continua estendendo o intervalo a partir do mesmo
> ponto de partida, e nunca desmarca itens já selecionados fora do intervalo.
> ✅ `(e.nativeEvent as MouseEvent).shiftKey` funciona porque o evento `onChange`
> de um checkbox clicado com o mouse carrega o `MouseEvent` original em
> `nativeEvent` — não precisa trocar para `onClick`/`preventDefault`.
> ℹ️ Adicionar `title` no checkbox com a dica — a interação não é descobrível
> visualmente.

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

---

## 13. TOAST DE NOTIFICAÇÃO

```tsx
// Copiado de SupplyChainOrderList.tsx L802
// State: const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
// Helper: const notify = (message: string, type: 'success' | 'error' = 'success') => {
//             setNotification({ message, type });
//             setTimeout(() => setNotification(null), 4500);
//         };

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
`pendingConfirm` local por componente. `useConfirm()` já é um hook global
Promise-based, substitui `window.confirm()`/`confirm()` nativo, e evita
reimplementar o modal (backdrop-blur, ícone por variante, botões) em cada tela
— ver uso real em `components/BankReconciliation.tsx`.

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

> ❌ **NUNCA usar `window.confirm()`/`confirm()` nativo do browser** para
> confirmar ações destrutivas — quebra a identidade visual e não é acessível.
> ❌ Não reimplementar um modal de confirmação local (`pendingConfirm`/`askConfirm`)
> — isso duplica o que `useConfirm()` já resolve globalmente.
> ✅ `variant="danger"` para exclusão, `"warning"` para ações reversíveis mas
> sensíveis, `"default"` para confirmações neutras.

---

## 15. RESPONSIVIDADE

- **KPI Cards:** `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- **Toolbar:** `flex-col md:flex-row`
- **Tabela:** envolver em `overflow-x-auto` se necessário

---

## 16. ESCALA DE RADIUS — padrão vs compacta

O padrão histórico (seções 4–9, `SupplyChainOrderList.tsx`) usa uma escala de
radius grande — `rounded-[2.5rem]` em containers, `rounded-[1.25rem]`/`[1.5rem]`
em inputs e botões. Isso lê como identidade "pill"/consumer app. Testado em
`components/SupplierList.tsx`, existe uma escala alternativa mais compacta,
mais próxima de um ERP denso:

| Elemento | Escala padrão (§4–9) | Escala compacta |
|---|---|---|
| Containers (tabela, cards, toolbar agrupada) | `rounded-[2.5rem]` / `rounded-2xl` | `rounded-[10px]` |
| Inputs, botões, chips | `rounded-[1.25rem]` / `rounded-xl` | `rounded-[6px]` |
| Altura dos controles da toolbar | `py-3`/`py-4` (variável) | `h-9` (36px) uniforme |

> ✅ **Escolha uma escala por tela, não misture.** Uma tabela com
> `rounded-[10px]` ao lado de um modal `rounded-2xl` na mesma tela é
> inconsistência nova, não economia de esforço.
> ℹ️ Nenhuma das duas está "errada" — a compacta ganha em telas com muita
> densidade de dado (listas grandes, tabelas), a padrão funciona bem em telas
> com menos itens por tela. Ainda não há critério fechado de quando usar
> qual — hoje é decisão por tela, avaliar caso a caso.
> ⚠️ Isto é uma **segunda escala documentada**, não uma substituição da
> seção 4–9. Só migre uma tela existente para a compacta com decisão
> explícita — não é o novo default silencioso.

---

## 17. BOTÃO PRIMÁRIO — variante compacta

O CTA primário padrão (`px-6 py-3 rounded-[1.25rem] uppercase tracking-widest
shadow-xl`) fica ~265×50px com o texto "Novo Fornecedor" — pesado o bastante
para competir com o próprio título da página. Numa tela cujo trabalho
principal é consultar registros (não criar), isso é ruído. Variante testada,
~150×40px (ou `h-9` se o botão mora dentro da régua de controles da §5.1, não
isolado no cabeçalho):

```tsx
<button className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
  <Plus className="w-[15px] h-[15px]" />
  Novo fornecedor
</button>
```

Diferenças do padrão: `font-medium` (não `font-black`), sentence case (não
uppercase — o `tracking-widest` da caixa alta é o que inflava a largura para
265px), sem `shadow-xl`/glow (o mesmo halo azul aparece no toggle de view
ativo; dois elementos brilhando ao mesmo tempo competem por foco), radius
`6px` alinhado aos inputs em vez de `1.25rem` (que lê como card, não como
controle, num botão largo).

> ℹ️ **Onde colocar o botão** depende da frequência de uso: ação rara (ex:
> cadastro esporádico) → mova para dentro da régua de controles (§5.1), à
> direita dos toggles de view — o cabeçalho vira só título + subtítulo. Ação
> frequente (ex: criação é o fluxo principal da tela) → mantenha isolado e
> alinhado ao título, mas ainda no tamanho compacto acima — 50px de altura
> nunca se justifica só pela frequência de uso.
> ✅ Ele continua sendo o único elemento azul sólido da tela — isso já é
> ênfase suficiente. Caixa alta e sombra por cima disso é redundância, não
> reforço.

---

## 18. NÃO DUPLICAR CONTEXTO JÁ VISÍVEL NO SHELL

Antes de um header de tela mostrar "onde estou" (logo + nome + filtro ativo),
confira se essa informação já não está persistente em outro lugar do shell do
app (ex: `activeContextLabel` no sidebar de `components/Layout.tsx`). Um
segundo bloco de identidade — geralmente puxando de uma fonte de dado
diferente do primeiro (`nome_fantasia` vs `organizations.name`, por exemplo)
— não só ocupa altura à toa como pode divergir do primeiro (grafias
diferentes do mesmo nome, um typo em cada). Extraído da simplificação do
header em `components/OrganizationList.tsx`: o bloco "logo + Minha
Organização + Filtro Ativo: X" foi removido, sobrando só um ícone-âncora com
`title` (tooltip) para quem precisa do contexto — a nav do módulo passou a
ser o elemento dominante do header, não a identidade repetida.

---

*(Fim do documento. Atualizar sempre que `SupplyChainOrderList.tsx` for refatorado como referência.)*
