import { supabase } from '../lib/supabase';

/**
 * Resolve a Conta Financeira (`financial_categories`) que um lançamento do
 * razão deve carregar — id E nome, juntos.
 *
 * Por que existe (verificação da Controladoria, 2026-09-20): a DRE classifica
 * por `internal_transactions.category_id → financial_categories.dre_group`, com
 * fallback pelo texto `category` só quando o nome bate numa categoria da MESMA
 * organização. Três produtores gravavam só o texto, e errado:
 *   · contratos → 'Mão de Obra / Serviço' em TODAS as parcelas, inclusive as
 *     recebíveis (R$ 1,05 M de receita prevista de 2026 caía em custo);
 *   · boletos → nada (498 títulos, R$ 508 k, em "Sem Classificação");
 *   · tributos automáticos de locação/venda → 'Locação'/'Venda', nomes que não
 *     existem no plano.
 *
 * Regra: quem tem a categoria escolhida pelo usuário (`contracts.category_id`,
 * `boletos.category_id`) usa ela; quem não tem cai num padrão POR NOME, tentado
 * na ordem dada, preferindo a categoria da organização à global (org NULL).
 * `financial_categories.name` é UNIQUE global, então cada nome resolve para no
 * máximo uma linha.
 */
export interface CategoriaResolvida {
    category_id: string | null;
    category: string;
}

type LinhaCategoria = { id: string; name: string; organization_id: string | null };

/** Padrões por direção do contrato — o primeiro nome encontrado vence. */
export const CATEGORIA_PADRAO_CONTRATO_RECEBIVEL = ['Receita de Obra', 'Receita de Serviços'];
export const CATEGORIA_PADRAO_CONTRATO_PAGAVEL   = ['Mão de Obra / Serviço', 'Empreiteiros'];

/** Padrões dos tributos automáticos sobre receita (Locações / Venda de Ativos). */
export const CATEGORIA_IMPOSTO_SOBRE_RESULTADO = 'IRPJ / CSLL';
export const CATEGORIA_IMPOSTO_SOBRE_RECEITA   = 'Impostos s/ Receita (ISS/PIS/COFINS)';

/** IRPJ/CSLL/IR são imposto sobre o RESULTADO (linha própria da DRE); o resto
 *  (ISS, PIS, COFINS, INSS…) é dedução da receita bruta. */
export function categoriaDoTributo(nomeTributo: string): string {
    const n = nomeTributo.toUpperCase();
    return /IRPJ|CSLL|\bIR\b|IMPOSTO DE RENDA/.test(n)
        ? CATEGORIA_IMPOSTO_SOBRE_RESULTADO
        : CATEGORIA_IMPOSTO_SOBRE_RECEITA;
}

/** Categoria pelo id escolhido pelo usuário. `null` quando o id não existe mais. */
export async function resolverCategoriaPorId(categoryId: string | null | undefined): Promise<CategoriaResolvida | null> {
    if (!categoryId) return null;
    const { data } = await supabase
        .from('financial_categories')
        .select('id, name')
        .eq('id', categoryId)
        .maybeSingle();
    if (!data) return null;
    return { category_id: data.id as string, category: data.name as string };
}

/**
 * Categoria por nome, na ordem de preferência. Quando nenhum nome existe no
 * catálogo, devolve `category_id: null` e o primeiro nome como texto — o
 * lançamento continua legível em Contas a Pagar/Receber e o fallback por nome
 * da DRE passa a valer no dia em que a categoria for criada.
 */
export async function resolverCategoriaPorNomes(
    organizationId: string | null | undefined,
    nomes: readonly string[],
): Promise<CategoriaResolvida> {
    const fallback: CategoriaResolvida = { category_id: null, category: nomes[0] };
    if (!nomes.length) return { category_id: null, category: '' };
    let q = supabase
        .from('financial_categories')
        .select('id, name, organization_id')
        .in('name', nomes as string[]);
    q = organizationId
        ? q.or(`organization_id.eq.${organizationId},organization_id.is.null`)
        : q.is('organization_id', null);
    const { data } = await q;
    const linhas = (data || []) as LinhaCategoria[];
    if (!linhas.length) return fallback;
    for (const nome of nomes) {
        const candidatas = linhas.filter(l => l.name === nome);
        if (!candidatas.length) continue;
        const escolhida = candidatas.find(l => l.organization_id === organizationId) ?? candidatas[0];
        return { category_id: escolhida.id, category: escolhida.name };
    }
    return fallback;
}

/**
 * Categoria da parcela de um contrato: a escolhida no contrato ("Conta
 * Financeira" do ContractModal) ou o padrão pela direção.
 */
export async function resolverCategoriaDoContrato(contract: {
    organization_id?: string | null;
    category_id?: string | null;
}, recebivel: boolean): Promise<CategoriaResolvida> {
    const escolhida = await resolverCategoriaPorId(contract.category_id);
    if (escolhida) return escolhida;
    return resolverCategoriaPorNomes(
        contract.organization_id,
        recebivel ? CATEGORIA_PADRAO_CONTRATO_RECEBIVEL : CATEGORIA_PADRAO_CONTRATO_PAGAVEL,
    );
}
