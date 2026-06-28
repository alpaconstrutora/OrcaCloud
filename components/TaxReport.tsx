import React from 'react';
import { FileText, Download, Info, TrendingUp, Calculator } from 'lucide-react';
import { formatCurrency } from '../utils/financialMath';
import type { InvestorContribution } from '../services/investorContributionsService';
import type { ProjectData } from '../services/projectService';

interface TaxReportProps {
    investorContributions: InvestorContribution[];
    activeProjects: ProjectData[];
}

const TaxReport: React.FC<TaxReportProps> = ({ investorContributions, activeProjects }) => {
    const year = new Date().getFullYear() - 1; // ano-calendário anterior

    const liquidado = (type: string) =>
        investorContributions.filter(c => c.type === type && c.status === 'liquidado');

    const totalInvested = liquidado('aporte').reduce((s, c) => s + Number(c.amount), 0);
    const totalEarnings = [
        ...liquidado('dividendo'),
        ...liquidado('distribuicao'),
    ].reduce((s, c) => s + Number(c.amount), 0);

    // Agrupa contribuições por projeto para o detalhamento
    const projectMap = new Map(activeProjects.map(p => [p.id, p.name]));
    const byProject = new Map<string, { name: string; costBasis: number; dividends: number }>();
    investorContributions.filter(c => c.status === 'liquidado').forEach(c => {
        const name = projectMap.get(c.project_id) ?? c.project_id.slice(0, 8);
        if (!byProject.has(c.project_id)) {
            byProject.set(c.project_id, { name, costBasis: 0, dividends: 0 });
        }
        const entry = byProject.get(c.project_id)!;
        if (c.type === 'aporte') entry.costBasis += Number(c.amount);
        if (c.type === 'dividendo' || c.type === 'distribuicao') entry.dividends += Number(c.amount);
    });
    const assets = Array.from(byProject.values()).filter(a => a.costBasis > 0 || a.dividends > 0);

    const hasData = totalInvested > 0 || totalEarnings > 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {!hasData && (
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3">
                    <Info className="w-4 h-4 text-gray-400 shrink-0" />
                    <p className="text-xs text-gray-500 font-medium">
                        Nenhum aporte ou rendimento liquidado registrado para este investidor.
                    </p>
                </div>
            )}

            {/* Banner */}
            <div className="bg-gradient-to-r from-gray-900 to-indigo-950 rounded-3xl p-8 text-white relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                    <Calculator size={120} />
                </div>
                <div className="relative z-10 max-w-2xl">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">
                            Consultor IR {year}
                        </span>
                    </div>
                    <h2 className="text-3xl font-black mb-4 tracking-tight">
                        {hasData ? 'Informativo de Rendimentos' : 'Nenhum rendimento no período'}
                    </h2>
                    <p className="text-gray-400 text-sm leading-relaxed mb-6">
                        Utilize os dados abaixo para preencher sua declaração de Imposto de Renda.
                        Os rendimentos de investimentos imobiliários são, em sua maioria, isentos para pessoas físicas.
                    </p>
                    <button
                        disabled
                        title="Disponível em breve"
                        className="flex items-center gap-2 bg-white text-gray-400 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest cursor-not-allowed opacity-60"
                    >
                        <Download className="w-4 h-4" /> Baixar PDF Completo
                    </button>
                </div>
            </div>

            {hasData && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Resumo */}
                    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
                        <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                            <Info className="w-4 h-4" /> Resumo Consolidado
                        </h4>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Custo de Aquisição Total</p>
                            <p className="text-xl font-black text-gray-900">{formatCurrency(totalInvested)}</p>
                        </div>
                        <div className="pt-4 border-t border-gray-50">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Rendimentos Distribuídos</p>
                            <div className="flex items-center gap-2">
                                <p className="text-xl font-black text-emerald-600">{formatCurrency(totalEarnings)}</p>
                                {totalEarnings > 0 && <TrendingUp className="w-4 h-4 text-emerald-500" />}
                            </div>
                        </div>
                        {totalEarnings > 0 && (
                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                <p className="text-[10px] font-black text-blue-400 uppercase mb-2">Dica Fiscal</p>
                                <p className="text-xs text-blue-700 leading-relaxed">
                                    Informe os rendimentos na ficha "Rendimentos Isentos e Não Tributáveis", código 26.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Detalhamento */}
                    <div className="lg:col-span-2 bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-gray-50">
                            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Detalhamento por Empreendimento</h3>
                        </div>
                        {assets.length === 0 ? (
                            <div className="p-12 text-center text-sm text-gray-400">Nenhum ativo com movimentação liquidada.</div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {assets.map((asset, i) => (
                                    <div key={i} className="p-8 hover:bg-gray-50/50 transition-colors">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400">
                                                    <FileText className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <h4 className="font-black text-gray-900">{asset.name}</h4>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Empreendimento</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-8 md:gap-12">
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Total Aportado</p>
                                                    <p className="text-sm font-black text-gray-900">{formatCurrency(asset.costBasis)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Rend. Distribuídos</p>
                                                    <p className={`text-sm font-black ${asset.dividends > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                        {asset.dividends > 0 ? formatCurrency(asset.dividends) : '—'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="p-6 bg-gray-50/50 border-t border-gray-50 text-center">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                Dados baseados em movimentações liquidadas registradas no sistema.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaxReport;
