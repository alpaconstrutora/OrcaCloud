// components/reconciliation/SequenciaParcelasSheet.tsx
//
// Gaveta da "Sequência de parcelas" (Conciliação › Central, 24/11/2026): a série
// inteira de UM contrato, parcela 1..N, com a situação de cada uma contra o extrato
// — onde ficou o furo, quem pagou atrasado, quais foram pagas juntas. Regra em
// utils/sequenciaParcelas.ts.
import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { formatMoney, formatDateBR } from '../ui/Format';
import type { CandidatoJuntas, ExtratoPendente, ParcelaNaSerie, SerieDeParcelas, SituacaoParcela } from '../../utils/sequenciaParcelas';

export const ROTULO_DOMINIO: Record<string, string> = {
    LOCACAO: 'Locação',
    VENDAS: 'Vendas',
    SERVICOS: 'Serviços',
    SUPRIMENTOS: 'Suprimentos',
};

const SITUACAO: Record<SituacaoParcela, { rotulo: string; cor: string }> = {
    conferida: { rotulo: 'Conferida', cor: 'text-green-800' },
    conferida_atrasada: { rotulo: 'Paga com atraso', cor: 'text-amber-800' },
    baixada_fora: { rotulo: 'Baixada fora do extrato', cor: 'text-gray-700' },
    a_vencer: { rotulo: 'A vencer', cor: 'text-gray-700' },
    sem_extrato: { rotulo: 'Sem extrato no período', cor: 'text-gray-700' },
    furo: { rotulo: 'Furo — não paga', cor: 'text-red-600' },
    vencida: { rotulo: 'Vencida em aberto', cor: 'text-red-600' },
};

/** "+4,1%" — quanto o movimento difere do valor esperado da parcela. */
const variacao = (extrato: number, esperado: number) => {
    const pct = esperado ? ((extrato - esperado) / esperado) * 100 : 0;
    return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
};

export const listaDeNumeros = (ns: number[]) =>
    ns.length <= 1 ? String(ns[0] ?? '') : `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}`;

function DetalheDoExtrato({ p }: { p: ParcelaNaSerie }) {
    if (!p.dataBanco) return <span className="text-gray-500">—</span>;
    return (
        <span className="text-gray-700">
            {formatDateBR(p.dataBanco)}
            {p.situacao === 'conferida_atrasada' && (
                <span className="text-amber-800"> · +{p.diasAtraso} dias{p.mesPosterior ? ', mês seguinte' : ''}</span>
            )}
            {p.juntoCom.length > 0 && (
                <span className="text-indigo-700"> · junto com a {listaDeNumeros(p.juntoCom)}</span>
            )}
        </span>
    );
}

interface Props {
    serie: SerieDeParcelas | null;
    candidatos: CandidatoJuntas[];
    /** Parcela → movimento pendente parecido (talvez paga com outro valor). */
    parecidos: Map<string, ExtratoPendente>;
    ocupado: string | null;
    onConciliar: (c: CandidatoJuntas) => void;
    onClose: () => void;
}

const SequenciaParcelasSheet: React.FC<Props> = ({ serie, candidatos, parecidos, ocupado, onConciliar, onClose }) => {
    const parcelasDoCandidato = new Map<string, CandidatoJuntas>();
    candidatos.forEach(c => c.parcelas.forEach(p => parcelasDoCandidato.set(p.id, c)));
    const o = serie?.ocorrencias;
    const comParecido = serie ? serie.parcelas.filter(p => parecidos.has(p.id)).length : 0;

    return (
        <Sheet open={!!serie} onClose={onClose} size="2xl">
            {serie && o && (
                <>
                    <SheetHeader onClose={onClose}>
                        <SheetTitle>{[serie.numeroContrato, serie.titulo].filter(Boolean).join(' · ') || 'Contrato'}</SheetTitle>
                        <SheetDescription>
                            {[serie.parte, serie.dominio ? ROTULO_DOMINIO[serie.dominio] ?? serie.dominio : null, serie.direction === 'CREDIT' ? 'a receber' : 'a pagar']
                                .filter(Boolean).join(' · ')}
                        </SheetDescription>
                    </SheetHeader>
                    <SheetPanel className="px-6 py-5 space-y-5">
                        <p className="text-sm text-gray-700">
                            {serie.conferidas} de {serie.parcelas.length} parcelas conferidas no extrato
                            {o.furos > 0 && <span className="text-red-600"> · {o.furos} {o.furos === 1 ? 'furo' : 'furos'}</span>}
                            {o.vencidas > 0 && <span className="text-red-600"> · {o.vencidas} {o.vencidas === 1 ? 'vencida' : 'vencidas'} em aberto</span>}
                            {o.atrasadas > 0 && <span className="text-amber-800"> · {o.atrasadas} {o.atrasadas === 1 ? 'paga' : 'pagas'} com atraso</span>}
                            {o.juntas > 0 && <span className="text-indigo-700"> · {o.juntas} pagas juntas</span>}
                            {comParecido > 0 && <span className="text-blue-700"> · {comParecido} com movimento parecido no extrato</span>}
                        </p>

                        {candidatos.map(c => {
                            const chave = `${c.bank.id}`;
                            return (
                                <div key={chave} className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-[10px] border border-blue-100 bg-blue-50/50">
                                    <p className="text-sm text-gray-800 min-w-0 flex-1">
                                        {c.bank.direction === 'CREDIT' ? 'Crédito' : 'Débito'} de {formatDateBR(c.bank.transaction_date)} · {formatMoney(c.bank.amount)} = parcelas {listaDeNumeros(c.parcelas.map(p => p.numero))}
                                        {Math.abs(c.diff) > 0.01 && <span className="text-amber-800"> (diferença {formatMoney(Math.abs(c.diff))})</span>}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => onConciliar(c)}
                                        disabled={ocupado === chave}
                                        className="flex items-center gap-1 h-8 px-3 rounded-[6px] text-[13px] font-medium text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 transition-all disabled:opacity-50"
                                    >
                                        {ocupado === chave ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Conciliar juntas
                                    </button>
                                </div>
                            );
                        })}

                        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-3 py-2 border-r border-gray-100">#</th>
                                        <th className="px-3 py-2 border-r border-gray-100">Vencimento</th>
                                        <th className="px-3 py-2 border-r border-gray-100 text-right">Valor esperado</th>
                                        <th className="px-3 py-2 border-r border-gray-100">Situação</th>
                                        <th className="px-4 py-2">Extrato</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {serie.parcelas.map(p => {
                                        const s = SITUACAO[p.situacao];
                                        const candidato = parcelasDoCandidato.get(p.id);
                                        const parecido = parecidos.get(p.id);
                                        return (
                                            <tr key={p.id} className={p.situacao === 'furo' ? 'bg-red-50/40' : undefined}>
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 tabular-nums">{p.numero}</td>
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-900 tabular-nums">{formatDateBR(p.due_date)}</td>
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-900 tabular-nums text-right">{formatMoney(p.amount)}</td>
                                                <td className={`px-3 py-2.5 border-r border-gray-100 text-sm font-normal ${s.cor}`}>{s.rotulo}</td>
                                                <td className="px-4 py-2.5 text-sm font-normal">
                                                    <DetalheDoExtrato p={p} />
                                                    {parecido && (
                                                        <span className="block text-blue-700">
                                                            {parecido.direction === 'CREDIT' ? 'Crédito' : 'Débito'} pendente de {formatDateBR(parecido.transaction_date)} · {formatMoney(parecido.amount)} ({variacao(parecido.amount, p.amount)}) pode ser esta parcela
                                                        </span>
                                                    )}
                                                    {candidato && (
                                                        <span className="text-blue-700"> · casa com o {candidato.bank.direction === 'CREDIT' ? 'crédito' : 'débito'} de {formatDateBR(candidato.bank.transaction_date)}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </SheetPanel>
                </>
            )}
        </Sheet>
    );
};

export default SequenciaParcelasSheet;
