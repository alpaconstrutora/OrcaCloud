import React, { useEffect, useState } from 'react';
import { Award, BookOpen, Clock, Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import { academyService } from '../../services/academyService';
import type { AcademyEnrollment } from '../../types/academy';

/**
 * Sala de Treinamento — as MINHAS matrículas (colaborador logado).
 *
 * Cartões, não tabela: o volume por pessoa é pequeno e o que importa é
 * "continuar de onde parei", não comparar linhas.
 */

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
    NAO_INICIADO:         { label: 'Não iniciado',         cor: 'text-gray-600' },
    EM_ANDAMENTO:         { label: 'Em andamento',         cor: 'text-blue-700' },
    AGUARDANDO_AVALIACAO: { label: 'Aguardando avaliação', cor: 'text-amber-700' },
    REPROVADO:            { label: 'Reprovado',            cor: 'text-rose-700' },
    CONCLUIDO:            { label: 'Concluído',            cor: 'text-emerald-700' },
    EXPIRADO:             { label: 'Prazo vencido',        cor: 'text-rose-700' },
};

const fmtData = (iso?: string) => {
    if (!iso) return '—';
    // Data pura (YYYY-MM-DD) não pode passar por new Date(): vira o dia
    // anterior no fuso do Brasil.
    const [a, m, d] = iso.split('T')[0].split('-');
    return `${d}/${m}/${a}`;
};

interface Props {
    orgId?: string | null;
    onAbrir: (enrollment: AcademyEnrollment) => void;
}

const AcademyClassroomTab: React.FC<Props> = ({ orgId, onAbrir }) => {
    const [matriculas, setMatriculas] = useState<AcademyEnrollment[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [semVinculo, setSemVinculo] = useState(false);

    useEffect(() => {
        (async () => {
            setCarregando(true);
            try {
                const employeeId = await academyService.getMyEmployeeId(orgId);
                if (!employeeId) { setSemVinculo(true); setMatriculas([]); return; }
                setSemVinculo(false);
                setMatriculas(await academyService.listEnrollments({ orgId, employeeId }));
            } finally {
                setCarregando(false);
            }
        })();
    }, [orgId]);

    const hoje = new Date().toISOString().split('T')[0];
    const pendentes = matriculas.filter(m => m.status !== 'CONCLUIDO');
    const concluidos = matriculas.filter(m => m.status === 'CONCLUIDO');
    const atrasados = pendentes.filter(m => m.status === 'EXPIRADO' || (m.data_limite && m.data_limite < hoje));

    if (carregando) {
        return (
            <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                <p className="mt-2 text-gray-500">Carregando seus treinamentos...</p>
            </div>
        );
    }

    if (semVinculo) {
        return (
            <div className="text-center py-12">
                <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Seu usuário não está vinculado a um colaborador</h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Os treinamentos são atribuídos ao cadastro de colaborador, não ao login.
                    Peça ao RH para abrir sua ficha em Recursos Humanos › Colaboradores e
                    preencher o campo <span className="font-medium text-gray-700">Usuário do sistema</span>.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Pendentes"  value={`${pendentes.length}`} icon={<Clock className="w-5 h-5" />} color="amber" />
                <KpiCard label="Em atraso"  value={`${atrasados.length}`} icon={<RefreshCw className="w-5 h-5" />} color="rose" />
                <KpiCard label="Concluídos" value={`${concluidos.length}`} icon={<Award className="w-5 h-5" />} color="emerald" />
                <KpiCard label="Total"      value={`${matriculas.length}`} icon={<BookOpen className="w-5 h-5" />} color="blue" />
            </div>

            {matriculas.length === 0 ? (
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12">
                    <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum treinamento atribuído</h3>
                    <p className="text-sm text-gray-500">Quando o RH atribuir um treinamento, ele aparece aqui.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {matriculas.map(m => {
                        const st = STATUS_LABEL[m.status] ?? { label: m.status, cor: 'text-gray-600' };
                        const atrasado = m.status !== 'CONCLUIDO' &&
                            (m.status === 'EXPIRADO' || (!!m.data_limite && m.data_limite < hoje));
                        return (
                            <div
                                key={m.id}
                                className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 flex flex-col gap-3 hover:border-blue-100 transition-all"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        {m.nr_referencia && (
                                            <span className="text-xs font-medium text-rose-600">{m.nr_referencia}</span>
                                        )}
                                        {m.origem === 'RECICLAGEM' && (
                                            <span className="text-xs font-medium text-amber-700">reciclagem</span>
                                        )}
                                    </div>
                                    <h3 className="text-sm font-bold text-gray-900 truncate">{m.course_nome}</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        v{m.versao ?? 1}
                                        {m.carga_horaria ? ` · ${m.carga_horaria}h` : ''}
                                        {m.data_limite ? ` · prazo ${fmtData(m.data_limite)}` : ''}
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-sm font-normal">
                                        <span className={atrasado ? 'text-rose-700' : st.cor}>
                                            {atrasado && m.status !== 'EXPIRADO' ? 'Em atraso' : st.label}
                                        </span>
                                        <span className="text-gray-500">{Math.round(m.percentual_progresso)}%</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all ${m.status === 'CONCLUIDO' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                            style={{ width: `${Math.min(100, m.percentual_progresso)}%` }}
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={() => onAbrir(m)}
                                    className="flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95"
                                >
                                    <PlayCircle className="w-[15px] h-[15px]" />
                                    {m.status === 'CONCLUIDO' ? 'Rever treinamento'
                                        : m.status === 'NAO_INICIADO' ? 'Começar' : 'Continuar'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AcademyClassroomTab;
