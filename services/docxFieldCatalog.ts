import { Contract, ContractAddendum, ContractGuarantee, ContractGuarantor } from '../types/contracts';
import { Client, Organization } from '../types/users';
import { ProjectSettings } from '../types/project';
import { Property } from '../types/imovib';
import { Company } from '../types/company';

// ─── Tipos ──────────────────────────────────────────────────────────────────────
/**
 * ⚠️ Extensão ADITIVA apenas. Os `token_map` já gravados em `document_templates`
 * guardam `{ source, field }` como string; remover ou renomear qualquer membro
 * desta união (ou qualquer `field` de FIELD_GROUPS) faz o mapeamento antigo
 * resolver silenciosamente para string vazia. Para melhorar um rótulo, mude só
 * o `label`.
 */
export type FieldSource =
    | 'organization' | 'client' | 'contract' | 'project' | 'addendum' | 'special'
    // Locação (2026-07-31)
    | 'landlord' | 'unit' | 'rent' | 'guarantee' | 'guarantor';

/** Mapeamento de um marcador {NNN} para uma origem de dado (ou texto fixo). */
export interface TokenMapping {
    source: FieldSource | 'fixed';
    field?: string;   // chave do campo dentro da origem (quando source ≠ 'fixed')
    label?: string;   // rótulo do campo escolhido (para exibição)
    fixed?: string;   // texto livre (quando source = 'fixed')
}

export type TokenMap = Record<string, TokenMapping>;

/** Locador resolvido: a empresa do grupo + quem assina por ela. */
export interface LandlordInfo {
    company?: Company | null;
    signatory?: { nome: string; documento?: string; is_administrador?: boolean } | null;
}

/** Uma unidade da negociação, já com o nome da torre e o valor rateado. */
export interface RentalUnitInfo {
    property: Property;
    /** Nome do imóvel-pai (torre/edifício), via `parent_id`. */
    buildingName?: string | null;
    /** Valor desta unidade em `commercial_deal_units`. */
    dealValue?: number | null;
    isPrimary?: boolean;
}

/** Agregados que não moram no contrato — vêm da série de parcelas da negociação. */
export interface RentalMeta {
    totalContractValue?: number | null;
    installmentsCount?: number | null;
    firstDueDate?: string | null;
    dealId?: string | null;
}

/** Contexto com os objetos resolvidos no momento da emissão. */
export interface ResolveContext {
    organization?: Organization | null;
    client?: Client | null;
    contract?: Contract | null;
    project?: ProjectSettings | null;
    /** Preenchido só na emissão a partir de um aditivo. */
    addendum?: ContractAddendum | null;

    // ── Locação ─────────────────────────────────────────────────────────────
    // Todos opcionais: quando ausentes os campos resolvem string vazia, igual a
    // qualquer outra origem não fornecida. Montados por
    // `rentalDocumentContextService.buildRentalResolveContext`.
    landlord?: LandlordInfo | null;
    /** Unidades do contrato, principal primeiro. */
    units?: RentalUnitInfo[] | null;
    guarantee?: ContractGuarantee | null;
    guarantors?: ContractGuarantor[] | null;
    rentalMeta?: RentalMeta | null;
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

/**
 * Prazo em MESES entre duas datas — é assim que um contrato de locação declara
 * a vigência ("prazo de 30 meses"), não em dias. Calcula por componentes de data
 * em UTC (não por divisão de milissegundos), que é o único jeito de 01/01 a
 * 31/12 dar 12 e não 11,97.
 */
const diffMonths = (start?: string, end?: string): string => {
    if (!start || !end) return '';
    const [ys, ms_, ds] = start.slice(0, 10).split('-').map(Number);
    const [ye, me, de] = end.slice(0, 10).split('-').map(Number);
    if (!ys || !ye) return '';
    let months = (ye - ys) * 12 + (me - ms_);
    // Fim de vigência é tipicamente o dia ANTERIOR ao aniversário (12 meses =
    // 01/01/2026 → 31/12/2026), então o dia final menor que o inicial ainda
    // fecha o mês corrente em vez de descontá-lo.
    if (de >= ds - 1) months += 0; else months -= 1;
    return String(Math.max(0, months));
};

const fmtArea = (n?: number | null): string =>
    typeof n === 'number' && !isNaN(n)
        ? `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`
        : '';

const fmtInt = (n?: number | null): string =>
    typeof n === 'number' && !isNaN(n) ? String(n) : '';

/** Traduz um código de enum para o rótulo pt-BR da minuta; desconhecido passa cru. */
const mapLabel = (dict: Record<string, string>, v?: string | null): string =>
    v ? (dict[v] ?? v) : '';

/** Junta partes de uma frase descartando as vazias — evita ", , " na minuta. */
const join = (parts: (string | undefined | null)[], sep = ', '): string =>
    parts.map(p => (p ?? '').trim()).filter(Boolean).join(sep);

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
    // Bilhões entram porque o valor TOTAL de um contrato (aluguel × dezenas de
    // meses, ou uma carteira de locação) passa de milhão com facilidade — sem
    // esta faixa o extenso simplesmente omitia a maior parte do número.
    const bilhoes = Math.floor(n / 1_000_000_000);
    const milhoes = Math.floor((n % 1_000_000_000) / 1_000_000);
    const milhares = Math.floor((n % 1_000_000) / 1000);
    const resto = n % 1000;
    const parts: string[] = [];
    if (bilhoes > 0) parts.push(bilhoes === 1 ? 'um bilhão' : `${trio(bilhoes)} bilhões`);
    if (milhoes > 0) parts.push(milhoes === 1 ? 'um milhão' : `${trio(milhoes)} milhões`);
    if (milhares > 0) parts.push(milhares === 1 ? 'mil' : `${trio(milhares)} mil`);
    if (resto > 0) parts.push(trio(resto));
    return parts.join(' e ');
}

/** Número inteiro por extenso — prazo em meses, nº de aluguéis da multa etc. */
export function numeroPorExtenso(n?: number | null): string {
    if (typeof n !== 'number' || isNaN(n)) return '';
    return inteiroExtenso(Math.abs(Math.trunc(n)));
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

// ─── Auxiliares de locação ────────────────────────────────────────────────────────

const PROPERTY_TYPE_LABELS: Record<string, string> = {
    APARTMENT: 'Apartamento', HOUSE: 'Casa', LAND: 'Terreno',
    COMMERCIAL: 'Imóvel comercial', BUILDING: 'Edifício',
};
const GUARANTEE_KIND_LABELS: Record<string, string> = {
    SEM_GARANTIA: 'sem garantia', CAUCAO: 'caução', FIANCA: 'fiança',
    SEGURO_FIANCA: 'seguro-fiança', CESSAO_FIDUCIARIA: 'cessão fiduciária',
    SEGURO_GARANTIA: 'seguro-garantia',
};
const CAUCAO_TYPE_LABELS: Record<string, string> = {
    DINHEIRO: 'em dinheiro', BEM_MOVEL: 'em bem móvel', BEM_IMOVEL: 'em bem imóvel',
    TITULOS: 'em títulos', QUOTAS: 'em quotas',
};
const COST_BEARER_LABELS: Record<string, string> = {
    LOCATARIO: 'Locatário', LOCADOR: 'Locador', AMBOS: 'Ambos',
};

/** Endereço numa linha, no formato usado nas cláusulas: "Rua X, 100 - Bairro - Cidade/UF - CEP 00000-000". */
const addressLine = (a: {
    street?: string | null; number?: string | null; complement?: string | null;
    neighborhood?: string | null; city?: string | null; state?: string | null; zip?: string | null;
}): string => join([
    join([a.street, a.number]),
    a.complement,
    a.neighborhood,
    a.city && a.state ? `${a.city}/${a.state}` : (a.city || a.state),
    a.zip ? `CEP ${a.zip}` : '',
], ' - ');

const landlordAddress = (c?: Company | null): string => {
    const e = c?.endereco_fiscal;
    if (!e) return '';
    return addressLine({
        street: e.logradouro, number: e.numero, complement: e.complemento,
        neighborhood: e.bairro, city: e.cidade, state: e.uf, zip: e.cep,
    });
};

const unitAddress = (p?: Property | null): string => {
    if (!p) return '';
    // `street` só existe nas linhas migradas; `address` é o campo legado de texto
    // livre e continua sendo o que muitas unidades antigas têm preenchido.
    const structured = addressLine({
        street: p.street, number: p.number, complement: p.complement,
        neighborhood: p.neighborhood, city: p.city, state: p.state, zip: p.zip_code,
    });
    return structured || (p.address ?? '');
};

/** "matrícula nº 12.345 do 1º Ofício de Registro de Imóveis de Belo Horizonte/MG" */
const registrationPhrase = (p?: Property | null): string => {
    if (!p?.registration_number) return '';
    return p.registry_office
        ? `matrícula nº ${p.registration_number} do ${p.registry_office}`
        : `matrícula nº ${p.registration_number}`;
};

/** RG com órgão expedidor e UF, como a qualificação exige. */
const rgFull = (c?: Client | null): string => {
    if (!c?.rg) return '';
    const orgao = join([c.rg_issuing_agency, c.rg_uf], '/');
    return orgao ? `${c.rg} ${orgao}` : c.rg;
};

/** Qualificação da parte pessoa física/jurídica, como parágrafo pronto da minuta. */
const clientQualification = (c?: Client | null): string => {
    if (!c?.name) return '';
    const endereco = addressLine({
        street: c.address, number: c.address_number, neighborhood: c.neighborhood,
        city: c.city, state: c.state, zip: c.zip_code,
    });
    if (c.type === 'PJ') {
        return join([
            `${c.name}, pessoa jurídica de direito privado`,
            c.document ? `inscrita no CNPJ sob o nº ${c.document}` : '',
            endereco ? `com sede em ${endereco}` : '',
        ]);
    }
    const estadoCivil = c.marital_regime && c.marital_status
        ? `${c.marital_status.toLowerCase()} sob o regime de ${c.marital_regime.toLowerCase()}`
        : (c.marital_status ? c.marital_status.toLowerCase() : '');
    const rg = rgFull(c);
    return join([
        c.name,
        c.nationality ? c.nationality.toLowerCase() : '',
        estadoCivil,
        c.profession ? c.profession.toLowerCase() : '',
        rg ? `portador(a) do RG nº ${rg}` : '',
        c.document ? `inscrito(a) no CPF sob o nº ${c.document}` : '',
        endereco ? `residente e domiciliado(a) em ${endereco}` : '',
    ]);
};

const spouseQualification = (c?: Client | null): string => {
    if (!c?.spouse_name) return '';
    return join([
        c.spouse_name,
        c.spouse_document ? `inscrito(a) no CPF sob o nº ${c.spouse_document}` : '',
        c.marital_regime ? `casado(a) com ${c.name} sob o regime de ${c.marital_regime.toLowerCase()}` : '',
    ]);
};

const landlordQualification = (l?: LandlordInfo | null): string => {
    const c = l?.company;
    if (!c?.razao_social) return '';
    const endereco = landlordAddress(c);
    const rep = l?.signatory?.nome
        ? join([
            `neste ato representada por ${l.signatory.nome}`,
            l.signatory.documento ? `portador(a) do CPF nº ${l.signatory.documento}` : '',
        ])
        : (c.responsavel_legal_nome ? `neste ato representada por ${c.responsavel_legal_nome}` : '');
    return join([
        `${c.razao_social}, pessoa jurídica de direito privado`,
        c.cnpj ? `inscrita no CNPJ sob o nº ${c.cnpj}` : '',
        endereco ? `com sede em ${endereco}` : '',
        rep,
    ]);
};

const guarantorQualification = (g?: ContractGuarantor | null): string => {
    if (!g?.name) return '';
    if (g.person_type === 'PJ') {
        return join([
            `${g.name}, pessoa jurídica de direito privado`,
            g.document ? `inscrita no CNPJ sob o nº ${g.document}` : '',
            g.address ? `com sede em ${g.address}` : '',
        ]);
    }
    const estadoCivil = g.marital_regime && g.marital_status
        ? `${g.marital_status.toLowerCase()} sob o regime de ${g.marital_regime.toLowerCase()}`
        : (g.marital_status ? g.marital_status.toLowerCase() : '');
    return join([
        g.name,
        estadoCivil,
        g.document ? `inscrito(a) no CPF sob o nº ${g.document}` : '',
        g.address ? `residente e domiciliado(a) em ${g.address}` : '',
        g.spouse_name ? `casado(a) com ${g.spouse_name}${g.spouse_document ? `, CPF nº ${g.spouse_document}` : ''}` : '',
    ]);
};

/** Unidade principal do contrato (a marcada como `is_primary`, senão a primeira). */
const primaryUnit = (c: ResolveContext): RentalUnitInfo | undefined =>
    (c.units || []).find(u => u.isPrimary) ?? (c.units || [])[0];

const unitAt = (c: ResolveContext, i: number): RentalUnitInfo | undefined => (c.units || [])[i];

/** Valor MENSAL do aluguel. Em contrato recorrente `original_value` já é a parcela. */
const monthlyRent = (c: ResolveContext): number | undefined =>
    c.contract?.current_value ?? c.contract?.original_value ?? undefined;

/** Descrição de uma unidade num parágrafo — base da cláusula de objeto multi-unidade. */
const unitDescription = (u: RentalUnitInfo): string => join([
    u.property.name,
    mapLabel(PROPERTY_TYPE_LABELS, u.property.type),
    u.buildingName ? `no empreendimento ${u.buildingName}` : '',
    unitAddress(u.property),
    u.property.private_area ? `área privativa de ${fmtArea(u.property.private_area)}` : '',
    registrationPhrase(u.property),
]);

/** Cláusula de garantia pronta, redigida por modalidade (art. 37 da Lei 8.245/91). */
const guaranteeClause = (c: ResolveContext): string => {
    const g = c.guarantee;
    if (!g || g.kind === 'SEM_GARANTIA') {
        return 'A presente locação é celebrada sem garantia.';
    }
    const nomes = (c.guarantors || []).map(x => x.name).filter(Boolean).join(', ');
    switch (g.kind) {
        case 'CAUCAO': {
            const especie = mapLabel(CAUCAO_TYPE_LABELS, g.caucao_type);
            const valor = fmtCurrency(g.guaranteed_value);
            const meses = g.rent_months_equivalent
                ? `, equivalente a ${g.rent_months_equivalent} (${numeroPorExtenso(g.rent_months_equivalent)}) aluguéis`
                : '';
            const deposito = g.deposit_bank
                ? ` Depositada no banco ${join([g.deposit_bank, g.deposit_agency ? `agência ${g.deposit_agency}` : '', g.deposit_account ? `conta ${g.deposit_account}` : ''])}.`
                : '';
            return `${join(['A presente locação é garantida por caução', especie, valor ? `no valor de ${valor}` : ''], ' ')}${meses}.${deposito}`;
        }
        case 'FIANCA':
            return nomes
                ? `A presente locação é garantida por fiança, prestada por ${nomes}, que se obriga(m) solidariamente com o LOCATÁRIO por todas as obrigações deste contrato.`
                : 'A presente locação é garantida por fiança.';
        case 'SEGURO_FIANCA':
            return join([
                'A presente locação é garantida por seguro-fiança locatícia',
                g.insurer ? `contratado junto a ${g.insurer}` : '',
                g.policy_number ? `apólice nº ${g.policy_number}` : '',
            ]) + '.';
        case 'CESSAO_FIDUCIARIA':
            return `A presente locação é garantida por cessão fiduciária de quotas de fundo de investimento${g.guaranteed_value ? ` no valor de ${fmtCurrency(g.guaranteed_value)}` : ''}.`;
        default:
            return `A presente locação é garantida por ${mapLabel(GUARANTEE_KIND_LABELS, g.kind)}.`;
    }
};

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
            // Qualificação civil (migration 20270842000000) — sem estes campos a
            // cláusula de qualificação das partes nasce incompleta.
            { field: 'nationality',     label: 'Nacionalidade',        get: c => c.client?.nationality ?? '' },
            { field: 'profession',      label: 'Profissão',            get: c => c.client?.profession ?? '' },
            { field: 'marital_status',  label: 'Estado civil',         get: c => c.client?.marital_status ?? '' },
            { field: 'marital_regime',  label: 'Regime de bens',       get: c => c.client?.marital_regime ?? '' },
            { field: 'spouse_name',     label: 'Nome do cônjuge',      get: c => c.client?.spouse_name ?? '' },
            { field: 'spouse_document', label: 'CPF do cônjuge',       get: c => c.client?.spouse_document ?? '' },
            { field: 'rg_full',         label: 'RG completo (nº + órgão/UF)', get: c => rgFull(c.client) },
            { field: 'qualificacao',    label: 'Qualificação completa (parágrafo)', get: c => clientQualification(c.client) },
            { field: 'spouse_qualificacao', label: 'Qualificação do cônjuge', get: c => spouseQualification(c.client) },
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
    // ─── Locação ──────────────────────────────────────────────────────────────
    // Os cinco grupos abaixo só são preenchidos quando o documento é emitido a
    // partir de uma negociação de locação (DealModal → aba Contrato), que monta o
    // contexto via `rentalDocumentContextService`. Em qualquer outra emissão
    // resolvem string vazia, como qualquer origem ausente.
    {
        source: 'landlord',
        label: 'Locador (Empresa)',
        fields: [
            { field: 'razao_social',        label: 'Razão social',            get: c => c.landlord?.company?.razao_social ?? '' },
            { field: 'nome_fantasia',       label: 'Nome fantasia',           get: c => c.landlord?.company?.nome_fantasia ?? '' },
            { field: 'cnpj',                label: 'CNPJ',                    get: c => c.landlord?.company?.cnpj ?? '' },
            { field: 'inscricao_estadual',  label: 'Inscrição estadual',      get: c => c.landlord?.company?.inscricao_estadual ?? '' },
            { field: 'inscricao_municipal', label: 'Inscrição municipal',     get: c => c.landlord?.company?.inscricao_municipal ?? '' },
            { field: 'street',              label: 'Logradouro (sede)',       get: c => c.landlord?.company?.endereco_fiscal?.logradouro ?? '' },
            { field: 'number',              label: 'Número (sede)',           get: c => c.landlord?.company?.endereco_fiscal?.numero ?? '' },
            { field: 'complement',          label: 'Complemento (sede)',      get: c => c.landlord?.company?.endereco_fiscal?.complemento ?? '' },
            { field: 'neighborhood',        label: 'Bairro (sede)',           get: c => c.landlord?.company?.endereco_fiscal?.bairro ?? '' },
            { field: 'city',                label: 'Cidade (sede)',           get: c => c.landlord?.company?.endereco_fiscal?.cidade ?? '' },
            { field: 'state',               label: 'UF (sede)',               get: c => c.landlord?.company?.endereco_fiscal?.uf ?? '' },
            { field: 'zip_code',            label: 'CEP (sede)',              get: c => c.landlord?.company?.endereco_fiscal?.cep ?? '' },
            { field: 'address_full',        label: 'Endereço completo (sede)', get: c => landlordAddress(c.landlord?.company) },
            { field: 'phone',               label: 'Telefone',                get: c => c.landlord?.company?.telefone ?? '' },
            { field: 'email',               label: 'E-mail',                  get: c => c.landlord?.company?.email_comercial || c.landlord?.company?.email_financeiro || c.landlord?.company?.email_fiscal || '' },
            { field: 'responsavel_legal',   label: 'Responsável legal',       get: c => c.landlord?.company?.responsavel_legal_nome ?? '' },
            { field: 'signatory_name',      label: 'Assinante legal (sócio)', get: c => c.landlord?.signatory?.nome ?? '' },
            { field: 'signatory_document',  label: 'CPF/CNPJ do assinante',   get: c => c.landlord?.signatory?.documento ?? '' },
            { field: 'signatory_role',      label: 'Cargo do assinante',      get: c => (c.landlord?.signatory ? (c.landlord.signatory.is_administrador ? 'Administrador' : 'Sócio') : '') },
            { field: 'qualificacao',        label: 'Qualificação completa (parágrafo)', get: c => landlordQualification(c.landlord) },
        ],
    },
    {
        source: 'unit',
        label: 'Imóvel Locado',
        fields: [
            { field: 'name',            label: 'Identificação da unidade', get: c => primaryUnit(c)?.property.name ?? '' },
            { field: 'type_label',      label: 'Tipo do imóvel',           get: c => mapLabel(PROPERTY_TYPE_LABELS, primaryUnit(c)?.property.type) },
            { field: 'building_name',   label: 'Torre / Empreendimento',   get: c => primaryUnit(c)?.buildingName ?? '' },
            { field: 'block',           label: 'Bloco',                    get: c => primaryUnit(c)?.property.block ?? '' },
            { field: 'floor',           label: 'Pavimento',                get: c => fmtInt(primaryUnit(c)?.property.floor) },
            { field: 'number',          label: 'Número da unidade',        get: c => primaryUnit(c)?.property.number ?? '' },
            { field: 'typology',        label: 'Tipologia',                get: c => primaryUnit(c)?.property.typology ?? '' },
            { field: 'street',          label: 'Logradouro',               get: c => primaryUnit(c)?.property.street ?? '' },
            { field: 'complement',      label: 'Complemento',              get: c => primaryUnit(c)?.property.complement ?? '' },
            { field: 'neighborhood',    label: 'Bairro',                   get: c => primaryUnit(c)?.property.neighborhood ?? '' },
            { field: 'city',            label: 'Cidade',                   get: c => primaryUnit(c)?.property.city ?? '' },
            { field: 'state',           label: 'UF',                       get: c => primaryUnit(c)?.property.state ?? '' },
            { field: 'zip_code',        label: 'CEP',                      get: c => primaryUnit(c)?.property.zip_code ?? '' },
            { field: 'address_full',    label: 'Endereço completo do imóvel', get: c => unitAddress(primaryUnit(c)?.property) },
            { field: 'area',            label: 'Área (m²)',                get: c => fmtArea(primaryUnit(c)?.property.area) },
            { field: 'private_area',    label: 'Área privativa (m²)',      get: c => fmtArea(primaryUnit(c)?.property.private_area) },
            { field: 'common_area',     label: 'Área comum (m²)',          get: c => fmtArea(primaryUnit(c)?.property.common_area) },
            { field: 'total_area',      label: 'Área total (m²)',          get: c => fmtArea(primaryUnit(c)?.property.total_area) },
            { field: 'bedrooms',        label: 'Dormitórios',              get: c => fmtInt(primaryUnit(c)?.property.bedrooms) },
            { field: 'bathrooms',       label: 'Banheiros',                get: c => fmtInt(primaryUnit(c)?.property.bathrooms) },
            { field: 'parking_spaces',  label: 'Vagas de garagem',         get: c => fmtInt(primaryUnit(c)?.property.parking_spaces) },
            { field: 'registration_number', label: 'Matrícula',            get: c => primaryUnit(c)?.property.registration_number ?? '' },
            { field: 'registry_office', label: 'Cartório de Registro de Imóveis', get: c => primaryUnit(c)?.property.registry_office ?? '' },
            { field: 'iptu_registration', label: 'Inscrição imobiliária (IPTU)', get: c => primaryUnit(c)?.property.iptu_registration ?? '' },
            { field: 'registration_full', label: 'Matrícula por extenso jurídico', get: c => registrationPhrase(primaryUnit(c)?.property) },
            { field: 'deal_value',      label: 'Valor da unidade na negociação', get: c => fmtCurrency(primaryUnit(c)?.dealValue ?? undefined) },
            { field: 'count',           label: 'Quantidade de unidades',   get: c => String((c.units || []).length || '') },
            { field: 'all_names',       label: 'Unidades (lista)',         get: c => (c.units || []).map(u => u.property.name).filter(Boolean).join(' + ') },
            { field: 'all_descriptions', label: 'Descrição completa das unidades', get: c => (c.units || []).map(unitDescription).filter(Boolean).join('; ') },
            // Posições fixas: minutas costumam citar vaga e box em cláusulas próprias.
            { field: 'u2_name',                label: '2ª unidade — identificação', get: c => unitAt(c, 1)?.property.name ?? '' },
            { field: 'u2_registration_number', label: '2ª unidade — matrícula',     get: c => unitAt(c, 1)?.property.registration_number ?? '' },
            { field: 'u3_name',                label: '3ª unidade — identificação', get: c => unitAt(c, 2)?.property.name ?? '' },
            { field: 'u3_registration_number', label: '3ª unidade — matrícula',     get: c => unitAt(c, 2)?.property.registration_number ?? '' },
        ],
    },
    {
        source: 'rent',
        label: 'Aluguel e Vigência',
        fields: [
            // ⚠️ Em contrato recorrente `original_value` é o valor da PARCELA
            // (o aluguel mensal), não o total do contrato — ver contractService
            // .createFromDeal. O total vem de `rentalMeta`, calculado da série
            // de parcelas da negociação.
            { field: 'value',            label: 'Valor do aluguel mensal (R$)', get: c => fmtCurrency(monthlyRent(c)) },
            { field: 'value_ext',        label: 'Valor do aluguel por extenso', get: c => valorPorExtenso(monthlyRent(c)) },
            { field: 'billing_cycle_label', label: 'Periodicidade',          get: c => c.contract?.billing_cycle ?? '' },
            { field: 'due_day',          label: 'Dia de vencimento',         get: c => fmtInt(c.contract?.due_day) },
            { field: 'first_due_date',   label: 'Vencimento da 1ª parcela',  get: c => {
                if (c.rentalMeta?.firstDueDate) return fmtDate(c.rentalMeta.firstDueDate);
                const start = c.contract?.start_date;
                const days = c.contract?.payment_days;
                if (!start || days == null) return '';
                const dt = new Date(`${start.slice(0, 10)}T12:00:00`);
                dt.setDate(dt.getDate() + days);
                return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('pt-BR');
            } },
            { field: 'start_date',       label: 'Início da vigência',        get: c => fmtDate(c.contract?.start_date) },
            { field: 'end_date',         label: 'Término da vigência',       get: c => fmtDate(c.contract?.end_date) },
            { field: 'term_months',      label: 'Prazo (meses)',             get: c => diffMonths(c.contract?.start_date, c.contract?.end_date) },
            { field: 'term_months_ext',  label: 'Prazo por extenso',         get: c => numeroPorExtenso(Number(diffMonths(c.contract?.start_date, c.contract?.end_date)) || null) },
            { field: 'total_value',      label: 'Valor total do contrato (R$)', get: c => {
                const total = c.rentalMeta?.totalContractValue;
                if (typeof total === 'number' && total > 0) return fmtCurrency(total);
                const meses = Number(diffMonths(c.contract?.start_date, c.contract?.end_date));
                const mensal = monthlyRent(c);
                return meses > 0 && mensal ? fmtCurrency(meses * mensal) : '';
            } },
            { field: 'total_value_ext',  label: 'Valor total por extenso',   get: c => {
                const total = c.rentalMeta?.totalContractValue;
                if (typeof total === 'number' && total > 0) return valorPorExtenso(total);
                const meses = Number(diffMonths(c.contract?.start_date, c.contract?.end_date));
                const mensal = monthlyRent(c);
                return meses > 0 && mensal ? valorPorExtenso(meses * mensal) : '';
            } },
            { field: 'reajuste_index',     label: 'Índice de reajuste',      get: c => c.contract?.reajuste_index ?? '' },
            { field: 'reajuste_data_base', label: 'Data-base do reajuste',   get: c => fmtDate(c.contract?.reajuste_data_base) },
            { field: 'reajuste_proximo',   label: 'Próximo reajuste',        get: c => fmtDate(c.contract?.reajuste_proximo) },
            // Periodicidade mínima legal do reajuste (Lei 10.192/01, art. 28).
            { field: 'reajuste_periodicidade', label: 'Periodicidade do reajuste', get: () => 'anual' },
            { field: 'penalty_months',     label: 'Multa rescisória (nº de aluguéis)', get: c => fmtInt(c.contract?.rescission_penalty_months) },
            { field: 'penalty_months_ext', label: 'Multa rescisória por extenso',      get: c => numeroPorExtenso(c.contract?.rescission_penalty_months) },
            { field: 'penalty_value',      label: 'Valor da multa (R$)',     get: c => {
                const m = c.contract?.rescission_penalty_months;
                const v = monthlyRent(c);
                return m && v ? fmtCurrency(m * v) : '';
            } },
            { field: 'penalty_value_ext',  label: 'Valor da multa por extenso', get: c => {
                const m = c.contract?.rescission_penalty_months;
                const v = monthlyRent(c);
                return m && v ? valorPorExtenso(m * v) : '';
            } },
            { field: 'payment_method',     label: 'Forma de pagamento',      get: c => c.contract?.payment_method ?? '' },
            { field: 'installments_count', label: 'Número de parcelas',      get: c => fmtInt(c.rentalMeta?.installmentsCount ?? c.contract?.payment_installments) },
        ],
    },
    {
        source: 'guarantee',
        label: 'Garantia Locatícia',
        fields: [
            { field: 'kind_label',        label: 'Modalidade da garantia',  get: c => mapLabel(GUARANTEE_KIND_LABELS, c.guarantee?.kind) },
            { field: 'caucao_type_label', label: 'Tipo de caução',          get: c => mapLabel(CAUCAO_TYPE_LABELS, c.guarantee?.caucao_type) },
            { field: 'product_name',      label: 'Produto / garantidora',   get: c => c.guarantee?.product_name ?? '' },
            { field: 'guaranteed_value',     label: 'Valor garantido (R$)',    get: c => fmtCurrency(c.guarantee?.guaranteed_value) },
            { field: 'guaranteed_value_ext', label: 'Valor garantido por extenso', get: c => valorPorExtenso(c.guarantee?.guaranteed_value) },
            // Teto legal: caução em dinheiro não pode exceder 3 aluguéis (art. 38, §2º).
            { field: 'rent_months_equivalent',     label: 'Equivalente em aluguéis', get: c => fmtInt(c.guarantee?.rent_months_equivalent) },
            { field: 'rent_months_equivalent_ext', label: 'Equivalente em aluguéis por extenso', get: c => numeroPorExtenso(c.guarantee?.rent_months_equivalent) },
            { field: 'insurer',           label: 'Seguradora / Garantidora', get: c => c.guarantee?.insurer ?? '' },
            { field: 'policy_number',     label: 'Nº da apólice',           get: c => c.guarantee?.policy_number ?? '' },
            { field: 'valid_from',        label: 'Início da vigência da garantia', get: c => fmtDate(c.guarantee?.valid_from) },
            { field: 'valid_until',       label: 'Fim da vigência da garantia',    get: c => fmtDate(c.guarantee?.valid_until) },
            { field: 'cost_bearer_label', label: 'Custo por conta de',      get: c => mapLabel(COST_BEARER_LABELS, c.guarantee?.cost_bearer) },
            { field: 'deposit_bank',           label: 'Banco do depósito',   get: c => c.guarantee?.deposit_bank ?? '' },
            { field: 'deposit_agency',         label: 'Agência do depósito', get: c => c.guarantee?.deposit_agency ?? '' },
            { field: 'deposit_account',        label: 'Conta do depósito',   get: c => c.guarantee?.deposit_account ?? '' },
            { field: 'deposit_account_holder', label: 'Titular da conta',    get: c => c.guarantee?.deposit_account_holder ?? '' },
            { field: 'deposit_date',           label: 'Data do depósito',    get: c => fmtDate(c.guarantee?.deposit_date) },
            { field: 'deposit_full',      label: 'Dados bancários da caução (parágrafo)', get: c => {
                const g = c.guarantee;
                if (!g?.deposit_bank && !g?.deposit_account) return '';
                return join([
                    g?.deposit_bank ? `Banco ${g.deposit_bank}` : '',
                    g?.deposit_agency ? `agência ${g.deposit_agency}` : '',
                    g?.deposit_account ? `conta ${g.deposit_account}` : '',
                    g?.deposit_account_holder ? `em nome de ${g.deposit_account_holder}` : '',
                    g?.deposit_date ? `depósito em ${fmtDate(g.deposit_date)}` : '',
                ]);
            } },
            { field: 'registry_office',   label: 'Cartório do registro',    get: c => c.guarantee?.registry_office ?? '' },
            { field: 'registry_protocol', label: 'Protocolo do registro',   get: c => c.guarantee?.registry_protocol ?? '' },
            { field: 'registered_at',     label: 'Data do registro',        get: c => fmtDate(c.guarantee?.registered_at) },
            { field: 'clause',            label: 'Cláusula de garantia pronta (parágrafo)', get: c => guaranteeClause(c) },
        ],
    },
    {
        source: 'guarantor',
        label: 'Fiador / Garantidor',
        fields: [
            { field: 'name',            label: 'Nome',                    get: c => c.guarantors?.[0]?.name ?? '' },
            { field: 'document',        label: 'CPF / CNPJ',              get: c => c.guarantors?.[0]?.document ?? '' },
            { field: 'person_type',     label: 'Tipo (PF/PJ)',            get: c => c.guarantors?.[0]?.person_type ?? '' },
            { field: 'address',         label: 'Endereço',                get: c => c.guarantors?.[0]?.address ?? '' },
            { field: 'email',           label: 'E-mail',                  get: c => c.guarantors?.[0]?.email ?? '' },
            { field: 'phone',           label: 'Telefone',                get: c => c.guarantors?.[0]?.phone ?? '' },
            { field: 'marital_status',  label: 'Estado civil',            get: c => c.guarantors?.[0]?.marital_status ?? '' },
            { field: 'marital_regime',  label: 'Regime de bens',          get: c => c.guarantors?.[0]?.marital_regime ?? '' },
            { field: 'spouse_name',     label: 'Nome do cônjuge',         get: c => c.guarantors?.[0]?.spouse_name ?? '' },
            { field: 'spouse_document', label: 'CPF do cônjuge',          get: c => c.guarantors?.[0]?.spouse_document ?? '' },
            // CC 1.647-1.649: fiança sem outorga do cônjuge é anulável.
            { field: 'spouse_consent',  label: 'Outorga conjugal (Sim/Não)', get: c => (c.guarantors?.[0] ? (c.guarantors[0].spouse_consent ? 'Sim' : 'Não') : '') },
            { field: 'monthly_income',      label: 'Renda mensal (R$)',       get: c => fmtCurrency(c.guarantors?.[0]?.monthly_income) },
            { field: 'monthly_income_ext',  label: 'Renda mensal por extenso', get: c => valorPorExtenso(c.guarantors?.[0]?.monthly_income) },
            { field: 'asset_description',   label: 'Bem oferecido em garantia', get: c => c.guarantors?.[0]?.asset_description ?? '' },
            { field: 'asset_registration',  label: 'Matrícula do bem',        get: c => c.guarantors?.[0]?.asset_registration ?? '' },
            { field: 'asset_value',         label: 'Valor do bem (R$)',       get: c => fmtCurrency(c.guarantors?.[0]?.asset_value) },
            { field: 'asset_value_ext',     label: 'Valor do bem por extenso', get: c => valorPorExtenso(c.guarantors?.[0]?.asset_value) },
            { field: 'qualificacao',        label: 'Qualificação do fiador (parágrafo)', get: c => guarantorQualification(c.guarantors?.[0]) },
            { field: 'g2_name',             label: '2º fiador — nome',        get: c => c.guarantors?.[1]?.name ?? '' },
            { field: 'g2_document',         label: '2º fiador — CPF/CNPJ',    get: c => c.guarantors?.[1]?.document ?? '' },
            { field: 'g2_qualificacao',     label: '2º fiador — qualificação', get: c => guarantorQualification(c.guarantors?.[1]) },
            { field: 'all_names',           label: 'Fiadores (lista)',        get: c => (c.guarantors || []).map(g => g.name).filter(Boolean).join(', ') },
            { field: 'all_qualificacao',    label: 'Qualificação de todos os fiadores', get: c => (c.guarantors || []).map(guarantorQualification).filter(Boolean).join('; ') },
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
