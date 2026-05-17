import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Printer, RefreshCw, Users, Building2 } from 'lucide-react';
import { payrollService } from '../services/payrollService';
import { getOrgTerceirosTaxes } from '../services/payrollService';
import { supabase } from '../lib/supabase';

interface LaborEncargosINSSProps {
    orgId: string;
    period: string;
}

interface INSSEmployee {
    seq: number;
    name: string;
    base: number;
    excedente: number;
    dedSalMat13: number;
    deducoes: number;
    taxa: number;       // % efetiva
    valor: number;      // INSS do segurado
    isContribuinte: boolean;
}

interface INSSData {
    empregados: INSSEmployee[];
    contribuintes: INSSEmployee[];
    // Resumo Geral
    totalBase: number;
    totalExcedente: number;
    totalSegurados: number;
    totalContribuintes: number;
    totalRAT: number;
    totalEmpresa: number;
    totalDeducoes: number;
    totalTerceiros: number;
    totalGeral: number;
    ratRate: number;
}

const fmtN = (v: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtPct = (v: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const LaborEncargosINSS: React.FC<LaborEncargosINSSProps> = ({ orgId, period }) => {
    const [data, setData] = useState<INSSData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [orgName, setOrgName] = useState('');

    const fetchData = useCallback(async () => {
        if (!orgId || !period) return;
        setLoading(true);
        setError(null);
        setData(null);

        try {
            const [y, m] = period.split('-');
            const firstDay = `${y}-${m}-01`;
            const lastDay  = new Date(Number(y), Number(m), 0).toISOString().slice(0, 10);

            // 1. Organização
            const { data: orgRow } = await supabase
                .from('organizations').select('name').eq('id', orgId).single();
            setOrgName(orgRow?.name || '');

            // 2. Folhas FECHADAS do período
            const runs = await payrollService.listRuns(orgId, undefined, firstDay, lastDay);
            const closedRuns = runs.filter(r => r.status === 'FECHADO' && r.type === 'mensal');
            if (closedRuns.length === 0) {
                setError('Nenhuma folha mensal fechada encontrada para este período.');
                return;
            }

            // 3. Rubricas — identificar INSS (desconto) e RAT (encargo)
            const rubrics = await payrollService.listRubrics();
            // Identify INSS rubrics by name (incidence_inss means "in INSS base", NOT "is INSS deduction")
            const inssRubricCodes = rubrics
                .filter(r => r.type === 'desconto' &&
                    (r.name.toUpperCase().includes('INSS') ||
                     r.name.toUpperCase().includes('PREVIDÊNCIA') ||
                     r.name.toUpperCase().includes('PREVIDENCIA')))
                .map(r => r.code);
            const ratRubric = rubrics.find(
                r => r.type === 'encargo' &&
                     (r.name.toUpperCase().includes('RAT') ||
                      r.name.toUpperCase().includes('ACIDENT') ||
                      r.name.toUpperCase().includes('SAT'))
            );
            const ratRate = ratRubric?.calculation_config?.percentage
                ? ratRubric.calculation_config.percentage / 100
                : 0.03; // 3% padrão (risco médio)

            // 4. Agregar resultados e itens de todas as folhas
            const resultsByEmp: Record<string, { base_inss: number; gross: number; net: number; employer_cost: number }> = {};
            const inssValueByEmp: Record<string, number> = {};
            const runIds = closedRuns.map(r => r.id);

            for (const runId of runIds) {
                // Resultados
                const { data: results } = await supabase
                    .from('payroll_results')
                    .select('employee_id, base_inss, gross, net, employer_cost')
                    .eq('payroll_run_id', runId);

                for (const r of results || []) {
                    if (!resultsByEmp[r.employee_id]) {
                        resultsByEmp[r.employee_id] = { base_inss: 0, gross: 0, net: 0, employer_cost: 0 };
                    }
                    resultsByEmp[r.employee_id].base_inss     += r.base_inss     || r.gross || 0;
                    resultsByEmp[r.employee_id].gross         += r.gross          || 0;
                    resultsByEmp[r.employee_id].net           += r.net            || 0;
                    resultsByEmp[r.employee_id].employer_cost += r.employer_cost  || 0;
                }

                // Itens de INSS
                if (inssRubricCodes.length > 0) {
                    const { data: items } = await supabase
                        .from('payroll_items')
                        .select('employee_id, amount')
                        .eq('payroll_run_id', runId)
                        .in('code', inssRubricCodes);

                    for (const item of items || []) {
                        inssValueByEmp[item.employee_id] = (inssValueByEmp[item.employee_id] || 0) + Math.abs(item.amount || 0);
                    }
                } else {
                    // Fallback: fetch all desconto items and identify INSS by rubric name lookup
                    const { data: allDescontos } = await supabase
                        .from('payroll_items')
                        .select('employee_id, amount, code')
                        .eq('payroll_run_id', runId)
                        .eq('type', 'desconto');

                    const rubricByCode = Object.fromEntries(rubrics.map(r => [r.code, r]));
                    for (const item of allDescontos || []) {
                        const rub = rubricByCode[item.code];
                        if (rub && (rub.name.toUpperCase().includes('INSS') ||
                                    rub.name.toUpperCase().includes('PREVIDÊNCIA') ||
                                    rub.name.toUpperCase().includes('PREVIDENCIA'))) {
                            inssValueByEmp[item.employee_id] = (inssValueByEmp[item.employee_id] || 0) + Math.abs(item.amount || 0);
                        }
                    }
                }
            }

            // 5. Nomes dos colaboradores
            const empIds = Object.keys(resultsByEmp);
            const { data: empRows } = await supabase
                .from('employees')
                .select('id, name')
                .in('id', empIds);
            const nameMap: Record<string, string> = Object.fromEntries(
                (empRows || []).map((e: any) => [e.id, e.name])
            );

            // 6. Montar lista de empregados
            const orgTerceirosTaxes = getOrgTerceirosTaxes(orgId);
            const terceiroRate = orgTerceirosTaxes.reduce((s, t) => s + t.rate, 0);

            let seq = 1;
            let totalBase = 0, totalExcedente = 0, totalSegurados = 0, totalContribuintes = 0;
            let totalRAT = 0, totalEmpresa = 0, totalDeducoes = 0, totalTerceiros = 0;

            const empregados: INSSEmployee[] = [];

            for (const [empId, res] of Object.entries(resultsByEmp)) {
                const base = res.base_inss;
                const grossEmp = res.gross;

                // INSS do segurado: usar valor do item se disponível, senão estimar da diferença gross-net
                let valor = inssValueByEmp[empId] || 0;
                if (valor === 0 && res.gross > 0) {
                    // Fallback: INSS ≈ gross - net (simplificado, pode incluir outros descontos)
                    // Melhor não usar fallback e mostrar 0 com nota
                }

                const taxa = base > 0 && valor > 0 ? (valor / base) * 100 : 0;

                empregados.push({
                    seq: seq++,
                    name: nameMap[empId] || empId,
                    base,
                    excedente: 0,       // teto INSS — simplificado
                    dedSalMat13: 0,     // deduções de sal. maternidade / 13º
                    deducoes: 0,
                    taxa,
                    valor,
                    isContribuinte: false,
                });

                totalBase      += base;
                totalSegurados += valor;
            }

            // Ordenar por nome
            empregados.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
            empregados.forEach((e, i) => { e.seq = i + 1; });

            totalRAT      = Math.round(totalBase * ratRate * 100) / 100;
            totalEmpresa  = Math.round(totalBase * 0.20 * 100) / 100;
            // Terceiros: mesma base de cálculo dos encargos patronais (base INSS)
            totalTerceiros = Math.round(totalBase * terceiroRate * 100) / 100;
            const totalGeral = totalSegurados + totalContribuintes + totalRAT + totalEmpresa + totalDeducoes + totalTerceiros;

            setData({
                empregados,
                contribuintes: [],
                totalBase,
                totalExcedente,
                totalSegurados,
                totalContribuintes,
                totalRAT,
                totalEmpresa,
                totalDeducoes,
                totalTerceiros,
                totalGeral,
                ratRate,
            });
        } catch (err: any) {
            console.error('[INSS]', err);
            setError('Erro ao buscar dados de INSS. Verifique o console.');
        } finally {
            setLoading(false);
        }
    }, [orgId, period]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const [mm, yyyy] = period.split('-').length === 2
        ? [period.split('-')[1], period.split('-')[0]]
        : ['', ''];
    const periodLabel = `${mm}/${yyyy}`;

    const handlePrint = () => window.print();

    if (loading) return (
        <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm font-medium">Carregando dados de INSS...</span>
        </div>
    );

    if (error) return (
        <div className="flex items-start gap-3 p-5 bg-amber-50 border border-amber-200 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
                <p className="text-sm font-bold text-amber-800">{error}</p>
                <button onClick={fetchData} className="mt-2 text-xs font-black text-amber-600 hover:text-amber-800 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                </button>
            </div>
        </div>
    );

    if (!data) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="text-xs text-slate-400 font-medium">
                    {data.empregados.length + data.contribuintes.length} registro(s) — Competência {periodLabel}
                </div>
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm print:hidden"
                >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir
                </button>
            </div>

            {/* Relatório — área impressa */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden print:shadow-none print:border-0 print:rounded-none">

                {/* Cabeçalho do relatório */}
                <div className="px-8 pt-7 pb-5 border-b border-slate-100 bg-slate-50/50 print:bg-white">
                    <div className="flex justify-between items-start text-[11px] text-slate-500 font-medium mb-4">
                        <div className="space-y-0.5">
                            <p className="font-black text-slate-800 text-sm uppercase">{orgName}</p>
                        </div>
                        <div className="text-right space-y-0.5">
                            <p>Página: <span className="font-bold">1/1</span></p>
                            <p>Emissão: <span className="font-bold">{new Date().toLocaleDateString('pt-BR')}</span></p>
                            <p>Cálculo: <span className="font-bold">{new Date().toLocaleTimeString('pt-BR')}</span></p>
                        </div>
                    </div>
                    <div className="text-center space-y-0.5">
                        <p className="text-[10px] text-slate-500 font-medium">Folha Mensal &nbsp;·&nbsp; Competência: <strong>{periodLabel}</strong></p>
                    </div>
                </div>

                <div className="px-8 py-6 space-y-8">

                    {/* ── RELAÇÃO DE BASES DO INSS ── */}
                    <div>
                        <h2 className="text-center text-sm font-black text-slate-900 uppercase tracking-widest mb-5">
                            Relação de Bases do INSS
                        </h2>

                        {/* EMPREGADOS */}
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> Empregados
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 border-y border-slate-200">
                                        <th className="text-left px-3 py-2 font-black text-slate-600 uppercase tracking-wider text-[10px] w-8">Cód.</th>
                                        <th className="text-left px-3 py-2 font-black text-slate-600 uppercase tracking-wider text-[10px]">Nome do empregado</th>
                                        <th className="text-right px-3 py-2 font-black text-slate-600 uppercase tracking-wider text-[10px]">Base cálculo</th>
                                        <th className="text-right px-3 py-2 font-black text-slate-600 uppercase tracking-wider text-[10px]">Excedente</th>
                                        <th className="text-right px-3 py-2 font-black text-slate-600 uppercase tracking-wider text-[10px]">Ded.sal.mat.13</th>
                                        <th className="text-right px-3 py-2 font-black text-slate-600 uppercase tracking-wider text-[10px]">Deduções</th>
                                        <th className="text-right px-3 py-2 font-black text-slate-600 uppercase tracking-wider text-[10px]">Taxa</th>
                                        <th className="text-right px-3 py-2 font-black text-slate-600 uppercase tracking-wider text-[10px]">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.empregados.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="text-center px-3 py-6 text-slate-400 text-xs italic">
                                                Nenhum empregado encontrado para o período.
                                            </td>
                                        </tr>
                                    ) : data.empregados.map((emp) => (
                                        <tr key={emp.seq} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-3 py-2 text-slate-500 font-mono font-bold">{emp.seq}</td>
                                            <td className="px-3 py-2 font-medium text-slate-800">{emp.name}</td>
                                            <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtN(emp.base)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtN(emp.excedente)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtN(emp.dedSalMat13)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtN(emp.deducoes)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-slate-700">
                                                {emp.taxa > 0 ? fmtPct(emp.taxa) : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">{fmtN(emp.valor)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {/* Totais empregados */}
                                <tfoot>
                                    <tr className="border-t border-slate-200 bg-slate-50">
                                        <td colSpan={2} className="px-3 py-2 text-[10px] font-black text-slate-600 uppercase">
                                            Empregados: {data.empregados.length} &nbsp; Total:
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-black text-slate-800">{fmtN(data.totalBase)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtN(data.totalExcedente)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">0,00</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">0,00</td>
                                        <td className="px-3 py-2"></td>
                                        <td className="px-3 py-2 text-right font-mono font-black text-slate-800">{fmtN(data.totalSegurados)}</td>
                                    </tr>
                                    <tr className="border-t border-slate-100 bg-slate-50">
                                        <td colSpan={2} className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">
                                            Contribuintes: {data.contribuintes.length} &nbsp; Total:
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-400">0,00</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-400">0,00</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-400">0,00</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-400">0,00</td>
                                        <td className="px-3 py-2"></td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-400">0,00</td>
                                    </tr>
                                    <tr className="border-t-2 border-slate-300 bg-slate-100">
                                        <td colSpan={2} className="px-3 py-2 text-[10px] font-black text-slate-700 uppercase">
                                            Total: {data.empregados.length + data.contribuintes.length} &nbsp; Total:
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-black text-slate-900">{fmtN(data.totalBase)}</td>
                                        <td className="px-3 py-2 text-right font-mono font-black text-slate-700">{fmtN(data.totalExcedente)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">0,00</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">0,00</td>
                                        <td className="px-3 py-2"></td>
                                        <td className="px-3 py-2 text-right font-mono font-black text-slate-900">{fmtN(data.totalSegurados)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* ── RESUMO GERAL ── */}
                    <div>
                        <h3 className="text-center text-sm font-black text-slate-900 uppercase tracking-widest mb-5">
                            Resumo Geral das Bases de INSS
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 border-y border-slate-200">
                                        <th className="text-right px-3 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Base cálculo</th>
                                        <th className="text-right px-3 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Excedente</th>
                                        <th className="text-right px-3 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Segurados</th>
                                        <th className="text-right px-3 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Contribuintes</th>
                                        <th className="text-right px-3 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">
                                            RAT ({fmtPct(data.ratRate * 100)}%)
                                        </th>
                                        <th className="text-right px-3 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Empresa (20%)</th>
                                        <th className="text-right px-3 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Deduções</th>
                                        <th className="text-right px-3 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Terceiros</th>
                                        <th className="text-right px-3 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-slate-100 bg-white hover:bg-slate-50/50">
                                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-800">{fmtN(data.totalBase)}</td>
                                        <td className="px-3 py-3 text-right font-mono text-slate-500">{fmtN(data.totalExcedente)}</td>
                                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-800">{fmtN(data.totalSegurados)}</td>
                                        <td className="px-3 py-3 text-right font-mono text-slate-500">{fmtN(data.totalContribuintes)}</td>
                                        <td className="px-3 py-3 text-right font-mono font-bold text-orange-700">{fmtN(data.totalRAT)}</td>
                                        <td className="px-3 py-3 text-right font-mono font-bold text-orange-700">{fmtN(data.totalEmpresa)}</td>
                                        <td className="px-3 py-3 text-right font-mono text-slate-500">{fmtN(data.totalDeducoes)}</td>
                                        <td className="px-3 py-3 text-right font-mono font-bold text-purple-700">{fmtN(data.totalTerceiros)}</td>
                                        <td className="px-3 py-3 text-right font-mono font-black text-slate-900 text-sm">{fmtN(data.totalGeral)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Cards de destaque */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                            {[
                                { label: 'Segurados (empregados)', value: data.totalSegurados, color: 'bg-blue-50 border-blue-100', text: 'text-blue-800', icon: Users },
                                { label: `RAT (${fmtPct(data.ratRate * 100)}%)`, value: data.totalRAT, color: 'bg-amber-50 border-amber-100', text: 'text-amber-800', icon: Building2 },
                                { label: 'INSS Patronal (20%)', value: data.totalEmpresa, color: 'bg-orange-50 border-orange-100', text: 'text-orange-800', icon: Building2 },
                                { label: 'Contribuições de Terceiros', value: data.totalTerceiros, color: 'bg-purple-50 border-purple-100', text: 'text-purple-800', icon: Building2 },
                            ].map(card => (
                                <div key={card.label} className={`${card.color} border rounded-2xl p-4`}>
                                    <p className={`text-[9px] font-black uppercase tracking-widest ${card.text} opacity-70 mb-1`}>{card.label}</p>
                                    <p className={`text-lg font-black ${card.text} font-mono`}>
                                        R$ {fmtN(card.value)}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Total geral em destaque */}
                        <div className="mt-4 p-5 bg-indigo-600 rounded-2xl flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Total INSS + Encargos</p>
                                <p className="text-[10px] text-indigo-300 font-medium mt-0.5">
                                    Segurados + RAT + Empresa + Terceiros
                                </p>
                            </div>
                            <p className="text-2xl font-black text-white font-mono">R$ {fmtN(data.totalGeral)}</p>
                        </div>

                        {/* Legenda */}
                        <p className="text-[10px] text-slate-400 font-medium mt-4 italic">
                            * RAT, INSS Patronal e Terceiros calculados sobre a Base de Cálculo do INSS.
                            RAT a {fmtPct(data.ratRate * 100)}% (risco médio) — ajuste via Rubricas.
                            INSS Patronal fixo em 20% (Regime Geral).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LaborEncargosINSS;
