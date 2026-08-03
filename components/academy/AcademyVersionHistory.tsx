import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Users } from 'lucide-react';
import AcademyVersionAcksSheet from './AcademyVersionAcksSheet';
import { academyService } from '../../services/academyService';
import type { AcademyVersionHistoryRow } from '../../types/academy';

/**
 * Histórico de versões — a trilha de auditoria do conteúdo.
 *
 * Os dados já existiam no banco (publicada_por, publicada_em, arquivada_em)
 * mas não apareciam em lugar nenhum: para responder "quem publicou a v2 e
 * quando" era preciso consultar o banco. Num módulo cuja razão de existir é
 * sustentar fiscalização, isso não se sustenta.
 *
 * `publicada_por` é resolvido em NOME pelo servidor — UUID não serve de
 * evidência para ninguém.
 */

const fmtDataHora = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const STATUS: Record<string, { label: string; cor: string }> = {
    RASCUNHO:  { label: 'Rascunho',  cor: 'text-amber-700' },
    PUBLICADA: { label: 'Vigente',   cor: 'text-emerald-700' },
    ARQUIVADA: { label: 'Arquivada', cor: 'text-gray-500' },
};

interface Props {
    courseId: string;
    /** Muda quando algo é publicado/arquivado, para recarregar. */
    revalidarEm?: string | number;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyVersionHistory: React.FC<Props> = ({ courseId, revalidarEm, notify }) => {
    const [linhas, setLinhas] = useState<AcademyVersionHistoryRow[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [acksAbertos, setAcksAbertos] = useState<{ id: string; versao: number } | null>(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setLinhas(await academyService.listVersionHistory(courseId));
        } catch (e: any) {
            notify('Erro ao carregar o histórico: ' + (e?.message || ''), 'error');
        } finally {
            setCarregando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courseId, revalidarEm]);

    useEffect(() => { void carregar(); }, [carregar]);

    if (carregando) {
        return (
            <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                <p className="mt-2 text-gray-500">Carregando histórico...</p>
            </div>
        );
    }

    if (linhas.length === 0) {
        return (
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma versão ainda</h3>
                <p className="text-sm text-gray-500">O histórico começa quando a primeira versão é criada.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-sm font-medium text-gray-500">
                Cada publicação fica registrada com autor, data e impacto. Este é o rastro que
                sustenta a evidência numa auditoria.
            </p>

            {linhas.map(v => {
                const st = STATUS[v.status] ?? { label: v.status, cor: 'text-gray-600' };
                return (
                    <div key={v.id} className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-gray-900">Versão {v.versao}</h3>
                                    <span className={`text-sm font-normal ${st.cor}`}>{st.label}</span>
                                </div>
                                {v.titulo_versao && (
                                    <p className="text-xs text-gray-400 mt-0.5">{v.titulo_versao}</p>
                                )}
                            </div>
                            <span className="text-sm font-normal text-gray-400 shrink-0">
                                {v.modulos} módulo{v.modulos === 1 ? '' : 's'} · {v.aulas} aula{v.aulas === 1 ? '' : 's'}
                            </span>
                        </div>

                        {v.notas_versao ? (
                            <div className="bg-gray-50 border border-gray-100 rounded-[6px] p-3">
                                <p className="text-xs font-semibold text-gray-500 mb-1">O que mudou</p>
                                <p className="text-sm font-normal text-gray-700 whitespace-pre-line">{v.notas_versao}</p>
                            </div>
                        ) : v.status !== 'RASCUNHO' && v.versao === 1 ? null : (
                            <p className="text-xs text-amber-700">
                                Sem descrição da mudança.
                            </p>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-gray-100 pt-3">
                            <div>
                                <p className="text-xs font-semibold text-gray-400">Publicada por</p>
                                <p className="text-sm font-normal text-gray-700">{v.publicada_por_nome || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-400">Publicada em</p>
                                <p className="text-sm font-normal text-gray-700">{fmtDataHora(v.publicada_em)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-400">Arquivada em</p>
                                <p className="text-sm font-normal text-gray-700">{fmtDataHora(v.arquivada_em)}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-400">Criada em</p>
                                <p className="text-sm font-normal text-gray-700">{fmtDataHora(v.criada_em)}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-gray-100 pt-3">
                            <div>
                                <p className="text-xs font-semibold text-gray-400">Matrículas</p>
                                <p className="text-sm font-normal text-gray-700">{v.matriculas}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-400">Concluídas</p>
                                <p className="text-sm font-normal text-emerald-700">{v.concluidas}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-400">Reciclagens geradas</p>
                                <p className="text-sm font-normal text-gray-700">
                                    {v.reciclagens_geradas ?? '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-400">Migradas</p>
                                <p className="text-sm font-normal text-gray-700">
                                    {v.migradas_geradas ?? '—'}
                                </p>
                            </div>
                        </div>

                        {/* Ciência só faz sentido quando houve mensagem de mudança:
                            sem `notas_versao` o aluno nunca viu aviso nenhum. */}
                        {v.notas_versao && v.matriculas > 0 && (
                            <div className="border-t border-gray-100 pt-3 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold text-gray-400">Ciência da mudança</p>
                                    <p className={`text-sm font-normal ${
                                        v.ciencias >= v.matriculas ? 'text-emerald-700' : 'text-amber-700'
                                    }`}>
                                        {v.ciencias} de {v.matriculas} declararam ciência
                                        {v.ciencias < v.matriculas && ` · ${v.matriculas - v.ciencias} pendente(s)`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setAcksAbertos({ id: v.id, versao: v.versao })}
                                    className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all shrink-0"
                                >
                                    <Users className="w-4 h-4" /> Ver quem falta
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            {acksAbertos && (
                <AcademyVersionAcksSheet
                    open
                    onClose={() => setAcksAbertos(null)}
                    versionId={acksAbertos.id}
                    versao={acksAbertos.versao}
                    notify={notify}
                />
            )}
        </div>
    );
};

export default AcademyVersionHistory;
