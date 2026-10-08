import type { DestinatarioSnapshot, DestinatarioTipo } from '../../types/docGen';

/**
 * Destinatário do documento — normalização PURA de cada cadastro do ERP para
 * um `DestinatarioSnapshot`, e o mapa de "Atualizar cadastro do destinatário"
 * (qual variável grava em qual coluna de qual tabela).
 *
 * Decisão do usuário (07/10/2026): prefeitura, concessionária e órgão público
 * vêm de Meus Fornecedores; o resto vem do próprio cadastro ou é digitado
 * (destinatário MANUAL, que vive só no documento).
 */

export const TIPOS_DESTINATARIO: { id: DestinatarioTipo; label: string; dica: string }[] = [
    { id: 'FORNECEDOR', label: 'Fornecedor / órgão público', dica: 'Meus Fornecedores — inclui prefeituras, concessionárias e instituições' },
    { id: 'CLIENTE', label: 'Cliente', dica: 'Clientes da organização' },
    { id: 'ORGANIZACAO', label: 'Organização', dica: 'Outra organização do grupo' },
    { id: 'COLABORADOR', label: 'Colaborador', dica: 'Recursos Humanos' },
    { id: 'CORRETOR', label: 'Corretor', dica: 'Corretores cadastrados' },
    { id: 'INVESTIDOR', label: 'Investidor', dica: 'Investidores da organização' },
    { id: 'MANUAL', label: 'Destinatário manual', dica: 'Digitado só neste documento, sem cadastro' },
];

export const ROTULO_TIPO: Record<DestinatarioTipo, string> = Object.fromEntries(
    TIPOS_DESTINATARIO.map(t => [t.id, t.label]),
) as Record<DestinatarioTipo, string>;

const s = (v: unknown): string | null => {
    const t = v == null ? '' : String(v).trim();
    return t ? t : null;
};

/** Linha bruta de qualquer cadastro — só os campos que a normalização lê. */
export type LinhaCadastro = Record<string, unknown>;

/** Normaliza um registro do cadastro para o snapshot gravado no documento. */
export function snapshotDe(tipo: DestinatarioTipo, r: LinhaCadastro): DestinatarioSnapshot {
    const id = s(r.id);
    switch (tipo) {
        case 'FORNECEDOR':
            return {
                tipo, id,
                razao_social: s(r.name) ?? '',
                nome_fantasia: s(r.nickname),
                cpf_cnpj: s(r.document),
                logradouro: s(r.street) ?? s(r.address),
                numero: s(r.number),
                bairro: s(r.neighborhood),
                cidade: s(r.city), uf: s(r.state), cep: s(r.zip_code),
                contato_nome: s(r.contact_name),
                contato_email: s(r.email), contato_telefone: s(r.phone),
            };
        case 'CLIENTE':
            return {
                tipo, id,
                razao_social: s(r.name) ?? '',
                nome_fantasia: s(r.nickname),
                cpf_cnpj: s(r.document),
                logradouro: s(r.address), numero: s(r.address_number),
                bairro: s(r.neighborhood),
                cidade: s(r.city), uf: s(r.state), cep: s(r.zip_code),
                contato_nome: s(r.legal_rep_name),
                contato_email: s(r.email), contato_telefone: s(r.phone),
            };
        case 'ORGANIZACAO': {
            const a = (r.address ?? {}) as Record<string, unknown>;
            return {
                tipo, id,
                razao_social: s(r.name) ?? '',
                cpf_cnpj: s(r.cnpj),
                logradouro: s(a.street), numero: s(a.number), bairro: s(a.neighborhood),
                cidade: s(a.city), uf: s(a.state), cep: s(a.zipCode),
                contato_email: s(r.email), contato_telefone: s(r.phone),
            };
        }
        case 'COLABORADOR':
            return {
                tipo, id,
                razao_social: s(r.name) ?? '',
                cpf_cnpj: s(r.cpf),
                logradouro: s(r.address_street), numero: s(r.address_number), complemento: s(r.address_complement),
                bairro: s(r.address_neighborhood),
                cidade: s(r.address_city), uf: s(r.address_uf), cep: s(r.address_zip_code),
                contato_email: s(r.email), contato_telefone: s(r.phone),
            };
        case 'CORRETOR':
            return {
                tipo, id,
                razao_social: s(r.name) ?? '',
                nome_fantasia: s(r.agency_name),
                cpf_cnpj: s(r.cpf),
                contato_email: s(r.email), contato_telefone: s(r.phone),
            };
        case 'INVESTIDOR':
            return {
                tipo, id,
                razao_social: s(r.name) ?? '',
                cpf_cnpj: s(r.document),
                contato_email: s(r.email), contato_telefone: s(r.phone),
            };
        case 'MANUAL':
        default:
            return {
                tipo: 'MANUAL', id: null,
                razao_social: s(r.razao_social) ?? '',
                nome_fantasia: s(r.nome_fantasia),
                cpf_cnpj: s(r.cpf_cnpj),
                logradouro: s(r.logradouro), numero: s(r.numero), complemento: s(r.complemento),
                bairro: s(r.bairro), cidade: s(r.cidade), uf: s(r.uf), cep: s(r.cep),
                contato_nome: s(r.contato_nome), contato_email: s(r.contato_email), contato_telefone: s(r.contato_telefone),
            };
    }
}

/** Campo do snapshot que cada variável `destinatario.*` lê (só as de valor único). */
export const CAMPO_DO_SNAPSHOT: Record<string, keyof DestinatarioSnapshot> = {
    'destinatario.razao_social': 'razao_social',
    'destinatario.nome_fantasia': 'nome_fantasia',
    'destinatario.cpf_cnpj': 'cpf_cnpj',
    'destinatario.bairro': 'bairro',
    'destinatario.cidade': 'cidade',
    'destinatario.uf': 'uf',
    'destinatario.cep': 'cep',
    'destinatario.contato_nome': 'contato_nome',
    'destinatario.contato_email': 'contato_email',
    'destinatario.contato_telefone': 'contato_telefone',
};

/**
 * "Atualizar cadastro do destinatário": variável → coluna, por tabela. Só os
 * tipos cujo cadastro a organização mantém aqui; os demais (organização,
 * corretor, investidor) oferecem só "preencher neste documento". Variáveis
 * compostas (endereço completo, cidade/UF) não entram — não há UMA coluna.
 */
export const COLUNA_NO_CADASTRO: Partial<Record<DestinatarioTipo, Record<string, string>>> = {
    FORNECEDOR: {
        'destinatario.razao_social': 'name',
        'destinatario.nome_fantasia': 'nickname',
        'destinatario.cpf_cnpj': 'document',
        'destinatario.bairro': 'neighborhood',
        'destinatario.cidade': 'city',
        'destinatario.uf': 'state',
        'destinatario.cep': 'zip_code',
        'destinatario.contato_nome': 'contact_name',
        'destinatario.contato_email': 'email',
        'destinatario.contato_telefone': 'phone',
    },
    CLIENTE: {
        'destinatario.razao_social': 'name',
        'destinatario.nome_fantasia': 'nickname',
        'destinatario.cpf_cnpj': 'document',
        'destinatario.bairro': 'neighborhood',
        'destinatario.cidade': 'city',
        'destinatario.uf': 'state',
        'destinatario.cep': 'zip_code',
        'destinatario.contato_email': 'email',
        'destinatario.contato_telefone': 'phone',
    },
    COLABORADOR: {
        'destinatario.cpf_cnpj': 'cpf',
        'destinatario.bairro': 'address_neighborhood',
        'destinatario.cidade': 'address_city',
        'destinatario.uf': 'address_uf',
        'destinatario.cep': 'address_zip_code',
        'destinatario.contato_email': 'email',
        'destinatario.contato_telefone': 'phone',
    },
};

/** Coluna do cadastro para esta variável, ou null quando só cabe "preencher neste documento". */
export function colunaNoCadastro(tipo: DestinatarioTipo | null | undefined, chave: string): string | null {
    if (!tipo) return null;
    return COLUNA_NO_CADASTRO[tipo]?.[chave] ?? null;
}

/** Aplica um valor ao snapshot (depois de atualizar o cadastro, o documento acompanha). */
export function snapshotComCampo(snap: DestinatarioSnapshot, chave: string, valor: string): DestinatarioSnapshot {
    const campo = CAMPO_DO_SNAPSHOT[chave];
    if (!campo || campo === 'tipo' || campo === 'id') return snap;
    return { ...snap, [campo]: valor.trim() || null } as DestinatarioSnapshot;
}

/** Texto curto para listas: "Nome · documento · Cidade/UF". */
export function resumoDoDestinatario(d: DestinatarioSnapshot | null | undefined): string {
    if (!d) return '';
    const cidade = d.cidade && d.uf ? `${d.cidade}/${d.uf}` : d.cidade || d.uf || '';
    return [d.razao_social, d.cpf_cnpj, cidade].filter(Boolean).join(' · ');
}
