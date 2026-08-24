import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Loader2, AlertCircle, Banknote } from 'lucide-react';
import { companyService } from '../services/companyService';
import { remuneracaoSocietariaService } from '../services/remuneracaoSocietariaService';
import { Company, ProlaborePayroll, ProlaborePayrollItem, PROLABORE_STATUS_LABELS } from '../types';

interface Props {
    orgId: string | null;
    period: string; // 'YYYY-MM', compartilhado com as demais abas de Encargos Sociais
}

const BRL = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Sub-aba de Encargos Sociais dedicada ao pró-labore — consolida o mesmo tipo
 * de informação que a folha CLT (INSS, encargos patronais/terceiros) mas para
 * sócios-administradores. Só leitura: não cria folha (ver
 * remuneracaoSocietariaService.getPayrollByCompetence). Para calcular/editar,
 * usar RH > Remuneração Societária > Pró-labore.
 */
const LaborEncargosProlabore: React.FC<Props> = ({ orgId, period }) => {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [companyId, setCompanyId] = useState('');
    const [payroll, setPayroll] = useState<ProlaborePayroll | null>(null);
    const [items, setItems] = useState<ProlaborePayrollItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        companyService.list(orgId).then(list => {
            setCompanies(list);
            if (list.length > 0 && !companyId) setCompanyId(list[0].id);
        }).catch(e => setError(e.message));
    }, [orgId]);

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setError(null);
        try {
            const competenceMonth = `${period}-01`;
            const p = await remuneracaoSocietariaService.getPayrollByCompetence(companyId, competenceMonth);
            setPayroll(p);
            setItems(p ? await remuneracaoSocietariaService.listPayrollItems(p.id) : []);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId, period]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest">
                    <Banknote className="w-4 h-4" /> Encargos sobre Pró-labore de Sócios-Administradores
                </div>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                        className="text-form-input font-bold text-slate-600 outline-none bg-transparent min-w-[180px]">
                        {companies.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                    </select>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : !payroll || items.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-gray-400 gap-2 bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <Banknote className="w-8 h-8 opacity-30" />
                    <p className="text-sm font-medium text-center">
                        Nenhuma folha de pró-labore calculada para {period.split('-').reverse().join('/')}.
                        <br />Calcule em RH → Remuneração Societária → Pró-labore.
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Pró-labore Bruto</p>
                            <p className="text-2xl font-black text-slate-900 tracking-tight">{BRL(payroll.gross_total)}</p>
                        </div>
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">INSS Sócios (11%)</p>
                            <p className="text-2xl font-black text-red-600 tracking-tight">{BRL(payroll.inss_total)}</p>
                        </div>
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Cota Patronal</p>
                            <p className="text-2xl font-black text-orange-600 tracking-tight">{BRL(payroll.patronal_total)}</p>
                        </div>
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Contrib. Terceiros</p>
                            <p className="text-2xl font-black text-purple-600 tracking-tight">{BRL(payroll.terceiros_total)}</p>
                        </div>
                    </div>

                    <div className="bg-indigo-600 rounded-3xl shadow-lg shadow-indigo-900/20 p-6 flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <p className="text-xs font-black text-indigo-200 uppercase tracking-widest">Custo Total da Empresa</p>
                            <p className="text-3xl font-black text-white tracking-tight">
                                {BRL((payroll.gross_total || 0) + (payroll.patronal_total || 0) + (payroll.terceiros_total || 0))}
                            </p>
                            <p className="text-xs text-indigo-200 font-medium mt-1">Bruto + Cota Patronal + Contrib. Terceiros (não inclui FGTS — não incide sobre pró-labore)</p>
                        </div>
                        <span className="text-xs font-black uppercase px-3 py-1.5 rounded-full bg-white/10 text-white">
                            {PROLABORE_STATUS_LABELS[payroll.status]}
                        </span>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-left text-xs font-black text-slate-400 uppercase tracking-widest">
                                    <th className="px-6 py-3">Sócio</th>
                                    <th className="px-4 py-3 text-right">Bruto</th>
                                    <th className="px-4 py-3 text-right">INSS</th>
                                    <th className="px-4 py-3 text-right">IRRF</th>
                                    <th className="px-4 py-3 text-right">Líquido</th>
                                    <th className="px-4 py-3 text-right">Cota Patronal</th>
                                    <th className="px-6 py-3 text-right">Contrib. Terceiros</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {items.map(i => (
                                    <tr key={i.id} className="hover:bg-slate-50/60">
                                        <td className="px-6 py-3 font-bold text-slate-800">{i.partner_nome}</td>
                                        <td className="px-4 py-3 text-right">{BRL(i.gross_amount)}</td>
                                        <td className="px-4 py-3 text-right text-red-500">-{BRL(i.inss_amount)}</td>
                                        <td className="px-4 py-3 text-right text-red-500">-{BRL(i.irrf_amount)}</td>
                                        <td className="px-4 py-3 text-right font-black text-emerald-600">{BRL(i.net_amount)}</td>
                                        <td className="px-4 py-3 text-right text-orange-600">{i.patronal_amount > 0 ? BRL(i.patronal_amount) : '—'}</td>
                                        <td className="px-6 py-3 text-right text-purple-600">{i.terceiros_amount > 0 ? BRL(i.terceiros_amount) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default LaborEncargosProlabore;
