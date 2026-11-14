/**
 * Varredura diária das caixas da captura de boletos: a HORA em que, todo dia, o sistema busca
 * sozinho os e-mails dos últimos 30 dias (ou desligada).
 *
 * Pedido de 14/11/2026: "Não vi o campo para ajustar hora" — a varredura nasceu em 13/11 fixa às
 * 03:00. Uma linha por caixa ativa; o gestor da organização altera (mesma policy de modo/piloto).
 * Plano: docs/planos/2026-11-13-boletos-a-pagar-dez-pedidos.md (item 1).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import {
    emailCaptureService, rotuloHoraVarredura, DIAS_BUSCA_AUTOMATICA,
    type ContaCaptura,
} from '../../services/emailCaptureService';

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-60';
const HORAS = Array.from({ length: 24 }, (_, h) => h);
/** Valor do <select> para "desligada" (o select só guarda texto). */
const DESLIGADA = '';

interface Props {
    open: boolean;
    onClose: () => void;
    contas: ContaCaptura[];
    onSalvas: (contas: ContaCaptura[]) => void;
}

const EmailCaptureVarreduraSheet: React.FC<Props> = ({ open, onClose, contas, onSalvas }) => {
    const [horas, setHoras] = useState<Record<string, string>>({});
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setHoras(Object.fromEntries(contas.map(c => [c.id, c.busca_diaria_hora == null ? DESLIGADA : String(c.busca_diaria_hora)])));
        setErro(null);
    }, [open, contas]);

    const mudadas = useMemo(() => contas.filter(c => {
        const atual = c.busca_diaria_hora == null ? DESLIGADA : String(c.busca_diaria_hora);
        return (horas[c.id] ?? atual) !== atual;
    }), [contas, horas]);

    if (!open) return null;

    const dirty = mudadas.length > 0;
    const motivoDesligado: string | null = salvando ? 'Salvando…' : !dirty ? 'Nenhuma hora foi alterada.' : null;

    async function salvar() {
        if (motivoDesligado) return;
        setSalvando(true);
        setErro(null);
        const salvas: ContaCaptura[] = [];
        try {
            for (const c of mudadas) {
                const v = horas[c.id];
                const busca_diaria_hora = v === DESLIGADA ? null : Number(v);
                await emailCaptureService.atualizarConta(c.id, { busca_diaria_hora });
                salvas.push({ ...c, busca_diaria_hora });
            }
            onSalvas(salvas);
            onClose();
        } catch (e) {
            if (salvas.length) onSalvas(salvas);
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setSalvando(false);
        }
    }

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={dirty && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Varredura diária</SheetTitle>
                <SheetDescription>{`Todo dia, na hora escolhida, cada caixa busca sozinha os e-mails dos últimos ${DIAS_BUSCA_AUTOMATICA} dias.`}</SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                {contas.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma caixa ativa. Conecte ou reative uma caixa na aba Caixas e remetentes.</p>
                ) : (
                    <div className="space-y-4">
                        {contas.map(c => (
                            <div key={c.id} className="space-y-1.5">
                                <label htmlFor={`varredura-${c.id}`} className={`block ${ROTULO}`}>{c.usuario}</label>
                                <select
                                    id={`varredura-${c.id}`}
                                    value={horas[c.id] ?? DESLIGADA}
                                    onChange={e => setHoras(prev => ({ ...prev, [c.id]: e.target.value }))}
                                    disabled={salvando}
                                    className={CAMPO}
                                >
                                    <option value={DESLIGADA}>Desligada</option>
                                    {HORAS.map(h => <option key={h} value={String(h)}>{rotuloHoraVarredura(h)}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-2 rounded-[10px] border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                    <Info className="w-4 h-4 shrink-0 mt-px" />
                    <p>
                        Horário de Brasília. A busca aparece nesta aba como “Varredura diária (automática)” e anda de 15 em 15 minutos;
                        e-mail já lido é pulado e boleto repetido vira “Duplicado”. Se a caixa já tiver uma busca em andamento na hora, a varredura daquele dia não roda.
                    </p>
                </div>

                {erro && (
                    <p className="rounded-[10px] border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">{erro}</p>
                )}
            </SheetPanel>

            <SheetFooter>
                <button onClick={onClose} disabled={salvando} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50">
                    Cancelar
                </button>
                <button onClick={salvar} disabled={!!motivoDesligado} title={motivoDesligado ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                    Salvar horário
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default EmailCaptureVarreduraSheet;
