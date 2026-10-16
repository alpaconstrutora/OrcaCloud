import React from 'react';
import { Award, BookOpen, Clock, PlayCircle, RefreshCw } from 'lucide-react';
import { KpiCard } from '../../ui/KpiCard';
import { fmtData, hojeIso } from '../../training/portal/traineeKit';
import type { AcademyTraineeEnrollment } from '../../../types/academy';

/**
 * "Meus Treinamentos" › Meus treinamentos — cartões das matrículas.
 *
 * Cartões, não tabela: o volume por pessoa é pequeno e o que importa é
 * "continuar de onde parei". Vocabulário do app (§24 do guia: o kit do portal
 * não vale dentro do app).
 */

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
    NAO_INICIADO:         { label: 'Não iniciado',         cor: 'text-gray-600' },
    EM_ANDAMENTO:         { label: 'Em andamento',         cor: 'text-blue-700' },
    AGUARDANDO_AVALIACAO: { label: 'Aguardando avaliação', cor: 'text-amber-700' },
    REPROVADO:            { label: 'Reprovado',            cor: 'text-rose-700' },
    CONCLUIDO:            { label: 'Concluído',            cor: 'text-emerald-700' },
    EXPIRADO:             { label: 'Prazo vencido',        cor: 'text-rose-700' },
};

interface Props {
    matriculas: AcademyTraineeEnrollment[];
    mostrarOrganizacao: boolean;
    onAbrir: (m: AcademyTraineeEnrollment) => void;
}

const MeusTreinamentosCursos: React.FC<Props> = ({ matriculas, mostrarOrganizacao, onAbrir }) => {
    const hoje = hojeIso();
    const pendentes = matriculas.filter(m => m.status !== 'CONCLUIDO');
    const concluidos = matriculas.filter(m => m.status === 'CONCLUIDO');
    const atrasados = pendentes.filter(m => m.status === 'EXPIRADO' || (!!m.data_limite && m.data_limite < hoje));

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Pendentes"  value={`${pendentes.length}`}  icon={<Clock className="w-4 h-4" />}     color="amber" />
                <KpiCard label="Em atraso"  value={`${atrasados.length}`}  icon={<RefreshCw className="w-4 h-4" />} color="rose" />
                <KpiCard label="Concluídos" value={`${concluidos.length}`} icon={<Award className="w-4 h-4" />}     color="emerald" />
                <KpiCard label="Total"      value={`${matriculas.length}`} icon={<BookOpen className="w-4 h-4" />}  color="blue" />
            </div>

            {matriculas.length === 0 ? (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12">
                    <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum treinamento atribuído</h3>
                    <p className="text-sm text-gray-500">
                        Quando a empresa atribuir um treinamento, ele aparece aqui. Veja também o Catálogo: alguns aceitam inscrição.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {matriculas.map(m => {
                        const st = STATUS_LABEL[m.status] ?? { label: m.status, cor: 'text-gray-600' };
                        const concluido = m.status === 'CONCLUIDO';
                        const atrasado = !concluido && (m.status === 'EXPIRADO' || (!!m.data_limite && m.data_limite < hoje));
                        return (
                            <div key={m.id} className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 flex flex-col gap-3 hover:border-blue-100 transition-all">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1 text-xs font-medium">
                                        {m.nr_referencia && <span className="text-rose-600">{m.nr_referencia}</span>}
                                        {m.origem === 'RECICLAGEM' && <span className="text-amber-700">reciclagem</span>}
                                        {m.origem === 'INSCRICAO' && <span className="text-blue-700">inscrição</span>}
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-900 truncate" title={m.curso}>{m.curso}</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        v{m.versao ?? 1}
                                        {m.carga_horaria ? ` · ${m.carga_horaria}h` : ''}
                                        {m.data_limite ? ` · prazo ${fmtData(m.data_limite)}` : ''}
                                        {mostrarOrganizacao ? ` · ${m.org_nome}` : ''}
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-sm font-normal">
                                        <span className={atrasado ? 'text-rose-700' : st.cor}>
                                            {atrasado && m.status !== 'EXPIRADO' ? 'Em atraso' : st.label}
                                        </span>
                                        <span className="text-gray-500">{Math.round(m.percentual)}%</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all ${concluido ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                            style={{ width: `${Math.min(100, m.percentual)}%` }}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => onAbrir(m)}
                                    className="flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95"
                                >
                                    <PlayCircle className="w-[15px] h-[15px]" />
                                    {concluido ? 'Rever treinamento' : m.status === 'NAO_INICIADO' ? 'Começar' : 'Continuar'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
};

export default MeusTreinamentosCursos;
