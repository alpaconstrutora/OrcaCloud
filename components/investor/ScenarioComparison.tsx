import React from 'react';
import { TrendingDown, TrendingUp, Minus, SlidersHorizontal, AlertCircle } from 'lucide-react';
import { InvestorOpportunity } from '../../services/investorPortalService';

interface Props {
    opportunity: InvestorOpportunity;
}

interface ScenarioResult {
    label: string;
    vgv: number;
    cost: number;
    margem_bruta: number;
    margem_pct: number;
    roi: number;
    lucro: number;
}

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function calcScenario(
    baseVgv: number,
    baseCost: number,
    vgvChangePct: number,  // positivo = sobe, negativo = cai
    costChangePct: number, // positivo = sobe, negativo = cai
    label: string,
): ScenarioResult {
    const vgv = baseVgv * (1 + vgvChangePct / 100);
    const cost = baseCost * (1 + costChangePct / 100);
    const margem_bruta = vgv - cost;
    const margem_pct = (margem_bruta / vgv) * 100;
    const roi = (margem_bruta / cost) * 100;
    return { label, vgv, cost, margem_bruta, margem_pct, roi, lucro: margem_bruta };
}

const SCENARIO_STYLES = {
    conservador: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        header: 'bg-red-100',
        text: 'text-red-700',
        accent: 'text-red-600',
        icon: <TrendingDown className="w-4 h-4" />,
        badge: 'bg-red-100 text-red-700',
    },
    realista: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        header: 'bg-blue-600',
        text: 'text-white',
        accent: 'text-blue-100',
        icon: <Minus className="w-4 h-4" />,
        badge: 'bg-blue-600 text-white',
    },
    otimista: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        header: 'bg-emerald-100',
        text: 'text-emerald-700',
        accent: 'text-emerald-600',
        icon: <TrendingUp className="w-4 h-4" />,
        badge: 'bg-emerald-100 text-emerald-700',
    },
} as const;

const ScenarioComparison: React.FC<Props> = ({ opportunity: op }) => {
    const baseVgv = op.vgv;
    const baseCost = op.cost_estimate;

    // Sem dados base suficientes — não renderiza
    if (!baseVgv || !baseCost) {
        return (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Para exibir os cenários de viabilidade, preencha o <strong>VGV</strong> e o <strong>custo estimado</strong> desta oportunidade.</span>
            </div>
        );
    }

    const hasScenarioParams =
        op.scenario_cost_cons_pct != null || op.scenario_vgv_cons_pct != null ||
        op.scenario_cost_opt_pct != null || op.scenario_vgv_opt_pct != null;

    // Parâmetros com defaults razoáveis se não configurados
    const costConsPct  = op.scenario_cost_cons_pct  ?? 15;
    const vgvConsPct   = -(op.scenario_vgv_cons_pct  ?? 10);  // campo = quanto VGV cai → negativo
    const costOptPct   = -(op.scenario_cost_opt_pct  ?? 5);   // campo = quanto custo cai → negativo
    const vgvOptPct    = op.scenario_vgv_opt_pct   ?? 8;

    const scenarios = {
        conservador: calcScenario(baseVgv, baseCost, vgvConsPct,  costConsPct, 'Conservador'),
        realista:    calcScenario(baseVgv, baseCost, 0,            0,           'Realista'),
        otimista:    calcScenario(baseVgv, baseCost, vgvOptPct,    costOptPct,  'Otimista'),
    };

    const ROWS: { key: keyof ScenarioResult; label: string; fmt: (v: number) => string; highlight?: boolean }[] = [
        { key: 'vgv',          label: 'VGV',           fmt: fmtBRL },
        { key: 'cost',         label: 'Custo total',   fmt: fmtBRL },
        { key: 'margem_bruta', label: 'Margem bruta',  fmt: fmtBRL, highlight: true },
        { key: 'margem_pct',   label: 'Margem (%)',    fmt: fmtPct, highlight: true },
        { key: 'roi',          label: 'ROI',           fmt: v => `${fmtPct(v)}`, highlight: true },
    ];

    type ScenKey = keyof typeof scenarios;
    const COLS: ScenKey[] = ['conservador', 'realista', 'otimista'];

    // ROI do realista como base para as barras
    const maxRoi = Math.max(...COLS.map(k => scenarios[k].roi), 0.1);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Cenários de Viabilidade</span>
                </div>
                {!hasScenarioParams && (
                    <span className="text-[10px] text-gray-400 italic">usando variações padrão</span>
                )}
            </div>

            {/* Cards de cenário */}
            <div className="grid grid-cols-3 gap-3">
                {COLS.map(key => {
                    const s = scenarios[key];
                    const style = SCENARIO_STYLES[key];
                    const isRealista = key === 'realista';
                    return (
                        <div
                            key={key}
                            className={`rounded-2xl border overflow-hidden ${style.bg} ${style.border} ${isRealista ? 'ring-2 ring-blue-600 ring-offset-1' : ''}`}
                        >
                            {/* Header */}
                            <div className={`flex items-center justify-between px-4 py-3 ${style.header}`}>
                                <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${style.text}`}>
                                    {style.icon}
                                    {s.label}
                                </span>
                                {isRealista && (
                                    <span className="text-[9px] font-black text-white/70 uppercase tracking-wider">Base</span>
                                )}
                            </div>

                            {/* ROI destaque */}
                            <div className="px-4 pt-4 pb-2">
                                <p className={`text-[10px] font-black uppercase tracking-wider mb-0.5 ${isRealista ? 'text-blue-600' : style.accent}`}>ROI</p>
                                <p className={`text-2xl font-black ${isRealista ? 'text-blue-800' : key === 'conservador' ? 'text-red-700' : 'text-emerald-800'}`}>
                                    {fmtPct(s.roi)}
                                </p>
                                {/* Barra relativa */}
                                <div className="mt-2 h-1.5 bg-black/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${key === 'conservador' ? 'bg-red-400' : key === 'realista' ? 'bg-blue-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${Math.max(4, (s.roi / maxRoi) * 100)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Demais métricas */}
                            <div className="px-4 pb-4 space-y-2 pt-2">
                                {ROWS.filter(r => r.key !== 'roi').map(row => (
                                    <div key={row.key} className={`flex justify-between items-baseline ${row.highlight ? '' : 'opacity-70'}`}>
                                        <span className="text-[10px] text-gray-500 font-medium">{row.label}</span>
                                        <span className={`text-xs font-bold ${row.highlight
                                            ? (key === 'conservador' ? 'text-red-700' : key === 'realista' ? 'text-blue-700' : 'text-emerald-700')
                                            : 'text-gray-700'
                                        }`}>
                                            {row.fmt(s[row.key] as number)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Resumo das variações aplicadas */}
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                    <span>
                        Conservador: custo <strong>+{costConsPct}%</strong> / VGV <strong>{vgvConsPct}%</strong>
                    </span>
                </div>
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                    <TrendingUp className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    <span>
                        Otimista: custo <strong>{costOptPct}%</strong> / VGV <strong>+{vgvOptPct}%</strong>
                    </span>
                </div>
            </div>

            {/* Premissas */}
            {op.scenario_notes && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 leading-relaxed">
                    <span className="font-bold text-gray-600">Premissas: </span>
                    {op.scenario_notes}
                </div>
            )}
        </div>
    );
};

export default ScenarioComparison;
