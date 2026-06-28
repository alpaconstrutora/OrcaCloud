import React from 'react';
import { Settings, ChevronUp, ChevronDown } from 'lucide-react';

export type ColumnConfig = {
  key: string;
  label: string;
  sortable?: boolean;
};

export const useTableColumns = (defaultColumns: ColumnConfig[], storageKey: string = 'tableColumns') => {
  const defaultVisibleColumns = defaultColumns.map(col => col.key);

  // Carregar do localStorage na inicialização
  const [visibleColumns, setVisibleColumns] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return defaultVisibleColumns;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn(`Failed to load column preferences from localStorage (${storageKey}):`, e);
    }
    return defaultVisibleColumns;
  });

  const [sortColumn, setSortColumn] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [showColumnConfig, setShowColumnConfig] = React.useState(false);

  // Persistir quando visibleColumns muda
  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
    } catch (e) {
      console.warn(`Failed to save column preferences to localStorage (${storageKey}):`, e);
    }
  }, [visibleColumns, storageKey]);

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
  return (
    <div className="relative">
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
            className="mt-3 w-full text-xs font-bold text-blue-600 py-2 rounded-lg hover:bg-blue-50 transition-colors"
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
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  colKey,
  sortable = true,
  sortColumn,
  sortDirection,
  onSort,
  className = 'px-6 py-4',
}) => {
  if (!sortable) {
    return (
      <th className={`${className} text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]`}>
        {label}
      </th>
    );
  }

  return (
    <th
      onClick={() => onSort?.(colKey)}
      className={`${className} text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] cursor-pointer hover:text-gray-600 transition-colors select-none group`}
    >
      <div className="flex items-center gap-1.5">
        {label}
        {sortColumn === colKey && (
          <span className="inline-flex items-center text-blue-600 group-hover:text-blue-700">
            {sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </div>
    </th>
  );
};
