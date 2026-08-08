import React from 'react';
import {
    Plus, Loader2, AlertTriangle, CheckCircle2, Clock, Archive, Pause,
    Trash2, Save, X, Pencil, TrendingUp, Lock,
} from 'lucide-react';
import {
    salesPlanService, simulatePayment, computeRentability,
    type SalesPlan, type SalesPlanStatus, type UnitCostBasis,
} from '../services/salesPlanService';
import { commercialPriceTableService, type CommercialPriceTable } from '../services/commercialPriceTableService';
import { commercialService } from '../services/commercialService';
import { financialApprovalService } from '../services/financialApprovalService';
import type { Property } from '../types';
import type { IndexName } from '../services/contractIndexService';

interface Scenario {
    discountPct: number; downPct: number; installments: number;
    keysPct: number; correctionPct: number; opportunityPct: number;
}
const DEFAULT_SCENARIO: Scenario = {
    discountPct: 0, downPct: 20, installments: 60, keysPct: 0, correctionPct: 0, opportunityPct: 1,
};
type ApprovalLevels = { required_levels: number; level1_label: string; level2_label: string };
const SCENARIO_LABEL = ['A', 'B', 'C'];

interface Props {
    organizationId: string;
    buildingId: string;
    buildingName: string;
}

const STATUS_LABEL: Record<SalesPlanStatus, string> = {
    draft: 'Rascunho', active: 'Ativo', suspended: 'Suspenso', closed: 'Encerrado',
};
const STATUS_STYLE: Record<SalesPlanStatus, string> = {
    draft: 'bg-amber-50 text-amber-700', active: 'bg-emerald-50 text-emerald-700',
    suspended: 'bg-orange-50 text-orange-700', closed: 'bg-gray-100 text-gray-500',
};
const INDEX_OPTIONS: IndexName[] = ['INCC', 'INCC-M', 'IPCA', 'IGP-M', 'CUB', 'OUTROS'];

const emptyPlan = (organizationId: string, buildingId: string): Partial<SalesPlan> => ({
    organization_id: organizationId,
    building_id: buildingId,
    name: '',
    effective_start: new Date().toISOString().slice(0, 10),
    min_down_payment_pct: 20,
    max_installments: 60,
    max_discount_pct: 5,
    max_intermediary_count: 0,
    keys_pct: 0,
    interest_rate_monthly: 0,
    commission_pct: 5,
    status: 'draft',
});

const fmtDate = (d?: string | null) =>
    d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—';

const fmtMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const SalesPlanManager: React.FC<Props> = ({ organizationId, buildingId, buildingName }) => {
    const [plans, setPlans] = React.useState<SalesPlan[]>([]);
    const [priceTables, setPriceTables] = React.useState<CommercialPriceTable[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [editing, setEditing] = React.useState<Partial<SalesPlan> | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [tab, setTab] = React.useState<'plans' | 'rentability'>('plans');

    const reload = React.useCallback(async () => {
        setLoading(true);
        try {
            const [p, t] = await Promise.all([
                salesPlanService.list(buildingId),
                commercialPriceTableService.listTables(buildingId).catch(() => []),
            ]);
            setPlans(p);
            setPriceTables(t);
            setError(null);
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao carregar planos de vendas.');
        } finally {
            setLoading(false);
        }
    }, [buildingId]);

    React.useEffect(() => { reload(); }, [reload]);

    const handleSave = async () => {
        if (!editing) return;
        if (!editing.name || editing.name.trim().length < 2) {
            setError('Informe um nome para o plano.');
            return;
        }
        setSaving(true);
        try {
            await salesPlanService.save(editing);
            setEditing(null);
            await reload();
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao salvar o plano.');
        } finally {
            setSaving(false);
        }
    };

    const handleStatus = async (id: string, status: SalesPlanStatus) => {
        try {
            await salesPlanService.setStatus(id, status);
            await reload();
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao alterar status.');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await salesPlanService.remove(id);
            await reload();
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao excluir (apenas rascunhos podem ser excluídos).');
        }
    };

    const setField = <K extends keyof SalesPlan>(k: K, v: SalesPlan[K]) =>
        setEditing(prev => (prev ? { ...prev, [k]: v } : prev));

    // ── Rentabilidade + Cenários + Alçadas (F2 + F3) ────────────────────────
    const [units, setUnits] = React.useState<Property[]>([]);
    const [unitsLoaded, setUnitsLoaded] = React.useState(false);
    const [selUnitId, setSelUnitId] = React.useState('');
    const [scenarios, setScenarios] = React.useState<Scenario[]>([{ ...DEFAULT_SCENARIO }]);
    const [approvals, setApprovals] = React.useState<(ApprovalLevels | null)[]>([]);
    const [cost, setCost] = React.useState<UnitCostBasis | null>(null);
    const [costErr, setCostErr] = React.useState<string | null>(null);
    const [costLoading, setCostLoading] = React.useState(false);

    // Troca de prédio invalida a lista de unidades e a seleção.
    React.useEffect(() => {
        setUnitsLoaded(false);
        setUnits([]);
        setSelUnitId('');
    }, [buildingId]);

    // Carrega as unidades do prédio só quando a aba é aberta pela 1ª vez.
    React.useEffect(() => {
        if (tab !== 'rentability' || unitsLoaded) return;
        let alive = true;
        (async () => {
            try {
                const all = await commercialService.listProperties(organizationId);
                if (!alive) return;
                setUnits(all.filter(p => p.parent_id === buildingId && p.type !== 'BUILDING'));
            } catch { /* silencioso: a UI mostra "nenhuma unidade" */ }
            finally { if (alive) setUnitsLoaded(true); }
        })();
        return () => { alive = false; };
    }, [tab, unitsLoaded, organizationId, buildingId]);

    // Busca o custo da unidade selecionada. A RPC recusa corretor → costErr.
    React.useEffect(() => {
        if (!selUnitId) { setCost(null); setCostErr(null); return; }
        let alive = true;
        setCostLoading(true); setCostErr(null);
        salesPlanService.getUnitCostBasis(selUnitId)
            .then(c => { if (alive) setCost(c); })
            .catch(e => { if (alive) { setCost(null); setCostErr(e?.message ?? 'Erro ao obter custo.'); } })
            .finally(() => { if (alive) setCostLoading(false); });
        return () => { alive = false; };
    }, [selUnitId]);

    const selUnit = units.find(u => u.id === selUnitId);
    const unitPrice = selUnit ? (selUnit.current_price ?? selUnit.price ?? 0) : 0;

    // Uma simulação + margem por cenário.
    const results = React.useMemo(() => scenarios.map(s => {
        const sim = simulatePayment({
            unitPrice,
            discountPct: s.discountPct,
            downPaymentPct: s.downPct,
            monthlyInstallments: s.installments,
            keysPct: s.keysPct,
            correctionRateMonthly: s.correctionPct / 100,
            opportunityRateMonthly: s.opportunityPct / 100,
        });
        const rent = cost?.hasCost && cost.costBasis != null ? computeRentability(sim, cost.costBasis) : null;
        return { sim, rent };
    }), [unitPrice, scenarios, cost]);

    // Alçada por cenário — reusa fn_resolve_approval_levels. O valor de gatilho é
    // o desconto ECONÔMICO (R$): é o que a incorporadora "abre mão", não o % nominal.
    React.useEffect(() => {
        if (!selUnit) { setApprovals([]); return; }
        let alive = true;
        Promise.all(results.map(r =>
            financialApprovalService.resolveRequiredLevels(organizationId, r.sim.economicDiscount).catch(() => null)
        )).then(a => { if (alive) setApprovals(a); });
        return () => { alive = false; };
    }, [results, selUnit, organizationId]);

    const addScenario = () => setScenarios(s => s.length >= 3 ? s : [...s, { ...s[s.length - 1] }]);
    const removeScenario = (i: number) => setScenarios(s => s.length <= 1 ? s : s.filter((_, k) => k !== i));
    const patchScenario = (i: number, patch: Partial<Scenario>) =>
        setScenarios(s => s.map((sc, k) => k === i ? { ...sc, ...patch } : sc));

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6">
            {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-[10px] px-4 py-3 text-sm text-rose-700 font-medium flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}

            {/* Barra de abas (§19.1) */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {([['plans', 'Planos'], ['rentability', 'Rentabilidade']] as const).map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                tab === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'plans' && <>
            {/* Lista de planos */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Planos de Vendas — {buildingName}</h3>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                            A política comercial: desconto máximo, entrada mínima, prazo, índice e comissão. O simulador do corretor aplica estes limites.
                        </p>
                    </div>
                    <button
                        onClick={() => setEditing(emptyPlan(organizationId, buildingId))}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider"
                    >
                        <Plus className="w-4 h-4" /> Novo Plano
                    </button>
                </div>

                {plans.length === 0 ? (
                    <p className="text-xs text-gray-400 font-medium py-6 text-center">Nenhum plano de vendas criado ainda.</p>
                ) : (
                    <div className="space-y-2">
                        {plans.map(p => (
                            <div key={p.id} className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-all">
                                {p.status === 'active' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                    : p.status === 'draft' ? <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                                    : p.status === 'suspended' ? <Pause className="w-4 h-4 text-orange-500 shrink-0" />
                                    : <Archive className="w-4 h-4 text-gray-400 shrink-0" />}
                                <span className="text-sm font-black text-gray-800">{p.name}</span>
                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                                <span className="text-[11px] text-gray-400 font-medium">
                                    Desc. máx {p.max_discount_pct}% · Entrada mín {p.min_down_payment_pct}% · {p.max_installments}x · Com. {p.commission_pct}%
                                </span>
                                <span className="text-[11px] text-gray-400 font-medium">
                                    {fmtDate(p.effective_start)}{p.effective_end ? ` → ${fmtDate(p.effective_end)}` : ''}
                                </span>
                                <div className="ml-auto flex items-center gap-1.5">
                                    <button onClick={() => setEditing(p)} title="Editar" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    {p.status === 'draft' && (
                                        <button onClick={() => handleStatus(p.id, 'active')} className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Ativar</button>
                                    )}
                                    {p.status === 'active' && (
                                        <button onClick={() => handleStatus(p.id, 'suspended')} className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-orange-50 text-orange-700 hover:bg-orange-100">Suspender</button>
                                    )}
                                    {p.status === 'suspended' && (
                                        <button onClick={() => handleStatus(p.id, 'active')} className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Reativar</button>
                                    )}
                                    {(p.status === 'active' || p.status === 'suspended') && (
                                        <button onClick={() => handleStatus(p.id, 'closed')} className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-gray-100 text-gray-500 hover:bg-gray-200">Encerrar</button>
                                    )}
                                    {p.status === 'draft' && (
                                        <button onClick={() => handleDelete(p.id)} title="Excluir rascunho" className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Form de edição/criação */}
            {editing && (
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
                    <div className="flex items-center justify-between">
                        <h4 className="font-black text-gray-900 text-sm uppercase tracking-wider">
                            {editing.id ? 'Editar plano' : 'Novo plano'}
                        </h4>
                        <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Nome do plano *">
                            <input type="text" value={editing.name ?? ''} onChange={e => setField('name', e.target.value)}
                                className={inputCls} placeholder="Ex.: Plano Lançamento" />
                        </Field>
                        <Field label="Tabela de preços (opcional)">
                            <select value={editing.price_table_id ?? ''} onChange={e => setField('price_table_id', e.target.value || null)} className={inputCls}>
                                <option value="">Usar preço vigente da unidade</option>
                                {priceTables.map(t => <option key={t.id} value={t.id}>{t.version_label} ({t.status})</option>)}
                            </select>
                        </Field>
                        <Field label="Vigência — início">
                            <input type="date" value={editing.effective_start ?? ''} onChange={e => setField('effective_start', e.target.value)} className={inputCls} />
                        </Field>
                        <Field label="Vigência — fim (opcional)">
                            <input type="date" value={editing.effective_end ?? ''} onChange={e => setField('effective_end', e.target.value || null)} className={inputCls} />
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <NumField label="Entrada mín (%)" value={editing.min_down_payment_pct} onChange={v => setField('min_down_payment_pct', v)} />
                        <NumField label="Prazo máx (x)" value={editing.max_installments} onChange={v => setField('max_installments', v)} step={1} />
                        <NumField label="Desconto máx (%)" value={editing.max_discount_pct} onChange={v => setField('max_discount_pct', v)} />
                        <NumField label="Parcela mín (R$)" value={editing.min_installment_value ?? undefined} onChange={v => setField('min_installment_value', v)} />
                        <NumField label="Intermediárias máx" value={editing.max_intermediary_count} onChange={v => setField('max_intermediary_count', v)} step={1} />
                        <NumField label="Chaves (%)" value={editing.keys_pct} onChange={v => setField('keys_pct', v)} />
                        <NumField label="Comissão (%)" value={editing.commission_pct} onChange={v => setField('commission_pct', v)} />
                        <Field label="Índice de correção">
                            <select value={editing.index_name ?? ''} onChange={e => setField('index_name', (e.target.value || null) as IndexName)} className={inputCls}>
                                <option value="">Nenhum</option>
                                {INDEX_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                            </select>
                        </Field>
                        <NumField label="Juros a.m. (%)" value={editing.interest_rate_monthly} onChange={v => setField('interest_rate_monthly', v)} step={0.01} />
                        <NumField label="Custo de capital a.m. (%)" value={editing.opportunity_rate_monthly ?? undefined} onChange={v => setField('opportunity_rate_monthly', v)} step={0.01} />
                    </div>
                    <p className="text-[11px] text-gray-400 font-medium -mt-1">
                        Custo de capital é a taxa de desconto do VPL — revela o desconto econômico de uma proposta parcelada. Se vazio, o simulador usa 1% a.m.
                    </p>

                    <Field label="Descrição (opcional)">
                        <textarea value={editing.description ?? ''} onChange={e => setField('description', e.target.value)} rows={2} className={inputCls} />
                    </Field>

                    <div className="flex justify-end gap-3">
                        <button onClick={() => setEditing(null)} className="px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-gray-100 text-gray-600 hover:bg-gray-200">Cancelar</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
                        </button>
                    </div>
                </div>
            )}
            </>}

            {tab === 'rentability' && (
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-6">
                    <div>
                        <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-600" /> Rentabilidade — {buildingName}
                        </h3>
                        <p className="text-sm text-gray-400 font-medium mt-0.5 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" /> Custo e margem são visíveis só para gestão — o corretor nunca vê.
                        </p>
                    </div>

                    {/* Seleção de unidade */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Unidade">
                            <select value={selUnitId} onChange={e => setSelUnitId(e.target.value)} className={inputCls}>
                                <option value="">
                                    {unitsLoaded ? (units.length ? 'Selecione uma unidade' : 'Nenhuma unidade neste prédio') : 'Carregando…'}
                                </option>
                                {units.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.name} — {fmtMoney(u.current_price ?? u.price ?? 0)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <div className="flex items-end">
                            <p className="text-sm font-normal text-gray-500">
                                Preço de tabela: <span className="font-medium text-gray-800">{selUnit ? fmtMoney(unitPrice) : '—'}</span>
                            </p>
                        </div>
                    </div>

                    {/* Estado do custo */}
                    {selUnit && costLoading && (
                        <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
                            <Loader2 className="w-4 h-4 animate-spin" /> Calculando custo…
                        </div>
                    )}
                    {selUnit && costErr && (
                        <div className="bg-rose-50 border border-rose-200 rounded-[10px] px-4 py-3 text-sm text-rose-700 font-medium flex items-start gap-2">
                            <Lock className="w-4 h-4 shrink-0 mt-0.5" /> {costErr}
                        </div>
                    )}
                    {selUnit && cost && !cost.hasCost && (
                        <div className="bg-amber-50 border border-amber-200 rounded-[10px] px-4 py-3 text-sm text-amber-700 font-medium flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            Unidade sem custo cadastrado — a margem não aparece. Informe o custo/m² na unidade do empreendimento vinculada.
                        </div>
                    )}

                    {!selUnit ? (
                        <p className="text-sm text-gray-400 font-medium py-4 text-center">Selecione uma unidade para comparar cenários.</p>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-black text-gray-800">Cenários</h4>
                                {scenarios.length < 3 && (
                                    <button onClick={addScenario}
                                        className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium text-[13px] transition-all active:scale-95">
                                        <Plus className="w-[15px] h-[15px]" /> Cenário
                                    </button>
                                )}
                            </div>
                            <div className={`grid grid-cols-1 ${scenarios.length === 2 ? 'lg:grid-cols-2' : scenarios.length >= 3 ? 'lg:grid-cols-3' : ''} gap-4`}>
                                {scenarios.map((s, i) => (
                                    <ScenarioCard
                                        key={i}
                                        idx={i}
                                        scenario={s}
                                        result={results[i]}
                                        approval={approvals[i]}
                                        cost={cost}
                                        canRemove={scenarios.length > 1}
                                        onChange={patch => patchScenario(i, patch)}
                                        onRemove={() => removeScenario(i)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const inputCls = 'w-full p-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all text-sm font-medium';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
        {children}
    </div>
);

const NumField: React.FC<{ label: string; value?: number; onChange: (v: number) => void; step?: number }> = ({ label, value, onChange, step = 0.5 }) => (
    <Field label={label}>
        <input type="number" step={step} value={value ?? ''} onChange={e => onChange(Number(e.target.value))} className={inputCls} />
    </Field>
);

const Metric: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({ label, value, sub, color = 'text-gray-900' }) => (
    <div className="bg-gray-50 rounded-[10px] p-4">
        <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 font-medium mt-0.5">{sub}</p>}
    </div>
);

// Linha de alçada por cenário. approval=undefined → ainda resolvendo;
// approval=null → nenhuma faixa configurada casou (aprovação direta).
const ApprovalLine: React.FC<{ approval: ApprovalLevels | null | undefined }> = ({ approval }) => {
    if (approval === undefined) return <p className="text-xs text-gray-400 font-medium">Resolvendo alçada…</p>;
    if (approval === null) return (
        <p className="text-sm font-normal text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovação direta (sem faixa)
        </p>
    );
    const labels = approval.required_levels >= 2
        ? `${approval.level1_label} + ${approval.level2_label}`
        : approval.level1_label;
    return (
        <p className="text-sm font-normal text-amber-700 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Requer {approval.required_levels} nível(is): {labels}
        </p>
    );
};

const ScenarioCard: React.FC<{
    idx: number;
    scenario: Scenario;
    result?: { sim: ReturnType<typeof simulatePayment>; rent: ReturnType<typeof computeRentability> | null };
    approval: ApprovalLevels | null | undefined;
    cost: UnitCostBasis | null;
    canRemove: boolean;
    onChange: (patch: Partial<Scenario>) => void;
    onRemove: () => void;
}> = ({ idx, scenario: s, result, approval, cost, canRemove, onChange, onRemove }) => {
    const sim = result?.sim;
    const rent = result?.rent ?? null;
    return (
        <div className="border border-gray-200 rounded-[10px] p-4 space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-sm font-black text-gray-800">Cenário {SCENARIO_LABEL[idx] ?? idx + 1}</span>
                {canRemove && (
                    <button onClick={onRemove} title="Remover cenário" className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <NumField label="Desconto (%)" value={s.discountPct} onChange={v => onChange({ discountPct: v })} />
                <NumField label="Entrada (%)" value={s.downPct} onChange={v => onChange({ downPct: v })} />
                <NumField label="Parcelas (x)" value={s.installments} onChange={v => onChange({ installments: v })} step={1} />
                <NumField label="Chaves (%)" value={s.keysPct} onChange={v => onChange({ keysPct: v })} />
                <NumField label="Correção a.m. (%)" value={s.correctionPct} onChange={v => onChange({ correctionPct: v })} step={0.01} />
                <NumField label="Custo capital a.m. (%)" value={s.opportunityPct} onChange={v => onChange({ opportunityPct: v })} step={0.01} />
            </div>

            {sim && (
                <div className="space-y-2 border-t border-gray-100 pt-3">
                    <Row label="Valor após desconto" value={fmtMoney(sim.totalValue)} />
                    <Row label="VPL da proposta" value={fmtMoney(sim.presentValue)} color="text-blue-600" />
                    <Row label="Desconto econômico" value={`${sim.economicDiscountPct.toFixed(1)}% · ${fmtMoney(sim.economicDiscount)}`} color="text-amber-700" />
                    {rent ? (
                        <>
                            <Row label="Margem econômica (VPL)" value={`${rent.economicMarginPct.toFixed(1)}% · ${fmtMoney(rent.economicMargin)}`} color={rent.economicMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
                            <Row label="Markup s/ custo" value={`${rent.markupPct.toFixed(1)}%`} color={rent.markupPct >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
                            {rent.economicMargin < 0 && (
                                <p className="text-xs text-rose-600 font-medium flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Prejuízo econômico
                                </p>
                            )}
                        </>
                    ) : cost && !cost.hasCost ? (
                        <Row label="Margem" value="sem custo" color="text-gray-400" />
                    ) : null}
                    <div className="pt-1"><ApprovalLine approval={approval} /></div>
                </div>
            )}
        </div>
    );
};

const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = 'text-gray-800' }) => (
    <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-normal text-gray-500">{label}</span>
        <span className={`text-sm font-medium ${color}`}>{value}</span>
    </div>
);

export default SalesPlanManager;
