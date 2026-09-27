import React from 'react';
import { CheckCircle2, FileSearch, Loader2, Pencil, Send, ShoppingCart, XCircle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { formatMoney, formatDateBR, formatDateTimeBR } from '../ui/Format';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import SupplierSelect from '../SupplierSelect';
import { purchaseRequestService } from '../../services/purchaseRequestService';
import { supplierService } from '../../services/supplierService';
import type { PurchaseRequest, PurchaseRequestItem } from '../../types/purchaseRequest';
import {
    STATUS_LABEL, STATUS_TEXT_CLASS, itemAtendido, itemAtivo, itensConvertiveis, motivoNaoCancelar,
    motivoNaoConverter, motivoNaoDecidir, motivoNaoEditar, motivoNaoEnviar, motivoNaoExcluir,
    situacaoDoItem, statusDaSolicitacao, totalDoItem,
} from '../../utils/solicitacaoCompra';

/**
 * Suprimentos › Solicitações de Compra — detalhe lateral: ver, aprovar /
 * reprovar, cancelar e CONVERTER em cotação ou pedido ("revisar fila =
 * lista + lateral", UI_PATTERNS §3). Editar abre a tela in-flow.
 * Plano: docs/planos/2026-09-26-suprimentos-solicitacoes-compra.md (item 13).
 */

const ITEM_COLUMNS: StandardTableColumn[] = [
    { key: 'description', label: 'Descrição', sortable: true, width: 240 },
    { key: 'quantity', label: 'Qtd', sortable: true, width: 90, align: 'right' },
    { key: 'unit', label: 'Un', sortable: true, width: 60 },
    { key: 'price', label: 'Preço est.', sortable: true, width: 110, align: 'right' },
    { key: 'total', label: 'Total', sortable: true, width: 110, align: 'right' },
    { key: 'situacao', label: 'Atendimento', sortable: true, width: 160 },
];

type Pergunta = { tipo: 'reprovar' | 'cancelar'; texto: string } | null;

interface Props {
    requestId: string | null;
    onClose: () => void;
    onEdit: (id: string) => void;
    /** Registro atualizado — ou `null` com o id quando foi excluído. */
    onChanged: (sc: PurchaseRequest | null, id: string) => void;
    onOpenQuotation: (id: string) => void;
    onOpenOrder: (id: string) => void;
}

const Campo: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <div className="text-sm font-normal text-gray-800">{children}</div>
    </div>
);

const SolicitacaoCompraSheet: React.FC<Props> = ({ requestId, onClose, onEdit, onChanged, onOpenQuotation, onOpenOrder }) => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const email = useStore(s => s.session?.user?.email) ?? '';

    const [sc, setSc] = React.useState<PurchaseRequest | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [pergunta, setPergunta] = React.useState<Pergunta>(null);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [suppliers, setSuppliers] = React.useState<{ id: string; name: string }[]>([]);
    const [supplierId, setSupplierId] = React.useState('');

    React.useEffect(() => {
        setPergunta(null); setSelected(new Set()); setSupplierId('');
        if (!requestId) { setSc(null); return; }
        let cancelled = false;
        setLoading(true);
        purchaseRequestService.get(requestId)
            .then(r => { if (!cancelled) setSc(r); })
            .catch(err => showToast(err instanceof Error ? err.message : 'Falha ao carregar a solicitação.', 'error'))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [requestId, showToast]);

    const status = sc ? statusDaSolicitacao(sc) : null;
    const convertiveis = React.useMemo(() => (sc ? itensConvertiveis(sc) : []), [sc]);

    // Fornecedores da organização DA SOLICITAÇÃO (não do topo) — só quando há o que converter.
    React.useEffect(() => {
        if (!sc || convertiveis.length === 0) return;
        let cancelled = false;
        supplierService.listSuppliers(sc.organizationId)
            .then(l => { if (!cancelled) setSuppliers(l); })
            .catch(err => console.error('[SolicitacaoCompraSheet] fornecedores:', err));
        return () => { cancelled = true; };
    }, [sc, convertiveis.length]);

    const recarregar = async (id: string) => {
        const r = await purchaseRequestService.get(id);
        setSc(r);
        setSelected(new Set());
        onChanged(r, id);
        return r;
    };

    const executar = async (rotulo: string, fn: () => Promise<void>) => {
        setBusy(rotulo);
        try { await fn(); } catch (err) {
            showToast(err instanceof Error ? err.message : `Falha ao ${rotulo.toLowerCase()}.`, 'error');
        } finally { setBusy(null); }
    };

    if (!requestId) return null;

    const selecionados = sc ? sc.items.filter(i => i.id && selected.has(i.id)) : [];
    const motivoConverter = sc ? motivoNaoConverter(sc, selecionados) : null;
    const nivelAtual = sc ? (sc.approvalChain.filter(s => s.action === 'APROVADO').length + 1) as 1 | 2 : 1;
    const motivoDecidir = sc ? motivoNaoDecidir(sc) : null;

    const enviar = () => sc && executar('Enviar', async () => {
        await purchaseRequestService.submitForApproval(sc.id);
        await recarregar(sc.id);
        showToast(`Solicitação ${sc.number ?? ''} enviada para aprovação.`);
    });
    const aprovar = () => sc && executar('Aprovar', async () => {
        await purchaseRequestService.approve(sc.id, nivelAtual, email);
        const r = await recarregar(sc.id);
        showToast(r.approvalStatus === 'APROVADO' ? 'Solicitação aprovada.' : `Nível ${nivelAtual} aprovado — aguarda o nível ${nivelAtual + 1}.`);
    });
    const confirmarPergunta = () => sc && pergunta && executar(pergunta.tipo === 'reprovar' ? 'Reprovar' : 'Cancelar', async () => {
        if (pergunta.tipo === 'reprovar') await purchaseRequestService.reject(sc.id, email, pergunta.texto.trim());
        else await purchaseRequestService.cancel(sc.id, pergunta.texto);
        setPergunta(null);
        await recarregar(sc.id);
        showToast(pergunta.tipo === 'reprovar' ? 'Solicitação reprovada.' : 'Solicitação cancelada.');
    });
    const excluir = async () => {
        if (!sc) return;
        const ok = await confirm({
            title: 'Excluir rascunho?',
            message: `A solicitação ${sc.number ?? ''} ainda não foi enviada e será apagada. Essa ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        await executar('Excluir', async () => {
            await purchaseRequestService.remove(sc.id);
            onChanged(null, sc.id);
            showToast('Rascunho excluído.');
            onClose();
        });
    };
    const gerarCotacao = () => sc && executar('Gerar cotação', async () => {
        const r = await purchaseRequestService.generateQuotation(sc.id, [...selected]);
        await recarregar(sc.id);
        showToast(`Cotação ${r.quotationNumber} criada — convide os fornecedores.`);
        onOpenQuotation(r.quotationId);
    });
    const gerarPedido = () => sc && executar('Gerar pedido', async () => {
        const r = await purchaseRequestService.generateOrder(sc.id, [...selected], supplierId);
        await recarregar(sc.id);
        showToast(`Pedido ${r.orderNumber} criado em rascunho.`);
        onOpenOrder(r.orderId);
    });

    const reprovacao = sc?.approvalStatus === 'REJEITADO'
        ? [...sc.approvalChain].reverse().find(s => s.action === 'REJEITADO')
        : undefined;

    return (
        <Sheet open={!!requestId} onClose={onClose} size="4xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{sc ? `Solicitação ${sc.number ?? ''}` : 'Solicitação'}</SheetTitle>
                <SheetDescription>{sc?.title ?? ''}</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6 space-y-6">
                {loading || !sc || !status ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <Campo label="Status"><span className={`text-sm font-normal ${STATUS_TEXT_CLASS[status]}`}>{STATUS_LABEL[status]}</span></Campo>
                            <Campo label="Valor estimado"><span className="font-medium">{formatMoney(sc.estimatedTotal)}</span></Campo>
                            <Campo label="Obra">{sc.projectName ?? '—'}</Campo>
                            <Campo label="Solicitante">{sc.requestedByName ?? sc.requestedByEmail ?? '—'}</Campo>
                            <Campo label="Necessidade">{sc.needDate ? formatDateBR(sc.needDate) : '—'}</Campo>
                            <Campo label="Prioridade">
                                <span className={sc.priority === 'urgente' ? 'text-red-600' : ''}>{sc.priority === 'urgente' ? 'Urgente' : 'Normal'}</span>
                            </Campo>
                            {sc.justification && <div className="col-span-2"><Campo label="Justificativa">{sc.justification}</Campo></div>}
                            {sc.cancelledAt && (
                                <div className="col-span-2">
                                    <Campo label="Cancelada">{formatDateTimeBR(sc.cancelledAt)}{sc.cancelReason ? ` — ${sc.cancelReason}` : ''}</Campo>
                                </div>
                            )}
                        </div>

                        {reprovacao && (
                            <div className="bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                                Reprovada por {reprovacao.approved_by} em {formatDateTimeBR(reprovacao.approved_at)}
                                {reprovacao.notes ? ` — ${reprovacao.notes}` : ''}. Edite e reenvie.
                            </div>
                        )}

                        {(sc.approvalStatus === 'PENDENTE' || sc.approvalChain.length > 0) && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-slate-500">
                                    Aprovação · {sc.approvalRequiredLevels} {sc.approvalRequiredLevels === 1 ? 'nível' : 'níveis'}
                                </p>
                                {sc.approvalChain.length === 0 && <p className="text-sm text-gray-400 italic">Aguardando o nível 1…</p>}
                                {sc.approvalChain.map((s, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-sm">
                                        {s.action === 'APROVADO'
                                            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                            : <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />}
                                        <span className="text-gray-700">
                                            Nível {s.level} · {s.role} — {s.action === 'APROVADO' ? 'aprovado' : 'reprovado'} por {s.approved_by} em {formatDateTimeBR(s.approved_at)}
                                            {s.notes ? <span className="text-gray-500"> — {s.notes}</span> : null}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Sem busca: a SC tem poucas linhas e todas cabem no painel. */}
                        <StandardTable<PurchaseRequestItem>
                            storageKey="suprimentos:sc:sheet-itens"
                            columns={ITEM_COLUMNS}
                            rows={sc.items}
                            rowKey={i => i.id!}
                            dense
                            selection={convertiveis.length ? {
                                selected, onChange: setSelected,
                                canSelect: i => itemAtivo(i) && !itemAtendido(i),
                            } : undefined}
                            sortValue={(k, i) => {
                                if (k === 'quantity') return i.quantity;
                                if (k === 'price') return i.estimatedUnitPrice;
                                if (k === 'total') return totalDoItem(i);
                                if (k === 'situacao') return situacaoDoItem(i);
                                if (k === 'unit') return i.unit;
                                return i.description;
                            }}
                            renderCell={(k, i) => {
                                const apagado = i.cancelledAt ? 'line-through text-gray-400' : '';
                                switch (k) {
                                    case 'description':
                                        return <span className={`block truncate text-sm font-normal text-gray-700 ${apagado}`} title={i.description}>{i.description}</span>;
                                    case 'quantity':
                                        return <span className={`text-sm font-normal text-gray-600 ${apagado}`}>{i.quantity.toLocaleString('pt-BR')}</span>;
                                    case 'unit':
                                        return <span className="text-sm font-normal text-gray-600">{i.unit}</span>;
                                    case 'price':
                                        return <span className="text-sm font-medium text-gray-800">{formatMoney(i.estimatedUnitPrice)}</span>;
                                    case 'total':
                                        return <span className="text-sm font-medium text-gray-800">{formatMoney(totalDoItem(i))}</span>;
                                    case 'situacao':
                                        if (i.purchaseOrderId) return <button className="text-sm font-normal text-blue-600 hover:underline" onClick={() => onOpenOrder(i.purchaseOrderId!)}>{situacaoDoItem(i)}</button>;
                                        if (i.quotationRequestId) return <button className="text-sm font-normal text-blue-600 hover:underline" onClick={() => onOpenQuotation(i.quotationRequestId!)}>{situacaoDoItem(i)}</button>;
                                        return <span className="text-sm font-normal text-gray-500">{situacaoDoItem(i)}</span>;
                                    default: return null;
                                }
                            }}
                        />

                        {convertiveis.length > 0 && (
                            <div className="space-y-3 border-t border-gray-100 pt-4">
                                <div className="flex items-center gap-2">
                                    <ShoppingCart className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-semibold text-gray-900">Atender</h3>
                                    <span className="text-xs text-gray-400">
                                        {selecionados.length} de {convertiveis.length} {convertiveis.length === 1 ? 'item pendente' : 'itens pendentes'} marcado{selecionados.length === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button onClick={gerarCotacao} disabled={!!motivoConverter || !!busy}
                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:border-blue-300 hover:text-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                                        {busy === 'Gerar cotação' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <FileSearch className="w-[15px] h-[15px]" />}
                                        Gerar cotação
                                    </button>
                                    <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                                        <div className="flex-1">
                                            <SupplierSelect suppliers={suppliers} value={supplierId} onChange={setSupplierId} size="sm" placeholder="Fornecedor do pedido..." />
                                        </div>
                                        <button onClick={gerarPedido} disabled={!!motivoConverter || !supplierId || !!busy}
                                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:border-blue-300 hover:text-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                                            {busy === 'Gerar pedido' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <ShoppingCart className="w-[15px] h-[15px]" />}
                                            Gerar pedido
                                        </button>
                                    </div>
                                </div>
                                {(motivoConverter || !supplierId) && (
                                    <p className="text-xs text-gray-500">
                                        {motivoConverter ?? 'Para gerar pedido, escolha o fornecedor.'}
                                    </p>
                                )}
                            </div>
                        )}

                        {pergunta && (
                            <div className="space-y-2 border-t border-gray-100 pt-4">
                                <label htmlFor="sc-motivo" className="text-xs font-semibold text-slate-500">
                                    {pergunta.tipo === 'reprovar' ? 'Motivo da reprovação' : 'Motivo do cancelamento'}
                                </label>
                                <textarea id="sc-motivo" rows={2} autoFocus value={pergunta.texto}
                                    onChange={e => setPergunta({ ...pergunta, texto: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                <div className="flex items-center justify-end gap-2">
                                    {pergunta.tipo === 'reprovar' && !pergunta.texto.trim() && (
                                        <span className="text-xs text-gray-500 mr-auto">Diga o motivo — o solicitante recebe junto com o aviso.</span>
                                    )}
                                    <Button variant="ghost" size="lg" onClick={() => setPergunta(null)}>Voltar</Button>
                                    <button onClick={confirmarPergunta}
                                        disabled={!!busy || (pergunta.tipo === 'reprovar' && !pergunta.texto.trim())}
                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-red-600 text-white rounded-[6px] hover:bg-red-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                                        {busy && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                                        {pergunta.tipo === 'reprovar' ? 'Reprovar solicitação' : 'Cancelar solicitação'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </SheetPanel>

            {/* Atendida/cancelada não tem ação: sem rodapé, em vez de uma faixa vazia. */}
            {sc && status && !pergunta && status !== 'atendida' && status !== 'cancelada' && (
                <SheetFooter>
                    {status === 'rascunho' && (
                        <>
                            <Button variant="ghost" size="lg" className="mr-auto text-red-600" onClick={excluir}
                                disabled={!!busy || !!motivoNaoExcluir(sc)} title={motivoNaoExcluir(sc) ?? undefined}>Excluir</Button>
                            <Button variant="secondary" size="lg" onClick={() => onEdit(sc.id)}><Pencil className="w-[15px] h-[15px]" />Editar</Button>
                            <button onClick={enviar} disabled={!!busy || !!motivoNaoEnviar(sc, sc)}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                                {busy === 'Enviar' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Send className="w-[15px] h-[15px]" />}
                                Enviar para aprovação
                            </button>
                        </>
                    )}
                    {status === 'em_aprovacao' && (
                        <>
                            {motivoDecidir && <span className="text-xs text-gray-500 mr-auto">{motivoDecidir}</span>}
                            <Button variant="ghost" size="lg" className="text-red-600" disabled={!!busy || !!motivoDecidir}
                                onClick={() => setPergunta({ tipo: 'reprovar', texto: '' })}>Reprovar</Button>
                            <button onClick={aprovar} disabled={!!busy || !!motivoDecidir}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                                {busy === 'Aprovar' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <CheckCircle2 className="w-[15px] h-[15px]" />}
                                {sc.approvalRequiredLevels > 1 ? `Aprovar nível ${nivelAtual}` : 'Aprovar'}
                            </button>
                        </>
                    )}
                    {(status === 'reprovada' || status === 'aprovada' || status === 'em_atendimento') && (
                        <>
                            <Button variant="ghost" size="lg" className="mr-auto text-red-600" disabled={!!busy || !!motivoNaoCancelar(sc)}
                                onClick={() => setPergunta({ tipo: 'cancelar', texto: '' })}>Cancelar solicitação</Button>
                            {status === 'reprovada' && !motivoNaoEditar(sc) && (
                                <Button variant="secondary" size="lg" onClick={() => onEdit(sc.id)}><Pencil className="w-[15px] h-[15px]" />Editar e reenviar</Button>
                            )}
                        </>
                    )}
                </SheetFooter>
            )}
        </Sheet>
    );
};

export default SolicitacaoCompraSheet;
