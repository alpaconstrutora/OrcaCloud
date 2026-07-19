// components/regulatoryMap/RegulatoryMapModule.tsx
//
// Cadastro de Mapas Regulatórios por cidade (Incorporação). Cada cidade tem seu mapa definido
// pela prefeitura (macroáreas/zonas/C.A./gabarito) — em vez de digitar tudo de novo em cada
// empreendimento, cadastra-se aqui uma vez por cidade e o empreendimento importa (aba "Mapa
// Regulatório" → "Importar de mapa cadastrado").
import React from 'react';
import { Plus, Map, Search, RefreshCw, AlertCircle } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { regulatoryMapService } from '../../services/regulatoryMapService';
import { RegulatoryMapWithCity, RegulatoryMapStatus } from '../../types';
import RegulatoryMapForm from './RegulatoryMapForm';
import RegulatoryMapDetail from './RegulatoryMapDetail';

interface Props {
    activeOrganizationId: string | null;
    onChangeView: (view: string) => void;
}

const STATUS_LABELS: Record<RegulatoryMapStatus, string> = {
    ATIVO: 'Ativo',
    RASCUNHO: 'Rascunho',
    ARQUIVADO: 'Arquivado',
};

const STATUS_TEXT_COLOR: Record<RegulatoryMapStatus, string> = {
    ATIVO: 'text-emerald-600',
    RASCUNHO: 'text-amber-600',
    ARQUIVADO: 'text-slate-500',
};

export const RegulatoryMapModule: React.FC<Props> = ({ activeOrganizationId }) => {
    const isAllOrgs = !activeOrganizationId || activeOrganizationId === 'all' || activeOrganizationId === 'TODAS';
    const orgIdParam = isAllOrgs ? undefined : activeOrganizationId as string;

    const [items, setItems] = React.useState<RegulatoryMapWithCity[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [search, setSearch] = React.useState('');
    const [selected, setSelected] = React.useState<RegulatoryMapWithCity | null>(null);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<RegulatoryMapWithCity | null>(null);
    const confirm = useConfirm();
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            setItems(await regulatoryMapService.list(orgIdParam));
        } catch (err) {
            console.error('[RegulatoryMapModule] erro ao carregar:', err);
        } finally {
            setLoading(false);
        }
    }, [orgIdParam]);

    React.useEffect(() => { load(); }, [load]);

    const handleSaved = async (saved: { id: string }) => {
        setIsFormOpen(false);
        setEditing(null);
        await load();
        if (selected && selected.id === saved.id) {
            const refreshed = await regulatoryMapService.getById(saved.id);
            if (refreshed) setSelected(refreshed);
        }
    };

    const handleDelete = async (e: React.MouseEvent, item: RegulatoryMapWithCity) => {
        e.stopPropagation();
        const ok = await confirm({
            title: `Excluir "${item.name}"?`,
            message: 'As zonas cadastradas neste mapa serão removidas. Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await regulatoryMapService.remove(item.id);
            setItems(prev => prev.filter(i => i.id !== item.id));
        } catch (err: any) {
            notify(`Erro ao excluir: ${err.message}`, 'error');
        }
    };

    const filtered = React.useMemo(() => {
        const q = search.toLowerCase();
        return items
            .filter(i =>
                i.name.toLowerCase().includes(q) ||
                (i.city_name || '').toLowerCase().includes(q) ||
                (i.state_code || '').toLowerCase().includes(q),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [items, search]);

    // ── Detalhe ────────────────────────────────────────────────────────────────
    if (selected) {
        return (
            <>
                <RegulatoryMapDetail
                    map={selected}
                    onBack={() => setSelected(null)}
                    onEdit={() => { setEditing(selected); setIsFormOpen(true); }}
                />
                {isFormOpen && (
                    <RegulatoryMapForm
                        organizationId={editing?.organization_id || selected.organization_id || orgIdParam || ''}
                        editing={editing}
                        onClose={() => { setIsFormOpen(false); setEditing(null); }}
                        onSaved={handleSaved}
                    />
                )}
            </>
        );
    }

    // ── Lista ──────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
                        <span>Comercial</span><span>/</span><span className="text-gray-600 font-bold">Incorporação</span>
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1.5 flex items-center gap-2">
                        <Map className="w-6 h-6 text-blue-600" /> Mapa Regulatório
                    </h1>
                    <p className="text-sm text-gray-500 font-medium mt-1">
                        Cadastre o mapa regulatório de cada cidade uma vez; os empreendimentos importam as zonas aplicáveis.
                    </p>
                </div>
                <button
                    onClick={() => { setEditing(null); setIsFormOpen(true); }}
                    title="Novo mapa regulatório"
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" /> Novo mapa
                </button>
            </div>

            <div className="flex flex-col md:flex-row gap-2.5 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Pesquisar por cidade, UF ou nome do mapa..."
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
            </div>

            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando mapas regulatórios...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                    <Map className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum mapa regulatório cadastrado</h3>
                    <p className="text-sm text-gray-500">
                        {search ? 'Tente ajustar sua busca.' : 'Cadastre o mapa regulatório de uma cidade no botão acima.'}
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-6 py-2 border-r border-gray-100">Mapa</th>
                                    <th className="px-6 py-2 border-r border-gray-100 whitespace-nowrap">Cidade</th>
                                    <th className="px-6 py-2 border-r border-gray-100 whitespace-nowrap">Status</th>
                                    <th className="px-6 py-2 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(item => (
                                    <tr
                                        key={item.id}
                                        onClick={() => setSelected(item)}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    >
                                        <td className="px-6 py-2.5 border-r border-gray-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                    <Map className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-normal text-gray-900 truncate">{item.name}</p>
                                                    <p className="text-sm font-normal text-gray-400 truncate">{item.lei_referencia || '—'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-medium text-gray-800 whitespace-nowrap">
                                            {item.city_name}{item.state_code ? ` - ${item.state_code}` : ''}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100">
                                            <span className={`text-sm font-normal ${STATUS_TEXT_COLOR[item.status]}`}>
                                                {STATUS_LABELS[item.status]}
                                            </span>
                                        </td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                                                <ActionIconButton kind="delete" onClick={(e) => handleDelete(e, item)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {isFormOpen && (
                <RegulatoryMapForm
                    organizationId={editing?.organization_id || orgIdParam || ''}
                    editing={editing}
                    onClose={() => { setIsFormOpen(false); setEditing(null); }}
                    onSaved={handleSaved}
                />
            )}

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default RegulatoryMapModule;
