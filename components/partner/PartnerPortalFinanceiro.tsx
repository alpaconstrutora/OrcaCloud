import React from 'react';
import { AlertCircle, CalendarDays, HandCoins, Paperclip, Ruler } from 'lucide-react';
import {
    CardHeader, fmtBRL, fmtBRLCents, fmtDate, KpiItem, KpiStrip, parseDate, PillTone, PortalCard,
    PortalEmpty, PortalLoading, PortalTabs, SoftButton, StatusPill, Td, Th,
} from '../portal/PortalKit';
import { situacaoDaParcela } from '../../utils/situacaoParcelaParceiro';
import { rotuloRecibo } from '../../services/reciboPagamentoPortalService';

export interface ParcelaParceiro {
    id: string;
    transaction_date: string;
    amount: number;
    description: string | null;
    status: string;
    business_status: string | null;
    recibo_numero?: number | null;
}

export interface MedicaoParceiro {
    id: string;
    contract_id: string;
    number: number;
    period_start: string | null;
    period_end: string | null;
    status: string;
    total_value: number;
    retention_value: number;
    net_value: number;
    invoice_url: string | null;
}

export interface FinanceiroParceiro {
    contracts: { id: string; number: string; title: string | null }[];
    installments: ParcelaParceiro[];
    measurements: MedicaoParceiro[];
    retention: { retained: number; released: number; balance: number };
}

type Situacao = ReturnType<typeof situacaoDaParcela>;
export type SituacaoExibida = Situacao | 'VENCIDA';

/** Aberta com vencimento antes de hoje vira VENCIDA — o payload do parceiro não traz `effective_status`. */
export function situacaoExibida(p: ParcelaParceiro, hoje: Date = new Date()): SituacaoExibida {
    const s = situacaoDaParcela(p);
    if (s !== 'ABERTA') return s;
    const venc = parseDate(p.transaction_date);
    const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
    return venc && venc.getTime() < inicioDoDia ? 'VENCIDA' : 'ABERTA';
}

/** Mesmo vocabulário de `PAYABLE_STATUS` do Portal do Fornecedor. */
const PILL_PARCELA: Record<SituacaoExibida, { label: string; tone: PillTone }> = {
    PAGA:      { label: 'Pago',      tone: 'good' },
    VENCIDA:   { label: 'Vencido',   tone: 'accent' },
    ABERTA:    { label: 'Pendente',  tone: 'neutral' },
    CANCELADA: { label: 'Cancelado', tone: 'muted' },
};

const PILL_MEDICAO = (status: string): PillTone =>
    status === 'Paga' || status === 'Processada' ? 'good'
        : status === 'Cancelada' ? 'muted'
            : 'neutral';

/** Resumo da faixa de KPIs — puro, para o teste não depender de DOM. */
export function resumoFinanceiroParceiro(parcelas: ParcelaParceiro[], hoje: Date = new Date()) {
    let emAberto = 0, vencido = 0, recebido = 0;
    let proxima: ParcelaParceiro | null = null;
    let proximaTs = Infinity;
    for (const p of parcelas) {
        const valor = Number(p.amount ?? 0);
        const s = situacaoExibida(p, hoje);
        if (s === 'PAGA') { recebido += valor; continue; }
        if (s === 'CANCELADA') continue;
        emAberto += valor;
        if (s === 'VENCIDA') vencido += valor;
        const ts = parseDate(p.transaction_date)?.getTime();
        if (ts != null && ts < proximaTs) { proximaTs = ts; proxima = p; }
    }
    return { emAberto, vencido, recebido, proximoVencimento: proxima };
}

const FILTROS = [
    { id: 'todas',    label: 'Todas',     fn: (_s: SituacaoExibida) => true },
    { id: 'abertas',  label: 'Em aberto', fn: (s: SituacaoExibida) => s === 'ABERTA' || s === 'VENCIDA' },
    { id: 'vencidas', label: 'Vencidas',  fn: (s: SituacaoExibida) => s === 'VENCIDA' },
    { id: 'pagas',    label: 'Pagas',     fn: (s: SituacaoExibida) => s === 'PAGA' },
] as const;
type FiltroId = typeof FILTROS[number]['id'];

interface Props {
    financials: FinanceiroParceiro;
    loading: boolean;
    invoiceUploadError: string | null;
    erroRecibo: string | null;
    baixandoRecibo: string | null;
    onBaixarRecibo: (transactionId: string) => void;
    uploadingInvoiceFor: string | null;
    /** Pré-visualização do gestor: anexar NF só existe no acesso real do parceiro. */
    isPreview: boolean;
    onUploadInvoice: (measurementId: string, contractId: string, file: File) => void;
}

/**
 * Aba Financeiro do Portal do Parceiro (link público, app e prévia) — mesmo
 * vocabulário §24 da aba Financeiro do Portal do Fornecedor
 * (`components/supplier/portal/PortalFinanceiro.tsx`): faixa de KPIs, faixa do
 * próximo vencimento e tabela de parcelas com abas de filtro. Medições e retenção
 * são do contrato e não existem no fornecedor de pedidos, então ganham um card
 * próprio no mesmo vocabulário.
 */
const PartnerPortalFinanceiro: React.FC<Props> = ({
    financials, loading, invoiceUploadError, erroRecibo, baixandoRecibo, onBaixarRecibo,
    uploadingInvoiceFor, isPreview, onUploadInvoice,
}) => {
    const [filtro, setFiltro] = React.useState<FiltroId>('todas');

    const linhas = React.useMemo(() => {
        const hoje = new Date();
        return financials.installments
            .map(p => ({ p, situacao: situacaoExibida(p, hoje) }))
            // Vencimento crescente, como no Portal do Fornecedor (o payload vem do mais novo ao mais antigo).
            .sort((a, b) => (parseDate(a.p.transaction_date)?.getTime() ?? 0) - (parseDate(b.p.transaction_date)?.getTime() ?? 0));
    }, [financials.installments]);

    const resumo = React.useMemo(() => resumoFinanceiroParceiro(financials.installments), [financials.installments]);
    const ativo = FILTROS.find(f => f.id === filtro) ?? FILTROS[0];
    const visiveis = linhas.filter(l => ativo.fn(l.situacao));

    const contratoPorId = React.useMemo(
        () => new Map(financials.contracts.map(c => [c.id, c.number])),
        [financials.contracts],
    );

    const diasAte = (() => {
        const d = parseDate(resumo.proximoVencimento?.transaction_date);
        if (!d) return null;
        return Math.ceil((d.getTime() - Date.now()) / 86400000);
    })();

    const { retention } = financials;
    const kpis: KpiItem[] = [
        { label: 'Em aberto', value: fmtBRL(resumo.emAberto), ...(resumo.emAberto > 0 ? { delta: 'a receber', direction: 'flat' as const } : {}) },
        { label: 'Vencido', value: fmtBRL(resumo.vencido), ...(resumo.vencido > 0 ? { delta: 'em atraso', direction: 'down' as const } : {}) },
        { label: 'Recebido', value: fmtBRL(resumo.recebido) },
        {
            label: 'Próximo vencimento',
            value: resumo.proximoVencimento ? fmtDate(resumo.proximoVencimento.transaction_date) : '—',
            hint: diasAte != null ? (diasAte < 0 ? `${Math.abs(diasAte)} dias em atraso` : `em ${diasAte} dias`) : undefined,
        },
        {
            label: 'Saldo retido',
            value: fmtBRL(retention.balance),
            hint: `Acumulada ${fmtBRL(retention.retained)} · liberada ${fmtBRL(retention.released)}`,
        },
    ];

    if (loading) {
        return <PortalCard><PortalLoading label="Carregando financeiro..." /></PortalCard>;
    }

    return (
        <div className="space-y-3">
            {invoiceUploadError && (
                <PortalCard className="px-5 py-3.5 flex items-start gap-3 border-[#F3D9D1] bg-[#FDF8F6]">
                    <AlertCircle className="w-4 h-4 text-[#C24428] shrink-0 mt-0.5" />
                    <p className="text-[13px] text-[#C24428] flex-1">{invoiceUploadError}</p>
                </PortalCard>
            )}

            <KpiStrip items={kpis} data-tour="financeiro-kpis" />

            {resumo.proximoVencimento && (
                <PortalCard className="px-5 py-3.5 flex items-center gap-3">
                    <CalendarDays className="w-4 h-4 text-[#E1553C] shrink-0" />
                    <p className="text-[13px] text-[#4A505C]">
                        Próximo vencimento: <strong className="font-semibold text-[#1F2430]">{fmtBRLCents(Number(resumo.proximoVencimento.amount))}</strong>
                        {' '}em <strong className="font-semibold text-[#1F2430]">{fmtDate(resumo.proximoVencimento.transaction_date)}</strong>
                        {resumo.proximoVencimento.description ? ` · ${resumo.proximoVencimento.description}` : ''}
                    </p>
                </PortalCard>
            )}

            <PortalCard className="overflow-hidden" data-tour="financeiro-parcelas">
                <CardHeader title="Parcelas" subtitle="Parcelas dos seus contratos" />
                <PortalTabs
                    tabs={FILTROS.map(f => ({ id: f.id, label: f.label, count: linhas.filter(l => f.fn(l.situacao)).length }))}
                    active={filtro}
                    onChange={id => setFiltro(id as FiltroId)}
                />
                {erroRecibo && <p className="px-5 py-2 text-[13px] text-[#C24428]">{erroRecibo}</p>}
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                <Th>Parcela</Th>
                                <Th>Vencimento</Th>
                                <Th>Valor</Th>
                                <Th>Recibo</Th>
                                <Th>Status</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {visiveis.length === 0 ? (
                                <tr>
                                    <td colSpan={5}>
                                        <PortalEmpty
                                            icon={<HandCoins className="w-9 h-9" />}
                                            title={linhas.length === 0 ? 'Nenhuma parcela encontrada' : 'Nenhuma parcela neste filtro'}
                                        />
                                    </td>
                                </tr>
                            ) : visiveis.map(({ p, situacao }) => {
                                const st = PILL_PARCELA[situacao];
                                return (
                                    <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                                        <Td className="text-[#1F2430]">{p.description || 'Parcela do contrato'}</Td>
                                        <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(p.transaction_date)}</Td>
                                        <Td className="text-[#1F2430] font-medium tabular-nums whitespace-nowrap">{fmtBRLCents(Number(p.amount))}</Td>
                                        <Td className="whitespace-nowrap">
                                            {situacao === 'PAGA' && p.recibo_numero != null ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onBaixarRecibo(p.id)}
                                                    disabled={baixandoRecibo === p.id}
                                                    title="Baixar o recibo deste pagamento"
                                                    className="font-medium text-[#C24428] hover:text-[#E1553C] transition-colors disabled:opacity-50"
                                                >
                                                    {baixandoRecibo === p.id ? 'Baixando…' : rotuloRecibo(p.recibo_numero)}
                                                </button>
                                            ) : <span className="text-[#8A8F9A]">—</span>}
                                        </Td>
                                        <Td><StatusPill tone={st.tone}>{st.label}</StatusPill></Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </PortalCard>

            <PortalCard className="overflow-hidden" data-tour="financeiro-medicoes">
                <CardHeader title="Medições" subtitle="Saldo a faturar e nota fiscal de cada medição" />
                <div className="overflow-x-auto border-t border-[#ECECEF]">
                    <table className="w-full min-w-[820px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                <Th>Medição</Th>
                                <Th>Contrato</Th>
                                <Th>Período</Th>
                                <Th>Bruto</Th>
                                <Th>Retenção</Th>
                                <Th>Líquido</Th>
                                <Th>Nota fiscal</Th>
                                <Th>Status</Th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {financials.measurements.length === 0 ? (
                                <tr>
                                    <td colSpan={8}>
                                        <PortalEmpty icon={<Ruler className="w-9 h-9" />} title="Nenhuma medição registrada" />
                                    </td>
                                </tr>
                            ) : financials.measurements.map(m => (
                                <tr key={m.id} className="hover:bg-gray-50/70 transition-colors">
                                    <Td className="text-[#1F2430] whitespace-nowrap">Nº {m.number}</Td>
                                    <Td className="text-[#8A8F9A] whitespace-nowrap">{contratoPorId.get(m.contract_id) ?? '—'}</Td>
                                    <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(m.period_start)} – {fmtDate(m.period_end)}</Td>
                                    <Td className="text-[#1F2430] tabular-nums whitespace-nowrap">{fmtBRLCents(Number(m.total_value))}</Td>
                                    <Td className="text-[#8A8F9A] tabular-nums whitespace-nowrap">{fmtBRLCents(Number(m.retention_value))}</Td>
                                    <Td className="text-[#1F2430] font-medium tabular-nums whitespace-nowrap">{fmtBRLCents(Number(m.net_value))}</Td>
                                    <Td className="whitespace-nowrap">
                                        {m.invoice_url ? (
                                            <a href={m.invoice_url} target="_blank" rel="noreferrer" className="font-medium text-[#C24428] hover:text-[#E1553C] transition-colors">Ver nota</a>
                                        ) : isPreview ? (
                                            <span className="text-[#8A8F9A]" title="Anexar NF só existe no acesso real do parceiro">—</span>
                                        ) : (
                                            <SoftButton
                                                type="button"
                                                data-tour="financeiro-anexar-nf"
                                                className="relative overflow-hidden h-8 px-3"
                                                disabled={uploadingInvoiceFor === m.id}
                                            >
                                                <Paperclip className="w-3.5 h-3.5" />
                                                {uploadingInvoiceFor === m.id ? 'Enviando...' : 'Anexar NF'}
                                                {/* O input cobre o botão inteiro: clique em qualquer ponto abre o seletor. */}
                                                <input
                                                    type="file"
                                                    aria-label={`Anexar NF da medição ${m.number}`}
                                                    className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-default"
                                                    disabled={uploadingInvoiceFor === m.id}
                                                    onChange={e => {
                                                        const file = e.target.files?.[0];
                                                        e.target.value = '';
                                                        if (file) onUploadInvoice(m.id, m.contract_id, file);
                                                    }}
                                                />
                                            </SoftButton>
                                        )}
                                    </Td>
                                    <Td><StatusPill tone={PILL_MEDICAO(m.status)}>{m.status}</StatusPill></Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </PortalCard>
        </div>
    );
};

export default PartnerPortalFinanceiro;
