import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import type { RegistroDeRenovacao } from '../../services/contractRenewalService';
import { fmtDate, fmtDataHora, fmtCur } from './reajusteFormatos';

/**
 * Locações › Renovações › Histórico › Ver: uma renovação, só leitura
 * (mesmo desenho do Ver do Histórico de Reajustes).
 */

interface Props {
    registro: RegistroDeRenovacao | null;
    nomeDoCliente: (id?: string | null) => string;
    onClose: () => void;
    onOpenContract?: (contractId: string) => void;
}

const Linha: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
    <div className="grid grid-cols-[160px_1fr] gap-3 py-2 border-b border-gray-100 last:border-b-0">
        <dt className="text-xs font-semibold text-slate-500 pt-0.5">{rotulo}</dt>
        <dd className="text-sm text-gray-800">{children}</dd>
    </div>
);

const RenovacaoRegistroSheet: React.FC<Props> = ({ registro: r, nomeDoCliente, onClose, onOpenContract }) => (
    <Sheet open={!!r} onClose={onClose} size="md">
        <SheetHeader onClose={onClose}>
            <SheetTitle>Renovação {r ? `${r.numero} do contrato ${r.contrato.number}` : ''}</SheetTitle>
            <SheetDescription>{r ? `${r.via === 'ADITIVO' ? 'Aditivo de prorrogação' : 'Novo contrato'} · ${fmtDate(r.inicio)} a ${fmtDate(r.fim)}` : ''}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="p-6">
            {r && (
                <div className="space-y-4">
                    {r.status === 'Cancelado' && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] p-4 text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                {r.cancelado_em
                                    ? `Cancelada por ${r.cancelado_por ?? '—'} em ${fmtDataHora(r.cancelado_em)}.`
                                    : 'Cancelada antes de 25/11/2026: quem e quando não foram registrados.'}
                                {' '}As parcelas do período foram apagadas.
                            </span>
                        </div>
                    )}
                    <dl>
                        <Linha rotulo="Contrato">{r.contrato.number}{r.contrato.title ? ` · ${r.contrato.title}` : ''}</Linha>
                        <Linha rotulo="Locatário">{nomeDoCliente(r.contrato.client_id)}</Linha>
                        <Linha rotulo="Via">{r.via === 'ADITIVO' ? `Aditivo ${r.numero}` : `Novo contrato ${r.numero}`}</Linha>
                        <Linha rotulo="Situação">{r.status}</Linha>
                        <Linha rotulo="Período novo">{fmtDate(r.inicio)} a {fmtDate(r.fim)}</Linha>
                        <Linha rotulo="Vigência anterior até">{fmtDate(r.fimAnterior)}</Linha>
                        <Linha rotulo="Aluguel">
                            {r.valorAnterior != null && r.valor != null && Math.abs(r.valorAnterior - r.valor) >= 0.01
                                ? `${fmtCur(r.valorAnterior)} → ${fmtCur(r.valor)}` : fmtCur(r.valor)}
                        </Linha>
                        {r.via === 'ADITIVO' && <Linha rotulo="Parcelas geradas">{r.parcelas ?? '—'}</Linha>}
                        <Linha rotulo="Descrição">{r.descricao || '—'}</Linha>
                        <Linha rotulo="Feito por">{r.criado_por ?? 'Não registrado (antes de 25/11/2026)'}</Linha>
                        <Linha rotulo="Em">{fmtDataHora(r.criado_em)}</Linha>
                    </dl>
                </div>
            )}
        </SheetPanel>
        <SheetFooter>
            <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                Fechar
            </button>
            {r && onOpenContract && (
                <button
                    type="button"
                    onClick={() => onOpenContract(r.contract_id)}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                >
                    Abrir a negociação
                </button>
            )}
        </SheetFooter>
    </Sheet>
);

export default RenovacaoRegistroSheet;
