/**
 * Dados dos gráficos do Imovib (Fase 3 do plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md). Puro: as mesmas funções
 * alimentam a tela do estudo, o relatório em PDF e o dashboard do investidor, para os três
 * mostrarem o mesmo número. Os componentes moram em components/ImovibGraficos.tsx.
 * Testes: __tests__/imovibGraficos.test.ts.
 */
import type { ImovibStudy, ImovibScenario } from '../types';
import type { ImovibMathResult, MonthlyFlow } from './imovibMotor';
import { computeImovibMath } from './imovibMotor';
import { aplicarCenario } from './imovibCenarios';
import type { BarraDoTornado, MetricaDoEstudo } from './imovibSensibilidade';
import { UNIDADE_DA_VARIAVEL, type VariavelDoEstudo } from './imovibVariacoes';
import { composicaoDoCapital, ROTULO_DO_CAPITAL, COR_DO_CAPITAL, type ChaveDoCapital } from './imovibFinanciamento';
import type { SecaoId } from './imovibRelatorio';

export type GraficoId = 'curva_s' | 'fluxo_anual' | 'tornado' | 'cenarios' | 'marcos' | 'vendas' | 'capital';

/** Os gráficos de cada seção do relatório completo, na ordem em que entram. */
export const GRAFICOS_DA_SECAO: Record<SecaoId, GraficoId[]> = {
    capa: [],
    indicadores: ['curva_s'],
    premissas: [],
    mercado: [],
    produto: [],
    cronograma: ['marcos', 'vendas'],
    fluxo: ['fluxo_anual'],
    sensibilidade: ['tornado', 'cenarios'],
    riscos: [],
    due_diligence: [],
    tributos: [],
    capital: ['capital'],
};

export const ROTULO_DA_METRICA: Record<MetricaDoEstudo, string> = {
    tir: 'TIR', vpl: 'VPL', margem: 'Margem líquida', exposicao: 'Exposição máxima',
};

/** Valor da métrica no formato da tela. */
export const formatarMetrica = (m: MetricaDoEstudo, v: number): string => {
    if (!Number.isFinite(v)) return '—';
    if (m === 'tir') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.a.`;
    if (m === 'margem') return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
};

export interface AnoDoFluxo { name: string; rev: number; cost: number; net: number; acc: number }

/** Receitas, custos e caixa por ano do estudo; o acumulado é o do último mês do ano. */
export function fluxoAnual(fluxos: MonthlyFlow[]): AnoDoFluxo[] {
    const anos = new Map<number, AnoDoFluxo>();
    for (const f of fluxos) {
        const ano = Math.ceil(f.month / 12);
        const a = anos.get(ano) ?? { name: `Ano ${ano}`, rev: 0, cost: 0, net: 0, acc: 0 };
        a.rev += f.rev; a.cost += f.cost; a.net += f.net; a.acc = f.acc;
        anos.set(ano, a);
    }
    return [...anos.values()];
}

export interface LinhaDoCenario { nome: string; vpl: number; tirAnual: number }

/** O estudo como está e cada cenário salvo, com VPL e TIR (NaN = sem TIR). */
export function dadosDosCenarios(study: ImovibStudy, cenarios: ImovibScenario[], r: ImovibMathResult = computeImovibMath(study)): LinhaDoCenario[] {
    return [
        { nome: 'Estudo', vpl: r.vpl, tirAnual: r.annualIrr },
        ...cenarios.map(c => {
            const a = aplicarCenario(study, c.choques);
            const rc = computeImovibMath(a.study, a.options);
            return { nome: c.name, vpl: rc.vpl, tirAnual: rc.annualIrr };
        }),
    ];
}

export interface BarraDoGraficoTornado {
    nome: string; cima: number; baixo: number; cimaAbs: number; baixoAbs: number; rotuloCima: string; rotuloBaixo: string;
}

/**
 * Uma barra por choque (+d e −d), relativa ao estudo como está. Empilhar "pior" e "melhor"
 * somava os dois quando caíam do mesmo lado da base.
 */
export function dadosDoTornado(barras: BarraDoTornado[], metrica: MetricaDoEstudo, choques: Record<VariavelDoEstudo, number>): BarraDoGraficoTornado[] {
    const base = barras[0]?.base ?? NaN;
    // Do banco, um lado sem a métrica volta null (NaN não cabe no JSON): null - base seria um número.
    const rel = (v: number | null) => (v != null && Number.isFinite(v - base) ? v - base : 0);
    return barras.map(b => {
        const d = choques[b.variavel].toLocaleString('pt-BR');
        const u = UNIDADE_DA_VARIAVEL[b.variavel];
        const sem = !Number.isFinite(b.acima) ? ` · sem ${ROTULO_DA_METRICA[metrica]} com +${d}` : !Number.isFinite(b.abaixo) ? ` · sem ${ROTULO_DA_METRICA[metrica]} com −${d}` : '';
        return {
            nome: `${b.rotulo} ±${d} ${u}${sem}`,
            cima: rel(b.acima),
            baixo: rel(b.abaixo),
            cimaAbs: b.acima,
            baixoAbs: b.abaixo,
            rotuloCima: `+${d} ${u}`,
            rotuloBaixo: `−${d} ${u}`,
        };
    });
}

/** Nome acessível do tornado com os números (§28.5). */
export const nomeDoTornado = (barras: BarraDoTornado[], metrica: MetricaDoEstudo): string =>
    `Tornado de ${ROTULO_DA_METRICA[metrica]}, estudo como está ${formatarMetrica(metrica, barras[0]?.base ?? NaN)}: `
    + barras.map(b => `${b.rotulo} de ${formatarMetrica(metrica, b.abaixo)} a ${formatarMetrica(metrica, b.acima)}`).join('; ');

export interface MesDeVendas { mes: string; vendas: number; estoque: number }

/** VGV vendido em cada mês a partir do início das vendas e o estoque que resta (sem correção). */
export function dadosDasVendas(math: Pick<ImovibMathResult, 'vendasPorMes' | 'estoqueNaoVendidoPct'>, inicio: number): MesDeVendas[] {
    const vendido = math.vendasPorMes.reduce((a, b) => a + b, 0);
    const vendavel = math.estoqueNaoVendidoPct < 1 ? vendido / (1 - math.estoqueNaoVendidoPct) : 0;
    let acumulado = 0;
    return math.vendasPorMes.slice(inicio - 1).map((v, i) => {
        acumulado += v;
        return { mes: `Mês ${inicio + i}`, vendas: v, estoque: Math.max(0, vendavel - acumulado) };
    });
}

export interface FatiaDoCapital { chave: ChaveDoCapital; nome: string; valor: number; pct: number; cor: string }

/** Fatias da composição do capital calculadas pelo motor (só as que têm valor). */
export const fatiasDoCapital = (capital: Record<ChaveDoCapital, number>): FatiaDoCapital[] =>
    composicaoDoCapital(capital)
        .filter(c => c.pct > 0)
        .map(c => ({ chave: c.chave, nome: ROTULO_DO_CAPITAL[c.chave], valor: c.valor, pct: c.pct, cor: COR_DO_CAPITAL[c.chave] }));
