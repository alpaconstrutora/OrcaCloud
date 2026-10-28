import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import {
    Landmark, ArrowDownLeft, ArrowUpRight, ClipboardCheck,
    ChevronLeft, ChevronRight, ArrowRight,
} from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import { usePersistedState } from './ui/TableUtils';
import { useOrgContext } from '../hooks/useOrgContext';
import { approvalService } from '../services/approvalService';
import {
    financialOverviewService, type DashboardHoje, type DashboardPeriodo,
} from '../services/financialOverviewService';
import {
    LIMIAR, ROTULO_PERIODO, type Periodo, limitesDoPeriodo, resumoDosBancos, tomDoSaldo,
    legendaDoSaldo, tomPorLimiar, dataBR, mesCurto, mesAno,
} from '../lib/dashboardFinanceiro';
import {
    moneyBRL, compactAxis, niceTicks, plural, GRID, TICK, CATEGORY_TICK, TOOLTIP_STYLE,
    TOOLTIP_CURSOR, INITIAL_DIMENSION, END_LABEL, SERIE_PRINCIPAL, SERIE_CONTEXTO,
    ChartCard, ChartEmpty, ChartSourceState, Legend, type AnalysisSourceState,
} from './analysis/chartKit';

/**
 * Dashboard financeiro — duas leituras empilhadas (guia §4.5 / §4.5.1):
 *   • "Hoje": vencido, saldo do banco, aprovação e o que vence em 7/30 dias — não
 *     depende do período;
 *   • "Resultado do período": o que entrou e saiu, e quem mais recebe.
 * Plano: docs/planos/2026-10-28-dashboard-financeiro-hoje-e-periodo.md
 *
 * Detalhe por obra e projeção de 90 dias moram na Inteligência Financeira: aqui só o link.
 */

interface FinancialDashboardProps {
    onNavigate?: (view: string) => void;
}

/** Mesma chave do `usePersistedState` de FinancialIntelligence.tsx — abrir a Inteligência
 *  já na aba certa. Se a chave mudar lá, o link só cai na última aba visitada. */
const CHAVE_ABA_INTELIGENCIA = 'financialIntelligence:tab';

/** Até quantos meses com movimento o gráfico vira lista (guia §28.5). */
const POUCOS_MESES = 2;

/** Moeda com sinal: "+R$ 300" / "−R$ 300" (o hífen do Intl vira o menos tipográfico). */
const moedaComSinal = (v: number) => `${v > 0 ? '+' : ''}${moneyBRL(v).replace('-', '−')}`;
/** Eixo de valor em moeda compacta (guia §28.2): "R$ 400 mil". */
const eixoBRL = (v: number) => (v === 0 ? '0' : `R$ ${compactAxis(v)}`);
/** O Recharts quebra o texto do tick/rótulo na largura do eixo ou da barra ("R$ 532" /
 *  "mil" em três linhas numa coluna de 14px): estes desenham o texto inteiro, sem quebra. */
const TickBRL: React.FC<{ x?: number; y?: number; payload?: { value: number } }> = ({ x = 0, y = 0, payload }) => (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={TICK.fontSize} fill={TICK.fill}>{eixoBRL(payload?.value ?? 0)}</text>
);
/** Coluna abaixo disto (fração do maior valor da escala) não se vê: sem rótulo solto. */
const COLUNA_VISIVEL = 0.03;
/** Rótulo na ponta: nos meses do período sempre (é deles que a faixa fala); fora dele, só
 *  quando a coluna aparece — o valor de uma coluna visível não pode morar só no tooltip
 *  (§28.3), e um "R$ 1 mil" sobre coluna invisível flutua no vazio. */
const rotuloNaPonta = (noPeriodo: boolean[], max: number) => (p: { x?: number | string; y?: number | string; width?: number | string; value?: unknown; index?: number }) => {
    const v = Number(p.value);
    if (!(v > 0) || !(noPeriodo[p.index ?? -1] || v >= max * COLUNA_VISIVEL)) return null;
    return (
        <text x={Number(p.x ?? 0) + Number(p.width ?? 0) / 2} y={Number(p.y ?? 0) - 6} textAnchor="middle" fontSize={11} fill={END_LABEL.fill}>
            {eixoBRL(v)}
        </text>
    );
};
/** Mês fora do período escolhido: mesma cor, recessiva — a cor cheia é o período. */
const OPACIDADE_FORA_DO_PERIODO = 0.35;
const encurtar = (s: string, max = 24) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const FaixaTitulo: React.FC<{ id: string; titulo: string; resumo?: string; children?: React.ReactNode }> = ({ id, titulo, resumo, children }) => (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={id} className="text-base font-semibold text-gray-900">
            {titulo}
            {resumo && <span className="font-normal text-gray-500"> · {resumo}</span>}
        </h2>
        {children}
    </div>
);

const LinkDeAcao: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
        {children}
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
);

/** Esqueleto de uma fileira de cartões enquanto a faixa carrega. */
const CartoesCarregando: React.FC<{ quantos: number; altura: string; grade: string; rotulo: string }> = ({ quantos, altura, grade, rotulo }) => (
    <div className={`grid gap-3 ${grade}`} aria-busy="true" aria-label={rotulo}>
        {Array.from({ length: quantos }, (_, i) => (
            <div key={i} className={`bg-white rounded-xl border border-gray-200 px-4 py-3.5 ${altura}`}>
                <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
                <div className="h-6 w-2/3 rounded bg-gray-100 animate-pulse mt-3" />
                <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse mt-3" />
            </div>
        ))}
    </div>
);

const FalhaDaFaixa: React.FC<{ oQue: string; onRetry: () => void }> = ({ oQue, onRetry }) => (
    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm px-4 py-6 text-sm text-gray-600 text-center">
        Não foi possível carregar {oQue}.{' '}
        <button type="button" onClick={onRetry} className="text-blue-600 hover:text-blue-800 font-medium rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Tentar de novo</button>
    </div>
);

// ─── Gráficos ────────────────────────────────────────────────────────────────

const EntrouSaiu: React.FC<{ dados: DashboardPeriodo; desde: string; ate: string; periodoDe: string; rotuloPeriodo: string }> = ({ dados, desde, ate, periodoDe, rotuloPeriodo }) => {
    // A série do banco vai até o fim do período; mês que ainda não começou sai (não é zero).
    const meses = dados.meses.filter(m => m.mes >= desde && m.mes <= ate);
    // O gráfico mostra no mínimo 6 meses; os que são do período escolhido ficam em cor cheia.
    const inicioDoPeriodo = `${periodoDe.slice(0, 7)}-01`;
    const serie = meses.map(m => ({ label: mesCurto(m.mes), Recebido: m.recebido, Pago: m.pago, noPeriodo: m.mes >= inicioDoPeriodo }));
    const todosNoPeriodo = serie.every(m => m.noPeriodo);
    const doPeriodo = meses.filter(m => m.mes >= inicioDoPeriodo);
    const comMovimento = meses.filter(m => m.recebido > 0 || m.pago > 0);
    const intervalo = `${mesCurto(desde)} a ${mesCurto(ate)}`;

    if (comMovimento.length === 0) {
        return <ChartEmpty>Nada recebido nem pago de {intervalo}.</ChartEmpty>;
    }
    if (comMovimento.length <= POUCOS_MESES) {
        // Uma ou duas colunas num eixo de 6+ meses é gráfico vazio: vira lista.
        return (
            <ul className="divide-y divide-gray-100 text-sm">
                {comMovimento.map(m => (
                    <li key={m.mes} className="flex items-center justify-between gap-4 py-2.5">
                        <span className="text-gray-700">{mesCurto(m.mes)}</span>
                        <span className="text-gray-500 tabular-nums">
                            recebido <span className="font-medium text-gray-800">{moneyBRL(m.recebido)}</span>
                            {' · '}pago <span className="font-medium text-gray-800">{moneyBRL(m.pago)}</span>
                        </span>
                    </li>
                ))}
            </ul>
        );
    }
    const max = Math.max(...meses.map(m => Math.max(m.recebido, m.pago)));
    return (
        <>
            <Legend items={[{ label: 'Recebido', color: SERIE_PRINCIPAL }, { label: 'Pago', color: SERIE_CONTEXTO }]} />
            {!todosNoPeriodo && (
                <p className="text-xs text-gray-500 mb-2 first-letter:uppercase">Em cor cheia, os meses de {rotuloPeriodo}; os anteriores, para comparar.</p>
            )}
            <div
                style={{ height: 220 }}
                role="img"
                aria-label={`Recebido e pago por mês, ${intervalo}: ${meses.map(m => `${mesCurto(m.mes)}, recebido ${moneyBRL(m.recebido)}, pago ${moneyBRL(m.pago)}`).join('; ')}.`}
            >
                <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                    <BarChart accessibilityLayer={false} data={serie} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barGap={2}>
                        <CartesianGrid vertical={false} stroke={GRID} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={TICK} />
                        <YAxis axisLine={false} tickLine={false} tick={<TickBRL />} ticks={niceTicks(max)} width={80} />
                        <RechartsTooltip cursor={TOOLTIP_CURSOR} contentStyle={TOOLTIP_STYLE} formatter={(v) => moneyBRL(Number(v))} />
                        {/* Rótulo direto só na série principal (§28.3), e só onde há valor. */}
                        <Bar
                            dataKey="Recebido"
                            fill={SERIE_PRINCIPAL}
                            radius={[4, 4, 0, 0]}
                            barSize={14}
                            isAnimationActive={false}
                            label={rotuloNaPonta(serie.map(m => m.noPeriodo), max)}
                        >
                            {serie.map(m => <Cell key={m.label} fillOpacity={m.noPeriodo ? 1 : OPACIDADE_FORA_DO_PERIODO} />)}
                        </Bar>
                        <Bar dataKey="Pago" fill={SERIE_CONTEXTO} radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={false}>
                            {serie.map(m => <Cell key={m.label} fillOpacity={m.noPeriodo ? 1 : OPACIDADE_FORA_DO_PERIODO} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {/* Mês e Trimestre: os valores do período por extenso. Movimento pequeno some na
                escala de um mês grande (R$ 300 ao lado de R$ 532 mil) — aqui ele é lido. */}
            {doPeriodo.length > 0 && doPeriodo.length <= 3 && (
                <ul className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-sm" aria-label={`Valores de ${rotuloPeriodo}`}>
                    {doPeriodo.map(m => (
                        <li key={m.mes} className="flex flex-wrap items-baseline justify-between gap-x-4">
                            <span className="text-gray-700">{mesCurto(m.mes)}</span>
                            <span className="text-gray-500 tabular-nums">
                                recebido <span className="font-medium text-gray-800">{moneyBRL(m.recebido)}</span>
                                {' · '}pago <span className="font-medium text-gray-800">{moneyBRL(m.pago)}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
};

const MaioresCredores: React.FC<{ dados: DashboardPeriodo }> = ({ dados }) => {
    if (dados.credores.length === 0) {
        return (
            <ChartEmpty>
                {dados.sem_fornecedor_qtd > 0
                    ? 'Nenhum título a pagar deste período tem fornecedor informado.'
                    : 'Nenhum título a pagar vence neste período.'}
            </ChartEmpty>
        );
    }
    const linhas = dados.credores.map(c => ({ label: encurtar(c.nome), nome: c.nome, value: c.valor, qtd: c.qtd }));
    return (
        <div
            style={{ height: linhas.length * 32 + 8 }}
            role="img"
            aria-label={`Maiores credores do período: ${linhas.map(l => `${l.nome}, ${moneyBRL(l.value)}`).join('; ')}.`}
        >
            <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                {/* Sem grade: o eixo de valor está escondido e o rótulo na ponta já diz o número. */}
                <BarChart accessibilityLayer={false} data={linhas} layout="vertical" margin={{ top: 0, right: 96, bottom: 0, left: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="label" width={176} axisLine={false} tickLine={false} tick={CATEGORY_TICK} />
                    <RechartsTooltip
                        cursor={TOOLTIP_CURSOR}
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(_, p) => (p?.[0]?.payload as { nome?: string } | undefined)?.nome ?? ''}
                        formatter={(v, _, p) => [`${moneyBRL(Number(v))} · ${plural((p?.payload as { qtd: number }).qtd, 'título', 'títulos')}`, 'A pagar']}
                    />
                    <Bar
                        dataKey="value"
                        fill={SERIE_PRINCIPAL}
                        radius={[0, 4, 4, 0]}
                        barSize={16}
                        isAnimationActive={false}
                        label={{ ...END_LABEL, formatter: (v: unknown) => moneyBRL(Number(v)) }}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

// ─── Tela ────────────────────────────────────────────────────────────────────

const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ onNavigate }) => {
    const { orgId } = useOrgContext();
    const ir = useCallback((view: string) => onNavigate?.(view), [onNavigate]);
    const abrirInteligencia = (aba: 'obras' | 'projecao') => {
        try { localStorage.setItem(CHAVE_ABA_INTELIGENCIA, JSON.stringify(aba)); } catch { /* sem storage: abre na última aba */ }
        ir('financial-intelligence');
    };

    // ── Hoje ──
    const [hoje, setHoje] = useState<DashboardHoje | null>(null);
    const [hojeEstado, setHojeEstado] = useState<AnalysisSourceState>('loading');
    // null = não carregou (falhou): o card mostra "—", nunca "0 itens".
    const [aprovacao, setAprovacao] = useState<{ qtd: number; soma: number } | null>(null);
    const pedidoHoje = useRef(0);

    const carregarHoje = useCallback(async () => {
        const pedido = ++pedidoHoje.current;
        // Zera antes: trocar de organização não pode deixar à mostra os números da anterior.
        setHoje(null);
        setHojeEstado('loading');
        const [h, a] = await Promise.allSettled([
            financialOverviewService.getToday(orgId),
            approvalService.getPendingSummary(orgId),
        ]);
        if (pedido !== pedidoHoje.current) return; // trocou a organização no meio
        if (h.status === 'fulfilled') {
            setHoje(h.value);
            setHojeEstado('ready');
        } else {
            console.error('[FinancialDashboard] hoje:', h.reason);
            setHojeEstado('error');
        }
        setAprovacao(a.status === 'fulfilled'
            ? { qtd: a.value.reduce((s, x) => s + Number(x.qtd), 0), soma: a.value.reduce((s, x) => s + Number(x.soma), 0) }
            : null);
    }, [orgId]);

    useEffect(() => { void carregarHoje(); }, [carregarHoje]);

    // ── Período ──
    const [periodo, setPeriodo] = usePersistedState<Periodo>('financialDashboard:periodo', 'month');
    const [offset, setOffset] = useState(0);
    const limites = limitesDoPeriodo(periodo, offset, new Date());
    const [dados, setDados] = useState<DashboardPeriodo | null>(null);
    const [periodoEstado, setPeriodoEstado] = useState<AnalysisSourceState>('loading');
    const pedidoPeriodo = useRef(0);

    const carregarPeriodo = useCallback(async () => {
        const pedido = ++pedidoPeriodo.current;
        setDados(null);
        setPeriodoEstado('loading');
        try {
            const d = await financialOverviewService.getPeriod(orgId, limites.from, limites.to, limites.mesesDesde);
            if (pedido !== pedidoPeriodo.current) return;
            setDados(d);
            setPeriodoEstado('ready');
        } catch (e) {
            if (pedido !== pedidoPeriodo.current) return;
            console.error('[FinancialDashboard] período:', e);
            setPeriodoEstado('error');
        }
    }, [orgId, limites.from, limites.to, limites.mesesDesde]);

    useEffect(() => { void carregarPeriodo(); }, [carregarPeriodo]);

    const bancos = hoje ? resumoDosBancos(hoje.contas, hoje.hoje) : null;
    const tomSaldo = bancos ? tomDoSaldo(bancos) : 'neutro';
    const resultado = dados ? dados.recebido - dados.pago : 0;

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard financeiro</h1>
                {/* gray-500, não o gray-400 do §20: 2,6:1 fica abaixo do AA (ver §4.5.1). */}
                <p className="text-gray-500 text-sm mt-1.5 font-medium">O que está vencido, o que vence e o que entrou e saiu no período.</p>
            </div>

            {/* ── Hoje: não depende do período ── */}
            <section aria-labelledby="dash-hoje" className="space-y-3">
                <FaixaTitulo id="dash-hoje" titulo="Hoje" resumo={hoje ? dataBR(hoje.hoje) : undefined}>
                    <LinkDeAcao onClick={() => abrirInteligencia('projecao')}>Projeção de caixa de 90 dias</LinkDeAcao>
                </FaixaTitulo>

                {hojeEstado === 'error' && !hoje ? (
                    <FalhaDaFaixa oQue="a posição de hoje" onRetry={carregarHoje} />
                ) : !hoje || !bancos ? (
                    // As duas fileiras: sem a segunda, a faixa do período pulava ~90px ao chegar o dado.
                    <div className="space-y-3">
                        <CartoesCarregando quantos={4} altura="h-[132px]" grade="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" rotulo="Carregando a posição de hoje" />
                        <CartoesCarregando quantos={4} altura="h-[78px]" grade="grid-cols-2 xl:grid-cols-4" rotulo="Carregando os vencimentos dos próximos dias" />
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            <KpiCard
                                destaque
                                label="Saldo nos bancos"
                                icon={<Landmark />}
                                value={bancos.saldo == null ? '—' : moneyBRL(bancos.saldo)}
                                sub={legendaDoSaldo(bancos)}
                                tom={tomSaldo}
                                title={hoje.contas.map(c => c.saldo_banco == null
                                    ? `${c.conta}: sem saldo do banco`
                                    : `${c.conta}: ${moneyBRL(c.saldo_banco)} em ${dataBR(c.saldo_banco_data ?? '')}`).join('\n') || undefined}
                                acao={tomSaldo === 'neutro' ? undefined : {
                                    label: bancos.semSaldo.length > 0 || bancos.defasadas.length > 0 ? 'Informar saldo na Conciliação' : 'Ver na Conciliação',
                                    onClick: () => ir('bank-reconciliation'),
                                }}
                            />
                            <KpiCard
                                destaque
                                label="Vencido a receber"
                                icon={<ArrowDownLeft />}
                                value={moneyBRL(hoje.vencido_receber)}
                                sub={hoje.vencido_receber_qtd > 0
                                    ? `${plural(hoje.vencido_receber_qtd, 'título', 'títulos')}${hoje.vencido_receber_desde ? ` · desde ${mesAno(hoje.vencido_receber_desde)}` : ''}`
                                    : 'Nenhum título vencido'}
                                tom={tomPorLimiar(hoje.vencido_receber, LIMIAR.vencidoReceberAlerta, 'alerta')}
                                acao={hoje.vencido_receber > 0 ? { label: 'Cobrar em Contas a receber', onClick: () => ir('contas-a-receber') } : undefined}
                            />
                            <KpiCard
                                destaque
                                label="Vencido a pagar"
                                icon={<ArrowUpRight />}
                                value={moneyBRL(hoje.vencido_pagar)}
                                sub={hoje.vencido_pagar_qtd > 0
                                    ? `${plural(hoje.vencido_pagar_qtd, 'título', 'títulos')}${hoje.vencido_pagar_desde ? ` · desde ${mesAno(hoje.vencido_pagar_desde)}` : ''}`
                                    : 'Nenhum título vencido'}
                                tom={tomPorLimiar(hoje.vencido_pagar, LIMIAR.vencidoPagarAlerta, 'alerta')}
                                acao={hoje.vencido_pagar > 0 ? { label: 'Pagar em Contas a pagar', onClick: () => ir('contas-a-pagar') } : undefined}
                            />
                            <KpiCard
                                destaque
                                label="Aguardando aprovação"
                                icon={<ClipboardCheck />}
                                value={aprovacao ? moneyBRL(aprovacao.soma) : '—'}
                                sub={!aprovacao
                                    ? 'Não foi possível carregar a fila de aprovação'
                                    : aprovacao.qtd > 0 ? `${plural(aprovacao.qtd, 'item', 'itens')} acima da alçada` : 'Nada esperando aprovação'}
                                tom={aprovacao ? tomPorLimiar(aprovacao.qtd, LIMIAR.aprovacaoAtencao, 'atencao') : 'neutro'}
                                acao={aprovacao && aprovacao.qtd > 0 ? { label: 'Revisar aprovações', onClick: () => ir('financial-approval') } : undefined}
                            />
                        </div>

                        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                            <KpiCard size="sm" color="gray" label="Receber em 7 dias" value={moneyBRL(hoje.receber_7)} sub={plural(hoje.receber_7_qtd, 'título', 'títulos')} />
                            <KpiCard size="sm" color="gray" label="Pagar em 7 dias" value={moneyBRL(hoje.pagar_7)} sub={plural(hoje.pagar_7_qtd, 'título', 'títulos')} />
                            <KpiCard size="sm" color="gray" label="Receber em 30 dias" value={moneyBRL(hoje.receber_30)} sub={plural(hoje.receber_30_qtd, 'título', 'títulos')} />
                            <KpiCard size="sm" color="gray" label="Pagar em 30 dias" value={moneyBRL(hoje.pagar_30)} sub={plural(hoje.pagar_30_qtd, 'título', 'títulos')} />
                        </div>
                    </>
                )}
            </section>

            {/* ── Resultado do período: o seletor mora na linha da faixa que ele recorta ── */}
            <section aria-labelledby="dash-periodo" className="space-y-3">
                <FaixaTitulo id="dash-periodo" titulo="Resultado do período">
                    <div className="flex flex-wrap items-center gap-2">
                        <div role="group" aria-label="Tamanho do período" className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
                            {(Object.keys(ROTULO_PERIODO) as Periodo[]).map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    aria-pressed={periodo === p}
                                    onClick={() => { setPeriodo(p); setOffset(0); }}
                                    className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${periodo === p ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                                >
                                    {ROTULO_PERIODO[p]}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center h-9 bg-white border border-gray-200 rounded-[6px]">
                            <button
                                type="button"
                                onClick={() => setOffset(o => o - 1)}
                                aria-label="Período anterior"
                                title="Período anterior"
                                className="h-full px-2 text-gray-600 hover:bg-gray-50 rounded-l-[6px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-2 min-w-[11rem] text-center text-sm font-medium text-gray-800 first-letter:uppercase" aria-live="polite">
                                {limites.rotulo}
                            </span>
                            <button
                                type="button"
                                onClick={() => setOffset(o => o + 1)}
                                disabled={offset >= 0}
                                aria-label="Próximo período"
                                title={offset >= 0 ? 'Este já é o período atual' : 'Próximo período'}
                                className="h-full px-2 text-gray-600 hover:bg-gray-50 rounded-r-[6px] disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </FaixaTitulo>

                {periodoEstado === 'error' ? (
                    // Uma consulta só alimenta cartões e gráficos: uma falha, uma mensagem.
                    <FalhaDaFaixa oQue="o resultado do período" onRetry={carregarPeriodo} />
                ) : (
                    <>
                        {!dados ? (
                            <CartoesCarregando quantos={3} altura="h-[76px]" grade="grid-cols-1 sm:grid-cols-3" rotulo="Carregando o resultado do período" />
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <KpiCard size="sm" color="gray" label="Recebido" value={moneyBRL(dados.recebido)} sub={plural(dados.recebido_qtd, 'recebimento', 'recebimentos')} />
                                <KpiCard size="sm" color="gray" label="Pago" value={moneyBRL(dados.pago)} sub={plural(dados.pago_qtd, 'pagamento', 'pagamentos')} />
                                <KpiCard size="sm" color="gray" label="Resultado" value={moedaComSinal(resultado)} sub="Recebido menos pago" />
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                            <ChartCard
                                className="lg:col-span-3"
                                title="Entrou × saiu por mês"
                                subtitle={`Títulos baixados como recebidos ou pagos, pela data do pagamento · ${mesCurto(limites.mesesDesde)} a ${mesCurto(limites.mesesAte)}.`}
                            >
                                {!dados
                                    ? <ChartSourceState state="loading" onRetry={carregarPeriodo} what="os recebimentos e pagamentos" />
                                    : <EntrouSaiu dados={dados} desde={limites.mesesDesde} ate={limites.mesesAte} periodoDe={limites.from} rotuloPeriodo={limites.rotulo} />}
                            </ChartCard>
                            <ChartCard
                                className="lg:col-span-2"
                                title="Maiores credores do período"
                                subtitle={dados && dados.a_pagar_total > 0
                                    ? `${moneyBRL(dados.a_pagar_total)} a pagar com vencimento no período · ${plural(dados.credores_qtd, 'credor identificado', 'credores identificados')}.`
                                    : 'Títulos a pagar com vencimento no período.'}
                            >
                                {!dados
                                    ? <ChartSourceState state="loading" onRetry={carregarPeriodo} what="os credores" />
                                    : (
                                        <>
                                            <MaioresCredores dados={dados} />
                                            {/* Sem fornecedor é falta de cadastro, não credor: fica fora do
                                                ranking e pede a correção onde ela se faz. */}
                                            {dados.sem_fornecedor_qtd > 0 ? (
                                                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                                                    <p className="text-sm text-gray-700">
                                                        <span className="font-medium text-gray-900 tabular-nums">{moneyBRL(dados.sem_fornecedor_valor)}</span>
                                                        {' '}em {plural(dados.sem_fornecedor_qtd, 'título', 'títulos')} sem fornecedor informado.
                                                    </p>
                                                    <LinkDeAcao onClick={() => ir('contas-a-pagar')}>Informar o fornecedor em Contas a pagar</LinkDeAcao>
                                                </div>
                                            ) : dados.credores.length > 0 && (
                                                <div className="mt-3 pt-3 border-t border-gray-100">
                                                    <LinkDeAcao onClick={() => ir('contas-a-pagar')}>Ver em Contas a pagar</LinkDeAcao>
                                                </div>
                                            )}
                                        </>
                                    )}
                            </ChartCard>
                        </div>
                    </>
                )}

                <p className="text-sm text-gray-600">
                    Receita, custo e margem de cada obra ficam no{' '}
                    <button
                        type="button"
                        onClick={() => abrirInteligencia('obras')}
                        className="font-medium text-blue-600 hover:text-blue-800 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                        Scorecard de obras da Inteligência
                    </button>.
                </p>
            </section>
        </div>
    );
};

export default FinancialDashboard;
