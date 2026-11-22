import React from 'react';
import { FileText, Download, Info, TrendingUp, Calculator } from 'lucide-react';
import { formatCurrency } from '../utils/financialMath';
import type { InvestorContribution } from '../services/investorContributionsService';
import type { ProjectData } from '../services/projectService';
import { anosComMovimento, informeDoAno } from '../utils/informeDeRendimentos';

interface TaxReportProps {
    investorContributions: InvestorContribution[];
    activeProjects: ProjectData[];
}

const TaxReport: React.FC<TaxReportProps> = ({ investorContributions, activeProjects }) => {
    // Uma conta para o gestor e o portal (utils/informeDeRendimentos, Fase B5 do plano
    // 2026-11-21-portal-do-investidor-consolidacao): rendimentos pagos NO ano; custo = posição em 31/12.
    const anoPadrao = new Date().getFullYear() - 1; // ano-calendário anterior
    const anos = React.useMemo(
        () => [...new Set([anoPadrao, ...anosComMovimento(investorContributions)])].sort((a, b) => b - a),
        [investorContributions, anoPadrao],
    );
    const [year, setYear] = React.useState(anoPadrao);
    const projectMap = new Map(activeProjects.map(p => [p.id, p.name]));
    const informe = informeDoAno(investorContributions, year, id => projectMap.get(id) ?? id.slice(0, 8));
    const totalInvested = informe.custoAtual;
    const totalEarnings = informe.rendimentos;
    const assets = informe.linhas.map(l => ({ name: l.nome, costBasis: l.custoAtual, dividends: l.rendimentos }));
    const hasData = totalInvested > 0 || totalEarnings > 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
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
                        <span className="text-sm font-medium text-indigo-200">
                            Consultor IR
                            <select
                                aria-label="Ano-calendário"
                                value={year}
                                onChange={e => setYear(Number(e.target.value))}
                                className="ml-2 h-8 px-2 bg-white/10 border border-white/20 rounded-[6px] text-sm text-white"
                            >
                                {anos.map(a => <option key={a} value={a} className="text-gray-900">{a}</option>)}
                            </select>
                        </span>
                    </div>
                    <h2 className="text-3xl font-black mb-4 tracking-tight">
                        {hasData ? 'Informativo de Rendimentos' : 'Nenhum rendimento no período'}
                    </h2>
                    <p className="text-gray-400 text-sm leading-relaxed mb-6">
                        Utilize os dados abaixo para preencher sua declaração de Imposto de Renda.
                        Os rendimentos de investimentos imobiliários são, em sua maioria, isentos para pessoas físicas.
                    </p>
                    <span title="Disponível em breve" className="inline-block">
                        <button
                            disabled
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-600 rounded-[6px] text-[13px] font-medium cursor-not-allowed opacity-60"
                        >
                            <Download className="w-[15px] h-[15px]" /> Baixar PDF completo
                        </button>
                    </span>
                </div>
            </div>

            {hasData && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Resumo */}
                    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm space-y-6">
                        <h4 className="text-xs font-black text-gray-400 flex items-center gap-2">
                            <Info className="w-4 h-4" /> Resumo Consolidado
                        </h4>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">Custo de aquisição em 31/12/{year}</p>
                            <p className="text-xl font-black text-gray-900">{formatCurrency(totalInvested)}</p>
                        </div>
                        <div className="pt-4 border-t border-gray-50">
                            <p className="text-xs font-semibold text-gray-500 mb-1">Rendimentos recebidos em {year}</p>
                            <div className="flex items-center gap-2">
                                <p className="text-xl font-black text-emerald-600">{formatCurrency(totalEarnings)}</p>
                                {totalEarnings > 0 && <TrendingUp className="w-4 h-4 text-emerald-500" />}
                            </div>
                        </div>
                        {totalEarnings > 0 && (
                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                <p className="text-xs font-semibold text-blue-700 mb-2">Dica Fiscal</p>
                                <p className="text-xs text-blue-700 leading-relaxed">
                                    Informe os rendimentos na ficha "Rendimentos Isentos e Não Tributáveis", código 26.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Detalhamento */}
                    <div className="lg:col-span-2 bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-gray-50">
                            <h3 className="text-sm font-black text-gray-900">Detalhamento por Empreendimento</h3>
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
                                                    <p className="text-xs font-semibold text-gray-500">Empreendimento</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-8 md:gap-12">
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-500 mb-1">Total Aportado</p>
                                                    <p className="text-sm font-black text-gray-900">{formatCurrency(asset.costBasis)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-semibold text-gray-500 mb-1">Rend. Distribuídos</p>
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
                            <p className="text-xs text-gray-500">
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
