import React from 'react';
import { Landmark, Plus, RefreshCw, Search, Users, Wallet, Hourglass } from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { formatMoney, formatDateBR } from '../ui/Format';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { useOrgContext, useOrgWriteTarget, errorMessage } from '../../hooks/useOrgContext';
import { creditRoomService } from '../../services/creditRoomService';
import { CREDIT_ROOM_STATUS_PT, type CreditRoom, type CreditRoomInput, type CreditRoomStatus } from '../../types/creditRoom';
import CreditRoomForm from './CreditRoomForm';
import CreditRoomDetail from './CreditRoomDetail';

/**
 * Portal de Crédito — lado interno. Lista das operações (Credit Rooms).
 * Plano: docs/planos/2026-09-07-portal-credito-credit-room.md (item 6)
 */

const COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Operação', sortable: true },
    { key: 'instituicao', label: 'Instituição', sortable: true },
    { key: 'solicitado', label: 'Solicitado', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'versao', label: 'Versão ativa', sortable: true },
    { key: 'atualizado', label: 'Atualizado', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const STATUS_COR: Record<CreditRoomStatus, string> = {
    PREPARACAO: 'text-gray-600',
    ENVIADA: 'text-blue-700',
    EM_ANALISE: 'text-indigo-700',
    PENDENCIAS: 'text-amber-700',
    COMITE: 'text-violet-700',
    APROVADA: 'text-green-700',
    RECUSADA: 'text-red-600',
    CONTRATACAO: 'text-blue-700',
    ATIVA: 'text-green-700',
    QUITADA: 'text-gray-500',
    CANCELADA: 'text-gray-500',
};

const ENCERRADOS: CreditRoomStatus[] = ['RECUSADA', 'QUITADA', 'CANCELADA'];

// §8 — texto colorido simples, sem pílula/fundo/uppercase.
export const CreditRoomStatusBadge = ({ status }: { status: CreditRoomStatus }) => (
    <span className={`text-sm font-normal ${STATUS_COR[status] ?? 'text-gray-600'}`}>
        {CREDIT_ROOM_STATUS_PT[status] ?? status}
    </span>
);

export default function CreditRoomModule() {
    // REGRA #5 — `orgId` null é "Todas"; não bloqueia leitura.
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const confirm = useConfirm();

    const [rooms, setRooms] = React.useState<CreditRoom[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);

    const [searchTerm, setSearchTerm] = usePersistedState<string>('creditRooms:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'creditRoomsColumns');

    const [formAberto, setFormAberto] = React.useState(false);
    const [editando, setEditando] = React.useState<CreditRoom | undefined>(undefined);
    const [detalhe, setDetalhe] = React.useState<CreditRoom | null>(null);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            setRooms(await creditRoomService.list(orgId));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível carregar as operações de crédito.'));
        } finally {
            setCarregando(false);
        }
    }, [orgId]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const kpis = React.useMemo(() => {
        const abertos = rooms.filter(r => !ENCERRADOS.includes(r.status));
        return {
            abertos: abertos.length,
            solicitado: abertos.reduce((a, r) => a + r.requestedAmount, 0),
            emAnalise: abertos.filter(r => ['ENVIADA', 'EM_ANALISE', 'PENDENCIAS', 'COMITE'].includes(r.status)).length,
            ativos: rooms.filter(r => r.status === 'ATIVA' || r.status === 'APROVADA' || r.status === 'CONTRATACAO').length,
        };
    }, [rooms]);

    const filtrados = React.useMemo(() => {
        const termo = searchTerm.trim().toLowerCase();
        const base = termo
            ? rooms.filter(r => [r.code, r.name, r.institutionName, r.purpose, CREDIT_ROOM_STATUS_PT[r.status]]
                .some(v => v?.toLowerCase().includes(termo)))
            : rooms;

        const valor = (r: CreditRoom, key: string): string | number => {
            switch (key) {
                case 'code': return r.seq;
                case 'name': return r.name;
                case 'instituicao': return r.institutionName ?? '';
                case 'solicitado': return r.requestedAmount;
                case 'status': return CREDIT_ROOM_STATUS_PT[r.status];
                case 'versao': return r.activeVersionId ? 1 : 0;
                case 'atualizado': return r.updatedAt;
                default: return '';
            }
        };

        return [...base].sort((a, b) => {
            if (tableColumns.sortColumn) {
                const va = valor(a, tableColumns.sortColumn);
                const vb = valor(b, tableColumns.sortColumn);
                const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
                return tableColumns.sortDirection === 'desc' ? -cmp : cmp;
            }
            // §6.4 — fallback dentro do sort: mais recente primeiro.
            return b.updatedAt.localeCompare(a.updatedAt);
        });
    }, [rooms, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const abrirNovo = () => { setEditando(undefined); setFormAberto(true); };
    const abrirEdicao = (r: CreditRoom) => { setEditando(r); setFormAberto(true); };

    const salvar = async (input: CreditRoomInput) => {
        if (editando) {
            const atualizado = await creditRoomService.update(editando.id, input);
            // §22 — atualiza o array local.
            setRooms(prev => prev.map(r => (r.id === atualizado.id ? atualizado : r)));
            setEditando(atualizado);
            if (detalhe?.id === atualizado.id) setDetalhe(atualizado);
            return;
        }
        // 'single': a operação pertence à org da SPE tomadora (decisão do
        // usuário 2026-09-07) — replicar em todas criaria operações fantasma.
        const alvo = await resolveWriteOrg('single');
        if (!alvo || alvo.kind !== 'org') return;
        const criado = await creditRoomService.create(alvo.orgId, input);
        setRooms(prev => [criado, ...prev]);
    };

    const excluir = async (r: CreditRoom) => {
        const ok = await confirm({
            title: 'Excluir Credit Room?',
            message: r.activeVersionId
                ? 'Esta operação já tem versão congelada e não pode ser excluída — cancele-a em vez disso.'
                : 'Participantes, solicitações e comentários desta operação também serão excluídos.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await creditRoomService.remove(r.id);
            setRooms(prev => prev.filter(x => x.id !== r.id));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível excluir a operação.'));
        }
    };

    if (detalhe) {
        return (
            <>
                <CreditRoomDetail
                    room={detalhe}
                    onBack={() => setDetalhe(null)}
                    onEdit={() => abrirEdicao(detalhe)}
                    onChanged={r => {
                        setRooms(prev => prev.map(x => (x.id === r.id ? r : x)));
                        setDetalhe(prev => (prev && prev.id === r.id ? r : prev));
                    }}
                />
                <CreditRoomForm open={formAberto} onClose={() => setFormAberto(false)} room={editando} onSave={salvar} />
                {orgTargetModal}
            </>
        );
    }

    const th = 'px-6 py-2 border-r border-gray-100';
    const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Portal de Crédito</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    Credit Rooms — a operação de crédito montada com os dados do ÒPURA e compartilhada com a instituição financeira.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Operações abertas" value={kpis.abertos} icon={<Landmark className="w-5 h-5" />} color="blue" />
                <KpiCard label="Valor solicitado" value={formatMoney(kpis.solicitado)} sub="Soma das operações abertas" icon={<Wallet className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Em análise no banco" value={kpis.emAnalise} icon={<Hourglass className="w-5 h-5" />} color="amber" />
                <KpiCard label="Aprovadas / ativas" value={kpis.ativos} icon={<Users className="w-5 h-5" />} color="emerald" />
            </div>

            {/* §5.3 — ação primária na barra de escopo */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <p className="text-sm font-normal text-gray-500 px-1">
                    {filtrados.length} operaç{filtrados.length === 1 ? 'ão' : 'ões'}
                </p>
                <button
                    onClick={abrirNovo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Novo Credit Room
                </button>
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}

            {/* §5.2 — toolbar acoplada à tabela */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por código, operação, instituição ou status..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button onClick={() => void carregar()} className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95">
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
                        </div>
                    </div>
                </div>

                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma operação de crédito</h3>
                        <p className="text-sm text-gray-500">
                            {searchTerm ? 'Tente ajustar sua busca.' : 'Crie o primeiro Credit Room para montar a operação e convidar a instituição.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.visibleColumns.includes('code') && (
                                        <SortableHeader colKey="code" label="Código" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={th} />
                                    )}
                                    {tableColumns.visibleColumns.includes('name') && (
                                        <SortableHeader colKey="name" label="Operação" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={th} />
                                    )}
                                    {tableColumns.visibleColumns.includes('instituicao') && (
                                        <SortableHeader colKey="instituicao" label="Instituição" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={th} />
                                    )}
                                    {tableColumns.visibleColumns.includes('solicitado') && (
                                        <SortableHeader colKey="solicitado" label="Solicitado" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={`${th} text-right`} />
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader colKey="status" label="Status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={`${th} text-center`} />
                                    )}
                                    {tableColumns.visibleColumns.includes('versao') && (
                                        <SortableHeader colKey="versao" label="Versão ativa" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={`${th} text-center`} />
                                    )}
                                    {tableColumns.visibleColumns.includes('atualizado') && (
                                        <SortableHeader colKey="atualizado" label="Atualizado" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={`${th} text-center`} />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtrados.map(r => (
                                    <tr key={r.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer group" onClick={() => setDetalhe(r)}>
                                        {tableColumns.visibleColumns.includes('code') && (
                                            <td className={`${td} text-gray-600`}>{r.code}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('name') && (
                                            <td className={`${td} text-gray-700`}>
                                                <span className="block truncate" title={r.name}>{r.name}</span>
                                                {r.purpose && <span className="block truncate text-xs text-gray-400" title={r.purpose}>{r.purpose}</span>}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('instituicao') && (
                                            <td className={`${td} text-gray-700`}>
                                                <span className="block truncate" title={r.institutionName ?? ''}>{r.institutionName || '—'}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('solicitado') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800 text-right">{formatMoney(r.requestedAmount)}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <td className={`${td} text-center`}><CreditRoomStatusBadge status={r.status} /></td>
                                        )}
                                        {tableColumns.visibleColumns.includes('versao') && (
                                            <td className={`${td} text-center text-gray-600`}>{r.activeVersionId ? 'Congelada' : '—'}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('atualizado') && (
                                            <td className={`${td} text-center text-gray-600`}>{formatDateBR(r.updatedAt)}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                {/* §9.1 — clicar na linha abre o detalhe; aqui fica o que NÃO é a ação dominante. */}
                                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                    <ActionIconButton kind="edit" onClick={() => abrirEdicao(r)} />
                                                    <ActionIconButton kind="delete" onClick={() => void excluir(r)} />
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

            <CreditRoomForm open={formAberto} onClose={() => setFormAberto(false)} room={editando} onSave={salvar} />
            {orgTargetModal}
        </div>
    );
}
