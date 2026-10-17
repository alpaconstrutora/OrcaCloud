import React from 'react';
import { AlertCircle, Ban, CalendarDays, CheckCircle2, Clock, FileText, Paperclip, Ruler, TrendingUp } from 'lucide-react';
import { parseDate } from '../portal/PortalKit';
import {
    CarregandoLista, ExpandableItem, ExpandableList, FaixaAviso, FilterChips, KpiProgressCard, MarcoLinha,
    RodapeDoItem, SecaoDoItem, StaticItem, StatusBadge, BOTAO_SECUNDARIO, LINK_DE_ACAO, dataBR, moedaBR, percentual,
    type ChipDeFiltro, type SituacaoVisual, type TomMarco,
} from '../portal/PortalCardsKit';
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
    /** Contrato dono da parcela (prefixo do `reference_id`, desde aplicar_20271017900000). */
    contract_id?: string | null;
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

/** Resumo dos KPIs — puro, para o teste não depender de DOM. `total` = tudo menos o cancelado. */
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
    return { total: emAberto + recebido, emAberto, vencido, recebido, proximoVencimento: proxima };
}

export type SituacaoDoContrato = 'QUITADO' | 'EM_ATRASO' | 'EM_DIA' | 'CANCELADO';

export interface GrupoDoContrato {
    /** id do contrato, ou `SEM_CONTRATO` para parcela sem contrato identificado. */
    id: string;
    numero: string;
    titulo: string | null;
    /** Vencimento crescente. */
    linhas: { p: ParcelaParceiro; situacao: SituacaoExibida }[];
    total: number;
    recebido: number;
    pagas: number;
    vencidas: number;
    proximoVencimento: string | null;
    situacao: SituacaoDoContrato;
}

export const SEM_CONTRATO = '__sem_contrato__';

const tsDe = (p: ParcelaParceiro) => parseDate(p.transaction_date)?.getTime() ?? 0;

/**
 * Um grupo por contrato, na ordem dos contratos do payload; parcela sem
 * `contract_id` (ou de contrato fora da lista) vai para "Outras parcelas", no
 * fim. Contrato sem parcela nenhuma não vira grupo. Puro, para o teste.
 */
export function agruparParcelasPorContrato(
    parcelas: ParcelaParceiro[],
    contratos: FinanceiroParceiro['contracts'],
    hoje: Date = new Date(),
): GrupoDoContrato[] {
    const conhecidos = new Set(contratos.map(c => c.id));
    const porId = new Map<string, ParcelaParceiro[]>();
    for (const p of parcelas) {
        const id = p.contract_id && conhecidos.has(p.contract_id) ? p.contract_id : SEM_CONTRATO;
        porId.set(id, [...(porId.get(id) ?? []), p]);
    }
    const cabecalhos = [
        ...contratos.map(c => ({ id: c.id, numero: c.number, titulo: c.title })),
        { id: SEM_CONTRATO, numero: 'Outras parcelas', titulo: null },
    ];
    return cabecalhos.flatMap(c => {
        const doContrato = porId.get(c.id);
        if (!doContrato?.length) return [];
        const linhas = doContrato
            .map(p => ({ p, situacao: situacaoExibida(p, hoje) }))
            .sort((a, b) => tsDe(a.p) - tsDe(b.p));
        let total = 0, recebido = 0, pagas = 0, vencidas = 0, abertas = 0;
        let proximoVencimento: string | null = null;
        for (const { p, situacao } of linhas) {
            if (situacao === 'CANCELADA') continue;
            const valor = Number(p.amount ?? 0);
            total += valor;
            if (situacao === 'PAGA') { recebido += valor; pagas++; continue; }
            abertas++;
            if (situacao === 'VENCIDA') vencidas++;
            // linhas já em ordem crescente: a primeira em aberto é a próxima
            if (proximoVencimento == null) proximoVencimento = p.transaction_date;
        }
        const situacao: SituacaoDoContrato =
            pagas + abertas === 0 ? 'CANCELADO'
                : vencidas > 0 ? 'EM_ATRASO'
                    : abertas === 0 ? 'QUITADO'
                        : 'EM_DIA';
        return [{ ...c, linhas, total, recebido, pagas, vencidas, proximoVencimento, situacao }];
    });
}

// ── Vocabulário visual (Corretor › Comissões) ─────────────────────────────────
const SITUACAO_DO_CONTRATO: Record<SituacaoDoContrato, SituacaoVisual> = {
    QUITADO:   { label: 'Quitado',   color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
    EM_ATRASO: { label: 'Em atraso', color: 'text-red-600',     bg: 'bg-red-50',     icon: AlertCircle },
    EM_DIA:    { label: 'Em dia',    color: 'text-blue-600',    bg: 'bg-blue-50',    icon: Clock },
    CANCELADO: { label: 'Cancelado', color: 'text-gray-500',    bg: 'bg-gray-50',    icon: Ban },
};

const TOM_DA_PARCELA: Record<SituacaoExibida, TomMarco> = {
    PAGA: 'feito', VENCIDA: 'atrasado', ABERTA: 'pendente', CANCELADA: 'cancelado',
};

const SITUACAO_DA_MEDICAO = (status: string): SituacaoVisual =>
    status === 'Paga' || status === 'Processada' ? { label: status, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 }
        : status === 'Cancelada' ? { label: status, color: 'text-gray-500', bg: 'bg-gray-50', icon: Ban }
            : { label: status, color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock };

type FiltroId = 'abertas' | 'vencidas' | 'pagas';

const FILTROS: (Omit<ChipDeFiltro<FiltroId>, 'count'> & { fn: (s: SituacaoExibida) => boolean; titulo: string })[] = [
    { id: 'abertas',  label: 'A vencer', color: 'text-blue-600',    bg: 'bg-blue-50',    icon: Clock,        fn: s => s === 'ABERTA',  titulo: 'Parcelas a vencer' },
    { id: 'vencidas', label: 'Vencidas', color: 'text-red-600',     bg: 'bg-red-50',     icon: AlertCircle,  fn: s => s === 'VENCIDA', titulo: 'Parcelas vencidas' },
    { id: 'pagas',    label: 'Pagas',    color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2, fn: s => s === 'PAGA',    titulo: 'Parcelas pagas' },
];

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

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
 * Aba Financeiro do Portal do Parceiro (link público, app e prévia) — desde
 * 2026-10-17 no desenho da aba Comissões do Portal do Corretor
 * (`components/broker/BrokerCommissions.tsx`), pelo kit compartilhado
 * `components/portal/PortalCardsKit.tsx`: cards KPI com barra, chips de
 * situação e um cartão por contrato que abre e mostra as parcelas. Medições
 * ficam na mesma lista de cartões, com a ação de NF sempre à vista.
 * Plano: docs/planos/2026-10-17-parceiro-financeiro-visual-corretor.md.
 */
const PartnerPortalFinanceiro: React.FC<Props> = ({
    financials, loading, invoiceUploadError, erroRecibo, baixandoRecibo, onBaixarRecibo,
    uploadingInvoiceFor, isPreview, onUploadInvoice,
}) => {
    const [filtro, setFiltro] = React.useState<FiltroId | 'all'>('all');

    const grupos = React.useMemo(
        () => agruparParcelasPorContrato(financials.installments, financials.contracts),
        [financials.installments, financials.contracts],
    );
    const resumo = React.useMemo(() => resumoFinanceiroParceiro(financials.installments), [financials.installments]);

    // Com um contrato só, o cartão já nasce aberto — fechado, a aba mostraria só um cabeçalho.
    const [abertos, setAbertos] = React.useState<Set<string>>(new Set());
    const unicoContrato = grupos.length === 1 ? grupos[0].id : null;
    React.useEffect(() => {
        if (unicoContrato) setAbertos(new Set([unicoContrato]));
    }, [unicoContrato]);
    const alternar = (id: string) => setAbertos(prev => {
        const novo = new Set(prev);
        if (novo.has(id)) novo.delete(id); else novo.add(id);
        return novo;
    });

    const todasAsLinhas = grupos.flatMap(g => g.linhas);
    const ativo = FILTROS.find(f => f.id === filtro);
    const visiveis = grupos
        .map(g => ({ g, linhas: ativo ? g.linhas.filter(l => ativo.fn(l.situacao)) : g.linhas }))
        .filter(x => x.linhas.length > 0);

    const contratoPorId = React.useMemo(
        () => new Map(financials.contracts.map(c => [c.id, c.number])),
        [financials.contracts],
    );

    const diasAte = (() => {
        const d = parseDate(resumo.proximoVencimento?.transaction_date);
        if (!d) return null;
        return Math.ceil((d.getTime() - Date.now()) / 86400000);
    })();

    if (loading) return <CarregandoLista label="Carregando financeiro..." />;

    const { retention } = financials;

    return (
        <div className="space-y-6">
            {invoiceUploadError && <FaixaAviso icon={AlertCircle} erro>{invoiceUploadError}</FaixaAviso>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-tour="financeiro-kpis">
                <KpiProgressCard label="Total dos contratos" value={moedaBR(resumo.total)} icon={TrendingUp} tone="gray" percent={100} />
                <KpiProgressCard label="Recebido" value={moedaBR(resumo.recebido)} icon={CheckCircle2} tone="emerald" percent={percentual(resumo.recebido, resumo.total)} />
                <KpiProgressCard label="Em aberto" value={moedaBR(resumo.emAberto)} icon={Clock} tone="blue" percent={percentual(resumo.emAberto, resumo.total)} />
                <KpiProgressCard label="Vencido" value={moedaBR(resumo.vencido)} icon={AlertCircle} tone="red" percent={percentual(resumo.vencido, resumo.total)} />
            </div>

            {resumo.proximoVencimento && (
                <FaixaAviso icon={CalendarDays}>
                    Próximo vencimento: <strong className="font-bold text-gray-900">{moedaBR(Number(resumo.proximoVencimento.amount))}</strong>
                    {' '}em <strong className="font-bold text-gray-900">{dataBR(resumo.proximoVencimento.transaction_date)}</strong>
                    {diasAte != null && diasAte < 0 && <span className="text-red-600"> · {plural(Math.abs(diasAte), 'dia', 'dias')} em atraso</span>}
                    {diasAte != null && diasAte >= 0 && <> · em {plural(diasAte, 'dia', 'dias')}</>}
                    {resumo.proximoVencimento.description ? ` · ${resumo.proximoVencimento.description}` : ''}
                </FaixaAviso>
            )}

            <FilterChips
                total={todasAsLinhas.length}
                chips={FILTROS.map(f => ({ ...f, count: todasAsLinhas.filter(l => f.fn(l.situacao)).length }))}
                active={filtro}
                onChange={setFiltro}
            />

            {erroRecibo && <FaixaAviso icon={AlertCircle} erro>{erroRecibo}</FaixaAviso>}

            <ExpandableList
                data-tour="financeiro-parcelas"
                titulo="Parcelas"
                subtitulo="Um cartão por contrato — abra para ver cada parcela"
                vazio={visiveis.length === 0 ? (todasAsLinhas.length === 0 ? 'Nenhuma parcela encontrada.' : 'Nenhuma parcela neste filtro.') : null}
            >
                {visiveis.map(({ g, linhas }) => (
                    <ExpandableItem
                        key={g.id}
                        icon={FileText}
                        expanded={abertos.has(g.id)}
                        onToggle={() => alternar(g.id)}
                        title={<>{g.numero}{g.titulo ? ` • ${g.titulo}` : ''}</>}
                        subtitle={<>
                            {plural(g.linhas.length, 'parcela', 'parcelas')} • {plural(g.pagas, 'paga', 'pagas')}
                            {g.vencidas > 0 ? ` • ${plural(g.vencidas, 'vencida', 'vencidas')}` : ''}
                            {g.proximoVencimento ? ` • próximo vencimento ${dataBR(g.proximoVencimento)}` : ''}
                        </>}
                        value={moedaBR(g.total)}
                        badge={<StatusBadge situacao={SITUACAO_DO_CONTRATO[g.situacao]} />}
                    >
                        <SecaoDoItem titulo={`${ativo?.titulo ?? 'Parcelas'} (${linhas.length})`}>
                            {linhas.map(({ p, situacao }) => (
                                <MarcoLinha
                                    key={p.id}
                                    tone={TOM_DA_PARCELA[situacao]}
                                    name={p.description || 'Parcela do contrato'}
                                    date={p.transaction_date}
                                    value={moedaBR(Number(p.amount))}
                                    extra={situacao === 'PAGA' && p.recibo_numero != null ? (
                                        <button
                                            type="button"
                                            onClick={() => onBaixarRecibo(p.id)}
                                            disabled={baixandoRecibo === p.id}
                                            title="Baixar o recibo deste pagamento"
                                            className={LINK_DE_ACAO}
                                        >
                                            {baixandoRecibo === p.id ? 'Baixando…' : rotuloRecibo(p.recibo_numero)}
                                        </button>
                                    ) : undefined}
                                />
                            ))}
                        </SecaoDoItem>
                        <RodapeDoItem linhas={[
                            { label: 'Total do contrato', value: moedaBR(g.total) },
                            { label: 'Recebido', value: moedaBR(g.recebido) },
                        ]} />
                    </ExpandableItem>
                ))}
            </ExpandableList>

            <ExpandableList
                data-tour="financeiro-medicoes"
                titulo="Medições"
                subtitulo="Valor bruto, retenção, líquido e nota fiscal de cada medição"
                direita={
                    <div className="text-right">
                        <p className="text-xs text-gray-400">Saldo retido</p>
                        <p className="text-sm font-black text-gray-900">{moedaBR(retention.balance)}</p>
                        <p className="text-xs text-gray-400">Acumulada {moedaBR(retention.retained)} • liberada {moedaBR(retention.released)}</p>
                    </div>
                }
                vazio={financials.measurements.length === 0 ? 'Nenhuma medição registrada.' : null}
            >
                {financials.measurements.map(m => (
                    <StaticItem
                        key={m.id}
                        icon={Ruler}
                        title={<>Medição Nº {m.number}{contratoPorId.get(m.contract_id) ? ` • ${contratoPorId.get(m.contract_id)}` : ''}</>}
                        subtitle={<>
                            {dataBR(m.period_start)} – {dataBR(m.period_end)}
                            {' • '}Bruto {moedaBR(Number(m.total_value))} • Retenção {moedaBR(Number(m.retention_value))}
                        </>}
                        value={moedaBR(Number(m.net_value))}
                        badge={<StatusBadge situacao={SITUACAO_DA_MEDICAO(m.status)} />}
                        acao={m.invoice_url ? (
                            <a href={m.invoice_url} target="_blank" rel="noreferrer" className={LINK_DE_ACAO}>Ver nota</a>
                        ) : isPreview ? (
                            <span className="text-xs text-gray-400" title="Anexar NF só existe no acesso real do parceiro">—</span>
                        ) : (
                            <span
                                data-tour="financeiro-anexar-nf"
                                className={`relative overflow-hidden ${BOTAO_SECUNDARIO} ${uploadingInvoiceFor === m.id ? 'opacity-60' : ''}`}
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
                            </span>
                        )}
                    />
                ))}
            </ExpandableList>
        </div>
    );
};

export default PartnerPortalFinanceiro;
