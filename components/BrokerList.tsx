import React from 'react';
import { User, Mail, Phone, Search, Loader2, LayoutDashboard, Link2, Copy, Check, RefreshCw, X, UserCheck, UserX } from 'lucide-react';
import { BrokerProfile } from '../types';
import { brokerService } from '../services/brokerService';
import { brokerPortalService, BrokerPortalToken } from '../services/brokerPortalService';
import BrokerModal from './BrokerModal';
import { useOrgContext } from '../hooks/useOrgContext';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { FilterFieldConfig, useAdvancedFilters, AdvancedFilterPanel, applyFilterRules } from './ui/FilterUtils';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useServicesToast } from './services/useServicestoast';
import ServicesToast from './services/ServicesToast';

const BROKER_COLUMNS: ColumnConfig[] = [
    { key: 'name', label: 'Corretor', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    // Contato = e-mail + telefone combinados — sem valor único óbvio pra ordenar (guide §6.3).
    { key: 'contact', label: 'Contato', sortable: false },
    { key: 'creci', label: 'CRECI', sortable: true },
    { key: 'agency', label: 'Imobiliária', sortable: true },
];

// F6.3 (rollout do Filtro Avançado — ver PLANO_MODULO_TABELAS.md). Complementa a
// busca/status já existentes, não os substitui.
const ADVANCED_FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'name', label: 'Corretor', type: 'text' },
    { key: 'email', label: 'E-mail', type: 'text' },
    { key: 'creci', label: 'CRECI', type: 'text' },
    { key: 'agency', label: 'Imobiliária', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' },
    ] },
];

// Texto simples colorido — sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
const StatusLabel: React.FC<{ active: boolean }> = ({ active }) => (
    <span className={`text-sm font-normal ${active ? 'text-emerald-700' : 'text-gray-400'}`}>
        {active ? 'Ativo' : 'Inativo'}
    </span>
);

function getAdvancedFilterValue(b: BrokerProfile, key: string): unknown {
    switch (key) {
        case 'name': return b.name ?? '';
        case 'email': return b.email ?? '';
        case 'creci': return b.creci ?? '';
        case 'agency': return b.agency_name ?? '';
        case 'status': return b.is_active ? 'active' : 'inactive';
        default: return null;
    }
}

interface BrokerListProps {
    organizationId?: string;
    onSelectBroker?: (broker: BrokerProfile) => void;
}

const BrokerList: React.FC<BrokerListProps> = ({ organizationId, onSelectBroker }) => {
    // A organização vem da prop (contexto da tela) ou do seletor do topo. NUNCA
    // `organizations[0]` — ver hooks/useOrgContext.tsx.
    const { orgId: contextOrgId } = useOrgContext();
    const orgId = organizationId || contextOrgId || undefined;

    const [brokers, setBrokers] = React.useState<BrokerProfile[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    // F2: filtros sobrevivem a navegação/reload.
    const [searchTerm, setSearchTerm] = usePersistedState('brokerListFilters:search', '');
    const [statusFilter, setStatusFilter] = usePersistedState<'all' | 'active' | 'inactive'>('brokerListFilters:status', 'all');

    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedBroker, setSelectedBroker] = React.useState<BrokerProfile | undefined>(undefined);

    // Token modal
    const [tokenModal, setTokenModal] = React.useState<{ broker: BrokerProfile; token: BrokerPortalToken | null } | null>(null);
    const [tokenLoading, setTokenLoading] = React.useState(false);
    const [tokenCopied, setTokenCopied] = React.useState(false);

    const confirm = useConfirm();
    const { toasts, show: showToast, dismiss: dismissToast } = useServicesToast();

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
        const ok = await confirm({
            title: 'Excluir corretor?',
            message: `Tem certeza que deseja excluir o corretor "${name}"? Essa ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await brokerService.deleteProfile(id);
            setBrokers(prev => prev.filter(b => b.id !== id));
            showToast('Corretor excluído com sucesso.', 'success');
        } catch (err) {
            console.error(err);
            showToast('Erro ao excluir o corretor.', 'error');
        }
    };

    const handleOpenModal = (broker?: BrokerProfile) => {
        setSelectedBroker(broker);
        setIsModalOpen(true);
    };

    const handleSave = async (data: Partial<BrokerProfile>) => {
        if (!orgId) {
            throw new Error('Nenhuma organização selecionada para cadastrar o corretor.');
        }

        await brokerService.saveProfile({
            ...data,
            organization_id: data.organization_id || orgId,
        });
        setIsModalOpen(false);
        loadData();
        showToast('Corretor salvo com sucesso!', 'success');
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
        if (!tokenModal) return;
        const ok = await confirm({
            title: 'Revogar acesso ao portal?',
            message: 'O corretor perderá o acesso ao portal através deste link.',
            variant: 'warning',
            confirmLabel: 'Revogar',
        });
        if (!ok) return;
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

    const tableColumns = useTableColumns(BROKER_COLUMNS, 'brokerListColumns');
    const advancedFilters = useAdvancedFilters(ADVANCED_FILTER_FIELDS, 'brokerListFilters:advanced');

    // ── Filtragem / ordenação ────────────────────────────────────────────────────
    const filtered = React.useMemo(() => {
        let result = brokers
            .filter(b =>
                b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                b.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                b.creci?.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .filter(b => statusFilter === 'all' || (statusFilter === 'active' ? b.is_active : !b.is_active));

        result = applyFilterRules(result, advancedFilters.rules, ADVANCED_FILTER_FIELDS, getAdvancedFilterValue);

        return result.sort((a, b) => {
                if (tableColumns.sortColumn) {
                    const col = tableColumns.sortColumn;
                    const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
                    if (col === 'name') return a.name.localeCompare(b.name) * dir;
                    if (col === 'status') return (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1) * dir;
                    if (col === 'creci') return (a.creci || '').localeCompare(b.creci || '') * dir;
                    if (col === 'agency') return (a.agency_name || '').localeCompare(b.agency_name || '') * dir;
                }
                // Sem coluna clicada, ordenação default é nome A-Z (guide §6.4).
                return a.name.localeCompare(b.name);
            });
    }, [brokers, searchTerm, statusFilter, advancedFilters.rules, tableColumns.sortColumn, tableColumns.sortDirection]);

    const kpis = React.useMemo(() => ({
        total: brokers.length,
        active: brokers.filter(b => b.is_active).length,
        inactive: brokers.filter(b => !b.is_active).length,
    }), [brokers]);

    const ActionBar = ({ broker }: { broker: BrokerProfile }) => (
        <div className="flex items-center gap-1.5">
            {onSelectBroker && (
                <ActionIconButton
                    kind="view"
                    title="Acessar portal"
                    icon={<LayoutDashboard className="w-4 h-4" />}
                    onClick={() => onSelectBroker(broker)}
                />
            )}
            <ActionIconButton
                kind="share"
                title="Link de acesso ao portal"
                icon={<Link2 className="w-4 h-4" />}
                onClick={() => openTokenModal(broker)}
            />
            <ActionIconButton kind="edit" onClick={() => handleOpenModal(broker)} />
            <ActionIconButton kind="delete" onClick={() => handleDelete(broker.id, broker.name)} />
        </div>
    );

    // Sempre dentro do <Layout> (só usado por SalesManagementModule, nunca em
    // rota pública) — o gutter §20.2 já vem do <main>. O `p-6` próprio duplicava.
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Meus Corretores</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie sua equipe de corretores e acesso ao portal. Cadastre em Minha Organização &gt; Fornecedores &gt; Corretor Imobiliário.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de Corretores" value={kpis.total} icon={<User className="w-4 h-4" />} color="blue" />
                <KpiCard shadow={false} size="sm" label="Ativos" value={kpis.active} icon={<UserCheck className="w-4 h-4" />} color="emerald" />
                <KpiCard shadow={false} size="sm" label="Inativos" value={kpis.inactive} icon={<UserX className="w-4 h-4" />} color="gray" />
            </div>

            {/* Tabela com toolbar de busca acoplada (ui_ux_guia_unificado.md §5.2) — busca dentro do mesmo card da tabela. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nome, e-mail ou CRECI..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                            className="h-9 text-sm font-normal text-gray-700 bg-white border border-gray-200 rounded-[6px] px-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        >
                            <option value="all">Todos</option>
                            <option value="active">Ativos</option>
                            <option value="inactive">Inativos</option>
                        </select>

                        {/* Dropdown "Ordenar" removido: toda coluna ordenável já ordena pelo próprio cabeçalho (guide §6.4) */}
                        <div className="flex items-center h-9">
                            <AdvancedFilterPanel fields={ADVANCED_FILTER_FIELDS} state={advancedFilters} />
                        </div>

                        <button
                            onClick={loadData}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Atualizar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={BROKER_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum corretor encontrado</h3>
                        <p className="text-sm text-gray-500">
                            {searchTerm ? 'Tente buscar por outro termo.' : 'Cadastre seu primeiro corretor no botão acima.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                    <table className="w-full text-left border-collapse">
                        {/* thead em sentence case (§6.2) — uppercase={false} porque SortableHeader força uppercase internamente por padrão. */}
                        <thead>
                            <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                {tableColumns.visibleColumns.includes('name') && (
                                    <SortableHeader label="Corretor" colKey="name" uppercase={false} sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('status') && (
                                    <SortableHeader label="Status" colKey="status" uppercase={false} sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('contact') && (
                                    <SortableHeader label="Contato" colKey="contact" uppercase={false} sortable={false} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('creci') && (
                                    <SortableHeader label="CRECI" colKey="creci" uppercase={false} sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                {tableColumns.visibleColumns.includes('agency') && (
                                    <SortableHeader label="Imobiliária" colKey="agency" uppercase={false} sortable={true} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                                )}
                                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filtered.map(broker => (
                                <tr key={broker.id} className="hover:bg-blue-50/50 transition-colors group">
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                                    <User className="w-4 h-4" />
                                                </div>
                                                <span className="text-sm font-normal text-gray-900">{broker.name}</span>
                                            </div>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <StatusLabel active={broker.is_active} />
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('contact') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                            <div className="space-y-1">
                                                {broker.email && (
                                                    <div className="flex items-center text-sm font-normal text-gray-600">
                                                        <Mail className="w-3.5 h-3.5 mr-1.5 text-blue-500 shrink-0" />
                                                        {broker.email}
                                                    </div>
                                                )}
                                                {broker.phone && (
                                                    <div className="flex items-center text-sm font-normal text-gray-600">
                                                        <Phone className="w-3.5 h-3.5 mr-1.5 text-gray-400 shrink-0" />
                                                        {broker.phone}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('creci') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                            {broker.creci || '-'}
                                        </td>
                                    )}
                                    {tableColumns.visibleColumns.includes('agency') && (
                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                            {broker.agency_name || '-'}
                                        </td>
                                    )}
                                    <td className="px-6 py-2.5 text-right">
                                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                                            <ActionBar broker={broker} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            </div>

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
                                    <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-2">Link ativo</p>
                                    <p className="text-xs text-gray-700 font-mono break-all leading-relaxed">
                                        {brokerPortalService.buildPortalUrl(tokenModal.token.token)}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Expira em: {new Date(tokenModal.token.expires_at).toLocaleDateString('pt-BR')}
                                        {tokenModal.token.last_used_at && ` · Último acesso: ${new Date(tokenModal.token.last_used_at).toLocaleDateString('pt-BR')}`}
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleCopyLink}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-button font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95"
                                    >
                                        {tokenCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {tokenCopied ? 'Copiado!' : 'Copiar Link'}
                                    </button>
                                    <button
                                        onClick={handleGenerateToken}
                                        className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 text-gray-500 rounded-2xl text-button font-black uppercase tracking-widest hover:border-gray-300 hover:text-gray-700 transition-all"
                                        title="Regenerar link"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleRevokeToken}
                                        className="flex items-center justify-center gap-2 px-4 py-3 border border-red-100 text-red-400 rounded-2xl text-button font-black uppercase tracking-widest hover:border-red-300 hover:text-red-600 transition-all"
                                        title="Revogar acesso"
                                    >
                                        <UserX className="w-4 h-4" />
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
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-button font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95"
                                >
                                    <Link2 className="w-4 h-4" />
                                    Gerar Link de Acesso
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ServicesToast toasts={toasts} onDismiss={dismissToast} />
        </div>
    );
};

export default BrokerList;
