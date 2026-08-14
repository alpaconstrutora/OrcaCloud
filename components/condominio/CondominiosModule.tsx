// components/condominio/CondominiosModule.tsx
// Comercial › Condomínios — ÒPURA Pós-Entrega.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A lista NÃO é de uma tabela nova: são os `empreendimentos` no estado
// EM_OPERACAO. Um edifício ENTREGUE aparece aqui como candidato, para poder
// ser colocado em operação — senão o usuário teria de descobrir sozinho que
// precisa mudar o status em outro módulo antes de este ficar utilizável.
import React from 'react';
import { Building2, Search, RefreshCw, PlayCircle, Users, Wrench } from 'lucide-react';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { useConfirm } from '../ui/confirm';
import CondominioDetail from './CondominioDetail';
import { empreendimentoService } from '../../services/empreendimentoService';
import { useOrgContext } from '../../hooks/useOrgContext';
import type { Empreendimento } from '../../types/empreendimento';

const COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Condomínio', sortable: true },
    { key: 'cnpj', label: 'CNPJ do condomínio', sortable: true },
    { key: 'cidade', label: 'Cidade', sortable: true },
    { key: 'situacao', label: 'Situação', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const CondominiosModule: React.FC = () => {
    const confirm = useConfirm();
    // A org vem do seletor do topo via hook, nunca de prop — e `null` ("Todas")
    // NÃO bloqueia o carregamento (CLAUDE.md regra #5).
    const { orgId } = useOrgContext();

    const [searchTerm, setSearchTerm] = usePersistedState<string>('condominios:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'condominiosColumns');

    const [todos, setTodos] = React.useState<Empreendimento[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [aberto, setAberto] = React.useState<Empreendimento | null>(null);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const lista = await empreendimentoService.list(orgId || undefined);
            // ENTREGUE entra como candidato: é o passo anterior a EM_OPERACAO.
            setTodos(lista.filter(e => e.status === 'EM_OPERACAO' || e.status === 'ENTREGUE'));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar os condomínios.');
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const emOperacao = React.useMemo(() => todos.filter(e => e.status === 'EM_OPERACAO'), [todos]);
    const candidatos = React.useMemo(() => todos.filter(e => e.status === 'ENTREGUE'), [todos]);

    const filtrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        const base = t
            ? todos.filter(e =>
                e.name.toLowerCase().includes(t)
                || (e.code || '').toLowerCase().includes(t)
                || (e.condominio_cnpj || '').toLowerCase().includes(t)
                || (e.endereco_city || '').toLowerCase().includes(t))
            : todos;

        const valor = (e: Empreendimento, col: string): string => {
            switch (col) {
                case 'code': return e.code || '';
                case 'name': return e.name;
                case 'cnpj': return e.condominio_cnpj || '';
                case 'cidade': return e.endereco_city || '';
                case 'situacao': return e.status;
                default: return '';
            }
        };

        return [...base].sort((a, b) => {
            if (tableColumns.sortColumn) {
                const cmp = valor(a, tableColumns.sortColumn).localeCompare(valor(b, tableColumns.sortColumn), 'pt-BR');
                return tableColumns.sortDirection === 'desc' ? -cmp : cmp;
            }
            // Em operação primeiro: candidato é o que ainda não virou condomínio.
            if (a.status !== b.status) return a.status === 'EM_OPERACAO' ? -1 : 1;
            return a.name.localeCompare(b.name, 'pt-BR');
        });
    }, [todos, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const colocarEmOperacao = async (e: Empreendimento) => {
        const ok = await confirm({
            title: 'Colocar em operação?',
            message: `${e.name} passa de Entregue para Em Operação. O espelho de vendas e o de locações continuam intactos — é o mesmo edifício, agora também operado como condomínio.`,
            variant: 'default',
            confirmLabel: 'Colocar em operação',
        });
        if (!ok) return;
        try {
            const atualizado = await empreendimentoService.update(e.id, { status: 'EM_OPERACAO' } as any);
            // §22 — atualiza o array local em vez de recarregar a lista inteira.
            setTodos(prev => prev.map(x => (x.id === e.id ? atualizado : x)));
            notify(`${e.name} está em operação.`);
        } catch (err: any) {
            notify(err?.message || 'Erro ao mudar a situação.', 'error');
        }
    };

    if (aberto) {
        return (
            <CondominioDetail
                empreendimento={aberto}
                onBack={() => setAberto(null)}
                onChanged={atualizado => {
                    setAberto(atualizado);
                    setTodos(prev => prev.map(x => (x.id === atualizado.id ? atualizado : x)));
                }}
            />
        );
    }

    const v = tableColumns.visibleColumns;

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Condomínios</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    O edifício depois da entrega: ocupações, manutenção predial e o histórico técnico.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-3">
                <KpiCard label="EM OPERAÇÃO" value={emOperacao.length} icon={<Building2 className="w-5 h-5" />} color="teal" />
                <KpiCard
                    label="ENTREGUES, FORA DE OPERAÇÃO"
                    value={candidatos.length}
                    sub={candidatos.length > 0 ? 'Prontos para virar condomínio' : undefined}
                    icon={<PlayCircle className="w-5 h-5" />}
                    color={candidatos.length > 0 ? 'amber' : 'gray'}
                />
                <KpiCard
                    label="SEM CNPJ PRÓPRIO"
                    value={emOperacao.filter(e => !e.condominio_cnpj).length}
                    icon={<Users className="w-5 h-5" />}
                    color="indigo"
                />
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nome, código, CNPJ ou cidade..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={carregar}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Recarregar"
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
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum condomínio</h3>
                        <p className="text-sm text-gray-500">
                            Um condomínio é um empreendimento entregue e colocado em operação — não um cadastro à parte.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {v.includes('code') && <SortableHeader colKey="code" label="Código" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('name') && <SortableHeader colKey="name" label="Condomínio" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('cnpj') && <SortableHeader colKey="cnpj" label="CNPJ do condomínio" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('cidade') && <SortableHeader colKey="cidade" label="Cidade" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('situacao') && <SortableHeader colKey="situacao" label="Situação" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('actions') && <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtrados.map(e => {
                                    const operando = e.status === 'EM_OPERACAO';
                                    return (
                                        <tr
                                            key={e.id}
                                            className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                            onClick={() => setAberto(e)}
                                        >
                                            {v.includes('code') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{e.code || '—'}</td>}
                                            {v.includes('name') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{e.name}</td>}
                                            {v.includes('cnpj') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                    {e.condominio_cnpj || <span className="text-gray-400">Não informado</span>}
                                                </td>
                                            )}
                                            {v.includes('cidade') && <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{e.endereco_city || '—'}</td>}
                                            {v.includes('situacao') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    <span className={`text-sm font-normal ${operando ? 'text-teal-600' : 'text-emerald-600'}`}>
                                                        {operando ? 'Em operação' : 'Entregue'}
                                                    </span>
                                                </td>
                                            )}
                                            {v.includes('actions') && (
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5" onClick={ev => ev.stopPropagation()}>
                                                        {!operando && (
                                                            <button
                                                                onClick={() => colocarEmOperacao(e)}
                                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                            >
                                                                Colocar em operação
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setAberto(e)}
                                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                                                        >
                                                            Abrir
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <Wrench className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default CondominiosModule;
