import React from 'react';
import { AlertCircle, Landmark, Percent, Plus, RefreshCw, Search, TrendingDown, Wallet } from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { formatMoney, formatDateBR } from '../ui/Format';
import { useConfirm } from '../ui/confirm';
import ActionIconButton from '../ui/ActionIconButton';
import { useOrgContext, useOrgWriteTarget, errorMessage } from '../../hooks/useOrgContext';
import { debtService } from '../../services/debtService';
import { companyService } from '../../services/companyService';
import { supplierService } from '../../services/supplierService';
import {
    DEBT_MODALITY_PT,
    DEBT_STATUS_PT,
    type DebtContract,
    type DebtContractInput,
} from '../../types/debt';
import type { Company } from '../../types/company';
import type { Supplier } from '../../types/users';
import DebtForm from './DebtForm';
import DebtDetail from './DebtDetail';
import DebtDashboard from './DebtDashboard';

type ModuleView = 'contratos' | 'posicao';

/**
 * §19.1: o `<h1>` muda junto com a aba. Aba que troca o conteúdo inteiro sem
 * trocar o título deixa o cabeçalho mentindo.
 */
const VIEW_HEADERS: Record<ModuleView, { titulo: string; subtitulo: string }> = {
    contratos: {
        titulo: 'Dívidas e Financiamentos',
        subtitulo: 'Contratos de crédito da holding, das empresas e das SPEs — cronograma, saldo devedor e custo financeiro.',
    },
    posicao: {
        titulo: 'Posição da Dívida',
        subtitulo: 'Endividamento consolidado — saldo, serviço, exposição por instituição e custo médio.',
    },
};

const COLUMNS: ColumnConfig[] = [
    { key: 'numero', label: 'Contrato', sortable: true },
    { key: 'instituicao', label: 'Instituição', sortable: true },
    { key: 'empresa', label: 'Empresa / SPE', sortable: true },
    { key: 'modalidade', label: 'Modalidade', sortable: true },
    { key: 'contratado', label: 'Contratado', sortable: true },
    { key: 'liberado', label: 'Liberado', sortable: true },
    { key: 'taxa', label: 'Taxa', sortable: true },
    { key: 'vencimento', label: 'Vencimento final', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const STATUS_COR: Record<string, string> = {
    ADIMPLENTE: 'text-green-700',
    LIBERADO: 'text-blue-700',
    CONTRATADO: 'text-blue-700',
    EM_NEGOCIACAO: 'text-yellow-700',
    EM_CARENCIA: 'text-indigo-700',
    INADIMPLENTE: 'text-red-600',
    RENEGOCIADO: 'text-indigo-700',
    LIQUIDADO: 'text-gray-500',
    CANCELADO: 'text-gray-500',
};

// §8 — texto colorido simples, sem pílula/fundo/uppercase.
const StatusBadge = ({ status }: { status: string }) => (
    <span className={`text-sm font-normal ${STATUS_COR[status] ?? 'text-gray-600'}`}>
        {DEBT_STATUS_PT[status as keyof typeof DEBT_STATUS_PT] ?? status}
    </span>
);

/** Taxa exibida junto do indexador — "CDI + 2,5% a.m." lê melhor que dois campos. */
function taxaLabel(c: DebtContract): string {
    const periodo = c.ratePeriod === 'MENSAL' ? 'a.m.' : 'a.a.';
    const base = `${c.nominalRate.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}% ${periodo}`;
    if (!c.indexName) return base;
    const pct = c.indexPct && c.indexPct !== 100 ? ` ${c.indexPct}%` : '';
    return `${c.indexName}${pct} + ${base}`;
}

export default function DebtModule() {
    // REGRA #5 — `orgId` null é "Todas"; não bloqueia leitura.
    const { orgId } = useOrgContext();
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const confirm = useConfirm();

    const [contratos, setContratos] = React.useState<DebtContract[]>([]);
    const [companies, setCompanies] = React.useState<Company[]>([]);
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);

    const [searchTerm, setSearchTerm] = usePersistedState<string>('dividas:search', '');
    const tableColumns = useTableColumns(COLUMNS, 'dividasColumns');

    const [moduleView, setModuleView] = usePersistedState<ModuleView>('dividas:view', 'contratos');
    const [formAberto, setFormAberto] = React.useState(false);
    const [editando, setEditando] = React.useState<DebtContract | undefined>(undefined);
    const [detalhe, setDetalhe] = React.useState<DebtContract | null>(null);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const [lista, emps, forns] = await Promise.all([
                debtService.listContracts(orgId),
                companyService.list(orgId),
                supplierService.listSuppliers(orgId ?? undefined),
            ]);
            setContratos(lista);
            setCompanies(emps);
            setSuppliers(forns as Supplier[]);
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível carregar os contratos de dívida.'));
        } finally {
            setCarregando(false);
        }
    }, [orgId]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const kpis = React.useMemo(() => {
        // `consolidateMirrors` descarta a perna CREDORA do mútuo intercompany:
        // sem isso o mútuo entra duas vezes na dívida do grupo — uma como
        // passivo da devedora, outra como crédito da credora.
        const vivos = debtService
            .consolidateMirrors(contratos)
            .filter(c => !['LIQUIDADO', 'CANCELADO'].includes(c.status));
        const liberado = vivos.reduce((a, c) => a + c.principalReleased, 0);
        // Custo médio ponderado pelo saldo liberado — a média simples esconde o
        // contrato grande e caro atrás de vários pequenos e baratos.
        const ponderada = liberado > 0
            ? vivos.reduce((a, c) => a + c.nominalRate * (c.ratePeriod === 'ANUAL' ? 1 / 12 : 1) * c.principalReleased, 0) / liberado
            : 0;
        return {
            total: vivos.length,
            contratado: vivos.reduce((a, c) => a + c.principalContracted, 0),
            liberado,
            custoMedio: ponderada,
            inadimplentes: vivos.filter(c => c.status === 'INADIMPLENTE').length,
        };
    }, [contratos]);

    const filtrados = React.useMemo(() => {
        const termo = searchTerm.trim().toLowerCase();
        const base = termo
            ? contratos.filter(c =>
                  [c.contractNumber, c.institutionName, c.companyName, DEBT_MODALITY_PT[c.modality], c.purpose]
                      .some(v => v?.toLowerCase().includes(termo)),
              )
            : contratos;

        const valor = (c: DebtContract, key: string): string | number => {
            switch (key) {
                case 'numero': return c.contractNumber ?? '';
                case 'instituicao': return c.institutionName ?? '';
                case 'empresa': return c.companyName ?? '';
                case 'modalidade': return DEBT_MODALITY_PT[c.modality];
                case 'contratado': return c.principalContracted;
                case 'liberado': return c.principalReleased;
                case 'taxa': return c.nominalRate;
                case 'vencimento': return c.finalDueDate ?? '';
                case 'status': return DEBT_STATUS_PT[c.status];
                default: return '';
            }
        };

        return [...base].sort((a, b) => {
            if (tableColumns.sortColumn) {
                const va = valor(a, tableColumns.sortColumn);
                const vb = valor(b, tableColumns.sortColumn);
                const cmp = typeof va === 'number' && typeof vb === 'number'
                    ? va - vb
                    : String(va).localeCompare(String(vb), 'pt-BR');
                return tableColumns.sortDirection === 'desc' ? -cmp : cmp;
            }
            // §6.4 — o fallback vive dentro do sort, não num dropdown "Ordenar por".
            return (b.signedAt ?? '').localeCompare(a.signedAt ?? '');
        });
    }, [contratos, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection]);

    const abrirNovo = () => { setEditando(undefined); setFormAberto(true); };
    const abrirEdicao = (c: DebtContract) => { setEditando(c); setFormAberto(true); };

    const salvar = async (input: DebtContractInput) => {
        if (editando) {
            const atualizado = await debtService.updateContract(editando.id, input);
            // §22 — atualiza o array local, não recarrega a tabela inteira.
            setContratos(prev => prev.map(c => (c.id === atualizado.id ? atualizado : c)));
            setEditando(atualizado);
            if (detalhe?.id === atualizado.id) setDetalhe(atualizado);
            return;
        }
        // 'single': um contrato de dívida pertence a UMA organização — replicar
        // em todas criaria dívidas fantasma (REGRA #5, exceção do item 4).
        const alvo = await resolveWriteOrg('single');
        if (!alvo || alvo.kind !== 'org') return;

        // Mútuo entre empresas do grupo nasce com as DUAS pernas de uma vez
        // (decisão do usuário 2026-08-29): passivo na devedora, crédito na
        // credora. Cadastro manual dos dois lados é o caminho conhecido para
        // dois saldos que deveriam bater e não batem.
        if (input.counterpartyKind === 'PARTE_RELACIONADA' && input.relatedCompanyId) {
            const { devedora, credora } = await debtService.createIntercompanyMirror(alvo.orgId, input);
            setContratos(prev => [devedora, credora, ...prev]);
            return;
        }

        const criado = await debtService.createContract(alvo.orgId, input);
        setContratos(prev => [criado, ...prev]);
    };

    const excluir = async (c: DebtContract) => {
        const ok = await confirm({
            title: 'Excluir contrato de dívida?',
            message: 'O cronograma, as liberações e o rateio deste contrato também serão excluídos. Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await debtService.removeContract(c.id);
            setContratos(prev => prev.filter(x => x.id !== c.id));
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível excluir o contrato.'));
        }
    };

    if (detalhe) {
        return (
            <>
                <DebtDetail
                    contract={detalhe}
                    onBack={() => setDetalhe(null)}
                    onEdit={() => abrirEdicao(detalhe)}
                    onChanged={c => setContratos(prev => prev.map(x => (x.id === c.id ? c : x)))}
                />
                <DebtForm
                    open={formAberto}
                    onClose={() => setFormAberto(false)}
                    contract={editando}
                    companies={companies}
                    suppliers={suppliers}
                    onSave={salvar}
                />
                {orgTargetModal}
            </>
        );
    }

    const th = 'px-6 py-2 border-r border-gray-100';

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{VIEW_HEADERS[moduleView].titulo}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{VIEW_HEADERS[moduleView].subtitulo}</p>
            </div>

            {/* Abas — §19.1, antes dos KPIs: os números refletem a aba ativa. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {([['contratos', 'Contratos'], ['posicao', 'Posição consolidada']] as [ModuleView, string][]).map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setModuleView(id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                moduleView === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {moduleView === 'posicao' ? <DebtDashboard /> : (<>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-3">
                <KpiCard label="Operações ativas" value={kpis.total} icon={<Landmark className="w-5 h-5" />} color="blue" />
                <KpiCard label="Valor contratado" value={formatMoney(kpis.contratado)} icon={<Wallet className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Valor liberado" value={formatMoney(kpis.liberado)} icon={<TrendingDown className="w-5 h-5" />} color="violet" />
                <KpiCard
                    label="Custo médio"
                    value={`${kpis.custoMedio.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.m.`}
                    sub="Ponderado pelo valor liberado"
                    icon={<Percent className="w-5 h-5" />}
                    color="amber"
                />
                <KpiCard label="Inadimplentes" value={kpis.inadimplentes} icon={<AlertCircle className="w-5 h-5" />} color="red" />
            </div>

            {/* §5.3 — ação primária na barra de escopo, não solta ao lado do h1. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <p className="text-sm font-normal text-gray-500 px-1">
                    {filtrados.length} contrato{filtrados.length === 1 ? '' : 's'}
                </p>
                <button
                    onClick={abrirNovo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Novo contrato
                </button>
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>
            )}

            {/* §5.2 — toolbar acoplada à tabela, um card só. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por contrato, instituição, empresa ou modalidade..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={() => void carregar()}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
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

                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum contrato de dívida</h3>
                        <p className="text-sm text-gray-500">
                            {searchTerm ? 'Tente ajustar sua busca.' : 'Cadastre o primeiro financiamento para ver saldo, cronograma e custo financeiro.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.visibleColumns.includes('numero') && (
                                        <SortableHeader colKey="numero" label="Contrato" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={th} />
                                    )}
                                    {tableColumns.visibleColumns.includes('instituicao') && (
                                        <SortableHeader colKey="instituicao" label="Instituição" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={th} />
                                    )}
                                    {tableColumns.visibleColumns.includes('empresa') && (
                                        <SortableHeader colKey="empresa" label="Empresa / SPE" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={th} />
                                    )}
                                    {tableColumns.visibleColumns.includes('modalidade') && (
                                        <SortableHeader colKey="modalidade" label="Modalidade" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={th} />
                                    )}
                                    {tableColumns.visibleColumns.includes('contratado') && (
                                        <SortableHeader colKey="contratado" label="Contratado" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={`${th} text-right`} />
                                    )}
                                    {tableColumns.visibleColumns.includes('liberado') && (
                                        <SortableHeader colKey="liberado" label="Liberado" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={`${th} text-right`} />
                                    )}
                                    {tableColumns.visibleColumns.includes('taxa') && (
                                        <SortableHeader colKey="taxa" label="Taxa" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={`${th} text-right`} />
                                    )}
                                    {tableColumns.visibleColumns.includes('vencimento') && (
                                        <SortableHeader colKey="vencimento" label="Vencimento final" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={`${th} text-center`} />
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader colKey="status" label="Status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className={`${th} text-center`} />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtrados.map(c => (
                                    <tr
                                        key={c.id}
                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                        onClick={() => setDetalhe(c)}
                                    >
                                        {tableColumns.visibleColumns.includes('numero') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                <span className="block truncate" title={c.contractNumber ?? ''}>{c.contractNumber || '—'}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('instituicao') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                <span className="block truncate" title={c.institutionName ?? ''}>{c.institutionName || '—'}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('empresa') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                <span className="block truncate" title={c.companyName ?? ''}>{c.companyName || '—'}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('modalidade') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                <span className="block truncate" title={DEBT_MODALITY_PT[c.modality]}>{DEBT_MODALITY_PT[c.modality]}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('contratado') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800 text-right">{formatMoney(c.principalContracted)}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('liberado') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800 text-right">{formatMoney(c.principalReleased)}</td>
                                        )}
                                        {tableColumns.visibleColumns.includes('taxa') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 text-right">
                                                <span className="block truncate" title={taxaLabel(c)}>{taxaLabel(c)}</span>
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('vencimento') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 text-center">
                                                {c.finalDueDate ? formatDateBR(c.finalDueDate) : '—'}
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('status') && (
                                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
                                                <StatusBadge status={c.status} />
                                            </td>
                                        )}
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                {/* §9.1 — clicar na linha já abre o detalhe; a coluna fica com
                                                    o que NÃO é a ação dominante. */}
                                                <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                    <ActionIconButton kind="edit" onClick={() => abrirEdicao(c)} />
                                                    <ActionIconButton kind="delete" onClick={() => void excluir(c)} />
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

            </>)}

            <DebtForm
                open={formAberto}
                onClose={() => setFormAberto(false)}
                contract={editando}
                companies={companies}
                suppliers={suppliers}
                onSave={salvar}
            />
            {orgTargetModal}
        </div>
    );
}
