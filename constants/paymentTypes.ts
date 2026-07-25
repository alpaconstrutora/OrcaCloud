import { PaymentType } from '../types';

/**
 * Código do Tipo de Pagamento gravado em `commercial_deals.custom_installments`
 * (e em `down_payment_installment_type`). Os sete abaixo são os padrão do sistema;
 * tipos criados pela organização geram códigos `CUSTOM_*` (sem periodicidade).
 * `(string & {})` mantém o autocomplete dos padrão e ainda aceita códigos custom.
 */
export type InstallmentTypeCode =
    | 'SINAL' | 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'AVULSA' | 'CHAVES'
    | (string & {});

export interface PaymentTypeDefault {
    code: string;
    name: string;
    /** Intervalo entre parcelas geradas (meses); null = não gera série automática. */
    interval_months: number | null;
    /** true = aparece no gerador de parcelas em série ("Gerar Parcelas"). */
    generates_series: boolean;
}

/**
 * Lista padrão exibida em "Configurações → Categorias Gerais → Tipos de Pagamento"
 * e no dropdown "Tipo Pagto." do Plano de Pagamento. Mantida em código (não no
 * banco) — a org importa/duplica para editar, no mesmo padrão de
 * `constants/clientCategories.ts` / `constants/supplierCategories.ts`.
 */
export const DEFAULT_PAYMENT_TYPES: PaymentTypeDefault[] = [
    { code: 'SINAL',      name: 'Sinal',                 interval_months: null, generates_series: false },
    { code: 'MENSAL',     name: 'Parcelas mensais',      interval_months: 1,    generates_series: true  },
    { code: 'TRIMESTRAL', name: 'Parcelas trimestrais',  interval_months: 3,    generates_series: true  },
    { code: 'SEMESTRAL',  name: 'Parcelas semestrais',   interval_months: 6,    generates_series: true  },
    { code: 'ANUAL',      name: 'Parcelas anuais',       interval_months: 12,   generates_series: true  },
    { code: 'AVULSA',     name: 'Parcelas avulsas',      interval_months: null, generates_series: false },
    { code: 'CHAVES',     name: 'Parcela nas chaves',    interval_months: null, generates_series: false },
];

/** Ordem canônica para exibir os tipos (padrão na ordem acima; custom depois, A-Z). */
export const sortPaymentTypes = <T extends { code?: string; name: string }>(types: T[]): T[] => {
    const order = new Map(DEFAULT_PAYMENT_TYPES.map((d, i) => [d.code, i]));
    return [...types].sort((a, b) => {
        const ia = order.has(a.code || '') ? order.get(a.code || '')! : Number.MAX_SAFE_INTEGER;
        const ib = order.has(b.code || '') ? order.get(b.code || '')! : Number.MAX_SAFE_INTEGER;
        return ia !== ib ? ia - ib : a.name.localeCompare(b.name, 'pt-BR');
    });
};

/** Rótulo de exibição por código, com fallback nos defaults e no próprio código. */
export const labelForInstallmentType = (
    types: { code?: string; name: string }[],
    code?: string,
): string => {
    if (!code) return '';
    const found = types.find(t => t.code === code);
    if (found) return found.name;
    const def = DEFAULT_PAYMENT_TYPES.find(t => t.code === code);
    return def ? def.name : code;
};

/** Intervalo (meses) de um tipo, com fallback nos defaults e em 1 mês. */
export const intervalMonthsForType = (
    types: { code?: string; interval_months?: number | null }[],
    code?: string,
): number => {
    const found = types.find(t => t.code === code);
    if (found && found.interval_months != null) return found.interval_months;
    const def = DEFAULT_PAYMENT_TYPES.find(t => t.code === code);
    return def?.interval_months ?? 1;
};

/** Gera um código estável (`CUSTOM_*`) para um tipo criado pela organização. */
export const slugPaymentTypeCode = (name: string): string =>
    'CUSTOM_' + name
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Payload de importação/criação de um default como registro editável da org. */
export const defaultsAsRows = (organizationId: string): Omit<PaymentType, 'id' | 'created_at'>[] =>
    DEFAULT_PAYMENT_TYPES.map(d => ({
        name: d.name,
        code: d.code,
        interval_months: d.interval_months,
        generates_series: d.generates_series,
        active: true,
        organization_id: organizationId,
    }));
