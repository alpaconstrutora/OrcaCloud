import React from 'react';
import { Award, BookOpen, Clock, PlayCircle, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { academyTraineeService } from '../../../services/academyTraineeService';
import { academyKeys } from '../../../lib/queryKeys';
import { STALE } from '../../../lib/queryClient';
import { KpiStrip, PortalCard, PortalEmpty, PortalLoading } from '../../portal/PortalKit';
import { accentBtn, fmtData, hojeIso, Progresso, SectionTitle } from './traineeKit';
import type { AcademyTraineeEnrollment } from '../../../types/academy';
import { useVerComo } from './verComo';

/**
 * Meus treinamentos — as matrículas do treinando, em cartões.
 *
 * Mesmo desenho de "Meus Treinamentos" no app (academy/meus/MeusTreinamentosCursos): o volume
 * por pessoa é pequeno e o que importa é "continuar de onde parei".
 */

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
    NAO_INICIADO:         { label: 'Não iniciado',         cor: 'text-gray-600' },
    EM_ANDAMENTO:         { label: 'Em andamento',         cor: 'text-teal-700' },
    AGUARDANDO_AVALIACAO: { label: 'Aguardando avaliação', cor: 'text-amber-700' },
    REPROVADO:            { label: 'Reprovado',            cor: 'text-rose-700' },
    CONCLUIDO:            { label: 'Concluído',            cor: 'text-emerald-700' },
    EXPIRADO:             { label: 'Prazo vencido',        cor: 'text-rose-700' },
};

interface Props {
    /** mais de uma organização convidou: mostrar de qual é cada treinamento */
    mostrarOrganizacao: boolean;
    onAbrir: (m: AcademyTraineeEnrollment) => void;
}

const TraineeEnrollmentsTab: React.FC<Props> = ({ mostrarOrganizacao, onAbrir }) => {
    const verComo = useVerComo();
    const { data: matriculas = [], isLoading, error } = useQuery({
        queryKey: academyKeys.traineeEnrollments(verComo),
        queryFn: () => academyTraineeService.listEnrollments(verComo),
        staleTime: STALE.fast,
    });

    const hoje = hojeIso();
    const pendentes = matriculas.filter(m => m.status !== 'CONCLUIDO');
    const concluidos = matriculas.filter(m => m.status === 'CONCLUIDO');
    const atrasados = pendentes.filter(m => m.status === 'EXPIRADO' || (!!m.data_limite && m.data_limite < hoje));

    return (
        <div className="space-y-5">
            <SectionTitle title="Meus treinamentos" subtitle="Treinamentos atribuídos a você, com progresso, prazo e certificados." />

            <KpiStrip
                data-tour="treinamentos-kpis"
                items={[
                    { label: 'Pendentes',  value: String(pendentes.length) },
                    { label: 'Em atraso',  value: String(atrasados.length), hint: atrasados.length ? 'prazo vencido' : undefined },
                    { label: 'Concluídos', value: String(concluidos.length) },
                    { label: 'Total',      value: String(matriculas.length) },
                ]}
            />

            {isLoading ? (
                <PortalCard><PortalLoading label="Carregando seus treinamentos..." /></PortalCard>
            ) : error ? (
                <PortalCard>
                    <PortalEmpty
                        icon={<BookOpen className="w-9 h-9" />}
                        title="Não foi possível carregar seus treinamentos"
                        subtitle={(error as Error)?.message || 'Tente novamente em instantes.'}
                    />
                </PortalCard>
            ) : matriculas.length === 0 ? (
                <PortalCard>
                    <PortalEmpty
                        icon={<BookOpen className="w-9 h-9" />}
                        title="Nenhum treinamento atribuído a você"
                        subtitle="Quando a empresa atribuir um treinamento, ele aparece aqui. Veja também o Catálogo: alguns treinamentos aceitam inscrição."
                    />
                </PortalCard>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-tour="treinamentos-lista">
                    {matriculas.map(m => {
                        const st = STATUS_LABEL[m.status] ?? { label: m.status, cor: 'text-gray-600' };
                        const concluido = m.status === 'CONCLUIDO';
                        const atrasado = !concluido && (m.status === 'EXPIRADO' || (!!m.data_limite && m.data_limite < hoje));
                        return (
                            <PortalCard key={m.id} className="p-4 flex flex-col gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1 text-xs">
                                        {m.nr_referencia && <span className="font-medium text-rose-600">{m.nr_referencia}</span>}
                                        {m.origem === 'RECICLAGEM' && <span className="font-medium text-amber-700">reciclagem</span>}
                                        {m.origem === 'INSCRICAO' && <span className="font-medium text-teal-700">inscrição</span>}
                                    </div>
                                    <h3 className="text-sm font-bold text-[#1F2430] truncate">{m.curso}</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        v{m.versao ?? 1}
                                        {m.carga_horaria ? ` · ${m.carga_horaria}h` : ''}
                                        {m.data_limite ? ` · prazo ${fmtData(m.data_limite)}` : ''}
                                        {mostrarOrganizacao ? ` · ${m.org_nome}` : ''}
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className={atrasado ? 'text-rose-700' : st.cor}>
                                            {atrasado && m.status !== 'EXPIRADO' ? 'Em atraso' : st.label}
                                        </span>
                                        <span className="text-gray-500">{Math.round(m.percentual)}%</span>
                                    </div>
                                    <Progresso pct={m.percentual} concluido={concluido} />
                                </div>

                                <button type="button" onClick={() => onAbrir(m)} className={accentBtn}>
                                    {concluido ? <Award className="w-[15px] h-[15px]" />
                                        : m.status === 'NAO_INICIADO' ? <PlayCircle className="w-[15px] h-[15px]" />
                                        : atrasado ? <RefreshCw className="w-[15px] h-[15px]" />
                                        : <Clock className="w-[15px] h-[15px]" />}
                                    {concluido ? 'Rever treinamento' : m.status === 'NAO_INICIADO' ? 'Começar' : 'Continuar'}
                                </button>
                            </PortalCard>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TraineeEnrollmentsTab;
