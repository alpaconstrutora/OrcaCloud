# Padrão Global de UI e UX — OrçaCloud SaaS

> **FONTE DA VERDADE:** `components/ClientList.tsx` (escala compacta, §16 — padrão
> único desde 2026-07-10) e `components/SupplyChainOrderList.tsx` (estrutura de
> KPI/tabela/toolbar/ações — mecânica geral, já migrado para a escala compacta).
>
> Este guia contém snippets reais copiados diretamente dos componentes de referência.
> Ao aplicar o padrão em qualquer tela, **copie os snippets abaixo e adapte apenas os dados**
> (nomes de colunas, labels, ícones específicos). Não interprete — cole.
> ⚠️ Onde um snippet abaixo ainda mostrar a escala de radius grande (`rounded-[2.5rem]`,
> `rounded-[1.25rem]`, `py-4`) — seções 4–9, mantidas como estavam por serem a origem
> histórica da estrutura — **use a versão compacta equivalente do §16**, não o
> radius literal do snippet. O §16 é quem manda sobre radius/altura; as seções 4–9
> mandam sobre estrutura/tipografia/conteúdo.

---

## CHECKLIST DE APLICAÇÃO

Ao aplicar o padrão em uma nova tela, marque cada item:

- [ ] **IMPORTS** — `ColumnConfig`, `useTableColumns`, `ColumnConfigButton`, `SortableHeader`, `usePersistedState` de `./ui/TableUtils`
- [ ] **Cabeçalho de tela (§20)** — `space-y-6` no container raiz, `<h1>` + `<p mt-1.5>` direto (sem card/hero), grid de KPI logo em seguida
- [ ] **COLUMNS const** — array `ColumnConfig[]` definido fora do componente
- [ ] **State** — `usePersistedState` para search/filtros, `useTableColumns` para colunas
- [ ] **KPI Cards** — usar o componente `components/ui/KpiCard.tsx` (não reimplementar à mão)
- [ ] **Toolbar** — search + filtros + `ColumnConfigButton` + botões grid/lista
- [ ] **`<thead>`** — `SortableHeader` em cada coluna (exceto a de ações)
- [ ] **Redimensionamento de colunas (§6.1), se usado** — `<table>` com largura explícita (soma das colunas), NUNCA `w-full`/100% — evita o navegador redistribuir espaço entre colunas ao arrastar
- [ ] **`<tbody>` TDs** — classes de fonte corretas por tipo de dado; `py-2.5` em toda `<td>` (§7.2)
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
- [ ] §6.2 `<thead>` sentence case (padrão único desde §16 fechado — ❌ se ainda uppercase, não é mais decisão)
- [ ] §6.3 Toda coluna de valor único é ordenável — conferir cada coluna, exceções documentadas
- [ ] §6.4 Sem dropdown de ordenação fora do `<thead>`
- [ ] §6.5 Cabeçalho fixo (sticky) — decisão explícita
- [ ] §7 Tabela — `<tbody>` e TDs (tipografia por tipo de dado)
- [ ] §7.1 Campos editáveis inline dentro de TD
- [ ] §7.2 Altura da linha — `py-2.5` em toda `<td>`, sem exceção não documentada
- [ ] §8 Status Badge
- [ ] §9 Coluna de Ações (+ §9.1 ação dominante via clique na linha, se aplicável; + §9.2 estilo do botão-ícone — `bg-white border shadow-sm rounded-xl`, não o flat antigo)
- [ ] §10 Barra de ações em lote (+ §10.1 seleção de intervalo Shift+clique) — decisão explícita se a tela tem seleção múltipla
- [ ] §11 Loading State
- [ ] §12 Empty State
- [ ] §13 Toast de notificação
- [ ] §14 Modal de confirmação (`useConfirm()`, nunca `confirm()`/`window.confirm()` nativo)
- [ ] §15 Responsividade
- [ ] §16 Escala de radius — compacta é o padrão único (❌ se a tela ainda usa `rounded-[2.5rem]`/`[1.25rem]`; consistente na tela toda?)
- [ ] §17 Botão primário — variante compacta é a única válida (❌ se herdou o estilo pesado de um componente compartilhado sem perceber)
- [ ] §18 Não duplicar contexto já visível no shell
- [ ] §19 Navegação de módulos — se a tela pertencer a um módulo com navegação de nível de módulo, conferir se é via sidebar (padrão atual) ou, em módulos legados, se a barra de abas local bate com a escala de radius/tamanho da página
- [ ] §20 Cabeçalho de tela (título + subtítulo + KPIs) — `space-y-6`, `h1` + `p mt-1.5` direto (sem card/hero, a menos que seja decisão documentada), grid de KPI logo em seguida

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

        {/* Coluna de Ações — sempre a última, sem SortableHeader.
            ⚠️ precisa repetir manualmente `text-table-header font-semibold` (+ a
            cor/case do momento) — ver aviso abaixo sobre por que isso não é opcional. */}
        {tableColumns.visibleColumns.includes('actions') && (
          <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-400 uppercase tracking-wider">Ações</th>
        )}
      </tr>
    </thead>
```

> ⚠️ **A coluna "Ações" fica menor que as outras se você esquecer o
> `text-table-header font-semibold`.** `SortableHeader` (`components/ui/TableUtils.tsx`)
> aplica `text-table-header` (14px, igual ao `text-sm` do corpo da tabela) em
> toda coluna que passa por ele — mas "Ações" é sempre um `<th>` cru (não usa
> `SortableHeader`), então sem essa classe explícita ela herda o `text-xs`
> (12px) do `<thead>`/`<tr>` pai. É uma diferença de 2px que passa quase
> despercebida em CAIXA ALTA, mas fica bem visível em sentence case (§6.2) —
> foi um erro real, presente desde a primeira versão deste snippet, e que só
> apareceu quando `SupplierList.tsx`/`ClientList.tsx`/`InvestorList.tsx`
> migraram pra sentence case (corrigido em todas em 2026-07-10). Cor/case da
> classe acompanha a variante da tela: `text-gray-400 uppercase tracking-wider`
> no padrão (acima), `text-gray-500` na variante sentence case (§6.2).
>
> 🔴 **Causa raiz mais profunda (corrigida em `index.css`, 2026-07-10):** o
> aviso acima resolve o cabeçalho ficar menor *que as outras colunas do
> mesmo thead*, mas havia um segundo bug embaixo dele — `text-table-header`
> **em si nunca funcionou em lugar nenhum do app**. O `@theme` do
> `index.css` declarava as variáveis de tamanho como `--font-size-table-header`
> etc., mas o Tailwind v4 só reconhece o namespace `--text-*` pra gerar
> classes `text-{nome}` (confirmado em `node_modules/tailwindcss/theme.css`,
> que usa `--text-xs`/`--text-sm`, não `--font-size-xs`). Ou seja:
> `text-table-header`, `text-table-body`, `text-button`, `text-form-label`,
> `text-form-input`, `text-tooltip`, `text-modal-body`, `text-card-body` e
> `text-menu` eram classes **inertes** — não geravam nenhum CSS — em ~285
> arquivos do projeto, desde que foram criadas. Corrigido renomeando as 9
> variáveis pra `--text-*` no `@theme` de `index.css`. Se algum elemento
> ainda parecer com tamanho de fonte errado depois dessa correção, o
> problema não é mais o namespace (já corrigido) — é a classe de tamanho
> escolhida pro elemento (ex: `text-xs` onde deveria ser `text-sm`), aí sim
> um caso normal de tipografia por tela, seção 7.

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

// ⚠️ NÃO uses `w-full`/100% no <table> — ver aviso abaixo. A largura da
// tabela é a SOMA exata das colunas visíveis (checkbox + colunas + actions).
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
> ⚠️ **`<table>` NUNCA com `w-full`/`width: 100%` quando usa `useResizableColumns`.**
> Bug real em `SupplierList.tsx` (2026-07-11): com `table-layout: fixed` +
> tabela em 100% de largura, se a soma das colunas do `<colgroup>` é menor que
> a largura real do container, o navegador **redistribui o espaço sobrando
> entre as colunas** — mesmo elas tendo `width` em px explícito no `<col>`.
> Sintoma: arrastar a borda de uma coluna redimensiona a vizinha errada (o
> handler em si estava correto, isolado por `colKey`; o problema é o motor de
> layout de tabela do navegador). Correção: a tabela usa `width` explícito
> igual à soma exata das colunas visíveis (`tableTotalWidth` acima, recalculado
> a cada resize/toggle de coluna), nunca uma porcentagem. Se a tabela ficar
> mais estreita que o container, sobra espaço em branco à direita — aceitável
> (o `bg-white` do card ao redor cobre), a alternativa (redistribuição
> silenciosa) é pior. Também exige um `<col data-col-key="...">` para
> **cada** `<th>`/`<td>` renderizado, na mesma ordem — um `<col>` faltando
> desalinha todas as colunas seguintes por posição (outro bug real, mesma
> correção, ao adicionar uma coluna nova em `SupplierList.tsx` sem atualizar
> o `<colgroup>`).

### 6.2 `<thead>` sentence case (padrão único, consequência do §16)

**Regra:** desde que o §16 fechou a escala compacta como padrão único, toda
tela usa `<thead>` em sentence case — não é mais condicional a qual escala a
tela "escolheu". `SupplierList.tsx` e `ClientList.tsx` já seguem isso;
`InvestorList.tsx` ficou pra trás numa correção (2026-07-10) — a escala
compacta foi migrada mas o `<thead>` continuou `uppercase`, gerando
inconsistência visível entre telas irmãs do mesmo módulo (Fornecedores/
Clientes em sentence case, Investidores em caixa alta). O `<thead>`
`uppercase text-xs tracking-wider` da seção 6 é o padrão **antigo**,
deprecado junto com a escala de radius grande do §16 — só aparece hoje em
telas ainda não migradas.

Cada tabela ainda define seu próprio `<thead>` no código (não é componente
compartilhado), então a migração continua sendo local a um arquivo — mas não
é mais uma decisão de design, é o mesmo tipo de correção que qualquer outro
item do `CHECKLIST DE AUDITORIA COMPLETA`.

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
> ❌ **Também não é exceção legítima:** "esta é uma tela secundária/fallback/
> consolidada, não a tela principal" — foi exatamente essa desculpa que
> deixou passar duas tabelas sem nenhuma ordenação (`OrganizationUsers.tsx`
> tabela de Membros, e a tabela "Todos os Usuários" de
> `OrganizationList.tsx`, corrigidas em 2026-07-11). Uma tela ser menos usada
> não muda se a coluna tem um valor único comparável — o critério do §6.3 é
> sobre o **dado**, não sobre a importância da tela. Se uma tabela não usa
> `useTableColumns`/`SortableHeader` nenhum, isso não a isenta da regra —
> é sinal de que a auditoria não chegou até ela.
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
    {/* largura explícita (soma das colunas), NUNCA w-full — ver aviso no §6.1 */}
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

### 7.2 Altura da linha — padding vertical padrão

**Regra:** todo `<td>` de dado usa `py-2.5` (10px em cima/embaixo) — inclusive
a célula de checkbox de seleção em lote. Não é "escolha por tela": é o mesmo
valor em toda tabela do sistema (`ClientList.tsx`, `SupplierList.tsx`,
`InvestorList.tsx`, `OrganizationUsers.tsx`, `FinancialRegistryManager.tsx`,
`OrganizationList.tsx`). Achado real em 2026-07-11: `SupplierList.tsx` estava
em `py-4` (16px) em todas as células — sobrou de antes da tela migrar pra
escala compacta (§16) e nunca foi revisitado — deixando a altura da linha
visivelmente diferente da tabela de Clientes/Investidores logo ao lado no
mesmo módulo (Minha Organização).

```tsx
<td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">...</td>
```

> ℹ️ A altura final da `<tr>` ainda varia por conteúdo (célula com avatar
> `w-8 h-8`, ou com duas linhas empilhadas tipo e-mail+telefone, fica mais
> alta que uma célula de texto simples) — isso é esperado, a régua é sobre o
> **padding**, não sobre travar todas as linhas numa altura fixa em px.
> ❌ Não é exceção legítima "esta tabela é mais densa" ou "tem menos colunas"
> — se motivo real existir para uma linha mais compacta/espaçosa em alguma
> tela nova, documente aqui como seção própria antes de aplicar, não decida
> ad-hoc no componente.

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
    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>

      {/* Ação primária — botão de texto azul */}
      <button
        onClick={(e) => { e.stopPropagation(); onViewDetails(item.id); }}
        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
      >
        Ver Detalhes
      </button>

      {/* Ação secundária — apenas ícone (§9.2: estilo de botão-ícone padrão) */}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(item.id); }}
        title="Editar"
        className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-xl transition-all shadow-sm active:scale-95"
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

### 9.2 Estilo do botão-ícone — flat sem borda está deprecado

**Padrão único de botão-ícone de ação** (secundária, fora do texto azul de "Ver
Detalhes" e fora do `InlineDisclosureMenu`, que é componente compartilhado e
mantém seu próprio estilo): `bg-white` + borda `border-slate-200` + `shadow-sm`
+ `rounded-xl` + `active:scale-95`, cor neutra `text-slate-600` em repouso,
mudando para a cor de destaque só no hover (`hover:text-blue-600
hover:border-blue-100` para ação neutra/informativa; `hover:text-orange-600
hover:border-orange-100` para uma ação de "atenção" como Compartilhar; para
ação destrutiva ver variante abaixo). Extraído de `components/OpuraDocsModule.tsx`
(aba Projetos de Gestão de Documentos), adotado como padrão em 2026-07-10.

```tsx
{/* Botão-ícone neutro — padrão */}
<button
  onClick={(e) => { e.stopPropagation(); onAction(item.id); }}
  title="Descrição da ação"
  className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-xl transition-all shadow-sm active:scale-95"
>
  <IconName className="w-4 h-4" />
</button>

{/* Variante com texto (quando o ícone sozinho não é auto-explicativo) */}
<button
  onClick={(e) => { e.stopPropagation(); onAction(item.id); }}
  title="Descrição da ação"
  className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-xl transition-all shadow-sm text-sm font-bold active:scale-95"
>
  <IconName className="w-4 h-4" />
  Rótulo
</button>

{/* Variante destrutiva */}
<button
  onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
  title="Excluir"
  className="p-2.5 bg-white border border-red-50 text-red-500 hover:bg-red-50 rounded-xl transition-all shadow-sm active:scale-95"
>
  <Trash2 className="w-4 h-4" />
</button>
```

> ❌ **Deprecado:** o estilo flat sem borda/sombra (`text-blue-600 hover:bg-blue-50
> rounded-lg`, sem `bg-white`/`border`/`shadow-sm`) que ainda aparece no snippet
> da seção 9 acima para a ação secundária — era o padrão antigo, mantido ali só
> como histórico da estrutura (texto+ícone+kebab), não como referência visual.
> Ao aplicar/corrigir uma tela, use sempre o estilo desta seção para qualquer
> botão-ícone solto na coluna de ações.
> ℹ️ Esta seção define só o **estilo visual** do botão-ícone. A **estrutura**
> continua sendo a da seção 9 (texto azul para a ação dominante, ícones soltos
> só para 1-2 ações secundárias de fato relevantes, `InlineDisclosureMenu` para
> o resto) — não é para transformar toda ação terciária em botão solto na linha
> só porque o estilo ficou mais bonito. `OpuraDocsModule.tsx` hoje expõe até 6
> botões soltos por linha sem kebab (por não ter refeito a estrutura ainda) —
> isso não é o padrão a copiar, é o próximo item de correção da própria tela.
> ℹ️ `gap-2` (não `gap-3`) entre os botões da coluna de ações — o padding
> próprio do botão (`p-2.5`/borda) já dá respiro suficiente; `gap-3` fica
> espaçado demais com o novo estilo.

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

## 16. ESCALA DE RADIUS — compacta (padrão único do app)

**Critério fechado em 2026-07-10:** a escala compacta é o padrão único do
OrçaCloud. Não é mais "decisão por tela" — é a escala que toda tela nova ou
corrigida deve usar, sem exceção não documentada. A escala antiga (radius
grande, `rounded-[2.5rem]`) fica **deprecated**: só existe hoje nas telas
ainda não migradas, e aparece nas seções 4–9 deste guia por ser a origem
histórica da estrutura — não porque ainda seja uma opção válida.

**Motivo da virada:** com duas escalas ambas "corretas" e a decisão deixada
por tela, o app acabou com módulos vizinhos (ex: Suprimentos > Pedidos vs.
Minha Organização > Clientes) parecendo dois produtos diferentes — mesmo
cada tela isoladamente batendo com alguma seção do guia. Consistência
*entre* telas importa tanto quanto conformidade *dentro* de uma tela; a
ambiguidade do critério antigo permitia a primeira falhar mesmo com a
segunda em dia.

| Elemento | Escala compacta (padrão único) | Escala antiga (deprecated) |
|---|---|---|
| Containers (tabela, cards, toolbar agrupada) | `rounded-[10px]` | `rounded-[2.5rem]` / `rounded-2xl` |
| Inputs, botões, chips | `rounded-[6px]` | `rounded-[1.25rem]` / `rounded-xl` |
| Altura dos controles da toolbar | `h-9` (36px) uniforme | `py-3`/`py-4` (variável) |

> ✅ **Toda tela usa a escala compacta.** Migrar uma tela da escala antiga
> para a compacta não é mais uma decisão de design a justificar — é correção
> de padrão, no mesmo nível que os outros itens do `CHECKLIST DE AUDITORIA
> COMPLETA`. O único julgamento que resta é de sequenciamento (qual tela
> migrar primeiro), não de "se".
> ✅ Referência completa de migração: `components/SupplyChainOrderList.tsx`
> (Suprimentos > Pedidos, migrado em 2026-07-10) e `components/ClientList.tsx`
> (Minha Organização > Clientes, já nascida na escala compacta).
> ⚠️ Não misturar as duas escalas dentro da mesma tela em nenhuma hipótese —
> isso já valia antes e continua valendo.
> ℹ️ Telas ainda não migradas não são "N/A" numa auditoria — são ❌ pendentes
> de migração. Documentar a pendência (com prioridade, se souber) em vez de
> tratar como decisão fechada por tela.

---

## 17. BOTÃO PRIMÁRIO — variante compacta (padrão único, consequência do §16)

O CTA primário antigo (`px-6 py-3 rounded-[1.25rem] uppercase tracking-widest
shadow-xl`) fica ~265×50px com o texto "Novo Fornecedor" — pesado o bastante
para competir com o próprio título da página, e usa o radius grande que o
§16 já deprecou. Não é mais uma variante opcional: **é o único botão primário
válido**, ~150×40px (ou `h-9` se o botão mora dentro da régua de controles da
§5.1, não isolado no cabeçalho):

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

## 19. NAVEGAÇÃO DE MÓDULOS (histórico: abas superiores → sidebar)

**Estado atual (2026-07-11): não existe mais barra de abas superior no
módulo Minha Organização.** A navegação entre Organização/Grupo/Clientes/
Investidores/Fornecedores/Usuários/Contas/Centros foi movida para um dropdown
próprio na sidebar (`components/Layout.tsx`, `NavDropdown label="Minha
Organização"`, mesmo padrão visual do dropdown "Engenharia" — `NavDropdown`/
`DropdownItem` já documentados no próprio componente). Cada item do dropdown
navega direto pra aba (`onChangeView('organization')` + `setManagementTab(id)`
via `onClickOverride`), sem precisar renderizar nenhuma barra dentro da tela.
`components/OrganizationList.tsx` teve o bloco de abas removido (era um
`<div className="flex ... bg-slate-900 ...">` com um botão por aba, ~40
linhas) — a tela agora começa direto no conteúdo da aba ativa (§20).

> ⚠️ Isso é consequência direta do §18 (não duplicar contexto já visível no
> shell): a barra de abas era exatamente esse tipo de navegação redundante —
> a sidebar já mostra "onde você está" via item destacado, então manter uma
> segunda navegação equivalente dentro da tela virou peso morto assim que o
> dropdown do sidebar existiu.
> ℹ️ Se um módulo novo (fora de Minha Organização) ainda precisar de uma
> barra de abas superior compartilhada por telas irmãs (ex: `TABS` locais em
> `SalesManagementModule.tsx`, que continuam existindo — não fazem parte
> deste módulo), aplique o vocabulário do §5.1/§16 (compacto: `h-9`,
> `rounded-[6px]`, `text-sm font-medium`) em vez de inventar um terceiro
> estilo — mas prefira sidebar quando a navegação for de nível de módulo
> inteiro (não de sub-fluxo dentro de uma tela), pelo motivo acima.

---

## 20. CABEÇALHO DE TELA (título + subtítulo + KPIs)

**Regra:** todo container raiz de tela usa `space-y-6` (não `space-y-4/5/8`,
não classes extras de padding/animação no mesmo elemento). O bloco de título
é uma `<div>` simples — nunca embrulhado num card, banda colorida ou "hero"
com fundo — contendo só `<h1>` + `<p>` de subtítulo, seguido **imediatamente**
(sem `<div>` intermediária, sem margem extra) pelo grid de `KpiCard` (§4):

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

> ✅ Subtítulo sempre `mt-1.5` (não `mt-1`, não `mt-0.5`, não ausente) —
> corrigido em 2026-07-11 em `BIDashboard.tsx`, `CashFlowDashboard.tsx`,
> `CentralCliente/Controle/Fornecedor/Obra.tsx`, `DREReport.tsx`,
> `OpuraReports.tsx`, `WarrantyModule.tsx`, `TasksModule.tsx`,
> `SupplyChainReceiptManager.tsx` — todas tinham o mesmo cabeçalho, só com o
> valor de `mt` levemente diferente entre si.
> ✅ Nenhum componente reutilizável de listagem deve embrulhar seu próprio
> título num card (`bg-* p-6 border rounded-[10px]`) só porque o resto do
> componente também é um card — o título é conteúdo de página, não parte do
> card da tabela/toolbar. Corrigido em `FinancialRegistryManager.tsx`
> (usado pelas abas Contas/Centros/Plano de Minha Organização): o header
> estava dentro do mesmo card com fundo cinza (`bg-gray-50/50`) e padding
> `p-6` que a tabela, com `h2 text-2xl` em vez de `h1 text-3xl` — o título
> saiu do card e virou o bloco flat desta seção; só a toolbar+tabela
> continuam dentro do card branco.
> ✅ Toda tela com título tem que TER um título — `OrganizationUsers.tsx`
> (aba Usuários) não tinha `<h1>` nenhum, ia direto pra barra de sub-abas
> (Membros/Cargos/Visibilidade). Corrigido em 2026-07-11.
> ❌ **Não é a mesma coisa que os cabeçalhos "hero"** (fundo escuro/gradiente,
> `h1` branco `text-4xl`, ex: `RentalsModule.tsx`, `SalesModule.tsx`,
> `ProjectOverview.tsx`, `TaxReport.tsx`, `CommercialModule.tsx`) nem os
> cabeçalhos em card com breadcrumb (`OpuraAssetsModule.tsx`,
> `OpuraDocsModule.tsx`, `EmpreendimentoModule.tsx`, `LaborModule.tsx`) — são
> linguagens visuais deliberadamente diferentes, não inconsistência a
> corrigir por esta seção. Não migre essas telas pro padrão flat sem decisão
> explícita (seria redesign, não padronização de espaçamento).
> ℹ️ Quando um dos KPIs é "o total" do qual os outros são decomposição, veja
> §4.2 (quebra de simetria) — a régua de espaçamento título↔KPI é a mesma
> nos dois casos (simétrico ou não), só a grade de KPI muda.

---

*(Fim do documento. Atualizar sempre que `SupplyChainOrderList.tsx` for refatorado como referência.)*
