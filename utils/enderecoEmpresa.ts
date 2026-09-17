import type { CompanyEndereco } from '../types/company';

/**
 * Endereço de empresa (`companies.endereco_fiscal` / `endereco_operacional`)
 * em UMA linha, no formato que vai numa nota fiscal:
 *
 *   "Praça Coronel Maximiano, 120, Sala 3 - Centro, Cambuí/MG - CEP 37600-000"
 *
 * Campo vazio some sem deixar vírgula sobrando; tudo vazio devolve '' — é o
 * chamador que decide o que mostrar no lugar (um "—", ou o outro endereço).
 */
export function formatarEnderecoEmpresa(e?: CompanyEndereco | null): string {
    if (!e) return '';
    const limpo = (v?: string) => (v ?? '').trim();

    const via = [limpo(e.logradouro), limpo(e.numero), limpo(e.complemento)].filter(Boolean).join(', ');
    const cidadeUf = [limpo(e.cidade), limpo(e.uf)].filter(Boolean).join('/');
    const bairroCidade = [limpo(e.bairro), cidadeUf].filter(Boolean).join(', ');
    const cep = limpo(e.cep) ? `CEP ${limpo(e.cep)}` : '';

    return [via, bairroCidade, cep].filter(Boolean).join(' - ');
}

/**
 * Fiscal primeiro (é o da nota); operacional só quando o fiscal está em branco.
 */
export function enderecoDaEmpresaParaNota(
    fiscal?: CompanyEndereco | null,
    operacional?: CompanyEndereco | null,
): string {
    return formatarEnderecoEmpresa(fiscal) || formatarEnderecoEmpresa(operacional);
}
