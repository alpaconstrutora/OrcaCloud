import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import SaveStatus from '../ui/SaveStatus';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useOrgContext, errorMessage } from '../../hooks/useOrgContext';
import { useStore } from '../../store/useStore';
import { companyService } from '../../services/companyService';
import { supplierService } from '../../services/supplierService';
import { empreendimentoService } from '../../services/empreendimentoService';
import { debtService } from '../../services/debtService';
import { DEBT_MODALITY_PT, DEBT_STATUS_PT, type DebtContract, type DebtModality } from '../../types/debt';
import type { Company } from '../../types/company';
import type { Supplier } from '../../types/users';
import type { Empreendimento } from '../../types/empreendimento';
import {
    CREDIT_ROOM_STATUS_PT,
    type CreditRoom,
    type CreditRoomInput,
    type CreditRoomStatus,
} from '../../types/creditRoom';
import {
    ELIGIBLE_FLOW_PT,
    GUARANTEE_KIND_PT,
    type CreditRoomEligibleFlows,
    type CreditRoomGuarantee,
    type CreditRoomGuaranteeKind,
} from '../../utils/creditRoomSnapshot';

interface Props {
    open: boolean;
    onClose: () => void;
    /** Ausente = criação. */
    room?: CreditRoom;
    onSave: (input: CreditRoomInput) => Promise<void>;
}

const VAZIO: CreditRoomInput = {
    name: '',
    requestedAmount: 0,
    eligibleFlows: { noi: true, receivables: false, operating_cash: false },
    guarantees: [],
    equityCommitted: 0,
    equityContributed: 0,
    status: 'PREPARACAO',
};

const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
const rotulo = 'text-xs font-semibold text-slate-500';

/**
 * Criar/editar a operação de crédito. É só o CADASTRO — nada aqui calcula:
 * os números nascem quando a versão é congelada (CreditRoomDetail →
 * creditRoomService.freezeVersion).
 *
 * §25: criar fecha; editar permanece aberto, com dirty-tracking.
 */
export default function CreditRoomForm({ open, onClose, room, onSave }: Props) {
    const { orgId } = useOrgContext();
    const obras = useStore(s => s.projects); // já é só OBRA e sem projeto de sistema (REGRAS #2/#3)
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();

    const [form, setForm] = React.useState<CreditRoomInput>(VAZIO);
    const [salvando, setSalvando] = React.useState(false);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);

    const [companies, setCompanies] = React.useState<Company[]>([]);
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [empreendimentos, setEmpreendimentos] = React.useState<Empreendimento[]>([]);
    const [dividas, setDividas] = React.useState<DebtContract[]>([]);

    const editando = !!room;

    React.useEffect(() => {
        if (!open) return;
        setForm(room ? {
            name: room.name,
            companyId: room.companyId,
            empreendimentoId: room.empreendimentoId,
            projectId: room.projectId,
            debtContractId: room.debtContractId,
            institutionSupplierId: room.institutionSupplierId,
            institutionName: room.institutionName,
            requestedAmount: room.requestedAmount,
            purpose: room.purpose,
            modality: room.modality,
            termMonths: room.termMonths,
            graceMonths: room.graceMonths,
            eligibleFlows: { ...room.eligibleFlows },
            guarantees: structuredClone(room.guarantees),
            equityCommitted: room.equityCommitted,
            equityContributed: room.equityContributed,
            status: room.status,
            notes: room.notes,
        } : { ...VAZIO });
        setErro(null);
        markSaved();
        // `room` muda de identidade a cada refetch; a dependência real é o id.
    }, [open, room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
        if (!open) return;
        let vivo = true;
        // Listas de apoio — cada uma falha sozinha, sem derrubar o formulário.
        Promise.allSettled([
            companyService.list(orgId),
            supplierService.listSuppliers(orgId ?? undefined),
            empreendimentoService.list(orgId ?? undefined),
            debtService.listContracts(orgId),
        ]).then(([c, s, e, d]) => {
            if (!vivo) return;
            if (c.status === 'fulfilled') setCompanies(c.value);
            if (s.status === 'fulfilled') setSuppliers(s.value as Supplier[]);
            if (e.status === 'fulfilled') setEmpreendimentos(e.value);
            if (d.status === 'fulfilled') setDividas(d.value);
        });
        return () => { vivo = false; };
    }, [open, orgId]);

    const set = <K extends keyof CreditRoomInput>(key: K, value: CreditRoomInput[K]) => {
        setForm(prev => ({ ...prev, [key]: value }));
        markDirty();
    };
    const num = (v: string) => (v === '' ? 0 : Number(v));
    const optNum = (v: string) => (v === '' ? undefined : Number(v));

    const setFlow = (k: keyof CreditRoomEligibleFlows, v: boolean) =>
        set('eligibleFlows', { ...form.eligibleFlows, [k]: v });

    const setGarantia = (idx: number, patch: Partial<CreditRoomGuarantee>) =>
        set('guarantees', form.guarantees.map((g, i) => (i === idx ? { ...g, ...patch } : g)));

    const addGarantia = () =>
        set('guarantees', [...form.guarantees, { kind: 'IMOVEL', description: '', value: 0, haircut_pct: 0 }]);

    const removeGarantia = (idx: number) =>
        set('guarantees', form.guarantees.filter((_, i) => i !== idx));

    const handleBack = async () => {
        if (await confirmDiscard()) onClose();
    };

    const handleSave = async () => {
        if (!form.name.trim()) { setErro('Dê um nome à operação.'); return; }
        if (!form.institutionSupplierId && !form.institutionName?.trim()) {
            setErro('Informe a instituição financeira — escolha um fornecedor ou digite o nome.');
            return;
        }
        if (form.guarantees.some(g => g.haircut_pct < 0 || g.haircut_pct > 100)) {
            setErro('Haircut fica entre 0 e 100%.');
            return;
        }
        setSalvando(true);
        setErro(null);
        try {
            await onSave({ ...form, name: form.name.trim(), institutionName: form.institutionName?.trim() || undefined });
            markSaved();
            setSavedAt(Date.now());
            if (!editando) onClose();
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível salvar a operação.'));
        } finally {
            setSalvando(false);
        }
    };

    // Ao escolher o fornecedor, o nome livre vira redundante — e o inverso
    // também: dois campos dizendo instituições diferentes é o erro clássico.
    const onSupplier = (id: string) => {
        set('institutionSupplierId', id || undefined);
        if (id) {
            const s = suppliers.find(x => x.id === id);
            if (s) setForm(prev => ({ ...prev, institutionName: s.name }));
        }
    };

    return (
        <Sheet open={open} onClose={handleBack} size="2xl" dirty={dirty}>
            <SheetHeader onClose={handleBack}>
                <SheetTitle>{editando ? `${room!.code} · ${room!.name}` : 'Novo Credit Room'}</SheetTitle>
                <SheetDescription>
                    A operação e seus vínculos. Os números (LTV, LTC, DSCR) nascem ao congelar a primeira versão.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-6">
                {/* Identificação */}
                <section className="space-y-3">
                    <div className="space-y-1.5">
                        <label className={rotulo}>Nome da operação</label>
                        <input autoFocus value={form.name} onChange={e => set('name', e.target.value)} className={campo} placeholder="Ex.: Financiamento à produção — Residencial Vista" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className={rotulo}>SPE / empresa tomadora</label>
                            <select value={form.companyId ?? ''} onChange={e => set('companyId', e.target.value || undefined)} className={campo}>
                                <option value="">—</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={rotulo}>Empreendimento</label>
                            <select value={form.empreendimentoId ?? ''} onChange={e => set('empreendimentoId', e.target.value || undefined)} className={campo}>
                                <option value="">—</option>
                                {empreendimentos.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={rotulo}>Obra (orçamento, contratado, pago)</label>
                            <select value={form.projectId ?? ''} onChange={e => set('projectId', e.target.value || undefined)} className={campo}>
                                <option value="">—</option>
                                {obras.filter(p => !!p.id).map(p => <option key={p.id} value={p.id as string}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={rotulo}>Proposta / contrato de dívida</label>
                            <select value={form.debtContractId ?? ''} onChange={e => set('debtContractId', e.target.value || undefined)} className={campo}>
                                <option value="">— (sem cronograma: DSCR pós-operação fica em branco)</option>
                                {dividas.map(d => (
                                    <option key={d.id} value={d.id}>
                                        {[d.contractNumber, d.institutionName, DEBT_STATUS_PT[d.status]].filter(Boolean).join(' · ')}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                {/* Instituição */}
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-800">Instituição financeira</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className={rotulo}>Fornecedor cadastrado</label>
                            <select value={form.institutionSupplierId ?? ''} onChange={e => onSupplier(e.target.value)} className={campo}>
                                <option value="">—</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={rotulo}>Nome (se não cadastrado)</label>
                            <input value={form.institutionName ?? ''} onChange={e => set('institutionName', e.target.value)} className={campo} placeholder="Banco ABC" />
                        </div>
                    </div>
                </section>

                {/* Solicitação */}
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-800">Solicitação</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1.5 col-span-2">
                            <label className={rotulo}>Valor solicitado (R$)</label>
                            <input type="number" min={0} step="0.01" value={form.requestedAmount || ''} onChange={e => set('requestedAmount', num(e.target.value))} className={campo} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={rotulo}>Prazo (meses)</label>
                            <input type="number" min={1} value={form.termMonths ?? ''} onChange={e => set('termMonths', optNum(e.target.value))} className={campo} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={rotulo}>Carência (meses)</label>
                            <input type="number" min={0} value={form.graceMonths ?? ''} onChange={e => set('graceMonths', optNum(e.target.value))} className={campo} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={rotulo}>Modalidade</label>
                            <select value={form.modality ?? ''} onChange={e => set('modality', e.target.value || undefined)} className={campo}>
                                <option value="">—</option>
                                {(Object.keys(DEBT_MODALITY_PT) as DebtModality[]).map(m => <option key={m} value={m}>{DEBT_MODALITY_PT[m]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={rotulo}>Finalidade</label>
                            <input value={form.purpose ?? ''} onChange={e => set('purpose', e.target.value)} className={campo} placeholder="Construção, terreno, capital de giro..." />
                        </div>
                    </div>
                </section>

                {/* Equity + fluxo elegível */}
                <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-800">Equity e fluxo elegível</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className={rotulo}>Equity previsto (R$)</label>
                            <input type="number" min={0} step="0.01" value={form.equityCommitted || ''} onChange={e => set('equityCommitted', num(e.target.value))} className={campo} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={rotulo}>Equity aportado (R$)</label>
                            <input type="number" min={0} step="0.01" value={form.equityContributed || ''} onChange={e => set('equityContributed', num(e.target.value))} className={campo} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className={rotulo}>Entra no DSCR desta operação (R8 do PRD — cada banco aceita uma base)</label>
                        <div className="flex flex-wrap gap-4">
                            {(Object.keys(ELIGIBLE_FLOW_PT) as (keyof CreditRoomEligibleFlows)[]).map(k => (
                                <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox" checked={form.eligibleFlows[k]} onChange={e => setFlow(k, e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                    {ELIGIBLE_FLOW_PT[k]}
                                    {k !== 'noi' && <span className="text-xs text-gray-400">(sem fonte no MVP — vira aviso)</span>}
                                </label>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Garantias */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-800">Garantias oferecidas</h3>
                        <button type="button" onClick={addGarantia} className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-[6px] transition-all">
                            <Plus className="w-4 h-4" /> Adicionar
                        </button>
                    </div>
                    {form.guarantees.length === 0 ? (
                        <p className="text-sm text-gray-400">Sem garantia cadastrada — LTV e cobertura ficam em branco, não em zero.</p>
                    ) : (
                        <div className="space-y-2">
                            {form.guarantees.map((g, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                    <div className="col-span-3 space-y-1">
                                        {idx === 0 && <label className={rotulo}>Tipo</label>}
                                        <select value={g.kind} onChange={e => setGarantia(idx, { kind: e.target.value as CreditRoomGuaranteeKind })} className={campo}>
                                            {(Object.keys(GUARANTEE_KIND_PT) as CreditRoomGuaranteeKind[]).map(k => <option key={k} value={k}>{GUARANTEE_KIND_PT[k]}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-4 space-y-1">
                                        {idx === 0 && <label className={rotulo}>Descrição</label>}
                                        <input value={g.description ?? ''} onChange={e => setGarantia(idx, { description: e.target.value })} className={campo} placeholder="Terreno matrícula 12.345" />
                                    </div>
                                    <div className="col-span-3 space-y-1">
                                        {idx === 0 && <label className={rotulo}>Valor (R$)</label>}
                                        <input type="number" min={0} step="0.01" value={g.value || ''} onChange={e => setGarantia(idx, { value: num(e.target.value) })} className={campo} />
                                    </div>
                                    <div className="col-span-1 space-y-1">
                                        {idx === 0 && <label className={rotulo}>Haircut %</label>}
                                        <input type="number" min={0} max={100} value={g.haircut_pct} onChange={e => setGarantia(idx, { haircut_pct: num(e.target.value) })} className={campo} />
                                    </div>
                                    <div className="col-span-1 flex justify-end">
                                        <button type="button" onClick={() => removeGarantia(idx)} className="h-9 w-9 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-[6px] transition-all" title="Remover">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Status + notas */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {editando && (
                        <div className="space-y-1.5">
                            <label className={rotulo}>Status da operação</label>
                            <select value={form.status} onChange={e => set('status', e.target.value as CreditRoomStatus)} className={campo}>
                                {(Object.keys(CREDIT_ROOM_STATUS_PT) as CreditRoomStatus[]).map(s => <option key={s} value={s}>{CREDIT_ROOM_STATUS_PT[s]}</option>)}
                            </select>
                        </div>
                    )}
                    <div className={`space-y-1.5 ${editando ? '' : 'md:col-span-2'}`}>
                        <label className={rotulo}>Observações internas</label>
                        <input value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} className={campo} />
                    </div>
                </section>

                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </SheetPanel>

            <SheetFooter>
                {editando && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
                <button onClick={() => void handleBack()} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                    {editando ? 'Voltar' : 'Cancelar'}
                </button>
                <button
                    onClick={() => void handleSave()}
                    disabled={salvando || (editando && !dirty)}
                    className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                >
                    {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar Credit Room'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
