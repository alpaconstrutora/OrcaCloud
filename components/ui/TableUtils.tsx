import React from 'react';
import { Settings, ChevronUp, ChevronDown } from 'lucide-react';

export type ColumnConfig = {
  key: string;
  label: string;
  sortable?: boolean;
};

interface PersistedTableState {
  visibleColumns: string[];
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  /** Todas as chaves de coluna que este usuário já "conheceu" (visíveis ou ocultas),
   *  usado só para detectar colunas novas introduzidas depois do último salvamento. */
  knownColumns: string[];
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
function loadPersistedTableState(storageKey: string, defaultVisibleColumns: string[]): PersistedTableState {
  const fallback: PersistedTableState = { visibleColumns: defaultVisibleColumns, sortColumn: null, sortDirection: 'asc', knownColumns: defaultVisibleColumns };
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);

    let storedVisible: string[];
    let sortColumn: string | null;
    let sortDirection: 'asc' | 'desc';
    let knownColumns: string[];

    if (Array.isArray(parsed)) {
      // Formato legado: só as colunas visíveis.
      storedVisible = parsed;
      sortColumn = null;
      sortDirection = 'asc';
      knownColumns = parsed;
    } else {
      storedVisible = parsed.visibleColumns ?? defaultVisibleColumns;
      sortColumn = parsed.sortColumn ?? null;
      sortDirection = parsed.sortDirection ?? 'asc';
      // Sem knownColumns salvo (preferência de antes dessa mudança): assume que
      // o que estava visível é tudo que o usuário conhecia até então.
      knownColumns = parsed.knownColumns ?? storedVisible;
    }

    const newColumns = defaultVisibleColumns.filter(k => !knownColumns.includes(k));
    return {
      visibleColumns: newColumns.length ? [...storedVisible, ...newColumns] : storedVisible,
      sortColumn,
      sortDirection,
      knownColumns: newColumns.length ? [...knownColumns, ...newColumns] : knownColumns,
    };
  } catch (e) {
    console.warn(`Failed to load table preferences from localStorage (${storageKey}):`, e);
    return fallback;
  }
}

export const useTableColumns = (defaultColumns: ColumnConfig[], storageKey: string = 'tableColumns') => {
  const defaultVisibleColumns = defaultColumns.map(col => col.key);

  const [initial] = React.useState(() => loadPersistedTableState(storageKey, defaultVisibleColumns));
  const [visibleColumns, setVisibleColumns] = React.useState<string[]>(initial.visibleColumns);
  const [sortColumn, setSortColumn] = React.useState<string | null>(initial.sortColumn);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>(initial.sortDirection);
  const [knownColumns, setKnownColumns] = React.useState<string[]>(initial.knownColumns);
  const [showColumnConfig, setShowColumnConfig] = React.useState(false);

  // Persistir colunas + ordenação + conhecidas juntas (F2: a ordenação sobrevive a navegação/reload).
  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ visibleColumns, sortColumn, sortDirection, knownColumns }));
    } catch (e) {
      console.warn(`Failed to save table preferences to localStorage (${storageKey}):`, e);
    }
  }, [visibleColumns, sortColumn, sortDirection, knownColumns, storageKey]);

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
    setKnownColumns(defaultVisibleColumns);
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
}

export const ColumnConfigButton: React.FC<ColumnConfigButtonProps> = ({
  columns,
  visibleColumns,
  showColumnConfig,
  onToggleShow,
  onToggleColumn,
  onReset,
}) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showColumnConfig) {
        onToggleShow();
      }
    };
    
    const handleClickOutside = (e: MouseEvent) => {
      if (showColumnConfig && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onToggleShow();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColumnConfig, onToggleShow]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={onToggleShow}
        className="p-2.5 rounded-xl transition-all text-gray-400 hover:text-gray-600 relative"
        title="Configurar Colunas"
      >
        <Settings className="w-5 h-5" />
      </button>
      {showColumnConfig && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg p-4 z-50 min-w-[250px]">
          <div className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wider">Colunas Visíveis</div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
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
          <button
            onClick={onReset}
            className="mt-3 w-full text-button font-bold text-blue-600 py-2 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Restaurar Padrão
          </button>
        </div>
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
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  colKey,
  sortable = true,
  sortColumn,
  sortDirection,
  onSort,
  className = 'px-6 py-4',
  children,
}) => {
  if (!sortable) {
    return (
      <th className={`${className} relative text-table-header font-semibold text-gray-400 uppercase tracking-wider`}>
        {label}
        {children}
      </th>
    );
  }

  return (
    <th
      onClick={() => onSort?.(colKey)}
      className={`${className} relative text-table-header font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 transition-colors select-none group`}
    >
      <div className="flex items-center gap-1.5">
        {label}
        {sortColumn === colKey && (
          <span className="inline-flex items-center text-blue-600 group-hover:text-blue-700">
            {sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </div>
      {children}
    </th>
  );
};
