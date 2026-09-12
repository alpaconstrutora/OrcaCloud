import React, { useState, useEffect } from 'react';
import {
    Percent, Save, RotateCcw, Calculator, Check, X,
    Info, AlertCircle, ChevronRight, TrendingUp, Calendar, Loader2, RefreshCw, FileText
} from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import TabsBar from './ui/TabsBar';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import {
    TerceiroTax,
    TERCEIROS_TAXES_DEFAULT,
    getOrgTerceirosTaxes,
    saveOrgTerceirosTaxes,
    payrollService,
} from '../services/payrollService';
import { supabase } from '../lib/supabase';
import LaborEncargosINSS from './LaborEncargosINSS';
import LaborFolhaEmpregado from './LaborFolhaEmpregado';
import LaborEncargosProlabore from './LaborEncargosProlabore';

type EncargosTab = 'contribuicoes' | 'inss' | 'folha' | 'prolabore';

interface LaborEncargosProps {
    orgId: string | null;
    organizations: Array<{ id: string; name: string }>;
    onRefresh: () => void;
}

// Colunas das tabelas padrão (§6.10)
const TERCEIROS_COLUMNS: StandardTableColumn[] = [
    { key: 'codigo', label: 'Código', sortable: true, width: 120 },
    { key: 'descricao', label: 'Descrição', sortable: true, width: 320 },
    { key: 'aliquota', label: 'Alíquota', sortable: true, width: 180, align: 'right' },
];
const PATRONAIS_COLUMNS: StandardTableColumn[] = [
    { key: 'codigo', label: 'Código', sortable: true, width: 110 },
    { key: 'descricao', label: 'Descrição', sortable: true, width: 260 },
    { key: 'base', label: 'Base de cálculo', sortable: true, width: 170 },
    { key: 'aliquota', label: 'Alíquota (ref.)', sortable: true, width: 140, align: 'right' },
];

// Encargos patronais — referência legal (BR), não editáveis aqui (gerenciados via Rubricas)
const ENCARGOS_PATRONAIS_REF = [
    { code: 'INSS',    name: 'INSS Patronal',               rate: 0.20,  base: 'Salário bruto',     obs: 'Regime Geral' },
    { code: 'FGTS',    name: 'FGTS',                        rate: 0.08,  base: 'Salário bruto',     obs: 'Depósito mensal' },
    { code: 'RAT',     name: 'RAT (Acidentário)',            rate: 0.03,  base: 'Salário bruto',     obs: 'Risco médio — variável por CNAE' },
    { code: '1/3FER',  name: '1/3 Férias',                  rate: 0.111, base: 'Salário bruto',     obs: 'Provisão mensal' },
    { code: '13SAL',   name: '13º Salário',                  rate: 0.0833,base: 'Salário bruto',     obs: 'Provisão mensal' },
    { code: 'FGTS13',  name: 'FGTS sobre 13º',              rate: 0.08,  base: '13º Salário',       obs: 'FGTS sobre provisão' },
];

const fmt = (v: number) => `${(v * 100).toFixed(2).replace('.', ',')}%`;
const fmtCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface PayrollSummary {
    runId: string;
    status: string;
    gross: number;
    net: number;
    employerCost: number;
    headcount: number;
}

const LaborEncargos: React.FC<LaborEncargosProps> = ({ orgId, organizations, onRefresh }) => {
    const [activeTab, setActiveTab] = useState<EncargosTab>('contribuicoes');

    // ── Competência compartilhada entre sub-abas ──
    const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));

    // ── Contribuições de Terceiros ──
    const [taxes, setTaxes] = useState<TerceiroTax[]>([]);
    const [editing, setEditing] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [dirty, setDirty] = useState(false);
    const [saved, setSaved] = useState(false);
    const [payrollSummary, setPayrollSummary] = useState<PayrollSummary | null>(null);
    const [loadingPayroll, setLoadingPayroll] = useState(false);
    const [payrollError, setPayrollError] = useState<string | null>(null);

    // Calculadora — calcGross é a string do input; calcGrossNum é o número real usado nos cálculos
    const [calcGross, setCalcGross] = useState('');
    const [calcGrossNum, setCalcGrossNum] = useState(0);
    const [manualInput, setManualInput] = useState(false);

    useEffect(() => {
        setTaxes(getOrgTerceirosTaxes(orgId));
    }, [orgId]);

    useEffect(() => {
        if (orgId) fetchPayrollForPeriod();
    }, [orgId, period]);

    const fetchPayrollForPeriod = async () => {
        setLoadingPayroll(true);
        setPayrollError(null);
        setPayrollSummary(null);
        try {
            const [y, m] = period.split('-');
            const firstDay = `${y}-${m}-01`;
            const lastDay  = new Date(Number(y), Number(m), 0).toISOString().slice(0, 10);

            // Busca folha FECHADA da org no período
            const runs = await payrollService.listRuns(orgId, undefined, firstDay, lastDay);
            const closed = runs.filter(r => r.status === 'FECHADO' && r.type === 'mensal');

            if (closed.length === 0) {
                setPayrollError('Nenhuma folha mensal fechada encontrada para este período.');
                setLoadingPayroll(false);
                return;
            }

            // Agrega resultados de todas as folhas fechadas do período
            let totalGross = 0, totalNet = 0, totalEmployerCost = 0, headcount = 0;
            let firstRunId = closed[0].id;

            for (const run of closed) {
                const { data: results } = await supabase
                    .from('payroll_results')
                    .select('gross, net, employer_cost')
                    .eq('payroll_run_id', run.id);
                if (results) {
                    for (const r of results) {
                        totalGross       += r.gross        || 0;
                        totalNet         += r.net          || 0;
                        totalEmployerCost += r.employer_cost || 0;
                    }
                    headcount += results.length;
                }
            }

            setPayrollSummary({
                runId: firstRunId,
                status: 'FECHADO',
                gross: totalGross,
                net: totalNet,
                employerCost: totalEmployerCost,
                headcount,
            });
            setCalcGrossNum(totalGross);
            setCalcGross(fmtCurrency(totalGross));
            setManualInput(false);
        } catch (err: any) {
            setPayrollError('Erro ao buscar dados da folha.');
        } finally {
            setLoadingPayroll(false);
        }
    };

    const totalTerceiroRate = taxes.reduce((s, t) => s + t.rate, 0);
    const totalPatronalRate = ENCARGOS_PATRONAIS_REF.reduce((s, t) => s + t.rate, 0);
    const totalGlobalRate   = totalTerceiroRate + totalPatronalRate;

    const handleStartEdit = (code: string, currentRate: number) => {
        setEditing(code);
        setEditValue((currentRate * 100).toFixed(2));
    };

    const handleConfirmEdit = (code: string) => {
        const parsed = parseFloat(editValue.replace(',', '.'));
        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
            alert('Alíquota inválida. Informe um valor entre 0 e 100.');
            return;
        }
        setTaxes(prev => prev.map(t => t.code === code ? { ...t, rate: parsed / 100 } : t));
        setEditing(null);
        setDirty(true);
        setSaved(false);
    };

    const handleSave = () => {
        saveOrgTerceirosTaxes(orgId, taxes);
        setDirty(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleReset = () => {
        setTaxes(TERCEIROS_TAXES_DEFAULT.map(t => ({ ...t })));
        setDirty(true);
        setSaved(false);
        setEditing(null);
    };


    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* 1. Título */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Encargos Sociais</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Contribuições de terceiros, INSS e encargos patronais por competência.</p>
            </div>

            {/* Toolbar de abas (§19.1) — competência compartilhada à direita (escopo, §5.3) */}
            <TabsBar<EncargosTab>
                tabs={[
                    { id: 'contribuicoes', label: 'Contribuições Sociais', icon: <Percent className="w-4 h-4" /> },
                    { id: 'inss', label: 'Encargos de INSS', icon: <FileText className="w-4 h-4" /> },
                    { id: 'folha', label: 'Relação por Empregado', icon: <FileText className="w-4 h-4" /> },
                    { id: 'prolabore', label: 'Pró-labore', icon: <TrendingUp className="w-4 h-4" /> },
                ]}
                value={activeTab}
                onChange={setActiveTab}
            >
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Competência
                </label>
                <input
                    type="month"
                    value={period}
                    onChange={e => { setPeriod(e.target.value); setManualInput(false); }}
                    className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
            </TabsBar>

            {/* ── ABA: ENCARGOS DE INSS ── */}
            {activeTab === 'inss' && (
                <LaborEncargosINSS orgId={orgId} period={period} />
            )}

            {/* ── ABA: RELAÇÃO POR EMPREGADO ── */}
            {activeTab === 'folha' && (
                <LaborFolhaEmpregado orgId={orgId} period={period} />
            )}

            {/* ── ABA: PRÓ-LABORE (Remuneração Societária) ── */}
            {activeTab === 'prolabore' && (
                <LaborEncargosProlabore orgId={orgId} period={period} />
            )}

            {/* ── ABA: CONTRIBUIÇÕES SOCIAIS ── */}
            {activeTab === 'contribuicoes' && (<>

            {/* Header Summary — KpiCard (guia §4) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCard label="Contrib. de Terceiros" value={fmt(totalTerceiroRate)} sub="sobre a folha bruta" icon={<Percent />} color="purple" />
                <KpiCard label="Encargos Patronais" value={fmt(totalPatronalRate)} sub="referência — gerenciado em Rubricas" icon={<TrendingUp />} color="orange" />
                <KpiCard label="Encargo Total (ref.)" value={fmt(totalGlobalRate)} sub="soma de todas as alíquotas" icon={<Calculator />} color="indigo" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">

                    {/* Contribuições de Terceiros — Editável */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Contribuições de Terceiros / Outras Entidades</h2>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">Taxas parafiscais incidentes sobre a folha bruta</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleReset}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-button font-bold transition-all"
                                    title="Restaurar alíquotas padrão"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Restaurar padrão
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={!dirty}
                                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-form-label font-black uppercase tracking-wider transition-all
                                        ${dirty
                                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/20 hover:bg-indigo-700 active:scale-95'
                                            : saved
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        }`}
                                >
                                    {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                    {saved ? 'Salvo!' : 'Salvar'}
                                </button>
                            </div>
                        </div>

                        {/* Tabela padrão (§6.10) — sem moldura própria, o card já é a moldura. Edição inline §7.1. */}
                        <StandardTable<TerceiroTax>
                            bare
                            storageKey="labor:encargos:terceiros"
                            columns={TERCEIROS_COLUMNS}
                            rows={taxes}
                            rowKey={t => t.code}
                            searchText={t => `${t.code} ${t.name}`}
                            searchPlaceholder="Buscar contribuição..."
                            sortValue={(key, t) => key === 'codigo' ? t.code : key === 'descricao' ? t.name : key === 'aliquota' ? t.rate : null}
                            renderCell={(key, tax) => {
                                const isEditing = editing === tax.code;
                                const defaultRate = TERCEIROS_TAXES_DEFAULT.find(d => d.code === tax.code)?.rate;
                                const isModified = defaultRate !== undefined && Math.abs(tax.rate - defaultRate) > 0.00001;
                                switch (key) {
                                    case 'codigo': return <span className="text-sm font-normal text-gray-600">{tax.code}</span>;
                                    case 'descricao': return (
                                        <span className="text-sm font-normal text-gray-700">
                                            {tax.name}
                                            {isModified && <span className="ml-2 text-xs font-normal text-amber-600">Personalizado</span>}
                                        </span>
                                    );
                                    case 'aliquota': return isEditing ? (
                                        <div className="flex items-center justify-end gap-1">
                                            <input
                                                autoFocus
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="100"
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleConfirmEdit(tax.code); if (e.key === 'Escape') setEditing(null); }}
                                                className="w-20 text-right text-sm font-normal text-gray-900 border border-blue-400 rounded-[6px] px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/20"
                                            />
                                            <span className="text-sm font-normal text-gray-500">%</span>
                                            <button onClick={() => handleConfirmEdit(tax.code)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-[6px]" title="Confirmar">
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setEditing(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-[6px]" title="Cancelar">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <span className={`text-sm font-normal ${isModified ? 'text-amber-600' : 'text-gray-900'}`}>{fmt(tax.rate)}</span>
                                    );
                                    default: return null;
                                }
                            }}
                            actions={{
                                width: 90,
                                render: tax => editing !== tax.code
                                    ? <ActionIconButton kind="edit" size="sm" onClick={() => handleStartEdit(tax.code, tax.rate)} />
                                    : null,
                            }}
                            renderTotals={visibleCount => (
                                <tr className="bg-purple-50 border-t-2 border-purple-100">
                                    <td colSpan={visibleCount} className="px-6 py-3 text-right">
                                        <span className="text-xs font-semibold text-purple-800 mr-3">Total</span>
                                        <span className="text-sm font-medium text-purple-800">{fmt(totalTerceiroRate)}</span>
                                    </td>
                                </tr>
                            )}
                            empty={{ title: 'Nenhuma contribuição' }}
                        />

                        {dirty && (
                            <div className="flex items-center gap-2 px-6 py-3 bg-amber-50 border-t border-amber-100">
                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                <p className="text-xs text-amber-700 font-medium">Alterações não salvas. As novas alíquotas serão aplicadas na próxima sincronização da folha.</p>
                            </div>
                        )}
                    </div>

                    {/* Encargos Patronais — Referência */}
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Encargos Patronais</h2>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">Referência — configurados individualmente em <strong>Rubricas</strong></p>
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl">
                                <Info className="w-3.5 h-3.5 text-slate-500" />
                                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Somente leitura</span>
                            </div>
                        </div>

                        {/* Tabela padrão (§6.10), somente leitura */}
                        <StandardTable<(typeof ENCARGOS_PATRONAIS_REF)[number]>
                            bare
                            storageKey="labor:encargos:patronais"
                            columns={PATRONAIS_COLUMNS}
                            rows={ENCARGOS_PATRONAIS_REF}
                            rowKey={e => e.code}
                            searchText={e => `${e.code} ${e.name} ${e.base} ${e.obs}`}
                            searchPlaceholder="Buscar encargo..."
                            sortValue={(key, e) => key === 'codigo' ? e.code : key === 'descricao' ? e.name : key === 'base' ? e.base : key === 'aliquota' ? e.rate : null}
                            renderCell={(key, enc) => {
                                switch (key) {
                                    case 'codigo': return <span className="text-sm font-normal text-orange-700">{enc.code}</span>;
                                    case 'descricao': return (
                                        <div>
                                            <p className="text-sm font-normal text-gray-700">{enc.name}</p>
                                            <p className="text-xs text-gray-400 font-normal">{enc.obs}</p>
                                        </div>
                                    );
                                    case 'base': return <span className="text-sm font-normal text-gray-600">{enc.base}</span>;
                                    case 'aliquota': return <span className="text-sm font-normal text-orange-700">{fmt(enc.rate)}</span>;
                                    default: return null;
                                }
                            }}
                            renderTotals={visibleCount => (
                                <tr className="bg-orange-50 border-t-2 border-orange-100">
                                    <td colSpan={visibleCount} className="px-6 py-3 text-right">
                                        <span className="text-xs font-semibold text-orange-800 mr-3">Total referência</span>
                                        <span className="text-sm font-medium text-orange-800">{fmt(totalPatronalRate)}</span>
                                    </td>
                                </tr>
                            )}
                        />
                    </div>
                </div>

                {/* Coluna direita — Calculadora */}
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5 sticky top-0">
                        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                            <div className="p-2.5 bg-indigo-100 rounded-xl">
                                <Calculator className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Calculadora</h3>
                                <p className="text-xs text-slate-400 font-medium">Impacto real por competência</p>
                            </div>
                        </div>

                        {/* Status da folha buscada */}
                        {loadingPayroll && (
                            <div className="flex items-center justify-center gap-2 py-3 text-slate-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-xs font-medium">Buscando folha...</span>
                            </div>
                        )}

                        {!loadingPayroll && payrollError && (
                            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-amber-700 font-medium">{payrollError}</p>
                                    <p className="text-xs text-amber-500 mt-0.5">Informe o valor manualmente abaixo.</p>
                                </div>
                            </div>
                        )}

                        {!loadingPayroll && payrollSummary && (
                            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2">
                                <p className="text-xs font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Folha fechada — {period.split('-').reverse().join('/')}
                                </p>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                    <div>
                                        <p className="text-[9px] text-emerald-600 font-bold uppercase">Folha Bruta</p>
                                        <p className="text-sm font-black text-emerald-900">{fmtCurrency(payrollSummary.gross)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-emerald-600 font-bold uppercase">Colaboradores</p>
                                        <p className="text-sm font-black text-emerald-900">{payrollSummary.headcount}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-emerald-600 font-bold uppercase">Líquido Total</p>
                                        <p className="text-sm font-black text-emerald-900">{fmtCurrency(payrollSummary.net)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-emerald-600 font-bold uppercase">Custo Empresa</p>
                                        <p className="text-sm font-black text-emerald-900">{fmtCurrency(payrollSummary.employerCost)}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Folha bruta — preenchida automaticamente ou editável */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Folha Bruta (R$)</label>
                                {payrollSummary && (
                                    <button
                                        onClick={() => {
                                            if (manualInput) {
                                                setCalcGrossNum(payrollSummary.gross);
                                                setCalcGross(fmtCurrency(payrollSummary.gross));
                                                setManualInput(false);
                                            } else {
                                                setCalcGross('');
                                                setCalcGrossNum(0);
                                                setManualInput(true);
                                            }
                                        }}
                                        className="text-[9px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-wider transition-colors"
                                    >
                                        {manualInput ? 'Usar folha real' : 'Editar manualmente'}
                                    </button>
                                )}
                            </div>
                            <input
                                type={payrollSummary && !manualInput ? 'text' : 'number'}
                                placeholder="Ex: 50000"
                                value={calcGross}
                                readOnly={!!(payrollSummary && !manualInput)}
                                onChange={e => {
                                    const raw = e.target.value;
                                    setCalcGross(raw);
                                    setCalcGrossNum(parseFloat(raw) || 0);
                                    setManualInput(true);
                                }}
                                className={`w-full text-right text-lg font-black border rounded-2xl px-4 py-3 outline-none transition-all
                                    ${payrollSummary && !manualInput
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900 cursor-default'
                                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400'
                                    }`}
                            />
                        </div>

                        {calcGrossNum > 0 && (
                            <div className="space-y-3">
                                {/* Contribuições de Terceiros */}
                                <div className="space-y-1">
                                    <p className="text-xs font-black text-purple-600 uppercase tracking-widest flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"></span>
                                        Contribuições de Terceiros
                                    </p>
                                    {taxes.map(tax => (
                                        <div key={tax.code} className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-mono font-black text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">{tax.code}</span>
                                                <span className="text-xs text-slate-600 font-medium">{tax.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-black text-purple-700">{fmtCurrency(calcGrossNum * tax.rate)}</p>
                                                <p className="text-[9px] text-slate-400 font-mono">{fmt(tax.rate)}</p>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-xs font-black text-purple-700">Subtotal terceiros</span>
                                        <span className="text-sm font-black text-purple-700">{fmtCurrency(calcGrossNum * totalTerceiroRate)}</span>
                                    </div>
                                </div>

                                {/* Encargos Patronais */}
                                <div className="space-y-1 pt-2">
                                    <p className="text-xs font-black text-orange-600 uppercase tracking-widest flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block"></span>
                                        Encargos Patronais (ref.)
                                    </p>
                                    {ENCARGOS_PATRONAIS_REF.map(enc => (
                                        <div key={enc.code} className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                            <span className="text-xs text-slate-600 font-medium">{enc.name}</span>
                                            <div className="text-right">
                                                <p className="text-xs font-black text-orange-700">{fmtCurrency(calcGrossNum * enc.rate)}</p>
                                                <p className="text-[9px] text-slate-400 font-mono">{fmt(enc.rate)}</p>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-xs font-black text-orange-700">Subtotal patronal</span>
                                        <span className="text-sm font-black text-orange-700">{fmtCurrency(calcGrossNum * totalPatronalRate)}</span>
                                    </div>
                                </div>

                                {/* Total */}
                                <div className="mt-4 p-4 bg-indigo-600 rounded-2xl">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-black text-indigo-200 uppercase tracking-wider">Folha Bruta</span>
                                        <span className="text-sm font-black text-white">{fmtCurrency(calcGrossNum)}</span>
                                    </div>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-xs font-black text-indigo-200 uppercase tracking-wider">Total de Encargos</span>
                                        <span className="text-sm font-black text-white">{fmtCurrency(calcGrossNum * totalGlobalRate)}</span>
                                    </div>
                                    <div className="border-t border-white/20 pt-3 flex justify-between items-center">
                                        <span className="text-xs font-black text-white uppercase tracking-wider">Custo Total Empresa</span>
                                        <span className="text-xl font-black text-white">{fmtCurrency(calcGrossNum * (1 + totalGlobalRate))}</span>
                                    </div>
                                    <p className="text-[9px] text-indigo-200 font-medium mt-2 text-center">
                                        {fmt(totalGlobalRate)} sobre a folha bruta
                                    </p>
                                </div>

                                <button
                                    onClick={() => { setCalcGross(''); setCalcGrossNum(0); setManualInput(false); }}
                                    className="w-full text-button font-bold text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1 py-2 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                    Limpar
                                </button>
                            </div>
                        )}

                        {calcGrossNum === 0 && !loadingPayroll && (
                            <div className="flex flex-col items-center justify-center py-6 text-center gap-3">
                                <div className="p-4 bg-slate-100 rounded-2xl">
                                    <Calendar className="w-6 h-6 text-slate-400" />
                                </div>
                                <p className="text-xs text-slate-400 font-medium">
                                    {payrollSummary
                                        ? 'Folha carregada. O valor bruto está zerado.'
                                        : 'Selecione a competência para carregar\na folha automaticamente.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            </>)}
        </div>
    );
};

export default LaborEncargos;
