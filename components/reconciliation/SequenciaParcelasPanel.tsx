// components/reconciliation/SequenciaParcelasPanel.tsx
//
// Card "Sequência de parcelas" da Central de Conciliação (pedido de 24/11/2026).
// Um contrato de N parcelas deve casar com N movimentos do extrato; aqui aparecem
// os contratos cuja série QUEBROU — furo (parcela não paga entre pagas), vencida em
// aberto, paga com atraso, pagas juntas — e o "Conciliar juntas" quando um movimento
// pendente = soma de parcelas abertas e seguidas. Clicar no contrato abre a série
// inteira (SequenciaParcelasSheet). Regra em utils/sequenciaParcelas.ts.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, ListOrdered, Loader2, RefreshCw } from 'lucide-react';
import { sequenciaParcelasService, type SequenciaDaConta } from '../../services/sequenciaParcelasService';
import type { CandidatoJuntas, ExtratoPendente, SerieDeParcelas } from '../../utils/sequenciaParcelas';
import { useToast } from '../../hooks/useToast';
import { formatMoney, formatDateBR } from '../ui/Format';
import SequenciaParcelasSheet, { ROTULO_DOMINIO, listaDeNumeros } from './SequenciaParcelasSheet';

const LIMITE_INICIAL = 5;
const SEM_PARECIDOS = new Map<string, ExtratoPendente>();

const temOcorrencia = (s: SerieDeParcelas) => {
    const o = s.ocorrencias;
    return o.furos + o.vencidas + o.atrasadas + o.juntas > 0;
};
const peso = (s: SerieDeParcelas) => s.ocorrencias.furos * 1000 + s.ocorrencias.vencidas * 100 + s.ocorrencias.atrasadas * 10 + s.ocorrencias.juntas;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface Props {
    organizationId: string;
    selectedAccountId: string | null;
    onReload: () => Promise<void> | void;
}

const SequenciaParcelasPanel: React.FC<Props> = ({ organizationId, selectedAccountId, onReload }) => {
    const { showToast } = useToast();
    const [data, setData] = useState<SequenciaDaConta | null>(null);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [mostrarTodos, setMostrarTodos] = useState(false);
    const [abertaId, setAbertaId] = useState<string | null>(null);

    // A organização é a da CONTA (o serviço resolve); a prop só é repassada (REGRA #5).
    const load = useCallback(async () => {
        if (!selectedAccountId) { setData(null); return; }
        setLoading(true);
        setErro(null);
        try {
            setData(await sequenciaParcelasService.carregar(selectedAccountId, organizationId));
        } catch (e) {
            console.error('[SequenciaParcelasPanel]', e);
            setData(null);
            setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
        } finally {
            setLoading(false);
        }
    }, [organizationId, selectedAccountId]);

    useEffect(() => { load(); }, [load]);

    const candidatosPorContrato = useMemo(() => {
        const m = new Map<string, CandidatoJuntas[]>();
        (data?.candidatos ?? []).forEach(c => m.set(c.contractId, [...(m.get(c.contractId) ?? []), c]));
        return m;
    }, [data]);

    // Só a série da conta com ocorrência, ou qualquer série com "Conciliar juntas".
    const visiveis = useMemo(() => (data?.series ?? [])
        .filter(s => (s.daConta && temOcorrencia(s)) || candidatosPorContrato.has(s.contractId))
        .sort((a, b) => Number(candidatosPorContrato.has(b.contractId)) - Number(candidatosPorContrato.has(a.contractId))
            || peso(b) - peso(a)
            || a.numeroContrato.localeCompare(b.numeroContrato)),
    [data, candidatosPorContrato]);

    const conciliar = async (c: CandidatoJuntas) => {
        setOcupado(c.bank.id);
        try {
            await sequenciaParcelasService.conciliarJuntas(c);
            showToast(`Parcelas ${listaDeNumeros(c.parcelas.map(p => p.numero))} conciliadas juntas`, 'success');
            await load();
            await onReload();
        } catch (e) {
            console.error('[SequenciaParcelasPanel] conciliar', e);
            const err = e as { message?: string; code?: string };
            showToast(`Erro ao conciliar as parcelas: ${err?.message ?? String(e)}${err?.code ? ` (${err.code})` : ''}`, 'error');
        } finally {
            setOcupado(null);
        }
    };

    if (!selectedAccountId) return null;

    const mostradas = mostrarTodos ? visiveis : visiveis.slice(0, LIMITE_INICIAL);
    const aberta = (data?.series ?? []).find(s => s.contractId === abertaId) ?? null;

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <ListOrdered className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">Sequência de parcelas</h3>
                <span className="text-sm text-gray-500">
                    · {loading ? 'calculando…' : visiveis.length === 0 ? 'nenhum contrato com ocorrência' : plural(visiveis.length, 'contrato com ocorrência', 'contratos com ocorrência')}
                </span>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="ml-auto h-8 w-8 flex items-center justify-center rounded-[6px] text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-all disabled:opacity-50"
                    title="Recalcular"
                    aria-label="Recalcular a sequência de parcelas"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {erro && (
                <p className="px-4 py-3 text-sm text-red-600 border-b border-gray-100">Não foi possível ler a sequência de parcelas: {erro}</p>
            )}

            {mostradas.length > 0 && (
                <ul className="divide-y divide-gray-100">
                    {mostradas.map(s => {
                        const o = s.ocorrencias;
                        const candidatos = candidatosPorContrato.get(s.contractId) ?? [];
                        const comParecido = s.parcelas.filter(x => data?.parecidos.has(x.id)).length;
                        return (
                            <li key={s.contractId}>
                                <button
                                    type="button"
                                    onClick={() => setAbertaId(s.contractId)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-all"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium text-gray-900 truncate">
                                            {[s.numeroContrato, s.titulo].filter(Boolean).join(' · ') || 'Contrato'}
                                        </span>
                                        <span className="block text-xs text-gray-600 truncate mt-0.5">
                                            {[s.parte, s.dominio ? ROTULO_DOMINIO[s.dominio] ?? s.dominio : null, `${s.conferidas} de ${s.parcelas.length} conferidas`].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <span className="flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-sm font-normal shrink-0 max-w-[50%]">
                                        {o.furos > 0 && <span className="text-red-600">{plural(o.furos, 'furo', 'furos')}</span>}
                                        {o.vencidas > 0 && <span className="text-red-600">{plural(o.vencidas, 'vencida', 'vencidas')}</span>}
                                        {o.atrasadas > 0 && <span className="text-amber-800">{plural(o.atrasadas, 'paga com atraso', 'pagas com atraso')}</span>}
                                        {o.juntas > 0 && <span className="text-indigo-700">{o.juntas} pagas juntas</span>}
                                        {comParecido > 0 && <span className="text-blue-700">{comParecido} com movimento parecido</span>}
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                                </button>
                                {candidatos.map(c => (
                                    <div key={c.bank.id} className="flex flex-wrap items-center gap-3 mx-4 mb-3 px-3 py-2 rounded-[6px] border border-blue-100 bg-blue-50/50">
                                        <p className="text-sm text-gray-800 min-w-0 flex-1">
                                            {c.bank.direction === 'CREDIT' ? 'Crédito' : 'Débito'} de {formatDateBR(c.bank.transaction_date)} · {formatMoney(c.bank.amount)} = parcelas {listaDeNumeros(c.parcelas.map(p => p.numero))}
                                            <span className="text-gray-600"> (venc. {c.parcelas.map(p => formatDateBR(p.due_date)).join(', ')})</span>
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => conciliar(c)}
                                            disabled={ocupado === c.bank.id}
                                            className="flex items-center gap-1 h-8 px-3 rounded-[6px] text-[13px] font-medium text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 transition-all disabled:opacity-50"
                                        >
                                            {ocupado === c.bank.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Conciliar juntas
                                        </button>
                                    </div>
                                ))}
                            </li>
                        );
                    })}
                </ul>
            )}

            {visiveis.length > LIMITE_INICIAL && (
                <div className="px-4 py-2 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={() => setMostrarTodos(v => !v)}
                        className="text-[13px] font-medium text-blue-600 hover:text-blue-700"
                    >
                        {mostrarTodos ? 'Mostrar menos' : `Mostrar todos (${visiveis.length})`}
                    </button>
                </div>
            )}

            <SequenciaParcelasSheet
                serie={aberta}
                candidatos={aberta ? candidatosPorContrato.get(aberta.contractId) ?? [] : []}
                parecidos={data?.parecidos ?? SEM_PARECIDOS}
                ocupado={ocupado}
                onConciliar={conciliar}
                onClose={() => setAbertaId(null)}
            />
        </div>
    );
};

export default SequenciaParcelasPanel;
