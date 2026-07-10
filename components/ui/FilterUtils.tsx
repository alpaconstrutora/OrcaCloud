import React from 'react';
import { Filter, Plus, Trash2, ChevronDown, Bookmark, X } from 'lucide-react';
import { usePersistedState } from './TableUtils';

export type FilterFieldType = 'text' | 'select' | 'date' | 'number';

export interface FilterFieldConfig {
  key: string;
  label: string;
  type: FilterFieldType;
  options?: { value: string; label: string }[]; // obrigatório quando type === 'select'
}

export type FilterOperator =
  | 'is' | 'is_not'
  | 'contains' | 'not_contains'
  | 'gt' | 'lt' | 'between'
  | 'is_set' | 'is_not_set';

const OPERATORS_BY_TYPE: Record<FilterFieldType, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'contains', label: 'Contém' },
    { value: 'not_contains', label: 'Não contém' },
    { value: 'is', label: 'É' },
    { value: 'is_not', label: 'Não é' },
    { value: 'is_set', label: 'Está configurado' },
    { value: 'is_not_set', label: 'Não está configurado' },
  ],
  select: [
    { value: 'is', label: 'É' },
    { value: 'is_not', label: 'Não é' },
    { value: 'is_set', label: 'Está configurado' },
    { value: 'is_not_set', label: 'Não está configurado' },
  ],
  date: [
    { value: 'is', label: 'É' },
    { value: 'gt', label: 'Depois de' },
    { value: 'lt', label: 'Antes de' },
    { value: 'between', label: 'Entre' },
    { value: 'is_set', label: 'Está configurado' },
    { value: 'is_not_set', label: 'Não está configurado' },
  ],
  number: [
    { value: 'is', label: 'É' },
    { value: 'gt', label: 'Maior que' },
    { value: 'lt', label: 'Menor que' },
    { value: 'between', label: 'Entre' },
    { value: 'is_set', label: 'Está configurado' },
    { value: 'is_not_set', label: 'Não está configurado' },
  ],
};

/** Operadores que não precisam de input de valor. */
const VALUELESS_OPERATORS: FilterOperator[] = ['is_set', 'is_not_set'];

export interface FilterRule {
  id: string;
  fieldKey: string;
  operator: FilterOperator;
  value: unknown; // string | number | [min, max] | undefined (operadores sem valor)
}

export interface SavedFilter {
  id: string;
  name: string;
  rules: FilterRule[];
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultRule(fields: FilterFieldConfig[]): FilterRule {
  const field = fields[0];
  return { id: makeId(), fieldKey: field.key, operator: OPERATORS_BY_TYPE[field.type][0].value, value: undefined };
}

/**
 * Avalia uma lista de regras em AND contra um item. `getValue` isola o hook do
 * shape de cada tela (campos derivados/aninhados não precisam virar propriedade
 * plana só para o filtro funcionar).
 */
export function applyFilterRules<T>(
  items: T[],
  rules: FilterRule[],
  fields: FilterFieldConfig[],
  getValue: (item: T, fieldKey: string) => unknown,
): T[] {
  if (rules.length === 0) return items;
  const fieldByKey = new Map(fields.map(f => [f.key, f]));

  return items.filter(item =>
    rules.every(rule => {
      const field = fieldByKey.get(rule.fieldKey);
      if (!field) return true; // campo removido da config — regra órfã não derruba a lista
      const raw = getValue(item, rule.fieldKey);
      const isEmpty = raw === null || raw === undefined || raw === '';

      switch (rule.operator) {
        case 'is_set': return !isEmpty;
        case 'is_not_set': return isEmpty;
        case 'is':
          if (isEmpty) return false;
          return field.type === 'number'
            ? Number(raw) === Number(rule.value)
            : String(raw).toLowerCase() === String(rule.value ?? '').toLowerCase();
        case 'is_not':
          if (isEmpty) return true;
          return field.type === 'number'
            ? Number(raw) !== Number(rule.value)
            : String(raw).toLowerCase() !== String(rule.value ?? '').toLowerCase();
        case 'contains':
          if (isEmpty) return false;
          return String(raw).toLowerCase().includes(String(rule.value ?? '').toLowerCase());
        case 'not_contains':
          if (isEmpty) return true;
          return !String(raw).toLowerCase().includes(String(rule.value ?? '').toLowerCase());
        case 'gt':
          if (isEmpty) return false;
          return field.type === 'date' ? String(raw) > String(rule.value ?? '') : Number(raw) > Number(rule.value);
        case 'lt':
          if (isEmpty) return false;
          return field.type === 'date' ? String(raw) < String(rule.value ?? '') : Number(raw) < Number(rule.value);
        case 'between': {
          if (isEmpty) return false;
          const [min, max] = (rule.value as [string | number, string | number]) ?? [undefined, undefined];
          if (field.type === 'date') {
            if (min && String(raw) < String(min)) return false;
            if (max && String(raw) > String(max)) return false;
            return true;
          }
          if (min !== undefined && min !== '' && Number(raw) < Number(min)) return false;
          if (max !== undefined && max !== '' && Number(raw) > Number(max)) return false;
          return true;
        }
        default: return true;
      }
    })
  );
}

export function useAdvancedFilters(fields: FilterFieldConfig[], storageKey: string) {
  const [rules, setRules] = usePersistedState<FilterRule[]>(`${storageKey}:rules`, []);
  const [savedFilters, setSavedFilters] = usePersistedState<SavedFilter[]>(`${storageKey}:saved`, []);
  const [showPanel, setShowPanel] = React.useState(false);

  const addRule = () => setRules(prev => [...prev, defaultRule(fields)]);
  const removeRule = (id: string) => setRules(prev => prev.filter(r => r.id !== id));
  const updateRule = (id: string, patch: Partial<FilterRule>) =>
    setRules(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const clearRules = () => setRules([]);

  const saveCurrentAsFilter = (name: string) => {
    if (!name.trim() || rules.length === 0) return;
    setSavedFilters(prev => [...prev, { id: makeId(), name: name.trim(), rules }]);
  };
  const applySavedFilter = (id: string) => {
    const f = savedFilters.find(s => s.id === id);
    if (f) setRules(f.rules);
  };
  const deleteSavedFilter = (id: string) => setSavedFilters(prev => prev.filter(s => s.id !== id));

  return {
    rules, addRule, removeRule, updateRule, clearRules,
    savedFilters, saveCurrentAsFilter, applySavedFilter, deleteSavedFilter,
    showPanel, setShowPanel,
    activeCount: rules.length,
  };
}

interface AdvancedFilterPanelProps {
  fields: FilterFieldConfig[];
  state: ReturnType<typeof useAdvancedFilters>;
  /** Escala de radius do botão-gatilho (ui_ux_standard_guide.md §16). 'compact' (default,
   *  inalterado) para telas na escala compacta (h-9/rounded-[6px]). 'padrão' para telas que
   *  ainda usam a escala grande (rounded-[2.5rem]/py-4) — ver SupplyChainOrderList.tsx. */
  triggerSize?: 'compact' | 'padrão';
}

/**
 * Popover "campo + operador + valor" (padrão ClickUp). Segue o mesmo mecanismo
 * de abre/fecha do ColumnConfigButton (click fora + Escape) em vez de um Sheet —
 * é um controle transitório sobre a lista atual, não edição de item (UI_PATTERNS.md).
 */
export const AdvancedFilterPanel: React.FC<AdvancedFilterPanelProps> = ({ fields, state, triggerSize = 'compact' }) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [savingName, setSavingName] = React.useState<string | null>(null);
  const [showSaved, setShowSaved] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.showPanel) state.setShowPanel(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (state.showPanel && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        state.setShowPanel(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [state.showPanel]);

  const fieldByKey = new Map(fields.map(f => [f.key, f]));

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => state.setShowPanel(v => !v)}
        className={
          triggerSize === 'padrão'
            ? `flex items-center gap-2 px-4 py-4 rounded-[1.25rem] border transition-all active:scale-95 shadow-sm text-sm font-semibold whitespace-nowrap ${
                state.activeCount > 0 ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-transparent bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white'
              }`
            : `flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-button font-semibold transition-colors ${
                state.activeCount > 0 ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`
        }
      >
        <Filter className={triggerSize === 'padrão' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        Filtro avançado
        {state.activeCount > 0 && (
          <span className="ml-0.5 bg-blue-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
            {state.activeCount}
          </span>
        )}
      </button>

      {state.showPanel && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg p-4 z-50 min-w-[420px]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Filtros</span>
            <div className="relative">
              <button
                onClick={() => setShowSaved(v => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
              >
                <Bookmark className="w-3.5 h-3.5" /> Filtros salvos <ChevronDown className="w-3 h-3" />
              </button>
              {showSaved && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-md py-1 min-w-[180px] z-10">
                  {state.savedFilters.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-400">Nenhum filtro salvo</div>
                  )}
                  {state.savedFilters.map(f => (
                    <div key={f.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 text-sm">
                      <button className="text-left flex-1 text-gray-700" onClick={() => { state.applySavedFilter(f.id); setShowSaved(false); }}>
                        {f.name}
                      </button>
                      <button onClick={() => state.deleteSavedFilter(f.id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {state.rules.map(rule => {
              const field = fieldByKey.get(rule.fieldKey) ?? fields[0];
              const operators = OPERATORS_BY_TYPE[field.type];
              const needsValue = !VALUELESS_OPERATORS.includes(rule.operator);
              return (
                <div key={rule.id} className="flex items-center gap-2">
                  <select
                    value={rule.fieldKey}
                    onChange={e => {
                      const newField = fieldByKey.get(e.target.value)!;
                      state.updateRule(rule.id, { fieldKey: newField.key, operator: OPERATORS_BY_TYPE[newField.type][0].value, value: undefined });
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-form-input outline-none focus:border-blue-400 w-32"
                  >
                    {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>

                  <select
                    value={rule.operator}
                    onChange={e => state.updateRule(rule.id, { operator: e.target.value as FilterOperator, value: undefined })}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-form-input outline-none focus:border-blue-400 w-36"
                  >
                    {operators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>

                  {needsValue && rule.operator === 'between' ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        type={field.type === 'date' ? 'date' : 'number'}
                        value={(rule.value as any)?.[0] ?? ''}
                        onChange={e => state.updateRule(rule.id, { value: [e.target.value, (rule.value as any)?.[1] ?? ''] })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-form-input outline-none focus:border-blue-400"
                      />
                      <span className="text-xs text-gray-400">e</span>
                      <input
                        type={field.type === 'date' ? 'date' : 'number'}
                        value={(rule.value as any)?.[1] ?? ''}
                        onChange={e => state.updateRule(rule.id, { value: [(rule.value as any)?.[0] ?? '', e.target.value] })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-form-input outline-none focus:border-blue-400"
                      />
                    </div>
                  ) : needsValue && field.type === 'select' ? (
                    <select
                      value={(rule.value as string) ?? ''}
                      onChange={e => state.updateRule(rule.id, { value: e.target.value })}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-form-input outline-none focus:border-blue-400"
                    >
                      <option value="">Selecione uma opção</option>
                      {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : needsValue ? (
                    <input
                      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                      value={(rule.value as string | number) ?? ''}
                      onChange={e => state.updateRule(rule.id, { value: e.target.value })}
                      placeholder="Valor..."
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-form-input outline-none focus:border-blue-400"
                    />
                  ) : (
                    <div className="flex-1" />
                  )}

                  <button onClick={() => state.removeRule(rule.id)} className="text-gray-300 hover:text-red-500 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={state.addRule}
            className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar filtro
          </button>

          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            {savingName === null ? (
              <button
                onClick={() => setSavingName('')}
                disabled={state.rules.length === 0}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Salvar como...
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={savingName}
                  onChange={e => setSavingName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && savingName.trim()) { state.saveCurrentAsFilter(savingName); setSavingName(null); }
                    if (e.key === 'Escape') setSavingName(null);
                  }}
                  placeholder="Nome do filtro"
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-blue-400 w-32"
                />
                <button
                  onClick={() => { if (savingName.trim()) { state.saveCurrentAsFilter(savingName); setSavingName(null); } }}
                  className="text-xs font-semibold text-blue-600"
                >
                  OK
                </button>
                <button onClick={() => setSavingName(null)} className="text-gray-300 hover:text-gray-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {state.rules.length > 0 && (
              <button onClick={state.clearRules} className="text-xs font-semibold text-gray-400 hover:text-red-500">
                Limpar tudo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
