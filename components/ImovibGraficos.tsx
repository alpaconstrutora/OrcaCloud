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

/**
 * Legenda: na tela, a do chartKit (HTML); no PDF (`dimensao` fixa), em SVG — a captura do html2canvas
 * desenha o quadradinho do flex acima do texto, e o SVG sai alinhado (como a linha do tempo).
 */
const Legenda: React.FC<{ items: { label: string; color: string }[]; svg?: boolean }> = ({ items, svg }) => {
    if (!svg) return <Legend items={items} />;
    let x = 0;
    const pos = items.map(i => { const atual = x; x += 22 + i.label.length * 6.6; return atual; });
    return (
        <svg width={x} height={16} className="mb-2 block" aria-hidden="true">
            {items.map((i, n) => (
                <g key={i.label} transform={`translate(${pos[n]}, 0)`}>
                    <rect x={0} y={3} width={10} height={10} rx={2} fill={i.color} />
                    <text x={15} y={12} fontSize={12} fill="#6b7280">{i.label}</text>
                </g>
            ))}
        </svg>
    );
};

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
    /** Valores do eixo compactos ("1,3 mi") — no celular "R$ 1.306.511" se atropelava. */
    eixoCompacto?: boolean;
}> = ({ barras, metrica, choques, comLegenda = false, larguraDosRotulos = 230, eixoCompacto = false, dimensao, animado = true, className = 'h-[360px]' }) => {
    const base = barras[0]?.base ?? NaN;
    const dados = dadosDoTornado(barras, metrica, choques);
    const cor = (delta: number) => (delta >= 0 ? COR_MELHORA : COR_PIORA);
    const grafico = (
        <Quadro dimensao={dimensao} className={className} rotulo={nomeDoTornado(barras, metrica)}>
            {/* Margem direita: o valor da ponta do eixo cortava ("R$ 4.306.51"). */}
            <BarChart accessibilityLayer={false} layout="vertical" data={dados} margin={{ top: 4, right: 40, left: 0, bottom: 0 }} barSize={9} barGap={2}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tick={TICK} axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => (eixoCompacto && (metrica === 'vpl' || metrica === 'exposicao') ? compactAxis(v + base) : formatarMetrica(metrica, v + base))} />
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
            <Legenda svg={!!dimensao} items={[{ label: 'Piora', color: COR_PIORA }, { label: 'Melhora', color: COR_MELHORA }]} />
            {grafico}
        </div>
    ) : grafico;
};

// ── Cenários: VPL do estudo e de cada cenário salvo ──────────────────────────

export const GraficoCenarios: React.FC<ComumDosGraficos & { linhas: LinhaDoCenario[]; corPrincipal?: string; larguraDosRotulos?: number }> = ({ linhas, corPrincipal = SERIE_PRINCIPAL, larguraDosRotulos = 140, dimensao, animado = true, className = 'h-64' }) => {
    const rotulo = `VPL por cenário: ${linhas.map(l => `${l.nome} ${brl(l.vpl)}`).join('; ')}.`;
    return (
        <div className="space-y-2">
            <Legenda svg={!!dimensao} items={[{ label: 'Estudo', color: corPrincipal }, { label: 'Cenários salvos', color: SERIE_CONTEXTO }]} />
            <Quadro dimensao={dimensao} className={className} rotulo={rotulo}>
                <BarChart accessibilityLayer={false} layout="vertical" data={linhas} margin={{ top: 4, right: 96, left: 0, bottom: 0 }} barSize={14}>
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} />
                    <YAxis type="category" dataKey="nome" width={larguraDosRotulos} tick={CATEGORY_TICK} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} formatter={(v: unknown) => [moneyBRL(Number(v)), 'VPL']} />
                    <ReferenceLine x={0} stroke="#94a3b8" />
                    <Bar dataKey="vpl" radius={[0, 4, 4, 0]} isAnimationActive={animado}>
                        {linhas.map((l, i) => <Cell key={i} fill={i === 0 ? corPrincipal : SERIE_CONTEXTO} />)}
                        {/* O valor vai à direita da ponta direita da barra: na barra negativa, isso é o zero —
                            "right" o punha à esquerda da ponta, em cima do nome do cenário. */}
                        <LabelList dataKey="vpl" content={(p: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) => {
                            const x = Number(p.x ?? 0), w = Number(p.width ?? 0), y = Number(p.y ?? 0), h = Number(p.height ?? 0);
                            return <text x={Math.max(x, x + w) + 4} y={y + h / 2} dy={4} fontSize={11} fill="#64748b">{compactAxis(Number(p.value))}</text>;
                        }} />
                    </Bar>
                </BarChart>
            </Quadro>
        </div>
    );
};

// ── Vendas por mês e estoque ─────────────────────────────────────────────────

export const GraficoVendasPorMes: React.FC<ComumDosGraficos & { dados: MesDeVendas[]; comLegenda?: boolean; corPrincipal?: string; larguraDoEixo?: number }> = ({ dados, comLegenda = true, corPrincipal = SERIE_PRINCIPAL, larguraDoEixo = 56, dimensao, animado = true, className = 'h-56' }) => {
    const pico = dados.reduce((m, d) => (d.vendas > m.vendas ? d : m), { mes: '', vendas: 0, estoque: 0 });
    const vendido = dados.reduce((a, d) => a + d.vendas, 0);
    const rotulo = `Vendas por mês: ${moneyBRL(vendido)} vendidos de ${dados[0]?.mes ?? ''} a ${dados[dados.length - 1]?.mes ?? ''}; maior venda em ${pico.mes}, ${moneyBRL(pico.vendas)}; estoque no fim ${moneyBRL(dados[dados.length - 1]?.estoque ?? 0)}.`;
    return (
        <>
            {comLegenda && <Legenda svg={!!dimensao} items={[{ label: 'Vendas do mês', color: corPrincipal }, { label: 'Estoque', color: SERIE_CONTEXTO }]} />}
            <Quadro dimensao={dimensao} className={className} rotulo={rotulo}>
                {/* Eixos separados: a venda do mês é ~1/36 do estoque inicial e sumiria no mesmo eixo. */}
                <ComposedChart accessibilityLayer={false} data={dados} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="mes" tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis yAxisId="vendas" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} width={larguraDoEixo} />
                    <YAxis yAxisId="estoque" orientation="right" tick={TICK} axisLine={false} tickLine={false} tickFormatter={compactAxis} width={larguraDoEixo} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} formatter={(v: unknown) => moneyBRL(Number(v))} />
                    <Bar yAxisId="vendas" dataKey="vendas" name="Vendas do mês" fill={corPrincipal} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={animado} />
                    <Line yAxisId="estoque" dataKey="estoque" name="Estoque" stroke={SERIE_CONTEXTO} strokeWidth={2} dot={false} type="monotone" isAnimationActive={animado} />
                </ComposedChart>
            </Quadro>
        </>
    );
};

// ── Composição do capital ────────────────────────────────────────────────────

/**
 * `cores`: paleta por fonte, no lugar da cor gravada na fatia (a do app) — o Portal do Investidor
 * passa `P.capital` (16/11/2026). A legenda leva o percentual: algumas cores do portal ficam abaixo
 * de 3:1 no branco, e o rótulo escrito é o que identifica a fatia (skill dataviz, regra de alívio).
 */
export const GraficoComposicaoDoCapital: React.FC<ComumDosGraficos & { fatias: FatiaDoCapital[]; cores?: Partial<Record<FatiaDoCapital['chave'], string>> }> = ({ fatias, cores, dimensao, animado = true, className = 'h-64' }) => {
    const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    const rotulo = `De onde vem o dinheiro: ${fatias.map(f => `${f.nome} ${pct(f.pct)}`).join('; ')}.`;
    const dados = fatias.map(f => ({ ...f, cor: cores?.[f.chave] ?? f.cor }));
    const pctDoNome = new Map(dados.map(f => [f.nome, f.pct]));
    return (
        <Quadro dimensao={dimensao} className={className} rotulo={rotulo}>
            <PieChart accessibilityLayer={false}>
                <Pie data={dados} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="pct" nameKey="nome" isAnimationActive={animado}>
                    {dados.map(f => <Cell key={f.chave} fill={f.cor} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => pct(Number(v))} />
                {/* Rótulo na cor de TEXTO (§28.3): a cor da fatia lida como texto ficava abaixo de 4,5:1. */}
                <LegendaDoRecharts verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }}
                    formatter={(v: string) => <span style={{ color: '#475569' }}>{pctDoNome.has(v) ? `${v} · ${pct(pctDoNome.get(v)!)}` : v}</span>} />
            </PieChart>
        </Quadro>
    );
};

// ── Linha do tempo: obra, vendas e marcos ────────────────────────────────────

/**
 * Geometria da linha do tempo. PDF (`dimensao` fixa): o desenho de sempre, que a captura escala.
 * Tela: pixels reais — o SVG mede a largura do cartão e desenha nela, com as fontes dos outros
 * gráficos (12 px nas categorias, como CATEGORY_TICK; 11 px nos rótulos, como TICK) e altura
 * compacta. Antes a tela usava o viewBox de 760×150 esticado: num cartão de ~1550 px tudo dobrava
 * (pedido de 16/11/2026: "despadronizado… exageradamente grande").
 */
const GEOMETRIA_DA_LINHA = {
    pdf: { esq: 70, dir: 16, faixas: [8, 52], barra: 14, rotuloDaFaixa: 10, fCategoria: 11, fRotulo: 10, abaixoDaBarra: 28, eixo: 100, marcos: [118, 134], altura: 150 },
    tela: { esq: 84, dir: 12, faixas: [4, 36], barra: 8, rotuloDaFaixa: 8, fCategoria: 12, fRotulo: 11, abaixoDaBarra: 23, eixo: 76, marcos: [95, 110], altura: 118 },
} as const;

/** Largura do contêiner em px (ResizeObserver); 0 até a primeira medida. */
function useLarguraDoConteiner<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
    const ref = React.useRef<T>(null);
    const [largura, setLargura] = React.useState(0);
    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const medir = () => setLargura(Math.round(el.getBoundingClientRect().width));
        medir();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, largura];
}

/**
 * Faixas de obra (início → habite-se) e de vendas (lançamento → fim das vendas) numa régua de
 * meses, com os outros marcos como pontos. SVG puro: sai igual na tela e na captura do PDF.
 */
export const LinhaDoTempoDosMarcos: React.FC<{ marcos: MarcoDoEstudo[]; dimensao?: DimensaoDoGrafico; className?: string; corPrincipal?: string }> = ({ marcos, dimensao, className = 'w-full', corPrincipal = SERIE_PRINCIPAL }) => {
    const [ref, larguraMedida] = useLarguraDoConteiner<HTMLDivElement>();
    const G = dimensao ? GEOMETRIA_DA_LINHA.pdf : GEOMETRIA_DA_LINHA.tela;
    const mes = (id: MarcoDoEstudo['id']) => marcos.find(m => m.id === id)?.mes ?? null;
    const comMes = marcos.filter(m => m.mes != null);
    const fim = Math.max(1, mes('encerramento') ?? 0, ...comMes.map(m => m.mes!));
    const L = dimensao?.largura ?? larguraMedida;
    const A = dimensao?.altura ?? G.altura;
    const x = (m: number) => G.esq + ((m - 1) / Math.max(1, fim - 1)) * (L - G.esq - G.dir);
    const faixa = (rotulo: string, de: number | null, ate: number | null, y: number, cor: string) => (de == null || ate == null ? null : (
        <g>
            <text x={0} y={y + G.rotuloDaFaixa} fontSize={G.fCategoria} fill="#475569">{rotulo}</text>
            <rect x={x(de)} y={y} width={Math.max(4, x(ate) - x(de))} height={G.barra} rx={4} fill={cor} />
            <text x={x(de)} y={y + G.abaixoDaBarra} fontSize={G.fRotulo} fill="#64748b">{`mês ${de}–${ate}`}</text>
        </g>
    ));
    const pontos = comMes.filter(m => !['inicio_obra', 'habite_se', 'lancamento', 'fim_das_vendas'].includes(m.id));
    const rotulo = `Linha do tempo: ${comMes.map(m => `${m.rotulo} mês ${m.mes}`).join('; ')}.`;
    const desenho = (
        <svg role="img" aria-label={rotulo} viewBox={`0 0 ${L} ${A}`} width={L} height={A}>
            {faixa('Obra', mes('inicio_obra'), mes('habite_se'), G.faixas[0], corPrincipal)}
            {faixa('Vendas', mes('lancamento'), mes('fim_das_vendas'), G.faixas[1], SERIE_CONTEXTO)}
            <line x1={G.esq} x2={L - G.dir} y1={G.eixo} y2={G.eixo} stroke="#cbd5e1" />
            {pontos.map((m, i) => (
                <g key={m.id}>
                    <circle cx={x(m.mes!)} cy={G.eixo} r={4} fill="#0f172a" />
                    {/* Ponto na ponta da régua: o texto cresce para dentro, não sai da borda. */}
                    <text x={x(m.mes!)} y={G.marcos[i % 2]} fontSize={G.fRotulo} fill="#475569"
                        textAnchor={x(m.mes!) > L - 120 ? 'end' : x(m.mes!) < G.esq + 60 ? 'start' : 'middle'}>{`${m.rotulo} · ${m.mes}`}</text>
                </g>
            ))}
        </svg>
    );
    if (dimensao) return desenho;
    // Tela: antes da primeira medida, só a altura (sem pular o layout).
    return <div ref={ref} className={className} style={{ minHeight: A }}>{L > 0 ? desenho : null}</div>;
};
