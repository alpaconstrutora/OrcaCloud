import React, { useState, useEffect, useCallback } from 'react';
import {
    AlertTriangle, Landmark, FileWarning, Scale, RefreshCw,
    Plus, CheckCircle2, Undo2, RotateCcw, ArrowDownLeft, ArrowUpRight, Link2,
} from 'lucide-react';
import { divergenceService } from '../services/divergenceService';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { useConfirm } from './ui/confirm';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import Button from './ui/Button';
import { SYSTEM_PROJECT_NAMES_SQL } from '../utils/systemProjects';
import type {
    ReconciliationDivergences, BankWithoutInternal, InternalWithoutBank, ValueMismatch,
} from '../types/financial';

interface CreateForm {
    category: string;
    projectId: string;
    costCenterId: string;
    partyKey: string;   // `${type}:${id}` ou '' para sem contraparte
    description: string;
}

interface Party { id: string; name: string; type: 'CLIENT' | 'SUPPLIER' }

function formatBRL(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function formatDate(d?: string | null): string {
    if (!d) return '—';
    const [y, m, day] = d.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
}
function DirIcon({ dir }: { dir: 'CREDIT' | 'DEBIT' }) {
    return dir === 'CREDIT'
        ? <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
        : <ArrowUpRight className="w-4 h-4 text-red-500" />;
}

interface SectionProps {
    title: string;
    subtitle: string;
    count: number;
    icon: React.ElementType;
    accent: string;
    children: React.ReactNode;
}
function Section({ title, subtitle, count, icon: Icon, accent, children }: SectionProps) {
    const [open, setOpen] = useState(true);
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50/50">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-800">{title}</p>
                    <p className="text-xs text-gray-400 font-medium">{subtitle}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-black ${count > 0 ? accent : 'bg-gray-50 text-gray-300'}`}>
                    {count}
                </span>
            </button>
            {open && count > 0 && <div className="border-t border-gray-50 divide-y divide-gray-50">{children}</div>}
            {open && count === 0 && (
                <div className="border-t border-gray-50 px-5 py-6 text-center text-xs text-gray-300 font-semibold">
                    Nenhuma divergência deste tipo. 🎉
                </div>
            )}
        </div>
    );
}

interface DivergencesPanelProps {
    organizationId: string | null;
    onChanged?: () => void;
}

const DivergencesPanel: React.FC<DivergencesPanelProps> = ({ organizationId, onChanged }) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [data, setData] = useState<ReconciliationDivergences | null>(null);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    // Opções de classificação para o modal "Criar lançamento"
    const [categories, setCategories] = useState<string[]>([]);
    const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
    const [costCenters, setCostCenters] = useState<Array<{ id: string; name: string }>>([]);
    const [clients, setClients] = useState<Party[]>([]);
    const [suppliers, setSuppliers] = useState<Party[]>([]);
    const [formBank, setFormBank] = useState<BankWithoutInternal | null>(null);
    const [form, setForm] = useState<CreateForm>({ category: '', projectId: '', costCenterId: '', partyKey: '', description: '' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await divergenceService.getDivergences(organizationId));
        } catch (e) {
            console.error('[DivergencesPanel]', e);
            showToast('Erro ao carregar divergências', 'error');
        } finally {
            setLoading(false);
        }
    }, [organizationId, showToast]);

    const loadOptions = useCallback(async () => {
        if (!organizationId) return;
        try {
            const orgOrNull = `organization_id.eq.${organizationId},organization_id.is.null`;
            const [cats, projs, ccs, cls, sups] = await Promise.all([
                supabase.from('financial_categories').select('name').order('name', { ascending: true }),
                supabase.from('projects').select('id, name')
                    .filter('settings->>organizationId', 'eq', organizationId)
                    .not('name', 'in', SYSTEM_PROJECT_NAMES_SQL) // utils/systemProjects.ts
                    .order('name', { ascending: true }),
                supabase.from('cost_centers').select('id, name').eq('organization_id', organizationId).order('name', { ascending: true }),
                supabase.from('clients').select('id, name').or(orgOrNull).order('name', { ascending: true }),
                supabase.from('suppliers').select('id, name').or(orgOrNull).order('name', { ascending: true }),
            ]);
            if (cats.data) setCategories(cats.data.map(c => c.name).filter(Boolean));
            if (projs.data) setProjects(Array.from(new Map(projs.data.map(p => [p.name, p])).values()));
            if (ccs.data) setCostCenters(ccs.data);
            if (cls.data) setClients(cls.data.map(c => ({ id: c.id, name: c.name, type: 'CLIENT' as const })));
            if (sups.data) setSuppliers(sups.data.map(s => ({ id: s.id, name: s.name, type: 'SUPPLIER' as const })));
        } catch (e) {
            console.error('[DivergencesPanel] loadOptions', e);
        }
    }, [organizationId]);

    useEffect(() => { load(); loadOptions(); }, [load, loadOptions]);

    const run = async (key: string, fn: () => Promise<void>, okMsg: string) => {
        setBusyId(key);
        try {
            await fn();
            showToast(okMsg, 'success');
            await load();
            onChanged?.();
        } catch (e) {
            console.error('[DivergencesPanel] action', e);
            showToast('Erro ao executar ação', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const openCreateModal = (b: BankWithoutInternal) => {
        setFormBank(b);
        setForm({
            category: b.category || '',
            projectId: '',
            costCenterId: '',
            partyKey: '',
            description: b.description || '',
        });
    };

    const submitCreate = async () => {
        if (!formBank) return;
        const bank = formBank;
        // Resolve contraparte a partir do partyKey `${type}:${id}`
        let party: Party | undefined;
        if (form.partyKey) {
            const [type, id] = form.partyKey.split(':');
            const pool = type === 'CLIENT' ? clients : suppliers;
            party = pool.find(p => p.id === id);
        }
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        setFormBank(null);
        await run(bank.id, () => divergenceService.createInternalAndMatch(organizationId, bank, {
            category: form.category || undefined,
            project_id: form.projectId || null,
            cost_center_id: form.costCenterId || null,
            party_id: party?.id || null,
            party_name: party?.name || null,
            party_type: party?.type || null,
            description: form.description || undefined,
        }), 'Lançamento criado e conciliado');
    };

    // Contrapartes priorizadas pela direção: CREDIT→clientes, DEBIT→fornecedores
    const partyPrimary = formBank?.direction === 'CREDIT' ? clients : suppliers;
    const partySecondary = formBank?.direction === 'CREDIT' ? suppliers : clients;
    const partyPrimaryLabel = formBank?.direction === 'CREDIT' ? 'Clientes' : 'Fornecedores';
    const partySecondaryLabel = formBank?.direction === 'CREDIT' ? 'Fornecedores' : 'Clientes';

    const onConfirmNoTitle = async (b: BankWithoutInternal) => {
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        if (!await confirm({
            title: 'Confirmar sem título?',
            message: 'O movimento será marcado como conciliado sem gerar lançamento (use para tarifas/impostos já contabilizados).',
            confirmLabel: 'Confirmar',
        })) return;
        run(b.id, () => divergenceService.confirmWithoutTitle(organizationId, b.id), 'Movimento confirmado');
    };

    const onReverse = async (i: InternalWithoutBank) => {
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        if (!await confirm({
            title: 'Estornar título?',
            message: 'O lançamento será cancelado. Esta ação fica registrada na auditoria.',
            variant: 'warning', confirmLabel: 'Estornar',
        })) return;
        run(i.id, () => divergenceService.reverseInternal(organizationId, i.id), 'Título estornado');
    };

    const onReopen = (i: InternalWithoutBank) => {
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        run(i.id, () => divergenceService.reopenInternal(organizationId, i.id), 'Título reaberto');
    };

    const onReconcileDiff = async (m: ValueMismatch) => {
        if (!organizationId) { showToast('Selecione uma organização específica para esta ação.', 'error'); return; }
        if (!await confirm({
            title: 'Conciliar com diferença?',
            message: `Será criado o vínculo e um lançamento de ajuste de ${formatBRL(Math.abs(m.difference))} (tarifa/juros/desconto).`,
            confirmLabel: 'Conciliar',
        })) return;
        run(m.bank_id, () => divergenceService.reconcileWithDifference(organizationId, m), 'Conciliado com ajuste');
    };

    const c = data?.counts ?? { bank_without_internal: 0, internal_without_bank: 0, value_mismatch: 0 };
    const total = c.bank_without_internal + c.internal_without_bank + c.value_mismatch;

    return (
        <div className="space-y-4 min-h-[500px]">
            <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Gestão de Divergências
                    {total > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{total}</span>}
                </h4>
                <button
                    onClick={load}
                    disabled={loading}
                    className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-colors disabled:opacity-50"
                    title="Atualizar"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Tipo 1 — Movimento bancário sem lançamento */}
            <Section
                title="Movimento bancário sem lançamento"
                subtitle="Aparece no extrato mas não existe no sistema"
                count={c.bank_without_internal}
                icon={Landmark}
                accent="bg-blue-50 text-blue-600"
            >
                {(data?.bank_without_internal ?? []).map(b => (
                    <div key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                        <DirIcon dir={b.direction} />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800 truncate">{b.description}</p>
                            <p className="text-xs text-gray-400 font-medium">{b.account_name} · {formatDate(b.transaction_date)}</p>
                        </div>
                        <span className={`tabular-nums font-black text-sm ${b.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatBRL(b.amount)}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => openCreateModal(b)}
                                disabled={busyId === b.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-button font-bold hover:bg-blue-100 disabled:opacity-50"
                            >
                                <Plus className="w-3.5 h-3.5" /> Criar lançamento
                            </button>
                            <button
                                onClick={() => onConfirmNoTitle(b)}
                                disabled={busyId === b.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-button font-bold hover:bg-gray-100 disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Sem título
                            </button>
                        </div>
                    </div>
                ))}
            </Section>

            {/* Tipo 2 — Lançamento sem movimento bancário */}
            <Section
                title="Título sem movimento bancário"
                subtitle="Lançamento pendente/vencido que nunca apareceu no extrato"
                count={c.internal_without_bank}
                icon={FileWarning}
                accent="bg-amber-50 text-amber-600"
            >
                {(data?.internal_without_bank ?? []).map(i => (
                    <div key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                        <DirIcon dir={i.direction} />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800 truncate">{i.description || i.party_name || 'Lançamento'}</p>
                            <p className="text-xs text-gray-400 font-medium">
                                {i.party_name ? `${i.party_name} · ` : ''}venc. {formatDate(i.ref_date)}
                                {i.days_overdue > 0 && <span className="text-red-400 font-bold"> · {i.days_overdue}d em atraso</span>}
                            </p>
                        </div>
                        <span className={`tabular-nums font-black text-sm ${i.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatBRL(i.amount)}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => onReverse(i)}
                                disabled={busyId === i.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 text-button font-bold hover:bg-red-100 disabled:opacity-50"
                            >
                                <Undo2 className="w-3.5 h-3.5" /> Estornar
                            </button>
                            <button
                                onClick={() => onReopen(i)}
                                disabled={busyId === i.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-button font-bold hover:bg-gray-100 disabled:opacity-50"
                            >
                                <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                            </button>
                        </div>
                    </div>
                ))}
            </Section>

            {/* Tipo 3 — Diferença de valor */}
            <Section
                title="Diferença de valor"
                subtitle="Mesmo título com valor divergente (tarifa, juros ou desconto)"
                count={c.value_mismatch}
                icon={Scale}
                accent="bg-purple-50 text-purple-600"
            >
                {(data?.value_mismatch ?? []).map(m => (
                    <div key={m.bank_id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                        <DirIcon dir={m.direction} />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800 truncate">{m.bank_description}</p>
                            <p className="text-xs text-gray-400 font-medium">
                                Sistema {formatBRL(m.internal_amount)} · Banco {formatBRL(m.bank_amount)} · {m.account_name}
                            </p>
                        </div>
                        <span className="tabular-nums font-black text-sm text-purple-600">
                            Δ {formatBRL(Math.abs(m.difference))}
                        </span>
                        <button
                            onClick={() => onReconcileDiff(m)}
                            disabled={busyId === m.bank_id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-button font-bold hover:bg-purple-100 disabled:opacity-50"
                        >
                            <Link2 className="w-3.5 h-3.5" /> Conciliar com diferença
                        </button>
                    </div>
                ))}
            </Section>

            {/* Modal: classificar lançamento antes de criar */}
            <Modal open={!!formBank} onClose={() => setFormBank(null)} size="md" dismissable={false}>
                <ModalHeader
                    title="Criar lançamento"
                    description="Classifique o lançamento que será gerado e conciliado com o movimento bancário."
                    icon={<div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Plus className="w-5 h-5 text-blue-600" /></div>}
                    onClose={() => setFormBank(null)}
                />
                <ModalBody className="space-y-4">
                    {formBank && (
                        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">{formBank.description}</p>
                                <p className="text-xs text-gray-400 font-medium">{formBank.account_name} · {formatDate(formBank.transaction_date)}</p>
                            </div>
                            <span className={`tabular-nums font-black text-sm ${formBank.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatBRL(formBank.amount)}
                            </span>
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Categoria</label>
                        <input
                            list="divergence-categories"
                            value={form.category}
                            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                            placeholder="Geral"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <datalist id="divergence-categories">
                            {categories.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Obra / Projeto</label>
                        <select
                            value={form.projectId}
                            onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">— Sem obra —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Centro de Custo</label>
                            <select
                                value={form.costCenterId}
                                onChange={e => setForm(f => ({ ...f, costCenterId: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">— Sem CC —</option>
                                {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Contraparte</label>
                            <select
                                value={form.partyKey}
                                onChange={e => setForm(f => ({ ...f, partyKey: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">— Sem contraparte —</option>
                                {partyPrimary.length > 0 && (
                                    <optgroup label={partyPrimaryLabel}>
                                        {partyPrimary.map(p => <option key={p.type + p.id} value={`${p.type}:${p.id}`}>{p.name}</option>)}
                                    </optgroup>
                                )}
                                {partySecondary.length > 0 && (
                                    <optgroup label={partySecondaryLabel}>
                                        {partySecondary.map(p => <option key={p.type + p.id} value={`${p.type}:${p.id}`}>{p.name}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Descrição</label>
                        <input
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </ModalBody>
                <ModalFooter>
                    <button
                        onClick={() => setFormBank(null)}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100"
                    >
                        Cancelar
                    </button>
                    <Button onClick={submitCreate}>
                        <Plus className="w-4 h-4" /> Criar e conciliar
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
};

export default DivergencesPanel;
