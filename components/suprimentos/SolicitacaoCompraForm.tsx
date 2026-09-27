import React from 'react';
import { ArrowLeft, Calculator, ClipboardList, Loader2, Package, CalendarClock, Plus, Send, Tag, Wallet } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import SaveStatus from '../ui/SaveStatus';
import { formatMoney } from '../ui/Format';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useStore } from '../../store/useStore';
import CostCenterSelect from '../CostCenterSelect';
import PlanoContasSelect from '../PlanoContasSelect';
import SCOrcamentoPicker from './SCOrcamentoPicker';
import SCAlmoxarifadoPicker from './SCAlmoxarifadoPicker';
import SCPlanoPicker from './SCPlanoPicker';
import { purchaseRequestService } from '../../services/purchaseRequestService';
import { costCenterService } from '../../services/costCenterService';
import { financialRegistryService } from '../../services/financialRegistryService';
import type { PurchaseRequest, PurchaseRequestDraft, PurchaseRequestItem } from '../../types/purchaseRequest';
import {
    ORIGEM_LABEL, motivoNaoEditar, motivoRascunhoInvalido, totalDoItem, totalEstimado,
} from '../../utils/solicitacaoCompra';

/**
 * Suprimentos › Solicitações de Compra — criar / editar (tela in-flow, não
 * overlay: muitos itens de 4 origens — UI_PATTERNS "multi-etapa → página").
 * Plano: docs/planos/2026-09-26-suprimentos-solicitacoes-compra.md (item 11).
 *
 * §25: criar grava e volta; editar grava e PERMANECE. Enviar para aprovação
 * grava, envia e volta nos dois casos (a SC deixa de ser editável).
 *
 * Organização: a SC é da organização DONA DA OBRA — não se pergunta nada
 * (REGRA #5, item 5). CC e Plano de Contas são carregados dessa organização.
 */

const INPUT = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-60';
const CELL_INPUT = 'w-full h-8 px-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-60';
const LABEL = 'text-xs font-semibold text-slate-500';

// Grade de EDIÇÃO: nenhuma coluna ordena pelo cabeçalho (§6.3, exceção
// documentada) — a ordem das linhas é a posição do item, que vira a ordem na
// cotação/pedido gerado; reordenar pela coluna embaralharia o que o usuário
// está montando. Sem busca pelo mesmo motivo: poucas linhas, todas em edição.
const ITEM_COLUMNS: StandardTableColumn[] = [
    { key: 'origem', label: 'Origem', sortable: false, width: 170 },
    { key: 'code', label: 'Código', sortable: false, width: 140 },
    { key: 'description', label: 'Descrição', sortable: false, width: 300 },
    { key: 'unit', label: 'Un', sortable: false, width: 100 },
    { key: 'quantity', label: 'Quantidade', sortable: false, width: 120, align: 'right' },
    { key: 'price', label: 'Preço estimado', sortable: false, width: 140, align: 'right' },
    { key: 'total', label: 'Total', sortable: false, width: 130, align: 'right' },
    { key: 'needDate', label: 'Necessidade', sortable: false, width: 160 },
];

const EMPTY_DRAFT: PurchaseRequestDraft = {
    projectId: '', title: '', justification: '', needDate: '', priority: 'normal',
    costCenterId: '', planoDeContasId: '', items: [],
};

const novaChave = () => crypto.randomUUID();

interface Props {
    /** null = nova solicitação. */
    editingId: string | null;
    /** Rascunho pré-montado (ex.: "Gerar solicitação" no Plano de Aquisições). */
    initialDraft?: Partial<PurchaseRequestDraft>;
    onBack: () => void;
    onSaved: (sc: PurchaseRequest, info: { created: boolean; submitted: boolean }) => void;
}

const SolicitacaoCompraForm: React.FC<Props> = ({ editingId, initialDraft, onBack, onSaved }) => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const obras = useStore(s => s.projects);

    const [draft, setDraft] = React.useState<PurchaseRequestDraft>(() => ({
        ...EMPTY_DRAFT, ...initialDraft,
        items: (initialDraft?.items ?? []).map(i => ({ ...i, id: i.id ?? novaChave() })),
    }));
    const [existente, setExistente] = React.useState<PurchaseRequest | null>(null);
    const [loading, setLoading] = React.useState(!!editingId);
    const [saving, setSaving] = React.useState<'draft' | 'submit' | null>(null);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const [costCenters, setCostCenters] = React.useState<any[]>([]);
    const [planoContas, setPlanoContas] = React.useState<any[]>([]);
    const [picker, setPicker] = React.useState<'orcamento' | 'almoxarifado' | 'plano' | null>(null);

    // Pré-montado pelo Plano chega "sujo": sair sem salvar tem de perguntar.
    React.useEffect(() => { if (!editingId && initialDraft?.items?.length) markDirty(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
        if (!editingId) return;
        let cancelled = false;
        (async () => {
            try {
                const sc = await purchaseRequestService.get(editingId);
                if (cancelled) return;
                setExistente(sc);
                setDraft({
                    projectId: sc.projectId, title: sc.title, justification: sc.justification ?? '',
                    needDate: sc.needDate ?? '', priority: sc.priority,
                    costCenterId: sc.costCenterId ?? '', planoDeContasId: sc.planoDeContasId ?? '',
                    items: sc.items,
                });
            } catch (err) {
                showToast(err instanceof Error ? err.message : 'Falha ao carregar a solicitação.', 'error');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [editingId, showToast]);

    const obra = React.useMemo(() => obras.find(o => o.id === draft.projectId), [obras, draft.projectId]);
    const orgDaObra = obra?.organization_id ?? obra?.settings?.organizationId ?? existente?.organizationId ?? '';

    // CC e Plano de Contas da organização DONA DA OBRA (não a do topo).
    React.useEffect(() => {
        if (!orgDaObra) { setCostCenters([]); setPlanoContas([]); return; }
        let cancelled = false;
        Promise.all([
            costCenterService.list(orgDaObra),
            financialRegistryService.listPlanoContas(orgDaObra),
        ]).then(([cc, pc]) => {
            if (cancelled) return;
            setCostCenters(cc);
            setPlanoContas(pc);
        }).catch(err => console.error('[SolicitacaoCompraForm] CC/Plano de Contas:', err));
        return () => { cancelled = true; };
    }, [orgDaObra]);

    const bloqueio = existente ? motivoNaoEditar(existente) : null;
    const invalido = motivoRascunhoInvalido(draft);
    const total = totalEstimado(draft.items);
    const planoNaSc = React.useMemo(
        () => new Set(draft.items.map(i => i.procurementPlanItemId).filter((x): x is string => !!x)),
        [draft.items],
    );

    const set = <K extends keyof PurchaseRequestDraft>(k: K, v: PurchaseRequestDraft[K]) => {
        setDraft(d => ({ ...d, [k]: v }));
        markDirty();
    };
    const setItem = (id: string, patch: Partial<PurchaseRequestItem>) => {
        setDraft(d => ({ ...d, items: d.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }));
        markDirty();
    };
    const addItems = (novos: PurchaseRequestItem[]) => {
        if (!novos.length) return;
        setDraft(d => ({ ...d, items: [...d.items, ...novos.map(i => ({ ...i, id: novaChave() }))] }));
        markDirty();
    };
    const removeItem = (id: string) => {
        setDraft(d => ({ ...d, items: d.items.filter(i => i.id !== id) }));
        markDirty();
    };

    /**
     * Trocar a obra troca o orçamento e o plano de referência: itens que vieram
     * de lá deixam de fazer sentido (memória project_pedido_empreendimento_e_obra_orcamento).
     * Trocar de ORGANIZAÇÃO invalida CC e Plano de Contas.
     */
    const trocarObra = async (novoId: string) => {
        if (novoId === draft.projectId) return;
        const presos = draft.items.filter(i => i.source === 'orcamento' || i.source === 'plano');
        if (presos.length) {
            const ok = await confirm({
                title: 'Trocar a obra?',
                message: `${presos.length} ${presos.length === 1 ? 'item veio' : 'itens vieram'} do orçamento ou do plano da obra atual e ${presos.length === 1 ? 'será removido' : 'serão removidos'}.`,
                variant: 'warning',
                confirmLabel: 'Trocar e remover',
            });
            if (!ok) return;
        }
        const nova = obras.find(o => o.id === novoId);
        const novaOrg = nova?.organization_id ?? nova?.settings?.organizationId ?? '';
        setDraft(d => ({
            ...d,
            projectId: novoId,
            items: d.items.filter(i => i.source !== 'orcamento' && i.source !== 'plano'),
            ...(novaOrg !== orgDaObra ? { costCenterId: '', planoDeContasId: '' } : {}),
        }));
        markDirty();
    };

    const voltar = async () => { if (await confirmDiscard()) onBack(); };

    const salvar = async (enviar: boolean) => {
        if (bloqueio || invalido) return;
        setSaving(enviar ? 'submit' : 'draft');
        try {
            const items = draft.items.map((i, idx) => ({ ...i, position: idx }));
            let sc = existente
                ? await purchaseRequestService.update(existente.id, { ...draft, items })
                : await purchaseRequestService.create({ ...draft, items });
            if (enviar) {
                await purchaseRequestService.submitForApproval(sc.id);
                sc = await purchaseRequestService.get(sc.id);
            }
            markSaved();
            showToast(enviar ? `Solicitação ${sc.number ?? ''} enviada para aprovação.` : `Solicitação ${sc.number ?? ''} salva.`);
            if (enviar || !existente) {
                onSaved(sc, { created: !existente, submitted: enviar });
                return;
            }
            // §25: edição salva e permanece.
            setExistente(sc);
            setDraft(d => ({ ...d, items: sc.items }));
            setSavedAt(Date.now());
            onSaved(sc, { created: false, submitted: false });
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Falha ao salvar a solicitação.', 'error');
        } finally {
            setSaving(null);
        }
    };

    if (loading) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Carregando...</p>
            </div>
        );
    }

    const semObra = !draft.projectId;
    const motivoBotoes = bloqueio ?? invalido;
    const desabilitado = !!motivoBotoes || !!saving;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-start gap-3">
                <button onClick={voltar} className="mt-1 p-1.5 rounded-[6px] text-gray-500 hover:bg-gray-100 transition-colors" title="Voltar para a lista">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                        {existente ? `Solicitação ${existente.number ?? ''}` : 'Nova solicitação de compra'}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        {existente
                            ? 'Ajuste os itens e reenvie para aprovação.'
                            : 'Peça material ou serviço para a obra. Depois de aprovada, ela vira cotação ou pedido.'}
                    </p>
                </div>
            </div>

            {bloqueio && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[10px] px-4 py-3">{bloqueio}</div>
            )}

            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <ClipboardList className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Identificação</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="sc-obra" className={LABEL}>Obra</label>
                            <select id="sc-obra" className={INPUT} value={draft.projectId} disabled={!!bloqueio}
                                onChange={e => trocarObra(e.target.value)}>
                                <option value="">Selecione a obra...</option>
                                {obras.filter(o => o.id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                {/* A obra da SC pode estar fora da lista do topo (outra org selecionada). */}
                                {existente && !obra && <option value={existente.projectId}>{existente.projectName ?? 'Obra da solicitação'}</option>}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="sc-necessidade" className={LABEL}>Necessidade</label>
                            <input id="sc-necessidade" type="date" className={INPUT} value={draft.needDate ?? ''} disabled={!!bloqueio}
                                max="9999-12-31" onChange={e => set('needDate', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="sc-prioridade" className={LABEL}>Prioridade</label>
                            <select id="sc-prioridade" className={INPUT} value={draft.priority} disabled={!!bloqueio}
                                onChange={e => set('priority', e.target.value as PurchaseRequestDraft['priority'])}>
                                <option value="normal">Normal</option>
                                <option value="urgente">Urgente</option>
                            </select>
                        </div>
                        <div className="space-y-1.5 md:col-span-3">
                            <label htmlFor="sc-titulo" className={LABEL}>Título</label>
                            <input id="sc-titulo" className={INPUT} value={draft.title} disabled={!!bloqueio}
                                placeholder="Ex.: Concretagem da laje do 3º pavimento"
                                onChange={e => set('title', e.target.value)} />
                        </div>
                        <div className="space-y-1.5 md:col-span-3">
                            <label htmlFor="sc-justificativa" className={LABEL}>Justificativa</label>
                            <textarea id="sc-justificativa" rows={2} disabled={!!bloqueio}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-60"
                                value={draft.justification ?? ''} onChange={e => set('justification', e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <Tag className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Classificação financeira</h3>
                        <span className="text-xs text-gray-400">vai para a cotação e o pedido gerados</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={LABEL}>Centro de custo</label>
                            <CostCenterSelect costCenters={costCenters} value={draft.costCenterId ?? ''} size="sm"
                                disabled={!!bloqueio || semObra}
                                placeholder={semObra ? 'Selecione a obra primeiro' : 'Selecione o centro de custo...'}
                                onChange={v => set('costCenterId', v)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={LABEL}>Plano de contas</label>
                            <PlanoContasSelect planoContas={planoContas} value={draft.planoDeContasId ?? ''} size="sm"
                                disabled={!!bloqueio || semObra}
                                placeholder={semObra ? 'Selecione a obra primeiro' : 'Selecione o plano de contas...'}
                                onChange={v => set('planoDeContasId', v)} />
                        </div>
                    </div>
                </div>
            </div>

            <StandardTable<PurchaseRequestItem>
                storageKey="suprimentos:sc:form-itens"
                columns={ITEM_COLUMNS}
                rows={draft.items}
                rowKey={i => i.id!}
                toolbarTop={
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-gray-900">Itens</h3>
                            <span className="text-xs text-gray-400">{draft.items.length} · {formatMoney(total)} estimado</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {semObra && <span className="text-xs text-gray-500">Selecione a obra para buscar itens.</span>}
                            {[
                                { k: 'orcamento' as const, label: 'Do orçamento', icon: <Calculator className="w-[15px] h-[15px]" /> },
                                { k: 'almoxarifado' as const, label: 'Do almoxarifado', icon: <Package className="w-[15px] h-[15px]" /> },
                                { k: 'plano' as const, label: 'Do Plano de Aquisições', icon: <CalendarClock className="w-[15px] h-[15px]" /> },
                            ].map(b => (
                                <button key={b.k} onClick={() => setPicker(b.k)} disabled={semObra || !!bloqueio}
                                    className="flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:border-blue-300 hover:text-blue-700 text-[13px] font-medium transition-all disabled:opacity-50">
                                    {b.icon}{b.label}
                                </button>
                            ))}
                            <button onClick={() => addItems([{ position: 0, source: 'avulso', description: '', unit: 'un', quantity: 1, estimatedUnitPrice: 0 }])}
                                disabled={!!bloqueio}
                                className="flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:border-blue-300 hover:text-blue-700 text-[13px] font-medium transition-all disabled:opacity-50">
                                <Plus className="w-[15px] h-[15px]" />Item avulso
                            </button>
                        </div>
                    </div>
                }
                renderCell={(k, i) => {
                    const id = i.id!;
                    const ro = !!bloqueio;
                    switch (k) {
                        case 'origem':
                            return <span className="block truncate text-sm font-normal text-gray-600" title={i.budgetRef?.budgetItemDescription ?? undefined}>{ORIGEM_LABEL[i.source]}</span>;
                        case 'code':
                            return i.source === 'avulso'
                                ? <input className={CELL_INPUT} value={i.inputCode ?? ''} disabled={ro} placeholder="—" onChange={e => setItem(id, { inputCode: e.target.value })} />
                                : <span className="text-sm font-normal text-gray-600">{i.inputCode || '—'}</span>;
                        case 'description':
                            return <input className={CELL_INPUT} value={i.description} disabled={ro} placeholder="Descreva o item" title={i.description}
                                onChange={e => setItem(id, { description: e.target.value })} />;
                        case 'unit':
                            return <input className={CELL_INPUT} value={i.unit} disabled={ro} onChange={e => setItem(id, { unit: e.target.value })} />;
                        case 'quantity':
                            return <input type="number" min={0} step="any" className={`${CELL_INPUT} text-right`} value={i.quantity} disabled={ro}
                                onChange={e => setItem(id, { quantity: Number(e.target.value) })} />;
                        case 'price':
                            return <input type="number" min={0} step="0.01" className={`${CELL_INPUT} text-right`} value={i.estimatedUnitPrice} disabled={ro}
                                onChange={e => setItem(id, { estimatedUnitPrice: Number(e.target.value) })} />;
                        case 'total':
                            return <span className="text-sm font-medium text-gray-800">{formatMoney(totalDoItem(i))}</span>;
                        case 'needDate':
                            return <input type="date" max="9999-12-31" className={CELL_INPUT} value={i.needDate ?? ''} disabled={ro}
                                onChange={e => setItem(id, { needDate: e.target.value || null })} />;
                        default:
                            return null;
                    }
                }}
                actions={bloqueio ? undefined : {
                    width: 90,
                    render: i => <ActionIconButton kind="delete" title="Remover item" onClick={() => removeItem(i.id!)} />,
                }}
                empty={{
                    icon: <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum item ainda',
                    subtitle: 'Adicione do orçamento, do almoxarifado, do Plano de Aquisições ou como item avulso.',
                }}
            />

            <div className="flex flex-wrap items-center justify-end gap-3">
                {existente && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
                {motivoBotoes && <span className="text-xs text-gray-500">{motivoBotoes}</span>}
                <button onClick={voltar} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                    {existente ? 'Voltar' : 'Cancelar'}
                </button>
                <button onClick={() => salvar(false)} disabled={desabilitado || (!!existente && !dirty)}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:border-blue-300 hover:text-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                    {saving === 'draft' && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    Salvar rascunho
                </button>
                <button onClick={() => salvar(true)} disabled={desabilitado}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                    {saving === 'submit' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Send className="w-[15px] h-[15px]" />}
                    Enviar para aprovação
                </button>
            </div>

            {/* Montados SÓ quando abertos: o `Sheet` fechado continua no DOM (sai
                por transform), e o orçamento tem centenas de linhas — 674 na obra
                do teste de 26/09 — que ficariam renderizadas escondidas. */}
            {picker === 'orcamento' && (
                <SCOrcamentoPicker open projectId={draft.projectId} onClose={() => setPicker(null)} onAdd={addItems} />
            )}
            {picker === 'almoxarifado' && (
                <SCAlmoxarifadoPicker open organizationId={orgDaObra} onClose={() => setPicker(null)} onAdd={addItems} />
            )}
            {picker === 'plano' && (
                <SCPlanoPicker open organizationId={orgDaObra} projectId={draft.projectId}
                    jaNaSolicitacao={planoNaSc} onClose={() => setPicker(null)} onAdd={addItems} />
            )}
        </div>
    );
};

export default SolicitacaoCompraForm;
