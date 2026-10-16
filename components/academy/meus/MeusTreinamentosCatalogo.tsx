import React, { useState } from 'react';
import { BookOpen, CheckCircle2, Library, Loader2, Search, UserPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { KpiCard } from '../../ui/KpiCard';
import { usePersistedState } from '../../ui/TableUtils';
import { useToast } from '../../../hooks/useToast';
import { academyTraineeService } from '../../../services/academyTraineeService';
import { academyKeys } from '../../../lib/queryKeys';
import type { AcademyTraineeCatalogItem } from '../../../types/academy';

/**
 * "Meus Treinamentos" › Catálogo — treinamentos abertos para inscrição
 * (`training_courses.inscricao_aberta`, com versão publicada). O mesmo
 * catálogo que o terceirizado vê no Portal de Treinamentos.
 */

const CATEGORIA_LABEL: Record<string, string> = {
    NR_OBRIGATORIA: 'NR obrigatória', INTEGRACAO: 'Integração', DDS: 'DDS',
    QUALIDADE: 'Qualidade', LIDERANCA: 'Liderança', TECNICO: 'Técnico', OUTROS: 'Outros',
};

interface Props {
    cursos: AcademyTraineeCatalogItem[];
    mostrarOrganizacao: boolean;
    onAbrirMatricula: (enrollmentId: string) => void;
}

const MeusTreinamentosCatalogo: React.FC<Props> = ({ cursos, mostrarOrganizacao, onAbrirMatricula }) => {
    const qc = useQueryClient();
    const { showToast } = useToast();
    const [busca, setBusca] = usePersistedState('meusTreinamentos:catalogo:busca', '');
    const [inscrevendo, setInscrevendo] = useState<string | null>(null);

    const inscrever = async (c: AcademyTraineeCatalogItem) => {
        setInscrevendo(c.id);
        try {
            const res = await academyTraineeService.enroll(c.id);
            // §22: mexe no cache em vez de recarregar o catálogo inteiro.
            qc.setQueryData<AcademyTraineeCatalogItem[]>(academyKeys.traineeCatalog(), prev =>
                (prev ?? []).map(x => x.id === c.id
                    ? { ...x, ja_matriculado: true, enrollment_id: res.enrollment_id, enrollment_status: x.enrollment_status ?? 'NAO_INICIADO' }
                    : x));
            qc.invalidateQueries({ queryKey: academyKeys.traineeEnrollments() });
            showToast(res.ja_existia ? 'Você já estava inscrito neste treinamento.' : 'Inscrição feita. O treinamento já está em Meus treinamentos.');
        } catch (e: any) {
            showToast(e?.message || 'Não foi possível fazer a inscrição.', 'error');
        } finally {
            setInscrevendo(null);
        }
    };

    const termo = busca.trim().toLowerCase();
    const filtrados = !termo ? cursos : cursos.filter(c =>
        c.nome.toLowerCase().includes(termo) ||
        (c.nr_referencia || '').toLowerCase().includes(termo) ||
        (c.descricao || '').toLowerCase().includes(termo));
    const inscritos = cursos.filter(c => c.ja_matriculado).length;

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Abertos para inscrição" value={`${cursos.length}`} icon={<Library className="w-4 h-4" />} color="blue" />
                <KpiCard label="Já inscrito" value={`${inscritos}`} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
            </div>

            {/* Toolbar acoplada (§5.2): busca + grade de cartões no mesmo card. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Buscar treinamento ou NR..."
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>

                {filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {termo ? 'Nenhum treinamento encontrado' : 'Nenhum treinamento aberto para inscrição'}
                        </h3>
                        <p className="text-sm text-gray-500">
                            {termo ? 'Tente outro termo.' : 'Quem gerencia os treinamentos decide quais aceitam inscrição. Os atribuídos a você já estão em Meus treinamentos.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
                        {filtrados.map(c => {
                            const ocupado = inscrevendo === c.id;
                            return (
                                <div key={c.id} className="rounded-[10px] border border-gray-100 p-4 flex flex-col gap-3 hover:border-blue-100 transition-all">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1 text-xs font-medium">
                                            {c.nr_referencia && <span className="text-rose-600">{c.nr_referencia}</span>}
                                            <span className="text-gray-400">{CATEGORIA_LABEL[c.categoria ?? ''] ?? c.categoria}</span>
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900">{c.nome}</h3>
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
                                            onClick={() => c.enrollment_id && onAbrirMatricula(c.enrollment_id)}
                                            title="Você já está inscrito — abrir o treinamento"
                                            className="flex items-center justify-center gap-1.5 h-9 px-3.5 bg-white text-emerald-700 border border-emerald-200 rounded-[6px] hover:bg-emerald-50 transition-all font-medium text-[13px]"
                                        >
                                            <CheckCircle2 className="w-[15px] h-[15px]" />
                                            {c.enrollment_status === 'CONCLUIDO' ? 'Concluído' : 'Já inscrito — abrir'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => inscrever(c)}
                                            disabled={ocupado}
                                            title={ocupado ? 'Fazendo a inscrição...' : undefined}
                                            className="flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                                        >
                                            {ocupado ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <UserPlus className="w-[15px] h-[15px]" />}
                                            {ocupado ? 'Inscrevendo...' : 'Inscrever-se'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
};

export default MeusTreinamentosCatalogo;
