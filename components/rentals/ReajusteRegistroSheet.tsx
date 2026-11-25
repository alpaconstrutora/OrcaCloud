import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import type { RegistroComContrato } from '../../services/reajusteLocacaoService';
import { ROTULO_DECISAO, fmtDate, fmtDataHora, fmtCur, fmtPct } from './reajusteFormatos';

/**
 * Locações › Reajustes › Histórico › Ver: o que foi decidido num aniversário,
 * só leitura (pedido de 25/11/2026: CRUD na coluna Ações).
 */

const fmtMes = (iso?: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fmtIndice = (n?: number | null) => (n != null ? Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 6 }) : '');

interface Props {
    registro: RegistroComContrato | null;
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

const ReajusteRegistroSheet: React.FC<Props> = ({ registro: r, nomeDoCliente, onClose, onOpenContract }) => (
    <Sheet open={!!r} onClose={onClose} size="md">
        <SheetHeader onClose={onClose}>
            <SheetTitle>Reajuste {r ? `do contrato ${r.contrato.number}` : ''}</SheetTitle>
            <SheetDescription>{r ? `Reajuste em ${fmtDate(r.aniversario)} · período de ${fmtDate(r.data_base)} a ${fmtDate(r.aniversario)}` : ''}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="p-6">
            {r && (
                <div className="space-y-4">
                    {r.desfeito_em && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] p-4 text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Decisão desfeita por {r.desfeito_por ?? '—'} em {fmtDataHora(r.desfeito_em)}. O aluguel e as parcelas em aberto voltaram ao valor de antes.</span>
                        </div>
                    )}
                    <dl>
                        <Linha rotulo="Contrato">{r.contrato.number}{r.contrato.title ? ` · ${r.contrato.title}` : ''}</Linha>
                        <Linha rotulo="Locatário">{nomeDoCliente(r.contrato.client_id)}</Linha>
                        <Linha rotulo="Decisão">{ROTULO_DECISAO[r.decisao]}</Linha>
                        <Linha rotulo="Aluguel">
                            {r.decisao === 'NAO_APLICADO' ? `${fmtCur(r.valor_anterior)} (sem reajuste)` : `${fmtCur(r.valor_anterior)} → ${fmtCur(r.valor_novo)} (${fmtPct(Number(r.percentual_aplicado))})`}
                        </Linha>
                        <Linha rotulo="Índice">
                            {r.indice ?? 'Sem índice'}
                            {r.indice_mes_base && r.indice_mes_atual
                                ? ` · ${fmtMes(r.indice_mes_base)} ${fmtIndice(r.indice_valor_base)} → ${fmtMes(r.indice_mes_atual)} ${fmtIndice(r.indice_valor_atual)}`
                                : ''}
                            {r.percentual_indice != null ? ` · ${fmtPct(Number(r.percentual_indice))} no período` : ''}
                        </Linha>
                        <Linha rotulo="Parcelas atualizadas">{r.parcelas_atualizadas}</Linha>
                        <Linha rotulo="Observação">{r.observacao || '—'}</Linha>
                        <Linha rotulo="Decidido por">{r.criado_por ?? '—'}</Linha>
                        <Linha rotulo="Em">{fmtDataHora(r.created_at)}</Linha>
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

export default ReajusteRegistroSheet;
