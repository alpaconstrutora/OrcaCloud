/**
 * Dashboard financeiro — regras puras da tela (testadas em
 * __tests__/dashboardFinanceiro.test.ts).
 * Plano: docs/planos/2026-10-28-dashboard-financeiro-hoje-e-periodo.md
 *
 * Nada aqui fala com o banco: datas do período, meses do gráfico, o resumo do saldo
 * dos bancos e o estado (`tom`) de cada número de destaque.
 */
import type { DashboardConta } from '../services/financialOverviewService';
import type { KpiTom } from '../components/ui/KpiCard';

/**
 * Hipóteses de gestão — quando um número de "Hoje" ganha cor (guia §4.5). Num lugar só,
 * porque alguém vai querer mudá-las:
 * - qualquer título vencido (a receber ou a pagar) é alerta;
 * - qualquer item esperando aprovação acima da alçada é atenção;
 * - saldo do banco mais velho que 7 dias, ou conta ativa sem saldo informado, é atenção:
 *   o número deixa de dizer quanto há no banco hoje;
 * - saldo somado negativo é alerta.
 */
export const LIMIAR = {
    vencidoReceberAlerta: 0,
    vencidoPagarAlerta: 0,
    aprovacaoAtencao: 0,
    saldoDiasAtencao: 7,
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
