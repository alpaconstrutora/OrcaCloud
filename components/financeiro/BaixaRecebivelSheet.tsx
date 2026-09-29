// components/financeiro/BaixaRecebivelSheet.tsx
//
// Painel de baixa de Contas a Receber e de Contas a Pagar — um título ou um
// lote. Substituiu o `useConfirm` sem campos: a baixa passa a gravar data e
// forma de pagamento, e opcionalmente emite o recibo numerado (um PDF por título).
// `tipo` troca só os rótulos: o fluxo e as regras são os mesmos nas duas telas.
// Planos: docs/planos/2026-09-26-contas-receber-recibo-na-baixa.md e
//         docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Receipt, Wallet } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { formatMoney as fmt, formatDateBR as fmtDate } from '../ui/Format';
import { FORMAS_PAGAMENTO, hojeLocal, motivoBaixaBloqueada } from '../../utils/baixaRecebivel';
import type { Receivable, ReceivablePaymentType } from '../../types/financial';

/** O que o painel mostra de cada título — neutro entre Receber e Pagar. */
export interface TituloDaBaixa {
    id: string;
    /** Pagador (Receber) ou credor (Pagar). */
    contraparte: string | null;
    descricao: string | null;
    vencimento: string | null;
    valor: number;
}

export const tituloDeRecebivel = (r: Receivable): TituloDaBaixa => ({
    id: r.id,
    contraparte: r.party_name ?? null,
    descricao: r.description ?? null,
    vencimento: r.due_date ?? null,
    valor: Number(r.amount) || 0,
});

type TipoDaBaixa = 'receber' | 'pagar';

const ROTULOS: Record<TipoDaBaixa, {
    titulo: string; tituloLote: (n: number) => string; descricao: string;
    contraparte: string; confirmar: string; reciboAjuda: string;
}> = {
    receber: {
        titulo: 'Confirmar recebimento',
        tituloLote: n => `Confirmar recebimento de ${n} títulos`,
        descricao: 'Informe como o pagamento foi recebido. A data e a forma saem no recibo.',
        contraparte: 'Pagador',
        confirmar: 'Confirmar recebimento',
        reciboAjuda: 'Gera o recibo numerado, guarda uma cópia e baixa o PDF.',
    },
    pagar: {
        titulo: 'Confirmar pagamento',
        tituloLote: n => `Confirmar pagamento de ${n} títulos`,
        descricao: 'Informe como o pagamento foi feito. A data e a forma saem no recibo que o credor assina.',
        contraparte: 'Credor',
        confirmar: 'Confirmar pagamento',
        reciboAjuda: 'Gera o recibo numerado para o credor assinar, guarda uma cópia e baixa o PDF.',
    },
};

export interface DadosDaBaixa {
    paymentDate: string;
    paymentType: ReceivablePaymentType | null;
    emitirRecibo: boolean;
}

interface Props {
    /** Títulos a baixar; `null` fecha o painel. */
    titulos: TituloDaBaixa[] | null;
    /** Rótulos de Contas a Receber (padrão) ou de Contas a Pagar. */
    tipo?: TipoDaBaixa;
    /** Estado inicial de "Emitir recibo" (Pagar: desmarcado em lote só de boleto). */
    emitirReciboPadrao?: boolean;
    /** Motivo de não haver recibo para NENHUM título (ex.: só Folha). Some a caixa. */
    reciboIndisponivel?: string | null;
    /** Observação sob a caixa quando PARTE do lote não recebe recibo. */
    avisoRecibo?: string | null;
    onClose: () => void;
    /** Faz a baixa (e o recibo). O painel fica travado até a promessa terminar. */
    onConfirm: (dados: DadosDaBaixa) => Promise<void>;
    /** Texto de progresso do lote ("Baixando 3 de 10…"). */
    progresso?: string | null;
}

const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

export default function BaixaRecebivelSheet({
    titulos, tipo = 'receber', emitirReciboPadrao = true, reciboIndisponivel = null, avisoRecibo = null,
    onClose, onConfirm, progresso,
}: Props) {
    const aberto = !!titulos && titulos.length > 0;
    const lista = titulos ?? [];
    const lote = lista.length > 1;
    const rotulos = ROTULOS[tipo];
    // Identidade dos títulos por ids, não pelo array: quem chama pode mapear a
    // lista a cada render, e isso não pode zerar o que o usuário já preencheu.
    const chaveDosTitulos = lista.map(t => t.id).join(',');

    const [dataPagamento, setDataPagamento] = useState(hojeLocal());
    const [forma, setForma] = useState<ReceivablePaymentType | ''>('');
    const [emitirRecibo, setEmitirRecibo] = useState(emitirReciboPadrao);
    const [salvando, setSalvando] = useState(false);

    // Cada abertura começa do padrão (hoje, sem forma, com recibo) — o painel
    // é reaproveitado entre títulos e não pode herdar a escolha anterior.
    useEffect(() => {
        if (!aberto) return;
        setDataPagamento(hojeLocal());
        setForma('');
        setEmitirRecibo(emitirReciboPadrao);
        setSalvando(false);
    }, [aberto, chaveDosTitulos, emitirReciboPadrao]);

    const hoje = hojeLocal();
    const motivo = motivoBaixaBloqueada(dataPagamento, hoje);
    const total = useMemo(() => lista.reduce((s, r) => s + (Number(r.valor) || 0), 0), [lista]);

    const fechar = () => { if (!salvando) onClose(); };

    const confirmar = async () => {
        if (motivo || salvando) return;
        setSalvando(true);
        try {
            await onConfirm({ paymentDate: dataPagamento, paymentType: forma || null, emitirRecibo: emitirRecibo && !reciboIndisponivel });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={aberto} onClose={fechar} size="lg">
            <SheetHeader onClose={fechar}>
                <SheetTitle>{lote ? rotulos.tituloLote(lista.length) : rotulos.titulo}</SheetTitle>
                <SheetDescription>
                    {lote
                        ? 'A mesma data e forma de pagamento valem para todos os títulos selecionados.'
                        : rotulos.descricao}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6 space-y-8">
                {/* Títulos */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <Wallet className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">{lote ? 'Títulos' : 'Título'}</h3>
                    </div>
                    <div className="overflow-x-auto rounded-[10px] border border-gray-100 max-h-64 overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="px-4 py-2 border-r border-gray-100">{rotulos.contraparte}</th>
                                    <th className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">Vencimento</th>
                                    <th className="px-3 py-2 text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {lista.map(r => (
                                    <tr key={r.id}>
                                        <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 max-w-0 w-full">
                                            <span className="block truncate" title={r.contraparte ?? ''}>{r.contraparte || '—'}</span>
                                            {r.descricao && (
                                                <span className="block truncate text-xs text-gray-400" title={r.descricao}>{r.descricao}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">
                                            {r.vencimento ? fmtDate(r.vencimento) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-sm font-medium text-gray-800 text-right whitespace-nowrap">{fmt(r.valor)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {lote && (
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Total</span>
                            <span className="font-medium text-gray-800">{fmt(total)}</span>
                        </div>
                    )}
                </div>

                {/* Pagamento */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <Receipt className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Pagamento</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="baixa-data" className="text-xs font-semibold text-slate-500">Data do pagamento</label>
                            <input
                                id="baixa-data"
                                type="date"
                                value={dataPagamento}
                                max={hoje}
                                disabled={salvando}
                                onChange={e => setDataPagamento(e.target.value)}
                                className={inputCls}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="baixa-forma" className="text-xs font-semibold text-slate-500">Forma de pagamento</label>
                            <div className="relative">
                                <select
                                    id="baixa-forma"
                                    value={forma}
                                    disabled={salvando}
                                    onChange={e => setForma(e.target.value as ReceivablePaymentType | '')}
                                    className={`${inputCls} appearance-none pr-8 cursor-pointer`}
                                >
                                    <option value="">Não informada</option>
                                    {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {reciboIndisponivel ? (
                        <p className="text-xs text-gray-500">{reciboIndisponivel}</p>
                    ) : (
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={emitirRecibo}
                            disabled={salvando}
                            onChange={e => setEmitirRecibo(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="space-y-0.5">
                            <span className="block text-sm font-medium text-gray-800">Emitir recibo</span>
                            <span className="block text-xs text-gray-500">
                                {lote
                                    ? 'Um recibo numerado por título, cada um em seu PDF. O navegador pode pedir permissão para baixar vários arquivos.'
                                    : rotulos.reciboAjuda}
                            </span>
                            {avisoRecibo && <span className="block text-xs text-amber-700">{avisoRecibo}</span>}
                        </span>
                    </label>
                    )}
                </div>
            </SheetPanel>

            <SheetFooter>
                {(motivo || (salvando && progresso)) && (
                    <span className={`mr-auto text-xs ${motivo ? 'text-amber-700' : 'text-gray-500'}`}>
                        {motivo ?? progresso}
                    </span>
                )}
                <button
                    onClick={fechar}
                    disabled={salvando}
                    className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    onClick={confirmar}
                    disabled={!!motivo || salvando}
                    title={motivo ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {rotulos.confirmar}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
