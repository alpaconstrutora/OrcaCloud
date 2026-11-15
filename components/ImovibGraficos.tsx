/**
 * Gráficos do Imovib de props puras (Fase 3 do plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md): a tela do estudo, o
 * relatório em PDF e o dashboard do investidor desenham com os mesmos componentes.
 *
 * - Sem `dimensao`, o gráfico ocupa a largura do pai (ResponsiveContainer) e a altura da classe.
 * - Com `dimensao` (PDF), o tamanho é fixo e não depende de medir a tela; `animado={false}`
 *   desenha de uma vez, para a captura não pegar o gráfico no meio da animação.
 * Os dados saem de utils/imovibGraficos.ts.
 */
import React from 'react';
import {
    ResponsiveContainer, ComposedChart, BarChart, PieChart, Pie, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
    ReferenceLine, Legend as LegendaDoRecharts, LabelList,
} from 'recharts';
import {
    Legend, GRID, TICK, CATEGORY_TICK, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION, COR_PIORA, COR_MELHORA,
    SERIE_PRINCIPAL, SERIE_CONTEXTO, compactAxis, moneyBRL,
} from './analysis/chartKit';
import {
    dadosDoTornado, nomeDoTornado, formatarMetrica, type FatiaDoCapital, type LinhaDoCenario, type MesDeVendas,
} from '../utils/imovibGraficos';
import type { BarraDoTornado, MetricaDoEstudo } from '../utils/imovibSensibilidade';
import type { VariavelDoEstudo } from '../utils/imovibVariacoes';
import type { MarcoDoEstudo } from '../utils/imovibCronograma';

export interface DimensaoDoGrafico { largura: number; altura: number }

interface ComumDosGraficos {
    /** Tamanho fixo (PDF). Sem ele, largura do pai e altura da `className`. */
    dimensao?: DimensaoDoGrafico;
    /** false = desenha de uma vez (captura para o PDF). */
    animado?: boolean;
    className?: string;
}

/** Moldura comum: tamanho fixo ou responsivo, sempre com nome acessível (§28.5). */
const Quadro: React.FC<{ dimensao?: DimensaoDoGrafico; className: string; rotulo: string; children: React.ReactElement<{ width?: number; height?: number }> }> = ({ dimensao, className, rotulo, children }) =>
    dimensao ? (
        <div role="img" aria-label={rotulo} style={{ width: dimensao.largura, height: dimensao.altura }}>
            {React.cloneElement(children, { width: dimensao.largura, height: dimensao.altura })}
        </div>
    ) : (
        <div className={className} role="img" aria-label={rotulo}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>{children}</ResponsiveContainer>
        </div>
    );

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

// ── Curva S: caixa do mês (barras) e exposição acumulada (linha) ─────────────

export interface PontoDaCurvaS { name: string; net: number; acc: number }

export const GraficoCurvaS: React.FC<ComumDosGraficos & {
    dados: PontoDaCurvaS[];
    rotuloBarra?: string;
    rotuloLinha?: string;
    /** Largura do eixo dos valores (px). No PDF, mais larga para "R$ 7.0 M" não quebrar em duas linhas. */
    larguraDoEixo?: number;
}> = ({ dados, rotuloBarra = 'Caixa Líquido no Mês', rotuloLinha = 'Exposição de Caixa (Acumulado)', larguraDoEixo, dimensao, animado = true, className = 'h-[400px] w-full' }) => {
    const minimo = dados.reduce((m, d) => Math.min(m, d.acc), 0);
    const rotulo = `${rotuloLinha}: ${dados.length} períodos, de ${dados[0]?.name ?? ''} a ${dados[dados.length - 1]?.name ?? ''}; exposição máxima ${brl(Math.max(0, -minimo))}; acumulado no fim ${brl(dados[dados.length - 1]?.acc ?? 0)}.`;
    return (
        <Quadro dimensao={dimensao} className={className} rotulo={rotulo}>
            <ComposedChart accessibilityLayer={false} data={dados} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis tickFormatter={(value: number) => `R$ ${(value / 1000000).toFixed(1)} M`} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} width={larguraDoEixo} />
                <Tooltip
                    formatter={(value: unknown) => brl(Number(value))}
                    labelStyle={{ fontWeight: 800, color: '#0f172a' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                {/* Rótulo da legenda na cor de TEXTO (§28.3): na cor da barra, cinza-claro, sumia. */}
                <LegendaDoRecharts wrapperStyle={{ paddingTop: '20px', fontWeight: 600, fontSize: '13px' }} formatter={(v: string) => <span style={{ color: '#475569' }}>{v}</span>} />
                <Bar yAxisId={0} dataKey="net" name={rotuloBarra} fill="#cbd5e1" radius={[4, 4, 0, 0]} opacity={0.5} isAnimationActive={animado} />
                <Line type="monotone" dataKey="acc" name={rotuloLinha} stroke="#0f172a" strokeWidth={4} dot={false}
                    activeDot={{ r: 8, fill: '#0f172a', stroke: '#fff', strokeWidth: 2 }} isAnimationActive={animado} />
            </ComposedChart>
        </Quadro>
    );
};

// ── Tornado ──────────────────────────────────────────────────────────────────

export const GraficoTornado: React.FC<ComumDosGraficos & {
    barras: BarraDoTornado[];
    metrica: MetricaDoEstudo;
    choques: Record<VariavelDoEstudo, number>;
    /** Desenha a legenda piora/melhora junto (PDF); na tela ela fica no cabeçalho do card. */
    comLegenda?: boolean;
    /** Largura da coluna dos rótulos (px); no celular, menor, para sobrar barra. */
    larguraDosRotulos?: number;
}> = ({ barras, metrica, choques, comLegenda = false, larguraDosRotulos = 230, dimensao, animado = true, className = 'h-[360px]' }) => {
    const base = barras[0]?.base ?? NaN;
    const dados = dadosDoTornado(barras, metrica, choques);
    const cor = (delta: number) => (delta >= 0 ? COR_MELHORA : COR_PIORA);
    const grafico = (
        <Quadro dimensao={dimensao} className={className} rotulo={nomeDoTornado(barras, metrica)}>
            {/* Margem direita: o valor da ponta do eixo cortava ("R$ 4.306.51"). */}
            <BarChart accessibilityLayer={false} layout="vertical" data={dados} margin={{ top: 4, right: 40, left: 0, bottom: 0 }} barSize={9} barGap={2}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatarMetrica(metrica, v + base)} />
                <YAxis type="category" dataKey="nome" width={larguraDosRotulos} tick={CATEGORY_TICK} axisLine={false} tickLine={false} />
                <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={TOOLTIP_CURSOR}
                    formatter={(_v: unknown, nome: unknown, item: { payload?: { cimaAbs: number; baixoAbs: number; rotuloCima: string; rotuloBaixo: string } }) => [
                        formatarMetrica(metrica, nome === 'cima' ? item.payload!.cimaAbs : item.payload!.baixoAbs),
                        `Choque ${nome === 'cima' ? item.payload!.rotuloCima : item.payload!.rotuloBaixo}`,
                    ]}
                />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Bar dataKey="cima" isAnimationActive={animado}>
                    {dados.map((d, i) => <Cell key={i} fill={cor(d.cima)} />)}
                </Bar>
                <Bar dataKey="baixo" isAnimationActive={animado}>
                    {dados.map((d, i) => <Cell key={i} fill={cor(d.baixo)} />)}
                </Bar>
            </BarChart>
        </Quadro>
    );
    return comLegenda ? (
        <div className="space-y-2">
            <Legend items={[{ label: 'Piora', color: COR_PIORA }, { label: 'Melhora', color: COR_MELHORA }]} />
            {grafico}
        </div>
    ) : grafico;
};

// ── Cenários: VPL do estudo e de cada cenário salvo ──────────────────────────

export const GraficoCenarios: React.FC<ComumDosGraficos & { linhas: LinhaDoCenario[]; corPrincipal?: string; larguraDosRotulos?: number }> = ({ linhas, corPrincipal = SERIE_PRINCIPAL, larguraDosRotulos = 140, dimensao, animado = true, className = 'h-64' }) => {
    const rotulo = `VPL por cenário: ${linhas.map(l => `${l.nome} ${brl(l.vpl)}`).join('; ')}.`;
    return (
        <div className="space-y-2">
            <Legend items={[{ label: 'Estudo', color: corPrincipal }, { label: 'Cenários salvos', color: SERIE_CONTEXTO }]} />
            <Quadro dimensao={dimensao} className={className} rotulo={rotulo}>
                <BarChart accessibilityLayer={false} layout="vertical" data={linhas} margin={{ top: 4, right: 96, left: 0, bottom: 0 }} barSize={14}>
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} />
                    <YAxis type="category" dataKey="nome" width={larguraDosRotulos} tick={CATEGORY_TICK} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} formatter={(v: unknown) => [moneyBRL(Number(v)), 'VPL']} />
                    <ReferenceLine x={0} stroke="#94a3b8" />
                    <Bar dataKey="vpl" radius={[0, 4, 4, 0]} isAnimationActive={animado}>
                        {linhas.map((l, i) => <Cell key={i} fill={i === 0 ? corPrincipal : SERIE_CONTEXTO} />)}
                        <LabelList dataKey="vpl" position="right" fontSize={11} fill="#64748b" formatter={(v: unknown) => compactAxis(Number(v))} />
                    </Bar>
                </BarChart>
            </Quadro>
        </div>
    );
};

// ── Vendas por mês e estoque ─────────────────────────────────────────────────

export const GraficoVendasPorMes: React.FC<ComumDosGraficos & { dados: MesDeVendas[]; comLegenda?: boolean; corPrincipal?: string }> = ({ dados, comLegenda = true, corPrincipal = SERIE_PRINCIPAL, dimensao, animado = true, className = 'h-56' }) => {
    const pico = dados.reduce((m, d) => (d.vendas > m.vendas ? d : m), { mes: '', vendas: 0, estoque: 0 });
    const vendido = dados.reduce((a, d) => a + d.vendas, 0);
    const rotulo = `Vendas por mês: ${moneyBRL(vendido)} vendidos de ${dados[0]?.mes ?? ''} a ${dados[dados.length - 1]?.mes ?? ''}; maior venda em ${pico.mes}, ${moneyBRL(pico.vendas)}; estoque no fim ${moneyBRL(dados[dados.length - 1]?.estoque ?? 0)}.`;
    return (
        <>
            {comLegenda && <Legend items={[{ label: 'Vendas do mês', color: corPrincipal }, { label: 'Estoque', color: SERIE_CONTEXTO }]} />}
            <Quadro dimensao={dimensao} className={className} rotulo={rotulo}>
                {/* Eixos separados: a venda do mês é ~1/36 do estoque inicial e sumiria no mesmo eixo. */}
                <ComposedChart accessibilityLayer={false} data={dados} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="mes" tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis yAxisId="vendas" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} width={56} />
                    <YAxis yAxisId="estoque" orientation="right" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} width={56} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} formatter={(v: unknown) => moneyBRL(Number(v))} />
                    <Bar yAxisId="vendas" dataKey="vendas" name="Vendas do mês" fill={corPrincipal} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={animado} />
                    <Line yAxisId="estoque" dataKey="estoque" name="Estoque" stroke={SERIE_CONTEXTO} strokeWidth={2} dot={false} type="monotone" isAnimationActive={animado} />
                </ComposedChart>
            </Quadro>
        </>
    );
};

// ── Composição do capital ────────────────────────────────────────────────────

export const GraficoComposicaoDoCapital: React.FC<ComumDosGraficos & { fatias: FatiaDoCapital[] }> = ({ fatias, dimensao, animado = true, className = 'h-64' }) => {
    const rotulo = `De onde vem o dinheiro: ${fatias.map(f => `${f.nome} ${f.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`).join('; ')}.`;
    return (
        <Quadro dimensao={dimensao} className={className} rotulo={rotulo}>
            <PieChart accessibilityLayer={false}>
                <Pie data={fatias} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="pct" nameKey="nome" isAnimationActive={animado}>
                    {fatias.map(f => <Cell key={f.chave} fill={f.cor} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} />
                {/* Rótulo na cor de TEXTO (§28.3): o roxo da fatia lido como texto ficava abaixo de 4,5:1. */}
                <LegendaDoRecharts verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => <span style={{ color: '#475569' }}>{v}</span>} />
            </PieChart>
        </Quadro>
    );
};

// ── Linha do tempo: obra, vendas e marcos ────────────────────────────────────

/**
 * Faixas de obra (início → habite-se) e de vendas (lançamento → fim das vendas) numa régua de
 * meses, com os outros marcos como pontos. SVG puro: sai igual na tela e na captura do PDF.
 */
export const LinhaDoTempoDosMarcos: React.FC<{ marcos: MarcoDoEstudo[]; dimensao?: DimensaoDoGrafico; className?: string; corPrincipal?: string }> = ({ marcos, dimensao, className = 'w-full', corPrincipal = SERIE_PRINCIPAL }) => {
    const mes = (id: MarcoDoEstudo['id']) => marcos.find(m => m.id === id)?.mes ?? null;
    const comMes = marcos.filter(m => m.mes != null);
    const fim = Math.max(1, mes('encerramento') ?? 0, ...comMes.map(m => m.mes!));
    const L = dimensao?.largura ?? 760;
    const A = dimensao?.altura ?? 150;
    const esq = 70, dir = 16;
    const x = (m: number) => esq + ((m - 1) / Math.max(1, fim - 1)) * (L - esq - dir);
    const faixa = (rotulo: string, de: number | null, ate: number | null, y: number, cor: string) => (de == null || ate == null ? null : (
        <g>
            <text x={0} y={y + 10} fontSize={11} fill="#475569">{rotulo}</text>
            <rect x={x(de)} y={y} width={Math.max(4, x(ate) - x(de))} height={14} rx={4} fill={cor} />
            <text x={x(de)} y={y + 28} fontSize={10} fill="#64748b">{`mês ${de}–${ate}`}</text>
        </g>
    ));
    const pontos = comMes.filter(m => !['inicio_obra', 'habite_se', 'lancamento', 'fim_das_vendas'].includes(m.id));
    const rotulo = `Linha do tempo: ${comMes.map(m => `${m.rotulo} mês ${m.mes}`).join('; ')}.`;
    return (
        <svg role="img" aria-label={rotulo} viewBox={`0 0 ${L} ${A}`} width={dimensao ? L : '100%'} height={dimensao ? A : undefined} className={dimensao ? undefined : className}>
            {faixa('Obra', mes('inicio_obra'), mes('habite_se'), 8, corPrincipal)}
            {faixa('Vendas', mes('lancamento'), mes('fim_das_vendas'), 52, SERIE_CONTEXTO)}
            <line x1={esq} x2={L - dir} y1={100} y2={100} stroke="#cbd5e1" />
            {pontos.map((m, i) => (
                <g key={m.id}>
                    <circle cx={x(m.mes!)} cy={100} r={4} fill="#0f172a" />
                    {/* Ponto na ponta da régua: o texto cresce para dentro, não sai da borda. */}
                    <text x={x(m.mes!)} y={i % 2 === 0 ? 118 : 134} fontSize={10} fill="#475569"
                        textAnchor={x(m.mes!) > L - 120 ? 'end' : x(m.mes!) < esq + 60 ? 'start' : 'middle'}>{`${m.rotulo} · ${m.mes}`}</text>
                </g>
            ))}
        </svg>
    );
};
