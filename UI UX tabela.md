# UI UX tabela.md — Padrão de tela com tabela

> Referência visual: aba **Extrato** do módulo Financeiro
> (`components/BankReconciliation.tsx`). Documento autocontido — não depende
> de outro arquivo para ser aplicado. Quando o usuário disser **"aplique UI UX
> tabela.md na tela X"**, percorrer as 8 camadas abaixo, nesta ordem, e reportar
> item a item o que foi verificado/corrigido (não só "apliquei o padrão").

---

## Como auditar (ler antes de começar)

Esta seção existe porque uma aplicação real deste guia falhou três vezes
seguidas (2026-07-19, Contas a Pagar) — não por falta de informação no
documento, mas por método de auditoria errado. Os três erros:

1. **Auditar o arquivo em vez da tela.** Comparar nomes de classe dentro do
   `.tsx` não detecta o que salta aos olhos no navegador. Abrir a tela de
   referência (Extrato) e a tela alvo lado a lado — **print é o veredito, não
   o texto do código**. O que passou batido na primeira auditoria foi a
   ausência total de separador vertical entre colunas (§5/§7): invisível no
   diff, gritante na tela.

2. **Racionalizar divergência como exceção.** "É o padrão consolidado do app",
   "a tela irmã também faz assim" **não são justificativas** — o alvo é este
   guia, não um módulo irmão que diverge igual. Se a divergência for
   intencional, documentar aqui; senão, corrigir.

3. **Auditar um arquivo quando o padrão é de módulo.** Ver §3 — a barra de
   abas costuma morar no componente **pai**, não na tela.

**Sempre rodar antes de reportar concluído:**

```bash
bash scripts/check-ui-standard.sh components/SuaTela.tsx
```

Ele pega violações mecânicas (radius proibido, pílula de status, busca sem
`usePersistedState`, etc.). Passar no script **não** substitui a comparação
visual — ele não vê ordem de blocos nem espaçamento.

---

## Anatomia da tela (de cima para baixo)

```
1. Título (h1 + subtítulo)
2. KPI cards
3. Toolbar de abas          (só se a tela tiver abas — ver §3, elas costumam vir do PAI)
4. Toolbar de botões        (só se a tela tiver controles de escopo / ação primária)
5. Tabela com toolbar de busca acoplada (busca + filtro avançado + filtros rápidos + colunas)
```

Espaçamento vertical entre os blocos: **24px do título até os KPIs**, depois
**12px** entre cada barra de cromo (KPIs → abas → botões → toolbar da tabela).
Ver seção 6.

⚠️ **A ordem não é sugestão.** O caso mais comum de quebra é a barra de abas
aparecer *antes* do título, porque o módulo pai a desenha no topo. Isso é
violação da anatomia mesmo que cada bloco isolado esteja estilizado certo —
ver §3.1 para o padrão `tabsSlot` que resolve.

---

## 1. Título

```tsx
<div>
  <h1 className="text-3xl font-black text-gray-900 tracking-tight">Extrato Bancário</h1>
  <p className="text-gray-400 text-sm mt-1.5 font-medium">
    Lançamentos importados do banco, prontos para categorizar e conciliar.
  </p>
</div>
```

- `<h1>` solto, **nunca dentro de card/hero/banda colorida**.
- Subtítulo sempre `mt-1.5` (não `mt-1`, não `mt-0.5`).
- Se a tela tem abas (seção 3) e cada aba muda o assunto, o título/subtítulo
  mudam junto (um `Record<Aba, {titulo, subtitulo}>` no topo do arquivo).

---

## 2. KPI card

Usar sempre o componente `components/ui/KpiCard.tsx` — nunca reimplementar à mão.

```tsx
import { KpiCard } from './ui/KpiCard';

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
  <KpiCard label="PENDENTES" value={84} sub="Transações no extrato" icon={<ArrowLeftRight className="w-5 h-5" />} color="blue" />
  <KpiCard label="AUTOMAÇÃO" value="30%" sub="Conciliadas por regra" icon={<Zap className="w-5 h-5" />} color="emerald" />
  <KpiCard label="REGRAS ATIVAS" value={3} sub="Regras de conciliação" icon={<ShieldCheck className="w-5 h-5" />} color="purple" />
  <KpiCard label="ATENÇÃO" value={64} sub="Lançamentos internos pendentes" icon={<AlertTriangle className="w-5 h-5" />} color="amber" />
</div>
```

- Grade simétrica `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` quando os KPIs
  têm o mesmo peso (é o caso do Extrato). Se um KPI for "o total" do qual os
  outros são decomposição, usar `size="lg"` + `col-span-2` nele e `size="sm"`
  nos demais.
- `sub` é opcional — omitir quando só repetir o que `label`/`value` já dizem.
- Label sempre `UPPERCASE` no `size="md"` (default). Cor por `color` (blue,
  emerald, amber, red, purple, gray, violet, orange, indigo, rose, teal, cyan)
  — **cada KPI com sua própria cor semântica**, nunca monocromático.

### 2.1 Variante — divisor pontilhado + indicador de tendência (referência externa: FlowAI)

Inspirado num dashboard externo (FlowAI): separa visualmente o valor grande
da legenda com uma linha pontilhada fina, e troca o `sub` neutro por um
indicador de tendência colorido (↑ verde / ↓ vermelho) + texto. Ainda **não
implementado** no `components/ui/KpiCard.tsx` — registrar aqui como variante
proposta antes de decidir adotar.

```tsx
{/* Estrutura de referência — não é o KpiCard.tsx atual, é proposta de evolução */}
<div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100">
  <div className="flex items-center gap-2 mb-3">
    <div className="p-1.5 bg-gray-50 rounded-full"><IconName className="w-4 h-4 text-gray-500" /></div>
    <p className="text-sm text-gray-500 font-medium">Total Runs</p>
  </div>
  <p className="text-3xl font-bold text-gray-900">12,847</p>

  {/* Divisor pontilhado — separa valor de legenda sem peso tipográfico extra */}
  <div className="border-t border-dashed border-gray-200 my-3" />

  <div className="flex items-center gap-1.5">
    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> {/* TrendingDown + text-red-500 quando negativo */}
    <p className="text-xs text-gray-400 font-medium">+12% from last week</p>
  </div>
</div>
```

- **O que vale considerar importar:** o divisor pontilhado (reforça
  hierarquia valor↔legenda) e o ícone de tendência colorido (comunica direção
  da variação mais rápido que só texto).
- **O que não é recomendado copiar:** ícone genérico igual em todos os cards
  e ausência de cor por métrica (monocromático) — nosso sistema de `color`
  por KPI (seção 2, acima) já é padrão validado em todo o app e ajuda a
  diferenciar KPIs numa grade de 4+.
- Enquanto não for implementado no componente, **não** reproduzir esta
  variante manualmente numa tela — isso reintroduziria o problema que o
  componente único resolve (reimplementação ad-hoc do card). Primeiro
  atualizar `KpiCard.tsx` (ex: prop `trend?: { value: string; direction: 'up' | 'down' }`
  e `divider?: boolean`), depois usar em telas novas.
- Label sempre `UPPERCASE` no `size="md"` (default). Cor por `color` (blue,
  emerald, amber, red, purple, gray, violet, orange, indigo, rose, teal, cyan).

---

## 3. Toolbar de abas (quando houver abas)

```tsx
<div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
  <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
    {ABAS.map(a => (
      <button
        key={a.id}
        onClick={() => setAbaAtiva(a.id)}
        className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
          abaAtiva === a.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        {a.label}
      </button>
    ))}
  </div>
</div>
```

- Aba ativa = `bg-white text-blue-600 shadow-sm` sobre trilho `bg-gray-50`
  — **não** é o azul sólido do botão primário/toggle (aquilo é ação, isto é
  navegação).
- `flex-wrap`, nunca `overflow-x-auto` — com muitas abas (o Extrato tem
  Dashboard/Extrato/Central/Divergências/Anomalias/Pendentes/Conciliados/
  Regras/Categorias/Fechamento/Pró-labore = 11), rolagem esconde abas sem
  indício nenhum. Quebrar linha é o custo certo.
- Abas em `h-7` (mais baixas que o `h-9` do resto dos controles — navegação é
  secundária à tarefa).
- O trilho interno é o que `components/ui/tabs.tsx` (`TabsList`/`TabsTrigger`)
  já renderiza. **O que costuma faltar é o card branco em volta** — sem ele as
  abas ficam soltas na página em vez de numa barra de cromo.

### 3.1 ⚠️ "A tela não tem abas" quase sempre é engano

Antes de concluir que a §3 não se aplica, **procurar quem renderiza a tela**:

```bash
grep -rn "SuaTela" components/ --include=*.tsx | grep import
```

Telas que são aba de um módulo (Financeiro, Suprimentos, RH…) **têm abas** —
elas só moram no componente pai. Foi exatamente esse o erro em Contas a Pagar:
auditou-se `ContasPagarManager.tsx` isolado, concluiu-se "tela sem abas", e a
barra estava em `ProjectFinancialManager.tsx` o tempo todo.

**O conflito estrutural:** a anatomia do §1 exige `título → KPIs → abas`, mas
as abas são do pai enquanto título e KPIs são da tela. Renderizar no pai põe
as abas *antes* do título — fora de ordem.

**Solução — `tabsSlot`** (implementada em `ProjectFinancialManager` →
`ContasPagarManager`, commit `cb6b0bd`): o pai monta a barra e passa como
prop; a tela a posiciona entre os KPIs e a toolbar de botões.

```tsx
// No pai: monta a barra uma vez
const tabsBar = ( /* card branco §3 com <Tabs>/<TabsList> + ação de export */ );

// Telas já migradas posicionam a barra elas mesmas. As demais continuam
// recebendo a barra no topo — nenhuma tela fica sem navegação durante a migração.
const TABS_RENDERED_BY_CHILD: TabKey[] = ['contas_pagar'];
const childOwnsTabsBar = TABS_RENDERED_BY_CHILD.includes(activeTab);

return (
  <div className="p-2 space-y-6">
    {!childOwnsTabsBar && tabsBar}
    {activeTab === 'contas_pagar' && <ContasPagarManager tabsSlot={tabsBar} … />}
    {/* demais abas, ainda não migradas */}
  </div>
);
```

```tsx
// Na tela: prop opcional (ausente = usada fora do módulo, sem abas)
interface Props { tabsSlot?: React.ReactNode; }

<div className="space-y-6">
  <div>{/* 1. título */}</div>
  <div className="grid … mb-3">{/* 2. KPIs */}</div>
  {tabsSlot}                       {/* 3. abas, na posição correta */}
  <div className="… mb-3">{/* 4. escopo */}</div>
  <div>{/* 5. card da tabela */}</div>
</div>
```

- Migrar mais uma aba = aceitar `tabsSlot` + listar em `TABS_RENDERED_BY_CHILD`.
- **Efeito colateral durante a migração parcial:** ao alternar entre uma aba
  migrada e uma não migrada, a barra "pula" de posição. É esperado e some
  quando todas forem migradas — vale avisar o usuário.
- Alternativa (a que o Extrato usa): **um único componente dono de tudo** —
  título via `Record<Aba, {titulo, subtitulo}>`, KPIs e abas no mesmo arquivo
  (`BankReconciliation.tsx:3202` e `:3253`). É o alvo final; `tabsSlot` é o
  caminho incremental quando os filhos já existem separados.

---

## 4. Toolbar de botões (quando houver botões de escopo/ação)

Controles que definem **sobre qual recorte de dados a tela está olhando**
(conta, competência, período) + a **ação primária** da tela — barra própria,
acima da toolbar de busca, porque muda o escopo, não o filtro.

```tsx
<div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
  <div className="flex flex-wrap items-center gap-2">
    <select className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer">
      {/* conta */}
    </select>
    <select className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium">
      {/* competência */}
    </select>
    <input type="date" className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium" />
    <input type="date" className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium" />
  </div>

  <button className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0">
    <Upload className="w-[15px] h-[15px]" />
    Importar extrato
  </button>
</div>
```

- `justify-between`: escopo à esquerda, ação primária à direita.
- Todo controle em `h-9` + `rounded-[6px]`.
- Não fundir escopo com busca na mesma barra — são perguntas diferentes
  ("qual conta/mês?" vs "qual linha?"). Se a tela não tem controles de escopo
  (a maioria dos CRUDs simples), essa barra simplesmente não existe.

---

## 5. Tabela com toolbar de busca acoplada

Toolbar de busca **dentro do mesmo card** da tabela — um único
`border`/`rounded`/`shadow`/`overflow-hidden` no elemento pai; a única linha
visível entre os dois blocos é o `border-b` da toolbar.

```tsx
<div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">

  {/* Toolbar acoplada */}
  <div className="p-4 border-b border-gray-100 bg-white space-y-3">
    <div className="flex flex-col md:flex-row gap-2.5 items-center">
      <div className="flex-1 relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por descrição, categoria ou cliente/fornecedor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
        />
      </div>

      {/* Filtros rápidos — toggle Tudo/Receitas/Despesas */}
      <div className="flex items-center h-9 bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
        <button className={`px-3 h-7 rounded-[6px] text-sm font-medium ${tipo === 'tudo' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>Tudo</button>
        <button className={`px-3 h-7 rounded-[6px] text-sm font-medium ${tipo === 'receitas' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-400'}`}>Receitas</button>
        <button className={`px-3 h-7 rounded-[6px] text-sm font-medium ${tipo === 'despesas' ? 'bg-white shadow-sm text-red-600' : 'text-gray-400'}`}>Despesas</button>
      </div>

      {/* Dropdowns de recorte — categoria, cliente/fornecedor */}
      <select className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium">{/* Todas categorias */}</select>
      <select className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium">{/* Cliente/fornecedor */}</select>

      {/* Filtro avançado */}
      <button onClick={() => setShowFiltros(f => !f)} className="flex items-center gap-1.5 h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium hover:bg-gray-100">
        <SlidersHorizontal className="w-4 h-4" />
        Filtro avançado
      </button>

      {/* Refresh */}
      <button onClick={loadData} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95">
        <RefreshCw className="w-4 h-4" />
      </button>

      <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0" />

      {/* Colunas + grid/lista */}
      <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
        <ColumnConfigButton columns={COLUMNS.filter(c => c.key !== 'actions')} visibleColumns={tableColumns.visibleColumns} showColumnConfig={tableColumns.showColumnConfig} onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)} onToggleColumn={tableColumns.toggleColumn} onReset={tableColumns.resetColumns} />
      </div>
    </div>

    {showFiltros && (
      <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-4 space-y-4">
        {/* painel de filtro avançado */}
      </div>
    )}
  </div>

  {/* Conteúdo — SEM bg/border/rounded/shadow próprios, o card pai já supre */}
  <div className="overflow-auto max-h-[70vh]">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
          {/* checkbox (só se houver ação em lote) */}
          <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
          </th>
          <SortableHeader colKey="descricao" label="Descrição" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
          {/* demais colunas... */}
          <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {items.map(item => (
          <tr key={item.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer group">
            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{item.descricao}</td>
            {/* select inline (Cliente/Fornecedor, Categoria) — mesma tipografia da célula de texto, ver seção 7 */}
            <td className="px-6 py-2.5 text-right">
              <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg">Aceitar</button>
                <ActionIconButton kind="delete" onClick={() => onDelete(item.id)} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

- Escolher **uma** variante de toolbar por tela: card externo próprio,
  régua desaninhada, ou (esta) acoplada à tabela. Não misturar.
- `sticky top-0 z-10` no `<tr>` do `<thead>`, com `bg-gray-50` opaco, quando a
  lista pode crescer — senão as linhas passam "por trás" do cabeçalho ao rolar.
- Filtro avançado é um botão que expande um painel `bg-gray-50 border
  rounded-[10px] p-4` logo abaixo da régua de busca — nunca um modal separado
  para filtros simples.

> 🔴 **`px-6` + separador vertical em TODA célula e TODO cabeçalho.** É a
> diferença mais visível entre uma tabela no padrão e uma fora dele, e a mais
> fácil de não enxergar lendo o diff:
>
> - `<th>`: `px-6 py-2 border-r border-gray-100` (a última, "Ações", sem borda)
> - `<td>`: `px-6 py-2.5 border-r border-gray-100 last:border-r-0`
>
> Tabela com `px-4` e sem `border-r` **parece idêntica no código** e
> completamente diferente na tela. Conferir contra
> `BankReconciliation.tsx:4436`. Em Contas a Pagar isso passou batido numa
> auditoria inteira e o usuário reportou "não foi aplicado nada" — com razão.

---

## 6. UI/UX geral — espaçamentos e ritmo

- Container raiz da tela: `space-y-6` (24px) — governa título → KPIs, e do
  último bloco de cromo até a tabela.
- Entre KPIs → abas → botões → toolbar acoplada: **12px**, aplicado como
  `mb-3` no elemento de cima de cada par (não `space-y-3` no pai).
- Regra prática: 24px sempre que a pergunta muda de assunto (identidade da
  tela → dados da tela); 12px enquanto for a mesma tarefa (filtrar/ver dados).
- Escala de radius única do app: `rounded-[10px]` em containers (tabela,
  toolbar, card), `rounded-[6px]` em inputs/botões/chips. Nunca
  `rounded-[2.5rem]`/`rounded-2xl`/`rounded-xl` em tela nova.
- Altura uniforme dos controles de toolbar/escopo: `h-9` (36px).

---

## 7. Tamanho e cores de fonte da tabela

**Cabeçalho (`<thead>`):**
- `text-xs font-semibold text-gray-500`, sentence case (não uppercase) —
  exceto siglas (`CNPJ`, `CPF`, `ID`, `NF-e`) que continuam maiúsculas porque
  são o texto literal, não decoração.
- Coluna "Ações" (sem `SortableHeader`) precisa da classe `text-sm
  font-semibold text-gray-500` explícita — senão herda `text-xs` e fica menor
  que as outras colunas.

**Corpo (`<tbody>`):**
| Tipo de dado | Classe |
|---|---|
| Texto padrão (nome, descrição, obra) | `text-sm font-normal text-gray-700` |
| Texto atenuado (data, contagem, número) | `text-sm font-normal text-gray-600` |
| Link / item relacionado | `text-sm font-normal text-blue-600` |
| Valor financeiro (único caso com `font-medium`) | `text-sm font-medium text-gray-800` |
| Select/LazySelect inline dentro de `<td>` | `text-sm font-normal` — **mesma tipografia da célula de texto**, nunca `text-xs`/`font-bold`/`uppercase` só por parecer "chip" |
| Status | texto colorido simples `text-sm font-normal` + cor — sem pílula/fundo/uppercase |

- `py-2.5` em toda `<td>`, sem exceção não documentada.
- Nunca `font-mono`, `font-bold`, `font-black` em célula de dado comum.

---

## 8. Botões de ação

**Coluna de ações da tabela** — sempre visível (nunca
`opacity-0 group-hover:opacity-100`):
- Ação primária/frequente (ex: "Aceitar", "Ver detalhes"): texto azul,
  `text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5
  hover:bg-blue-50 rounded-lg`.
- Ações secundárias (editar, excluir, normalizar): `<ActionIconButton
  kind="..." />` — `bg-white border border-gray-200 shadow-sm rounded-[6px]
  p-1.5 active:scale-95`, tom neutro `text-gray-500` mudando no hover
  (`neutral`/`attention`/`danger` conforme o `kind`). `gap-1.5` entre botões.
- Ações terciárias (3+): agrupar em `<InlineDisclosureMenu>` (kebab), não
  empilhar ícones soltos.

**Botão primário da tela** (ex: "Importar extrato"):
```tsx
<button className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
  <Upload className="w-[15px] h-[15px]" />
  Importar extrato
</button>
```
- `font-medium`, sentence case, sem `shadow-xl`/glow, `h-9`, `rounded-[6px]`.
- Mora na toolbar de botões (seção 4) quando ela existe, alinhado à direita.
- É o único elemento azul sólido da tela — não duplicar destaque com sombra.

**Confirmação de ação destrutiva:** sempre `useConfirm()` (`./ui/confirm`),
nunca `window.confirm()`/`confirm()` nativo.

---

## 9. Checklist de fechamento

Percorrer antes de dizer "aplicado". Reportar item a item, não em bloco.

| # | Verificar | Erro comum |
|---|---|---|
| 1 | `h1` solto + subtítulo `mt-1.5` | título dentro de card/hero |
| 2 | `KpiCard`, cor semântica por KPI | card reimplementado à mão |
| 3 | Abas em card branco, **depois dos KPIs** | "tela sem abas" sem olhar o pai (§3.1) |
| 4 | Escopo em barra própria | escopo fundido na barra de busca |
| 5 | Toolbar acoplada; **`px-6` + `border-r` nas células** | `px-4` sem separador |
| 6 | `rounded-[10px]`/`rounded-[6px]`, controles `h-9` | `rounded-2xl`/`rounded-xl` sobrando |
| 7 | Tipografia da tabela (§7) | `font-bold`/`text-xs` em célula de dado |
| 8 | Ações como link de texto; destrutiva com `useConfirm()` | botão com borda+sombra na linha |

Depois:

```bash
bash scripts/check-ui-standard.sh components/SuaTela.tsx   # violações mecânicas
npx tsc --noEmit -p .                                      # build quebra com QUALQUER erro TS
```

E abrir a tela no navegador ao lado do Extrato. Se não deu para verificar
visualmente, **dizer isso** em vez de afirmar que está aplicado.

---

*(Documento autocontido — atualizar aqui diretamente se o padrão do Extrato
mudar. Não depende de `docs/ui_ux_standard_guide.md`.)*
