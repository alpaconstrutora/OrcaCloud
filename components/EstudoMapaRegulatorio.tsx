// components/EstudoMapaRegulatorio.tsx
//
// Mostra o MESMO Mapa Regulatório em todos os módulos, igual ao que foi feito com torres e
// unidades. Os dados regulatórios vivem no estudo de Viabilidade (imovib_regulatory_zones) —
// o empreendimento e a viabilidade já compartilham essa tela. Aqui estendemos para a Planta:
// resolvemos o estudo Imovib pelo empreendimento vinculado e renderizamos o mesmíssimo
// ImovibRegulatoryMapTab. Editar aqui é editar lá — fonte única, sem cópia.
//
// (A Planta continua com sua aba "Regras" própria — plant_urban_rulesets, que alimenta o motor
// de geração. Isso é outra coisa; este é o mapa regulatório compartilhado.)
import React from 'react';
import { Link2Off, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ImovibRegulatoryMapTab from './ImovibRegulatoryMapTab';

interface Props {
    /** Id do estudo da aba onde este componente é renderizado. */
    studyId: string;
    /** 'imovib': studyId já É o estudo de viabilidade. 'planta_ai': resolver via empreendimento. */
    origin: 'imovib' | 'planta_ai';
}

export const EstudoMapaRegulatorio: React.FC<Props> = ({ studyId, origin }) => {
    const [imovibStudyId, setImovibStudyId] = React.useState<string | null>(origin === 'imovib' ? studyId : null);
    const [loading, setLoading] = React.useState(origin === 'planta_ai');
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (origin === 'imovib') { setImovibStudyId(studyId); setLoading(false); return; }
        // Planta: o mapa regulatório vem do estudo de viabilidade do empreendimento vinculado
        // (empreendimentos.planta_ai_study_id → imovib_study_id).
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            const { data, error } = await supabase
                .from('empreendimentos')
                .select('imovib_study_id')
                .eq('planta_ai_study_id', studyId)
                .maybeSingle();
            if (cancelled) return;
            if (error) setError(error.message);
            else setImovibStudyId((data?.imovib_study_id as string | null) ?? null);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [studyId, origin]);

    if (loading) {
        return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
    }

    if (error) {
        return <div className="text-sm text-rose-600 font-medium py-6">Erro ao resolver o mapa regulatório: {error}</div>;
    }

    if (!imovibStudyId) {
        return (
            <div className="text-center py-16 text-gray-400">
                <Link2Off className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-500">Sem mapa regulatório para mostrar.</p>
                <p className="text-xs mt-1 max-w-md mx-auto leading-relaxed">
                    O mapa regulatório vive no estudo de viabilidade. Vincule uma viabilidade ao empreendimento
                    deste estudo para vê-lo e editá-lo aqui.
                </p>
            </div>
        );
    }

    return <ImovibRegulatoryMapTab studyId={imovibStudyId} />;
};

export default EstudoMapaRegulatorio;
