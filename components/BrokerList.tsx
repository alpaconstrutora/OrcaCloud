import React from 'react';
import { User, Mail, Phone, Trash2, Search, Loader2, Plus, Edit2, LayoutDashboard, Table2, Link2, Copy, Check, RefreshCw, X, LayoutGrid } from 'lucide-react';
import { BrokerProfile } from '../types';
import { brokerService } from '../services/brokerService';
import { brokerPortalService, BrokerPortalToken } from '../services/brokerPortalService';
import BrokerModal from './BrokerModal';
import { useStore } from '../store/useStore';

interface BrokerListProps {
    organizationId?: string;
    onSelectBroker?: (broker: BrokerProfile) => void;
}

const BrokerList: React.FC<BrokerListProps> = ({ organizationId, onSelectBroker }) => {
    const { activeOrganizationId } = useStore();
    const orgId = organizationId || activeOrganizationId || undefined;

    const [brokers, setBrokers] = React.useState<BrokerProfile[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'inactive'>('all');
    const [sortBy, setSortBy] = React.useState('name-asc');
    const [viewMode, setViewMode] = React.useState<'list' | 'grid'>('list');

    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedBroker, setSelectedBroker] = React.useState<BrokerProfile | undefined>(undefined);

    // Token modal
    const [tokenModal, setTokenModal] = React.useState<{ broker: BrokerProfile; token: BrokerPortalToken | null } | null>(null);
    const [tokenLoading, setTokenLoading] = React.useState(false);
    const [tokenCopied, setTokenCopied] = React.useState(false);

    React.useEffect(() => { loadData(); }, [orgId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const data = await brokerService.listProfiles(orgId);
            setBrokers(data);
        } catch (err) {
            console.error('Erro ao listar corretores:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Excluir o corretor "${name}"?`)) return;
        try {
            await brokerService.deleteProfile(id);
            setBrokers(prev => prev.filter(b => b.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    const handleOpenModal = (broker?: BrokerProfile) => {
        setSelectedBroker(broker);
        setIsModalOpen(true);
    };

    const handleSave = async (data: Partial<BrokerProfile>) => {
        await brokerService.saveProfile(data);
        setIsModalOpen(false);
        loadData();
    };

    // ── Token helpers ────────────────────────────────────────────────────────────
    const openTokenModal = async (broker: BrokerProfile) => {
        setTokenModal({ broker, token: null });
        setTokenLoading(true);
        try {
            const tok = await brokerPortalService.getTokenForBroker(broker.id);
            setTokenModal({ broker, token: tok });
        } catch (e) {
            console.error(e);
        } finally {
            setTokenLoading(false);
        }
    };

    const handleGenerateToken = async () => {
        if (!tokenModal || !orgId) return;
        setTokenLoading(true);
        try {
            await brokerPortalService.generateToken(tokenModal.broker.id, orgId);
            const tok = await brokerPortalService.getTokenForBroker(tokenModal.broker.id);
            setTokenModal(prev => prev ? { ...prev, token: tok } : null);
        } catch (e) {
            console.error(e);
        } finally {
            setTokenLoading(false);
        }
    };

    const handleCopyLink = async () => {
        if (!tokenModal?.token) return;
        await navigator.clipboard.writeText(brokerPortalService.buildPortalUrl(tokenModal.token.token));
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
    };

    const handleRevokeToken = async () => {
        if (!tokenModal || !confirm('Revogar acesso deste corretor ao portal?')) return;
        setTokenLoading(true);
        try {
            await brokerPortalService.revokeToken(tokenModal.broker.id);
            setTokenModal(prev => prev ? { ...prev, token: null } : null);
        } catch (e) {
            console.error(e);
        } finally {
            setTokenLoading(false);
        }
    };

    // ── Filtragem / ordenação ────────────────────────────────────────────────────
    const filtered = React.useMemo(() => {
        return brokers
            .filter(b =>
                b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                b.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                b.creci?.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .filter(b => statusFilter === 'all' || (statusFilter === 'active' ? b.is_active : !b.is_active))
            .sort((a, b) => {
                if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
                if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
                if (sortBy === 'recent') return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
                return 0;
            });
    }, [brokers, searchTerm, statusFilter, sortBy]);

    const ActionBar = ({ broker }: { broker: BrokerProfile }) => (
        <div className="flex items-center gap-1.5">
            {onSelectBroker && (
                <button
                    onClick={() => onSelectBroker(broker)}
                    className="p-2 text-indigo-500 hover:text-white hover:bg-indigo-500 rounded-lg transition-all"
                    title="Acessar Portal"
                >
                    <LayoutDashboard className="w-4 h-4" />
                </button>
            )}
            <button
                onClick={() => openTokenModal(broker)}
                className="p-2 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition-all"
                title="Link de Acesso ao Portal"
            >
                <Link2 className="w-4 h-4" />
            </button>
            <button
                onClick={() => handleOpenModal(broker)}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                title="Editar"
            >
                <Edit2 className="w-4 h-4" />
            </button>
            <button
                onClick={() => handleDelete(broker.id, broker.name)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                title="Excluir"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Meus Corretores</h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua equipe de corretores e acesso ao portal.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    Novo Corretor
                </button>
            </div>

            {/* Barra de filtros */}
            <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, e-mail ou CRECI..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent rounded-[1.5rem] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Filtrar:</span>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                        className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    >
                        <option value="all">Todos</option>
                        <option value="active">Ativos</option>
                        <option value="inactive">Inativos</option>
                    </select>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Ordenar:</span>
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-[1.25rem] px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    >
                        <option value="name-asc">Nome (A-Z)</option>
                        <option value="name-desc">Nome (Z-A)</option>
                        <option value="recent">Mais Recentes</option>
                    </select>
                </div>
                <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Blocos"
                    >
                        <LayoutGrid className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Linhas"
                    >
                        <Table2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Conteúdo */}
            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border border-gray-200 border-dashed">
                    <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900">Nenhum corretor encontrado</h3>
                    <p className="text-gray-500 font-medium">
                        {searchTerm ? 'Tente buscar por outro termo.' : 'Cadastre seu primeiro corretor no botão acima.'}
                    </p>
                </div>
            ) : viewMode === 'list' ? (
                <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Corretor</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Contato</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">CRECI</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Imobiliária</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.map(broker => (
                                <tr key={broker.id} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                                                <User className="w-5 h-5" />
                                            </div>
                                            <span className="text-sm font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                                                {broker.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${broker.is_active
                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                                            {broker.is_active ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="space-y-1">
                                            {broker.email && (
                                                <div className="flex items-center text-xs text-gray-600">
                                                    <Mail className="w-3 h-3 mr-1.5 text-blue-500 flex-shrink-0" />
                                                    {broker.email}
                                                </div>
                                            )}
                                            {broker.phone && (
                                                <div className="flex items-center text-xs text-gray-600">
                                                    <Phone className="w-3 h-3 mr-1.5 flex-shrink-0" />
                                                    {broker.phone}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-gray-600 font-medium">{broker.creci || '-'}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-gray-600">{broker.agency_name || '-'}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-end">
                                            <ActionBar broker={broker} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* Grid view */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map(broker => (
                        <div key={broker.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group flex flex-col">
                            <div className="p-6 flex-1">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                                            <User className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{broker.name}</h3>
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${broker.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                                                {broker.is_active ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2.5 pt-4 border-t border-gray-50">
                                    {broker.email && (
                                        <div className="flex items-center text-sm text-gray-600 font-medium">
                                            <Mail className="w-4 h-4 mr-2 text-blue-500 flex-shrink-0" />
                                            <span className="truncate">{broker.email}</span>
                                        </div>
                                    )}
                                    {broker.phone && (
                                        <div className="flex items-center text-sm text-gray-600 font-medium">
                                            <Phone className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                                            {broker.phone}
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-[11px] pt-1">
                                        <span className="text-gray-400 uppercase tracking-widest font-bold">CRECI</span>
                                        <span className="text-gray-900 font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{broker.creci || '-'}</span>
                                    </div>
                                    {broker.agency_name && (
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="text-gray-400 uppercase tracking-widest font-bold">Imobiliária</span>
                                            <span className="text-gray-900 font-semibold truncate ml-2">{broker.agency_name}</span>
                                        </div>
                                    )}
                                    {broker.commission_rate !== undefined && (
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="text-gray-400 uppercase tracking-widest font-bold">Comissão</span>
                                            <span className="text-gray-900 font-bold">{broker.commission_rate}%</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="px-6 py-4 bg-gray-50/50 rounded-b-[2rem] border-t border-gray-100 flex justify-end gap-1">
                                <ActionBar broker={broker} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de edição */}
            <BrokerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={selectedBroker}
                organizationId={orgId}
            />

            {/* Token Modal */}
            {tokenModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setTokenModal(null)}>
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Link de Acesso</h3>
                                <p className="text-sm text-gray-400 font-medium mt-0.5">{tokenModal.broker.name}</p>
                            </div>
                            <button onClick={() => setTokenModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {tokenLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                            </div>
                        ) : tokenModal.token?.is_active ? (
                            <div className="space-y-4">
                                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Link ativo</p>
                                    <p className="text-xs text-gray-700 font-mono break-all leading-relaxed">
                                        {brokerPortalService.buildPortalUrl(tokenModal.token.token)}
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-2">
                                        Expira em: {new Date(tokenModal.token.expires_at).toLocaleDateString('pt-BR')}
                                        {tokenModal.token.last_used_at && ` · Último acesso: ${new Date(tokenModal.token.last_used_at).toLocaleDateString('pt-BR')}`}
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleCopyLink}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95"
                                    >
                                        {tokenCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {tokenCopied ? 'Copiado!' : 'Copiar Link'}
                                    </button>
                                    <button
                                        onClick={handleGenerateToken}
                                        className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 text-gray-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-gray-300 hover:text-gray-700 transition-all"
                                        title="Regenerar link"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleRevokeToken}
                                        className="flex items-center justify-center gap-2 px-4 py-3 border border-red-100 text-red-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-red-300 hover:text-red-600 transition-all"
                                        title="Revogar acesso"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
                                    <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-sm font-bold text-gray-700">Nenhum link ativo</p>
                                    <p className="text-xs text-gray-400 mt-1">Gere um link para que o corretor acesse o portal sem precisar de cadastro.</p>
                                </div>
                                <button
                                    onClick={handleGenerateToken}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95"
                                >
                                    <Link2 className="w-4 h-4" />
                                    Gerar Link de Acesso
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrokerList;
