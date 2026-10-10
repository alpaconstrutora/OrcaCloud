import React from 'react';
import { createPortal } from 'react-dom';
import { Filter, Plus, ChevronDown, Bookmark, X, Check } from 'lucide-react';
import { usePersistedState } from './TableUtils';
import ActionIconButton from './ActionIconButton';

export type FilterFieldType = 'text' | 'select' | 'date' | 'number';

export interface FilterOption { value: string; label: string }

/**
 * `options` — o conjunto de valores que o app JÁ conhece para o campo
 * (ui_ux_guia_unificado.md §5.5). O usuário escolhe em vez de digitar:
 * - `type: 'select'` + options: lista fechada (enum pequeno: status, tipo, origem);
 * - `type: 'text'` + options: lista com busca — clicar abre todas, digitar filtra,
 *   e os operadores de texto (Contém, É...) continuam (lookup grande: fornecedor, obra).
 * O `getValue` da tela devolve o mesmo valor que a célula MOSTRA — é ele que a
 * opção escolhida precisa casar.
 */
export interface FilterFieldConfig {
  key: string;
  label: string;
  type: FilterFieldType;
  options?: FilterOption[]; // obrigatório quando type === 'select'
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

const OPERATOR_LABEL = Object.fromEntries(
  Object.values(OPERATORS_BY_TYPE).flat().map(op => [op.value, op.label]),
) as Record<FilterOperator, string>;

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

/** Caixa e acento não importam no filtro: "concluido" casa com "Concluído". */
export function normalizarTexto(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Opções a partir dos valores distintos das linhas carregadas — para campo cujo
 * conjunto não vem de um cadastro que a tela já tenha (cliente gravado como texto,
 * etapa livre). Sem vazios nem repetidos (por `normalizarTexto`), em ordem alfabética.
 */
export function distinctOptions<T>(rows: T[], getValue: (row: T) => unknown): FilterOption[] {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const raw = getValue(row);
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;
    const label = String(raw).trim();
    const key = normalizarTexto(label);
    if (!byKey.has(key)) byKey.set(key, label);
  }
  return [...byKey.values()]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map(v => ({ value: v, label: v }));
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
            : normalizarTexto(raw) === normalizarTexto(rule.value);
        case 'is_not':
          if (isEmpty) return true;
          return field.type === 'number'
            ? Number(raw) !== Number(rule.value)
            : normalizarTexto(raw) !== normalizarTexto(rule.value);
        case 'contains':
          if (isEmpty) return false;
          return normalizarTexto(raw).includes(normalizarTexto(rule.value));
        case 'not_contains':
          if (isEmpty) return true;
          return !normalizarTexto(raw).includes(normalizarTexto(rule.value));
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

/** Marca os nós que o painel abre por portal — o clique neles não é "clique fora". */
const PORTAL_ATTR = 'data-advanced-filter-portal';
const COMBO_MAX_ITENS = 200;

/**
 * Valor de campo `text` com `options`: lista com busca. Clicar abre todas as opções,
 * digitar filtra (sem caixa nem acento), escolher grava o valor exato — e o texto
 * digitado continua valendo para "Contém". A lista sai por portal com `position:
 * fixed` (mesma razão do FilterPopover, §5.4: a toolbar acoplada é `overflow-hidden`).
 */
const FilterValueCombobox: React.FC<{
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState(false); // abriu por clique = mostra tudo
  const [active, setActive] = React.useState(0);
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const termo = typed ? normalizarTexto(value) : '';
  const filtradas = React.useMemo(
    () => (termo ? options.filter(o => normalizarTexto(o.label).includes(termo)) : options),
    [options, termo],
  );
  const visiveis = filtradas.slice(0, COMBO_MAX_ITENS);

  const updatePos = React.useCallback(() => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const fora = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', fora);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  React.useEffect(() => { setActive(0); }, [termo]);
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const escolher = (o: FilterOption) => { onChange(o.value); setOpen(false); setTyped(false); };

  return (
    <div className="flex-1 relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={value}
        onFocus={() => { setTyped(false); setOpen(true); }}
        onClick={() => { if (!open) { setTyped(false); setOpen(true); } }}
        onChange={e => { onChange(e.target.value); setTyped(true); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, visiveis.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && open && visiveis[active]) { e.preventDefault(); escolher(visiveis[active]); }
          else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } // fecha só a lista, não o painel
        }}
        placeholder="Escolha ou digite..."
        className="w-full border border-gray-200 rounded-lg pl-2 pr-7 py-1.5 text-form-input outline-none focus:border-blue-400"
      />
      <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      {open && createPortal(
        <div
          ref={listRef}
          {...{ [PORTAL_ATTR]: '' }}
          role="listbox"
          style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width }}
          className="bg-white rounded-[10px] border border-gray-200 shadow-lg p-1.5 z-[10000] max-h-64 overflow-auto"
        >
          {visiveis.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">
              Nenhuma opção com "{value}" — o texto digitado vale para Contém/É.
            </div>
          ) : visiveis.map((o, i) => {
            const selecionada = normalizarTexto(o.value) === normalizarTexto(value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selecionada}
                data-idx={i}
                onMouseDown={e => e.preventDefault()} // mantém o foco no input
                onMouseEnter={() => setActive(i)}
                onClick={() => escolher(o)}
                className={`w-full flex items-center justify-between gap-3 px-3 h-8 rounded-[6px] text-sm text-left transition-colors ${
                  i === active ? 'bg-gray-50' : ''
                } ${selecionada ? 'text-blue-700 font-medium' : 'text-gray-700'}`}
              >
                <span className="truncate">{o.label}</span>
                {selecionada && <Check className="w-4 h-4 shrink-0" />}
              </button>
            );
          })}
          {filtradas.length > COMBO_MAX_ITENS && (
            <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100 mt-1">
              Mostrando {COMBO_MAX_ITENS} de {filtradas.length} — digite para refinar.
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};

interface AdvancedFilterPanelProps {
  fields: FilterFieldConfig[];
  state: ReturnType<typeof useAdvancedFilters>;
  /** Escala de radius do botão-gatilho (ui_ux_guia_unificado.md §16). 'compact' (default,
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
      const alvo = e.target as Element;
      if (alvo.closest?.(`[${PORTAL_ATTR}]`)) return; // lista aberta por portal pelo próprio painel
      if (state.showPanel && panelRef.current && !panelRef.current.contains(alvo)) {
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
                      <ActionIconButton kind="delete" size="sm" title="Excluir filtro salvo" onClick={() => state.deleteSavedFilter(f.id)} />
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
                    {/* regra salva quando o campo era de outro tipo (ex.: Status era texto
                        com "Contém"): o operador continua valendo — mostra em vez de sumir */}
                    {!operators.some(op => op.value === rule.operator) && (
                      <option value={rule.operator}>{OPERATOR_LABEL[rule.operator]}</option>
                    )}
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
                      // valor digitado antes da lista existir ("concluído") marca a opção certa
                      value={field.options?.find(o => normalizarTexto(o.value) === normalizarTexto(rule.value))?.value ?? (rule.value as string) ?? ''}
                      onChange={e => state.updateRule(rule.id, { value: e.target.value })}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-form-input outline-none focus:border-blue-400"
                    >
                      <option value="">Selecione uma opção</option>
                      {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : needsValue && field.type === 'text' && field.options?.length ? (
                    <FilterValueCombobox
                      value={(rule.value as string) ?? ''}
                      options={field.options}
                      onChange={v => state.updateRule(rule.id, { value: v })}
                    />
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

                  <ActionIconButton kind="delete" size="sm" title="Remover regra" className="shrink-0" onClick={() => state.removeRule(rule.id)} />
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
