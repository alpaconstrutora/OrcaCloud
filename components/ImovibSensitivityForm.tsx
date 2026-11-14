import React, { useEffect, useState } from 'react';
import { Activity, ShieldAlert } from 'lucide-react';
import { ImovibStudy, ImovibScenario } from '../types';
import { useImovibMath, ImovibAba, ImovibSubAbaDePremissas } from '../hooks/useImovibMath';
import ImovibAvisosBanner from './ImovibAvisosBanner';
import { imovibService } from '../services/imovibService';
import { useToast } from '../hooks/useToast';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { CHOQUES_PADRAO } from '../utils/imovibSensibilidade';
import type { VariavelDoEstudo } from '../utils/imovibVariacoes';
import ImovibTornadoCard from './ImovibTornadoCard';
import ImovibGradeCruzadaCard from './ImovibGradeCruzadaCard';
import ImovibEstresseCard from './ImovibEstresseCard';
import ImovibCenariosCard from './ImovibCenariosCard';
import ImovibMonteCarloCard from './ImovibMonteCarloCard';
import ImovibRiscosCard from './ImovibRiscosCard';

interface ImovibSensitivityFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
    /** Abre a aba que corrige a premissa de um aviso do motor. */
    onIrPara?: (aba: ImovibAba, subAba?: ImovibSubAbaDePremissas) => void;
}

/**
 * Aba Sensibilidade e Risco (Fase 3 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): tornado, grade
 * cruzada, teste de estresse, cenários salvos, Monte Carlo e matriz de riscos.
 * Os choques do tornado são hipóteses desta tela, compartilhadas com a grade e a
 * simulação; cenários e riscos são gravados no estudo.
 */
const ImovibSensitivityForm: React.FC<ImovibSensitivityFormProps> = ({ study, onDataChanged, onIrPara }) => {
    const baseMath = useImovibMath(study);
    const [choques, setChoques] = useState<Record<VariavelDoEstudo, number>>({ ...CHOQUES_PADRAO });

    const [cenarios, setCenarios] = useState<ImovibScenario[]>([]);
    const [carregandoCenarios, setCarregandoCenarios] = useState(true);
    const [erroCenarios, setErroCenarios] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        setCarregandoCenarios(true);
        imovibService.listarCenarios(study.id)
            .then(c => { if (vivo) { setCenarios(c); setErroCenarios(null); } })
            .catch(e => { if (vivo) setErroCenarios((e as Error).message); })
            .finally(() => { if (vivo) setCarregandoCenarios(false); });
        return () => { vivo = false; };
    }, [study.id]);

    // Notas livres de risco (antes, o "Mapa de Riscos Qualitativos"), em swot_analysis.risks.
    const [riskNotes, setRiskNotes] = useState((study.swot_analysis?.risks as string) || '');
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const { pode, motivo } = useImovibEdicao();

    const handleSaveRisks = async () => {
        if (riskNotes === ((study.swot_analysis?.risks as string) || '')) return;
        try {
            setIsSaving(true);
            const currentSwot = study.swot_analysis || {};
            await imovibService.updateStudy(study.id, {
                swot_analysis: { ...currentSwot, risks: riskNotes }
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
            showToast(`Erro ao salvar as notas de risco: ${(e as Error).message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <ImovibAvisosBanner avisos={baseMath.avisos} onIrPara={onIrPara} />

            <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-rose-500" />
                    Sensibilidade e risco
                </h2>
                <p className="text-slate-500 text-sm mt-1 max-w-3xl">
                    Quanto o resultado depende de cada premissa, o que acontece quando várias pioram juntas e o que o número não captura.
                </p>
            </div>

            <ImovibTornadoCard study={study} choques={choques} onChoques={setChoques} />
            <ImovibGradeCruzadaCard study={study} choques={choques} />
            <ImovibEstresseCard study={study} />
            <ImovibCenariosCard study={study} cenarios={cenarios} carregando={carregandoCenarios} erro={erroCenarios} onCenarios={setCenarios} />
            <ImovibMonteCarloCard study={study} cenarios={cenarios} choques={choques} />
            <ImovibRiscosCard study={study} />

            <div className="bg-white rounded-[10px] p-4 border border-gray-100 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1">
                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                    Notas gerais de risco
                </h3>
                <p className="text-xs text-gray-500 mb-3">Texto livre, gravado ao sair do campo.</p>
                <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 relative">
                    <textarea
                        value={riskNotes}
                        onChange={(e) => setRiskNotes(e.target.value)}
                        onBlur={handleSaveRisks}
                        aria-label="Notas gerais de risco"
                        placeholder="Ex: Terreno com passivo ambiental leve, aguardando laudo da CETESB. Risco de 3 meses de atraso no Alvará de Aprovação..."
                        className="w-full h-28 px-3 py-2 bg-white border border-slate-200 rounded-[6px] focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-sm text-slate-700 resize-none transition-all"
                    />
                    {isSaving && (
                        <div className="absolute top-3 right-3">
                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></div>
                        </div>
                    )}
                </fieldset>
            </div>
        </div>
    );
};

export default ImovibSensitivityForm;
