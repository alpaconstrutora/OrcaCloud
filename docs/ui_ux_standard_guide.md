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
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
        : 'text-gray-400 hover:text-gray-600'
      }`}
      title="Visualização em Grade"
    >
      <LayoutDashboard className="w-5 h-5" />
    </button>
    <button
      onClick={() => setViewMode('list')}
      className={`p-2.5 rounded-xl transition-all ${viewMode === 'list'
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
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

*(Fim do documento. Atualizar sempre que `SupplyChainOrderList.tsx` for refatorado como referência.)*
