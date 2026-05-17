import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Printer, RefreshCw } from 'lucide-react';
import { payrollService } from '../services/payrollService';
import { supabase } from '../lib/supabase';

interface LaborFolhaEmpregadoProps {
    orgId: string;
    period: string;
}

interface FolhaEmpregado {
    seq: number;
    empId: string;
    name: string;
    salario: number;       // proventos base (salário)
    outrosProv: number;    // outros proventos (horas extras, adicionais, etc.)
    salFam: number;        // salário família
    inss: number;          // INSS do segurado
    irrf: number;          // IRRF
    outrosDesc: number;    // outros descontos
    liquido: number;       // líquido a receber
    fgts: number;          // FGTS (encargo patronal)
}

const fmtN = (v: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const LaborFolhaEmpregado: React.FC<LaborFolhaEmpregadoProps> = ({ orgId, period }) => {
    const [rows, setRows] = useState<FolhaEmpregado[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [orgName, setOrgName] = useState('');
    const [orgCnpj, setOrgCnpj] = useState('');
    const [worksiteName, setWorksiteName] = useState('');

    const fetchData = useCallback(async () => {
        if (!orgId || !period) return;
        setLoading(true);
        setError(null);
        setRows([]);

        try {
            const [y, m] = period.split('-');
            const firstDay = `${y}-${m}-01`;
            const lastDay = new Date(Number(y), Number(m), 0).toISOString().slice(0, 10);

            // Organização
            const { data: orgRow } = await supabase
                .from('organizations')
                .select('name, document')
                .eq('id', orgId)
                .single();
            setOrgName(orgRow?.name || '');
            setOrgCnpj(orgRow?.document || '');

            // Folhas FECHADAS do período
            const runs = await payrollService.listRuns(orgId, undefined, firstDay, lastDay);
            const closedRuns = runs.filter(r => r.status === 'FECHADO' && r.type === 'mensal');

            if (closedRuns.length === 0) {
                setError('Nenhuma folha mensal fechada encontrada para este período.');
                return;
            }

            // Nome da obra (primeiro worksiteId não nulo)
            const firstRunWithSite = closedRuns.find(r => (r as any).worksite_id);
            if ((firstRunWithSite as any)?.worksite_id) {
                const { data: ws } = await supabase
                    .from('worksites')
                    .select('name')
                    .eq('id', (firstRunWithSite as any).worksite_id)
                    .single();
                setWorksiteName(ws?.name || '');
            }

            // Rubricas para classificar itens
            const rubrics = await payrollService.listRubrics();
            const rubricByCode: Record<string, any> = Object.fromEntries(rubrics.map(r => [r.code, r]));

            // Identificar INSS, IRRF, FGTS, Salário Família por nome de rubrica
            const isINSS = (name: string) =>
                name.toUpperCase().includes('INSS') ||
                name.toUpperCase().includes('PREVIDÊNCIA') ||
                name.toUpperCase().includes('PREVIDENCIA');
            const isIRRF = (name: string) =>
                name.toUpperCase().includes('IRRF') ||
                name.toUpperCase().includes('IMPOSTO DE RENDA');
            const isFGTS = (name: string) =>
                name.toUpperCase().includes('FGTS');
            const isSalFam = (name: string) =>
                name.toUpperCase().includes('SAL') && name.toUpperCase().includes('FAM');

            // Agregar por empregado
            const byEmp: Record<string, {
                salario: number; outrosProv: number; salFam: number;
                inss: number; irrf: number; outrosDesc: number;
                liquido: number; fgts: number;
            }> = {};

            for (const run of closedRuns) {
                // Resultados (gross = proventos, net = líquido, employer_cost inclui FGTS)
                const { data: results } = await supabase
                    .from('payroll_results')
                    .select('employee_id, gross, net, employer_cost, base_inss')
                    .eq('payroll_run_id', run.id);

                for (const r of results || []) {
                    if (!byEmp[r.employee_id]) {
                        byEmp[r.employee_id] = {
                            salario: 0, outrosProv: 0, salFam: 0,
                            inss: 0, irrf: 0, outrosDesc: 0,
                            liquido: 0, fgts: 0,
                        };
                    }
                    byEmp[r.employee_id].liquido += r.net || 0;
                }

                // Itens discriminados
                const { data: items } = await supabase
                    .from('payroll_items')
                    .select('employee_id, code, amount, type')
                    .eq('payroll_run_id', run.id);

                for (const item of items || []) {
                    if (!byEmp[item.employee_id]) continue;
                    const rub = rubricByCode[item.code];
                    const rubName: string = rub?.name || item.code || '';
                    const abs = Math.abs(item.amount || 0);
                    const sign = (item.amount || 0);

                    if (item.type === 'encargo' || rub?.type === 'encargo') {
                        if (isFGTS(rubName)) {
                            byEmp[item.employee_id].fgts += abs;
                        }
                    } else if (item.type === 'desconto' || rub?.type === 'desconto') {
                        if (isINSS(rubName)) {
                            byEmp[item.employee_id].inss += abs;
                        } else if (isIRRF(rubName)) {
                            byEmp[item.employee_id].irrf += abs;
                        } else {
                            byEmp[item.employee_id].outrosDesc += abs;
                        }
                    } else if (item.type === 'provento' || rub?.type === 'provento') {
                        if (isSalFam(rubName)) {
                            byEmp[item.employee_id].salFam += abs;
                        } else {
                            // Heurística: rubrica com menor código = salário base
                            // Rubrica referenciada como 'base' ou 'salário' = salário
                            const isBase =
                                rubName.toUpperCase().includes('SALÁRIO') ||
                                rubName.toUpperCase().includes('SALARIO') ||
                                rubName.toUpperCase().includes('BASE') ||
                                rub?.is_base_salary;
                            if (isBase) {
                                byEmp[item.employee_id].salario += abs;
                            } else {
                                byEmp[item.employee_id].outrosProv += abs;
                            }
                        }
                    } else if (item.type === 'informativa') {
                        // skip
                    } else {
                        // tipo desconhecido: classificar pelo sinal
                        if (sign < 0) {
                            byEmp[item.employee_id].outrosDesc += abs;
                        } else {
                            byEmp[item.employee_id].outrosProv += abs;
                        }
                    }
                }
            }

            // Nomes
            const empIds = Object.keys(byEmp);
            const { data: empRows } = await supabase
                .from('employees')
                .select('id, name, registration_number')
                .in('id', empIds);
            const empMap: Record<string, { name: string; seq: number }> = Object.fromEntries(
                (empRows || []).map((e: any) => [e.id, { name: e.name, seq: e.registration_number || 0 }])
            );

            // Montar linhas
            const lista: FolhaEmpregado[] = Object.entries(byEmp).map(([empId, d], idx) => ({
                seq: empMap[empId]?.seq || idx + 1,
                empId,
                name: empMap[empId]?.name || empId,
                ...d,
            }));

            // Ordenar por seq (matrícula) ou nome
            lista.sort((a, b) => {
                if (a.seq !== b.seq) return a.seq - b.seq;
                return a.name.localeCompare(b.name, 'pt-BR');
            });
            lista.forEach((r, i) => { r.seq = i + 1; });

            setRows(lista);
        } catch (err: any) {
            console.error('[FolhaEmpregado]', err);
            setError('Erro ao buscar dados da folha. Verifique o console.');
        } finally {
            setLoading(false);
        }
    }, [orgId, period]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const [mm, yyyy] = period.split('-').length === 2
        ? [period.split('-')[1], period.split('-')[0]]
        : ['', ''];
    const periodLabel = `${mm}/${yyyy}`;

    const totals = rows.reduce(
        (acc, r) => ({
            salario: acc.salario + r.salario,
            outrosProv: acc.outrosProv + r.outrosProv,
            salFam: acc.salFam + r.salFam,
            inss: acc.inss + r.inss,
            irrf: acc.irrf + r.irrf,
            outrosDesc: acc.outrosDesc + r.outrosDesc,
            liquido: acc.liquido + r.liquido,
            fgts: acc.fgts + r.fgts,
        }),
        { salario: 0, outrosProv: 0, salFam: 0, inss: 0, irrf: 0, outrosDesc: 0, liquido: 0, fgts: 0 }
    );

    if (loading) return (
        <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm font-medium">Carregando relação da folha...</span>
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

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Toolbar */}
            <div className="flex items-center justify-between print:hidden">
                <div className="text-xs text-slate-400 font-medium">
                    {rows.length} empregado(s) — Competência {periodLabel}
                </div>
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir
                </button>
            </div>

            {/* Relatório */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden print:shadow-none print:border-0 print:rounded-none">

                {/* Cabeçalho */}
                <div className="px-8 pt-7 pb-5 border-b border-slate-100 bg-slate-50/50 print:bg-white">
                    <div className="flex justify-between items-start text-[11px] text-slate-500 font-medium mb-3">
                        <div className="space-y-0.5">
                            <p className="font-black text-slate-800 text-sm uppercase">{orgName}</p>
                            {orgCnpj && <p>CNPJ: <span className="font-bold">{orgCnpj}</span></p>}
                            <p>Cálculo: <span className="font-bold">Folha Mensal</span></p>
                            <p>Competência: <span className="font-bold">{periodLabel}</span></p>
                        </div>
                        <div className="text-right space-y-0.5">
                            <p>Página: <span className="font-bold">1/1</span></p>
                            <p>Emissão: <span className="font-bold">{new Date().toLocaleDateString('pt-BR')}</span></p>
                            <p>Hora: <span className="font-bold">{new Date().toLocaleTimeString('pt-BR')}</span></p>
                        </div>
                    </div>
                    {worksiteName && (
                        <p className="text-[11px] font-bold text-slate-600 mt-1">{worksiteName}</p>
                    )}
                    <h2 className="text-center text-sm font-black text-slate-900 uppercase tracking-widest mt-4">
                        Relação da Folha por Empregado
                    </h2>
                </div>

                <div className="px-8 py-6">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100 border-y border-slate-200">
                                    <th className="text-left px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px] w-10">Cód.</th>
                                    <th className="text-left px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Nome do empregado</th>
                                    <th className="text-right px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Salário</th>
                                    <th className="text-right px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Out.Prov.</th>
                                    <th className="text-right px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Sal.Fam.</th>
                                    <th className="text-right px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">INSS</th>
                                    <th className="text-right px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">IRRF</th>
                                    <th className="text-right px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Out.Desc.</th>
                                    <th className="text-right px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">Líquido</th>
                                    <th className="text-right px-2 py-2.5 font-black text-slate-600 uppercase tracking-wider text-[10px]">FGTS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Grupo: Empregados */}
                                <tr>
                                    <td colSpan={10} className="px-2 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-50/80 border-b border-slate-100">
                                        Empregados
                                    </td>
                                </tr>

                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="text-center px-3 py-8 text-slate-400 text-xs italic">
                                            Nenhum empregado encontrado para o período.
                                        </td>
                                    </tr>
                                ) : rows.map(emp => (
                                    <tr key={emp.empId} className="border-b border-slate-50 hover:bg-slate-50/60">
                                        <td className="px-2 py-2 text-slate-500 font-mono font-bold">{emp.seq}</td>
                                        <td className="px-2 py-2 font-medium text-slate-800">{emp.name}</td>
                                        <td className="px-2 py-2 text-right font-mono text-slate-700">{fmtN(emp.salario)}</td>
                                        <td className="px-2 py-2 text-right font-mono text-slate-700">{fmtN(emp.outrosProv)}</td>
                                        <td className="px-2 py-2 text-right font-mono text-slate-500">{fmtN(emp.salFam)}</td>
                                        <td className="px-2 py-2 text-right font-mono text-red-700 font-bold">{fmtN(emp.inss)}</td>
                                        <td className="px-2 py-2 text-right font-mono text-red-600">{fmtN(emp.irrf)}</td>
                                        <td className="px-2 py-2 text-right font-mono text-slate-600">{fmtN(emp.outrosDesc)}</td>
                                        <td className="px-2 py-2 text-right font-mono font-bold text-emerald-700">{fmtN(emp.liquido)}</td>
                                        <td className="px-2 py-2 text-right font-mono text-blue-700 font-bold">{fmtN(emp.fgts)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                {/* Total empregados */}
                                <tr className="border-t border-slate-200 bg-slate-50">
                                    <td colSpan={2} className="px-2 py-2 text-[10px] font-black text-slate-600 uppercase">
                                        Empregados: {rows.length} &nbsp; Total:
                                    </td>
                                    <td className="px-2 py-2 text-right font-mono font-black text-slate-800">{fmtN(totals.salario)}</td>
                                    <td className="px-2 py-2 text-right font-mono font-black text-slate-800">{fmtN(totals.outrosProv)}</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-600">{fmtN(totals.salFam)}</td>
                                    <td className="px-2 py-2 text-right font-mono font-black text-red-700">{fmtN(totals.inss)}</td>
                                    <td className="px-2 py-2 text-right font-mono text-red-600">{fmtN(totals.irrf)}</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-600">{fmtN(totals.outrosDesc)}</td>
                                    <td className="px-2 py-2 text-right font-mono font-black text-emerald-700">{fmtN(totals.liquido)}</td>
                                    <td className="px-2 py-2 text-right font-mono font-black text-blue-700">{fmtN(totals.fgts)}</td>
                                </tr>
                                {/* Todos geral */}
                                <tr className="border-t-2 border-slate-300 bg-slate-100">
                                    <td colSpan={2} className="px-2 py-2.5 text-[10px] font-black text-slate-700 uppercase">
                                        Todos geral: {rows.length} &nbsp; Total:
                                    </td>
                                    <td className="px-2 py-2.5 text-right font-mono font-black text-slate-900">{fmtN(totals.salario)}</td>
                                    <td className="px-2 py-2.5 text-right font-mono font-black text-slate-900">{fmtN(totals.outrosProv)}</td>
                                    <td className="px-2 py-2.5 text-right font-mono font-black text-slate-700">{fmtN(totals.salFam)}</td>
                                    <td className="px-2 py-2.5 text-right font-mono font-black text-red-700">{fmtN(totals.inss)}</td>
                                    <td className="px-2 py-2.5 text-right font-mono font-black text-red-600">{fmtN(totals.irrf)}</td>
                                    <td className="px-2 py-2.5 text-right font-mono font-black text-slate-700">{fmtN(totals.outrosDesc)}</td>
                                    <td className="px-2 py-2.5 text-right font-mono font-black text-emerald-700">{fmtN(totals.liquido)}</td>
                                    <td className="px-2 py-2.5 text-right font-mono font-black text-blue-700">{fmtN(totals.fgts)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LaborFolhaEmpregado;
