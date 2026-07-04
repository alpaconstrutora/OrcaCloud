import React from 'react';
import { Plus, Loader2, CheckCircle2, Clock, Archive, Percent, TrendingUp, AlertTriangle } from 'lucide-react';
import {
    commercialPriceTableService,
    CommercialPriceTable,
    CommercialPriceTableItem,
} from '../services/commercialPriceTableService';
import { IndexName } from '../services/contractIndexService';
import { useConfirm } from './ui/confirm';
import { formatMoney } from './ui/Format';

interface Props {
    organizationId: string;
    buildingId: string;
    buildingName: string;
}

const STATUS_LABEL: Record<string, string> = { draft: 'Rascunho', active: 'Ativa', superseded: 'Substituída' };
const STATUS_STYLE: Record<string, string> = {
    draft: 'bg-amber-500/10 text-amber-600',
    active: 'bg-emerald-500/10 text-emerald-600',
    superseded: 'bg-gray-500/10 text-gray-500',
};
const INDEX_NAMES: IndexName[] = ['INCC-M', 'INCC', 'IPCA', 'IGP-M', 'CUB', 'OUTROS'];

const fmtBRL = formatMoney;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export const PriceTableManager: React.FC<Props> = ({ organizationId, buildingId, buildingName }) => {
    const confirm = useConfirm();
    const [tables, setTables] = React.useState<CommercialPriceTable[]>([]);
    const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null);
    const [items, setItems] = React.useState<CommercialPriceTableItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadingItems, setLoadingItems] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [creating, setCreating] = React.useState(false);
    const [activating, setActivating] = React.useState(false);
    const [applyingAdjustment, setApplyingAdjustment] = React.useState(false);

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
            const rows = await commercialPriceTableService.listTables(buildingId);
            setTables(rows);
            setSelectedTableId(prev => rows.some(t => t.id === prev) ? prev : (rows[0]?.id ?? null));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [buildingId]);

    React.useEffect(() => { loadTables(); }, [loadTables]);

    const loadItems = React.useCallback(async (tableId: string) => {
        setLoadingItems(true);
        try {
            const rows = await commercialPriceTableService.getTableItems(tableId);
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
            const table = await commercialPriceTableService.createDraftFromActive(organizationId, buildingId, `v${nextVersion}`);
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
            await commercialPriceTableService.updateItemPrice(itemId, price);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleApplyAdjustment = async () => {
        if (!selectedTableId) return;
        setApplyingAdjustment(true);
        setError(null);
        try {
            if (adjustMode === 'percent') {
                const pct = Number(percent);
                if (!pct) { setError('Informe um percentual diferente de zero.'); return; }
                await commercialPriceTableService.applyBulkAdjustment(selectedTableId, { percent: pct });
            } else {
                await commercialPriceTableService.applyBulkAdjustment(selectedTableId, {
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
            await commercialPriceTableService.activateTable(selectedTableId);
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
                        <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Tabela de Preços — {buildingName}</h3>
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
                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
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
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${STATUS_STYLE[selectedTable.status]}`}>
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
                            <div className="bg-gray-50 rounded-xl p-3">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Vigente</p>
                                <p className="text-sm font-black text-gray-700">{fmtBRL(totalCurrent)}</p>
                            </div>
                            <div className="bg-blue-50 rounded-xl p-3">
                                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Total Nesta Versão</p>
                                <p className="text-sm font-black text-blue-700">{fmtBRL(totalDraft)}</p>
                            </div>
                            <div className={`rounded-xl p-3 ${deltaPct >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                                <p className={`text-[9px] font-black uppercase tracking-widest ${deltaPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Variação</p>
                                <p className={`text-sm font-black ${deltaPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(2)}%</p>
                            </div>
                        </div>
                    )}

                    {/* Itens */}
                    {loadingItems ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
                    ) : (
                        <div className="border border-gray-100 rounded-2xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="bg-gray-50/50 text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100">
                                        <th className="py-2.5 px-4">Unidade</th>
                                        <th className="py-2.5 px-4 text-right">Preço Vigente</th>
                                        <th className="py-2.5 px-4 text-right">Preço Nesta Versão</th>
                                        <th className="py-2.5 px-4 text-right">Δ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => {
                                        const cur = item.current_price ?? item.price;
                                        const diff = cur > 0 ? ((item.price - cur) / cur) * 100 : 0;
                                        return (
                                            <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                                                <td className="py-2 px-4 font-bold text-gray-800">{item.property_name || '—'}</td>
                                                <td className="py-2 px-4 text-right text-gray-500">{fmtBRL(cur)}</td>
                                                <td className="py-2 px-4 text-right">
                                                    {isDraft ? (
                                                        <input
                                                            type="number" step="0.01" value={item.price}
                                                            onChange={e => handleUpdateItemPrice(item.id, Number(e.target.value))}
                                                            className="w-32 text-right px-2 py-1 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400"
                                                        />
                                                    ) : (
                                                        <span className="font-bold text-gray-700">{fmtBRL(item.price)}</span>
                                                    )}
                                                </td>
                                                <td className={`py-2 px-4 text-right font-bold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-gray-300'}`}>
                                                    {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PriceTableManager;
