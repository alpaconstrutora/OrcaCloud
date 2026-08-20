import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Building2, ChevronDown, ExternalLink, FileDown, Sparkles, Wallet } from 'lucide-react';
import { HoldingItem } from '../types';
import { InvestorContribution } from '../../../services/investorContributionsService';
import { AIInsight } from '../../../services/aiService';
import {
    CardHeader, DetailField, fmtBRL, fmtBRLCents, fmtDate, fmtMonthShort, KpiStrip, PortalCard,
    PortalEmpty, PortalTabs, PrimaryButton, SoftButton, StatusPill, Td, Th, TagChip, PillTone,
} from '../../portal/PortalKit';

interface Props {
    equity: string;
    activeWorks: number;
    monthlyYieldPct: number | null;
    totalContributed: number;
    totalDividends: number;
    holdings: HoldingItem[];
    contributions: InvestorContribution[];
    aiInsight: AIInsight | null;
    loadingAI: boolean;
    onSelectAsset: (h: HoldingItem) => void;
    onNavigateToHoldings: () => void;
}

type SeriesId = 'aportado' | 'dividendos' | 'retorno';

const SERIES: { id: SeriesId; label: string; color: string; axis: 'left' | 'right'; money: boolean }[] = [
    { id: 'aportado', label: 'Aportado', color: '#E1553C', axis: 'left', money: true },
    { id: 'dividendos', label: 'Dividendos', color: '#6D9BD1', axis: 'left', money: true },
    { id: 'retorno', label: 'Retorno', color: '#C6CAD1', axis: 'right', money: false },
];

const CONTRIB_STATUS: Record<string, { label: string; tone: PillTone }> = {
    liquidado: { label: 'Liquidado', tone: 'good' },
    pendente: { label: 'Pendente', tone: 'neutral' },
    atrasado: { label: 'Atrasado', tone: 'accent' },
    cancelado: { label: 'Cancelado', tone: 'muted' },
};

const holdingTone = (status: string): PillTone => {
    const s = status.toLowerCase();
    if (s.includes('conclu')) return 'good';
    if (s.includes('lança') || s.includes('lanca')) return 'info';
    if (s.includes('parad') || s.includes('atras')) return 'accent';
    return 'neutral';
};

const PortalOverview: React.FC<Props> = ({
    equity, activeWorks, monthlyYieldPct, totalContributed, totalDividends,
    holdings, contributions, aiInsight, loadingAI, onSelectAsset, onNavigateToHoldings,
}) => {
    const [hiddenSeries, setHiddenSeries] = React.useState<SeriesId[]>([]);
    const [activeLabel, setActiveLabel] = React.useState<string | null>(null);
    const [tableTab, setTableTab] = React.useState('participacoes');
    const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

    const projectName = React.useMemo(() => {
        const map = new Map<string, string>();
        holdings.forEach(h => { if (h.id) map.set(h.id, h.name); });
        return map;
    }, [holdings]);

    // ── Série mensal acumulada, construída dos aportes/dividendos liquidados ──
    const series = React.useMemo(() => {
        const paid = contributions.filter(c => c.paid_date && c.status === 'liquidado');
        if (paid.length === 0) return [];
        const first = paid
            .map(c => new Date(c.paid_date!).getTime())
            .sort((a, b) => a - b)[0];
        const cursor = new Date(new Date(first).getFullYear(), new Date(first).getMonth(), 1);
        const now = new Date();
        const out: { month: string; aportado: number; dividendos: number; retorno: number }[] = [];

        while (cursor <= now) {
            const endOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
            const until = (fn: (c: InvestorContribution) => boolean) => paid
                .filter(c => fn(c) && new Date(c.paid_date!) <= endOfMonth)
                .reduce((s, c) => s + Number(c.amount), 0);

            const aportado = until(c => c.type === 'aporte');
            const dividendos = until(c => c.type === 'dividendo' || c.type === 'distribuicao');
            out.push({
                month: fmtMonthShort(cursor),
                aportado,
                dividendos,
                retorno: aportado > 0 ? Number(((dividendos / aportado) * 100).toFixed(2)) : 0,
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }
        return out;
    }, [contributions]);

    const last = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : undefined;
    const deltaPct = (cur?: number, before?: number) => {
        if (cur == null || before == null || before === 0) return undefined;
        const d = ((cur - before) / before) * 100;
        // Mês sem movimento não ganha "0%" — seria ruído ao lado do valor.
        if (Math.abs(d) < 0.05) return undefined;
        return {
            delta: `${d > 0 ? '+' : ''}${d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
            direction: (d > 0 ? 'up' : 'down') as 'up' | 'down',
        };
    };

    const aporteDelta = deltaPct(last?.aportado, prev?.aportado);
    const dividendoDelta = deltaPct(last?.dividendos, prev?.dividendos);

    // O `equity` chega formatado com centavos e estoura a coluna no mobile.
    // Como as participações trazem o valor numérico, reformata sem centavos.
    const equityValue = holdings.reduce((s, h) => s + (Number(h.equity) || 0), 0);

    const kpis = [
        {
            label: 'Patrimônio',
            value: holdings.length > 0 ? fmtBRL(equityValue) : (equity || 'R$ 0,00'),
            hint: activeWorks ? `${activeWorks} empreendimento${activeWorks > 1 ? 's' : ''}` : undefined,
        },
        {
            label: 'Rendimento médio',
            value: monthlyYieldPct != null ? `${monthlyYieldPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.m.` : '—',
            hint: monthlyYieldPct == null ? 'Sem distribuições' : undefined,
        },
        { label: 'Aportado', value: fmtBRL(totalContributed), ...(aporteDelta ?? {}) },
        { label: 'Dividendos', value: fmtBRL(totalDividends), ...(dividendoDelta ?? {}) },
        {
            label: 'Retorno acumulado',
            value: totalContributed > 0 ? `${((totalDividends / totalContributed) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—',
        },
    ];

    const toggleSeries = (id: SeriesId) =>
        setHiddenSeries(prevIds => prevIds.includes(id) ? prevIds.filter(s => s !== id) : [...prevIds, id]);

    // ── Linhas da tabela por sub-aba ─────────────────────────────────────────
    const aportes = React.useMemo(
        () => contributions.filter(c => c.type === 'aporte')
            .sort((a, b) => (b.paid_date ?? b.due_date ?? '').localeCompare(a.paid_date ?? a.due_date ?? '')),
        [contributions],
    );
    const dividendos = React.useMemo(
        () => contributions.filter(c => c.type === 'dividendo' || c.type === 'distribuicao')
            .sort((a, b) => (b.paid_date ?? b.due_date ?? '').localeCompare(a.paid_date ?? a.due_date ?? '')),
        [contributions],
    );

    const tabs = [
        { id: 'participacoes', label: 'Participações', count: holdings.length },
        { id: 'aportes', label: 'Aportes', count: aportes.length },
        { id: 'dividendos', label: 'Dividendos', count: dividendos.length },
    ];

    const renderContribRows = (rows: InvestorContribution[], emptyLabel: string) => {
        if (rows.length === 0) {
            return (
                <tr>
                    <td colSpan={5}>
                        <PortalEmpty icon={<Wallet className="w-9 h-9" />} title={emptyLabel} />
                    </td>
                </tr>
            );
        }
        return rows.map(c => {
            const key = c.id ?? `${c.project_id}-${c.due_date}-${c.amount}`;
            const isOpen = expandedRow === key;
            const st = CONTRIB_STATUS[c.status] ?? { label: c.status, tone: 'muted' as PillTone };
            return (
                <React.Fragment key={key}>
                    <tr
                        className={`cursor-pointer transition-colors ${isOpen ? 'bg-[#FDF8F6]' : 'hover:bg-gray-50/70'}`}
                        onClick={() => setExpandedRow(isOpen ? null : key)}
                    >
                        <Td className="text-[#8A8F9A] whitespace-nowrap">
                            <span className="inline-flex items-center gap-2">
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isOpen ? 'rotate-180' : '-rotate-90'}`} />
                                {fmtDate(c.paid_date ?? c.due_date)}
                            </span>
                        </Td>
                        <Td className="text-[#1F2430] font-medium">{projectName.get(c.project_id) ?? 'Empreendimento'}</Td>
                        <Td className="text-[#1F2430] font-medium tabular-nums">{fmtBRLCents(Number(c.amount))}</Td>
                        <Td><StatusPill tone={st.tone}>{st.label}</StatusPill></Td>
                        <Td className="text-[#8A8F9A]">{c.payment_method || '—'}</Td>
                    </tr>
                    {isOpen && (
                        <tr className="bg-[#FDF8F6] border-t border-[#F3D9D1]">
                            <Td colSpan={5} className="pb-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1 max-w-3xl">
                                    <DetailField label="Vencimento">{fmtDate(c.due_date)}</DetailField>
                                    <DetailField label="Pagamento">{fmtDate(c.paid_date)}</DetailField>
                                    <DetailField label="Forma">{c.payment_method || '—'}</DetailField>
                                    <DetailField label="Descrição">{c.description || '—'}</DetailField>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    {c.receipt_url && (
                                        <PrimaryButton onClick={() => window.open(c.receipt_url, '_blank', 'noopener')}>
                                            <FileDown className="w-4 h-4" />
                                            Baixar comprovante
                                        </PrimaryButton>
                                    )}
                                    {c.project_id && projectName.has(c.project_id) && (
                                        <SoftButton
                                            onClick={() => {
                                                const h = holdings.find(x => x.id === c.project_id);
                                                if (h) onSelectAsset(h);
                                            }}
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            Ver empreendimento
                                        </SoftButton>
                                    )}
                                </div>
                            </Td>
                        </tr>
                    )}
                </React.Fragment>
            );
        });
    };

    return (
        <div className="space-y-3">
            {/* Insight de IA — faixa fina, sem competir com os KPIs */}
            {(loadingAI || aiInsight) && (
                <PortalCard className="px-5 py-3.5 flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-[#E1553C] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#1F2430]">{aiInsight?.title || 'Analisando sua carteira...'}</p>
                        {loadingAI
                            ? <div className="h-3 w-64 max-w-full bg-gray-100 rounded animate-pulse mt-1.5" />
                            : <p className="text-[13px] text-[#8A8F9A] mt-0.5 leading-relaxed">{aiInsight?.content}</p>}
                    </div>
                </PortalCard>
            )}

            <KpiStrip items={kpis} />

            {/* Evolução */}
            <PortalCard>
                <CardHeader
                    title="Evolução"
                    right={
                        <div className="flex items-center gap-3">
                            {SERIES.map(s => {
                                const off = hiddenSeries.includes(s.id);
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => toggleSeries(s.id)}
                                        className="flex items-center gap-1.5 text-[12px] transition-opacity"
                                        style={{ opacity: off ? 0.4 : 1 }}
                                        title={off ? 'Mostrar série' : 'Ocultar série'}
                                    >
                                        <span
                                            className="w-3 h-3 rounded-full border-2 shrink-0"
                                            style={{ borderColor: s.color, background: off ? 'transparent' : s.color }}
                                        />
                                        <span className="text-[#4A505C]">{s.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    }
                />
                <div className="px-2 pb-4">
                    {series.length === 0 ? (
                        <PortalEmpty
                            title="Nenhum aporte liquidado ainda"
                            subtitle="A curva aparece assim que houver aporte com data de pagamento."
                        />
                    ) : (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={series}
                                    margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                                    onMouseMove={(st: any) => setActiveLabel(st?.activeLabel ?? null)}
                                    onMouseLeave={() => setActiveLabel(null)}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F4" />
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        interval="preserveStartEnd"
                                        minTickGap={24}
                                        // O mês sob o cursor é escondido: no lugar dele entra a
                                        // pílula coral da ReferenceLine (senão os dois se sobrepõem).
                                        tick={(props: any) => {
                                            const { x, y, payload } = props;
                                            if (payload?.value === activeLabel) return <g />;
                                            return (
                                                <text x={x} y={y + 12} textAnchor="middle" fill="#A0A4AD" fontSize={11}>
                                                    {payload?.value}
                                                </text>
                                            );
                                        }}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#A0A4AD', fontSize: 11 }}
                                        width={64}
                                        tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#C6CAD1', fontSize: 11 }}
                                        width={40}
                                        tickFormatter={(v: number) => `${v}%`}
                                    />
                                    {activeLabel && (
                                        <ReferenceLine
                                            yAxisId="left"
                                            x={activeLabel}
                                            stroke="#C6CAD1"
                                            strokeDasharray="4 4"
                                            // Pílula coral no pé da linha, como no desenho de referência.
                                            // Precisa ser desenhada à mão: o `label` de texto do recharts
                                            // não tem fundo, e texto claro sem pílula some no branco.
                                            label={(props: any) => {
                                                const vb = props?.viewBox;
                                                if (!vb) return null;
                                                const w = 52;
                                                const h = 20;
                                                const cx = vb.x;
                                                const top = vb.y + vb.height + 4;
                                                return (
                                                    <g pointerEvents="none">
                                                        <rect x={cx - w / 2} y={top} width={w} height={h} rx={10} fill="#E1553C" />
                                                        <text
                                                            x={cx}
                                                            y={top + h / 2}
                                                            textAnchor="middle"
                                                            dominantBaseline="central"
                                                            fontSize={11}
                                                            fontWeight={600}
                                                            fill="#FFFFFF"
                                                        >
                                                            {activeLabel}
                                                        </text>
                                                    </g>
                                                );
                                            }}
                                        />
                                    )}
                                    <Tooltip
                                        cursor={false}
                                        content={({ active, payload, label }: any) => {
                                            if (!active || !payload?.length) return null;
                                            return (
                                                <div className="bg-white rounded-xl border border-[#ECECEF] shadow-lg px-3 py-2 min-w-[168px]">
                                                    <p className="text-[11px] text-gray-400 mb-1.5">{label}</p>
                                                    {SERIES.filter(s => !hiddenSeries.includes(s.id)).map(s => {
                                                        const point = payload.find((p: any) => p.dataKey === s.id);
                                                        if (!point) return null;
                                                        return (
                                                            <div key={s.id} className="flex items-center justify-between gap-4 py-0.5">
                                                                <span className="flex items-center gap-1.5 text-[12px] text-[#4A505C]">
                                                                    <span className="w-1 h-3 rounded-sm" style={{ background: s.color }} />
                                                                    {s.label}
                                                                </span>
                                                                <span className="text-[12px] font-semibold text-[#1F2430] tabular-nums">
                                                                    {s.money ? fmtBRL(Number(point.value)) : `${Number(point.value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        }}
                                    />
                                    {SERIES.filter(s => !hiddenSeries.includes(s.id)).map(s => (
                                        <Line
                                            key={s.id}
                                            yAxisId={s.axis}
                                            type="monotone"
                                            dataKey={s.id}
                                            stroke={s.color}
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </PortalCard>

            {/* Tabela com sub-abas */}
            <PortalCard className="overflow-hidden">
                <PortalTabs tabs={tabs} active={tableTab} onChange={(id) => { setTableTab(id); setExpandedRow(null); }} />
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px]">
                        <thead>
                            <tr className="border-b border-[#ECECEF]">
                                {tableTab === 'participacoes' ? (
                                    <>
                                        <Th>Empreendimento</Th>
                                        <Th>Cota</Th>
                                        <Th>Patrimônio</Th>
                                        <Th>Status</Th>
                                        <Th>Progresso</Th>
                                    </>
                                ) : (
                                    <>
                                        <Th>Data</Th>
                                        <Th>Empreendimento</Th>
                                        <Th>Valor</Th>
                                        <Th>Status</Th>
                                        <Th>Forma</Th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F6]">
                            {tableTab === 'participacoes' && (
                                holdings.length === 0 ? (
                                    <tr>
                                        <td colSpan={5}>
                                            <PortalEmpty icon={<Building2 className="w-9 h-9" />} title="Nenhuma participação registrada" />
                                        </td>
                                    </tr>
                                ) : holdings.map((h, i) => {
                                    const key = h.id ?? `holding-${i}`;
                                    const isOpen = expandedRow === key;
                                    return (
                                        <React.Fragment key={key}>
                                            <tr
                                                className={`cursor-pointer transition-colors ${isOpen ? 'bg-[#FDF8F6]' : 'hover:bg-gray-50/70'}`}
                                                onClick={() => setExpandedRow(isOpen ? null : key)}
                                            >
                                                <Td className="text-[#1F2430] font-medium">
                                                    <span className="inline-flex items-center gap-2">
                                                        <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isOpen ? 'rotate-180' : '-rotate-90'}`} />
                                                        {h.name}
                                                    </span>
                                                </Td>
                                                <Td><TagChip>{h.cota}</TagChip></Td>
                                                <Td className="text-[#1F2430] font-medium tabular-nums">{fmtBRL(Number(h.equity) || 0)}</Td>
                                                <Td><StatusPill tone={holdingTone(h.status)}>{h.status}</StatusPill></Td>
                                                <Td>
                                                    <div className="flex items-center gap-2 min-w-[120px]">
                                                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-[#E1553C] rounded-full" style={{ width: `${Math.min(100, h.progress ?? 0)}%` }} />
                                                        </div>
                                                        <span className="text-[12px] text-[#8A8F9A] tabular-nums w-9 text-right">{h.progress ?? 0}%</span>
                                                    </div>
                                                </Td>
                                            </tr>
                                            {isOpen && (
                                                <tr className="bg-[#FDF8F6] border-t border-[#F3D9D1]">
                                                    <Td colSpan={5} className="pb-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1 max-w-3xl">
                                                            <DetailField label="Localização">{h.location || '—'}</DetailField>
                                                            <DetailField label="Capital aportado">{h.invested ? fmtBRLCents(h.invested) : '—'}</DetailField>
                                                            <DetailField label="Retorno realizado">{h.yield ?? '—'}</DetailField>
                                                            <DetailField label="Participação">{h.cota}</DetailField>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2 mt-4">
                                                            <PrimaryButton onClick={() => onSelectAsset(h)}>
                                                                <ExternalLink className="w-4 h-4" />
                                                                Ver empreendimento
                                                            </PrimaryButton>
                                                            <SoftButton onClick={onNavigateToHoldings}>
                                                                Abrir carteira
                                                            </SoftButton>
                                                        </div>
                                                    </Td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                            {tableTab === 'aportes' && renderContribRows(aportes, 'Nenhum aporte registrado')}
                            {tableTab === 'dividendos' && renderContribRows(dividendos, 'Nenhum dividendo distribuído')}
                        </tbody>
                    </table>
                </div>
            </PortalCard>
        </div>
    );
};

export default PortalOverview;
