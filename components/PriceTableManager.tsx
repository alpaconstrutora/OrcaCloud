import React from 'react';
import { Plus, Loader2, CheckCircle2, Clock, Archive, Percent, TrendingUp, AlertTriangle, Search, Image as ImageIcon, Upload, X } from 'lucide-react';
import {
    commercialPriceTableService,
    CommercialPriceTable,
    CommercialPriceTableItem,
} from '../services/commercialPriceTableService';
import { rentalPriceTableService } from '../services/rentalPriceTableService';
import { IndexName } from '../services/contractIndexService';
import { useConfirm } from './ui/confirm';
import { formatMoney } from './ui/Format';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { KpiCard } from './ui/KpiCard';

type PriceMode = 'sale' | 'rental';

interface Props {
    organizationId: string;
    buildingId: string;
    buildingName: string;
    /** 'sale' (Venda de Ativos, padrão) grava price/table_price; 'rental'
     *  (Locações) usa o service espelho e grava rental_price. */
    mode?: PriceMode;
}

// Labels que mudam entre Venda e Locação. As duas telas compartilham a mesma
// mecânica (versões, reajuste, KPIs) — só o vocabulário de "preço" vs "aluguel"
// difere. Colunas de atributos da unidade e moeda (R$) são idênticas.
const MODE_CONFIG: Record<PriceMode, {
    service: typeof commercialPriceTableService;
    title: string;
    currentLabel: string;
    versionLabel: string;
    totalCurrentLabel: string;
    totalVersionLabel: string;
}> = {
    sale: {
        service: commercialPriceTableService,
        title: 'Tabela de Preços',
        currentLabel: 'Preço vigente',
        versionLabel: 'Preço nesta versão',
        totalCurrentLabel: 'Total Vigente',
        totalVersionLabel: 'Total Nesta Versão',
    },
    rental: {
        service: rentalPriceTableService,
        title: 'Tabela de Aluguéis',
        currentLabel: 'Aluguel vigente',
        versionLabel: 'Aluguel nesta versão',
        totalCurrentLabel: 'Aluguel Total Vigente',
        totalVersionLabel: 'Aluguel Total Nesta Versão',
    },
};

const STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', active: 'Ativa', superseded: 'Substituída' };
// §8 Status Badge — texto simples colorido, sem pílula/fundo/uppercase
const STATUS_COLOR: Record<string, string> = {
    draft: 'text-amber-600',
    active: 'text-emerald-600',
    superseded: 'text-gray-500',
};
const INDEX_NAMES: IndexName[] = ['INCC-M', 'INCC', 'IPCA', 'IGP-M', 'CUB', 'OUTROS'];

// Status da unidade (commercial_properties.status) — labels/cores alinhadas a PropertyUnitMap.tsx
const UNIT_STATUS_LABEL: Record<string, string> = {
    AVAILABLE: 'Disponível',
    RESERVED: 'Reservado',
    SOLD: 'Vendido',
    RENTED: 'Alugado',
    WAITING_PAYMENT: 'Aguardando pagamento',
    BLOCKED: 'Bloqueado',
    EXCHANGED: 'Permutado',
};
const UNIT_STATUS_COLOR: Record<string, string> = {
    AVAILABLE: 'text-emerald-700',
    RESERVED: 'text-amber-700',
    SOLD: 'text-red-600',
    RENTED: 'text-blue-700',
    WAITING_PAYMENT: 'text-amber-700',
    BLOCKED: 'text-gray-600',
    EXCHANGED: 'text-violet-700',
};

// §8 Status Badge — texto simples colorido, sem pílula/fundo/uppercase
const UnitStatusBadge: React.FC<{ status?: string }> = ({ status }) => {
    if (!status) return <span className="text-sm font-normal text-gray-400">—</span>;
    return (
        <span className={`text-sm font-normal ${UNIT_STATUS_COLOR[status] || 'text-gray-600'}`}>
            {UNIT_STATUS_LABEL[status] || status}
        </span>
    );
};

// §7.1 campo editável inline — mesma tipografia do TD (text-sm font-normal), com máscara R$
const parsePrice = (s: string): number => {
    const cleaned = s.replace(/[^\d.,-]/g, '').trim();
    if (!cleaned) return 0;
    const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
};

// Upload em lote casa cada arquivo com a unidade pelo NOME do arquivo (sem
// extensão) vs property_name — ex: "101.jpg" ou "Apto 101.jpg" casam com a
// unidade "101"/"Apto 101". Normaliza removendo acento/case/símbolos para
// tolerar variação de digitação.
const normalizeMatchKey = (s: string): string =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const PriceInput: React.FC<{ value: number; onCommit: (v: number) => void }> = ({ value, onCommit }) => {
    const [focused, setFocused] = React.useState(false);
    const [draft, setDraft] = React.useState('');
    return (
        <input
            type="text"
            inputMode="decimal"
            value={focused ? draft : formatMoney(value)}
            onFocus={() => { setFocused(true); setDraft(value ? String(value) : ''); }}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { setFocused(false); onCommit(parsePrice(draft)); }}
            className="w-36 text-right text-sm font-normal px-2 py-1 rounded border border-gray-200 bg-gray-50 outline-none focus:border-blue-400 focus:bg-white transition-all"
        />
    );
};

// §7.1 campo editável inline — thumbnail 40x40, clique abre o seletor de arquivo.
const PhotoCell: React.FC<{ url: string | null | undefined; uploading: boolean; onSelect: (file: File) => void }> = ({ url, uploading, onSelect }) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    return (
        <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-10 h-10 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0 hover:border-blue-400 transition-all disabled:opacity-50"
            title="Alterar foto da unidade"
        >
            {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : url ? (
                <img src={url} alt="" className="w-full h-full object-cover" />
            ) : (
                <ImageIcon className="w-4 h-4 text-gray-300" />
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onSelect(f); e.target.value = ''; }}
            />
        </button>
    );
};

// position_type (commercial_properties) — labels alinhadas a PropertyModal.tsx
const POSITION_LABEL: Record<string, string> = { FRONT: 'Frente', LATERAL: 'Lateral', BACK: 'Fundos' };

const num = (v: number | null | undefined) => (v != null ? String(v) : '—');
const areaFmt = (v: number | null | undefined) => (v != null ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²` : '—');

const COLUMNS: ColumnConfig[] = [
    { key: 'photo',    label: 'Foto',               sortable: false },
    { key: 'unit',     label: 'Unidade',            sortable: true },
    { key: 'status',   label: 'Status',             sortable: true },
    { key: 'privArea', label: 'Área privativa',     sortable: true },
    { key: 'bedrooms', label: 'Dormitórios',        sortable: true },
    { key: 'parking',  label: 'Vagas',              sortable: true },
    { key: 'bathrooms',label: 'Banheiros',          sortable: true },
    { key: 'floor',    label: 'Pavimento',          sortable: true },
    { key: 'position', label: 'Posição',            sortable: true },
    { key: 'current',  label: 'Preço vigente',      sortable: true },
    { key: 'price',    label: 'Preço nesta versão', sortable: true },
    { key: 'delta',    label: 'Δ',                  sortable: true },
    { key: 'visibleToBroker', label: 'Visível p/ Corretor', sortable: true },
    { key: 'showPrice',       label: 'Exibir Preço',        sortable: true },
];

const fmtBRL = formatMoney;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export const PriceTableManager: React.FC<Props> = ({ organizationId, buildingId, buildingName, mode = 'sale' }) => {
    const cfg = MODE_CONFIG[mode];
    const svc = cfg.service;
    // Colunas com labels do modo (o dropdown de configurar colunas mostra estes).
    const columnsForConfig = React.useMemo<ColumnConfig[]>(() => COLUMNS.map(c =>
        c.key === 'current' ? { ...c, label: cfg.currentLabel }
        : c.key === 'price' ? { ...c, label: cfg.versionLabel }
        : c
    ), [cfg.currentLabel, cfg.versionLabel]);
    const confirm = useConfirm();
    const [tables, setTables] = React.useState<CommercialPriceTable[]>([]);
    const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null);
    const [items, setItems] = React.useState<CommercialPriceTableItem[]>([]);
    const [buildingUnits, setBuildingUnits] = React.useState<{ id: string; name: string | null }[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadingItems, setLoadingItems] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [creating, setCreating] = React.useState(false);
    const [activating, setActivating] = React.useState(false);
    const [applyingAdjustment, setApplyingAdjustment] = React.useState(false);
    const [uploadingPhotoId, setUploadingPhotoId] = React.useState<string | null>(null);
    const [batchUploading, setBatchUploading] = React.useState(false);
    const [batchProgress, setBatchProgress] = React.useState<{ done: number; total: number } | null>(null);
    const [batchResult, setBatchResult] = React.useState<{ matched: number; unmatched: string[] } | null>(null);
    const batchPhotoInputRef = React.useRef<HTMLInputElement>(null);

    const [searchTerm, setSearchTerm] = usePersistedState<string>(`priceTable:${mode}:search`, '');
    const tableColumns = useTableColumns(COLUMNS, `priceTableColumns:${mode}`);

    // Reajuste em massa
    const [adjustMode, setAdjustMode] = React.useState<'percent' | 'index'>('percent');
    const [percent, setPercent] = React.useState('');
    const [indexName, setIndexName] = React.useState<IndexName>('INCC-M');
    const [baseMonth, setBaseMonth] = React.useState(thisMonth());
    const [targetMonth, setTargetMonth] = React.useState(thisMonth());

    const loadTables = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const rows = await svc.listTables(buildingId);
            setTables(rows);
            setSelectedTableId(prev => rows.some(t => t.id === prev) ? prev : (rows[0]?.id ?? null));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [buildingId]);

    React.useEffect(() => { loadTables(); }, [loadTables]);

    React.useEffect(() => {
        svc.listBuildingUnits(buildingId)
            .then(setBuildingUnits)
            .catch(err => console.error('[PriceTableManager] erro ao listar unidades do edifício:', err));
    }, [buildingId]);

    const loadItems = React.useCallback(async (tableId: string) => {
        setLoadingItems(true);
        try {
            const rows = await svc.getTableItems(tableId);
            setItems(rows);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoadingItems(false);
        }
    }, []);

    React.useEffect(() => {
        if (selectedTableId) loadItems(selectedTableId);
        else setItems([]);
    }, [selectedTableId, loadItems]);

    const selectedTable = tables.find(t => t.id === selectedTableId) ?? null;
    const isDraft = selectedTable?.status === 'draft';

    const handleCreateDraft = async () => {
        const nextVersion = (tables.reduce((max, t) => {
            const m = t.version_label.match(/v(\d+)/i);
            return m ? Math.max(max, Number(m[1])) : max;
        }, 0)) + 1;
        setCreating(true);
        setError(null);
        try {
            const table = await svc.createDraftFromActive(organizationId, buildingId, `v${nextVersion}`);
            await loadTables();
            setSelectedTableId(table.id);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleUpdateItemPrice = async (itemId: string, price: number) => {
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, price } : i));
        try {
            await svc.updateItemPrice(itemId, price);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleToggleVisibility = async (item: CommercialPriceTableItem) => {
        const next = !(item.visible_to_broker ?? true);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, visible_to_broker: next } : i));
        try {
            await svc.updateItemVisibility(item.property_id, next);
        } catch (err: any) {
            setError(err.message);
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, visible_to_broker: !next } : i));
        }
    };

    /** "Exibir Preço": independente de "Visível p/ Corretor" — a unidade continua
     *  listada no portal, mas sem o valor. */
    const handleToggleShowPrice = async (item: CommercialPriceTableItem) => {
        const next = !(item.show_price_to_broker ?? true);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, show_price_to_broker: next } : i));
        try {
            await svc.updateItemShowPrice(item.property_id, next);
        } catch (err: any) {
            setError(err.message);
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, show_price_to_broker: !next } : i));
        }
    };

    const handleUpdateItemPhoto = async (item: CommercialPriceTableItem, file: File) => {
        setUploadingPhotoId(item.id);
        setError(null);
        try {
            const url = await svc.uploadItemPhoto(organizationId, item.property_id, file);
            await svc.updateItemPhoto(item.property_id, url);
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, photo_url: url } : i));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploadingPhotoId(null);
        }
    };

    /** Upload em lote: cada arquivo é casado com uma unidade pelo nome do arquivo
     *  (sem extensão) vs property_name. Sequencial (não paralelo) para não
     *  estourar rate limit do Storage em lotes grandes. */
    const handleBatchPhotoUpload = async (files: FileList) => {
        const byKey = new Map<string, CommercialPriceTableItem>();
        items.forEach(i => { if (i.property_name) byKey.set(normalizeMatchKey(i.property_name), i); });

        setBatchUploading(true);
        setBatchResult(null);
        setError(null);
        const fileList = Array.from(files);
        const unmatched: string[] = [];
        let matched = 0;
        for (let idx = 0; idx < fileList.length; idx++) {
            const file = fileList[idx];
            setBatchProgress({ done: idx, total: fileList.length });
            const baseName = file.name.replace(/\.[^./]+$/, '');
            const item = byKey.get(normalizeMatchKey(baseName));
            if (!item) { unmatched.push(file.name); continue; }
            try {
                const url = await svc.uploadItemPhoto(organizationId, item.property_id, file);
                await svc.updateItemPhoto(item.property_id, url);
                setItems(prev => prev.map(i => i.id === item.id ? { ...i, photo_url: url } : i));
                matched++;
            } catch (err: any) {
                unmatched.push(`${file.name} (erro: ${err.message})`);
            }
        }
        setBatchProgress({ done: fileList.length, total: fileList.length });
        setBatchUploading(false);
        setBatchResult({ matched, unmatched });
    };

    const handleApplyAdjustment = async () => {
        if (!selectedTableId) return;
        setApplyingAdjustment(true);
        setError(null);
        try {
            if (adjustMode === 'percent') {
                const pct = Number(percent);
                if (!pct) { setError('Informe um percentual diferente de zero.'); return; }
                await svc.applyBulkAdjustment(selectedTableId, { percent: pct });
            } else {
                await svc.applyBulkAdjustment(selectedTableId, {
                    indexName, baseMonth: `${baseMonth}-01`, targetMonth: `${targetMonth}-01`, organizationId,
                });
            }
            await loadItems(selectedTableId);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setApplyingAdjustment(false);
        }
    };

    const handleActivate = async () => {
        if (!selectedTableId || !selectedTable) return;
        const ok = await confirm({
            title: `Ativar "${selectedTable.version_label}"?`,
            message: `${items.length} unidade${items.length > 1 ? 's' : ''} ${items.length > 1 ? 'terão' : 'terá'} o preço atualizado imediatamente no Comercial. A tabela vigente atual (se houver) será marcada como substituída.`,
            confirmLabel: 'Ativar',
            variant: 'warning',
        });
        if (!ok) return;
        setActivating(true);
        setError(null);
        try {
            await svc.activateTable(selectedTableId);
            await loadTables();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActivating(false);
        }
    };

    const totalDraft = items.reduce((s, i) => s + i.price, 0);
    const totalCurrent = items.reduce((s, i) => s + (i.current_price ?? i.price), 0);
    const deltaPct = totalCurrent > 0 ? ((totalDraft - totalCurrent) / totalCurrent) * 100 : 0;

    // Unidades publicadas no Comercial que ainda não estão nesta versão (a lista de
    // itens de uma versão é congelada na criação do rascunho — ver createDraftFromActive).
    const missingUnits = React.useMemo(() => {
        const inVersion = new Set(items.map(i => i.property_id));
        return buildingUnits.filter(u => !inVersion.has(u.id));
    }, [buildingUnits, items]);

    const itemDelta = (i: CommercialPriceTableItem) => {
        const cur = i.current_price ?? i.price;
        return cur > 0 ? ((i.price - cur) / cur) * 100 : 0;
    };

    const visibleItems = React.useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const filtered = term
            ? items.filter(i => (i.property_name || '').toLowerCase().includes(term)
                || (UNIT_STATUS_LABEL[i.property_status || ''] || '').toLowerCase().includes(term))
            : items;
        const { sortColumn, sortDirection } = tableColumns;
        const dir = sortDirection === 'asc' ? 1 : -1;
        const sorted = [...filtered].sort((a, b) => {
            if (!sortColumn) return (a.property_name || '').localeCompare(b.property_name || '', 'pt-BR', { numeric: true });
            const n = (v: number | null | undefined) => v ?? -Infinity;
            switch (sortColumn) {
                case 'unit':      return (a.property_name || '').localeCompare(b.property_name || '', 'pt-BR', { numeric: true }) * dir;
                case 'status':    return (UNIT_STATUS_LABEL[a.property_status || ''] || '').localeCompare(UNIT_STATUS_LABEL[b.property_status || ''] || '', 'pt-BR') * dir;
                case 'privArea':  return (n(a.private_area) - n(b.private_area)) * dir;
                case 'bedrooms':  return (n(a.bedrooms) - n(b.bedrooms)) * dir;
                case 'parking':   return (n(a.parking_spaces) - n(b.parking_spaces)) * dir;
                case 'bathrooms': return (n(a.bathrooms) - n(b.bathrooms)) * dir;
                case 'floor':     return (n(a.floor) - n(b.floor)) * dir;
                case 'position':  return (POSITION_LABEL[a.position_type || ''] || '').localeCompare(POSITION_LABEL[b.position_type || ''] || '', 'pt-BR') * dir;
                case 'current':   return ((a.current_price ?? a.price) - (b.current_price ?? b.price)) * dir;
                case 'price':     return (a.price - b.price) * dir;
                case 'delta':     return (itemDelta(a) - itemDelta(b)) * dir;
                case 'visibleToBroker': return (Number(a.visible_to_broker ?? true) - Number(b.visible_to_broker ?? true)) * dir;
                case 'showPrice': return (Number(a.show_price_to_broker ?? true) - Number(b.show_price_to_broker ?? true)) * dir;
                default:          return 0;
            }
        });
        return sorted;
    }, [items, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6">
            {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 text-xs text-rose-700 font-medium flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}

            {/* Versões */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">{cfg.title} — {buildingName}</h3>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">Versões com histórico; ativar grava o preço em todas as unidades de uma vez.</p>
                    </div>
                    <button
                        onClick={handleCreateDraft}
                        disabled={creating}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider"
                    >
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Nova Versão
                    </button>
                </div>

                {tables.length === 0 ? (
                    <p className="text-xs text-gray-400 font-medium py-6 text-center">Nenhuma versão criada ainda. A primeira versão clona os preços atuais das unidades.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {tables.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedTableId(t.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                                    selectedTableId === t.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                }`}
                            >
                                {t.status === 'active' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    : t.status === 'draft' ? <Clock className="w-3.5 h-3.5 text-amber-500" />
                                    : <Archive className="w-3.5 h-3.5 text-gray-400" />}
                                {t.version_label}
                                <span className={`text-xs font-normal ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                                <span className="text-gray-400 font-medium">{fmtDate(t.created_at)}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Detalhe da versão selecionada */}
            {selectedTable && (
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <span className={`text-sm font-normal ${STATUS_COLOR[selectedTable.status]}`}>
                                {STATUS_LABEL[selectedTable.status]}
                            </span>
                            <span className="text-sm font-black text-gray-800">{selectedTable.version_label}</span>
                        </div>
                        {isDraft && (
                            <button
                                onClick={handleActivate}
                                disabled={activating || items.length === 0}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider"
                            >
                                {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Ativar esta versão
                            </button>
                        )}
                    </div>

                    {/* Aviso: unidades publicadas no Comercial fora desta versão (lista congelada na criação) */}
                    {!loadingItems && missingUnits.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-amber-800">
                                    {missingUnits.length} unidade{missingUnits.length > 1 ? 's' : ''} publicada{missingUnits.length > 1 ? 's' : ''} no Comercial {missingUnits.length > 1 ? 'não estão' : 'não está'} nesta versão.
                                </p>
                                <p className="text-xs text-amber-700/80 mt-0.5">
                                    A lista de unidades é fixada quando a versão é criada. Crie uma nova versão para incluir {missingUnits.length > 1 ? 'as unidades novas' : 'a unidade nova'}: {missingUnits.map(u => u.name || '—').join(', ')}
                                </p>
                            </div>
                            <button
                                onClick={handleCreateDraft}
                                disabled={creating}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-[15px] h-[15px]" />} Nova versão
                            </button>
                        </div>
                    )}

                    {/* Reajuste em massa — só em rascunho */}
                    {isDraft && (
                        <div className="bg-gray-50/60 border border-gray-100 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setAdjustMode('percent')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider ${adjustMode === 'percent' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
                                >
                                    <Percent className="w-3.5 h-3.5 inline mr-1" /> Percentual
                                </button>
                                <button
                                    onClick={() => setAdjustMode('index')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider ${adjustMode === 'index' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
                                >
                                    <TrendingUp className="w-3.5 h-3.5 inline mr-1" /> Índice (INCC/IPCA...)
                                </button>
                            </div>

                            {adjustMode === 'percent' ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number" step="0.01" placeholder="Ex: 5 ou -3"
                                        value={percent} onChange={e => setPercent(e.target.value)}
                                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-blue-400 w-40"
                                    />
                                    <span className="text-xs text-gray-400 font-medium">% sobre o preço de cada unidade nesta versão</span>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                    <select value={indexName} onChange={e => setIndexName(e.target.value as IndexName)}
                                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
                                        {INDEX_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    <input type="month" value={baseMonth} onChange={e => setBaseMonth(e.target.value)}
                                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-blue-400" />
                                    <span className="text-xs text-gray-400 font-medium">até</span>
                                    <input type="month" value={targetMonth} onChange={e => setTargetMonth(e.target.value)}
                                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-blue-400" />
                                </div>
                            )}

                            <button
                                onClick={handleApplyAdjustment}
                                disabled={applyingAdjustment}
                                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2"
                            >
                                {applyingAdjustment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Aplicar reajuste em massa
                            </button>
                        </div>
                    )}

                    {/* Impacto total */}
                    {items.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            <KpiCard shadow={false} size="sm" label={cfg.totalCurrentLabel} value={fmtBRL(totalCurrent)} color="gray" />
                            <KpiCard shadow={false} size="sm" label={cfg.totalVersionLabel} value={fmtBRL(totalDraft)} color="blue" />
                            <KpiCard shadow={false} size="sm" label="Variação" value={`${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(2)}%`} color={deltaPct >= 0 ? 'emerald' : 'rose'} />
                        </div>
                    )}

                    {/* Toolbar — busca por unidade/status + configurar colunas (§5.1 desaninhada, sem grid/lista) */}
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por unidade ou status..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={() => batchPhotoInputRef.current?.click()}
                            disabled={batchUploading}
                            title="Selecione várias fotos nomeadas com o número/nome da unidade (ex: 101.jpg) — cada uma é associada automaticamente à unidade correspondente."
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap"
                        >
                            {batchUploading
                                ? <><Loader2 className="w-[15px] h-[15px] animate-spin" /> Enviando {batchProgress?.done ?? 0}/{batchProgress?.total ?? 0}</>
                                : <><Upload className="w-[15px] h-[15px]" /> Upload em lote</>}
                        </button>
                        <input
                            ref={batchPhotoInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={e => { const files = e.target.files; if (files && files.length) handleBatchPhotoUpload(files); e.target.value = ''; }}
                        />
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={columnsForConfig}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>

                    {/* Itens */}
                    {loadingItems ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
                    ) : visibleItems.length === 0 ? (
                        <div className="text-center py-12 text-sm text-gray-400 font-medium">
                            {items.length === 0 ? 'Nenhuma unidade nesta versão.' : 'Nenhuma unidade encontrada para a busca.'}
                        </div>
                    ) : (
                        <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                            {tableColumns.visibleColumns.includes('photo') && (
                                                <th className="px-6 py-2 border-r border-gray-100 w-16">Foto</th>
                                            )}
                                            {tableColumns.visibleColumns.includes('unit') && (
                                                <SortableHeader colKey="unit" label="Unidade" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100" />
                                            )}
                                            {tableColumns.visibleColumns.includes('status') && (
                                                <SortableHeader colKey="status" label="Status" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100" />
                                            )}
                                            {tableColumns.visibleColumns.includes('privArea') && (
                                                <SortableHeader colKey="privArea" label="Área privativa" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />
                                            )}
                                            {tableColumns.visibleColumns.includes('bedrooms') && (
                                                <SortableHeader colKey="bedrooms" label="Dormitórios" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />
                                            )}
                                            {tableColumns.visibleColumns.includes('parking') && (
                                                <SortableHeader colKey="parking" label="Vagas" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />
                                            )}
                                            {tableColumns.visibleColumns.includes('bathrooms') && (
                                                <SortableHeader colKey="bathrooms" label="Banheiros" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />
                                            )}
                                            {tableColumns.visibleColumns.includes('floor') && (
                                                <SortableHeader colKey="floor" label="Pavimento" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 text-right whitespace-nowrap" />
                                            )}
                                            {tableColumns.visibleColumns.includes('position') && (
                                                <SortableHeader colKey="position" label="Posição" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                                            )}
                                            {tableColumns.visibleColumns.includes('current') && (
                                                <SortableHeader colKey="current" label={cfg.currentLabel} uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 text-right" />
                                            )}
                                            {tableColumns.visibleColumns.includes('price') && (
                                                <SortableHeader colKey="price" label={cfg.versionLabel} uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 text-right" />
                                            )}
                                            {tableColumns.visibleColumns.includes('delta') && (
                                                <SortableHeader colKey="delta" label="Δ" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 text-right" />
                                            )}
                                            {tableColumns.visibleColumns.includes('visibleToBroker') && (
                                                <SortableHeader colKey="visibleToBroker" label="Visível p/ Corretor" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 border-r border-gray-100 text-center whitespace-nowrap" />
                                            )}
                                            {tableColumns.visibleColumns.includes('showPrice') && (
                                                <SortableHeader colKey="showPrice" label="Exibir Preço" uppercase={false}
                                                    sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                                                    onSort={tableColumns.handleColumnSort}
                                                    className="px-6 py-2 text-center whitespace-nowrap" />
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {visibleItems.map(item => {
                                            const cur = item.current_price ?? item.price;
                                            const diff = itemDelta(item);
                                            return (
                                                <tr key={item.id} className="hover:bg-blue-50/50 transition-colors">
                                                    {tableColumns.visibleColumns.includes('photo') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                            <PhotoCell
                                                                url={item.photo_url}
                                                                uploading={uploadingPhotoId === item.id}
                                                                onSelect={file => handleUpdateItemPhoto(item, file)}
                                                            />
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('unit') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                            {item.property_name || '—'}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('status') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                            <UnitStatusBadge status={item.property_status} />
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('privArea') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600 whitespace-nowrap">
                                                            {areaFmt(item.private_area)}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('bedrooms') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                            {num(item.bedrooms)}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('parking') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                            {num(item.parking_spaces)}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('bathrooms') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                            {num(item.bathrooms)}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('floor') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">
                                                            {num(item.floor)}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('position') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                            {item.position_type ? (POSITION_LABEL[item.position_type] || item.position_type) : '—'}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('current') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">
                                                            {fmtBRL(cur)}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('price') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right">
                                                            {isDraft ? (
                                                                <PriceInput value={item.price} onCommit={v => handleUpdateItemPrice(item.id, v)} />
                                                            ) : (
                                                                <span className="text-sm font-medium text-gray-800">{fmtBRL(item.price)}</span>
                                                            )}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('delta') && (
                                                        <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-gray-300'}`}>
                                                            {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—'}
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('visibleToBroker') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                            <label className="relative inline-flex items-center cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    className="sr-only peer"
                                                                    checked={item.visible_to_broker ?? true}
                                                                    onChange={() => handleToggleVisibility(item)}
                                                                />
                                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                            </label>
                                                        </td>
                                                    )}
                                                    {tableColumns.visibleColumns.includes('showPrice') && (
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                            <label className="relative inline-flex items-center cursor-pointer" title="Ligado: o corretor vê o preço desta unidade. Desligado: a unidade continua listada, sem o valor.">
                                                                <input
                                                                    type="checkbox"
                                                                    className="sr-only peer"
                                                                    checked={item.show_price_to_broker ?? true}
                                                                    onChange={() => handleToggleShowPrice(item)}
                                                                />
                                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                            </label>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {batchResult && (
                <div className={`fixed bottom-6 right-6 z-[300] max-w-sm rounded-2xl shadow-xl text-sm animate-in slide-in-from-bottom-4 duration-300 overflow-hidden ${
                    batchResult.unmatched.length === 0 ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                }`}>
                    <div className="flex items-start gap-3 px-5 py-4">
                        {batchResult.unmatched.length === 0
                            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                            : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                            <p className="font-medium">
                                {batchResult.matched} foto{batchResult.matched === 1 ? '' : 's'} enviada{batchResult.matched === 1 ? '' : 's'} com sucesso.
                            </p>
                            {batchResult.unmatched.length > 0 && (
                                <div className="mt-1.5">
                                    <p className="text-xs opacity-90">
                                        {batchResult.unmatched.length} arquivo{batchResult.unmatched.length > 1 ? 's' : ''} sem unidade correspondente:
                                    </p>
                                    <ul className="text-xs opacity-90 mt-1 max-h-28 overflow-y-auto space-y-0.5">
                                        {batchResult.unmatched.map((f, idx) => <li key={idx} className="truncate">{f}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setBatchResult(null)} className="text-white/80 hover:text-white shrink-0">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PriceTableManager;
