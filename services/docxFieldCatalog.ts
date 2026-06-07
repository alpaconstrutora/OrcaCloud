import { Contract } from '../types/contracts';
import { Client, Organization } from '../types/users';

// ─── Tipos ──────────────────────────────────────────────────────────────────────
export type FieldSource = 'organization' | 'client' | 'contract' | 'special';

/** Mapeamento de um marcador {NNN} para uma origem de dado (ou texto fixo). */
export interface TokenMapping {
    source: FieldSource | 'fixed';
    field?: string;   // chave do campo dentro da origem (quando source ≠ 'fixed')
    label?: string;   // rótulo do campo escolhido (para exibição)
    fixed?: string;   // texto livre (quando source = 'fixed')
}

export type TokenMap = Record<string, TokenMapping>;

/** Contexto com os objetos resolvidos no momento da emissão. */
export interface ResolveContext {
    organization?: Organization | null;
    client?: Client | null;
    contract?: Contract | null;
}

interface FieldDef {
    field: string;
    label: string;
    get: (ctx: ResolveContext) => string;
}

interface FieldGroup {
    source: FieldSource;
    label: string;
    fields: FieldDef[];
}

// ─── Formatadores pt-BR ───────────────────────────────────────────────────────────
const fmtCurrency = (n?: number | null) =>
    typeof n === 'number'
        ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '';

const fmtDate = (d?: string | null) => {
    if (!d) return '';
    const dt = new Date(`${d.slice(0, 10)}T12:00:00`);
    return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('pt-BR');
};

const fmtPercent = (n?: number | null) =>
    typeof n === 'number' ? `${n.toLocaleString('pt-BR')}%` : '';

const diffDays = (start?: string, end?: string) => {
    if (!start || !end) return '';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (isNaN(ms)) return '';
    return String(Math.max(0, Math.ceil(ms / 86_400_000)));
};

// Valor por extenso (reais) — usado com frequência em contratos
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
    'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function trio(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const parts: string[] = [];
    if (c > 0) parts.push(CENTENAS[c]);
    if (resto > 0) {
        if (resto < 20) parts.push(UNIDADES[resto]);
        else {
            const d = Math.floor(resto / 10);
            const u = resto % 10;
            parts.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
        }
    }
    return parts.join(' e ');
}

function inteiroExtenso(n: number): string {
    if (n === 0) return 'zero';
    const milhoes = Math.floor(n / 1_000_000);
    const milhares = Math.floor((n % 1_000_000) / 1000);
    const resto = n % 1000;
    const parts: string[] = [];
    if (milhoes > 0) parts.push(milhoes === 1 ? 'um milhão' : `${trio(milhoes)} milhões`);
    if (milhares > 0) parts.push(milhares === 1 ? 'mil' : `${trio(milhares)} mil`);
    if (resto > 0) parts.push(trio(resto));
    return parts.join(' e ');
}

/** "R$ 1.234,50" → "mil, duzentos e trinta e quatro reais e cinquenta centavos" */
export function valorPorExtenso(valor?: number | null): string {
    if (typeof valor !== 'number' || isNaN(valor)) return '';
    const reais = Math.floor(valor);
    const centavos = Math.round((valor - reais) * 100);
    const parts: string[] = [];
    if (reais > 0) parts.push(`${inteiroExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`);
    if (centavos > 0) parts.push(`${inteiroExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
    if (parts.length === 0) return 'zero real';
    return parts.join(' e ');
}

// ─── Catálogo de campos por origem ────────────────────────────────────────────────
export const FIELD_GROUPS: FieldGroup[] = [
    {
        source: 'organization',
        label: 'Minha Organização',
        fields: [
            { field: 'name',        label: 'Nome / Razão social', get: c => c.organization?.name ?? '' },
            { field: 'cnpj',        label: 'CNPJ',                get: c => c.organization?.cnpj ?? '' },
            { field: 'email',       label: 'E-mail',              get: c => c.organization?.email ?? '' },
            { field: 'phone',       label: 'Telefone',            get: c => c.organization?.phone ?? '' },
            { field: 'website',     label: 'Site',                get: c => c.organization?.website ?? '' },
            { field: 'street',      label: 'Logradouro',          get: c => c.organization?.address?.street ?? '' },
            { field: 'number',      label: 'Número',              get: c => c.organization?.address?.number ?? '' },
            { field: 'neighborhood',label: 'Bairro',              get: c => c.organization?.address?.neighborhood ?? '' },
            { field: 'city',        label: 'Cidade',              get: c => c.organization?.address?.city ?? '' },
            { field: 'state',       label: 'Estado (UF)',         get: c => c.organization?.address?.state ?? '' },
            { field: 'zipCode',     label: 'CEP',                 get: c => c.organization?.address?.zipCode ?? '' },
            { field: 'address_full',label: 'Endereço completo',   get: c => {
                const a = c.organization?.address;
                if (!a) return '';
                return [
                    [a.street, a.number].filter(Boolean).join(', '),
                    a.neighborhood, a.city && a.state ? `${a.city}/${a.state}` : (a.city || a.state),
                    a.zipCode ? `CEP ${a.zipCode}` : '',
                ].filter(Boolean).join(' - ');
            } },
        ],
    },
    {
        source: 'client',
        label: 'Cliente',
        fields: [
            { field: 'name',         label: 'Nome',            get: c => c.client?.name ?? '' },
            { field: 'document',     label: 'CPF / CNPJ',      get: c => c.client?.document ?? '' },
            { field: 'type',         label: 'Tipo (PF/PJ)',    get: c => c.client?.type ?? '' },
            { field: 'email',        label: 'E-mail',          get: c => c.client?.email ?? '' },
            { field: 'phone',        label: 'Telefone',        get: c => c.client?.phone ?? '' },
            { field: 'address',      label: 'Endereço',        get: c => c.client?.address ?? '' },
            { field: 'neighborhood', label: 'Bairro',          get: c => c.client?.neighborhood ?? '' },
            { field: 'city',         label: 'Cidade',          get: c => c.client?.city ?? '' },
            { field: 'state',        label: 'Estado (UF)',     get: c => c.client?.state ?? '' },
            { field: 'category',     label: 'Categoria',       get: c => c.client?.category ?? '' },
            { field: 'address_full', label: 'Endereço completo', get: c => {
                const cl = c.client;
                if (!cl) return '';
                return [cl.address, cl.neighborhood, cl.city && cl.state ? `${cl.city}/${cl.state}` : (cl.city || cl.state)]
                    .filter(Boolean).join(' - ');
            } },
        ],
    },
    {
        source: 'contract',
        label: 'Contrato de Serviço',
        fields: [
            { field: 'number',            label: 'Número',                  get: c => c.contract?.number ?? '' },
            { field: 'title',             label: 'Título / Objeto',         get: c => c.contract?.title ?? '' },
            { field: 'description',       label: 'Descrição / Escopo',      get: c => c.contract?.description ?? '' },
            { field: 'contract_type',     label: 'Tipo de contrato',        get: c => c.contract?.contract_type ?? '' },
            { field: 'nature',            label: 'Natureza',                get: c => c.contract?.nature ?? '' },
            { field: 'original_value',    label: 'Valor (R$)',              get: c => fmtCurrency(c.contract?.original_value) },
            { field: 'original_value_ext',label: 'Valor por extenso',       get: c => valorPorExtenso(c.contract?.original_value) },
            { field: 'current_value',     label: 'Valor atual (R$)',        get: c => fmtCurrency(c.contract?.current_value) },
            { field: 'start_date',        label: 'Data de início',          get: c => fmtDate(c.contract?.start_date) },
            { field: 'end_date',          label: 'Data de término',         get: c => fmtDate(c.contract?.end_date) },
            { field: 'prazo_dias',        label: 'Prazo (dias)',            get: c => diffDays(c.contract?.start_date, c.contract?.end_date) },
            { field: 'retention_rate',    label: 'Retenção (%)',            get: c => fmtPercent(c.contract?.retention_rate) },
            { field: 'payment_method',    label: 'Forma de pagamento',      get: c => c.contract?.payment_method ?? '' },
            { field: 'execution_address', label: 'Local de execução',       get: c => c.contract?.execution_address ?? '' },
            { field: 'client_responsible',label: 'Responsável (cliente)',   get: c => c.contract?.client_responsible ?? '' },
            { field: 'internal_responsible',label: 'Responsável (interno)', get: c => c.contract?.internal_responsible ?? '' },
            { field: 'sla_days',          label: 'SLA (dias)',              get: c => c.contract?.sla_days != null ? String(c.contract.sla_days) : '' },
            { field: 'warranty_months',   label: 'Garantia (meses)',        get: c => c.contract?.warranty_months != null ? String(c.contract.warranty_months) : '' },
            { field: 'labor_value',       label: 'Valor mão de obra (R$)',  get: c => fmtCurrency(c.contract?.labor_value) },
            { field: 'materials_value',   label: 'Valor materiais (R$)',    get: c => fmtCurrency(c.contract?.materials_value) },
            { field: 'services_included', label: 'Serviços incluídos',      get: c => c.contract?.services_included ?? '' },
            { field: 'services_excluded', label: 'Serviços excluídos',      get: c => c.contract?.services_excluded ?? '' },
        ],
    },
    {
        source: 'special',
        label: 'Especiais',
        fields: [
            { field: 'today',      label: 'Data de hoje',            get: () => new Date().toLocaleDateString('pt-BR') },
            { field: 'today_long', label: 'Data por extenso',        get: () => new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) },
        ],
    },
];

// Índice rápido: `${source}.${field}` → FieldDef
const FIELD_INDEX: Record<string, FieldDef> = {};
for (const g of FIELD_GROUPS) for (const f of g.fields) FIELD_INDEX[`${g.source}.${f.field}`] = f;

/** Rótulo legível de um mapeamento, para exibição na UI. */
export function describeMapping(m?: TokenMapping): string {
    if (!m) return '— não mapeado —';
    if (m.source === 'fixed') return `Texto fixo: "${m.fixed ?? ''}"`;
    const group = FIELD_GROUPS.find(g => g.source === m.source);
    const field = group?.fields.find(f => f.field === m.field);
    return `${group?.label ?? m.source} › ${field?.label ?? m.field ?? '?'}`;
}

/**
 * Resolve o token_map em valores concretos, prontos para o docxtemplater.
 * Retorna { "001": "valor formatado", ... }. Tokens sem dado viram string vazia.
 */
export function resolveFields(tokenMap: TokenMap, ctx: ResolveContext): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [token, mapping] of Object.entries(tokenMap)) {
        if (!mapping) { out[token] = ''; continue; }
        if (mapping.source === 'fixed') {
            out[token] = mapping.fixed ?? '';
            continue;
        }
        const def = FIELD_INDEX[`${mapping.source}.${mapping.field}`];
        out[token] = def ? def.get(ctx) : '';
    }
    return out;
}
