// components/planta_ai/PlantaUnidadesTab.tsx
//
// "Unidades" do estudo de Arquitetura (Planta IA) na mesma casca <TorreCard> do Empreendimento
// e da Viabilidade. Aqui o paralelo é: o CENÁRIO é a torre, e as unidades MATERIALIZADAS
// (plant_units, geradas pelo motor) são as unidades. Diferente dos outros dois módulos, aqui é
// read-only — o Planta gera a geometria, não se digita unidade a unidade. Consistência de
// casca; o conteúdo respeita o propósito (gerar) de cada módulo.
import React from 'react';
import { Loader2, Layers, Ruler, CheckCircle2 } from 'lucide-react';
import { PlantScenario, PlantUnit } from '../../types/plantaAi';
import { plantaAiMaterializeService } from '../../services/plantaAiMaterializeService';
import { TorreCard, TorreEmpty } from '../torres/TorreCard';

interface Props {
    scenarios: PlantScenario[];
    selectedScenarioId?: string | null;
}

const fmt = (v?: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));

const PlantaUnidadesTab: React.FC<Props> = ({ scenarios, selectedScenarioId }) => {
    const [expandedId, setExpandedId] = React.useState<string | null>(selectedScenarioId ?? null);
    const [unitsByScenario, setUnitsByScenario] = React.useState<Record<string, (PlantUnit & { _floor_number: number })[]>>({});
    const [loadingId, setLoadingId] = React.useState<string | null>(null);

    // Carrega as unidades de um cenário só quando ele é aberto (evita N queries no mount).
    const ensureUnits = React.useCallback(async (scenarioId: string) => {
        if (unitsByScenario[scenarioId]) return;
        setLoadingId(scenarioId);
        try {
            const units = await plantaAiMaterializeService.listUnitsForScenario(scenarioId);
            setUnitsByScenario(prev => ({ ...prev, [scenarioId]: units }));
        } catch (err) {
            console.error('[PlantaUnidadesTab] erro ao carregar unidades:', err);
            setUnitsByScenario(prev => ({ ...prev, [scenarioId]: [] }));
        } finally {
            setLoadingId(null);
        }
    }, [unitsByScenario]);

    React.useEffect(() => {
        if (expandedId) ensureUnits(expandedId);
    }, [expandedId, ensureUnits]);

    const toggle = (id: string) => {
        const next = expandedId === id ? null : id;
        setExpandedId(next);
        if (next) ensureUnits(next);
    };

    if (scenarios.length === 0) {
        return <TorreEmpty icon={Layers} text="Nenhum cenário gerado. Gere cenários na aba Cenários para ver as unidades." />;
    }

    return (
        <div className="space-y-2.5">
            {scenarios.map(sc => {
                const isOpen = expandedId === sc.id;
                const isSelected = sc.id === selectedScenarioId;
                const units = unitsByScenario[sc.id] ?? [];
                const isLoading = loadingId === sc.id && !unitsByScenario[sc.id];

                const subtitle = (
                    <>
                        {sc.floors_count ? `${sc.floors_count} pav.` : 'sem pavimentos'}
                        {sc.units_per_floor ? ` · ${sc.units_per_floor} un/pav` : ''}
                        {sc.total_units ? <> · <span className="text-gray-500">{sc.total_units} unid.</span></> : ''}
                        {sc.total_private_area ? <> · <span className="text-violet-500">{fmt(sc.total_private_area)} m² priv.</span></> : ''}
                    </>
                );

                const badge = isSelected ? (
                    <span className="text-xs font-semibold px-2.5 h-9 inline-flex items-center rounded-[6px] bg-emerald-50 text-emerald-600 gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Escolhido
                    </span>
                ) : (
                    <span className="text-xs font-medium text-gray-400 px-2.5">{sc.scenario_type}</span>
                );

                return (
                    <TorreCard
                        key={sc.id}
                        icon={Layers}
                        tint="violet"
                        title={sc.name}
                        subtitle={subtitle}
                        actions={badge}
                        expandable
                        isOpen={isOpen}
                        onToggle={() => toggle(sc.id)}
                    >
                        {isLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-violet-600" /></div>
                        ) : units.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-gray-400 font-medium flex flex-col items-center gap-2">
                                <Ruler className="w-6 h-6 text-gray-300" />
                                Cenário ainda não materializado. Abra a aba Plantas e materialize as unidades.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-2">Unidade</th>
                                            <th className="px-4 py-2 w-24 text-center">Pavimento</th>
                                            <th className="px-4 py-2">Tipo</th>
                                            <th className="px-4 py-2 w-24 text-center">Dorm.</th>
                                            <th className="px-4 py-2 w-24 text-center">Banh.</th>
                                            <th className="px-4 py-2 w-24 text-center">Vagas</th>
                                            <th className="px-4 py-2 w-32 text-right">Área priv. (m²)</th>
                                            <th className="px-4 py-2 w-32 text-right">Área total (m²)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {units.map(u => (
                                            <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-2.5 text-sm font-normal text-gray-700">{u.unit_code ?? '—'}</td>
                                                <td className="px-4 py-2.5 text-sm font-normal text-gray-600 text-center">{u._floor_number}</td>
                                                <td className="px-4 py-2.5 text-sm font-normal text-gray-700">{u.unit_type ?? '—'}</td>
                                                <td className="px-4 py-2.5 text-sm font-normal text-gray-600 text-center">{u.bedrooms ?? '—'}</td>
                                                <td className="px-4 py-2.5 text-sm font-normal text-gray-600 text-center">{u.bathrooms ?? '—'}</td>
                                                <td className="px-4 py-2.5 text-sm font-normal text-gray-600 text-center">{u.parking_spaces ?? '—'}</td>
                                                <td className="px-4 py-2.5 text-sm font-medium text-gray-800 text-right">{fmt(u.private_area)}</td>
                                                <td className="px-4 py-2.5 text-sm font-medium text-violet-700 text-right">{fmt(u.gross_area)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </TorreCard>
                );
            })}
        </div>
    );
};

export default PlantaUnidadesTab;
