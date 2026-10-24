import { formatarEnderecoEmpresa } from './enderecoEmpresa';

/**
 * Empregador no recibo de pagamento (holerite), lido da ORGANIZAÇÃO da folha.
 *
 * Até 24/10/2026 o cabeçalho era fixo no código ("OPURA PRO", CNPJ
 * 00.000.000/0001-00, "Unidade Operacional - Obra Garden"). Nome, CNPJ e
 * endereço vêm de `organizations`, que em org PJ espelha a matriz por gatilho
 * (é o que os outros documentos do app já leem). Org de pessoa física
 * (`settings.tipo_pessoa = 'PF'`) guarda o CPF em `organizations.cnpj`.
 */

/** `organizations.address` (chaves da tela de Organização). */
export interface EnderecoOrganizacao {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
}

export interface OrganizacaoParaHolerite {
    name: string;
    cnpj: string | null;
    address: EnderecoOrganizacao | null;
    settings: { tipo_pessoa?: string } | null;
}

export interface EmpregadorDoHolerite {
    nome: string;
    documentoRotulo: 'CNPJ' | 'CPF';
    /** Vazio quando não cadastrado — a tela decide o que mostrar. */
    documento: string;
    /** Uma linha; vazio quando não cadastrado. */
    endereco: string;
}

export function empregadorDoHolerite(org: OrganizacaoParaHolerite): EmpregadorDoHolerite {
    const a = org.address ?? {};
    return {
        nome: org.name,
        documentoRotulo: org.settings?.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ',
        documento: (org.cnpj ?? '').trim(),
        endereco: formatarEnderecoEmpresa({
            logradouro: a.street, numero: a.number, complemento: a.complement,
            bairro: a.neighborhood, cidade: a.city, uf: a.state, cep: a.zipCode,
        }),
    };
}
