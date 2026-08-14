// components/condominio/CondominiosModule.tsx
// Comercial › Condomínios — ÒPURA Pós-Entrega.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A lista NÃO é de uma tabela nova: são os `empreendimentos` no estado
// EM_OPERACAO.
//
// NEM TODO EMPREENDIMENTO VIRA CONDOMÍNIO — um empreendimento de serviço, por
// exemplo, nunca terá. Por isso a lista mostra só os que JÁ foram trazidos, e
// trazer é uma ação explícita ("Importar empreendimento"). A versão anterior
// exibia todo empreendimento ENTREGUE como candidato, o que enchia a tela de
// prédios que nunca serão condomínio e obrigava o usuário a ignorá-los sempre.
import React from 'react';
import { Building2, Search, RefreshCw, Download, Users, Wrench, Undo2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import ActionIconButton from '../ui/ActionIconButton';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { useConfirm } from '../ui/confirm';
import CondominioDetail from './CondominioDetail';
import { empreendimentoService } from '../../services/empreendimentoService';
import { useOrgContext } from '../../hooks/useOrgContext';
import type { Empreendimento } from '../../types/empreendimento';

/** Rótulo do estágio do empreendimento no painel de importação. */
const STATUS_LABEL: Record<string, string> = {
    PLANEJAMENTO: 'Planejamento',
    LANCAMENTO: 'Lançamento',
    EM_OBRAS: 'Em obras',
    ENTREGUE: 'Entregue',
    EM_OPERACAO: 'Em operação',
    ENCERRADO: 'Encerrado',
};

const COLUMNS: ColumnConfig[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Condomínio', sortable: true },
    { key: 'cnpj', label: 'CNPJ do condomínio', sortable: true },
    { key: 'cidade', label: 'Cidade', sortable: true },
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
    const [importOpen, setImportOpen] = React.useState(false);
    const [importando, setImportando] = React.useState(false);
    const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            // Carrega tudo: a tabela mostra só os condomínios, e o painel de
            // importação precisa dos demais para você escolher quais trazer.
            setTodos(await empreendimentoService.list(orgId || undefined));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar os condomínios.');
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    React.useEffect(() => { carregar(); }, [carregar]);

    /** A tabela: só o que JÁ é condomínio. */
    const emOperacao = React.useMemo(() => todos.filter(e => e.status === 'EM_OPERACAO'), [todos]);
    /**
     * O painel de importação: tudo que ainda não é condomínio e não está
     * encerrado. Inclui empreendimentos EM_OBRAS de propósito — dá para
     * preparar o condomínio antes da entrega; e exclui os que nunca terão
     * (serviço, por exemplo) só por você não marcá-los.
     */
    const disponiveis = React.useMemo(
        () => todos.filter(e => e.status !== 'EM_OPERACAO' && e.status !== 'ENCERRADO'),
        [todos],
    );

    const filtrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        const base = t
            ? emOperacao.filter(e =>
                e.name.toLowerCase().includes(t)
                || (e.code || '').toLowerCase().includes(t)
                || (e.condominio_cnpj || '').toLowerCase().includes(t)
                || (e.endereco_city || '').toLowerCase().includes(t))
            : emOperacao;

        const valor = (e: Empreendimento, col: string): string => {
            switch (col) {
                case 'code': return e.code || '';
                case 'name': return e.name;
                case 'cnpj': return e.condominio_cnpj || '';
                case 'cidade': return e.endereco_city || '';
                default: return '';
            }
        };

        return [...base].sort((a, b) => {
            if (tableColumns.sortColumn) {
                const cmp = valor(a, tableColumns.sortColumn).localeCompare(valor(b, tableColumns.sortColumn), 'pt-BR');
                return tableColumns.sortDirection === 'desc' ? -cmp : cmp;
            }
            return a.name.localeCompare(b.name, 'pt-BR');
        });
    }, [emOperacao, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const abrirImportacao = () => {
        setSelecionados(new Set());
        setImportOpen(true);
    };

    const alternar = (id: string) => {
        setSelecionados(prev => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id); else s.add(id);
            return s;
        });
    };

    /**
     * Trazer o empreendimento para Condomínios é mudá-lo para EM_OPERACAO — não
     * há cópia de torres nem de unidades: é o mesmo registro, agora também
     * operado. Por isso a ação é reversível e não destrói nada.
     */
    const importar = async () => {
        if (selecionados.size === 0) return;
        setImportando(true);
        const alvos = disponiveis.filter(e => selecionados.has(e.id));
        const atualizados: Empreendimento[] = [];
        const erros: string[] = [];

        // Um a um: um lote único faria a primeira falha derrubar os demais.
        for (const e of alvos) {
            try {
                atualizados.push(await empreendimentoService.update(e.id, { status: 'EM_OPERACAO' } as any));
            } catch (err: any) {
                erros.push(`${e.name}: ${err?.message || 'erro'}`);
            }
        }

        // §22 — costura no array local em vez de recarregar a lista inteira.
        setTodos(prev => prev.map(x => atualizados.find(a => a.id === x.id) || x));
        setImportOpen(false);
        setImportando(false);
        notify(
            erros.length > 0
                ? `${atualizados.length} importado(s). ${erros[0]}`
                : `${atualizados.length} empreendimento(s) agora são condomínios.`,
            erros.length > 0 ? 'error' : 'success',
        );
    };

    const removerDeCondominios = async (e: Empreendimento) => {
        const ok = await confirm({
            title: 'Tirar de Condomínios?',
            message: `${e.name} volta para Entregue e sai desta lista. Nada é apagado — ocupações, plano de manutenção e ordens continuam gravados, e reaparecem se você importá-lo de novo.`,
            variant: 'warning',
            confirmLabel: 'Tirar da lista',
        });
        if (!ok) return;
        try {
            const atualizado = await empreendimentoService.update(e.id, { status: 'ENTREGUE' } as any);
            setTodos(prev => prev.map(x => (x.id === e.id ? atualizado : x)));
            notify(`${e.name} saiu de Condomínios.`);
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
                <KpiCard label="CONDOMÍNIOS" value={emOperacao.length} icon={<Building2 className="w-5 h-5" />} color="teal" />
                <KpiCard
                    label="EMPREENDIMENTOS DISPONÍVEIS"
                    value={disponiveis.length}
                    sub="Nem todos viram condomínio — você escolhe"
                    icon={<Download className="w-5 h-5" />}
                    color="gray"
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

                        {/* Ação primária — §17, variante compacta */}
                        <button
                            onClick={abrirImportacao}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap"
                        >
                            <Download className="w-[15px] h-[15px]" />
                            Importar empreendimento
                        </button>
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
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum condomínio ainda</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            Um condomínio não é cadastro à parte: é um empreendimento que você traz para cá.
                            Use <span className="font-medium">Importar empreendimento</span> e escolha quais —
                            nem todo empreendimento vira condomínio.
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
                                    {v.includes('actions') && <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtrados.map(e => (
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
                                            {v.includes('actions') && (
                                                /* §9.1 — o clique na linha JÁ abre o condomínio, que é a
                                                   ação dominante e inequívoca. Repeti-la como botão
                                                   "Abrir" é o que o guia proíbe. Sobra na coluna só o
                                                   que o clique não faz: tirar da lista. */
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5" onClick={ev => ev.stopPropagation()}>
                                                        <ActionIconButton
                                                            kind="delete"
                                                            title="Tirar de Condomínios"
                                                            icon={<Undo2 className="w-4 h-4" />}
                                                            onClick={() => removerDeCondominios(e)}
                                                        />
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

            {/* Importar empreendimento — trazer para Condomínios é mudar o estado
                para EM_OPERACAO. NÃO há cópia de torres nem de unidades: é o mesmo
                registro, agora também operado. Por isso é reversível. */}
            <Sheet open={importOpen} onClose={() => setImportOpen(false)} size="xl">
                <SheetHeader onClose={() => setImportOpen(false)}>
                    <SheetTitle>Importar empreendimento</SheetTitle>
                    <SheetDescription>
                        Escolha quais viram condomínio. Nada é copiado — é o mesmo empreendimento, agora também operado.
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    {disponiveis.length === 0 ? (
                        <div className="text-center py-12">
                            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum empreendimento disponível</h3>
                            <p className="text-sm text-gray-500 max-w-md mx-auto">
                                Todos os empreendimentos já são condomínios, ou estão encerrados.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-xs text-gray-400 mb-3">
                                Empreendimento de serviço, ou qualquer outro que não tenha condomínio,
                                é só não marcar — ele continua onde está.
                            </p>
                            {disponiveis.map(e => (
                                <label
                                    key={e.id}
                                    className={`flex items-start gap-3 p-3 rounded-[10px] border transition-all cursor-pointer ${
                                        selecionados.has(e.id) ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selecionados.has(e.id)}
                                        onChange={() => alternar(e.id)}
                                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium text-gray-800">{e.name}</span>
                                            {e.code && <span className="text-xs text-gray-400">{e.code}</span>}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {STATUS_LABEL[e.status] || e.status}
                                            {e.endereco_city ? ` · ${e.endereco_city}` : ''}
                                            {e.tipo ? ` · ${e.tipo}` : ''}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}
                </SheetPanel>
                <SheetFooter>
                    <button
                        onClick={() => setImportOpen(false)}
                        className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={importar}
                        disabled={importando || selecionados.size === 0}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {importando ? 'Importando...' : `Importar ${selecionados.size} empreendimento(s)`}
                    </button>
                </SheetFooter>
            </Sheet>

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
