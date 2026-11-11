import React from 'react';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';

/**
 * KpiCard — Padrão Global OrçaCloud
 * Fonte: docs/ui_ux_guia_unificado.md § 4. KPI CARDS
 *
 * Desenho (o do Calendário Financeiro, propagado para o app inteiro em
 * 12/09/2026): card branco `rounded-xl border-gray-200 px-4 py-3`, ícone em
 * bolha circular colorida (`w-8 h-8 rounded-full bg-{cor}-100`), rótulo
 * uppercase em cinza e valor `text-sm font-bold` na cor do KPI. Grade
 * recomendada: `gap-3`.
 *
 * Uso:
 *   <KpiCard
 *     label="Total Emitido"
 *     value="R$ 120.000"
 *     sub="12 cobranças"          // opcional — linha pequena em cinza
 *     icon={<Landmark className="w-4 h-4" />}
 *     color="blue"
 *   />
 *
 * Cores: blue | emerald | green | amber | red | purple | gray | violet | orange
 *        | indigo | rose | teal | cyan | sky
 */

export type KpiColor =
    | 'blue' | 'emerald' | 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'violet'
    | 'orange' | 'indigo' | 'rose' | 'teal' | 'cyan' | 'sky';

const COLOR_MAP: Record<KpiColor, { bubble: string; icon: string; value: string }> = {
    blue:    { bubble: 'bg-blue-100',    icon: 'text-blue-600',    value: 'text-blue-700' },
    emerald: { bubble: 'bg-emerald-100', icon: 'text-emerald-600', value: 'text-emerald-700' },
    green:   { bubble: 'bg-green-100',   icon: 'text-green-600',   value: 'text-green-700' },
    amber:   { bubble: 'bg-amber-100',   icon: 'text-amber-600',   value: 'text-amber-700' },
    red:     { bubble: 'bg-red-100',     icon: 'text-red-600',     value: 'text-red-700' },
    purple:  { bubble: 'bg-purple-100',  icon: 'text-purple-600',  value: 'text-purple-700' },
    gray:    { bubble: 'bg-gray-100',    icon: 'text-gray-500',    value: 'text-gray-700' },
    violet:  { bubble: 'bg-violet-100',  icon: 'text-violet-600',  value: 'text-violet-700' },
    orange:  { bubble: 'bg-orange-100',  icon: 'text-orange-600',  value: 'text-orange-700' },
    indigo:  { bubble: 'bg-indigo-100',  icon: 'text-indigo-600',  value: 'text-indigo-700' },
    rose:    { bubble: 'bg-rose-100',    icon: 'text-rose-600',    value: 'text-rose-700' },
    teal:    { bubble: 'bg-teal-100',    icon: 'text-teal-600',    value: 'text-teal-700' },
    cyan:    { bubble: 'bg-cyan-100',    icon: 'text-cyan-600',    value: 'text-cyan-700' },
    sky:     { bubble: 'bg-sky-100',     icon: 'text-sky-600',     value: 'text-sky-700' },
};

/**
 * Converte uma classe Tailwind de cor (`bg-rose-50`, `text-slate-700`) na
 * paleta do KpiCard — para telas antigas que guardavam a cor como classe.
 * `slate` vira `gray`; cor desconhecida cai em `blue`.
 */
export function kpiColorFromClass(cls: string): KpiColor {
    const m = /(?:bg|text|border)-([a-z]+)-\d+/.exec(cls);
    const nome = m ? m[1] : cls;
    const cor = nome === 'slate' ? 'gray' : nome;
    return (cor in COLOR_MAP ? cor : 'blue') as KpiColor;
}

interface KpiCardProps {
    /** Rótulo do indicador (renderizado em uppercase) */
    label: string;
    /** Valor principal (string ou número formatado) */
    value: string | number;
    /** Dica curta abaixo do valor (opcional — omita quando for redundante, §4.1) */
    sub?: string;
    /** Ícone Lucide. O tamanho é normalizado para 16px (w-4 h-4) dentro da bolha. */
    icon?: React.ReactNode;
    /** Paleta da bolha, do ícone e do valor */
    color?: KpiColor;
    /** Classe CSS extra no card raiz */
    className?: string;
    /** Ao clicar no card (opcional) */
    onClick?: () => void;
    /** Tooltip nativo do card (opcional) */
    title?: string;
    /** Mantido por compatibilidade — o desenho atual não tem sombra. */
    shadow?: boolean;
    /** Mantido por compatibilidade — `lg` deixa o valor um degrau maior (text-base); `sm`/`md` são iguais. */
    size?: 'sm' | 'md' | 'lg';
    /** Pulsa a bolha do ícone — para chamar atenção a um estado pendente/aguardando ação. Default false. */
    pulse?: boolean;
    /**
     * Indicador PRINCIPAL de painel analítico (guia §4.5) — valor grande, cor
     * neutra, e a cor só aparece por `tom` (limiar). Não use em tela de
     * listagem: lá vale a §4 (cor semântica por KPI).
     */
    destaque?: boolean;
    /** Só com `destaque`: estado pelo limiar. `neutro` (padrão) não pinta nada. */
    tom?: KpiTom;
    /** Só com `destaque`: a ação que o número pede ("Cobrar", "Ver renovações"). */
    acao?: { label: string; onClick: () => void };
    /** Só com `destaque` (§4.5.2): o número mês a mês, do mais antigo a hoje. `null` =
     *  mês não medido (a linha quebra ali; nunca vira zero). Menos de 2 pontos = sem linha. */
    serie?: (number | null)[];
    /** Só com `destaque` (§4.5.2): hoje × mês anterior. Monte com `tendenciaDaSerie`. */
    tendencia?: KpiTendencia | null;
    /** Só com `destaque` e `tom="alerta"` (§4.5.2): fundo vermelho sólido. Quem decide é a
     *  tela (ex.: `cardSolido` — alerta E piorando); fora do alerta é ignorado. */
    solido?: boolean;
    /** Só com `destaque`: conta o número de 0 até `alvo` na PRIMEIRA carga (750 ms). Trocar
     *  de organização/período depois não anima — número que "cresce" a cada clique lê como
     *  dado mudando (§28.2). Sem efeito com `prefers-reduced-motion`. */
    contagem?: { alvo: number; formatar: (v: number) => string };
}

export type KpiTom = 'neutro' | 'atencao' | 'alerta';

/** Variação do indicador de destaque em relação ao mês anterior. */
export interface KpiTendencia {
    /** Já com sinal: "+0,4%", "−20,0%" ou "+R$ 8 mil" (base zero/negativa). */
    texto: string;
    direcao: 'sobe' | 'desce' | 'estavel';
    /** A cor diz se MELHOROU, não para onde foi: "a pagar" caindo é verde. */
    bom: boolean;
    /** Fração (0,004 = 0,4%); null quando a variação está em reais. */
    pct: number | null;
    /** Contra o quê: "vs. out/26". */
    base: string;
}

/** Valor do indicador de destaque por estado. O ícone de alerta ao lado do
 *  valor é o sinal que não depende de cor (quem não distingue o vermelho). */
const TOM_VALOR: Record<KpiTom, string> = {
    neutro: 'text-gray-900',
    atencao: 'text-amber-700',
    alerta: 'text-red-700',
};

/** Série principal do §28.4 — a mesma cor dos gráficos do app. */
const COR_SERIE = '#3b82f6';

/**
 * Linha do mês a mês sob o número (§4.5.2). Só forma: sem eixo, sem rótulo — o valor
 * exato é o número do card. `null` quebra a linha (mês não medido não é zero). Ponto
 * cheio no último valor quando ele é o de hoje.
 */
const Sparkline: React.FC<{ serie: (number | null)[]; cor: string }> = ({ serie, cor }) => {
    const medidos = serie.filter((v): v is number => v != null);
    if (medidos.length < 2) return null;
    const L = 200, A = 32, folga = 4;
    const min = Math.min(...medidos), max = Math.max(...medidos);
    const x = (i: number) => (serie.length === 1 ? L : (i / (serie.length - 1)) * L);
    const y = (v: number) => folga + (1 - (v - min) / (max - min || 1)) * (A - folga * 2);
    // Trechos contínuos de pontos medidos.
    const trechos: { i: number; v: number }[][] = [];
    serie.forEach((v, i) => {
        if (v == null) { trechos.push([]); return; }
        if (trechos.length === 0) trechos.push([]);
        trechos[trechos.length - 1].push({ i, v });
    });
    const ultimo = serie[serie.length - 1];
    return (
        <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" className="mt-2.5 block w-full h-8 overflow-visible" aria-hidden="true">
            {trechos.filter(t => t.length >= 2).map((t, k) => {
                const pts = t.map(p => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
                return (
                    <g key={k}>
                        <polygon points={`${x(t[0].i).toFixed(1)},${A} ${pts} ${x(t[t.length - 1].i).toFixed(1)},${A}`} fill={cor} fillOpacity={0.12} />
                        <polyline points={pts} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </g>
                );
            })}
            {ultimo != null && (
                // círculo deformaria com preserveAspectRatio="none": o ponto é um traço de largura zero
                <line x1={L} y1={y(ultimo)} x2={L} y2={y(ultimo)} stroke={cor} strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            )}
        </svg>
    );
};

/** Conta até o alvo na primeira vez que ele aparece; depois, troca direto. */
function useContagemInicial(contagem?: { alvo: number; formatar: (v: number) => string }): string | null {
    const alvo = contagem?.alvo;
    const formatar = contagem?.formatar;
    const [texto, setTexto] = React.useState<string | null>(() =>
        alvo == null || !formatar ? null : querMovimento() ? formatar(0) : formatar(alvo));
    const jaContou = React.useRef(false);
    React.useEffect(() => {
        if (alvo == null || !formatar) { setTexto(null); return; }
        if (jaContou.current || !querMovimento()) { jaContou.current = true; setTexto(formatar(alvo)); return; }
        jaContou.current = true;
        const t0 = performance.now();
        let quadro = 0;
        const passo = (t: number) => {
            const p = Math.min(1, (t - t0) / 750);
            const suave = 1 - Math.pow(1 - p, 3);
            setTexto(formatar(p < 1 ? alvo * suave : alvo));
            if (p < 1) quadro = requestAnimationFrame(passo);
        };
        quadro = requestAnimationFrame(passo);
        return () => { cancelAnimationFrame(quadro); setTexto(formatar(alvo)); };
    }, [alvo, formatar]);
    return texto;
}

function querMovimento(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function' || typeof requestAnimationFrame !== 'function') return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Normaliza o ícone recebido para 16px: as chamadas antigas passam `w-5 h-5`. */
function iconeNormalizado(icon: React.ReactNode): React.ReactNode {
    if (!React.isValidElement<{ className?: string }>(icon)) return icon;
    const atual = (icon.props.className ?? '').replace(/\b[wh]-\d+(\.\d+)?\b/g, '').trim();
    return React.cloneElement(icon, { className: `w-4 h-4 ${atual}`.trim() });
}

/**
 * Componente canônico de KPI Card.
 * Layout: bolha com ícone à esquerda + label/valor/dica à direita.
 */
export function KpiCard({
    label,
    value,
    sub,
    icon,
    color = 'blue',
    className = '',
    onClick,
    title,
    size = 'md',
    pulse = false,
    destaque = false,
    tom = 'neutro',
    acao,
    serie,
    tendencia,
    solido = false,
    contagem,
}: KpiCardProps) {
    const c = COLOR_MAP[color] ?? COLOR_MAP.blue;
    const isClickable = !!onClick;
    const valorContado = useContagemInicial(destaque ? contagem : undefined);

    if (destaque) {
        // Sólido só existe no alerta (§4.5.2): fora dele a prop é ignorada.
        const cheio = solido && tom === 'alerta';
        return (
            <div
                title={title}
                data-solido={cheio || undefined}
                className={`${cheio ? 'bg-red-700 border-red-700' : 'bg-white border-gray-200'} rounded-xl border px-4 py-3.5 flex flex-col min-w-0 ${className}`}
            >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        {icon && <span className={`${cheio ? 'text-white' : 'text-gray-400'} shrink-0`}>{iconeNormalizado(icon)}</span>}
                        <p className={`text-sm font-medium ${cheio ? 'text-white' : 'text-gray-600'} truncate`}>{label}</p>
                    </div>
                    {tendencia && (
                        <p className="inline-flex items-center gap-1 text-xs whitespace-nowrap" title={`${tendencia.texto} ${tendencia.base}`}>
                            <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${cheio ? 'text-white' : tendencia.direcao === 'estavel' ? 'text-gray-600' : tendencia.bom ? 'text-emerald-700' : 'text-red-700'}`}>
                                {tendencia.direcao === 'sobe' && <ArrowUp className="w-3 h-3" aria-hidden="true" />}
                                {tendencia.direcao === 'desce' && <ArrowDown className="w-3 h-3" aria-hidden="true" />}
                                {tendencia.texto}
                            </span>
                            <span className={cheio ? 'text-white' : 'text-gray-500'}>{tendencia.base}</span>
                            {/* A cor não é o único sinal (quem não distingue o vermelho do verde). */}
                            {tendencia.direcao !== 'estavel' && <span className="sr-only">{tendencia.bom ? '(melhorou)' : '(piorou)'}</span>}
                        </p>
                    )}
                </div>
                <p className={`mt-1.5 flex items-center gap-1.5 text-2xl font-semibold leading-tight tabular-nums ${cheio ? 'text-white' : TOM_VALOR[tom]}`}>
                    {tom !== 'neutro' && <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />}
                    <span className="truncate">{valorContado ?? value}</span>
                    {tom !== 'neutro' && <span className="sr-only">{tom === 'alerta' ? '(alerta)' : '(atenção)'}</span>}
                </p>
                {serie && <Sparkline serie={serie} cor={cheio ? '#ffffff' : COR_SERIE} />}
                {/* Quebra em vez de cortar: no destaque a legenda é a BASE do número (§4.5) — em
                    Conciliação › Dashboard ela nomeia as contas que não batem, e no celular o corte
                    escondia os nomes (o `title` não existe no toque). */}
                {sub && <p className={`mt-1 text-xs ${cheio ? 'text-white' : 'text-gray-500'} [text-wrap:pretty]`}>{sub}</p>}
                {acao && (
                    <button
                        type="button"
                        onClick={acao.onClick}
                        className={`mt-2 self-start inline-flex items-center gap-1 text-sm font-medium rounded-[4px] focus:outline-none focus-visible:ring-2 ${cheio
                            ? 'text-white underline underline-offset-2 hover:decoration-2 focus-visible:ring-white'
                            : 'text-blue-600 hover:text-blue-800 focus-visible:ring-blue-600'}`}
                    >
                        {acao.label}
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div
            onClick={onClick}
            title={title}
            className={[
                'bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3',
                isClickable ? 'cursor-pointer transition-transform active:scale-[0.98]' : '',
                className,
            ].join(' ')}
        >
            {icon && (
                <div className={`w-8 h-8 rounded-full ${c.bubble} flex items-center justify-center shrink-0 ${pulse ? 'animate-pulse' : ''}`}>
                    <span className={c.icon}>{iconeNormalizado(icon)}</span>
                </div>
            )}
            <div className="min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
                <p className={`${size === 'lg' ? 'text-base' : 'text-sm'} font-bold ${c.value} truncate`}>{value}</p>
                {/* gray-500 em 12px: o gray-400 em 11px dava 2,6:1 sobre branco
                    (abaixo dos 4,5:1), medido na aba Análise de Locações (26/10/2026). */}
                {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
            </div>
        </div>
    );
}

export default KpiCard;
