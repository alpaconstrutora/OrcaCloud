import React from 'react';
import { ImovibStudy } from '../types';
import { Calculator, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { useImovibMath, ImovibAba } from '../hooks/useImovibMath';
import ImovibAvisosBanner from './ImovibAvisosBanner';
import { KpiCard } from './ui/KpiCard';

interface ImovibStaticViabilityProps {
    study: ImovibStudy;
    /** Abre a aba que corrige a premissa de um aviso do motor. */
    onIrPara?: (aba: ImovibAba) => void;
}

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

const formatArea = (value: number) =>
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value) + ' m²';

const pctDoVgv = (valor: number, vgv: number) =>
    vgv > 0 ? `${((valor / vgv) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—';

/**
 * Viabilidade estática: VGV − custos, sem tempo nem desconto.
 *
 * Todos os números vêm do motor (computeImovibMath) — os MESMOS do Resumo, da
 * listagem e do Espelho. Antes esta aba tinha fórmulas próprias: o custo de obra
 * era T.O. × área do terreno × pavimentos (zerava sem Mapa Regulatório, e o lucro
 * ficava igual ao VGV) e o VGV vinha do espelho por outra conta.
 */
const ImovibStaticViability: React.FC<ImovibStaticViabilityProps> = ({ study, onIrPara }) => {
    const math = useImovibMath(study);

    // O mesmo VGV do Resumo, do Espelho e da listagem.
    const vgv = math.vgvTotal;
    const landCost = math.landCost;
    const constructionCost = math.constCostTotal;
    const rubricas = math.capexRubricasAtivas ? math.capexRubricas.total : 0;
    const totalCost = landCost + constructionCost + rubricas;
    const grossProfit = vgv - totalCost;
    const margin = vgv > 0 ? (grossProfit / vgv) * 100 : 0;

    const blocos = Object.values(math.vgvPorBloco);
    const blocosPeloEspelho = blocos.filter(b => b.fonte === 'espelho').length;
    const origemVgv = blocos.length === 0
        ? 'Sem blocos cadastrados'
        : blocosPeloEspelho === blocos.length
            ? 'Pelo espelho de vendas'
            : blocosPeloEspelho === 0
                ? 'Área privativa vendável × preço/m²'
                : `Espelho em ${blocosPeloEspelho} de ${blocos.length} blocos; demais por área × preço/m²`;

    const linhas: { rotulo: string; valor: number; detalhe?: string }[] = [
        { rotulo: '(−) Aquisição do terreno', valor: -landCost },
        { rotulo: '(−) Custo de construção', valor: -constructionCost, detalhe: study.capex_mode === 'simplified' ? 'CAPEX simplificado: área × custo/m²' : 'Área construída × custo/m² de cada bloco' },
    ];
    if (math.capexRubricasAtivas) {
        linhas.push({ rotulo: '(−) Rubricas do CAPEX', valor: -rubricas, detalhe: 'Terreno, obra e deduções sobre o VGV (aba Orçamento)' });
    }

    return (
        <div className="space-y-6 pb-10">
            <ImovibAvisosBanner avisos={math.avisos} onIrPara={onIrPara} />

            {/* KPIs — componente canônico (guia §4) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <KpiCard
                    label="VGV Potencial (Receita)"
                    value={formatCurrency(vgv)}
                    sub={origemVgv}
                    title={origemVgv}
                    icon={<TrendingUp className="w-4 h-4" />}
                    color="blue"
                />
                <KpiCard
                    label="Custo Total Estimado"
                    value={formatCurrency(totalCost)}
                    sub={`Terreno + Construção${math.capexRubricasAtivas ? ' + Rubricas do CAPEX' : ''}`}
                    icon={<DollarSign className="w-4 h-4" />}
                    color="red"
                />
                <KpiCard
                    label="Lucro Bruto (Margem)"
                    value={formatCurrency(grossProfit)}
                    sub={vgv > 0 ? `${margin.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% de margem bruta` : 'Sem VGV para calcular a margem'}
                    icon={<Activity className="w-4 h-4" />}
                    color="emerald"
                />
            </div>

            {/* DRE simplificada — células no padrão do guia §7/§7.2 */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-[6px]">
                        <Calculator className="w-4 h-4" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Viabilidade Estática (Simplificada)</h3>
                </div>
                <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-gray-200">
                        <tr>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                Valor Geral de Vendas (VGV)
                                <span className="block text-xs text-gray-500">{origemVgv}</span>
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">{formatCurrency(vgv)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600 w-32">{vgv > 0 ? '100,00%' : '—'}</td>
                        </tr>
                        {linhas.map(l => (
                            <tr key={l.rotulo}>
                                <td className="px-6 py-2.5 pl-12 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                    {l.rotulo}
                                    {l.detalhe && <span className="block text-xs text-gray-500">{l.detalhe}</span>}
                                </td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-red-600">{formatCurrency(l.valor)}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">{pctDoVgv(l.valor, vgv)}</td>
                            </tr>
                        ))}
                        <tr className="bg-gray-50">
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">Total de custos</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800">{formatCurrency(-totalCost)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-gray-600">{pctDoVgv(-totalCost, vgv)}</td>
                        </tr>
                        <tr className="bg-emerald-50/30">
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-emerald-900">Lucro Bruto</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-emerald-700">{formatCurrency(grossProfit)}</td>
                            <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-normal text-emerald-700">{vgv > 0 ? pctDoVgv(grossProfit, vgv) : '—'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Áreas — as mesmas que o motor usa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-white rounded-[10px] p-5 border border-gray-100 shadow-sm">
                    <span className="text-xs font-semibold text-gray-500">Área privativa</span>
                    <div className="text-xl font-semibold text-gray-900 mt-1">{formatArea(math.totalPrivateArea)}</div>
                </div>
                <div className="bg-white rounded-[10px] p-5 border border-gray-100 shadow-sm">
                    <span className="text-xs font-semibold text-gray-500">Área comum</span>
                    <div className="text-xl font-semibold text-gray-900 mt-1">{formatArea(math.totalCommonArea)}</div>
                </div>
                <div className="bg-white rounded-[10px] p-5 border border-green-100 shadow-sm">
                    <span className="text-xs font-semibold text-green-700">Área construída (base do custo de obra)</span>
                    <div className="text-xl font-semibold text-green-900 mt-1">{formatArea(math.totalBlockArea)}</div>
                </div>
            </div>
        </div>
    );
};

export default ImovibStaticViability;
