// components/torres/EstudoTorresUnidades.tsx
//
// Mostra os torres e unidades DO EMPREENDIMENTO dentro dos módulos de estudo (Viabilidade e
// Planta IA). Não é cópia nem sincronização: é o MESMO TowerEditor, sobre as MESMAS tabelas
// (empreendimento_towers/empreendimento_units). Editar aqui é editar lá — o empreendimento é
// o centro da verdade, e os estudos são janelas para ele. Por isso não há "sincronizar":
// mudou num lugar, mudou em todos.
//
// O vínculo é reverso: o empreendimento referencia o estudo (empreendimentos.imovib_study_id /
// planta_ai_study_id), então aqui procuramos o empreendimento que aponta para este estudo.
import React from 'react';
import { Link2Off, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import TowerEditor from '../empreendimento/TowerEditor';

interface Props {
    studyId: string;
    origin: 'imovib' | 'planta_ai';
}

const COLUMN = { imovib: 'imovib_study_id', planta_ai: 'planta_ai_study_id' } as const;

export const EstudoTorresUnidades: React.FC<Props> = ({ studyId, origin }) => {
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
        return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
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
                    Torres e unidades vivem no empreendimento — ele é a fonte única. Vincule este estudo a um
                    empreendimento (no cadastro do empreendimento) para vê-las e editá-las aqui.
                </p>
            </div>
        );
    }

    return <TowerEditor empreendimentoId={emp.id} organizationId={emp.organization_id} />;
};

export default EstudoTorresUnidades;
