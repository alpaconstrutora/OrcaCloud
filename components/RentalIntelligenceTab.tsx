// components/RentalIntelligenceTab.tsx
// Aba "Inteligência" — regras de ajuste percentual do aluguel, por edifício.
// Cada linha é UMA regra: Característica + Validação + Faixa de ajuste. O
// percentual não sobrescreve o aluguel por fora — entra como 6º fator no
// modelo hedônico da aba "Inteligência Hedônica" (RentalPricingIntelligencePanel)
// quando o usuário roda "Aplicar" por lá. Ver services/rentalPricingRuleService.ts.
import React from 'react';
import { Plus, Search, RefreshCw, AlertCircle, MoveHorizontal, Sliders } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { useConfirm } from './ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { useToast } from '../hooks/useToast';
import {
    rentalPricingRuleService,
    PHYSICAL_ATTRIBUTES,
    OPERATOR_LABEL,
    OPERATORS_BY_ATTRIBUTE_TYPE,
    VALUELESS_OPERATORS,
    countMatchesByRule,
    type RuleAttributeOption,
    type RuleAttributeType,
    type UnitAttributes,
} from '../services/rentalPricingRuleService';
import { empreendimentoUnitCharacteristicService } from '../services/empreendimentoUnitCharacteristicService';
import {
    Property, RentalPricingRule, RentalPricingRuleOperator,
    EmpreendimentoUnitCharacteristic,
} from '../types';

function characteristicToAttributeOption(c: EmpreendimentoUnitCharacteristic): RuleAttributeOption {
    const type: RuleAttributeType =
        c.input_type === 'MULTI_SELECT' ? 'multi_select'
            : c.input_type === 'SELECT' ? 'select'
            : c.input_type === 'NUMBER' ? 'number'
            : c.input_type === 'BOOLEAN' ? 'select'
            : 'text';
    const options = c.input_type === 'SELECT' || c.input_type === 'MULTI_SELECT'
        ? c.options.map(o => ({ value: o.value, label: o.label }))
        : c.input_type === 'BOOLEAN' ? [{ value: 'true', label: 'Sim' }] : undefined;
    return { key: `carac:${c.id}`, label: c.name, type, options };
}

function resolveValueLabel(rule: RentalPricingRule, attr?: RuleAttributeOption): string {
    if (attr?.options) {
        const opt = attr.options.find(o => o.value === rule.value_text);
        if (opt) return opt.label;
    }
    return rule.value_text ?? (rule.value_num != null ? String(rule.value_num) : '?');
}

/** Frase legível da regra para a coluna "Validação" — ex: "> 15 m²", "contém Elevador". */
function describeRule(rule: RentalPricingRule, attr?: RuleAttributeOption): string {
    const unit = attr?.unit ? ` ${attr.unit}` : '';
    switch (rule.operator) {
        case 'is_set': return 'está preenchido';
        case 'is_not_set': return 'não está preenchido';
        case 'between': return `entre ${rule.value_num ?? '?'} e ${rule.value_num2 ?? '?'}${unit}`;
        case 'gt': return `> ${rule.value_num ?? '?'}${unit}`;
        case 'gte': return `≥ ${rule.value_num ?? '?'}${unit}`;
        case 'lt': return `< ${rule.value_num ?? '?'}${unit}`;
        case 'lte': return `≤ ${rule.value_num ?? '?'}${unit}`;
        case 'eq': return `= ${resolveValueLabel(rule, attr)}`;
        case 'neq': return `≠ ${resolveValueLabel(rule, attr)}`;
        case 'contains': return `contém ${resolveValueLabel(rule, attr)}`;
        case 'not_contains': return `não contém ${resolveValueLabel(rule, attr)}`;
        default: return '—';
    }
}

const COLUMNS: ColumnConfig[] = [
    { key: 'attribute', label: 'Característica', sortable: true },
    { key: 'validation', label: 'Validação', sortable: false },
    { key: 'adjust_pct', label: 'Faixa de ajuste', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const COLUMN_HEADERS: Record<string, { label: string; className: string }> = {
    attribute: { label: 'Característica', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    validation: { label: 'Validação', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    adjust_pct: { label: 'Faixa de ajuste', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

const DEFAULT_COL_WIDTHS: Record<string, number> = { attribute: 220, validation: 260, adjust_pct: 180, actions: 130 };
const DATA_COLUMN_KEYS = COLUMNS.filter(c => c.key !== 'actions').map(c => c.key);

function emptyRuleForm() {
    return { attributeKey: '', operator: 'gt' as RentalPricingRuleOperator, valueNum: '', valueNum2: '', valueText: '', adjustPct: '' };
}
type RuleForm = ReturnType<typeof emptyRuleForm>;

interface Props {
    /** Todas as unidades carregadas na tela — o componente filtra pelas do edifício aberto. */
    properties: Property[];
    buildingPropertyId: string;
    organizationId: string;
}

export const RentalIntelligenceTab: React.FC<Props> = ({ properties, buildingPropertyId, organizationId }) => {
    const confirm = useConfirm();
    const { localToast, showToast } = useToast();

    const units = React.useMemo(
        () => properties.filter(p => p.parent_id === buildingPropertyId),
        [properties, buildingPropertyId],
    );

    const [rules, setRules] = React.useState<RentalPricingRule[]>([]);
    const [characteristics, setCharacteristics] = React.useState<EmpreendimentoUnitCharacteristic[]>([]);
    const [attrsByUnit, setAttrsByUnit] = React.useState<Record<string, UnitAttributes>>({});
    const [loading, setLoading] = React.useState(true);

    const [search, setSearch] = usePersistedState<string>('rentalPricingRules:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'rentalPricingRulesColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'rentalPricingRulesColWidths');
    const tableTotalWidth = DATA_COLUMN_KEYS.reduce(
        (sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0),
        0,
    ) + cols.getWidth('actions');

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const [ruleList, charList, attrs] = await Promise.all([
                rentalPricingRuleService.list(buildingPropertyId),
                empreendimentoUnitCharacteristicService.listCharacteristics(organizationId),
                rentalPricingRuleService.resolveUnitAttributes(units, organizationId),
            ]);
            setRules(ruleList);
            setCharacteristics(charList);
            setAttrsByUnit(attrs);
        } catch (err) {
            console.error('[RentalIntelligenceTab] erro ao carregar:', err);
        } finally {
            setLoading(false);
        }
        // `units` muda de referência a cada render do pai — usamos o length+ids como proxy
        // estável para não recarregar em loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buildingPropertyId, organizationId, units.map(u => u.id).join(',')]);

    React.useEffect(() => { load(); }, [load]);

    const attributeOptions = React.useMemo<RuleAttributeOption[]>(
        () => [...PHYSICAL_ATTRIBUTES, ...characteristics.map(characteristicToAttributeOption)],
        [characteristics],
    );
    const attributeByKey = React.useMemo(
        () => Object.fromEntries(attributeOptions.map(a => [a.key, a])),
        [attributeOptions],
    );

    const matchCounts = React.useMemo(() => countMatchesByRule(attrsByUnit, rules), [attrsByUnit, rules]);

    // ── Sheet (criar/editar) ────────────────────────────────────────────────
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [editingRule, setEditingRule] = React.useState<RentalPricingRule | null>(null);
    const [form, setForm] = React.useState<RuleForm>(emptyRuleForm());
    const [saving, setSaving] = React.useState(false);

    const selectedAttribute = attributeByKey[form.attributeKey];
    const availableOperators = selectedAttribute ? OPERATORS_BY_ATTRIBUTE_TYPE[selectedAttribute.type] : [];
    const needsValue = !VALUELESS_OPERATORS.includes(form.operator);
    const isNumericOp = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between'].includes(form.operator) && selectedAttribute?.type === 'number';
    const isChoiceOp = (form.operator === 'eq' || form.operator === 'neq' || form.operator === 'contains' || form.operator === 'not_contains')
        && !!selectedAttribute?.options;
    const isFreeTextOp = needsValue && !isNumericOp && !isChoiceOp;

    const openCreate = () => {
        setEditingRule(null);
        const first = attributeOptions[0];
        setForm({ ...emptyRuleForm(), attributeKey: first?.key ?? '', operator: first ? OPERATORS_BY_ATTRIBUTE_TYPE[first.type][0] : 'gt' });
        setSheetOpen(true);
    };

    const openEdit = (rule: RentalPricingRule) => {
        setEditingRule(rule);
        setForm({
            attributeKey: rule.attribute_key,
            operator: rule.operator,
            valueNum: rule.value_num != null ? String(rule.value_num) : '',
            valueNum2: rule.value_num2 != null ? String(rule.value_num2) : '',
            valueText: rule.value_text ?? '',
            adjustPct: String(rule.adjust_pct),
        });
        setSheetOpen(true);
    };

    const closeSheet = () => { setSheetOpen(false); setEditingRule(null); };

    // Ao trocar de característica, o operador precisa continuar válido para o novo tipo.
    const handleAttributeChange = (key: string) => {
        const attr = attributeByKey[key];
        const ops = attr ? OPERATORS_BY_ATTRIBUTE_TYPE[attr.type] : [];
        setForm(p => ({ ...p, attributeKey: key, operator: ops[0] ?? 'gt', valueNum: '', valueNum2: '', valueText: '' }));
    };

    const handleSave = async () => {
        if (!selectedAttribute) { showToast('Selecione a característica.', 'error'); return; }
        if (isNumericOp && form.operator !== 'between' && form.valueNum === '') { showToast('Informe o valor de comparação.', 'error'); return; }
        if (form.operator === 'between' && (form.valueNum === '' || form.valueNum2 === '')) { showToast('Informe os dois limites do intervalo.', 'error'); return; }
        if (isFreeTextOp && form.valueText.trim() === '') { showToast('Informe o valor de comparação.', 'error'); return; }
        if (isChoiceOp && form.valueText === '') { showToast('Selecione uma opção.', 'error'); return; }
        if (form.adjustPct.trim() === '' || Number.isNaN(Number(form.adjustPct))) { showToast('Informe a faixa de ajuste (%).', 'error'); return; }

        setSaving(true);
        try {
            const payload = {
                organization_id: organizationId,
                building_property_id: buildingPropertyId,
                attribute_key: form.attributeKey,
                attribute_label: selectedAttribute.label,
                operator: form.operator,
                value_num: isNumericOp ? Number(form.valueNum) : null,
                value_num2: form.operator === 'between' ? Number(form.valueNum2) : null,
                value_text: (isFreeTextOp || isChoiceOp) ? form.valueText : null,
                adjust_pct: Number(form.adjustPct),
                active: true,
                sort_order: editingRule?.sort_order ?? rules.length,
            };
            const saved = editingRule
                ? await rentalPricingRuleService.update(editingRule.id, payload)
                : await rentalPricingRuleService.create(payload);
            setRules(prev => editingRule ? prev.map(r => r.id === saved.id ? saved : r) : [...prev, saved]);
            showToast(editingRule ? 'Regra atualizada com sucesso' : 'Regra criada com sucesso', 'success');
            closeSheet();
        } catch (err: any) {
            showToast(`Erro ao salvar: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicate = async (rule: RentalPricingRule) => {
        try {
            const created = await rentalPricingRuleService.duplicate(rule);
            setRules(prev => [...prev, created]);
            showToast('Regra duplicada com sucesso', 'success');
        } catch (err: any) {
            showToast(`Erro ao duplicar: ${err.message}`, 'error');
        }
    };

    const handleDelete = async (rule: RentalPricingRule) => {
        const ok = await confirm({
            title: 'Excluir regra?',
            message: `A regra em "${rule.attribute_label}" será removida. Essa ação não pode ser desfeita.`,
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await rentalPricingRuleService.remove(rule.id);
            setRules(prev => prev.filter(r => r.id !== rule.id));
            showToast('Regra excluída', 'success');
        } catch (err: any) {
            showToast(`Erro ao excluir: ${err.message}`, 'error');
        }
    };

    // ── Busca + ordenação ───────────────────────────────────────────────────
    const filteredRules = React.useMemo(() => {
        const term = search.toLowerCase();
        const result = rules.filter(r =>
            r.attribute_label.toLowerCase().includes(term) ||
            describeRule(r, attributeByKey[r.attribute_key]).toLowerCase().includes(term)
        );
        const col = tableColumns.sortColumn;
        if (!col) return result.sort((a, b) => a.sort_order - b.sort_order || a.attribute_label.localeCompare(b.attribute_label));
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return result.sort((a, b) => {
            if (col === 'attribute') return a.attribute_label.localeCompare(b.attribute_label) * dir;
            if (col === 'adjust_pct') return (a.adjust_pct - b.adjust_pct) * dir;
            return 0;
        });
    }, [rules, search, tableColumns.sortColumn, tableColumns.sortDirection, attributeByKey]);

    const renderCell = (key: string, rule: RentalPricingRule): React.ReactNode => {
        switch (key) {
            case 'attribute':
                return <span className="text-sm font-normal text-gray-900">{rule.attribute_label}</span>;
            case 'validation':
                return <span className="text-sm font-normal text-gray-600">{describeRule(rule, attributeByKey[rule.attribute_key])}</span>;
            case 'adjust_pct': {
                const pct = rule.adjust_pct;
                const count = matchCounts[rule.id] ?? 0;
                return (
                    <span className="text-sm font-medium">
                        <span className={pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-rose-600' : 'text-gray-500'}>
                            {pct > 0 ? '+' : ''}{pct}%
                        </span>
                        <span className="text-gray-400 font-normal"> · {count} {count === 1 ? 'unidade' : 'unidades'}</span>
                    </span>
                );
            }
            default:
                return null;
        }
    };

    return (
        <div className="space-y-4">
            {/* Toolbar acoplada à tabela (ui_ux_guia_unificado.md §5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Pesquisar por característica ou validação..."
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        <button
                            onClick={load}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Atualizar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>

                        <button
                            onClick={openCreate}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Nova regra
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando regras...</p>
                    </div>
                ) : filteredRules.length === 0 ? (
                    <div className="text-center py-12">
                        <Sliders className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma regra cadastrada</h3>
                        <p className="text-sm text-gray-500">
                            {search ? 'Tente ajustar sua busca.' : 'Cadastre a primeira regra de ajuste no botão acima.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                <col />
                                {tableColumns.visibleColumns.includes('actions') && <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />}
                            </colgroup>
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        const colDef = COLUMNS.find(c => c.key === key);
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable={colDef?.sortable !== false} uppercase={false}
                                                sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}>
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right relative overflow-hidden text-sm font-semibold text-gray-500">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRules.map(rule => (
                                    <tr key={rule.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderCell(key, rule)}
                                            </td>
                                        ))}
                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <ActionIconButton kind="edit" onClick={() => openEdit(rule)} />
                                                    <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(rule)} />
                                                    <ActionIconButton kind="delete" onClick={() => handleDelete(rule)} />
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Sheet open={sheetOpen} onClose={closeSheet} size="md">
                <SheetHeader onClose={closeSheet}>
                    <SheetTitle>{editingRule ? 'Editar Regra' : 'Nova Regra'}</SheetTitle>
                    <SheetDescription>Ajuste percentual aplicado no modelo hedônico ao rodar "Aplicar" na Inteligência Hedônica.</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6 space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1">Característica</label>
                        <select
                            className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.attributeKey}
                            onChange={e => handleAttributeChange(e.target.value)}
                        >
                            <option value="">Selecione...</option>
                            <optgroup label="Atributos físicos">
                                {PHYSICAL_ATTRIBUTES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                            </optgroup>
                            {characteristics.length > 0 && (
                                <optgroup label="Características adicionais">
                                    {characteristics.map(c => <option key={c.id} value={`carac:${c.id}`}>{c.name}</option>)}
                                </optgroup>
                            )}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1">Validação</label>
                        <select
                            className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.operator}
                            disabled={!selectedAttribute}
                            onChange={e => setForm(p => ({ ...p, operator: e.target.value as RentalPricingRuleOperator, valueNum: '', valueNum2: '', valueText: '' }))}
                        >
                            {availableOperators.map(op => <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>)}
                        </select>
                    </div>

                    {form.operator === 'between' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">De{selectedAttribute?.unit ? ` (${selectedAttribute.unit})` : ''}</label>
                                <input type="number" step="0.01" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={form.valueNum} onChange={e => setForm(p => ({ ...p, valueNum: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Até{selectedAttribute?.unit ? ` (${selectedAttribute.unit})` : ''}</label>
                                <input type="number" step="0.01" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={form.valueNum2} onChange={e => setForm(p => ({ ...p, valueNum2: e.target.value }))} />
                            </div>
                        </div>
                    )}

                    {isNumericOp && form.operator !== 'between' && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1">Valor{selectedAttribute?.unit ? ` (${selectedAttribute.unit})` : ''}</label>
                            <input type="number" step="0.01" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={form.valueNum} onChange={e => setForm(p => ({ ...p, valueNum: e.target.value }))} />
                        </div>
                    )}

                    {isChoiceOp && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1">Opção</label>
                            <select
                                className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={form.valueText}
                                onChange={e => setForm(p => ({ ...p, valueText: e.target.value }))}
                            >
                                <option value="">Selecione...</option>
                                {selectedAttribute?.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                    )}

                    {isFreeTextOp && (
                        <div>
                            <label className="text-xs font-semibold text-slate-500 block mb-1">Valor</label>
                            <input type="text" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={form.valueText} onChange={e => setForm(p => ({ ...p, valueText: e.target.value }))} />
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1">Faixa de ajuste (%)</label>
                        <input
                            type="number" step="0.1"
                            placeholder="Ex: 5 (acréscimo) ou -5 (desconto)"
                            className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            value={form.adjustPct}
                            onChange={e => setForm(p => ({ ...p, adjustPct: e.target.value }))}
                        />
                    </div>

                    {selectedAttribute && form.attributeKey && (
                        <p className="text-xs text-gray-400">
                            Pré-visualização: <span className="text-gray-600 font-medium">{selectedAttribute.label} {describeRule(
                                { ...editingRule, attribute_key: form.attributeKey, operator: form.operator,
                                  value_num: form.valueNum === '' ? null : Number(form.valueNum),
                                  value_num2: form.valueNum2 === '' ? null : Number(form.valueNum2),
                                  value_text: form.valueText || null } as RentalPricingRule,
                                selectedAttribute,
                            )}</span>
                        </p>
                    )}
                </SheetPanel>
                <SheetFooter>
                    <button onClick={closeSheet} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                </SheetFooter>
            </Sheet>

            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {localToast.message}
                </div>
            )}
        </div>
    );
};

export default RentalIntelligenceTab;
