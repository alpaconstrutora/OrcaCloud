import React, { useRef, useState } from 'react';
import { ImovibStudy } from '../types';
import { useImovibMath, ImovibAba, baseDaRubrica } from '../hooks/useImovibMath';
import type { ImovibMathResult } from '../hooks/useImovibMath';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import type { ImovibCapexBase } from '../types';
import ImovibAvisosBanner from './ImovibAvisosBanner';
import { Activity, Building2, Wallet, PieChart, Coins, Download, FileText, LineChart as LineChartIcon, Loader2, Banknote } from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import { CABECALHO_TABELA } from './ui/cabecalhoDeTabela';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, Legend } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { coresCompativeisNaCopia } from '../utils/html2canvasCores';
import * as XLSX from 'xlsx';
import { useToast } from '../hooks/useToast';

interface ImovibExecutiveSummaryProps {
    study: ImovibStudy;
    /** Abre a aba que corrige a premissa de um aviso do motor. */
    onIrPara?: (aba: ImovibAba) => void;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
};

const BASE_PDF: Record<ImovibCapexBase, string> = {
    terreno: 'do terreno',
    obra: 'da obra',
    vgv: 'do VGV',
};

const formatPercent =(value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(value / 100);
};

/** Campo vazio (null/NaN) usa o padrão — a MESMA regra do motor (`val` em useImovibMath). */
const premissa = (x: number | null | undefined, padrao: number): number =>
    x == null || Number.isNaN(x) ? padrao : x;

type Linha = (string | number | null)[];

export interface PlanilhaImovib {
    indicadores: Linha[];
    premissas: Linha[];
    fluxo: Linha[];
}

/**
 * Conteúdo das abas do Excel do Resumo Executivo — valores NUMÉRICOS (sem
 * "R$"/"%" dentro da célula), unidade em coluna própria. Pura: testada em
 * __tests__/imovibExportacaoExcel.test.ts. Item 5.6 do plano 2026-10-12.
 */
export function montarPlanilhaImovib(study: ImovibStudy, m: ImovibMathResult): PlanilhaImovib {
    const D = IMOVIB_DEFAULTS;
    const tma = premissa(study.discount_rate, D.discount_rate);
    const tirDefinida = Number.isFinite(m.annualIrr);
    const rubricas = m.capexRubricasAtivas;

    const indicadores: Linha[] = [
        ['Indicador', 'Valor', 'Unidade', 'Observação'],
        ['VGV bruto', m.vgvTotal, 'R$', null],
        ['VGV líquido', m.netVgvTotal, 'R$', 'Depois de permutas, inadimplência e distratos'],
        ['Custo de obra', m.constCostTotal, 'R$', null],
        ['Terreno', m.landCost, 'R$', null],
        ['Rubricas do CAPEX no cálculo — sobre o terreno', m.capexRubricas.terreno, 'R$', rubricas ? null : 'Sem rubricas no cálculo'],
        ['Rubricas do CAPEX no cálculo — sobre a obra', m.capexRubricas.obra, 'R$', rubricas ? null : 'Sem rubricas no cálculo'],
        ['Rubricas do CAPEX no cálculo — sobre o VGV', m.capexRubricas.vgv, 'R$', rubricas ? null : 'Sem rubricas no cálculo'],
        ['Rubricas do CAPEX no cálculo — total', m.capexRubricas.total, 'R$', rubricas ? null : 'Sem rubricas no cálculo'],
        ['VPL', m.vpl, 'R$', `Descontado à TMA de ${tma.toLocaleString('pt-BR')}% a.a.`],
        ['TIR', tirDefinida ? m.annualIrr : null, '% a.a.', tirDefinida ? null : 'Sem TIR: o fluxo não troca de sinal'],
        ['Exposição máxima de caixa', m.maxExposure, 'R$', null],
        ['TMA', tma, '% a.a.', null],
        ['Duração', m.duration, 'meses', null],
    ];

    const naoEntra = rubricas ? 'Não entra no cálculo: vem das rubricas do CAPEX (modo Completo)' : null;
    const premissas: Linha[] = [
        ['Grupo', 'Premissa', 'Valor', 'Unidade', 'Observação'],
        ['Cronograma', 'Início das vendas', premissa(study.sales_start_month, D.sales_start_month), 'mês', null],
        ['Cronograma', 'Duração das vendas', premissa(study.sales_duration_months, D.sales_duration_months), 'meses', null],
        ['Cronograma', 'Início da obra', premissa(study.construction_start_month, D.construction_start_month), 'mês', null],
        ['Cronograma', 'Duração da obra', premissa(study.construction_duration_months, D.construction_duration_months), 'meses', null],
        ['Taxas', 'Inflação', premissa(study.inflation_rate, D.inflation_rate), '% a.m.', null],
        ['Taxas', 'TMA', tma, '% a.a.', null],
        ['Taxas', 'Impostos sobre a receita', premissa(study.tax_rate, D.tax_rate), '%', naoEntra],
        ['Taxas', 'Corretagem', premissa(study.brokerage_fee, D.brokerage_fee), '%', naoEntra],
        ['Taxas', 'Inadimplência', premissa(study.default_rate_percent, D.default_rate_percent), '%', null],
        ['Taxas', 'Distratos', premissa(study.cancellation_rate_percent, D.cancellation_rate_percent), '%', null],
        ['Perfil de recebimento', 'Sinal / ato', premissa(study.revenue_downpayment_percent, D.revenue_downpayment_percent), '%', null],
        ['Perfil de recebimento', 'Mensais / obra', premissa(study.revenue_construction_percent, D.revenue_construction_percent), '%', null],
        ['Perfil de recebimento', 'Repasse bancário / chaves', premissa(study.revenue_handover_percent, D.revenue_handover_percent), '%', null],
        ['Financiamento', 'Capital próprio (equity)', premissa(study.funding_equity_percent, D.funding_equity_percent), '%', null],
        // Mesma regra do motor (actualFinPct): campo novo preenchido vale; vazio → "% Financiado" legado.
        ['Financiamento', 'Financiamento à produção / dívida', study.funding_debt_percent != null ? study.funding_debt_percent : premissa(study.financing_percent, D.financing_percent), '%', study.funding_debt_percent == null && (study.financing_percent ?? 0) > 0 ? 'valor legado (% Financiado)' : null],
        ['Financiamento', 'Taxa do financiamento', premissa(study.financing_rate_annual, D.financing_rate_annual), '% a.a.', null],
        ['Financiamento', 'Permuta financeira', premissa(study.swap_financial_percent, D.swap_financial_percent), '%', null],
        ['Financiamento', 'Permuta física', premissa(study.swap_physical_percent, D.swap_physical_percent), '%', null],
    ];

    const fluxo: Linha[] = [
        ['Mês do projeto', 'Mês', 'Receitas (R$)', 'Custos (R$)', 'Caixa líquido do mês (R$)', 'Exposição acumulada (R$)'],
        ...m.monthlyFlows.map(f => [f.month, f.name, f.rev, f.cost, f.net, f.acc]),
    ];

    return { indicadores, premissas, fluxo };
}

/** Nome de arquivo sem espaço nem caractere proibido no Windows. */
const nomeDeArquivo = (nome: string) =>
    (nome || 'Estudo').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');

const abaDoExcel = (linhas: Linha[], larguras: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws['!cols'] = larguras.map(wch => ({ wch }));
    return ws;
};

const ImovibExecutiveSummary: React.FC<ImovibExecutiveSummaryProps> = ({ study, onIrPara }) => {
    const cashFlowData = useImovibMath(study);
    const printRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const { showToast } = useToast();

    // Calculate Net Margin
    const netProfit = cashFlowData.vpl; // Technically VPL is discounted. Let's calculate plain Net Profit
    // Net profit = VGV - Total Construction Cost - Land Cost - Total Taxes - Total Brokerage - Total Interest Paid
    // Sum of all net flows gives us the undiscounted total profit.
    const totalNetProfit = cashFlowData.monthlyFlows.reduce((acc, f) => acc + f.net, 0);
    const netMargin = cashFlowData.vgvTotal > 0 ? (totalNetProfit / cashFlowData.vgvTotal) * 100 : 0;

    const exportToExcel = () => {
        try {
            const planilha = montarPlanilhaImovib(study, cashFlowData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, abaDoExcel(planilha.indicadores, [46, 18, 10, 48]), 'Indicadores');
            XLSX.utils.book_append_sheet(wb, abaDoExcel(planilha.premissas, [22, 36, 12, 10, 60]), 'Premissas');
            XLSX.utils.book_append_sheet(wb, abaDoExcel(planilha.fluxo, [16, 12, 18, 18, 24, 24]), 'Fluxo de caixa');
            XLSX.writeFile(wb, `Imovib_${nomeDeArquivo(study.name)}_Viabilidade.xlsx`);
        } catch (err) {
            console.error('Error exporting Excel:', err);
            showToast(`Erro ao exportar o fluxo de caixa para Excel: ${(err as Error).message}`, 'error');
        }
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
                backgroundColor: '#ffffff',
                // Tailwind v4 usa oklch em toda a paleta e o html2canvas aborta com
                // 'unsupported color function "oklch"' — o PDF não saía. Na CÓPIA,
                // as cores viram rgba e as sombras saem (ver utils/html2canvasCores.ts).
                onclone: (_doc, raiz) => { coresCompativeisNaCopia(raiz, { semSombra: true }); },
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
            pdf.save(`Imovib_${nomeDeArquivo(study.name)}_Viabilidade.pdf`);
        } catch (err) {
            console.error('Error exporting PDF:', err);
            showToast(`Erro ao gerar o PDF do resumo executivo: ${(err as Error).message}`, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white px-6 py-4 rounded-[10px] border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Painel de Viabilidade</h2>
                    <p className="text-gray-500 mt-1 text-sm">Os principais indicadores financeiros consolidados.</p>
                </div>
                {/* Botões compactos (guia §17): h-9, rounded-[6px], font-medium 13px, sentence case. */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
                    >
                        <FileText className="w-[15px] h-[15px]" />
                        Baixar Excel
                    </button>
                    <button
                        onClick={exportToPDF}
                        disabled={isExporting}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-slate-900 text-white hover:bg-slate-800 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-70"
                    >
                        {isExporting ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Download className="w-[15px] h-[15px]" />}
                        {isExporting ? 'Gerando...' : 'Exportar PDF'}
                    </button>
                </div>
            </div>

            <ImovibAvisosBanner avisos={cashFlowData.avisos} onIrPara={onIrPara} />

            {/* Printable Container — capturado pelo html2canvas no PDF: nada de backdrop-filter aqui.
                Na tela é só uma coluna (sem fundo nem padding): ocupa a largura toda e os KPIs alinham com
                o card do topo e o banner, como nas outras abas. Fundo, padding e o teto max-w-5xl valem
                só durante a exportação — o PDF encaixa a captura em 190 mm, então sem o teto o texto dele
                dependeria da largura da janela de quem exporta. */}
            <div ref={printRef} className={isExporting ? 'bg-slate-50 p-6 rounded-[10px] space-y-6 max-w-5xl mx-auto' : 'space-y-6'}>
                {/* Visual Header for PDF */}
                {isExporting && (
                    <div className="pb-6 border-b border-gray-200">
                        <div className="flex justify-between items-start">
                            <div>
                                {/* Título do relatório = h1 do guia §20. */}
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{study.name}</h1>
                                <p className="text-gray-500 text-sm mt-1.5">Relatório Executivo de Viabilidade Financeira</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* KPIs principais — componente canônico (guia §4) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <KpiCard
                        label="Lucro Líquido (VPL)"
                        value={formatCurrency(cashFlowData.vpl)}
                        sub={`Margem Líquida Bruta: ${formatPercent(netMargin)}`}
                        icon={<Coins className="w-4 h-4" />}
                        color="emerald"
                    />
                    <KpiCard
                        label="TIR (Taxa Int. Retorno)"
                        value={`${isNaN(cashFlowData.annualIrr) || !isFinite(cashFlowData.annualIrr)
                            ? 'N/A'
                            : cashFlowData.annualIrr > 999
                                ? '> 999'
                                : cashFlowData.annualIrr.toFixed(2)}% a.a.`}
                        sub="Rentabilidade % Anualzada do projeto"
                        icon={<Activity className="w-4 h-4" />}
                        color="blue"
                    />
                    <KpiCard
                        label="Exposição Máxima de Caixa"
                        value={formatCurrency(cashFlowData.maxExposure)}
                        sub="Fundo de caixa ou cheque máximo necessário"
                        icon={<Wallet className="w-4 h-4" />}
                        color="red"
                    />
                </div>

                {/* KPIs secundários */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard
                        label="VGV Total"
                        value={formatCurrency(cashFlowData.vgvTotal)}
                        icon={<Building2 className="w-4 h-4" />}
                        color="indigo"
                    />
                    <KpiCard
                        label="Custo de Construção"
                        value={formatCurrency(cashFlowData.constCostTotal)}
                        icon={<PieChart className="w-4 h-4" />}
                        color="amber"
                    />
                    <KpiCard
                        label="Prazo Total (Meses)"
                        value={`${cashFlowData.duration} meses`}
                        icon={<Activity className="w-4 h-4" />}
                        color="emerald"
                    />
                    <KpiCard
                        label="Custo do Terreno"
                        value={formatCurrency(cashFlowData.landCost)}
                        icon={<Wallet className="w-4 h-4" />}
                        color="orange"
                    />
                </div>

                <div className="bg-white border border-gray-100 rounded-[10px] p-6 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-[10px] border border-gray-100 flex items-center justify-center mb-3 text-slate-400">
                        <PieChart className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Simulação Completa</h3>
                    <p className="text-sm text-gray-500 max-w-md">
                        Os indicadores acima vêm do mesmo cálculo da Estática, do Espelho de vendas e da listagem: blocos e espelho (VGV), Orçamento (CAPEX), Receitas e Capital e Premissas Dinâmicas.
                        Utilize este resumo para validação de comitê de investimento.
                    </p>
                </div>

                {/* Recharts Visualization (S-Curve inside summary) */}
                <div className="bg-white rounded-[10px] p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
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
                    <div className="mt-6 space-y-8 pb-10">
                        {/* Section: CAPEX Master — tabela no padrão do guia §6/§6.11/§7 (só aparece no PDF:
                            sem SortableHeader, porque não há interação na captura). */}
                        <div className="page-break-inside-avoid">
                            <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-4">Master Budget (CAPEX)</h2>
                            <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className={`${CABECALHO_TABELA.fundo} ${CABECALHO_TABELA.texto} font-semibold text-table-header border-b ${CABECALHO_TABELA.linhaDeBaixo}`}>
                                            <th className={`px-6 py-2 border-r ${CABECALHO_TABELA.divisoria}`}>Categoria</th>
                                            <th className={`px-6 py-2 border-r ${CABECALHO_TABELA.divisoria}`}>Descrição</th>
                                            <th className={`px-6 py-2 border-r ${CABECALHO_TABELA.divisoria}`}>Premissa</th>
                                            <th className="px-6 py-2 text-right">No cálculo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {cashFlowData.capexRubricasAtivas ? (
                                            <>
                                                {(study.capex_items || []).map(item => (
                                                    <tr key={item.id}>
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{item.category}</td>
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{item.name}</td>
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                            {item.value_type === 'percent'
                                                                ? `${Number(item.value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% ${BASE_PDF[baseDaRubrica(item)]}`
                                                                : formatCurrency(item.value || 0)}
                                                        </td>
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800 text-right">
                                                            {formatCurrency(cashFlowData.capexValorPorRubrica[item.id] || 0)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-gray-50">
                                                    <td colSpan={3} className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">Total das rubricas no cálculo</td>
                                                    <td className="px-6 py-2.5 text-sm font-medium text-gray-800 text-right">{formatCurrency(cashFlowData.capexRubricas.total)}</td>
                                                </tr>
                                            </>
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-2.5 text-center text-sm font-normal text-gray-500">
                                                    {study.capex_mode === 'simplified'
                                                        ? 'CAPEX no modo simplificado: custo total por área × custo/m², sem rubricas.'
                                                        : 'Nenhuma rubrica de CAPEX detalhado. Referenciando custo paramétrico dos blocos.'}
                                                </td>
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
