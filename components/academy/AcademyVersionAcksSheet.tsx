import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Users } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { academyService } from '../../services/academyService';
import type { AcademyVersionAckRow } from '../../types/academy';

/**
 * Quem deu ciência da mudança desta versão — e, principalmente, quem não deu.
 *
 * UI_PATTERNS §3: visualizar detalhe de um item de lista é painel lateral. O
 * pai é a TELA do construtor, não outro Sheet, então não há drawer aninhado.
 *
 * Pendentes vêm primeiro (ordenação vem do servidor): a tela existe para
 * cobrar, não para exibir média.
 */

const fmtDataHora = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

interface Props {
    open: boolean;
    onClose: () => void;
    versionId: string;
    versao: number;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyVersionAcksSheet: React.FC<Props> = ({ open, onClose, versionId, versao, notify }) => {
    const [linhas, setLinhas] = useState<AcademyVersionAckRow[]>([]);
    const [carregando, setCarregando] = useState(true);

    useEffect(() => {
        (async () => {
            setCarregando(true);
            try {
                setLinhas(await academyService.listVersionAcks(versionId));
            } catch (e: any) {
                notify('Erro ao carregar a ciência: ' + (e?.message || ''), 'error');
            } finally {
                setCarregando(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versionId]);

    const comCiencia = linhas.filter(l => l.ciencia_em).length;
    const pendentes = linhas.length - comCiencia;

    const copiarPendentes = async () => {
        const nomes = linhas.filter(l => !l.ciencia_em).map(l => l.employee_name || l.employee_id);
        if (!nomes.length) { notify('Ninguém pendente.'); return; }
        try {
            await navigator.clipboard.writeText(nomes.join('\n'));
            notify(`${nomes.length} nome(s) copiado(s).`);
        } catch {
            notify('Não foi possível copiar.', 'error');
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Ciência da versão {versao}</SheetTitle>
                <SheetDescription>
                    Quem foi alcançado pela mudança e já declarou ciência.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                {carregando ? (
                    <div className="text-center py-12">
                        <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : linhas.length === 0 ? (
                    <div className="text-center py-12">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma matrícula nesta versão</h3>
                        <p className="text-sm text-gray-500">
                            A ciência só é pedida a quem tem matrícula na versão.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-emerald-50 border border-emerald-100 rounded-[10px] p-3">
                                <p className="text-xs font-semibold text-emerald-700">Com ciência</p>
                                <p className="text-2xl font-black text-emerald-800 mt-0.5">{comCiencia}</p>
                            </div>
                            <div className={`rounded-[10px] p-3 border ${
                                pendentes > 0 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'
                            }`}>
                                <p className={`text-xs font-semibold ${pendentes > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                                    Pendentes
                                </p>
                                <p className={`text-2xl font-black mt-0.5 ${pendentes > 0 ? 'text-amber-800' : 'text-gray-600'}`}>
                                    {pendentes}
                                </p>
                            </div>
                        </div>

                        <div className="divide-y divide-gray-100 border border-gray-100 rounded-[10px] overflow-hidden">
                            {linhas.map(l => (
                                <div key={l.enrollment_id} className="px-4 py-2.5 flex items-center gap-3 bg-white">
                                    {l.ciencia_em
                                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                        : <Clock className="w-4 h-4 text-amber-500 shrink-0" />}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-normal text-gray-900 truncate">
                                            {l.employee_name || '—'}
                                        </p>
                                        {l.employee_role && (
                                            <p className="text-xs text-gray-400 truncate">{l.employee_role}</p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        {l.ciencia_em ? (
                                            <>
                                                <p className="text-sm font-normal text-gray-600">
                                                    {fmtDataHora(l.ciencia_em)}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {l.canal === 'PORTAL' ? 'pelo portal' : 'pelo sistema'}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="text-sm font-normal text-amber-700">Sem ciência</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </SheetPanel>

            <SheetFooter>
                <Button variant="ghost" size="lg" onClick={onClose}>Fechar</Button>
                <button
                    onClick={copiarPendentes}
                    disabled={carregando || pendentes === 0}
                    title={pendentes === 0 ? 'Ninguém pendente' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    Copiar pendentes
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AcademyVersionAcksSheet;
