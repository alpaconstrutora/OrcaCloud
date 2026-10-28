/**
 * Conciliação › Dashboard — o saldo que o BANCO informa contra o que o app calcula.
 * Plano: docs/planos/2026-10-28-conciliacao-dashboard-confianca.md (passo 2).
 *
 * A função do banco (`fn_reconciliation_dashboard`) devolve, por conta, o último saldo
 * informado até a "Posição em" (à mão, OFX ou Asaas) e o calculado NAQUELA data. Aqui ficam
 * as decisões que a tela toma em cima disso, puras para poderem ser testadas.
 */
import type { ReconciliationAccountBalance } from '../types/financial';

/** Centavo de arredondamento: abaixo disso, bate. */
const TOLERANCIA = 0.01;

export type EstadoSaldoBanco =
    | { tipo: 'sem' }
    | { tipo: 'bate'; saldo: number; data: string; origem: OrigemSaldoBanco }
    | { tipo: 'fora'; saldo: number; data: string; origem: OrigemSaldoBanco; calculado: number; diferenca: number };

export type OrigemSaldoBanco = 'MANUAL' | 'OFX' | 'ASAAS';

export const ROTULO_ORIGEM: Record<OrigemSaldoBanco, string> = {
    MANUAL: 'informado',
    OFX: 'OFX',
    ASAAS: 'Asaas',
};

export function estadoDoSaldoBanco(c: ReconciliationAccountBalance): EstadoSaldoBanco {
    if (c.saldo_banco == null || !c.saldo_banco_data || c.calculado_na_data_banco == null) return { tipo: 'sem' };
    const origem = (c.saldo_banco_origem ?? 'MANUAL') as OrigemSaldoBanco;
    const diferenca = c.saldo_banco - c.calculado_na_data_banco;
    if (Math.abs(diferenca) < TOLERANCIA) return { tipo: 'bate', saldo: c.saldo_banco, data: c.saldo_banco_data, origem };
    return { tipo: 'fora', saldo: c.saldo_banco, data: c.saldo_banco_data, origem, calculado: c.calculado_na_data_banco, diferenca };
}

/** "N de M contas batem com o banco" — as que não batem e as sem saldo, nomeadas. */
export function resumoDoBanco(contas: ReconciliationAccountBalance[]) {
    const bate: string[] = [];
    const fora: string[] = [];
    const sem: string[] = [];
    for (const c of contas) {
        const e = estadoDoSaldoBanco(c);
        (e.tipo === 'bate' ? bate : e.tipo === 'fora' ? fora : sem).push(c.account_name);
    }
    return { total: contas.length, bate, fora, sem };
}

/** Dia seguinte a uma data 'YYYY-MM-DD', sem passar por fuso. */
export function diaSeguinte(data: string): string {
    const [a, m, d] = data.split('-').map(Number);
    const dt = new Date(Date.UTC(a, m - 1, d + 1));
    return dt.toISOString().slice(0, 10);
}

export interface SugestoesDeAjuste {
    /** (a) Mantém a data de início e muda só o valor: fecha na data do banco. */
    manterData: { saldo: number; data: string | null };
    /** (b) Recomeça a conta no saldo do banco, a partir do dia seguinte. */
    recomecar: { saldo: number; data: string; pendentesQueSaem: number; pendentesQueFicam: number };
}

/** As duas formas de fazer o saldo calculado bater com o do banco (decisão do usuário, 28/10). */
export function sugestoesDeAjuste(c: ReconciliationAccountBalance): SugestoesDeAjuste | null {
    const e = estadoDoSaldoBanco(c);
    if (e.tipo !== 'fora') return null;
    const ficam = c.pendentes_apos_data_banco ?? 0;
    return {
        manterData: {
            saldo: Math.round(((c.opening_balance ?? 0) + e.diferenca) * 100) / 100,
            data: c.opening_balance_date ?? null,
        },
        recomecar: {
            saldo: e.saldo,
            data: diaSeguinte(e.data),
            pendentesQueSaem: Math.max(0, (c.pending_count ?? 0) - ficam),
            pendentesQueFicam: ficam,
        },
    };
}

/** A conta com mais do campo pedido (> 0) — a ação do número nomeia a conta. */
export function contaComMais(
    contas: ReconciliationAccountBalance[],
    campo: 'pending_count' | 'unclassified_count',
): ReconciliationAccountBalance | null {
    let melhor: ReconciliationAccountBalance | null = null;
    for (const c of contas) if ((c[campo] ?? 0) > 0 && (!melhor || c[campo] > melhor[campo])) melhor = c;
    return melhor;
}

/**
 * Mesma expressão de `fees` em `fn_reconciliation_dashboard` (sobre `description_normalized`,
 * sem acento e em maiúsculas). O alerta de tarifas conta por ela; o recorte "Possíveis tarifas"
 * de Pendentes tem de mostrar as MESMAS linhas.
 */
export const EXPRESSAO_TARIFA = /(TARIFA|TAXA|CESTA|MANUTENCAO|PACOTE|IOF|ANUIDADE)/;

export function pareceTarifa(tx: { direction?: string | null; category?: string | null; description_normalized?: string | null }): boolean {
    return tx.direction === 'DEBIT' && !tx.category && EXPRESSAO_TARIFA.test(tx.description_normalized ?? '');
}
