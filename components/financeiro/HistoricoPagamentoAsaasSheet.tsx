import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { supplierPaymentService, type EventoPagamento, type SupplierPayment } from '../../services/supplierPaymentService';
import { formatMoney, formatDateBR } from '../ui/Format';

interface Props {
    transactionId: string;
    descricao?: string | null;
    onClose: () => void;
}

/** Status de supplier_payments em português (o mesmo vocabulário do selo da linha). */
const STATUS: Record<string, { rotulo: string; cor: string }> = {
    AWAITING_APPROVAL: { rotulo: 'Aguardando aprovação', cor: 'text-gray-600' },
    APPROVED:  { rotulo: 'Aprovado no OrçaCloud', cor: 'text-gray-600' },
    PENDING:   { rotulo: 'Enviado à Asaas', cor: 'text-blue-700' },
    SCHEDULED: { rotulo: 'Agendado', cor: 'text-blue-700' },
    DONE:      { rotulo: 'Concluído', cor: 'text-emerald-700' },
    FAILED:    { rotulo: 'Falhou', cor: 'text-red-700' },
    CANCELLED: { rotulo: 'Cancelado', cor: 'text-amber-700' },
};
const rotulo = (s: string | null | undefined) => (s ? (STATUS[s]?.rotulo ?? s) : '—');

const ORIGEM: Record<string, string> = {
    fornecedor: 'chave do cadastro do fornecedor',
    colaborador: 'chave do cadastro do colaborador',
    socio: 'chave do cadastro do sócio',
    avulso: 'chave digitada',
};

function quando(iso: string): string {
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR')}`;
}

function oQue(e: EventoPagamento): string {
    if (e.acao === 'criado') return 'Pagamento criado';
    if (e.acao === 'excluido') return 'Registro excluído';
    if (e.acao === 'atualizado') return 'Dados atualizados pela Asaas';
    return `${rotulo(e.status_antes)} → ${rotulo(e.status_depois)}`;
}

/**
 * Histórico dos pagamentos pela Asaas de um título (Contas a Pagar ›
 * Parcelas › ícone de relógio). Lê supplier_payments_auditoria, gravada por
 * gatilho em toda mudança — tela, webhook ou consulta automática —, com o
 * autor de cada passo: quem disparou, quem cancelou, ou "Asaas".
 * Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (Fase 4).
 */
export default function HistoricoPagamentoAsaasSheet({ transactionId, descricao, onClose }: Props) {
    const [dados, setDados] = useState<{ pagamentos: SupplierPayment[]; eventos: EventoPagamento[] } | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        supplierPaymentService.historicoDoTitulo(transactionId)
            .then(d => { if (vivo) setDados(d); })
            .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
        return () => { vivo = false; };
    }, [transactionId]);

    // Uma "tentativa" por supplier_payment_id, na ordem em que nasceram.
    const tentativas = useMemo(() => {
        if (!dados) return [];
        const porId = new Map<string, EventoPagamento[]>();
        for (const e of dados.eventos) {
            const lista = porId.get(e.supplier_payment_id) ?? [];
            lista.push(e);
            porId.set(e.supplier_payment_id, lista);
        }
        return [...porId.entries()].map(([id, eventos]) => {
            const atual = dados.pagamentos.find(p => p.id === id) ?? null;
            const ultimo = eventos[eventos.length - 1];
            const det = Object.assign({}, ...eventos.map(e => e.detalhe ?? {})) as EventoPagamento['detalhe'];
            return {
                id,
                eventos,
                tipo: atual?.payment_type ?? det.tipo,
                valor: atual?.value ?? ultimo.valor,
                favorecido: atual?.beneficiary_name ?? det.favorecido,
                origem: atual?.favorecido_origem ?? det.favorecido_origem,
                agendado: atual?.scheduled_date ?? det.agendado_para,
                status: atual?.status ?? ultimo.status_depois,
                comprovante: atual?.receipt_url ?? det.comprovante,
                excluido: !atual,
            };
        });
    }, [dados]);

    return (
        <Sheet open onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Histórico de pagamentos pela Asaas</SheetTitle>
                <SheetDescription>{descricao || 'Título a pagar'}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6 space-y-6">
                {!dados && !erro && (
                    <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
                )}
                {erro && <p className="text-sm text-red-700 bg-red-50 rounded-[6px] p-3">{erro}</p>}
                {dados && tentativas.length === 0 && (
                    <p className="text-sm text-gray-500">Nenhum pagamento pela Asaas registrado para este título.</p>
                )}

                {tentativas.map((t, i) => (
                    <section key={t.id} className="space-y-3">
                        <div>
                            <div className="flex items-baseline justify-between gap-3">
                                <h3 className="text-sm font-semibold text-gray-800">
                                    {tentativas.length > 1 ? `Tentativa ${i + 1} · ` : ''}{t.tipo === 'BILL' ? 'Boleto' : 'PIX'} de {formatMoney(t.valor)}
                                </h3>
                                <span className={`text-sm font-medium ${STATUS[t.status ?? '']?.cor ?? 'text-gray-600'}`}>{rotulo(t.status)}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {t.favorecido ? `Para ${t.favorecido}` : 'Favorecido não informado'}
                                {t.origem ? ` · ${ORIGEM[t.origem] ?? t.origem}` : ''}
                                {t.agendado ? ` · agendado para ${formatDateBR(t.agendado)}` : ''}
                                {t.excluido ? ' · registro excluído (o histórico fica)' : ''}
                            </p>
                            {t.comprovante && (
                                <a href={t.comprovante} target="_blank" rel="noreferrer"
                                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800">
                                    <ExternalLink className="w-3.5 h-3.5" /> Comprovante da Asaas
                                </a>
                            )}
                        </div>

                        <ol className="border-l border-gray-200 ml-1.5 space-y-3">
                            {t.eventos.map(e => (
                                <li key={e.id} className="pl-4 relative">
                                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-300" aria-hidden="true" />
                                    <p className="text-sm text-gray-800">{oQue(e)}</p>
                                    <p className="text-xs text-gray-500">
                                        {quando(e.created_at)} · por <span className="text-gray-700">{e.autor}</span>
                                    </p>
                                    {e.detalhe?.motivo && <p className="text-xs text-gray-600 mt-0.5">Motivo: {e.detalhe.motivo}</p>}
                                    {e.detalhe?.aguardando_token && <p className="text-xs text-amber-700 mt-0.5">A Asaas aguarda autorização por token.</p>}
                                </li>
                            ))}
                        </ol>
                    </section>
                ))}
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-gray-500 hover:text-gray-700 font-medium text-[13px] transition-all">
                    Fechar
                </button>
            </SheetFooter>
        </Sheet>
    );
}
