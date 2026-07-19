// components/empreendimento/CuradoriaTab.tsx
//
// Inbox de Curadoria — onde o Empreendimento é o centro da verdade na ENTRADA. Quando um sync
// da Viabilidade/Planta encontra um campo em conflito, ele não sobrescreve: vira uma proposta
// pendente que aparece aqui. O usuário aprova (aplica o valor da origem) ou rejeita (mantém o
// do empreendimento), campo a campo, com ações em lote.
//
// Estrutura herdada de FiscalJobs (dead letter): predicado único de "pendente", filtro
// Pendentes/decididas como abas, nada é apagado ao rejeitar.
import React from 'react';
import { Loader2, Building, CheckCircle2, XCircle, ArrowRight, Inbox, AlertCircle, Clock } from 'lucide-react';
import { empreendimentoProposalService, FieldProposal, ProposalStatus } from '../../services/empreendimentoProposalService';
import { ORIGIN_LABEL } from '../../services/sync/types';
import { useConfirm } from '../ui/confirm';

interface Props {
    empreendimentoId: string;
    onChanged?: () => void;
}

type Filter = 'pending' | 'applied' | 'rejected' | 'superseded';

const FILTERS: { id: Filter; label: string }[] = [
    { id: 'pending', label: 'Pendentes' },
    { id: 'applied', label: 'Aplicadas' },
    { id: 'rejected', label: 'Rejeitadas' },
    { id: 'superseded', label: 'Obsoletas' },
];

const GROUP_LABEL: Record<string, string> = {
    identidade: 'Identidade', estrutura: 'Estrutura', area: 'Áreas', comercial: 'Comercial',
};

const fmtVal = (v: unknown): string => {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return String(v);
};

const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
};

const StatusText: React.FC<{ status: ProposalStatus }> = ({ status }) => {
    const map: Record<ProposalStatus, { text: string; cls: string }> = {
        pending: { text: 'Pendente', cls: 'text-amber-600' },
        applied: { text: 'Aplicada', cls: 'text-emerald-600' },
        rejected: { text: 'Rejeitada', cls: 'text-gray-500' },
        superseded: { text: 'Obsoleta', cls: 'text-rose-600' },
    };
    const s = map[status];
    return <span className={`text-sm font-normal ${s.cls}`}>{s.text}</span>;
};

export const CuradoriaTab: React.FC<Props> = ({ empreendimentoId, onChanged }) => {
    const confirm = useConfirm();
    const [filter, setFilter] = React.useState<Filter>('pending');
    const [proposals, setProposals] = React.useState<FieldProposal[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [busy, setBusy] = React.useState(false);
    const [notice, setNotice] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const notify = (msg: string, type: 'success' | 'error' = 'success') => {
        setNotice({ msg, type });
        setTimeout(() => setNotice(null), 5000);
    };

    const load = React.useCallback(async () => {
        setLoading(true);
        setSelected(new Set());
        try {
            const all = filter === 'pending'
                ? await empreendimentoProposalService.listPending(empreendimentoId)
                : (await empreendimentoProposalService.listDecided(empreendimentoId)).filter(p => p.status === filter);
            setProposals(all);
        } catch (err: any) {
            notify(err.message, 'error');
            setProposals([]);
        } finally {
            setLoading(false);
        }
    }, [empreendimentoId, filter]);

    React.useEffect(() => { load(); }, [load]);

    const isPending = filter === 'pending';

    // Agrupa pendentes por torre → grupo de campo, para o "aprovar toda a área da Torre A".
    const groups = React.useMemo(() => {
        const byTower = new Map<string, { towerName: string; items: FieldProposal[] }>();
        for (const p of proposals) {
            const key = p.tower_name || p.unit_name || '—';
            const g = byTower.get(key) ?? { towerName: key, items: [] };
            g.items.push(p);
            byTower.set(key, g);
        }
        return [...byTower.values()];
    }, [proposals]);

    const toggle = (id: string) => setSelected(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
    const toggleMany = (items: FieldProposal[]) => setSelected(prev => {
        const n = new Set(prev);
        const allOn = items.every(i => n.has(i.id));
        for (const i of items) allOn ? n.delete(i.id) : n.add(i.id);
        return n;
    });

    const doApprove = async () => {
        if (selected.size === 0) return;
        setBusy(true);
        try {
            const r = await empreendimentoProposalService.approve([...selected]);
            const parts: string[] = [];
            if (r.applied.length) parts.push(`${r.applied.length} aplicada(s)`);
            if (r.superseded.length) parts.push(`${r.superseded.length} obsoleta(s) — o valor mudou desde a detecção`);
            if (r.failed.length) parts.push(`${r.failed.length} com erro`);
            notify(parts.join(' · ') || 'Nada aplicado.', r.failed.length ? 'error' : 'success');
            await load();
            onChanged?.();
        } catch (err: any) {
            notify(err.message, 'error');
        } finally { setBusy(false); }
    };

    const doReject = async () => {
        if (selected.size === 0) return;
        const ok = await confirm({
            title: 'Rejeitar propostas?',
            message: `${selected.size} proposta(s) serão rejeitadas — o valor atual do empreendimento é mantido. Elas não reaparecem, a menos que a origem mude o valor de novo.`,
            confirmLabel: 'Rejeitar',
            variant: 'warning',
        });
        if (!ok) return;
        setBusy(true);
        try {
            const n = await empreendimentoProposalService.reject([...selected]);
            notify(`${n} proposta(s) rejeitada(s).`);
            await load();
            onChanged?.();
        } catch (err: any) {
            notify(err.message, 'error');
        } finally { setBusy(false); }
    };

    return (
        <div className="space-y-4">
            {/* Filtros */}
            <div className="flex items-center gap-1.5">
                {FILTERS.map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)}
                        className={`h-9 px-3.5 rounded-[6px] text-sm font-medium transition-all ${
                            filter === f.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : proposals.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <Inbox className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-500">
                        {isPending ? 'Nenhuma decisão pendente.' : 'Nada aqui.'}
                    </p>
                    {isPending && <p className="text-xs mt-1">Conflitos de sincronização aparecem aqui para você aprovar ou rejeitar.</p>}
                </div>
            ) : isPending ? (
                <div className="space-y-2.5">
                    {groups.map(group => {
                        const allOn = group.items.every(i => selected.has(i.id));
                        return (
                            <div key={group.towerName} className="rounded-[10px] border border-gray-100 overflow-hidden">
                                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50/60 border-b border-gray-100">
                                    <input type="checkbox" checked={allOn} onChange={() => toggleMany(group.items)}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                    <Building className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm font-bold text-gray-800">{group.towerName}</span>
                                    <span className="text-xs text-gray-400 font-medium">{group.items.length} campo(s)</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {group.items.map(p => (
                                        <label key={p.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50/50 cursor-pointer">
                                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)}
                                                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {p.unit_name && <span className="text-sm font-medium text-gray-800">{p.unit_name}</span>}
                                                    <span className="text-sm text-gray-600">{p.label}</span>
                                                    <span className="text-xs font-medium text-gray-400">{ORIGIN_LABEL[p.origin]} · {GROUP_LABEL[p.field_group]}</span>
                                                </div>
                                                <div className="mt-1 text-xs">
                                                    <span className="text-gray-400 line-through">{fmtVal(p.current_value)}</span>{' '}
                                                    <ArrowRight className="w-3 h-3 inline text-gray-300" />{' '}
                                                    <span className="text-gray-800 font-medium">{fmtVal(p.proposed_value)}</span>
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                // Histórico (decididas) — leitura simples, sem seleção.
                <div className="rounded-[10px] border border-gray-100 overflow-hidden divide-y divide-gray-100">
                    {proposals.map(p => (
                        <div key={p.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm text-gray-700">{p.label}</span>
                                    <span className="text-xs font-medium text-gray-400">{ORIGIN_LABEL[p.origin]}</span>
                                </div>
                                <div className="mt-1 text-xs">
                                    <span className="text-gray-400 line-through">{fmtVal(p.current_value)}</span>{' '}
                                    <ArrowRight className="w-3 h-3 inline text-gray-300" />{' '}
                                    <span className="text-gray-700 font-medium">{fmtVal(p.proposed_value)}</span>
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <StatusText status={p.status} />
                                <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1 justify-end mt-0.5">
                                    <Clock className="w-3 h-3" /> {fmtDate(p.decided_at)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Barra de ações em lote — fixa, só quando há seleção */}
            {isPending && selected.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                    <span className="text-sm font-bold whitespace-nowrap px-1">{selected.size} selecionada(s)</span>
                    <button onClick={doApprove} disabled={busy}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-700 rounded-[6px] font-medium text-[13px] hover:bg-blue-50 disabled:opacity-60 transition-all active:scale-95">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Aprovar
                    </button>
                    <button onClick={doReject} disabled={busy}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-500 rounded-[6px] font-medium text-[13px] hover:bg-blue-400 disabled:opacity-60 transition-all active:scale-95">
                        <XCircle className="w-3.5 h-3.5" /> Rejeitar
                    </button>
                </div>
            )}

            {notice && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
                    notice.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" /> {notice.msg}
                </div>
            )}
        </div>
    );
};

export default CuradoriaTab;
