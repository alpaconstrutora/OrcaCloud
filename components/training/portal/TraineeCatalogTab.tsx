import React, { useState } from 'react';
import { BookOpen, CheckCircle2, Loader2, Search, UserPlus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academyTraineeService } from '../../../services/academyTraineeService';
import { academyKeys } from '../../../lib/queryKeys';
import { STALE } from '../../../lib/queryClient';
import { PortalCard, PortalEmpty, PortalLoading } from '../../portal/PortalKit';
import { avisarAcaoDoPortal } from '../../../utils/portalEventos';
import { usePersistedState } from '../../ui/TableUtils';
import { accentBtn, SectionTitle, softBtn } from './traineeKit';
import type { AcademyTraineeCatalogItem } from '../../../types/academy';

/**
 * Catálogo — treinamentos que a empresa abriu para inscrição
 * (`training_courses.inscricao_aberta`, com versão publicada).
 *
 * "Inscrever-se" cria a matrícula (origem INSCRICAO) e leva a pessoa para
 * Meus treinamentos — é lá que ela assiste.
 */

const CATEGORIA_LABEL: Record<string, string> = {
    NR_OBRIGATORIA: 'NR obrigatória', INTEGRACAO: 'Integração', DDS: 'DDS',
    QUALIDADE: 'Qualidade', LIDERANCA: 'Liderança', TECNICO: 'Técnico', OUTROS: 'Outros',
};

interface Props {
    mostrarOrganizacao: boolean;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
    onInscrito: (enrollmentId: string) => void;
    /** celular: busca abaixo do título, na largura toda */
    compacto?: boolean;
}

const TraineeCatalogTab: React.FC<Props> = ({ mostrarOrganizacao, notify, onInscrito, compacto = false }) => {
    const qc = useQueryClient();
    const [busca, setBusca] = usePersistedState('traineePortal:catalogo:busca', '');
    const [inscrevendo, setInscrevendo] = useState<string | null>(null);

    const { data: cursos = [], isLoading, error } = useQuery({
        queryKey: academyKeys.traineeCatalog(),
        queryFn: () => academyTraineeService.listCatalog(),
        staleTime: STALE.normal,
    });

    const inscrever = useMutation({
        mutationFn: (c: AcademyTraineeCatalogItem) => academyTraineeService.enroll(c.id),
        onMutate: c => setInscrevendo(c.id),
        onSuccess: (res, c) => {
            // §22: atualiza o cache em vez de recarregar o catálogo inteiro.
            qc.setQueryData<AcademyTraineeCatalogItem[]>(academyKeys.traineeCatalog(), prev =>
                (prev ?? []).map(x => x.id === c.id
                    ? { ...x, ja_matriculado: true, enrollment_id: res.enrollment_id, enrollment_status: x.enrollment_status ?? 'NAO_INICIADO' }
                    : x));
            qc.invalidateQueries({ queryKey: academyKeys.traineeEnrollments() });
            avisarAcaoDoPortal('inscreveu-treinamento');
            notify(res.ja_existia ? 'Você já estava inscrito neste treinamento.' : 'Inscrição feita. O treinamento já está em Meus treinamentos.');
            onInscrito(res.enrollment_id);
        },
        onError: (e: Error) => notify(e.message || 'Não foi possível fazer a inscrição.', 'error'),
        onSettled: () => setInscrevendo(null),
    });

    const termo = busca.trim().toLowerCase();
    const filtrados = !termo ? cursos : cursos.filter(c =>
        c.nome.toLowerCase().includes(termo) ||
        (c.nr_referencia || '').toLowerCase().includes(termo) ||
        (c.descricao || '').toLowerCase().includes(termo));

    const campoBusca = (
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar treinamento ou NR..."
                className={`h-9 ${compacto ? 'w-full' : 'w-56'} pl-9 pr-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all`}
            />
        </div>
    );

    return (
        <div className="space-y-5">
            <SectionTitle
                title="Catálogo"
                subtitle="Treinamentos abertos para inscrição. Ao se inscrever, ele passa a aparecer em Meus treinamentos."
                right={compacto ? undefined : campoBusca}
            />
            {compacto && campoBusca}

            {isLoading ? (
                <PortalCard><PortalLoading label="Carregando o catálogo..." /></PortalCard>
            ) : error ? (
                <PortalCard><PortalEmpty icon={<BookOpen className="w-9 h-9" />} title="Não foi possível carregar o catálogo" subtitle={(error as Error)?.message} /></PortalCard>
            ) : filtrados.length === 0 ? (
                <PortalCard>
                    <PortalEmpty
                        icon={<BookOpen className="w-9 h-9" />}
                        title={termo ? 'Nenhum treinamento encontrado' : 'Nenhum treinamento aberto para inscrição'}
                        subtitle={termo ? 'Tente outro termo.' : 'A empresa decide quais treinamentos aceitam inscrição. Os atribuídos a você já estão em Meus treinamentos.'}
                    />
                </PortalCard>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-tour="catalogo-lista">
                    {filtrados.map(c => {
                        const ocupado = inscrevendo === c.id;
                        return (
                            <PortalCard key={c.id} className="p-4 flex flex-col gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1 text-xs">
                                        {c.nr_referencia && <span className="font-medium text-rose-600">{c.nr_referencia}</span>}
                                        <span className="text-gray-400">{CATEGORIA_LABEL[c.categoria ?? ''] ?? c.categoria}</span>
                                    </div>
                                    <h3 className="text-sm font-bold text-[#1F2430]">{c.nome}</h3>
                                    {c.descricao && <p className="text-xs text-gray-500 mt-1 line-clamp-3">{c.descricao}</p>}
                                    <p className="text-xs text-gray-400 mt-2">
                                        v{c.versao}
                                        {c.carga_horaria ? ` · ${c.carga_horaria}h` : ''}
                                        {c.validade_meses ? ` · válido por ${c.validade_meses} meses` : ''}
                                        {c.inscricao_prazo_dias ? ` · ${c.inscricao_prazo_dias} dias para concluir` : ''}
                                        {mostrarOrganizacao ? ` · ${c.org_nome}` : ''}
                                    </p>
                                </div>

                                {c.ja_matriculado ? (
                                    <button
                                        type="button"
                                        onClick={() => c.enrollment_id && onInscrito(c.enrollment_id)}
                                        className={softBtn}
                                        title="Você já está inscrito — abrir em Meus treinamentos"
                                    >
                                        <CheckCircle2 className="w-[15px] h-[15px]" />
                                        {c.enrollment_status === 'CONCLUIDO' ? 'Concluído' : 'Já inscrito'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => inscrever.mutate(c)}
                                        disabled={ocupado}
                                        className={accentBtn}
                                    >
                                        {ocupado ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <UserPlus className="w-[15px] h-[15px]" />}
                                        {ocupado ? 'Inscrevendo...' : 'Inscrever-se'}
                                    </button>
                                )}
                            </PortalCard>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TraineeCatalogTab;
