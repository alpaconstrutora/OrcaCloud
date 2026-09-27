import React from 'react';
import { AlertTriangle, ClipboardList, Hourglass, PackageCheck, Plus, Wallet } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import TabsBar, { TabsBarItem } from '../ui/TabsBar';
import { KpiCard } from '../ui/KpiCard';
import { usePersistedState } from '../ui/TableUtils';
import { formatMoney, formatDateBR } from '../ui/Format';
import { useToast } from '../../hooks/useToast';
import { useOrgContext } from '../../hooks/useOrgContext';
import { purchaseRequestService } from '../../services/purchaseRequestService';
import type { PurchaseRequest, PurchaseRequestDisplayStatus } from '../../types/purchaseRequest';
import {
    STATUS_LABEL, STATUS_TEXT_CLASS, itensConvertiveis, motivoNaoEditar, statusDaSolicitacao, totalDoItem,
} from '../../utils/solicitacaoCompra';
import SolicitacaoCompraForm from './SolicitacaoCompraForm';
import SolicitacaoCompraSheet from './SolicitacaoCompraSheet';

/**
 * Suprimentos › Solicitações de Compra — lista + formulário in-flow + detalhe
 * lateral. Plano: docs/planos/2026-09-26-suprimentos-solicitacoes-compra.md (item 10).
 *
 * Leitura pela organização do topo (`null` = "Todas", a RLS recorta — REGRA #5).
 * Status é DERIVADO (`statusDaSolicitacao`): as abas filtram no cliente.
 */

type Aba = 'todas' | PurchaseRequestDisplayStatus;

const ABAS: { id: Aba; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'rascunho', label: 'Rascunho' },
    { id: 'em_aprovacao', label: 'Em aprovação' },
    { id: 'aprovada', label: 'Aprovadas' },
    { id: 'em_atendimento', label: 'Em atendimento' },
    { id: 'atendida', label: 'Atendidas' },
    { id: 'reprovada', label: 'Reprovadas' },
    { id: 'cancelada', label: 'Canceladas' },
];

const COLUMNS: StandardTableColumn[] = [
    { key: 'number', label: 'Número', sortable: true, width: 160 },
    { key: 'obra', label: 'Obra', sortable: true, width: 200 },
    { key: 'title', label: 'Título', sortable: true, width: 280 },
    { key: 'solicitante', label: 'Solicitante', sortable: true, width: 180 },
    { key: 'needDate', label: 'Necessidade', sortable: true, width: 120 },
    { key: 'itens', label: 'Itens', sortable: true, width: 80, align: 'right' },
    { key: 'valor', label: 'Valor estimado', sortable: true, width: 140, align: 'right' },
    { key: 'status', label: 'Status', sortable: true, width: 140 },
];

/**
 * Pedido de abertura vindo de OUTRA tela (Plano de Aquisições › "Gerar
 * solicitação"): a navegação do app é estado, não URL, então o id atravessa
 * por sessionStorage e é consumido uma vez na montagem desta tela.
 */
const CHAVE_ABRIR = 'suprimentos:sc:abrir-edicao';
export function pedirEdicaoDaSolicitacao(id: string) {
    try { sessionStorage.setItem(CHAVE_ABRIR, id); } catch { /* sem storage: abre na lista */ }
}

type Modo = { tipo: 'lista' } | { tipo: 'form'; id: string | null };

interface Props {
    onOpenQuotation: (id: string) => void;
    onOpenOrder: (id: string) => void;
}

const SolicitacoesCompraList: React.FC<Props> = ({ onOpenQuotation, onOpenOrder }) => {
    const { orgId } = useOrgContext();
    const { showToast } = useToast();
    const [lista, setLista] = React.useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [aba, setAba] = usePersistedState<Aba>('suprimentos:sc:aba', 'todas');
    const [modo, setModo] = React.useState<Modo>(() => {
        try {
            const id = sessionStorage.getItem(CHAVE_ABRIR);
            if (id) { sessionStorage.removeItem(CHAVE_ABRIR); return { tipo: 'form', id }; }
        } catch { /* ignore */ }
        return { tipo: 'lista' };
    });
    const [abertaId, setAbertaId] = React.useState<string | null>(null);

    const carregar = React.useCallback(async () => {
        setLoading(true);
        try {
            setLista(await purchaseRequestService.list(orgId));
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Falha ao carregar as solicitações.', 'error');
        } finally {
            setLoading(false);
        }
    }, [orgId, showToast]);

    React.useEffect(() => { carregar(); }, [carregar]);

    // §22: atualiza a linha local em vez de recarregar tudo.
    const aplicar = React.useCallback((sc: PurchaseRequest | null, id: string) => {
        setLista(prev => {
            if (!sc) return prev.filter(x => x.id !== id);
            if (orgId && sc.organizationId !== orgId) return prev.filter(x => x.id !== id);
            return prev.some(x => x.id === id) ? prev.map(x => (x.id === id ? sc : x)) : [sc, ...prev];
        });
    }, [orgId]);

    const comStatus = React.useMemo(() => lista.map(sc => ({ sc, status: statusDaSolicitacao(sc) })), [lista]);
    const linhas = React.useMemo(
        () => comStatus.filter(r => aba === 'todas' || r.status === aba).map(r => r.sc),
        [comStatus, aba],
    );
    const contagem = React.useMemo(() => {
        const c: Record<string, number> = { todas: comStatus.length };
        comStatus.forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1; });
        return c;
    }, [comStatus]);

    // KPIs do RECORTE da aba ativa (por isso vêm depois das abas — ANATOMIA do guia).
    const kpi = React.useMemo(() => {
        const aAtender = linhas.flatMap(sc => itensConvertiveis(sc));
        return {
            qtd: linhas.length,
            valor: linhas.reduce((s, sc) => s + sc.estimatedTotal, 0),
            itensAAtender: aAtender.length,
            valorAAtender: aAtender.reduce((s, i) => s + totalDoItem(i), 0),
            urgentes: linhas.filter(sc => sc.priority === 'urgente' && !sc.cancelledAt).length,
            emAprovacao: linhas.filter(sc => sc.approvalStatus === 'PENDENTE' && !sc.cancelledAt).length,
        };
    }, [linhas]);

    const tabs: TabsBarItem<Aba>[] = ABAS.map(a => ({ ...a, badge: contagem[a.id] ?? 0 }));

    if (modo.tipo === 'form') {
        return (
            <SolicitacaoCompraForm
                key={modo.id ?? 'nova'}
                editingId={modo.id}
                onBack={() => setModo({ tipo: 'lista' })}
                onSaved={(sc, info) => {
                    aplicar(sc, sc.id);
                    if (info.created || info.submitted) {
                        setModo({ tipo: 'lista' });
                        setAbertaId(sc.id);
                    }
                }}
            />
        );
    }

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Solicitações de Compra</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    O que as obras precisam comprar: aprovação por alçada e atendimento por cotação ou pedido.
                </p>
            </div>

            <TabsBar tabs={tabs} value={aba} onChange={setAba}>
                <button
                    onClick={() => setModo({ tipo: 'form', id: null })}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Nova solicitação
                </button>
            </TabsBar>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Solicitações" value={kpi.qtd} sub={formatMoney(kpi.valor)} icon={<ClipboardList className="w-4 h-4" />} color="blue" />
                <KpiCard label="Em aprovação" value={kpi.emAprovacao} icon={<Hourglass className="w-4 h-4" />} color="amber" />
                <KpiCard label="Itens a atender" value={kpi.itensAAtender} sub={formatMoney(kpi.valorAAtender)} icon={<PackageCheck className="w-4 h-4" />} color="indigo" />
                <KpiCard label="Urgentes" value={kpi.urgentes} icon={<AlertTriangle className="w-4 h-4" />} color="red" />
            </div>

            <StandardTable<PurchaseRequest>
                storageKey="suprimentos:sc:lista"
                columns={COLUMNS}
                rows={linhas}
                rowKey={sc => sc.id}
                loading={loading}
                pagination={{ defaultPageSize: 100 }}
                searchText={sc => `${sc.number ?? ''} ${sc.title} ${sc.projectName ?? ''} ${sc.requestedByName ?? ''} ${sc.requestedByEmail ?? ''}`}
                searchPlaceholder="Buscar por número, título, obra ou solicitante..."
                onRowClick={sc => setAbertaId(sc.id)}
                sortValue={(k, sc) => {
                    switch (k) {
                        case 'number': return sc.number ?? '';
                        case 'obra': return sc.projectName ?? '';
                        case 'title': return sc.title;
                        case 'solicitante': return sc.requestedByName ?? sc.requestedByEmail ?? '';
                        case 'needDate': return sc.needDate ?? '';
                        case 'itens': return sc.items.length;
                        case 'valor': return sc.estimatedTotal;
                        case 'status': return STATUS_LABEL[statusDaSolicitacao(sc)];
                        default: return '';
                    }
                }}
                renderCell={(k, sc) => {
                    switch (k) {
                        case 'number':
                            return <span className="text-sm font-normal text-gray-600">{sc.number ?? '—'}</span>;
                        case 'obra':
                            return <span className="block truncate text-sm font-normal text-gray-700" title={sc.projectName}>{sc.projectName ?? '—'}</span>;
                        case 'title':
                            return (
                                <span className="block truncate text-sm font-normal text-gray-700" title={sc.title}>
                                    {sc.priority === 'urgente' && <span className="text-red-600">Urgente · </span>}
                                    {sc.title}
                                </span>
                            );
                        case 'solicitante': {
                            const quem = sc.requestedByName ?? sc.requestedByEmail ?? '—';
                            return <span className="block truncate text-sm font-normal text-gray-700" title={quem}>{quem}</span>;
                        }
                        case 'needDate':
                            return <span className="text-sm font-normal text-gray-600">{sc.needDate ? formatDateBR(sc.needDate) : '—'}</span>;
                        case 'itens':
                            return <span className="text-sm font-normal text-gray-600">{sc.items.filter(i => !i.cancelledAt).length}</span>;
                        case 'valor':
                            return <span className="text-sm font-medium text-gray-800">{formatMoney(sc.estimatedTotal)}</span>;
                        case 'status': {
                            const st = statusDaSolicitacao(sc);
                            return <span className={`text-sm font-normal ${STATUS_TEXT_CLASS[st]}`}>{STATUS_LABEL[st]}</span>;
                        }
                        default: return null;
                    }
                }}
                actions={{
                    width: 100,
                    render: sc => (
                        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                            {!motivoNaoEditar(sc) && <ActionIconButton kind="edit" title="Editar solicitação" onClick={() => setModo({ tipo: 'form', id: sc.id })} />}
                            <ActionIconButton kind="view" title="Ver detalhes" onClick={() => setAbertaId(sc.id)} />
                        </div>
                    ),
                }}
                empty={{
                    icon: <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: aba === 'todas' ? 'Nenhuma solicitação ainda' : `Nenhuma solicitação ${STATUS_LABEL[aba as PurchaseRequestDisplayStatus].toLowerCase()}`,
                    subtitle: aba === 'todas' ? 'Crie a primeira em "Nova solicitação".' : 'Troque de aba ou ajuste a busca.',
                }}
            />

            <SolicitacaoCompraSheet
                requestId={abertaId}
                onClose={() => setAbertaId(null)}
                onEdit={id => { setAbertaId(null); setModo({ tipo: 'form', id }); }}
                onChanged={aplicar}
                onOpenQuotation={id => { setAbertaId(null); onOpenQuotation(id); }}
                onOpenOrder={id => { setAbertaId(null); onOpenOrder(id); }}
            />
        </div>
    );
};

export default SolicitacoesCompraList;
