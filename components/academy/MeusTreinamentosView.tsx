import React, { useMemo, useState } from 'react';
import AcademyClassroomTab from './AcademyClassroomTab';
import AcademyPlayerView from './AcademyPlayerView';
import { createAppChannel } from './academyChannel';
import type { AcademyEnrollment } from '../../types/academy';

/**
 * Meus Treinamentos — área PESSOAL do colaborador logado.
 *
 * Fica fora do módulo Recursos Humanos de propósito. RH › Treinamentos é
 * gestão (catálogo, atribuições, painéis) e está atrás de `canViewLabor`;
 * quem precisa FAZER treinamento normalmente não tem essa permissão. Por isso
 * esta view segue o padrão de "Minhas Tarefas" e "Notificações": item pessoal
 * na sidebar, sem guarda de módulo.
 *
 * Quem não tem login no ÒPURA (a maior parte da mão de obra) chega ao mesmo
 * conteúdo pelo Portal do Colaborador — mesmo player, canal diferente.
 */

interface Props {
    orgId?: string | null;
}

const MeusTreinamentosView: React.FC<Props> = ({ orgId }) => {
    const [aulaAberta, setAulaAberta] = useState<AcademyEnrollment | null>(null);
    const channel = useMemo(() => createAppChannel(), []);

    // TELA: assistir troca o conteúdo in-flow (seta de voltar + <h1>, sem
    // overlay). Vídeo em painel lateral seria inutilizável.
    if (aulaAberta) {
        return (
            <AcademyPlayerView
                enrollmentId={aulaAberta.id}
                titulo={aulaAberta.course_nome || 'Treinamento'}
                subtitulo={aulaAberta.nr_referencia}
                channel={channel}
                onVoltar={() => setAulaAberta(null)}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Meus treinamentos</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    Treinamentos atribuídos a você, com progresso, prazo e certificados.
                </p>
            </div>

            <AcademyClassroomTab orgId={orgId} onAbrir={setAulaAberta} />
        </div>
    );
};

export default MeusTreinamentosView;
