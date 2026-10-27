/**
 * Filtro avançado de Boletos a Pagar — um campo para CADA coluna da tabela
 * (27/10/2026: o painel só tinha 6 das 12 colunas; faltavam Código, Documento,
 * Obra, Centro de Custo, Capturado em e Capturado por).
 *
 * Guia §5.5: o valor comparado é o que a célula MOSTRA, e campo com conjunto
 * conhecido de valores traz `options`. Por isso o `getValue` repete a lógica da
 * célula (nome resolvido pelo mapa, rótulo de origem…), nunca o id cru.
 * Plano: docs/planos/2026-10-27-boletos-filtro-avancado-todas-colunas.md.
 */
import type { Boleto } from '../types';
import type { FilterFieldConfig } from '../components/ui/FilterUtils';
import { distinctOptions } from '../components/ui/FilterUtils';
import { STATUS_LABELS } from './boletoStatus';
import { beneficiarioDoBoleto } from './boletoBeneficiario';

/** Os mapas id → nome que a tela carrega e as células usam. */
export interface MapasDoBoleto {
    supplierMap: Record<string, string>;
    projectMap: Record<string, string>;
    ccMap: Record<string, string>;
    userNameMap: Record<string, string>;
}

/** O texto que a coluna Origem mostra (o filtro avançado compara com ele — §5.5). */
export function rotuloOrigem(b: Boleto): string {
    return b.origem === 'email' ? 'E-mail' : 'Upload';
}

/** Quem capturou: o nome do cadastro; sem nome, o próprio e-mail. */
export function nomeCapturador(b: Boleto, userNameMap: Record<string, string>): string {
    const email = b.created_by_email ?? '';
    return userNameMap[email.trim().toLowerCase()] ?? (email || '—');
}

/**
 * Dia (AAAA-MM-DD) da captura NO FUSO DO USUÁRIO — o mesmo dia que a coluna
 * "Capturado em" mostra. `created_at` é um timestamp UTC: comparar a string crua
 * com a data do filtro nunca casa em "É" e exclui o último dia em "Entre".
 */
export function diaDaCaptura(b: Boleto): string | null {
    if (!b.created_at) return null;
    const d = new Date(b.created_at);
    if (Number.isNaN(d.getTime())) return null;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

export function getAdvancedFilterValue(b: Boleto, key: string, mapas: MapasDoBoleto): unknown {
    switch (key) {
        case 'numero': return b.numero ?? null;
        case 'documento': return b.documento_nome ?? '';
        // O MESMO nome que a célula mostra (utils/boletoBeneficiario) — nunca o arquivo.
        case 'beneficiario': return beneficiarioDoBoleto(b, mapas.supplierMap).nome ?? '';
        case 'descricao': return b.descricao ?? '';
        case 'obra': return b.project_id ? (mapas.projectMap[b.project_id] ?? '') : '';
        case 'centro_custo': return b.cost_center_id ? (mapas.ccMap[b.cost_center_id] ?? '') : '';
        case 'status': return b.status;
        case 'valor': return b.valor ?? null;
        case 'vencimento': return b.vencimento ?? null;
        case 'banco': return b.banco_nome ?? '';
        case 'capturado_em': return diaDaCaptura(b);
        case 'capturado_por': return b.created_by_email ? nomeCapturador(b, mapas.userNameMap) : '';
        case 'origem': return rotuloOrigem(b);
        default: return null;
    }
}

// Beneficiário, Obra, Centro de Custo e Capturado por são LISTA COM BUSCA — valores
// distintos das linhas BASE (`boletos`, antes de busca/período/valor) pelo MESMO
// getValue da célula (§5.5, lookup grande).
export function buildAdvancedFilterFields(boletos: Boleto[], mapas: MapasDoBoleto): FilterFieldConfig[] {
    const opcoes = (key: string) => distinctOptions(boletos, b => getAdvancedFilterValue(b, key, mapas));
    return [
        { key: 'numero', label: 'Código', type: 'number' },
        { key: 'documento', label: 'Documento', type: 'text' },
        { key: 'beneficiario', label: 'Beneficiário', type: 'text', options: opcoes('beneficiario') },
        { key: 'descricao', label: 'Descrição', type: 'text' },
        { key: 'obra', label: 'Obra', type: 'text', options: opcoes('obra') },
        { key: 'centro_custo', label: 'Centro de Custo', type: 'text', options: opcoes('centro_custo') },
        { key: 'valor', label: 'Valor', type: 'number' },
        { key: 'vencimento', label: 'Vencimento', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })) },
        { key: 'capturado_em', label: 'Capturado em', type: 'date' },
        { key: 'capturado_por', label: 'Capturado por', type: 'text', options: opcoes('capturado_por') },
        { key: 'banco', label: 'Banco', type: 'text' },
        { key: 'origem', label: 'Origem', type: 'select', options: [{ value: 'Upload', label: 'Upload' }, { value: 'E-mail', label: 'E-mail' }] },
    ];
}
