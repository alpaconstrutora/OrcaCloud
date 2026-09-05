import React from 'react';
import { createPortal } from 'react-dom';
import { Settings, ChevronUp, ChevronDown, ChevronsUpDown, Loader2 } from 'lucide-react';

// Imagem 1x1 transparente usada como "ghost" do drag-and-drop de colunas (ver
// SortableHeader) — substitui o snapshot padrão do navegador, que é o que
// causa o atraso visível do elemento arrastado seguindo o mouse. Criada uma
// única vez (não a cada drag) e só no browser (SSR/teste sem `window.Image`
// cai no fallback undefined, e setDragImage não é chamado nesse caso).
const DRAG_GHOST_IMG = typeof window !== 'undefined' ? (() => {
  const img = new window.Image(1, 1);
  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';
  return img;
})() : (undefined as unknown as HTMLImageElement);

export type ColumnConfig = {
  key: string;
  label: string;
  sortable?: boolean;
  /** Coluna existe, mas nasce oculta — o usuário liga na engrenagem quando quiser.
   *  Para tabelas largas, em que só um subconjunto interessa na visão inicial. */
  defaultHidden?: boolean;
};

interface PersistedTableState {
  visibleColumns: string[];
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  /** Todas as chaves de coluna que este usuário já "conheceu" (visíveis ou ocultas),
   *  usado só para detectar colunas novas introduzidas depois do último salvamento. */
  knownColumns: string[];
  /** Ordem de TODAS as colunas (não só as visíveis) — estilo ClickUp: arrastar o
   *  cabeçalho troca a posição. Coluna nova (fora daqui) é adicionada no fim. */
  columnOrder: string[];
}

/**
 * Lê o estado persistido. Aceita o formato legado (array puro de
 * visibleColumns) além do formato novo (objeto com sort), para não quebrar
 * preferências já salvas no localStorage dos usuários.
 *
 * Também mescla automaticamente colunas novas: se uma tela ganha uma coluna
 * depois que o usuário já salvou preferências, essa coluna nova aparece
 * visível por padrão (em vez de ficar escondida até o usuário abrir o menu de
 * colunas manualmente). Colunas que o usuário já tinha e escondeu de propósito
 * continuam escondidas — só chaves nunca vistas antes (fora de `knownColumns`)
 * são adicionadas.
 */
function loadPersistedTableState(
  storageKey: string,
  defaultVisibleColumns: string[],
  /** Todas as chaves da tela, incluindo as `defaultHidden`. Sem preferência salva,
   *  `knownColumns`/`columnOrder` têm que cobrir TODAS as colunas — senão a coluna
   *  oculta por padrão seria tratada como "coluna nova" no próximo carregamento e
   *  voltaria visível sozinha. */
  allColumns: string[] = defaultVisibleColumns,
): PersistedTableState {
  const fallback: PersistedTableState = { visibleColumns: defaultVisibleColumns, sortColumn: null, sortDirection: 'asc', knownColumns: allColumns, columnOrder: allColumns };
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);

    let storedVisible: string[];
    let sortColumn: string | null;
    let sortDirection: 'asc' | 'desc';
    let knownColumns: string[];
    let columnOrder: string[];

    if (Array.isArray(parsed)) {
      // Formato legado: só as colunas visíveis.
      storedVisible = parsed;
      sortColumn = null;
      sortDirection = 'asc';
      knownColumns = parsed;
      columnOrder = parsed;
    } else {
      storedVisible = parsed.visibleColumns ?? defaultVisibleColumns;
      sortColumn = parsed.sortColumn ?? null;
      sortDirection = parsed.sortDirection ?? 'asc';
      // Sem knownColumns salvo (preferência de antes dessa mudança): assume que
      // o que estava visível é tudo que o usuário conhecia até então.
      knownColumns = parsed.knownColumns ?? storedVisible;
      // Sem columnOrder salvo (preferência de antes do drag-and-drop existir):
      // usa a ordem default da tela.
      columnOrder = parsed.columnOrder ?? allColumns;
    }

    const newColumns = allColumns.filter(k => !knownColumns.includes(k));
    // Coluna nova entra visível — a menos que a tela a tenha marcado defaultHidden.
    const newVisibleColumns = newColumns.filter(k => defaultVisibleColumns.includes(k));
    // Colunas que a tela define hoje mas que não estão na ordem salva (coluna nova
    // introduzida depois do último salvamento) entram no fim, na ordem default.
    const missingFromOrder = allColumns.filter(k => !columnOrder.includes(k));
    return {
      visibleColumns: newVisibleColumns.length ? [...storedVisible, ...newVisibleColumns] : storedVisible,
      sortColumn,
      sortDirection,
      knownColumns: newColumns.length ? [...knownColumns, ...newColumns] : knownColumns,
      columnOrder: missingFromOrder.length ? [...columnOrder, ...missingFromOrder] : columnOrder,
    };
  } catch (e) {
    console.warn(`Failed to load table preferences from localStorage (${storageKey}):`, e);
    return fallback;
  }
}

export const useTableColumns = (defaultColumns: ColumnConfig[], storageKey: string = 'tableColumns') => {
  const allColumns = defaultColumns.map(col => col.key);
  const defaultVisibleColumns = defaultColumns.filter(col => !col.defaultHidden).map(col => col.key);

  const [initial] = React.useState(() => loadPersistedTableState(storageKey, defaultVisibleColumns, allColumns));
  const [visibleColumns, setVisibleColumns] = React.useState<string[]>(initial.visibleColumns);
  const [sortColumn, setSortColumn] = React.useState<string | null>(initial.sortColumn);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>(initial.sortDirection);
  const [knownColumns, setKnownColumns] = React.useState<string[]>(initial.knownColumns);
  const [columnOrder, setColumnOrder] = React.useState<string[]>(initial.columnOrder);
  const [showColumnConfig, setShowColumnConfig] = React.useState(false);

  // Persistir colunas + ordenação + conhecidas + ordem juntas (F2: sobrevive a navegação/reload).
  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ visibleColumns, sortColumn, sortDirection, knownColumns, columnOrder }));
    } catch (e) {
      console.warn(`Failed to save table preferences to localStorage (${storageKey}):`, e);
    }
  }, [visibleColumns, sortColumn, sortDirection, knownColumns, columnOrder, storageKey]);

  // Colunas visíveis, na ordem escolhida pelo usuário (arraste no header) — é isso
  // que a tela deve mapear para renderizar coluna/cabeçalho/célula, em vez da
  // sequência fixa do JSX. Chave visível mas ausente de columnOrder (não deveria acontecer
  // após o merge de loadPersistedTableState, mas é defesa barata) vai pro fim.
  const orderedVisibleColumns = React.useMemo(() => {
    const inOrder = columnOrder.filter(k => visibleColumns.includes(k));
    const missing = visibleColumns.filter(k => !columnOrder.includes(k));
    return missing.length ? [...inOrder, ...missing] : inOrder;
  }, [columnOrder, visibleColumns]);

  // Estilo ClickUp: arrastar o cabeçalho de `dragKey` e soltar sobre `dropKey`
  // troca a posição das duas colunas na ordem geral (não só entre visíveis).
  const moveColumn = React.useCallback((dragKey: string, dropKey: string) => {
    if (dragKey === dropKey) return;
    setColumnOrder(prev => {
      const from = prev.indexOf(dragKey);
      const to = prev.indexOf(dropKey);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragKey);
      return next;
    });
  }, []);

  const handleColumnSort = (colKey: string) => {
    if (sortColumn === colKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(colKey);
      setSortDirection('asc');
    }
  };

  const toggleColumn = (colKey: string) => {
    setVisibleColumns(prev =>
      prev.includes(colKey)
        ? prev.filter(c => c !== colKey)
        : [...prev, colKey]
    );
  };

  const resetColumns = () => {
    setVisibleColumns(defaultVisibleColumns);
    setSortColumn(null);
    setSortDirection('asc');
    // known/order cobrem TODAS as colunas, inclusive as defaultHidden — do
    // contrário elas seriam redescobertas como "novas" e voltariam visíveis.
    setKnownColumns(allColumns);
    setColumnOrder(allColumns);
    setShowColumnConfig(false);
  };

  return {
    visibleColumns,
    sortColumn,
    sortDirection,
    showColumnConfig,
    setShowColumnConfig,
    handleColumnSort,
    toggleColumn,
    resetColumns,
    // Setters "crus" — aditivo: existiam só internamente. Permitem a uma tela aplicar
    // de uma vez uma preferência carregada de fora (ex: banco), sem precisar de um
    // toggle por coluna. Não muda nada para quem já usa só o resto da API.
    setVisibleColumns,
    setSortColumn,
    setSortDirection,
    // Drag-and-drop de colunas (estilo ClickUp) — aditivo, telas que não usarem
    // não mudam em nada.
    columnOrder,
    orderedVisibleColumns,
    moveColumn,
    setColumnOrder,
  };
};

/**
 * Estado (filtros, página, o que for) persistido em localStorage por `key`.
 * F2: complementa useTableColumns (colunas+ordenação) para telas que também
 * querem lembrar filtros aplicados. Uso: mesma forma de useState, só que
 * sobrevive a navegação/reload.
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored) as T;
    } catch (e) {
      console.warn(`Failed to load persisted state (${key}):`, e);
    }
    return defaultValue;
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Failed to save persisted state (${key}):`, e);
    }
  }, [key, value]);

  return [value, setValue];
}

interface ColumnConfigButtonProps {
  columns: ColumnConfig[];
  visibleColumns: string[];
  showColumnConfig: boolean;
  onToggleShow: () => void;
  onToggleColumn: (colKey: string) => void;
  onReset: () => void;
  /** Opcional — quando presente, mostra "Salvar como padrão" (preferência persistida
   * por usuário, não só no localStorage deste navegador). Omitir mantém a tela idêntica. */
  onSaveDefault?: () => void | Promise<void>;
  savingDefault?: boolean;
}

export const ColumnConfigButton: React.FC<ColumnConfigButtonProps> = ({
  columns,
  visibleColumns,
  showColumnConfig,
  onToggleShow,
  onToggleColumn,
  onReset,
  onSaveDefault,
  savingDefault = false,
}) => {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ top: number; right: number } | null>(null);

  // Painel renderizado via portal em document.body (ver abaixo) — não é mais um
  // `absolute` filho do botão, então precisa da própria posição em `fixed`,
  // recalculada toda vez que abre e enquanto a página rola/redimensiona com o
  // painel aberto. Isso existe porque telas com a toolbar dentro de um card
  // `overflow-hidden` (§5.2 do guia — ex: OpuraDocsModule) cortavam o painel na
  // borda do card quando ele era um `absolute` comum preso a essa hierarquia.
  const updatePosition = React.useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, []);

  React.useEffect(() => {
    if (!showColumnConfig) return;
    updatePosition();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleShow();
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onToggleShow();
    };
    const handleReposition = () => updatePosition();

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [showColumnConfig, onToggleShow, updatePosition]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={onToggleShow}
        className="p-2.5 rounded-xl transition-all text-gray-400 hover:text-gray-600 relative"
        title="Configurar Colunas"
      >
        <Settings className="w-5 h-5" />
      </button>
      {showColumnConfig && position && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: position.top, right: position.right }}
          className="bg-white rounded-xl border border-gray-200 shadow-lg p-4 z-[10000] min-w-[250px]"
        >
          <div className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wider">Colunas Visíveis</div>
          {/* max-h em vh (não px fixo): telas com mais colunas (ex: GED, que soma colunas
              dinâmicas de máscara às fixas) passam de 300px facilmente — os últimos itens
              ficavam fora da área visível sem indício de que a lista rolava. */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {columns.map(col => (
              <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded-lg">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(col.key)}
                  onChange={() => onToggleColumn(col.key)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{col.label}</span>
              </label>
            ))}
          </div>
          {onSaveDefault && (
            <button
              onClick={onSaveDefault}
              disabled={savingDefault}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-button font-bold text-white bg-blue-600 hover:bg-blue-700 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {savingDefault && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar como padrão
            </button>
          )}
          <button
            onClick={onReset}
            className={`w-full text-button font-bold text-blue-600 py-2 rounded-lg hover:bg-blue-50 transition-colors ${onSaveDefault ? 'mt-1.5' : 'mt-3'}`}
          >
            Restaurar Padrão
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

interface SortableHeaderProps {
  label: string;
  colKey: string;
  sortable?: boolean;
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc';
  onSort?: (colKey: string) => void;
  className?: string;
  /** Conteúdo extra dentro do <th> (ex.: alça de redimensionar coluna). Opcional — quem não passar não muda em nada. */
  children?: React.ReactNode;
  /** Default true (padrão histórico). false = sentence case, sem tracking-wider — ver ui_ux_guia_unificado.md §6.2. */
  uppercase?: boolean;
  /** Estilo ClickUp: presente = header vira arrastável, trocando de posição com a
   *  coluna onde for solto (via `moveColumn` de useTableColumns). Aditivo — quem
   *  não passar não ganha (nem perde) nada. */
  onMoveColumn?: (dragKey: string, dropKey: string) => void;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  colKey,
  sortable = true,
  sortColumn,
  sortDirection,
  onSort,
  // §6 do guia: cabeçalho é `px-6 py-2` — todos os snippets canônicos usam py-2.
  // O default estava em py-4 e valia para toda tela que não passa className,
  // deixando o cabeçalho mais alto que o padrão sem ninguém ter escolhido isso.
  className = 'px-6 py-2',
  children,
  uppercase = true,
  onMoveColumn,
}) => {
  const caseClasses = uppercase
    ? 'text-gray-400 uppercase tracking-wider'
    : 'text-gray-500';
  const [dragOver, setDragOver] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  const dragProps = onMoveColumn ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', colKey);
      // Esconde a "foto" fantasma padrão do navegador (setDragImage com imagem
      // 1x1 transparente) — é ela que causa o atraso visível seguindo o mouse,
      // porque o navegador redesenha um snapshot do <th> a cada frame. Sem
      // ghost, o cursor já mostra o ícone de "mover" e o indicador de destino
      // (borda azul, abaixo) já sinaliza onde vai soltar — mesma solução usada
      // por listas estilo Trello.
      // try/catch: ambiente de teste (jsdom) e navegadores antigos podem não
      // implementar setDragImage — degrada para o ghost padrão, não quebra o drag.
      try { e.dataTransfer.setDragImage(DRAG_GHOST_IMG, 0, 0); } catch { /* ignore */ }
      setDragging(true);
    },
    onDragEnd: () => setDragging(false),
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!dragOver) setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dragKey = e.dataTransfer.getData('text/plain');
      if (dragKey) onMoveColumn(dragKey, colKey);
    },
  } : {};
  // Feedback visual só do lado onde o mouse está (dragOver), estilo ClickUp — uma
  // borda azul indica "solte aqui", à esquerda da coluna sobrevoada. `dragging`
  // esmaece a própria coluna de origem enquanto arrasta — sem isso, escondido o
  // ghost nativo (ver setDragImage acima), não sobraria nenhum indício visual
  // de qual coluna está sendo movida.
  const dragOverClasses = dragOver ? 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-blue-500' : '';
  const draggingClasses = dragging ? 'opacity-40' : '';

  if (!sortable) {
    return (
      <th className={`${className} relative text-table-header font-semibold ${caseClasses} ${onMoveColumn ? `cursor-grab ${dragOverClasses} ${draggingClasses}` : ''}`} {...dragProps}>
        {label}
        {children}
      </th>
    );
  }

  return (
    <th
      onClick={() => onSort?.(colKey)}
      className={`${className} relative text-table-header font-semibold ${caseClasses} cursor-pointer hover:text-gray-600 transition-colors select-none group ${dragOverClasses} ${draggingClasses}`}
      {...dragProps}
    >
      <div className="flex items-center gap-1.5">
        {label}
        {/* Ícone de ordenação sempre visível, não só na coluna ativa — sinaliza que TODA
            coluna aqui é clicável para ordenar (ui_ux_guia_unificado.md §6.8). Cinza
            escuro e neutro (dois sentidos) quando inativa — gray-400 ainda sumia contra
            o bg-gray-50 do <thead> (reportado 2026-08-08, 2ª rodada); azul + direção
            quando é a ativa. */}
        <span className={`inline-flex items-center ${sortColumn === colKey ? 'text-blue-600 group-hover:text-blue-700' : 'text-gray-500 group-hover:text-gray-700'}`}>
          {sortColumn === colKey
            ? (sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)
            : <ChevronsUpDown className="w-3.5 h-3.5" />}
        </span>
      </div>
      {children}
    </th>
  );
};

/**
 * Redimensionamento de colunas por arraste (arrastar a borda direita do
 * cabeçalho; duplo clique restaura a largura padrão). Larguras persistidas em
 * localStorage por `storageKey`. Extraído do mecanismo original de
 * `BankReconciliation.tsx` (tabela de Extrato) para virar padrão reutilizável.
 *
 * Uso:
 *   const cols = useResizableColumns(DEFAULT_WIDTHS, 'minhaTelaColWidths');
 *   <table ref={cols.tableRef} style={{ tableLayout: 'fixed' }}>
 *     <colgroup>
 *       <col data-col-key="nome" style={{ width: `${cols.getWidth('nome')}px` }} />
 *     </colgroup>
 *     <thead><tr>
 *       <SortableHeader colKey="nome" label="Nome" ...>
 *         <cols.ResizeHandle colKey="nome" />
 *       </SortableHeader>
 *     </tr></thead>
 */
export function useResizableColumns(
  defaultWidths: Record<string, number>,
  storageKey: string,
  opts?: { min?: number; max?: number },
) {
  const min = opts?.min ?? 80;
  const max = opts?.max ?? 500;

  const [widths, setWidths] = React.useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const resizeRef = React.useRef<{ colKey: string; startX: number; startW: number } | null>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);

  const getWidth = React.useCallback(
    (key: string) => widths[key] ?? defaultWidths[key] ?? 150,
    [widths, defaultWidths],
  );

  const handleResizeStart = React.useCallback((colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { colKey, startX: e.clientX, startW: getWidth(colKey) };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [getWidth]);

  const handleDblClick = React.useCallback((colKey: string) => {
    setWidths(prev => {
      const next = { ...prev };
      delete next[colKey];
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  React.useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const ref = resizeRef.current;
      if (!ref) return;
      const delta = e.clientX - ref.startX;
      const newW = Math.max(min, Math.min(max, ref.startW + delta));
      const col = tableRef.current?.querySelector(`col[data-col-key="${ref.colKey}"]`) as HTMLElement | null;
      if (col) col.style.width = `${newW}px`;
    };
    const onMouseUp = () => {
      const ref = resizeRef.current;
      if (!ref) return;
      let finalW = ref.startW;
      const col = tableRef.current?.querySelector(`col[data-col-key="${ref.colKey}"]`) as HTMLElement | null;
      if (col) finalW = parseInt(col.style.width, 10) || ref.startW;
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidths(prev => {
        const next = { ...prev, [ref.colKey]: finalW };
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [min, max, storageKey]);

  const ResizeHandle = React.useCallback(({ colKey }: { colKey: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(colKey, e)}
      onDoubleClick={() => handleDblClick(colKey)}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 bottom-0 w-[7px] cursor-col-resize z-20 group/resize hover:bg-blue-400/40 active:bg-blue-500/60 transition-colors"
      title="Arraste para redimensionar (duplo clique para restaurar o padrão)"
    >
      <div className="absolute right-0 top-1/4 bottom-1/4 w-px bg-gray-200 group-hover/resize:bg-blue-400" />
    </div>
  ), [handleResizeStart, handleDblClick]);

  /**
   * Ajusta a largura de todas as colunas ao conteúdo real e, se ainda sobrar
   * espaço, distribui a folga para a tabela preencher o container.
   *
   * **É sob comando explícito, nunca automático.** Recalcular a cada mudança de
   * dado faria as colunas "dançarem" enquanto o usuário digita na busca — pior
   * que a largura errada, porque tira a referência visual de onde cada coluna
   * está. Mesma razão pela qual Excel/Sheets fazem autofit só no duplo clique.
   *
   * Medição: clona a tabela fora da tela com `table-layout: auto` e deixa o
   * **navegador** calcular a largura natural de cada coluna. Isso pega de graça
   * o que uma medição de texto erraria — avatar, ícones, células de duas linhas,
   * padding real — sem a tela precisar declarar nada por coluna. Custa um
   * reflow no clone (não no layout visível), por isso a amostra é limitada:
   * nenhuma destas tabelas usa virtualização, então clonar 5.000 linhas
   * travaria a aba, e as primeiras ~150 já definem a largura na prática.
   */
  const autoFit = React.useCallback((opts?: { sampleRows?: number; fill?: boolean }) => {
    const table = tableRef.current;
    if (!table) return;
    const sampleRows = opts?.sampleRows ?? 150;
    const fill = opts?.fill ?? true;

    const keys = Array.from(table.querySelectorAll('col[data-col-key]'))
      .map(c => (c as HTMLElement).dataset.colKey)
      .filter((k): k is string => !!k);
    if (keys.length === 0) return;

    const clone = table.cloneNode(true) as HTMLTableElement;
    // Larguras fixas do <colgroup> impediriam o cálculo natural — zerar todas.
    clone.querySelectorAll('col').forEach(c => { (c as HTMLElement).style.width = 'auto'; });
    // nowrap + overflow visible: queremos a largura SEM quebra de linha; o clamp
    // em `max` logo abaixo é o que impede uma coluna de tomar a tela inteira.
    clone.querySelectorAll('th, td').forEach(cell => {
      const el = cell as HTMLElement;
      el.style.whiteSpace = 'nowrap';
      el.style.overflow = 'visible';
      el.style.width = 'auto';
      el.style.maxWidth = 'none';
    });

    // Campo editável dentro da célula (input/select de edição inline, §7.1) vira
    // TEXTO no clone, para a coluna medir o CONTEÚDO.
    //
    // Sem isto, "ajustar ao conteúdo" ignorava justamente as colunas editáveis:
    // esses controles usam `w-full` (largura 100%), e largura percentual não
    // contribui nada para a largura intrínseca numa tabela `table-layout: auto`
    // — a coluna media só o rótulo do cabeçalho e encolhia por cima do valor.
    // Medido em 2026-09-04 na aba Parcelas de Gerenciar Negociação.
    // ⚠️ O valor tem de vir do controle ORIGINAL, não do clone: `cloneNode` copia
    // atributos, e React grava o valor como PROPRIEDADE. No clone todo `<select>`
    // volta para a primeira opção (o placeholder "Tipo Pagto.") e o input perde o
    // texto — foi por isso que a coluna Tipo continuava estreita mesmo depois de
    // o autoFit passar a medir os campos. Os dois `querySelectorAll` percorrem a
    // mesma árvore na mesma ordem, então o índice casa.
    const controlesOriginais = Array.from(table.querySelectorAll('input, select, textarea'));
    Array.from(clone.querySelectorAll('input, select, textarea')).forEach((node, idx) => {
      const el = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const orig = (controlesOriginais[idx] ?? el) as HTMLInputElement | HTMLSelectElement;
      // Checkbox/radio têm tamanho próprio e não representam conteúdo de coluna.
      if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes((el as HTMLInputElement).type)) return;
      const texto = el.tagName === 'SELECT'
        ? ((orig as HTMLSelectElement).selectedOptions?.[0]?.text ?? '')
        : (orig.value || (orig as HTMLInputElement).placeholder || '');
      const span = clone.ownerDocument.createElement('span');
      span.textContent = texto;
      // Herda as CLASSES do próprio controle (menos as de largura) em vez de
      // adivinhar tipografia: assim o span mede com a mesma fonte, padding e
      // borda do campo. Medir com a fonte herdada da célula dava um texto ~30%
      // mais estreito, e "Parcela nas chaves" continuava cortado mesmo depois do
      // ajuste automático. As classes de largura precisam sair — `w-full` é
      // justamente o que zera a largura intrínseca.
      span.className = el.className
        .split(/\s+/)
        .filter(c => !/^(w-|min-w-|max-w-)/.test(c))
        .join(' ');
      span.style.display = 'inline-block';
      span.style.width = 'auto';
      span.style.whiteSpace = 'nowrap';
      // O que sobra é a moldura que o navegador desenha por conta própria e não
      // vem nas classes: a seta do select, o ícone de calendário e as setinhas
      // do number (que ficam POR CIMA do texto). Margem, não padding, para somar
      // ao padding que já veio das classes.
      const tipoInput = el.tagName === 'INPUT' ? (el as HTMLInputElement).type : '';
      const moldura = el.tagName === 'SELECT' ? 26
        : tipoInput === 'date' ? 26
          : tipoInput === 'number' ? 26
            : 4;
      span.style.marginRight = `${moldura}px`;
      el.replaceWith(span);
    });
    const body = clone.querySelector('tbody');
    if (body) {
      Array.from(body.rows).slice(sampleRows).forEach(r => r.remove());
    }
    clone.style.tableLayout = 'auto';
    clone.style.width = 'auto';
    clone.style.minWidth = '0';
    clone.style.position = 'absolute';
    clone.style.left = '-99999px';
    clone.style.top = '0';
    clone.style.visibility = 'hidden';
    clone.style.pointerEvents = 'none';

    // Inserido ao lado da tabela real (não no <body>) para herdar o mesmo
    // contexto de fonte/estilo — no body as medidas sairiam de outra tipografia.
    const host = table.parentElement ?? document.body;
    host.appendChild(clone);

    const measured: Record<string, number> = {};
    try {
      const headRow = clone.querySelector('thead tr');
      const cells = headRow ? Array.from(headRow.children) : [];
      const cloneCols = Array.from(clone.querySelectorAll('col'));
      cloneCols.forEach((c, i) => {
        const key = (c as HTMLElement).dataset.colKey;
        const cell = cells[i] as HTMLElement | undefined;
        if (!key || !cell) return;
        measured[key] = Math.ceil(cell.getBoundingClientRect().width);
      });
    } finally {
      host.removeChild(clone);
    }

    // Degradação segura: sem layout disponível (tabela oculta, aba em background,
    // jsdom) todas as medidas voltam 0 e o clamp jogaria TODA coluna para `min`,
    // destruindo as larguras salvas. Nesse caso não mexe em nada.
    const anyMeasured = Object.values(measured).some(v => v > 0);
    if (!anyMeasured) return;

    const next: Record<string, number> = {};
    keys.forEach(k => {
      const m = measured[k];
      // Coluna sem medida válida mantém a largura atual em vez de virar `min`.
      if (m == null || m <= 0) return;
      next[k] = Math.max(min, Math.min(max, m));
    });

    if (fill) {
      const container = (table.parentElement as HTMLElement | null)?.clientWidth ?? 0;
      // Colunas estruturais sem `data-col-key` e com largura fixa (ex: o checkbox
      // de 40px de SupplierList) ocupam espaço real mas não são redimensionáveis.
      // Ignorá-las faria a soma final estourar o container e criar scroll lateral.
      // O <col> espaçador nao tem width e soma 0 aqui — que é justamente o papel dele.
      const fixedExtras = Array.from(table.querySelectorAll('col'))
        .filter(c => !(c as HTMLElement).dataset.colKey)
        .reduce((s, c) => s + (parseInt((c as HTMLElement).style.width, 10) || 0), 0);
      const total = keys.reduce((s, k) => s + (next[k] ?? getWidth(k)), 0);
      const slack = container - total - fixedExtras;
      if (slack > 0 && total > 0) {
        // Distribui proporcionalmente e joga o arredondamento na última coluna,
        // para a soma bater exata com o container (senão sobra 1-2px de folga).
        let used = 0;
        keys.forEach((k, i) => {
          const base = next[k] ?? getWidth(k);
          if (i === keys.length - 1) {
            next[k] = Math.min(max, base + (slack - used));
          } else {
            const add = Math.floor((base / total) * slack);
            next[k] = Math.min(max, base + add);
            used += add;
          }
        });
      }
    }

    setWidths(prev => {
      const merged = { ...prev, ...next };
      try { localStorage.setItem(storageKey, JSON.stringify(merged)); } catch { /* ignore */ }
      return merged;
    });
  }, [min, max, storageKey, getWidth]);

  return { tableRef, getWidth, ResizeHandle, autoFit };
}
