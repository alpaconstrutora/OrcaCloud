import { Contract, ContractAddendum } from '../types/contracts';
import { Client, Organization } from '../types/users';
import { ProjectSettings } from '../types/project';

// ─── Tipos ──────────────────────────────────────────────────────────────────────
export type FieldSource = 'organization' | 'client' | 'contract' | 'project' | 'addendum' | 'special';

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
    project?: ProjectSettings | null;
    /** Preenchido só na emissão a partir de um aditivo. */
    addendum?: ContractAddendum | null;
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
            { field: 'name',            label: 'Nome / Razão social', get: c => c.client?.name ?? '' },
            { field: 'document',        label: 'CPF / CNPJ',          get: c => c.client?.document ?? '' },
            { field: 'type',            label: 'Tipo (PF/PJ)',         get: c => c.client?.type ?? '' },
            { field: 'organization_name', label: 'Empresa (PJ)',       get: c => c.client?.organization_name ?? '' },
            { field: 'email',           label: 'E-mail',               get: c => c.client?.email ?? '' },
            { field: 'phone',           label: 'Telefone',             get: c => c.client?.phone ?? '' },
            { field: 'address',         label: 'Logradouro',           get: c => c.client?.address ?? '' },
            { field: 'address_number',  label: 'Número',               get: c => c.client?.address_number ?? '' },
            { field: 'neighborhood',    label: 'Bairro',               get: c => c.client?.neighborhood ?? '' },
            { field: 'zip_code',        label: 'CEP',                  get: c => c.client?.zip_code ?? '' },
            { field: 'city',            label: 'Cidade',               get: c => c.client?.city ?? '' },
            { field: 'state',           label: 'Estado (UF)',          get: c => c.client?.state ?? '' },
            { field: 'category',        label: 'Categoria',            get: c => c.client?.category ?? '' },
            { field: 'address_full',    label: 'Endereço completo',    get: c => {
                const cl = c.client;
                if (!cl) return '';
                return [
                    [cl.address, cl.address_number].filter(Boolean).join(', '),
                    cl.neighborhood,
                    cl.city && cl.state ? `${cl.city}/${cl.state}` : (cl.city || cl.state),
                    cl.zip_code ? `CEP ${cl.zip_code}` : '',
                ].filter(Boolean).join(' - ');
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
            { field: 'services_included',   label: 'Serviços incluídos',         get: c => c.contract?.services_included ?? '' },
            { field: 'services_excluded',   label: 'Serviços excluídos',         get: c => c.contract?.services_excluded ?? '' },
            { field: 'status',              label: 'Status do contrato',          get: c => c.contract?.status ?? '' },
            { field: 'responsible_email',   label: 'E-mail do responsável',       get: c => c.contract?.responsible_email ?? '' },
            { field: 'is_recurring',        label: 'Recorrente (Sim/Não)',        get: c => c.contract?.is_recurring ? 'Sim' : 'Não' },
            { field: 'billing_cycle',       label: 'Ciclo de cobrança',           get: c => c.contract?.billing_cycle ?? '' },
            { field: 'due_day',             label: 'Dia de vencimento',           get: c => c.contract?.due_day != null ? String(c.contract.due_day) : '' },
            { field: 'billing_mode',        label: 'Modo de faturamento',         get: c => c.contract?.billing_mode ?? '' },
            { field: 'payment_term_type',   label: 'Condição de pagamento',       get: c => c.contract?.payment_term_type ?? '' },
            { field: 'payment_days',        label: 'Prazo de pagamento (dias)',   get: c => c.contract?.payment_days != null ? String(c.contract.payment_days) : '' },
            { field: 'payment_installments',label: 'Número de parcelas',          get: c => c.contract?.payment_installments != null ? String(c.contract.payment_installments) : '' },
            { field: 'reajuste_index',      label: 'Índice de reajuste',          get: c => c.contract?.reajuste_index ?? '' },
            { field: 'reajuste_data_base',  label: 'Data base do reajuste',       get: c => fmtDate(c.contract?.reajuste_data_base) },
            { field: 'reajuste_proximo',    label: 'Próximo reajuste',            get: c => fmtDate(c.contract?.reajuste_proximo) },
            { field: 'signature_status',    label: 'Status de assinatura',        get: c => {
                const map: Record<string, string> = { PENDING: 'Pendente', SENT: 'Enviado', SIGNED: 'Assinado', EXPIRED: 'Expirado', CANCELLED: 'Cancelado' };
                return map[c.contract?.signature_status ?? ''] ?? (c.contract?.signature_status ?? '');
            } },
            { field: 'signature_completed_at', label: 'Data de assinatura',      get: c => fmtDate(c.contract?.signature_completed_at) },
            { field: 'created_at',          label: 'Data de criação do contrato', get: c => fmtDate(c.contract?.created_at) },
        ],
    },
    {
        source: 'project',
        label: 'Engenharia – Obra',
        fields: [
            { field: 'name',             label: 'Nome da obra',             get: c => c.project?.name ?? '' },
            { field: 'code',             label: 'Código',                   get: c => c.project?.code ?? '' },
            { field: 'client',           label: 'Cliente (obra)',            get: c => c.project?.client ?? '' },
            { field: 'location',         label: 'Localização',              get: c => c.project?.location ?? '' },
            { field: 'street',           label: 'Logradouro',               get: c => c.project?.street ?? '' },
            { field: 'number',           label: 'Número',                   get: c => c.project?.number ?? '' },
            { field: 'complement',       label: 'Complemento',              get: c => c.project?.complement ?? '' },
            { field: 'neighborhood',     label: 'Bairro',                   get: c => c.project?.neighborhood ?? '' },
            { field: 'city',             label: 'Cidade',                   get: c => c.project?.city ?? '' },
            { field: 'state',            label: 'Estado (UF)',              get: c => c.project?.state ?? '' },
            { field: 'zipCode',          label: 'CEP',                      get: c => c.project?.zipCode ?? '' },
            { field: 'address_full',     label: 'Endereço completo',        get: c => {
                const p = c.project;
                if (!p) return '';
                return [
                    [p.street, p.number].filter(Boolean).join(', '),
                    p.complement,
                    p.neighborhood,
                    p.city && p.state ? `${p.city}/${p.state}` : (p.city || p.state),
                    p.zipCode ? `CEP ${p.zipCode}` : '',
                ].filter(Boolean).join(' - ');
            } },
            { field: 'area',             label: 'Área (m²)',                get: c => c.project?.area != null ? String(c.project.area) : '' },
            { field: 'tipoObra',         label: 'Tipo de obra',             get: c => c.project?.tipoObra ?? '' },
            { field: 'regimeObra',       label: 'Regime da obra',           get: c => c.project?.regimeObra ?? '' },
            { field: 'status',           label: 'Status',                   get: c => c.project?.status ?? '' },
            { field: 'obraStatus',       label: 'Status da obra',           get: c => c.project?.obraStatus ?? '' },
            { field: 'startDate',        label: 'Data de início (planejada)', get: c => fmtDate(c.project?.startDate) },
            { field: 'endDate',          label: 'Data de término (planejada)', get: c => fmtDate(c.project?.endDate) },
            { field: 'startDateReal',    label: 'Data de início (real)',     get: c => fmtDate(c.project?.startDateReal) },
            { field: 'endDateReal',      label: 'Data de término (real)',    get: c => fmtDate(c.project?.endDateReal) },
            { field: 'valorEstimado',    label: 'Valor estimado (R$)',       get: c => fmtCurrency(c.project?.valorEstimado) },
            { field: 'valorContratado',  label: 'Valor contratado (R$)',     get: c => fmtCurrency(c.project?.valorContratado) },
            { field: 'mestreObras',      label: 'Mestre de obras',          get: c => c.project?.mestreObras ?? '' },
            { field: 'encarregado',      label: 'Encarregado',              get: c => c.project?.encarregado ?? '' },
            { field: 'tecnicoSeguranca', label: 'Técnico de segurança',     get: c => c.project?.tecnicoSeguranca ?? '' },
            { field: 'almoxarife',       label: 'Almoxarife',               get: c => c.project?.almoxarife ?? '' },
            { field: 'responsibleTeam',  label: 'Equipe responsável',       get: c => c.project?.responsibleTeam ?? '' },
            { field: 'artRrt',           label: 'ART / RRT',                get: c => c.project?.artRrt ?? '' },
            { field: 'alvara',           label: 'Alvará',                   get: c => c.project?.alvara ?? '' },
            { field: 'matriculaCNO',     label: 'Matrícula CNO',            get: c => c.project?.matriculaCNO ?? '' },
        ],
    },
    {
        // Aditivo — preenchido só quando o documento é emitido a partir de um
        // aditivo (aba Documentos & Assinatura). Em documento de contrato os
        // campos resolvem para string vazia, como qualquer origem ausente.
        source: 'addendum',
        label: 'Aditivo',
        fields: [
            { field: 'number',            label: 'Número do aditivo',        get: c => c.addendum?.number ?? '' },
            { field: 'description',       label: 'Descrição',                get: c => c.addendum?.description ?? '' },
            { field: 'type',              label: 'Tipo',                     get: c => c.addendum?.type ?? '' },
            { field: 'status',            label: 'Situação',                 get: c => c.addendum?.status ?? '' },
            { field: 'new_start_date',    label: 'Início da nova vigência',  get: c => fmtDate(c.addendum?.new_start_date) },
            { field: 'new_end_date',      label: 'Fim da nova vigência',     get: c => fmtDate(c.addendum?.new_end_date) },
            { field: 'previous_end_date', label: 'Fim da vigência anterior', get: c => fmtDate(c.addendum?.previous_end_date) },
            { field: 'new_value',         label: 'Novo valor',               get: c => fmtCurrency(c.addendum?.new_value) },
            { field: 'new_value_ext',     label: 'Novo valor por extenso',   get: c => valorPorExtenso(c.addendum?.new_value) },
            { field: 'previous_value',    label: 'Valor anterior',           get: c => fmtCurrency(c.addendum?.previous_value) },
            { field: 'reajuste_index',    label: 'Índice de reajuste',       get: c => c.addendum?.reajuste_index ?? '' },
            { field: 'reajuste_fator',    label: 'Fator de reajuste',        get: c => c.addendum?.reajuste_fator != null ? c.addendum.reajuste_fator.toFixed(4).replace('.', ',') : '' },
            { field: 'approved_at',       label: 'Data de aprovação',        get: c => fmtDate(c.addendum?.approved_at) },
        ],
    },
    {
        source: 'special',
        label: 'Especiais',
        fields: [
            { field: 'today',        label: 'Data de hoje',             get: () => new Date().toLocaleDateString('pt-BR') },
            { field: 'today_long',   label: 'Data por extenso',         get: () => new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) },
            { field: 'current_year', label: 'Ano atual',                get: () => String(new Date().getFullYear()) },
            { field: 'current_month',label: 'Mês atual (número)',       get: () => String(new Date().getMonth() + 1).padStart(2, '0') },
            { field: 'current_month_name', label: 'Mês atual por extenso', get: () => new Date().toLocaleDateString('pt-BR', { month: 'long' }) },
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
