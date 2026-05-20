import React, { useState, useMemo } from 'react';
import { ImovibStudy } from '../types';
import { useImovibMath } from '../hooks/useImovibMath';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, TrendingDown, TrendingUp, AlertOctagon, ShieldAlert } from 'lucide-react';
import { imovibService } from '../services/imovibService';

interface ImovibSensitivityFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const ImovibSensitivityForm: React.FC<ImovibSensitivityFormProps> = ({ study, onDataChanged }) => {
    // Sliders for specific "Stress Test" scenario
    const [scenarioVgvDelta, setScenarioVgvDelta] = useState(0);
    const [scenarioCostDelta, setScenarioCostDelta] = useState(0);

    // Calculate Base Case
    const baseMath = useImovibMath(study);
    const baseIrr = baseMath.annualIrr;

    // Calculate Custom Scenario Case
    const scenarioMath = useImovibMath(study, {
        vgvDelta: scenarioVgvDelta,
        costDelta: scenarioCostDelta
    });
    const scenarioIrr = scenarioMath.annualIrr;

    // --- TORNADO CHART DATA CALCULATION ---
    // We run the engine multiple times to see individual impacts

    // +/- 10% VGV
    const vgvUp = useImovibMath(study, { vgvDelta: 10 }).annualIrr;
    const vgvDown = useImovibMath(study, { vgvDelta: -10 }).annualIrr;

    // +/- 10% Custos
    const costUp = useImovibMath(study, { costDelta: 10 }).annualIrr;
    const costDown = useImovibMath(study, { costDelta: -10 }).annualIrr;

    // In a Tornado Chart, we usually show the delta from Base IRR. 
    // Example: Base = 15%. VGV Up = 20% (Delta = +5%). VGV Down = 8% (Delta = -7%).
    // We want the bars to spread left and right of the 0 axis (which represents Base IRR).

    const tornadoData = useMemo(() => {
        if (isNaN(baseIrr)) return [];
        return [
            {
                name: 'VGV (Receitas) ±10%',
                PiorCenario: isNaN(vgvDown) ? 0 : vgvDown - baseIrr,
                MelhorCenario: isNaN(vgvUp) ? 0 : vgvUp - baseIrr,
                baseObj: { p: vgvDown, m: vgvUp }
            },
            {
                name: 'Custo Construção ±10%',
                // Pior cenário = Custo sobe 10% (TIR cai)
                PiorCenario: isNaN(costUp) ? 0 : costUp - baseIrr,
                // Melhor cenário = Custo cai 10% (TIR sobe)
                MelhorCenario: isNaN(costDown) ? 0 : costDown - baseIrr,
                baseObj: { p: costUp, m: costDown }
            }
        ];
    }, [baseIrr, vgvUp, vgvDown, costUp, costDown]);

    const formatPct = (val: number) => {
        if (isNaN(val) || !isFinite(val)) return '---';
        return `${val.toFixed(2)}%`;
    };

    // Qualitative Risk Management (Saved in swot_analysis JSONB for simplicity)
    const [riskNotes, setRiskNotes] = useState((study.swot_analysis?.risks as string) || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveRisks = async () => {
        try {
            setIsSaving(true);
            const currentSwot = study.swot_analysis || {};
            await imovibService.updateStudy(study.id, {
                swot_analysis: { ...currentSwot, risks: riskNotes }
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 pb-10 max-w-7xl mx-auto">

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Activity className="w-7 h-7 text-rose-500" />
                        Engenharia Financeira e Risco
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium max-w-2xl">
                        Avalie a resiliência do projeto. O Gráfico Tornado mostra quais variáveis mais afetam o retorno. Explore cenários estressados para encontrar o ponto de quebra.
                    </p>
                </div>
                <div className="flex gap-4 p-4 rounded-2xl bg-indigo-50 border border-indigo-100 items-center">
                    <div>
                        <span className="block text-[10px] font-black tracking-widest uppercase text-indigo-400">TIR Base (Ao Ano)</span>
                        <span className="block text-2xl font-black text-indigo-700">{formatPct(baseIrr)}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* TORNADO CHART */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col h-[500px]">
                    <div className="mb-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-indigo-500" />
                            Gráfico Tornado (Sensibilidade ±10%)
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">Impacto na TIR Anual partindo do Cenário Base.</p>
                    </div>

                    <div className="flex-1 w-full min-h-0">
                        {isNaN(baseIrr) ? (
                            <div className="h-full flex items-center justify-center text-slate-400 font-bold">
                                Parâmetros base insuficientes para calcular TIR.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    layout="vertical"
                                    data={tornadoData}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    barSize={40}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke="#f1f5f9" />
                                    <XAxis type="number" tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`} />
                                    <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12, fontWeight: 600, fill: '#475569' }} />
                                    <RechartsTooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        formatter={(value: any, name: any, props: any) => {
                                            if (value === undefined || value === null) return ['---', name];
                                            const numValue = Number(value);
                                            const realIrr = name === 'PiorCenario' ? props.payload.baseObj.p : props.payload.baseObj.m;
                                            return [`${numValue > 0 ? '+' : ''}${numValue.toFixed(2)}% (TIR final: ${realIrr.toFixed(2)}%)`, name === 'PiorCenario' ? 'Impacto Negativo' : 'Impacto Positivo'];
                                        }}
                                    />
                                    <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={2} />
                                    <Bar dataKey="PiorCenario" fill="#ef4444" radius={[4, 0, 0, 4]} name="Cenário Pessimista" />
                                    <Bar dataKey="MelhorCenario" fill="#10b981" radius={[0, 4, 4, 0]} name="Cenário Otimista" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* SCENARIO BUILDER (STRESS TEST) */}
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col">
                    <div className="mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <AlertOctagon className="w-5 h-5 text-rose-500" />
                            Stress Test Personalizado
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">Deslize para simular choques macroeconômicos.</p>
                    </div>

                    <div className="space-y-6 flex-1">
                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-bold text-slate-700">Choque de Receita (VGV)</label>
                                <span className={`text-sm font-black ${scenarioVgvDelta < 0 ? 'text-rose-600' : scenarioVgvDelta > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {scenarioVgvDelta > 0 ? '+' : ''}{scenarioVgvDelta}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="-30" max="30" step="1"
                                value={scenarioVgvDelta}
                                onChange={(e) => setScenarioVgvDelta(Number(e.target.value))}
                                className="w-full accent-indigo-600"
                            />
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
                                <span>-30%</span>
                                <span>0</span>
                                <span>+30%</span>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-bold text-slate-700">Choque de Custos (Obra/Terreno)</label>
                                <span className={`text-sm font-black ${scenarioCostDelta > 0 ? 'text-rose-600' : scenarioCostDelta < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {scenarioCostDelta > 0 ? '+' : ''}{scenarioCostDelta}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="-30" max="30" step="1"
                                value={scenarioCostDelta}
                                onChange={(e) => setScenarioCostDelta(Number(e.target.value))}
                                className="w-full accent-rose-500"
                            />
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
                                <span>-30%</span>
                                <span>0</span>
                                <span>+30%</span>
                            </div>
                        </div>

                        {/* Results Box */}
                        <div className={`mt-6 p-4 rounded-2xl border transition-colors ${isNaN(scenarioIrr) ? 'bg-slate-50 border-slate-200' :
                            scenarioIrr < baseIrr ? 'bg-rose-50 border-rose-200' :
                                scenarioIrr > baseIrr ? 'bg-emerald-50 border-emerald-200' : 'bg-indigo-50 border-indigo-200'
                            }`}>
                            <span className="block text-center text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">TIR no Cenário de Stress</span>
                            <span className={`block text-center text-4xl font-black ${isNaN(scenarioIrr) ? 'text-slate-400' :
                                scenarioIrr < baseIrr ? 'text-rose-600' :
                                    scenarioIrr > baseIrr ? 'text-emerald-600' : 'text-indigo-600'
                                }`}>
                                {formatPct(scenarioIrr)}
                            </span>

                            {!isNaN(scenarioIrr) && scenarioVgvDelta === 0 && scenarioCostDelta === 0 && (
                                <p className="text-center text-xs font-bold text-indigo-400 mt-2">Mesmo que o Cenário Base</p>
                            )}
                            {!isNaN(scenarioIrr) && (scenarioVgvDelta !== 0 || scenarioCostDelta !== 0) && (
                                <p className={`text-center text-xs font-bold mt-2 ${scenarioIrr < baseIrr ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {scenarioIrr < baseIrr ? '' : '+'}{(scenarioIrr - baseIrr).toFixed(2)}% vs Base
                                </p>
                            )}
                        </div>

                        <div className="flex justify-center">
                            <button
                                onClick={() => { setScenarioVgvDelta(0); setScenarioCostDelta(0); }}
                                className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors underline"
                            >
                                Restaurar Base
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* QUALITATIVE RISK MATRIX / SWATCH */}
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm mt-6">
                <div className="mb-6">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <ShieldAlert className="w-6 h-6 text-amber-500" />
                        Mapa de Riscos Qualitativos
                    </h3>
                    <p className="text-slate-500 text-sm font-medium">
                        Registre impedimentos regulatórios, ambientais ou contenciosos que a matemática pura não captura.
                    </p>
                </div>

                <div className="relative">
                    <textarea
                        value={riskNotes}
                        onChange={(e) => setRiskNotes(e.target.value)}
                        onBlur={handleSaveRisks}
                        placeholder="Ex: Terreno com passivo ambiental leve, aguardando laudo da CETESB. Risco de 3 meses de atraso no Alvará de Aprovação..."
                        className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-50 outline-none text-slate-700 font-medium resize-none transition-all"
                    />
                    {isSaving && (
                        <div className="absolute top-4 right-4">
                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default ImovibSensitivityForm;
