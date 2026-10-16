import React from 'react';
import { BookOpen } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { academyTraineeService } from '../../../services/academyTraineeService';
import { academyKeys } from '../../../lib/queryKeys';
import { STALE } from '../../../lib/queryClient';
import { KpiStrip, PortalCard, PortalEmpty, PortalLoading, Td, Th } from '../../portal/PortalKit';
import { fmtData, SectionTitle, VIGENCIA_LABEL, vigenciaDe } from './traineeKit';

/**
 * Histórico — o registro legal (`employee_trainings`): presencial lançado
 * pelo RH e EAD concluído na Academia, com validade e vencimento.
 */

interface Props {
    mostrarOrganizacao: boolean;
}

const TraineeHistoryTab: React.FC<Props> = ({ mostrarOrganizacao }) => {
    const { data: itens = [], isLoading, error } = useQuery({
        queryKey: academyKeys.traineeHistory(),
        queryFn: () => academyTraineeService.listHistory(),
        staleTime: STALE.normal,
    });

    const vigencias = itens.map(i => vigenciaDe(i.data_validade));
    const validos = vigencias.filter(v => v === 'valido' || v === 'sem-validade').length;
    const vencendo = vigencias.filter(v => v === 'vencendo').length;
    const vencidos = vigencias.filter(v => v === 'vencido').length;

    return (
        <div className="space-y-5">
            <SectionTitle title="Histórico e vencimentos" subtitle="Tudo o que foi registrado para você: treinamentos presenciais e EAD, com validade." />

            <KpiStrip
                data-tour="historico-kpis"
                items={[
                    { label: 'Registros',  value: String(itens.length) },
                    { label: 'Válidos',    value: String(validos) },
                    { label: 'Vencendo',   value: String(vencendo), hint: vencendo ? 'nos próximos 30 dias' : undefined },
                    { label: 'Vencidos',   value: String(vencidos) },
                ]}
            />

            <PortalCard className="overflow-hidden" data-tour="historico-lista">
                {isLoading ? (
                    <PortalLoading label="Carregando o histórico..." />
                ) : error ? (
                    <PortalEmpty icon={<BookOpen className="w-9 h-9" />} title="Não foi possível carregar o histórico" subtitle={(error as Error)?.message} />
                ) : itens.length === 0 ? (
                    <PortalEmpty
                        icon={<BookOpen className="w-9 h-9" />}
                        title="Nenhum treinamento registrado"
                        subtitle="Treinamentos presenciais lançados pela empresa e EAD concluídos aparecem aqui."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-[#ECECEF]">
                                <tr>
                                    <Th>Treinamento</Th>
                                    {mostrarOrganizacao && <Th>Organização</Th>}
                                    <Th>Origem</Th>
                                    <Th>Realizado em</Th>
                                    <Th>Validade</Th>
                                    <Th>Nota</Th>
                                    <Th>Situação</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {itens.map(i => {
                                    const v = VIGENCIA_LABEL[vigenciaDe(i.data_validade)];
                                    return (
                                        <tr key={i.id} className="hover:bg-[#FAFAFB]">
                                            <Td>
                                                <p className="text-[#1F2430]">{i.course_nome}</p>
                                                {i.nr_referencia && <p className="text-xs text-rose-600">{i.nr_referencia}</p>}
                                            </Td>
                                            {mostrarOrganizacao && <Td>{i.org_nome}</Td>}
                                            <Td className={i.origem === 'ACADEMIA' ? 'text-teal-700' : ''}>
                                                {i.origem === 'ACADEMIA' ? 'EAD (Academia)' : 'Presencial'}
                                            </Td>
                                            <Td className="whitespace-nowrap">{fmtData(i.data_realizacao)}</Td>
                                            <Td className="whitespace-nowrap">{i.data_validade ? fmtData(i.data_validade) : 'Sem validade'}</Td>
                                            <Td>{i.nota != null ? <span className={i.aprovado ? 'text-emerald-700' : 'text-rose-700'}>{i.nota}</span> : '—'}</Td>
                                            <Td><span className={v.cor}>{v.label}</span></Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </PortalCard>
        </div>
    );
};

export default TraineeHistoryTab;
