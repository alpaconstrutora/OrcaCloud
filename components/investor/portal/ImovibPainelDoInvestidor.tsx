/**
 * Painel de viabilidade do investidor (Fase 4 do plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md) — aba "Viabilidade &
 * Investimento" da oportunidade.
 *
 * - Os números são os da VERSÃO publicada (`versaoPublicada`); a simulação calcula à parte e diz
 *   que não altera a versão.
 * - "Baixar relatório (PDF)" gera a edição do investidor do relatório completo da mesma versão
 *   (components/ImovibGraficosParaPdf.tsx), o mesmo documento que a equipe baixa na aba Versões.
 * - Visual: referência pedida pelo usuário (vidro fosco, brilho, hover animado) no vocabulário do
 *   portal (§24, `PortalVidro`/`FundoDeVidro` do kit). Componente compartilhado com a prévia do
 *   gestor: `accent="indigo"` (padrão) segue o guia do app; `accent="portal"` é o do link.
 */
import React from 'react';
import { Download, Loader2, RotateCcw } from 'lucide-react';
import type { ImovibStudy, ImovibScenario } from '../../../types';
import { useImovibMath } from '../../../hooks/useImovibMath';
import { calcularIndicadores, textoDoPayback } from '../../../utils/imovibIndicadores';
import { IMOVIB_DEFAULTS } from '../../../constants/imovibDefaults';
import { estudoComPrazoDoPortal } from '../../../utils/imovibVariacoes';
import { indicadoresDoEstudo, graficosDoEstudo } from '../../../utils/imovibCalculoDaVersao';
import { dadosDoRelatorioDaVersao, snapshotDaVersaoPublicada, type VersaoPublicada } from '../../../utils/imovibVersoes';
import { nomeDeArquivo } from '../../../utils/nomeDeArquivo';
import {
    GraficoCurvaS, GraficoComposicaoDoCapital, GraficoCenarios, GraficoTornado, GraficoVendasPorMes, LinhaDoTempoDosMarcos,
} from '../../ImovibGraficos';
import { SERIE_PRINCIPAL } from '../../analysis/chartKit';
import { P, VIDRO, FundoDeVidro } from '../../portal/PortalKit';
import type { ChaveDoCapital } from '../../../utils/imovibFinanciamento';

type Accent = 'portal' | 'indigo';

/** Cada variante por extenso: o JIT do Tailwind não enxerga classe montada em runtime (§24). */
const ACCENTS: Record<Accent, { card: string; interativo: string; fundo: boolean; serie: string; botao: string; titulo: string; texto: string; secundario: string; trilho: string; assenta: string; foco: string; capital?: Record<ChaveDoCapital, string> }> = {
    portal: {
        card: VIDRO.card,
        interativo: VIDRO.interativo,
        fundo: true,
        serie: P.accent,
        botao: 'bg-[#E1553C] hover:bg-[#C8452E] focus-visible:ring-[#E1553C]/40',
        titulo: 'text-[#1F2430]',
        texto: 'text-[#1F2430]',
        secundario: 'text-[#5F6573]',
        trilho: 'accent-[#E1553C]',
        // O momento do painel (index.css): a luz acende atrás do vidro e os cartões entram em foco.
        assenta: 'portal-assenta',
        foco: 'portal-foco',
        // Rosca "De onde vem o dinheiro" na paleta do portal (P.capital); o indigo usa a cor do app.
        capital: P.capital,
    },
    indigo: {
        card: 'bg-white rounded-[10px] border border-gray-100 shadow-sm',
        interativo: '',
        fundo: false,
        serie: SERIE_PRINCIPAL,
        botao: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500/40',
        titulo: 'text-gray-900',
        texto: 'text-gray-900',
        secundario: 'text-gray-600',
        trilho: 'accent-blue-600',
        assenta: '',
        foco: '',
    },
};

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const tir = (v: number | null) => (v != null && Number.isFinite(v) ? `${num(v)}% a.a.` : 'Sem TIR');
import { dataBRDeBrasilia as dataBR } from '../../../utils/dataDeBrasilia';

/** Tela estreita (celular): rótulos dos gráficos menores e marcos em lista. Sem matchMedia (teste), desktop. */
function useTelaEstreita(): boolean {
    const consulta = '(max-width: 640px)';
    const [estreita, setEstreita] = React.useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches);
    React.useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const m = window.matchMedia(consulta);
        const mudou = () => setEstreita(m.matches);
        m.addEventListener('change', mudou);
        return () => m.removeEventListener('change', mudou);
    }, []);
    return estreita;
}

/** Atraso da cascata de entrada (`--atraso`, index.css). Curto e com teto: ninguém espera a tela. */
const atrasoDe = (ms: number) => ({ '--atraso': `${ms}ms` }) as React.CSSProperties;

/** Cartão de gráfico. Fora do painel: declarado dentro, cada render seria um componente novo e
 *  mover a simulação remontaria todos os gráficos. */
const Cartao: React.FC<{ accent: Accent; titulo: string; subtitulo?: string; className?: string; atraso?: number; children: React.ReactNode }> = ({ accent, titulo, subtitulo, className = '', atraso = 0, children }) => {
    const a = ACCENTS[accent];
    return (
        <section aria-label={titulo} style={atrasoDe(atraso)} className={`${a.card} ${a.interativo} ${a.assenta} p-5 ${className}`}>
            <h4 className={`text-[15px] font-semibold tracking-tight ${a.titulo}`}>{titulo}</h4>
            {subtitulo && <p className={`text-[13px] mt-0.5 ${a.secundario}`}>{subtitulo}</p>}
            <div className="mt-4">{children}</div>
        </section>
    );
};

interface Props {
    /** A versão publicada; null na prévia do gestor sem versão (estudo atual). */
    versaoPublicada: VersaoPublicada | null;
    /** O estudo que o painel calcula: o da versão, ou o atual na prévia sem versão. */
    study: ImovibStudy;
    cenarios: ImovibScenario[];
    accent?: Accent;
    /** Aviso acima dos números (prévia do gestor). */
    aviso?: React.ReactNode;
}

const ImovibPainelDoInvestidor: React.FC<Props> = ({ versaoPublicada, study, cenarios, accent = 'indigo', aviso }) => {
    const a = ACCENTS[accent];
    const estreita = useTelaEstreita();
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    // Fase 6: a versão traz os números congelados no congelamento — o painel lê deles, não do motor.
    // Sem eles (prévia do estudo atual, ou versão anterior à Fase 6), calcula agora, pelas mesmas funções.
    const congelado = versaoPublicada?.calculo ?? null;
    const ind = React.useMemo(() => congelado?.indicadores ?? indicadoresDoEstudo(study), [congelado, study]);
    const g = React.useMemo(() => congelado?.graficos ?? graficosDoEstudo(study, cenarios), [congelado, study, cenarios]);
    const { tornado: barras, cenarios: linhasDosCenarios, marcos, vendas, capital: fatias } = g;

    // Simulação: à parte da versão.
    const [custo, setCusto] = React.useState(0);
    const [preco, setPreco] = React.useState(0);
    const [prazo, setPrazo] = React.useState(0);
    const estudoSimulado = React.useMemo(() => estudoComPrazoDoPortal(study, prazo), [study, prazo]);
    const sim = useImovibMath(estudoSimulado, { vgvDelta: preco, costDelta: custo });
    const indSim = React.useMemo(() => calcularIndicadores(sim, tma), [sim, tma]);
    const simulando = custo !== 0 || preco !== 0 || prazo !== 0;

    const [gerando, setGerando] = React.useState(false);
    const [erroDoPdf, setErroDoPdf] = React.useState<string | null>(null);
    const baixarPdf = async () => {
        if (!versaoPublicada || gerando) return;
        setGerando(true);
        setErroDoPdf(null);
        try {
            const { gerarRelatorioCompleto } = await import('../../ImovibGraficosParaPdf');
            const vp = versaoPublicada;
            const pdf = await gerarRelatorioCompleto(dadosDoRelatorioDaVersao(snapshotDaVersaoPublicada(vp), vp.versao),
                { edicao: 'investidor', versao: vp.versao, organizacao: vp.organizacao, congelado: vp.calculo });
            pdf.save(`Relatorio_${nomeDeArquivo(vp.study.name)}_${nomeDeArquivo(vp.versao.label)}.pdf`);
        } catch (e) {
            setErroDoPdf(`Não foi possível gerar o relatório: ${(e as Error).message}`);
        } finally {
            setGerando(false);
        }
    };

    const principais = [
        { rotulo: 'VPL', valor: brl(ind.vpl), apoio: `a ${num(ind.tma)}% a.a. (taxa mínima)` },
        { rotulo: 'TIR', valor: tir(ind.tirAnual), apoio: 'do capital investido' },
        { rotulo: 'Margem líquida', valor: ind.margemLiquidaPct == null ? '—' : `${num(ind.margemLiquidaPct)}%`, apoio: 'sobre o VGV' },
        { rotulo: 'Exposição máxima', valor: brl(ind.exposicaoMaxima), apoio: ind.semExposicao ? 'o caixa não fica negativo' : ind.mesDaExposicaoMaxima ? `no mês ${ind.mesDaExposicaoMaxima}` : '' },
    ];
    const apoio = [
        { rotulo: 'VGV', valor: brl(ind.vgv) },
        { rotulo: 'Lucro líquido', valor: brl(ind.lucroLiquido) },
        { rotulo: 'Payback', valor: ind.payback },
        { rotulo: 'Múltiplo do capital', valor: ind.multiplo == null ? '—' : `${num(ind.multiplo)}x` },
    ];

    const controle = (rotulo: string, valor: number, set: (n: number) => void, min: number, max: number, passo: number, unidade: string) => (
        <label className="block space-y-1.5">
            <span className={`flex items-baseline justify-between text-[13px] ${a.secundario}`}>
                <span>{rotulo}</span>
                <span className={`font-semibold tabular-nums ${a.texto}`}>{valor > 0 ? '+' : ''}{num(valor, 0)} {unidade}</span>
            </span>
            <input type="range" aria-label={rotulo} min={min} max={max} step={passo} value={valor}
                onChange={e => set(Number(e.target.value))} className={`w-full ${a.trilho}`} />
        </label>
    );

    return (
        <div className="relative isolate space-y-5">
            {a.fundo && <FundoDeVidro />}

            <div className={`flex flex-wrap items-end justify-between gap-3 ${a.assenta}`}>
                <div className="min-w-0">
                    <h3 className={`text-xl font-semibold tracking-tight ${a.titulo}`}>Viabilidade do empreendimento</h3>
                    <p className={`text-sm mt-1 ${a.secundario}`}>
                        {versaoPublicada
                            ? `Versão ${versaoPublicada.versao.label} · congelada em ${dataBR(versaoPublicada.versao.created_at)}`
                            : 'Estudo atual (sem versão publicada)'}
                    </p>
                </div>
                {versaoPublicada && (
                    <button
                        type="button"
                        onClick={() => void baixarPdf()}
                        disabled={gerando}
                        aria-label="Baixar relatório (PDF)"
                        title={gerando ? 'Gerando o relatório com os gráficos: leva alguns segundos.' : 'O relatório completo desta versão, com os gráficos.'}
                        className={`inline-flex items-center gap-2 h-10 px-4 rounded-[10px] text-white text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:opacity-60 disabled:cursor-wait ${a.botao}`}
                    >
                        {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {gerando ? 'Gerando o relatório…' : 'Baixar relatório (PDF)'}
                    </button>
                )}
            </div>

            {erroDoPdf && <p role="alert" className="rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{erroDoPdf}</p>}
            {aviso}

            <section aria-label="Indicadores da versão" className="space-y-3">
                {/* Uma coluna no celular: "R$ 13.272.583" em duas colunas de 390 px cortava. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {principais.map((k, i) => (
                        <div key={k.rotulo} style={atrasoDe(60 + i * 50)} className={`${a.card} ${a.interativo} ${a.foco} px-5 py-4 min-w-0`}>
                            <p className={`text-[13px] ${a.secundario}`}>{k.rotulo}</p>
                            <p className={`mt-1 text-2xl leading-tight font-bold tracking-tight tabular-nums whitespace-nowrap ${a.texto}`}>{k.valor}</p>
                            {k.apoio && <p className={`mt-1 text-[12px] ${a.secundario}`}>{k.apoio}</p>}
                        </div>
                    ))}
                </div>
                <div style={atrasoDe(260)} className={`${a.card} ${a.assenta} grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-black/5 overflow-hidden`}>
                    {apoio.map(k => (
                        <div key={k.rotulo} className="px-5 py-3 min-w-0">
                            <p className={`text-[13px] ${a.secundario}`}>{k.rotulo}</p>
                            <p className={`mt-0.5 text-base font-semibold tabular-nums truncate ${a.texto}`}>{k.valor}</p>
                        </div>
                    ))}
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Cartao accent={accent} atraso={300} titulo="Caixa e exposição" subtitulo="Caixa do mês e acumulado do acionista, sem desconto" className="lg:col-span-2">
                    <GraficoCurvaS dados={g.curvaS} rotuloBarra="Caixa do mês" rotuloLinha="Acumulado" larguraDoEixo={84} className="h-72 w-full" />
                </Cartao>
                <Cartao accent={accent} atraso={340} titulo="De onde vem o dinheiro" subtitulo="Composição do capital calculada pelo motor">
                    {fatias.length ? <GraficoComposicaoDoCapital fatias={fatias} cores={a.capital} className="h-72" /> : <p className={`text-sm ${a.secundario}`}>Sem capital a mostrar.</p>}
                </Cartao>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Cartao accent={accent} atraso={360} titulo="Cenários" subtitulo={cenarios.length ? 'VPL do estudo e de cada cenário avaliado' : versaoPublicada ? 'Nenhum cenário salvo nesta versão' : 'Nenhum cenário salvo no estudo'}>
                    <GraficoCenarios linhas={linhasDosCenarios} corPrincipal={a.serie} larguraDosRotulos={estreita ? 84 : 140} className="h-56" />
                </Cartao>
                <Cartao accent={accent} atraso={380} titulo="Sensibilidade do VPL" subtitulo="Quanto cada premissa move o VPL, para cima e para baixo">
                    {barras.length && barras[0].base != null && Number.isFinite(barras[0].base)
                        ? <GraficoTornado barras={barras} metrica="vpl" choques={g.choques} comLegenda larguraDosRotulos={estreita ? 120 : 200} eixoCompacto={estreita} className="h-[300px]" />
                        : <p className={`text-sm ${a.secundario}`}>Sem dados para calcular.</p>}
                </Cartao>
            </div>

            <Cartao accent={accent} atraso={400} titulo="Cronograma e vendas" subtitulo="Obra, vendas e marcos; VGV vendido por mês e estoque que resta">
                <div className="space-y-5">
                    {estreita ? (
                        <ol aria-label="Marcos" className="space-y-1.5">
                            {marcos.filter(m => m.mes != null).sort((x, y) => x.mes! - y.mes!).map(m => (
                                <li key={m.id} className={`flex items-baseline justify-between gap-3 text-sm ${a.texto}`}>
                                    <span>{m.rotulo}</span>
                                    <span className={`tabular-nums ${a.secundario}`}>mês {m.mes}</span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <LinhaDoTempoDosMarcos marcos={marcos} corPrincipal={a.serie} />
                    )}
                    {vendas.some(x => x.vendas > 0) && <GraficoVendasPorMes dados={vendas} corPrincipal={a.serie} />}
                </div>
            </Cartao>

            <section aria-label="Simulação" style={atrasoDe(420)} className={`${a.card} ${a.assenta} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h4 className={`text-[15px] font-semibold tracking-tight ${a.titulo}`}>Simulação — não altera a versão publicada</h4>
                        <p className={`text-[13px] mt-0.5 ${a.secundario}`}>Mova as premissas para ver o efeito nos números.</p>
                    </div>
                    {simulando && (
                        <button type="button" onClick={() => { setCusto(0); setPreco(0); setPrazo(0); }}
                            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] text-[13px] font-medium hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 ${a.texto}`}>
                            <RotateCcw className="w-3.5 h-3.5" /> Voltar à versão
                        </button>
                    )}
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                    {controle('Custo de obra', custo, setCusto, -30, 30, 1, '%')}
                    {controle('Preço de venda', preco, setPreco, -30, 30, 1, '%')}
                    {controle('Prazo da obra', prazo, setPrazo, -6, 24, 1, 'meses')}
                </div>
                <dl className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { rotulo: 'VPL', valor: brl(sim.vpl) },
                        { rotulo: 'TIR', valor: tir(sim.annualIrr) },
                        { rotulo: 'Margem líquida', valor: indSim.margemLiquidaSobreVgv == null ? '—' : `${num(indSim.margemLiquidaSobreVgv * 100)}%` },
                        { rotulo: 'Payback', valor: textoDoPayback(indSim) },
                    ].map(k => (
                        <div key={k.rotulo} className="rounded-[10px] bg-black/[0.03] px-4 py-3">
                            <dt className={`text-[13px] ${a.secundario}`}>{k.rotulo}</dt>
                            <dd className={`mt-0.5 text-base font-semibold tabular-nums ${a.texto}`}>{k.valor}</dd>
                        </div>
                    ))}
                </dl>
            </section>
        </div>
    );
};

export default ImovibPainelDoInvestidor;
