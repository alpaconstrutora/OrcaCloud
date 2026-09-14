/**
 * Série "Previsto × Realizado por período" da Central de Clientes.
 *
 * Insumo: as linhas de `fn_opura_pivot` na dimensão `tx_month` (uma por mês
 * `YYYY-MM`, já recortadas pelo período da tela). Saída: um ponto por
 * período — TODOS os períodos do intervalo presentes (mês sem lançamento =
 * 0), porque eixo que pula meses mente sobre o tempo (guia §28.1).
 *
 * `previsto`  = `credit_previsto`  (a receber, PENDING)
 * `realizado` = `credit_realizado` (recebido, CONCILIATED)
 *
 * São as MESMAS colunas que alimentam os KPIs "Saldo devedor" e "Recebido"
 * (`fn_opura_cliente_kpis`: CREDIT por `transaction_date`), então a soma da
 * série fecha com o KPI ao lado. Só crédito: o débito do cliente é devolução,
 * tem KPI próprio e não é "lançamento a receber".
 */

export type Granularidade = 'mensal' | 'anual';

export interface LinhaPivotMes {
    /** `YYYY-MM` (dimensão `tx_month`); null ignorado. */
    dimension_key: string | null;
    credit_previsto: number;
    credit_realizado: number;
}

export interface PontoPrevistoRealizado {
    /** `YYYY-MM` (mensal) ou `YYYY` (anual). */
    key: string;
    /** Rótulo do eixo X. */
    label: string;
    previsto: number;
    realizado: number;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Meses `YYYY-MM` de `from` a `to`, inclusive. Vazio se o intervalo é inválido. */
function mesesEntre(from: string, to: string): string[] {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    if (![fy, fm, ty, tm].every(Number.isFinite)) return [];
    const ini = fy * 12 + (fm - 1);
    const fim = ty * 12 + (tm - 1);
    if (fim < ini) return [];
    const out: string[] = [];
    for (let i = ini; i <= fim; i++) {
        const y = Math.floor(i / 12);
        const m = (i % 12) + 1;
        out.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return out;
}

/** "set/26" no primeiro mês e em janeiro; só "out" nos demais — 12 rótulos
 *  com ano colidem num card (guia §28, memória de 12/09). */
function rotuloMes(key: string, primeiro: boolean): string {
    const [y, m] = key.split('-').map(Number);
    const nome = MESES[m - 1] ?? key;
    return primeiro || m === 1 ? `${nome}/${String(y).slice(-2)}` : nome;
}

export function montarSeriePrevistoRealizado(
    rows: LinhaPivotMes[],
    dateFrom: string,
    dateTo: string,
    granularidade: Granularidade,
): PontoPrevistoRealizado[] {
    const meses = mesesEntre(dateFrom, dateTo);
    if (meses.length === 0) return [];

    // Soma por mês — a RPC já devolve um mês por linha, mas somar é mais barato
    // que confiar nisso, e absorve linha com chave nula.
    const porMes = new Map<string, { previsto: number; realizado: number }>();
    for (const r of rows) {
        if (!r.dimension_key) continue;
        const acc = porMes.get(r.dimension_key) ?? { previsto: 0, realizado: 0 };
        acc.previsto += Number(r.credit_previsto) || 0;
        acc.realizado += Number(r.credit_realizado) || 0;
        porMes.set(r.dimension_key, acc);
    }

    if (granularidade === 'mensal') {
        return meses.map((key, i) => {
            const v = porMes.get(key);
            return { key, label: rotuloMes(key, i === 0), previsto: v?.previsto ?? 0, realizado: v?.realizado ?? 0 };
        });
    }

    // Anual: um ponto por ano do intervalo, somando os meses que caem nele.
    // Mês fora do intervalo (não deveria vir — a RPC recorta) fica de fora.
    const anos = [...new Set(meses.map(m => m.slice(0, 4)))];
    const dentro = new Set(meses);
    return anos.map(ano => {
        let previsto = 0, realizado = 0;
        for (const [key, v] of porMes) {
            if (key.startsWith(`${ano}-`) && dentro.has(key)) { previsto += v.previsto; realizado += v.realizado; }
        }
        return { key: ano, label: ano, previsto, realizado };
    });
}
