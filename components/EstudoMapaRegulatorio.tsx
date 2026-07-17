// components/EstudoMapaRegulatorio.tsx
//
// Mostra o Mapa Regulatório DO EMPREENDIMENTO dentro dos módulos de estudo (Viabilidade e
// Planta). O regulatório mora no empreendimento (empreendimento_regulatory_zones, fonte única);
// aqui achamos o empreendimento que referencia este estudo e renderizamos o mesmo editor.
// Editar aqui é editar lá. Sem empreendimento vinculado, não há mapa (é onde ele mora).
import React from 'react';
import { Link2Off, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import MapaRegulatorioEditor from './MapaRegulatorioEditor';

interface Props {
    studyId: string;
    origin: 'imovib' | 'planta_ai';
}

const COLUMN = { imovib: 'imovib_study_id', planta_ai: 'planta_ai_study_id' } as const;

export const EstudoMapaRegulatorio: React.FC<Props> = ({ studyId, origin }) => {
    const [emp, setEmp] = React.useState<{ id: string; organization_id: string } | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            const { data, error } = await supabase
                .from('empreendimentos')
                .select('id, organization_id')
                .eq(COLUMN[origin], studyId)
                .maybeSingle();
            if (cancelled) return;
            if (error) setError(error.message);
            else setEmp(data ?? null);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [studyId, origin]);

    if (loading) {
        return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
    }

    if (error) {
        return <div className="text-sm text-rose-600 font-medium py-6">Erro ao carregar o empreendimento vinculado: {error}</div>;
    }

    if (!emp) {
        return (
            <div className="text-center py-16 text-gray-400">
                <Link2Off className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-500">Nenhum empreendimento vinculado a este estudo.</p>
                <p className="text-xs mt-1 max-w-md mx-auto leading-relaxed">
                    O mapa regulatório mora no empreendimento — ele é a fonte única. Vincule este estudo a um
                    empreendimento para vê-lo e editá-lo aqui.
                </p>
            </div>
        );
    }

    return <MapaRegulatorioEditor empreendimentoId={emp.id} organizationId={emp.organization_id} />;
};

export default EstudoMapaRegulatorio;
