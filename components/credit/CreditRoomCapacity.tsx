import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Gauge, Scale, TrendingUp, Wallet, FileX2 } from 'lucide-react';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { KpiCardCompact } from '../ui/KpiCardCompact';
import { ChartCard, ChartEmpty, TICK, GRID, TOOLTIP_STYLE, TOOLTIP_CURSOR, INITIAL_DIMENSION, compactAxis, niceTicks } from '../analysis/chartKit';
import { formatMoney, formatDateBR } from '../ui/Format';
import { CardHeader, KpiStrip, PortalCard, PortalEmpty, Td, Th } from '../portal/PortalKit';
import { PainelProveniencia } from './CreditRoomIndicators';
import type { IndicadorKey } from '../../utils/creditRoomProvenance';
import type { CreditRoomVersion } from '../../types/creditRoom';
import type { SnapshotCapacidade } from '../../utils/creditRoomSnapshot';
import {
    ALERTA_PT, CENARIOS_ESTRESSE, estresseDaVersao, fluxosDaOperacao, resumoDaCapacidade, rotuloDoMes,
    type CenarioEstresse, type FluxosElegiveis, type SerieMes,
} from '../../utils/creditCapacity';

/**
 * Aba "Capacidade de pagamento" de uma VERSÃO congelada do Credit Room.
 *
 * Lê SÓ `version.snapshot.{capacidade,qualidade,escopo,operacao}` — nunca o
 * dado vivo: é isso que faz a empresa e o banco olharem para a mesma conta.
 * O teste de estresse reaplica um cenário à série CONGELADA, em memória:
 * nada é gravado.
 *
 * Compartilhado entre o módulo interno e o portal do credor (§24: um
 * componente, prop `accent`, mapa `ACCENTS` por extenso — o JIT do Tailwind
 * não enxerga classe montada em runtime). Cor de gráfico é hex: validada com
 * `validate_palette.js` em 22/11/2026 (§28.4) e vive só no mapa.
 *
 * "—" é dado ausente (`null`), nunca zero.
 */

type Accent = 'indigo' | 'portal';

const ACCENTS = {
    indigo: {
        // Gráfico (§28.4): vendas azul, aluguéis âmbar; serviço = linha escura.
        vendas: '#3b82f6', alugueis: '#d97706', servico: '#1e293b', estressada: '#94a3b8',
        corpo: 'text-sm', valor: 'text-gray-800', rotulo: 'text-gray-500', dica: 'text-gray-500',
        link: 'text-blue-600 hover:text-blue-800', linha: 'border-gray-100', divide: 'divide-gray-100', cab: 'bg-white border-gray-200',
        trilho: 'bg-gray-50 border-gray-100',
        abaOn: 'bg-white text-blue-600 shadow-sm', abaOff: 'text-gray-700 hover:text-gray-900',
        campo: 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-500',
        aviso: 'bg-amber-50 border-amber-200 text-amber-800',
    },
    portal: {
        vendas: '#E1553C', alugueis: '#2563eb', servico: '#1e293b', estressada: '#94a3b8',
        corpo: 'text-[13px]', valor: 'text-[#1F2430]', rotulo: 'text-[#5F6573]', dica: 'text-[#5F6573]',
        link: 'text-[#C24428] hover:text-[#E1553C]', linha: 'border-[#ECECEF]', divide: 'divide-[#ECECEF]', cab: 'bg-white border-[#ECECEF]',
        trilho: 'bg-[#F2F2F4] border-[#ECECEF]',
        abaOn: 'bg-white text-[#C24428] shadow-sm', abaOff: 'text-[#5F6573] hover:text-[#1F2430]',
        campo: 'border-[#ECECEF] focus:ring-[#E1553C]/20 focus:border-[#E1553C]',
        aviso: 'bg-[#FDF3DC] border-[#F1E2B8] text-[#8A6A16]',
    },
} as const;

type Paleta = typeof ACCENTS[Accent];

// ── Formatação (null → '—', no estilo de CreditRoomIndicators) ───────────────

const money = (v: number | null | undefined) => (v == null ? '—' : formatMoney(v));
const pct = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const vezes = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
const anos = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`;
/** Eixo de valor: uma escala só, em reais e compacta ("R$ 12 mil"). */
const compactBRL = (v: number) => `R$ ${compactAxis(v)}`;
const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

// ── Peças de cada vocabulário (app × portal) ─────────────────────────────────

const Cartao: React.FC<{ acc: Accent; titulo: string; subtitulo?: string; children: React.ReactNode }> = ({ acc, titulo, subtitulo, children }) =>
    acc === 'portal' ? (
        <PortalCard>
            <CardHeader title={titulo} subtitle={subtitulo} />
            <div className="px-5 pb-4">{children}</div>
        </PortalCard>
    ) : (
        <ChartCard title={titulo} subtitle={subtitulo}>{children}</ChartCard>
    );

const Linhas: React.FC<{ A: Paleta; itens: [string, string][] }> = ({ A, itens }) => (
    <dl className="space-y-1.5">
        {itens.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className={`${A.corpo} ${A.rotulo}`}>{k}</dt>
                <dd className={`${A.corpo} font-medium ${A.valor} text-right`}>{v}</dd>
            </div>
        ))}
    </dl>
);

interface CelulaDaTabela { v: React.ReactNode; forte?: boolean; negativo?: boolean }

/** Tabela pequena: §6.6 no app (`px-6`, `border-r`), `Th`/`Td` do kit no portal (§24). */
const Tabela: React.FC<{
    acc: Accent; descricao: string; maxH?: boolean;
    cabecalho: string[]; linhas: { chave: string; celulas: CelulaDaTabela[] }[];
}> = ({ acc, descricao, maxH, cabecalho, linhas }) => (
    <div className={`overflow-auto rounded-[10px] border ${ACCENTS[acc].linha} ${maxH ? 'max-h-[360px]' : ''}`}>
        <table className="w-full text-left border-collapse" aria-label={descricao}>
            <thead>
                <tr className={`sticky top-0 z-10 border-b ${ACCENTS[acc].cab}`}>
                    {cabecalho.map((c, i) => acc === 'portal' ? (
                        <Th key={c} className={i > 0 ? 'text-right' : ''}>{c}</Th>
                    ) : (
                        <th key={c} className={`px-6 py-2 border-r border-gray-100 last:border-r-0 text-xs font-semibold text-gray-700 whitespace-nowrap ${i > 0 ? 'text-right' : 'text-left'}`}>{c}</th>
                    ))}
                </tr>
            </thead>
            <tbody className={`divide-y ${ACCENTS[acc].divide}`}>
                {linhas.map(l => (
                    <tr key={l.chave}>
                        {l.celulas.map((c, i) => {
                            const cor = c.negativo ? 'text-red-700' : c.forte ? 'text-gray-800' : 'text-gray-700';
                            return acc === 'portal' ? (
                                <Td key={i} className={`tabular-nums ${i > 0 ? 'text-right' : ''} ${c.negativo ? 'text-red-700' : ''}`}>{c.v}</Td>
                            ) : (
                                <td key={i} className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm tabular-nums whitespace-nowrap ${c.forte || c.negativo ? 'font-medium' : 'font-normal'} ${cor} ${i > 0 ? 'text-right' : ''}`}>{c.v}</td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ── Gráfico (§28) ────────────────────────────────────────────────────────────

interface LinhaGrafico {
    mes: string; label: string;
    vendas?: number; alugueis?: number; servico?: number; estressada?: number;
    /** A série inteira do mês, para o tooltip (só no gráfico mês a mês). */
    mesCheio?: SerieMes;
}

const Dica: React.FC<{
    active?: boolean; payload?: { payload: LinhaGrafico }[];
    fluxos: FluxosElegiveis; recebido?: boolean;
}> = ({ active, payload, fluxos, recebido }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p) return null;
    const m = p.mesCheio;
    const linhas: [string, string][] = [];
    if (recebido) {
        linhas.push(['Vendas', money(p.vendas)], ['Aluguéis', money(p.alugueis)]);
    } else if (m) {
        if (fluxos.vendas) linhas.push(['Vendas', money(m.vendas)]);
        if (fluxos.alugueis) linhas.push(['Aluguéis', money(m.alugueis)], ['Despesa operacional', money(m.despesa_operacional)]);
        linhas.push(
            ['Renda líquida', money(m.renda_liquida)],
            ['Serviço da dívida', money(m.servico_atual + m.servico_novo)],
            ['Folga', money(m.folga)],
            ['DSCR', vezes(m.dscr)],
        );
        if (p.estressada != null) linhas.push(['Renda estressada', money(p.estressada)]);
    }
    return (
        <div style={TOOLTIP_STYLE} className="px-3 py-2">
            <p className="text-gray-500 mb-1">{p.label}</p>
            {linhas.map(([k, v]) => (
                <p key={k} className="flex justify-between gap-4">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-medium text-gray-800 tabular-nums">{v}</span>
                </p>
            ))}
        </div>
    );
};

/** Legenda HTML acima do gráfico (§28.3): quadrado para barra, traço para linha — a forma também diz o que é. */
const LegendaDoGrafico: React.FC<{ itens: { label: string; color: string; forma: 'barra' | 'linha' }[] }> = ({ itens }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
        {itens.map(i => (
            <span key={i.label} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                {i.forma === 'barra'
                    ? <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: i.color }} />
                    : <span className="w-4 h-0.5 shrink-0" style={{ backgroundColor: i.color }} />}
                {i.label}
            </span>
        ))}
    </div>
);

const Grafico: React.FC<{
    A: Paleta; dados: LinhaGrafico[]; altura: number; ariaLabel: string; fluxos: FluxosElegiveis;
    comServico?: boolean; comEstressada?: boolean; recebido?: boolean;
}> = ({ A, dados, altura, ariaLabel, fluxos, comServico, comEstressada, recebido }) => {
    const maxY = Math.max(1, ...dados.map(d => Math.max((d.vendas ?? 0) + (d.alugueis ?? 0), d.servico ?? 0, d.estressada ?? 0)));
    const ticks = niceTicks(maxY);
    // O raio de 4px vai na ponta do topo da pilha: aluguéis, ou vendas se aluguéis ficou de fora.
    const topo = fluxos.alugueis ? 'alugueis' : 'vendas';
    return (
        <div style={{ height: altura }} role="img" aria-label={ariaLabel}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
                <ComposedChart accessibilityLayer={false} data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={TICK} interval="preserveStartEnd" minTickGap={10} />
                    <YAxis axisLine={false} tickLine={false} tick={TICK} tickFormatter={compactBRL} width={80} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
                    <RechartsTooltip cursor={TOOLTIP_CURSOR} content={<Dica fluxos={fluxos} recebido={recebido} />} />
                    {fluxos.vendas && (
                        <Bar dataKey="vendas" stackId="renda" fill={A.vendas} maxBarSize={24} isAnimationActive={false}
                            radius={topo === 'vendas' ? [4, 4, 0, 0] : undefined} />
                    )}
                    {fluxos.alugueis && (
                        <Bar dataKey="alugueis" stackId="renda" fill={A.alugueis} maxBarSize={24} isAnimationActive={false}
                            radius={[4, 4, 0, 0]} />
                    )}
                    {comServico && (
                        <Line dataKey="servico" type="linear" stroke={A.servico} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {comEstressada && (
                        <Line dataKey="estressada" type="linear" stroke={A.estressada} strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

// ── Teste de estresse ────────────────────────────────────────────────────────

type ChaveEstresse = 'inadimplencia_pct' | 'vacancia_pct' | 'distrato_pct';
type CamposEstresse = Record<ChaveEstresse, string>;

const CAMPOS_ESTRESSE: { chave: ChaveEstresse; rotulo: string }[] = [
    { chave: 'inadimplencia_pct', rotulo: 'Inadimplência (%)' },
    { chave: 'vacancia_pct', rotulo: 'Vacância (%)' },
    { chave: 'distrato_pct', rotulo: 'Distrato (%)' },
];

const camposDoCenario = (c: CenarioEstresse): CamposEstresse => ({
    inadimplencia_pct: String(c.inadimplencia_pct),
    vacancia_pct: String(c.vacancia_pct),
    distrato_pct: String(c.distrato_pct),
});
/** Campo vazio ou inválido = 0 (sem choque): é o neutro, não um dado faltando. */
const numeroDoCampo = (s: string) => {
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
};

type Tom = 'melhor' | 'pior' | 'igual';
const TOM_COR: Record<Tom, string> = { melhor: 'text-emerald-700', pior: 'text-red-700', igual: 'text-gray-500' };

/** Diferença contra o Base: o sinal vai escrito, a cor nunca é o único sinal (§8). */
function diferenca(atual: number | null, base: number | null, formata: (n: number) => string, maiorEhMelhor: boolean): { texto: string; tom: Tom } {
    if (atual == null || base == null) return { texto: 'sem base para comparar com o Base', tom: 'igual' };
    const d = atual - base;
    if (Math.abs(d) < 0.005) return { texto: 'igual ao Base', tom: 'igual' };
    return {
        texto: `${d > 0 ? '+' : '−'}${formata(Math.abs(d))} vs. Base`,
        tom: (d > 0) === maiorEhMelhor ? 'melhor' : 'pior',
    };
}

/** `null` = sem base para calcular (série vazia): a tela mostra "—", nunca zero. */
interface ResultadoEstresse {
    valor_maximo: number | null; dscr_minimo_12m: number | null; meses_folga_negativa: number | null;
}

const PainelEstresse: React.FC<{
    acc: Accent; campos: CamposEstresse; onCampo: (k: ChaveEstresse, v: string) => void;
    onCenario: (c: CenarioEstresse) => void; ativo: number;
    estresse: ResultadoEstresse; base: ResultadoEstresse; dscrExigido: number;
    /** Campo que não muda o resultado (fluxo inelegível) → motivo escrito. */
    motivos: Partial<Record<ChaveEstresse, string>>;
    semSerie: boolean;
}> = ({ acc, campos, onCampo, onCenario, ativo, estresse, base, dscrExigido, motivos, semSerie }) => {
    const A = ACCENTS[acc];
    const ehBase = ativo === 0;
    const difs = [
        { rotulo: 'Valor máximo do empréstimo', valor: money(estresse.valor_maximo), d: diferenca(estresse.valor_maximo, base.valor_maximo, formatMoney, true) },
        { rotulo: 'DSCR mínimo 12m', valor: vezes(estresse.dscr_minimo_12m), d: diferenca(estresse.dscr_minimo_12m, base.dscr_minimo_12m, vezes, true) },
        { rotulo: 'Meses com folga negativa', valor: estresse.meses_folga_negativa == null ? '—' : String(estresse.meses_folga_negativa), d: diferenca(estresse.meses_folga_negativa, base.meses_folga_negativa, n => String(n), false) },
    ];
    const abaixo = estresse.dscr_minimo_12m != null && estresse.dscr_minimo_12m < dscrExigido;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <div className={`inline-flex items-center p-1 rounded-[10px] border gap-1 ${A.trilho}`} role="group" aria-label="Cenário">
                    {CENARIOS_ESTRESSE.map((c, i) => (
                        <button
                            key={c.nome} type="button" aria-pressed={ativo === i}
                            onClick={() => onCenario(c)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${ativo === i ? A.abaOn : A.abaOff}`}
                        >
                            {c.nome}
                        </button>
                    ))}
                </div>
                {CAMPOS_ESTRESSE.map(f => (
                    <div key={f.chave} className="space-y-1.5 max-w-[11rem]" title={motivos[f.chave]}>
                        <label htmlFor={`estresse-${f.chave}`} className={`block text-xs font-semibold ${A.rotulo}`}>{f.rotulo}</label>
                        <input
                            id={`estresse-${f.chave}`} type="number" inputMode="decimal" min={0} max={100} step={1}
                            value={campos[f.chave]} onChange={e => onCampo(f.chave, e.target.value)}
                            disabled={!!motivos[f.chave]} aria-describedby={motivos[f.chave] ? `estresse-${f.chave}-motivo` : undefined}
                            className={`w-28 h-9 px-3 bg-white border rounded-[6px] text-sm font-normal text-gray-900 outline-none focus:ring-2 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed ${A.campo}`}
                        />
                        {motivos[f.chave] && <p id={`estresse-${f.chave}-motivo`} className={`text-xs ${A.dica}`}>{motivos[f.chave]}</p>}
                    </div>
                ))}
            </div>
            <p className={`text-xs ${A.dica}`}>
                Inadimplência reduz vendas e aluguéis; vacância só os aluguéis; distrato só as vendas. A despesa e o serviço da dívida não mudam: o prédio continua custando e o banco continua cobrando.
                {ativo < 0 && ' Cenário personalizado.'}
            </p>
            {semSerie && (
                <p className={`text-xs ${A.dica}`}>Esta versão não tem meses projetados: sem série não há o que estressar.</p>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-live="polite">
                {difs.map(r => (
                    <div key={r.rotulo} className={`rounded-[10px] border px-4 py-3 min-w-0 ${A.linha}`}>
                        <dt className={`text-xs ${A.rotulo}`}>{r.rotulo}</dt>
                        <dd className={`text-lg font-semibold tabular-nums mt-0.5 ${A.valor}`}>{r.valor}</dd>
                        <dd className={`text-xs mt-0.5 ${ehBase || semSerie ? 'text-gray-500' : TOM_COR[r.d.tom]}`}>{semSerie ? 'sem série para calcular' : ehBase ? 'Cenário Base (valores congelados)' : r.d.texto}</dd>
                    </div>
                ))}
            </dl>
            {abaixo && !ehBase && (
                <p className={`text-xs ${A.dica}`}>
                    O DSCR mínimo fica abaixo dos {vezes(dscrExigido)} exigidos nesta operação.
                </p>
            )}
        </div>
    );
};

const SEM_BASE: ResultadoEstresse = { valor_maximo: null, dscr_minimo_12m: null, meses_folga_negativa: null };

// ── A aba ────────────────────────────────────────────────────────────────────

interface Props {
    version: CreditRoomVersion;
    accent?: Accent;
}

const CreditRoomCapacity: React.FC<Props> = ({ version, accent = 'indigo' }) => {
    const A = ACCENTS[accent];
    const s = version.snapshot;
    const c: SnapshotCapacidade | null = s.capacidade ?? null;
    const fluxos = React.useMemo(() => fluxosDaOperacao(s), [s]);

    const [explicando, setExplicando] = React.useState<IndicadorKey | null>(null);
    const [verTabela, setVerTabela] = React.useState(false);
    const [campos, setCampos] = React.useState<CamposEstresse>(() => camposDoCenario(CENARIOS_ESTRESSE[0]));

    const cenario: CenarioEstresse = {
        nome: 'Personalizado',
        inadimplencia_pct: numeroDoCampo(campos.inadimplencia_pct),
        vacancia_pct: numeroDoCampo(campos.vacancia_pct),
        distrato_pct: numeroDoCampo(campos.distrato_pct),
    };
    // Campo que o fluxo inelegível torna inócuo fica desligado e NÃO conta para dizer
    // qual cenário está ativo — senão desligá-lo viraria "personalizado".
    const motivos: Partial<Record<ChaveEstresse, string>> = {
        ...(!fluxos.alugueis && { vacancia_pct: 'Sem efeito: aluguéis não entram no DSCR desta operação.' }),
        ...(!fluxos.vendas && { distrato_pct: 'Sem efeito: vendas não entram no DSCR desta operação.' }),
        ...(!fluxos.vendas && !fluxos.alugueis && { inadimplencia_pct: 'Sem efeito: nenhum fluxo entra no DSCR desta operação.' }),
    };
    const ativo = CENARIOS_ESTRESSE.findIndex(x =>
        (!!motivos.inadimplencia_pct || x.inadimplencia_pct === cenario.inadimplencia_pct)
        && (!!motivos.vacancia_pct || x.vacancia_pct === cenario.vacancia_pct)
        && (!!motivos.distrato_pct || x.distrato_pct === cenario.distrato_pct));

    const resumo = React.useMemo(() => resumoDaCapacidade(c), [c]);
    const estresse = React.useMemo(
        () => (c ? estresseDaVersao(c, cenario, fluxos) : null),
        // `cenario` é recalculado a cada render; as três porcentagens são o que importa.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [c, fluxos, cenario.inadimplencia_pct, cenario.vacancia_pct, cenario.distrato_pct],
    );

    // ── Versão sem capacidade (schema 1): estado vazio que diz o que fazer ──
    if (!c || !resumo || !estresse) {
        return accent === 'portal' ? (
            <PortalCard>
                <PortalEmpty
                    icon={<FileX2 className="w-9 h-9" />}
                    title="Esta versão não traz a capacidade de pagamento"
                    subtitle="Versão congelada antes da capacidade de pagamento — peça à empresa que congele uma nova."
                />
            </PortalCard>
        ) : (
            <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
                <FileX2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Esta versão não traz a capacidade de pagamento</h3>
                <p className="text-sm text-gray-500">Versão congelada antes da capacidade de pagamento — congele uma nova.</p>
            </div>
        );
    }

    const q = s.qualidade ?? null;
    const escopo = s.escopo ?? null;
    const nEmpresas = escopo?.organizacoes.length ?? 0;
    const dscrExigido = c.parametros.dscr_minimo;
    const horizonte = c.serie;
    const mostrarEstressada = ativo !== 0;
    const semSerie = c.serie.length === 0;
    // O Base é SEMPRE o número congelado (uma só máxima para o banco ver): o cenário Base
    // não é recalculado, e a diferença dos outros cenários é contra ele.
    const congelado: ResultadoEstresse = {
        valor_maximo: c.capacidade_maxima.valor_maximo,
        dscr_minimo_12m: resumo.dscr_minimo_12m,
        meses_folga_negativa: resumo.meses_folga_negativa,
    };

    // ── KPIs (cada um abre a proveniência) ──
    const kpis: { label: string; value: string; hint?: string; chave: IndicadorKey; color: 'blue' | 'indigo' | 'emerald' | 'red' | 'teal'; icon: React.ReactNode }[] = [
        {
            label: 'Valor máximo do empréstimo', value: money(c.capacidade_maxima.valor_maximo),
            hint: `parcela máxima ${money(c.capacidade_maxima.parcela_maxima)} · DSCR ≥ ${vezes(dscrExigido)}`,
            chave: 'capacidade_maxima', color: 'blue', icon: <Wallet className="w-4 h-4" />,
        },
        {
            label: 'Renda líquida média 12m', value: money(resumo.renda_liquida_media_12m),
            hint: 'após a despesa operacional', chave: 'renda_liquida_media', color: 'indigo', icon: <TrendingUp className="w-4 h-4" />,
        },
        {
            label: 'DSCR mínimo 12m', value: vezes(resumo.dscr_minimo_12m),
            hint: resumo.dscr_minimo_12m == null ? 'sem serviço da dívida'
                : resumo.dscr_minimo_12m < dscrExigido ? `abaixo dos ${vezes(dscrExigido)} exigidos` : undefined,
            chave: 'dscr_minimo_12m',
            color: resumo.dscr_minimo_12m != null && resumo.dscr_minimo_12m < dscrExigido ? 'red' : 'emerald',
            icon: <Gauge className="w-4 h-4" />,
        },
        {
            label: 'Folga mínima 12m', value: money(resumo.folga_minima_12m),
            hint: resumo.mes_folga_minima
                ? `${rotuloDoMes(resumo.mes_folga_minima)}${resumo.folga_minima_12m != null && resumo.folga_minima_12m < 0 ? ' · mês no vermelho' : ''}`
                : undefined,
            chave: 'folga_minima', color: resumo.folga_minima_12m != null && resumo.folga_minima_12m < 0 ? 'red' : 'teal',
            icon: <Scale className="w-4 h-4" />,
        },
    ];

    // ── Gráfico mês a mês: só os fluxos que entram no DSCR ──
    const ficaramFora = [!fluxos.vendas && 'recebíveis de vendas', !fluxos.alugueis && 'aluguéis (NOI)'].filter(Boolean) as string[];
    const nenhumFluxo = !fluxos.vendas && !fluxos.alugueis;
    const dados: LinhaGrafico[] = horizonte.map((m, i) => ({
        mes: m.mes, label: rotuloDoMes(m.mes), mesCheio: m,
        vendas: fluxos.vendas ? m.vendas : undefined,
        alugueis: fluxos.alugueis ? m.alugueis : undefined,
        servico: m.servico_atual + m.servico_novo,
        estressada: mostrarEstressada
            ? (fluxos.vendas ? estresse.serie[i].vendas : 0) + (fluxos.alugueis ? estresse.serie[i].alugueis : 0)
            : undefined,
    }));
    const ariaMes = `Renda contratada e serviço da dívida por mês, de ${rotuloDoMes(horizonte[0]?.mes ?? '')} a ${rotuloDoMes(horizonte[horizonte.length - 1]?.mes ?? '')}. `
        + dados.map(d => `${d.label}: ${[
            fluxos.vendas ? `vendas ${money(d.vendas)}` : null,
            fluxos.alugueis ? `aluguéis ${money(d.alugueis)}` : null,
            `serviço ${money(d.servico)}`,
        ].filter(Boolean).join(', ')}`).join('; ') + '.';
    const subtituloMes = `Valores contratados, sem reajuste, em reais.${ficaramFora.length
        ? ` Fora do gráfico e do DSCR: ${ficaramFora.join(' e ')} — fluxo não marcado como elegível nesta operação.`
        : ''}`;

    // ── Recebido nos últimos 12 meses ──
    const recebido = c.recebido_12m;
    const comValor = recebido.filter(r => r.vendas + r.alugueis > 0);
    const totalRecebido = recebido.reduce((a, r) => a + r.vendas + r.alugueis, 0);
    const dadosRecebido: LinhaGrafico[] = recebido.map(r => ({ mes: r.mes, label: rotuloDoMes(r.mes), vendas: r.vendas, alugueis: r.alugueis }));
    const ariaRecebido = `Recebido nos últimos 12 meses: total ${money(totalRecebido)}. `
        + comValor.map(r => `${rotuloDoMes(r.mes)}: vendas ${money(r.vendas)}, aluguéis ${money(r.alugueis)}`).join('; ') + '.';
    const ambos: FluxosElegiveis = { vendas: true, alugueis: true };

    const legendaMes = [
        ...(fluxos.vendas ? [{ label: 'Vendas', color: A.vendas, forma: 'barra' as const }] : []),
        ...(fluxos.alugueis ? [{ label: 'Aluguéis', color: A.alugueis, forma: 'barra' as const }] : []),
        { label: 'Serviço da dívida', color: A.servico, forma: 'linha' as const },
        ...(mostrarEstressada ? [{ label: 'Renda estressada', color: A.estressada, forma: 'linha' as const }] : []),
    ];

    // ── Tabela mês a mês: as mesmas colunas do tooltip ──
    const cabecalhoMes = ['Mês',
        ...(fluxos.vendas ? ['Vendas'] : []),
        ...(fluxos.alugueis ? ['Aluguéis', 'Despesa operacional'] : []),
        'Renda líquida', 'Serviço da dívida', 'Folga', 'DSCR'];
    const linhasMes = horizonte.map(m => ({
        chave: m.mes,
        celulas: [
            { v: rotuloDoMes(m.mes) },
            ...(fluxos.vendas ? [{ v: money(m.vendas), forte: true }] : []),
            ...(fluxos.alugueis ? [{ v: money(m.alugueis), forte: true }, { v: money(m.despesa_operacional), forte: true }] : []),
            { v: money(m.renda_liquida), forte: true },
            { v: money(m.servico_atual + m.servico_novo), forte: true },
            { v: money(m.folga), forte: true, negativo: m.folga < 0 },
            { v: vezes(m.dscr) },
        ] as CelulaDaTabela[],
    }));

    const porEmpresa = escopo?.tipo === 'GRUPO' && c.por_organizacao.length > 0 ? c.por_organizacao : null;

    const rodape = [
        'Contratado, sem reajuste',
        `data-base ${formatDateBR(s.data_base)}`,
        escopo ? `escopo ${escopo.tipo === 'GRUPO' ? 'Grupo' : 'Empresa'} (${plural(nEmpresas, 'empresa', 'empresas')})` : null,
    ].filter(Boolean).join(' · ');

    return (
        <div className="space-y-4">
            {/* 1. KPIs — o clique abre de onde vem o número */}
            {accent === 'portal' ? (
                <KpiStrip items={kpis.map(k => ({
                    label: k.label, value: k.value,
                    hint: k.hint ? `${k.hint} · ver origem` : 'ver origem',
                    onClick: () => setExplicando(k.chave),
                }))} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {kpis.map(k => (
                        <KpiCardCompact
                            key={k.label} label={k.label} value={k.value}
                            sub={k.hint ? `${k.hint} · ver origem` : 'ver origem'}
                            icon={k.icon} color={k.color}
                            onClick={() => setExplicando(k.chave)} title="Ver de onde vem este número"
                        />
                    ))}
                </div>
            )}
            <p className={`text-xs ${A.dica}`}>{rodape}</p>
            <PainelProveniencia aberto={explicando != null} onClose={() => setExplicando(null)} version={version} chave={explicando} />

            {/* 2. Mês a mês */}
            <Cartao acc={accent} titulo="Mês a mês" subtitulo={subtituloMes}>
                {horizonte.length === 0 ? (
                    <ChartEmpty>Esta versão não tem meses projetados.</ChartEmpty>
                ) : nenhumFluxo ? (
                    <ChartEmpty>Nenhum fluxo (vendas ou aluguéis) está marcado como elegível nesta operação — não há renda a comparar com o serviço da dívida.</ChartEmpty>
                ) : (
                    <>
                        <LegendaDoGrafico itens={legendaMes} />
                        <Grafico A={A} dados={dados} altura={260} ariaLabel={ariaMes} fluxos={fluxos} comServico comEstressada={mostrarEstressada} />
                    </>
                )}
                {horizonte.length > 0 && (
                    <div className="mt-2">
                        <button
                            type="button" onClick={() => setVerTabela(v => !v)}
                            aria-expanded={verTabela} aria-controls="capacidade-tabela-mes"
                            className={`inline-flex items-center gap-1 h-8 ${A.corpo} font-medium ${A.link}`}
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${verTabela ? 'rotate-180' : ''}`} />
                            {verTabela ? 'Ocultar tabela' : 'Ver tabela'}
                        </button>
                        {verTabela && (
                            <div id="capacidade-tabela-mes" className="mt-2">
                                <Tabela acc={accent} descricao="Capacidade de pagamento mês a mês" maxH cabecalho={cabecalhoMes} linhas={linhasMes} />
                            </div>
                        )}
                    </div>
                )}
            </Cartao>

            {/* 3. Teste de estresse — reaplica o cenário à série congelada; nada grava */}
            <Cartao acc={accent} titulo="Teste de estresse" subtitulo="Reaplica o cenário à série desta versão. É só uma simulação nesta tela: nada é gravado.">
                <PainelEstresse
                    acc={accent} campos={campos}
                    onCampo={(k, v) => setCampos(prev => ({ ...prev, [k]: v }))}
                    onCenario={cn => setCampos(camposDoCenario(cn))}
                    ativo={ativo} dscrExigido={dscrExigido}
                    estresse={semSerie ? SEM_BASE : ativo === 0 ? congelado : {
                        valor_maximo: estresse.capacidade_maxima.valor_maximo,
                        dscr_minimo_12m: estresse.dscr_minimo_12m,
                        meses_folga_negativa: estresse.meses_folga_negativa,
                    }}
                    base={semSerie ? SEM_BASE : congelado}
                    motivos={motivos} semSerie={semSerie}
                />
            </Cartao>

            {/* 4. Recebido nos últimos 12 meses */}
            <Cartao
                acc={accent} titulo="Recebido nos últimos 12 meses"
                subtitulo={recebido.length ? `Total recebido: ${money(totalRecebido)}.` : undefined}
            >
                {recebido.length === 0 ? (
                    <ChartEmpty>Esta versão não traz o histórico de recebimentos.</ChartEmpty>
                ) : comValor.length === 0 ? (
                    <ChartEmpty>Nenhum recebimento registrado nos últimos 12 meses.</ChartEmpty>
                ) : comValor.length <= 2 ? (
                    // Um ou dois meses com valor: doze colunas são dez vazias — a lista diz o mesmo (§28.5).
                    <ul className={`flex flex-col divide-y ${A.divide}`}>
                        {comValor.map(r => (
                            <li key={r.mes} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 ${A.corpo}`}>
                                <span className={A.valor}>{rotuloDoMes(r.mes)}</span>
                                <span className={A.rotulo}>vendas {money(r.vendas)} · aluguéis {money(r.alugueis)}</span>
                                <span className={`font-medium tabular-nums ${A.valor}`}>{money(r.vendas + r.alugueis)}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <>
                        <LegendaDoGrafico itens={[
                            { label: 'Vendas', color: A.vendas, forma: 'barra' },
                            { label: 'Aluguéis', color: A.alugueis, forma: 'barra' },
                        ]} />
                        <Grafico A={A} dados={dadosRecebido} altura={200} ariaLabel={ariaRecebido} fluxos={ambos} recebido />
                    </>
                )}
            </Cartao>

            {/* 5 e 6. Estoque e qualidade da renda */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Cartao acc={accent} titulo="Estoque a vender">
                    {c.estoque ? (
                        <div className="space-y-3">
                            <Linhas A={A} itens={[
                                ['VGV disponível', money(c.estoque.vgv_disponivel)],
                                ['Haircut', pct(c.estoque.haircut_pct)],
                                ['Valor elegível', money(c.estoque.valor_elegivel)],
                            ]} />
                            <p className={`text-xs ${A.dica}`}>Não entra no DSCR — potencial de venda/garantia.</p>
                        </div>
                    ) : (
                        <p className={`${A.corpo} ${A.rotulo}`}>Sem estoque disponível a considerar nesta versão.</p>
                    )}
                </Cartao>
                <Cartao acc={accent} titulo="Qualidade da renda">
                    <div className="space-y-3">
                        <Linhas A={A} itens={[
                            ['Concentração nos 5 maiores pagadores', pct(q?.concentracao_top5_pct)],
                            ['Prazo médio dos contratos (WALE)', anos(q?.wale_anos)],
                            ['Locações com prazo indeterminado', q == null ? '—' : String(q.locacoes_prazo_indeterminado)],
                            ['Pontualidade nos últimos 12 meses', pct(q?.pontualidade_12m_pct)],
                            ['Vencido na data-base', money(c.vencido_na_data_base)],
                        ]} />
                        <p className={`text-xs ${A.dica}`}>
                            {q == null
                                ? 'Esta versão não calculou a qualidade da renda.'
                                : '— = sem base para calcular (por exemplo, nenhum título venceu na janela).'}
                        </p>
                    </div>
                </Cartao>
            </div>

            {/* 7. Alertas da carteira */}
            <Cartao acc={accent} titulo="Alertas da carteira" subtitulo="Furos de cadastro que distorcem a projeção.">
                {c.alertas.length === 0 ? (
                    <p className={`flex items-center gap-2 ${A.corpo} ${A.valor}`}>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        Carteira sem pendências de cadastro
                    </p>
                ) : (
                    <ul className="space-y-3">
                        {c.alertas.map(a => (
                            <li key={a.tipo} className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                                <div className="min-w-0">
                                    <p className={`${A.corpo} font-medium ${A.valor}`}>
                                        {ALERTA_PT[a.tipo]?.titulo ?? a.tipo}
                                        <span className={`font-normal ${A.rotulo}`}> · {plural(a.qtd, 'item', 'itens')} · {a.valor > 0 ? money(a.valor) : '—'}</span>
                                    </p>
                                    {/* O "como resolver" é do cadastro da empresa: não vai ao credor. */}
                                    {accent === 'indigo' && ALERTA_PT[a.tipo] && (
                                        <p className={`text-xs mt-0.5 ${A.dica}`}>{ALERTA_PT[a.tipo].comoResolver}</p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Cartao>

            {/* 8. Grupo: uma linha por empresa */}
            {porEmpresa && (
                <Cartao acc={accent} titulo="Por empresa" subtitulo="Renda e serviço dos 12 primeiros meses e dívida total de cada empresa do grupo.">
                    <Tabela
                        acc={accent} descricao="Capacidade por empresa do grupo"
                        cabecalho={['Empresa', 'Renda 12m', 'Serviço 12m', 'Dívida total']}
                        linhas={porEmpresa.map(o => ({
                            chave: o.organization_id,
                            celulas: [
                                { v: escopo?.organizacoes.find(x => x.id === o.organization_id)?.nome ?? 'Empresa fora do escopo' },
                                { v: money(o.renda_12m), forte: true },
                                { v: money(o.servico_12m), forte: true },
                                { v: money(o.divida_total), forte: true },
                            ],
                        }))}
                    />
                </Cartao>
            )}
        </div>
    );
};

export default CreditRoomCapacity;
