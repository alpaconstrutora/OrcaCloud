import React, { useRef, useState } from 'react';
import { ImovibStudy } from '../types';
import { useImovibMath } from '../hooks/useImovibMath';
import { Activity, TrendingUp, AlertCircle, Building2, Wallet, PieChart, Coins, Download, FileText, LineChart as LineChartIcon, Loader2, Leaf, Banknote } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, Legend } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

interface ImovibExecutiveSummaryProps {
    study: ImovibStudy;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
};

const formatPercent = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(value / 100);
};

const ImovibExecutiveSummary: React.FC<ImovibExecutiveSummaryProps> = ({ study }) => {
    const cashFlowData = useImovibMath(study);
    const printRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);

    // Calculate Net Margin
    const netProfit = cashFlowData.vpl; // Technically VPL is discounted. Let's calculate plain Net Profit
    // Net profit = VGV - Total Construction Cost - Land Cost - Total Taxes - Total Brokerage - Total Interest Paid
    // Sum of all net flows gives us the undiscounted total profit.
    const totalNetProfit = cashFlowData.monthlyFlows.reduce((acc, f) => acc + f.net, 0);
    const netMargin = cashFlowData.vgvTotal > 0 ? (totalNetProfit / cashFlowData.vgvTotal) * 100 : 0;

    const exportToExcel = () => {
        const data = cashFlowData.monthlyFlows.map(flow => ({
            'Mês do Projeto': flow.month,
            'Nome do Mês': flow.name,
            'Receitas (VGV Bruto)': flow.rev,
            'Custos (Construção + Terreno)': flow.cost,
            'Caixa Líquido do Mês (Net Flow)': flow.net,
            'Exposição Acumulada (Fundo de Caixa)': flow.acc
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Fluxo_de_Caixa");
        XLSX.writeFile(wb, `Imovib_${study.name.replace(/ /g, '_')} _Fluxo.xlsx`);
    };

    const exportToPDF = async () => {
        if (!printRef.current) return;
        try {
            setIsExporting(true);
            // small delay to allow react to render if we conditionally hid something
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(printRef.current, {
                scale: 1.5, // Slightly lower scale to prevent memory issues on very long pages
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95); // Use JPEG for smaller size
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            // margin
            const margin = 10;
            const printableWidth = pdfWidth - (margin * 2);
            const canvasImgHeight = (canvas.height * printableWidth) / canvas.width;

            // Handle multi-page splitting
            let heightLeft = canvasImgHeight;
            let position = margin;

            pdf.addImage(imgData, 'JPEG', margin, position, printableWidth, canvasImgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft >= 0) {
                position = heightLeft - canvasImgHeight + margin; // Shift image up
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', margin, position, printableWidth, canvasImgHeight);
                heightLeft -= pdfHeight;
            }
            pdf.save(`Imovib_${study.name.replace(/ /g, '_')} _Viabilidade.pdf`);
        } catch (err) {
            console.error('Error exporting PDF:', err);
            alert('Ocorreu um erro ao gerar o PDF.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Painel de Viabilidade</h2>
                    <p className="text-slate-500 mt-1 font-medium text-sm">Os principais indicadores financeiros consolidados.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-bold text-sm transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        Baixar Excel
                    </button>
                    <button
                        onClick={exportToPDF}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold text-sm transition-colors disabled:opacity-70"
                    >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {isExporting ? 'Gerando...' : 'Exportar PDF'}
                    </button>
                </div>
            </div>

            {/* Printable Container */}
            <div ref={printRef} className="bg-slate-50 p-6 rounded-3xl space-y-8 max-w-5xl mx-auto">
                {/* Visual Header for PDF */}
                {isExporting && (
                    <div className="mb-8 pb-6 border-b border-slate-200">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-3xl font-black text-slate-900 tracking-tight">{study.name}</h1>
                                <p className="text-slate-500 font-medium text-lg">Relatório Executivo de Viabilidade Financeira</p>
                            </div>
                            <div className="text-right">
                                <span className={`px - 4 py - 2 rounded - xl text - sm font - bold border inline - block ${study.committee_decision === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                        study.committee_decision === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                            'bg-slate-50 text-slate-500 border-slate-200'
                                    } `}>
                                    Status: {
                                        study.committee_decision === 'approved' ? 'APROVADO' :
                                            study.committee_decision === 'rejected' ? 'REPROVADO' :
                                                study.committee_decision === 'in_review' ? 'EM ANÁLISE' : 'RASCUNHO'
                                    }
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Top Tier KPIs - The "Big Three" */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm relative overflow-hidden group hover:border-emerald-200 transition-colors">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <TrendingUp className="w-32 h-32" />
                        </div>
                        <div className="flex items-center gap-3 text-emerald-600 mb-4 font-black tracking-widest uppercase text-sm">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                <Coins className="w-4 h-4 text-emerald-700" />
                            </div>
                            Lucro Líquido (VPL)
                        </div>
                        <div className="text-4xl font-black text-slate-900 tracking-tighter">
                            {formatCurrency(cashFlowData.vpl)}
                        </div>
                        <div className="text-sm mt-3 text-slate-500 font-medium">Margem Líquida Bruta: {formatPercent(netMargin)}</div>
                    </div>

                    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-colors">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <Activity className="w-32 h-32" />
                        </div>
                        <div className="flex items-center gap-3 text-blue-600 mb-4 font-black tracking-widest uppercase text-sm">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                <Activity className="w-4 h-4 text-blue-700" />
                            </div>
                            TIR (Taxa Int. Retorno)
                        </div>
                        <div className="text-4xl font-black text-slate-900 tracking-tighter flex items-baseline gap-1">
                            {isNaN(cashFlowData.annualIrr) || !isFinite(cashFlowData.annualIrr) ? (
                                'N/A'
                            ) : cashFlowData.annualIrr > 999 ? (
                                '> 999'
                            ) : (
                                cashFlowData.annualIrr.toFixed(2)
                            )}
                            <span className="text-xl text-slate-400">% a.a.</span>
                        </div>
                        <div className="text-sm mt-3 text-slate-500 font-medium">Rentabilidade % Anualzada do projeto</div>
                    </div>

                    <div className="bg-gradient-to-br from-rose-500 to-red-600 rounded-3xl p-8 text-white shadow-xl shadow-red-900/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <AlertCircle className="w-32 h-32" />
                        </div>
                        <div className="flex items-center gap-3 text-red-100 mb-4 font-black tracking-widest uppercase text-sm">
                            <div className="w-8 h-8 rounded-full bg-red-400/30 flex items-center justify-center text-white backdrop-blur-sm">
                                <Wallet className="w-4 h-4" />
                            </div>
                            Exposição Máxima de Caixa
                        </div>
                        <div className="text-4xl font-black tracking-tighter text-white">
                            {formatCurrency(cashFlowData.maxExposure)}
                        </div>
                        <div className="text-sm mt-3 text-red-100 font-medium">Fundo de caixa ou cheque máximo necessário</div>
                    </div>
                </div>

                {/* Secondary KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                            <Building2 className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">VGV Total</div>
                            <div className="text-lg font-black text-slate-800">{formatCurrency(cashFlowData.vgvTotal)}</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                            <PieChart className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Custo de Construção</div>
                            <div className="text-lg font-black text-slate-800">{formatCurrency(cashFlowData.constCostTotal)}</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                            <Activity className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Prazo Total (Meses)</div>
                            <div className="text-lg font-black text-slate-800">{cashFlowData.duration} meses</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                            <Wallet className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Custo do Terreno</div>
                            <div className="text-lg font-black text-slate-800">{formatCurrency(cashFlowData.landCost)}</div>
                        </div>
                    </div>
                </div>

                {/* Impacto ESG */}
                {(cashFlowData.esgVgvPremiumValue > 0 || cashFlowData.esgCostTotal > 0) && (
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0">
                                <Leaf className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-emerald-900 tracking-tight">Impacto Financeiro ESG (Premium Verde)</h3>
                                <p className="text-sm font-medium text-emerald-700 mt-1 max-w-lg">
                                    Métricas exclusivas geradas pelas iniciativas viáveis aprovadas no Parecer Técnico do Comitê.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6 md:gap-8 shrink-0">
                            <div className="text-right">
                                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Custo Provisionado (CAPEX)</div>
                                <div className="text-2xl font-black text-slate-800">
                                    {formatCurrency(cashFlowData.esgCostTotal)}
                                </div>
                            </div>
                            <div className="w-px h-12 bg-emerald-200 hidden md:block"></div>
                            <div className="text-right">
                                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Valorização do Produto (VGV)</div>
                                <div className="text-2xl font-black text-emerald-700">
                                    +{formatCurrency(cashFlowData.esgVgvPremiumValue)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4 text-slate-400">
                        <PieChart className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2">Simulação Completa</h3>
                    <p className="text-slate-500 max-w-md">
                        Os indicadores acima são atualizados em tempo real com base no Estudo Estático e nas Premissas Dinâmicas.
                        Utilize este resumo para validação de comitê de investimento.
                    </p>
                </div>

                {/* Recharts Visualization (S-Curve inside summary) */}
                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm mt-4">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <LineChartIcon className="w-5 h-5 text-indigo-600" />
                            Curva S e Linha de Exposição
                        </h3>
                    </div>
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={cashFlowData.monthlyFlows}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={30}
                                />
                                <YAxis
                                    tickFormatter={(value) => `R$ ${(value / 1000000).toFixed(1)} M`}
                                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    formatter={(value: any) => formatCurrency(Number(value))}
                                    labelStyle={{ fontWeight: 800, color: '#0f172a' }}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 600, fontSize: '13px' }} />
                                <Bar yAxisId={0} dataKey="net" name="Caixa Líquido no Mês" fill="#cbd5e1" radius={[4, 4, 0, 0]} opacity={0.5} />
                                <Line
                                    type="monotone"
                                    dataKey="acc"
                                    name="Exposição de Caixa (Acumulado)"
                                    stroke="#0f172a"
                                    strokeWidth={4}
                                    dot={false}
                                    activeDot={{ r: 8, fill: '#0f172a', stroke: '#fff', strokeWidth: 2 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Extended Sections for PDF Export */}
                {isExporting && (
                    <div className="mt-12 space-y-12 pb-10">
                        {/* Section: ESG & Committee Notes */}
                        <div className="page-break-inside-avoid">
                            <h2 className="text-2xl font-black text-slate-900 border-b-2 border-slate-200 pb-2 mb-6">Parecer Institucional & ESG</h2>
                            <div className="grid grid-cols-2 gap-8">
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                                    <h3 className="font-bold text-slate-800 mb-4 tracking-widest text-xs uppercase">Diretrizes ESG</h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Environmental Score:</span>
                                            <span className="font-black text-emerald-600">{study.esg_environmental_score || 3}/5</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Social Score:</span>
                                            <span className="font-black text-blue-600">{study.esg_social_score || 3}/5</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Governance Score:</span>
                                            <span className="font-black text-indigo-600">{study.esg_governance_score || 3}/5</span>
                                        </div>
                                        {study.esg_certifications && study.esg_certifications.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-slate-200 text-sm">
                                                <span className="block text-slate-600 font-bold mb-2">Selos Meta:</span>
                                                <div className="flex gap-2 flex-wrap">
                                                    {study.esg_certifications.map(c => (
                                                        <span key={c} className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-bold">{c}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {study.esg_notes && (
                                            <div className="mt-4 pt-4 border-t border-slate-200 text-sm italic text-slate-600">
                                                "{study.esg_notes}"
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                                    <h3 className="font-bold text-slate-800 mb-4 tracking-widest text-xs uppercase">Considerações do Comitê</h3>
                                    <div className="text-sm text-slate-700 whitespace-pre-wrap">
                                        {study.committee_notes || "Sem notas adicionais cadastradas para o comitê."}
                                    </div>
                                    <div className="mt-8 pt-4 border-t border-slate-200 flex justify-end gap-12">
                                        <div className="text-center">
                                            <div className="w-40 h-px bg-slate-400 mb-2"></div>
                                            <span className="text-xs text-slate-500 font-bold">Ass. Diretor / Sponsor</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section: CAPEX Master */}
                        <div className="page-break-inside-avoid">
                            <h2 className="text-2xl font-black text-slate-900 border-b-2 border-slate-200 pb-2 mb-6">Master Budget (CAPEX)</h2>
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="p-4 font-bold text-slate-600">Categoria</th>
                                            <th className="p-4 font-bold text-slate-600">Descrição</th>
                                            <th className="p-4 font-bold text-slate-600 text-right">Custo Estimado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {study.capex_items && study.capex_items.length > 0 ? (
                                            study.capex_items.map(item => (
                                                <tr key={item.id}>
                                                    <td className="p-4 text-slate-700 font-medium">{item.category}</td>
                                                    <td className="p-4 text-slate-600">{item.name}</td>
                                                    <td className="p-4 text-slate-900 font-black text-right">
                                                        {item.value_type === 'percent' ? `${item.value.toFixed(2)}% do VGV` : formatCurrency(item.value || 0)}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="p-4 text-center text-slate-500">Nenhum item de CAPEX detalhado. Referenciando custo paramétrico dos blocos.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                )}
            </div> {/* End of printRef */}
        </div>
    );
};

export default ImovibExecutiveSummary;
