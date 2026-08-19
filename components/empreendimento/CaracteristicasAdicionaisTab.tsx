// components/empreendimento/CaracteristicasAdicionaisTab.tsx
// Aba "Características Adicionais" — tabela ÚNICA com todas as unidades do
// empreendimento (todas as torres, ao contrário do accordion por torre de
// TowerEditor/UnitEditor), com as mesmas colunas físicas + uma coluna por
// característica do catálogo (services/empreendimentoUnitCharacteristicService.ts).
// Visível apenas quando `caracteristicas` (carregado e filtrado pelo tipo do
// empreendimento em EmpreendimentoDetail.tsx) não está vazio.
import React from 'react';
import { Plus, Search, RefreshCw, AlertCircle, MoveHorizontal, ListChecks, Settings2 } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useToast } from '../../hooks/useToast';
import { colorClasses } from '../../services/obraTypeService';
import { empreendimentoService } from '../../services/empreendimentoService';
import { empreendimentoUnitCharacteristicService } from '../../services/empreendimentoUnitCharacteristicService';
import {
    Empreendimento, EmpreendimentoTower, EmpreendimentoUnitInsert,
    FloorTipo, UnitPositionType, UnitSunOrientation, UnitViewType,
    EmpreendimentoUnitCharacteristic, UnitCharacteristicsRow,
} from '../../types';
import {
    POSITION_LABEL, VIEW_LABEL, SUN_LABEL, POSITION_STYLE, VIEW_STYLE, SUN_STYLE,
    UNIT_STATUS_LABEL, UNIT_STATUS_STYLE,
} from '../../utils/empreendimentoComercial';

const FLOOR_TIPO_LABEL: Record<FloorTipo, string> = {
    SUBSOLO: 'Subsolo', TERREO: 'Térreo', MEZANINO: 'Mezanino', TIPO: 'Tipo',
    COBERTURA: 'Cobertura', TECNICO: 'Técnico', GARAGEM: 'Garagem', OUTRO: 'Outro',
};
const FLOOR_TIPO_STYLE: Record<FloorTipo, string> = {
    SUBSOLO: 'bg-slate-500/10 text-slate-600', TERREO: 'bg-lime-500/10 text-lime-700',
    MEZANINO: 'bg-teal-500/10 text-teal-700', TIPO: 'bg-blue-500/10 text-blue-600',
    COBERTURA: 'bg-amber-500/10 text-amber-700', TECNICO: 'bg-gray-500/10 text-gray-600',
    GARAGEM: 'bg-orange-500/10 text-orange-600', OUTRO: 'bg-purple-500/10 text-purple-600',
};
// §8 Status Badge = texto simples colorido — extrai só o token text-* das paletas bg+text acima.
const textColor = (style?: string) => style?.split(' ').find(c => c.startsWith('text-')) ?? 'text-gray-600';

const CHAR_COL_PREFIX = 'carac:';
const charColKey = (id: string) => `${CHAR_COL_PREFIX}${id}`;

// Chip compacto — rounded-[6px] (não rounded-full) + sem uppercase: valor de
// catálogo (opção de característica), não estado de registro (§8 não se aplica).
function Chip({ label, color }: { label: string; color?: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-normal border ${colorClasses(color || 'gray')}`}>
            {label}
        </span>
    );
}

const STATIC_COLUMNS: ColumnConfig[] = [
    { key: 'torre', label: 'Torre', sortable: true },
    { key: 'name', label: 'Unidade', sortable: true },
    { key: 'floor', label: 'Pav.', sortable: true },
    { key: 'floor_tipo', label: 'Tipo Pav.', sortable: true },
    { key: 'typology', label: 'Tipologia', sortable: true },
    { key: 'private_area', label: 'Priv. m²', sortable: true },
    { key: 'common_area', label: 'Comum m²', sortable: true },
    { key: 'bedrooms', label: 'Dormitórios', sortable: true },
    { key: 'bathrooms', label: 'Banheiros', sortable: true },
    { key: 'suites', label: 'Suítes', sortable: true },
    { key: 'parking_spaces', label: 'Vagas', sortable: true },
    { key: 'position_type', label: 'Posição', sortable: true },
    { key: 'view_type', label: 'Vista', sortable: true },
    { key: 'sun_orientation', label: 'Orient.', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'price', label: 'Preço', sortable: true },
];

const STATIC_COLUMN_HEADERS: Record<string, { label: string; className: string }> = {
    torre: { label: 'Torre', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    name: { label: 'Unidade', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    floor: { label: 'Pav.', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    floor_tipo: { label: 'Tipo Pav.', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    typology: { label: 'Tipologia', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    private_area: { label: 'Priv. m²', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    common_area: { label: 'Comum m²', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    bedrooms: { label: 'Dormitórios', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    bathrooms: { label: 'Banheiros', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    suites: { label: 'Suítes', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    parking_spaces: { label: 'Vagas', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    position_type: { label: 'Posição', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    view_type: { label: 'Vista', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    sun_orientation: { label: 'Orient.', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
    price: { label: 'Preço', className: 'px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden' },
};

const STATIC_DEFAULT_WIDTHS: Record<string, number> = {
    torre: 130, name: 130, floor: 80, floor_tipo: 120, typology: 150,
    private_area: 100, common_area: 110, bedrooms: 110, bathrooms: 100, suites: 90,
    parking_spaces: 90, position_type: 110, view_type: 110, sun_orientation: 100,
    status: 110, price: 130, actions: 130,
};
const CHAR_DEFAULT_WIDTH = 170;

function emptyUnitForm() {
    return {
        tower_id: '', name: '', floor: '', floor_tipo: '' as FloorTipo | '', typology: '',
        private_area: '', common_area: '', bedrooms: '', bathrooms: '', suites: '', parking_spaces: '',
        position_type: '' as UnitPositionType | '', view_type: '' as UnitViewType | '', sun_orientation: '' as UnitSunOrientation | '',
    };
}
type UnitForm = ReturnType<typeof emptyUnitForm>;

function CaracteristicaField({ characteristic, values, onChange }: {
    characteristic: EmpreendimentoUnitCharacteristic;
    values: string[];
    onChange: (values: string[]) => void;
}) {
    const inputCls = 'w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
    switch (characteristic.input_type) {
        case 'MULTI_SELECT':
            return (
                <div className="flex flex-wrap gap-2">
                    {characteristic.options.map(o => {
                        const checked = values.includes(o.value);
                        return (
                            <label key={o.value} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-normal border cursor-pointer transition-all ${checked ? colorClasses(o.color || 'gray') : 'bg-white text-gray-500 border-gray-200'}`}>
                                <input
                                    type="checkbox"
                                    className="w-3.5 h-3.5"
                                    checked={checked}
                                    onChange={() => onChange(checked ? values.filter(v => v !== o.value) : [...values, o.value])}
                                />
                                {o.label}
                            </label>
                        );
                    })}
                </div>
            );
        case 'SELECT':
            return (
                <select className={inputCls} value={values[0] ?? ''} onChange={e => onChange(e.target.value ? [e.target.value] : [])}>
                    <option value="">—</option>
                    {characteristic.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            );
        case 'BOOLEAN':
            return (
                <label className="inline-flex items-center gap-2 text-sm font-normal text-gray-600 h-9">
                    <input type="checkbox" checked={values[0] === 'true'} onChange={e => onChange(e.target.checked ? ['true'] : [])} />
                    Sim
                </label>
            );
        case 'NUMBER':
            return <input type="number" className={inputCls} value={values[0] ?? ''} onChange={e => onChange(e.target.value ? [e.target.value] : [])} />;
        case 'TEXT':
        default:
            return <input type="text" className={inputCls} value={values[0] ?? ''} onChange={e => onChange(e.target.value ? [e.target.value] : [])} />;
    }
}

function renderRowCell(key: string, row: UnitCharacteristicsRow, caracteristicasById: Record<string, EmpreendimentoUnitCharacteristic>): React.ReactNode {
    if (key.startsWith(CHAR_COL_PREFIX)) {
        const id = key.slice(CHAR_COL_PREFIX.length);
        const characteristic = caracteristicasById[id];
        const values = row._caracteristicas[id] ?? [];
        if (!characteristic || values.length === 0) return <span className="text-sm font-normal text-gray-300">—</span>;
        if (characteristic.input_type === 'SELECT' || characteristic.input_type === 'MULTI_SELECT') {
            return (
                <div className="flex flex-wrap gap-1">
                    {values.map(v => {
                        const opt = characteristic.options.find(o => o.value === v);
                        return <Chip key={v} label={opt?.label ?? v} color={opt?.color} />;
                    })}
                </div>
            );
        }
        if (characteristic.input_type === 'BOOLEAN') return <span className="text-sm font-normal text-gray-600">{values[0] === 'true' ? 'Sim' : 'Não'}</span>;
        return <span className="text-sm font-normal text-gray-600">{values.join(', ')}</span>;
    }
    switch (key) {
        case 'torre':
            return <span className="text-sm font-normal text-gray-600 whitespace-nowrap">{row._tower_name}</span>;
        case 'name':
            return <span className="text-sm font-normal text-gray-900">{row.name}</span>;
        case 'floor':
            return <span className="text-sm font-normal text-gray-600">{row.floor ?? '—'}</span>;
        case 'floor_tipo':
            return row.floor_tipo
                ? <span className={`text-sm font-normal ${textColor(FLOOR_TIPO_STYLE[row.floor_tipo])}`}>{FLOOR_TIPO_LABEL[row.floor_tipo]}</span>
                : <span className="text-sm font-normal text-gray-300">—</span>;
        case 'typology':
            return <span className="text-sm font-normal text-gray-600">{row.typology || '—'}</span>;
        case 'private_area':
            return <span className="text-sm font-normal text-gray-600">{row.private_area != null ? `${row.private_area} m²` : '—'}</span>;
        case 'common_area':
            return <span className="text-sm font-normal text-gray-600">{row.common_area != null ? `${row.common_area} m²` : '—'}</span>;
        case 'bedrooms':
            return <span className="text-sm font-normal text-gray-600">{row.bedrooms ?? '—'}</span>;
        case 'bathrooms':
            return <span className="text-sm font-normal text-gray-600">{row.bathrooms ?? '—'}</span>;
        case 'suites':
            return <span className="text-sm font-normal text-gray-600">{row.suites ?? '—'}</span>;
        case 'parking_spaces':
            return <span className="text-sm font-normal text-gray-600">{row.parking_spaces ?? '—'}</span>;
        case 'position_type':
            return row.position_type
                ? <span className={`text-sm font-normal ${textColor(POSITION_STYLE[row.position_type])}`}>{POSITION_LABEL[row.position_type]}</span>
                : <span className="text-sm font-normal text-gray-300">—</span>;
        case 'view_type':
            return row.view_type
                ? <span className={`text-sm font-normal ${textColor(VIEW_STYLE[row.view_type])}`}>{VIEW_LABEL[row.view_type]}</span>
                : <span className="text-sm font-normal text-gray-300">—</span>;
        case 'sun_orientation':
            return row.sun_orientation
                ? <span className={`text-sm font-normal ${textColor(SUN_STYLE[row.sun_orientation])}`}>{SUN_LABEL[row.sun_orientation]}</span>
                : <span className="text-sm font-normal text-gray-300">—</span>;
        case 'status':
            return <span className={`text-sm font-normal ${textColor(UNIT_STATUS_STYLE[row.status])}`}>{UNIT_STATUS_LABEL[row.status]}</span>;
        case 'price':
            return <span className="text-sm font-medium text-gray-800">{row.price != null ? `R$ ${row.price.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—'}</span>;
        default:
            return null;
    }
}

interface Props {
    empreendimento: Empreendimento;
    organizationId: string;
    caracteristicas: EmpreendimentoUnitCharacteristic[];
    onManageCaracteristicas?: () => void;
}

export const CaracteristicasAdicionaisTab: React.FC<Props> = ({ empreendimento, organizationId, caracteristicas, onManageCaracteristicas }) => {
    const confirm = useConfirm();
    const { localToast, showToast } = useToast();

    const [rows, setRows] = React.useState<UnitCharacteristicsRow[]>([]);
    const [towers, setTowers] = React.useState<EmpreendimentoTower[]>([]);
    const [loading, setLoading] = React.useState(true);

    const [search, setSearch] = usePersistedState<string>('empreendimentoCaracteristicas:search', '');

    const caracteristicasById = React.useMemo(
        () => Object.fromEntries(caracteristicas.map(c => [c.id, c])),
        [caracteristicas],
    );

    const COLUMNS: ColumnConfig[] = React.useMemo(() => [
        ...STATIC_COLUMNS,
        ...caracteristicas.map(c => ({ key: charColKey(c.id), label: c.name, sortable: true })),
        { key: 'actions', label: 'Ações', sortable: false },
    ], [caracteristicas]);

    const COLUMN_HEADERS = React.useMemo(() => {
        const dyn: Record<string, { label: string; className: string }> = {};
        caracteristicas.forEach(c => { dyn[charColKey(c.id)] = { label: c.name, className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' }; });
        return { ...STATIC_COLUMN_HEADERS, ...dyn };
    }, [caracteristicas]);

    const DEFAULT_COL_WIDTHS = React.useMemo(() => {
        const dyn: Record<string, number> = {};
        caracteristicas.forEach(c => { dyn[charColKey(c.id)] = CHAR_DEFAULT_WIDTH; });
        return { ...STATIC_DEFAULT_WIDTHS, ...dyn };
    }, [caracteristicas]);

    const DATA_COLUMN_KEYS = React.useMemo(() => COLUMNS.filter(c => c.key !== 'actions').map(c => c.key), [COLUMNS]);

    const tableColumns = useTableColumns(COLUMNS, 'empreendimentoCaracteristicasColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'empreendimentoCaracteristicasColWidths');
    const tableTotalWidth = DATA_COLUMN_KEYS.reduce(
        (sum, key) => sum + (tableColumns.visibleColumns.includes(key) ? cols.getWidth(key) : 0),
        0,
    ) + cols.getWidth('actions');

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const [units, towerList] = await Promise.all([
                empreendimentoService.listAllUnitsForEmpreendimento(empreendimento.id),
                empreendimentoService.listTowers(empreendimento.id),
            ]);
            const valuesByUnit = await empreendimentoUnitCharacteristicService.listValuesForUnits(units.map(u => u.id));
            setTowers(towerList);
            setRows(units.map(u => ({
                ...u,
                _tower_name: u._tower_name,
                _tower_id: u.tower_id,
                _caracteristicas: valuesByUnit[u.id] ?? {},
            })));
        } catch (err) {
            console.error('[CaracteristicasAdicionaisTab] erro ao carregar:', err);
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id]);

    React.useEffect(() => { load(); }, [load]);

    // ── Sheet (criar/editar) ────────────────────────────────────────────────
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [editingRow, setEditingRow] = React.useState<UnitCharacteristicsRow | null>(null);
    const [unitForm, setUnitForm] = React.useState<UnitForm>(emptyUnitForm());
    const [caracteristicaValues, setCaracteristicaValues] = React.useState<Record<string, string[]>>({});
    const [saving, setSaving] = React.useState(false);

    const openCreate = () => {
        setEditingRow(null);
        setUnitForm({ ...emptyUnitForm(), tower_id: towers[0]?.id ?? '' });
        setCaracteristicaValues({});
        setSheetOpen(true);
    };

    const openEdit = (row: UnitCharacteristicsRow) => {
        setEditingRow(row);
        setUnitForm({
            tower_id: row.tower_id, name: row.name, floor: row.floor?.toString() ?? '',
            floor_tipo: row.floor_tipo ?? '', typology: row.typology ?? '',
            private_area: row.private_area?.toString() ?? '', common_area: row.common_area?.toString() ?? '',
            bedrooms: row.bedrooms?.toString() ?? '', bathrooms: row.bathrooms?.toString() ?? '', suites: row.suites?.toString() ?? '',
            parking_spaces: row.parking_spaces?.toString() ?? '',
            position_type: row.position_type ?? '', view_type: row.view_type ?? '', sun_orientation: row.sun_orientation ?? '',
        });
        setCaracteristicaValues({ ...row._caracteristicas });
        setSheetOpen(true);
    };

    const closeSheet = () => { setSheetOpen(false); setEditingRow(null); };

    const handleSaveUnit = async () => {
        if (!unitForm.name.trim()) { showToast('Informe o nome/identificação da unidade.', 'error'); return; }
        if (!unitForm.tower_id) { showToast('Selecione a torre.', 'error'); return; }
        setSaving(true);
        try {
            const priv = unitForm.private_area ? Number(unitForm.private_area) : undefined;
            const common = unitForm.common_area ? Number(unitForm.common_area) : undefined;
            const payload = {
                tower_id: unitForm.tower_id,
                name: unitForm.name.trim(),
                floor: unitForm.floor ? Number(unitForm.floor) : undefined,
                floor_tipo: (unitForm.floor_tipo || null) as FloorTipo | null,
                typology: unitForm.typology || undefined,
                private_area: priv, common_area: common,
                total_area: priv !== undefined || common !== undefined ? (priv ?? 0) + (common ?? 0) : undefined,
                bedrooms: unitForm.bedrooms ? Number(unitForm.bedrooms) : undefined,
                bathrooms: unitForm.bathrooms ? Number(unitForm.bathrooms) : undefined,
                suites: unitForm.suites ? Number(unitForm.suites) : undefined,
                parking_spaces: unitForm.parking_spaces ? Number(unitForm.parking_spaces) : undefined,
                position_type: (unitForm.position_type || null) as UnitPositionType | null,
                view_type: (unitForm.view_type || null) as UnitViewType | null,
                sun_orientation: (unitForm.sun_orientation || null) as UnitSunOrientation | null,
            };
            const saved = editingRow
                ? await empreendimentoService.updateUnit(editingRow.id, payload)
                : await empreendimentoService.createUnit({
                    ...payload, status: 'DISPONIVEL', rental_status: 'DISPONIVEL', is_vendavel: true,
                } as EmpreendimentoUnitInsert);

            await Promise.all(caracteristicas.map(c =>
                empreendimentoUnitCharacteristicService.setValues(saved.id, c.id, organizationId, caracteristicaValues[c.id] ?? [])
            ));

            const towerName = towers.find(t => t.id === saved.tower_id)?.name ?? editingRow?._tower_name ?? '';
            const savedRow: UnitCharacteristicsRow = { ...saved, _tower_name: towerName, _tower_id: saved.tower_id, _caracteristicas: caracteristicaValues };
            setRows(prev => editingRow ? prev.map(r => r.id === saved.id ? savedRow : r) : [...prev, savedRow]);
            showToast(editingRow ? 'Unidade atualizada com sucesso' : 'Unidade criada com sucesso', 'success');
            closeSheet();
        } catch (err: any) {
            showToast(`Erro ao salvar: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Duplicar / Excluir ──────────────────────────────────────────────────
    const handleDuplicate = async (row: UnitCharacteristicsRow) => {
        try {
            const created = await empreendimentoService.createUnit({
                tower_id: row.tower_id, name: `${row.name} (cópia)`,
                floor: row.floor ?? undefined, floor_tipo: row.floor_tipo ?? undefined, floor_id: row.floor_id ?? undefined,
                typology: row.typology ?? undefined, private_area: row.private_area ?? undefined,
                common_area: row.common_area ?? undefined, total_area: row.total_area ?? undefined,
                bedrooms: row.bedrooms ?? undefined, bathrooms: row.bathrooms ?? undefined, suites: row.suites ?? undefined,
                parking_spaces: row.parking_spaces ?? undefined,
                position_type: row.position_type ?? undefined, view_type: row.view_type ?? undefined, sun_orientation: row.sun_orientation ?? undefined,
                status: 'DISPONIVEL', rental_status: 'DISPONIVEL', is_vendavel: true, sort_order: rows.length,
            } as EmpreendimentoUnitInsert);
            await empreendimentoUnitCharacteristicService.copyValues(row.id, created.id, organizationId);
            const valuesByUnit = await empreendimentoUnitCharacteristicService.listValuesForUnits([created.id]);
            const newRow: UnitCharacteristicsRow = { ...created, _tower_name: row._tower_name, _tower_id: created.tower_id, _caracteristicas: valuesByUnit[created.id] ?? {} };
            setRows(prev => [...prev, newRow]);
            showToast('Unidade duplicada com sucesso', 'success');
        } catch (err: any) {
            showToast(`Erro ao duplicar: ${err.message}`, 'error');
        }
    };

    const handleDelete = async (row: UnitCharacteristicsRow) => {
        const ok = await confirm({
            title: 'Excluir unidade?',
            message: `A unidade "${row.name}" será removida. Essa ação não pode ser desfeita.`,
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await empreendimentoService.deleteUnit(row.id);
            setRows(prev => prev.filter(r => r.id !== row.id));
            showToast('Unidade excluída', 'success');
        } catch (err: any) {
            showToast(`Erro ao excluir: ${err.message}`, 'error');
        }
    };

    // ── Busca + ordenação ───────────────────────────────────────────────────
    const filteredRows = React.useMemo(() => {
        const term = search.toLowerCase();
        const result = rows.filter(r =>
            r.name.toLowerCase().includes(term) ||
            r._tower_name.toLowerCase().includes(term) ||
            (r.typology || '').toLowerCase().includes(term)
        );
        const col = tableColumns.sortColumn;
        if (!col) return result.sort((a, b) => a._tower_name.localeCompare(b._tower_name) || a.name.localeCompare(b.name));
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        const valueOf = (r: UnitCharacteristicsRow): string | number => {
            if (col.startsWith(CHAR_COL_PREFIX)) {
                const id = col.slice(CHAR_COL_PREFIX.length);
                const characteristic = caracteristicasById[id];
                const values = r._caracteristicas[id] ?? [];
                if (!characteristic) return '';
                return values.map(v => characteristic.options.find(o => o.value === v)?.label ?? v).join(', ');
            }
            switch (col) {
                case 'torre': return r._tower_name;
                case 'name': return r.name;
                case 'floor': return r.floor ?? -999;
                case 'floor_tipo': return r.floor_tipo ? FLOOR_TIPO_LABEL[r.floor_tipo] : '';
                case 'typology': return r.typology ?? '';
                case 'private_area': return r.private_area ?? 0;
                case 'common_area': return r.common_area ?? 0;
                case 'bedrooms': return r.bedrooms ?? 0;
                case 'bathrooms': return r.bathrooms ?? 0;
                case 'suites': return r.suites ?? 0;
                case 'parking_spaces': return r.parking_spaces ?? 0;
                case 'position_type': return r.position_type ? POSITION_LABEL[r.position_type] : '';
                case 'view_type': return r.view_type ? VIEW_LABEL[r.view_type] : '';
                case 'sun_orientation': return r.sun_orientation ? SUN_LABEL[r.sun_orientation] : '';
                case 'status': return UNIT_STATUS_LABEL[r.status];
                case 'price': return r.price ?? 0;
                default: return '';
            }
        };
        return result.sort((a, b) => {
            const va = valueOf(a), vb = valueOf(b);
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
            return String(va).localeCompare(String(vb)) * dir;
        });
    }, [rows, search, tableColumns.sortColumn, tableColumns.sortDirection, caracteristicasById]);

    return (
        <div className="space-y-4">
            {/* Toolbar acoplada à tabela (ui_ux_guia_unificado.md §5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Pesquisar por unidade, torre ou tipologia..."
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
                            {/* Ajuste automático de largura ao conteúdo — sob comando explícito (§6.1.2) */}
                            <button
                                onClick={() => cols.autoFit()}
                                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                title="Ajustar largura das colunas ao conteúdo"
                            >
                                <MoveHorizontal className="w-4 h-4" />
                            </button>
                        </div>

                        {onManageCaracteristicas && (
                            <button
                                onClick={onManageCaracteristicas}
                                title="Gerenciar características (Configurações do Sistema)"
                                className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95 shrink-0"
                            >
                                <Settings2 className="w-4 h-4" /> Gerenciar características
                            </button>
                        )}

                        <button
                            onClick={openCreate}
                            disabled={towers.length === 0}
                            title={towers.length === 0 ? 'Cadastre uma torre em Torres & Unidades primeiro' : 'Nova unidade'}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-50"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Nova Unidade
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando unidades...</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="text-center py-12">
                        <ListChecks className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma unidade encontrada</h3>
                        <p className="text-sm text-gray-500">
                            {search ? 'Tente ajustar sua busca.' : towers.length === 0 ? 'Cadastre uma torre na aba Torres & Unidades primeiro.' : 'Cadastre a primeira unidade no botão acima.'}
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
                                        return (
                                            <SortableHeader key={key} colKey={key} label={def.label} sortable uppercase={false}
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
                                {filteredRows.map(row => (
                                    <tr key={row.id} className="hover:bg-blue-50/50 transition-colors group">
                                        {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                {renderRowCell(key, row, caracteristicasById)}
                                            </td>
                                        ))}
                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <ActionIconButton kind="edit" onClick={() => openEdit(row)} />
                                                    <ActionIconButton kind="duplicate" onClick={() => handleDuplicate(row)} />
                                                    <ActionIconButton kind="delete" onClick={() => handleDelete(row)} />
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

            <Sheet open={sheetOpen} onClose={closeSheet} size="lg">
                <SheetHeader onClose={closeSheet}>
                    <SheetTitle>{editingRow ? 'Editar Unidade' : 'Nova Unidade'}</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6 space-y-6">
                    <div>
                        <h3 className="font-black text-slate-800 text-sm mb-3">Dados da Unidade</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div className="col-span-2 md:col-span-3">
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Torre *</label>
                                <select
                                    className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    value={unitForm.tower_id}
                                    onChange={e => setUnitForm(p => ({ ...p, tower_id: e.target.value }))}
                                >
                                    <option value="">Selecione a torre...</option>
                                    {towers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div className="col-span-2 md:col-span-3">
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Unidade (ex: 101) *</label>
                                <input className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.name} onChange={e => setUnitForm(p => ({ ...p, name: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Pavimento</label>
                                <input type="number" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.floor} onChange={e => setUnitForm(p => ({ ...p, floor: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Tipo de Pavimento</label>
                                <select className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.floor_tipo} onChange={e => setUnitForm(p => ({ ...p, floor_tipo: e.target.value as FloorTipo | '' }))}>
                                    <option value="">—</option>
                                    {(Object.keys(FLOOR_TIPO_LABEL) as FloorTipo[]).map(t => <option key={t} value={t}>{FLOOR_TIPO_LABEL[t]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Tipologia</label>
                                <input className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.typology} onChange={e => setUnitForm(p => ({ ...p, typology: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Área Priv. (m²)</label>
                                <input type="number" step="0.01" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.private_area} onChange={e => setUnitForm(p => ({ ...p, private_area: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Área Comum (m²)</label>
                                <input type="number" step="0.01" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.common_area} onChange={e => setUnitForm(p => ({ ...p, common_area: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Dormitórios</label>
                                <input type="number" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.bedrooms} onChange={e => setUnitForm(p => ({ ...p, bedrooms: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Banheiros</label>
                                <input type="number" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.bathrooms} onChange={e => setUnitForm(p => ({ ...p, bathrooms: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Suítes</label>
                                <input type="number" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.suites} onChange={e => setUnitForm(p => ({ ...p, suites: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Vagas</label>
                                <input type="number" className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.parking_spaces} onChange={e => setUnitForm(p => ({ ...p, parking_spaces: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Posição</label>
                                <select className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.position_type} onChange={e => setUnitForm(p => ({ ...p, position_type: e.target.value as UnitPositionType | '' }))}>
                                    <option value="">—</option>
                                    {(Object.keys(POSITION_LABEL) as UnitPositionType[]).map(t => <option key={t} value={t}>{POSITION_LABEL[t]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Vista</label>
                                <select className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.view_type} onChange={e => setUnitForm(p => ({ ...p, view_type: e.target.value as UnitViewType | '' }))}>
                                    <option value="">—</option>
                                    {(Object.keys(VIEW_LABEL) as UnitViewType[]).map(t => <option key={t} value={t}>{VIEW_LABEL[t]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 block mb-1">Orientação</label>
                                <select className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" value={unitForm.sun_orientation} onChange={e => setUnitForm(p => ({ ...p, sun_orientation: e.target.value as UnitSunOrientation | '' }))}>
                                    <option value="">—</option>
                                    {(Object.keys(SUN_LABEL) as UnitSunOrientation[]).map(t => <option key={t} value={t}>{SUN_LABEL[t]}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {caracteristicas.length > 0 && (
                        <div>
                            <h3 className="font-black text-slate-800 text-sm mb-3">Características Adicionais</h3>
                            <div className="space-y-4">
                                {caracteristicas.map(c => (
                                    <div key={c.id}>
                                        <label className="text-xs font-semibold text-slate-500 block mb-1.5">{c.name}</label>
                                        <CaracteristicaField
                                            characteristic={c}
                                            values={caracteristicaValues[c.id] ?? []}
                                            onChange={values => setCaracteristicaValues(prev => ({ ...prev, [c.id]: values }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </SheetPanel>
                <SheetFooter>
                    <button onClick={closeSheet} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSaveUnit}
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

export default CaracteristicasAdicionaisTab;
