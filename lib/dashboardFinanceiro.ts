/**
 * Dashboard financeiro — regras puras da tela (testadas em
 * __tests__/dashboardFinanceiro.test.ts).
 * Plano: docs/planos/2026-10-28-dashboard-financeiro-hoje-e-periodo.md
 *
 * Nada aqui fala com o banco: datas do período, meses do gráfico, o resumo do saldo
 * dos bancos e o estado (`tom`) de cada número de destaque.
 */
import type { DashboardConta, DashboardHistoricoMes } from '../services/financialOverviewService';
import type { KpiTom, KpiTendencia } from '../components/ui/KpiCard';

/**
 * Hipóteses de gestão — quando um número de "Hoje" ganha cor (guia §4.5). Num lugar só,
 * porque alguém vai querer mudá-las:
 * - qualquer título vencido (a receber ou a pagar) é alerta;
 * - qualquer item esperando aprovação acima da alçada é atenção;
 * - saldo do banco mais velho que 7 dias, ou conta ativa sem saldo informado, é atenção:
 *   o número deixa de dizer quanto há no banco hoje;
 * - saldo somado negativo é alerta;
 * - um card em alerta só fica SÓLIDO quando piorou pelo menos 2% desde o fim do mês
 *   anterior: na Alpa o vencido a receber sobe ~0,4% ao mês só de juros e títulos novos
 *   (R$ 3,13 mi → R$ 3,14 mi entre 31/10 e 11/11/2026), e isso não é notícia.
 */
export const LIMIAR = {
    vencidoReceberAlerta: 0,
    vencidoPagarAlerta: 0,
    aprovacaoAtencao: 0,
    saldoDiasAtencao: 7,
    pioraRelevante: 0.02,
} as const;

export type Periodo = 'month' | 'quarter' | 'year';

export const ROTULO_PERIODO: Record<Periodo, string> = {
    month: 'Mês',
    quarter: 'Trimestre',
    year: 'Ano',
};

/** 'AAAA-MM-DD' na data LOCAL — `toISOString` desloca o dia a leste de UTC. */
export function isoLocal(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dia}`;
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA', sem passar por `Date` (nem por fuso). */
export function dataBR(iso: string): string {
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'AAAA-MM-01' → 'mai/26' (eixo do gráfico). */
export function mesCurto(iso: string): string {
    const [a, m] = iso.split('-');
    return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
}

/** 'AAAA-MM-DD' → 'jun/2015' (o vencido "desde"). */
export function mesAno(iso: string): string {
    const [a, m] = iso.split('-');
    return `${MESES[Number(m) - 1]}/${a}`;
}

export interface LimitesDoPeriodo {
    from: string;
    to: string;
    rotulo: string;
    /** Primeiro dia do primeiro mês do gráfico "Entrou × saiu". */
    mesesDesde: string;
    /** Primeiro dia do ÚLTIMO mês do gráfico: o fim do período ou o mês corrente, o que
     *  vier antes — mês que ainda não chegou não é "zero realizado", é não medido. */
    mesesAte: string;
    /** Quantos meses o gráfico mostra (de `mesesDesde` a `mesesAte`). */
    meses: number;
}

/** Meses mínimos do gráfico: um mês sozinho é uma coluna, não uma tendência. */
const MESES_MINIMOS = 6;

/**
 * O período do seletor (Mês/Trimestre/Ano) deslocado `offset` passos a partir de `agora`.
 * O gráfico mostra os meses do período, com no mínimo 6, terminando no último mês dele
 * que já começou.
 */
export function limitesDoPeriodo(periodo: Periodo, offset: number, agora: Date): LimitesDoPeriodo {
    let from: Date;
    let to: Date;
    let rotulo: string;
    if (periodo === 'month') {
        from = new Date(agora.getFullYear(), agora.getMonth() + offset, 1);
        to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
        rotulo = from.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    } else if (periodo === 'quarter') {
        const inicio = Math.floor(agora.getMonth() / 3) * 3 + offset * 3;
        from = new Date(agora.getFullYear(), inicio, 1);
        to = new Date(from.getFullYear(), from.getMonth() + 3, 0);
        rotulo = `${Math.floor(from.getMonth() / 3) + 1}º trimestre de ${from.getFullYear()}`;
    } else {
        from = new Date(agora.getFullYear() + offset, 0, 1);
        to = new Date(from.getFullYear(), 11, 31);
        rotulo = String(from.getFullYear());
    }
    const mesCorrente = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fimDoPeriodo = new Date(to.getFullYear(), to.getMonth(), 1);
    const ate = fimDoPeriodo > mesCorrente ? mesCorrente : fimDoPeriodo;
    const mesesNoPeriodo = (ate.getFullYear() - from.getFullYear()) * 12 + ate.getMonth() - from.getMonth() + 1;
    const meses = Math.max(MESES_MINIMOS, mesesNoPeriodo);
    const desde = new Date(ate.getFullYear(), ate.getMonth() - meses + 1, 1);
    return { from: isoLocal(from), to: isoLocal(to), rotulo, mesesDesde: isoLocal(desde), mesesAte: isoLocal(ate), meses };
}

/** Dias entre duas datas 'AAAA-MM-DD' (b − a), contados no calendário. */
export function diasEntre(a: string, b: string): number {
    const [ya, ma, da] = a.slice(0, 10).split('-').map(Number);
    const [yb, mb, db] = b.slice(0, 10).split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export interface ResumoDosBancos {
    /** Soma do saldo que o banco informou; null = nenhuma conta tem (não medido). */
    saldo: number | null;
    total: number;
    comSaldo: number;
    /** Contas ativas sem saldo do banco — o número não as inclui. */
    semSaldo: string[];
    /** Contas cujo saldo do banco tem mais de LIMIAR.saldoDiasAtencao dias. */
    defasadas: string[];
    /** A data mais antiga entre os saldos somados — "até onde" o número vale. */
    dataMaisAntiga: string | null;
}

export function resumoDosBancos(contas: DashboardConta[], hoje: string): ResumoDosBancos {
    let saldo: number | null = null;
    const semSaldo: string[] = [];
    const defasadas: string[] = [];
    let dataMaisAntiga: string | null = null;
    for (const c of contas) {
        if (c.saldo_banco == null || !c.saldo_banco_data) {
            semSaldo.push(c.conta);
            continue;
        }
        saldo = (saldo ?? 0) + c.saldo_banco;
        if (!dataMaisAntiga || c.saldo_banco_data < dataMaisAntiga) dataMaisAntiga = c.saldo_banco_data;
        if (diasEntre(c.saldo_banco_data, hoje) > LIMIAR.saldoDiasAtencao) defasadas.push(c.conta);
    }
    return { saldo, total: contas.length, comSaldo: contas.length - semSaldo.length, semSaldo, defasadas, dataMaisAntiga };
}

export function tomDoSaldo(r: ResumoDosBancos): KpiTom {
    if (r.saldo != null && r.saldo < 0) return 'alerta';
    if (r.semSaldo.length > 0 || r.defasadas.length > 0) return 'atencao';
    return 'neutro';
}

/** A legenda do saldo diz a BASE do número: quantas contas e de quando. */
export function legendaDoSaldo(r: ResumoDosBancos): string {
    if (r.total === 0) return 'Nenhuma conta bancária ativa';
    if (r.comSaldo === 0) return `Nenhuma das ${r.total === 1 ? '1 conta' : `${r.total} contas`} tem saldo do banco`;
    const quando = r.dataMaisAntiga ? ` · saldo de ${dataBR(r.dataMaisAntiga)}` : '';
    if (r.semSaldo.length > 0) {
        return `${r.comSaldo} de ${r.total} contas · falta ${r.semSaldo.join(', ')}`;
    }
    return `${r.total === 1 ? '1 conta' : `${r.total} contas`}${quando}`;
}

export const tomPorLimiar = (valor: number, limiar: number, tom: Exclude<KpiTom, 'neutro'>): KpiTom =>
    valor > limiar ? tom : 'neutro';

// ─── Histórico e tendência (plano 2026-11-10-kpi-card-tendencia-e-historico) ──

type CampoDoHistorico = 'vencido_receber' | 'vencido_pagar' | 'saldo_banco';

/** A série do card: os meses fechados do histórico + o valor de hoje no fim. O último
 *  ponto é sempre o número escrito no card. */
export function serieComHoje(
    historico: DashboardHistoricoMes[],
    campo: CampoDoHistorico,
    hoje: number | null,
): (number | null)[] {
    return [...historico.map(h => h[campo]), hoje];
}

/**
 * O ponto de HOJE na linha do saldo, pela mesma régua do histórico: soma só quando
 * toda conta ativa informou saldo DENTRO do mês corrente. O número do card soma o último
 * saldo de cada conta, de qualquer idade — bom para o card (que avisa a defasagem), errado
 * para a linha: comparar 4 contas hoje com 2 contas em julho desenha uma queda que não houve.
 */
export function saldoDoMesCorrente(contas: DashboardConta[], hoje: string): number | null {
    if (contas.length === 0) return null;
    const mes = hoje.slice(0, 7);
    let soma = 0;
    for (const c of contas) {
        if (c.saldo_banco == null || !c.saldo_banco_data || c.saldo_banco_data.slice(0, 7) !== mes) return null;
        soma += c.saldo_banco;
    }
    return soma;
}

const pctComSinal = (p: number) =>
    `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * Compara o último ponto da série com o anterior (hoje × fim do mês passado).
 * - `null` quando falta um dos dois: sem medida não há tendência (nunca "0%").
 * - Percentual só sobre base positiva; base zero ou negativa (saldo no vermelho, vencido
 *   que nasceu do nada) mostra a diferença em reais — "+58%" sobre um saldo negativo
 *   não diz nada a ninguém.
 * - `bom` depende do que se mede: vencido caindo é bom, saldo subindo é bom.
 */
export function tendenciaDaSerie(
    serie: (number | null)[],
    bomQuando: 'sobe' | 'desce',
    mesAnterior: string | undefined,
    formatarValor: (v: number) => string,
): KpiTendencia | null {
    if (serie.length < 2) return null;
    const atual = serie[serie.length - 1];
    const antes = serie[serie.length - 2];
    if (atual == null || antes == null) return null;
    const diff = atual - antes;
    const direcao = diff > 0 ? 'sobe' : diff < 0 ? 'desce' : 'estavel';
    const bom = direcao === 'estavel' || (bomQuando === 'sobe' ? diff > 0 : diff < 0);
    const pct = antes > 0 && atual >= 0 ? diff / antes : null;
    const texto = pct != null || diff === 0
        ? pctComSinal(pct ?? 0)
        : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${formatarValor(Math.abs(diff))}`;
    return { texto, direcao, bom, pct, base: mesAnterior ? `vs. ${mesCurto(mesAnterior)}` : 'vs. mês anterior' };
}

/**
 * Card sólido = em alerta E piorando de verdade (decisão do usuário, 11/11/2026). Sem
 * tendência medida, não fica sólido: na dúvida, o card de hoje.
 */
export function cardSolido(tom: KpiTom, tendencia: KpiTendencia | null): boolean {
    if (tom !== 'alerta' || !tendencia || tendencia.bom) return false;
    return tendencia.pct == null || Math.abs(tendencia.pct) >= LIMIAR.pioraRelevante;
}
