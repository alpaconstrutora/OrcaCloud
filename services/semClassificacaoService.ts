import { supabase } from '../lib/supabase';
import type { RegimeContabil } from '../types/financial';
import { motivoForaDeContasAPagar } from '../utils/darf';

// "Sem Classificação" da DRE, lançamento a lançamento (plano
// docs/planos/2026-11-14-controladoria-critica.md, passo 3 — decisão do usuário:
// "Aviso + lista em gaveta", só leitura, sem migration).
//
// A DRE (fn_dre_summary) põe em SEM_CLASSIFICACAO o lançamento cuja categoria não
// leva a um grupo da DRE. Aqui a MESMA regra roda no front sobre a mesma view
// (v_internal_transactions_dre, security_invoker — a RLS vale igual), para dizer
// QUAIS lançamentos são e POR QUÊ, e o total realizado bater com a linha da DRE.

export type MotivoSemClassificacao =
    /** O lançamento não tem plano de contas nenhum. */
    | 'sem_categoria'
    /** Tem um nome de categoria ("Material") que não existe no plano da organização. */
    | 'categoria_inexistente'
    /** A categoria existe no plano, mas está sem grupo da DRE. */
    | 'categoria_sem_grupo';

export interface LancamentoSemClassificacao {
    chave: string;
    id: string;
    data: string;
    descricao: string;
    origem: string;
    categoria: string | null;
    motivo: MotivoSemClassificacao;
    /** Com sinal: entrada +, saída −. */
    valor: number;
    status: 'CONCILIATED' | 'PENDING';
    /** Entra no "Realizado" da DRE neste regime (Caixa: só conciliado). */
    realizado: boolean;
    /** Onde o título mora (vw_payables/vw_receivables: id = o do lançamento).
     *  'tributo' = saída que Contas a Pagar NÃO mostra (tributo sem DARF ou com DARF
     *  em rascunho: mora em Tributos a Pagar). null = contrapartida (entry_type
     *  CONTRA), que não é título em tela nenhuma. */
    titulo: 'pagar' | 'receber' | 'tributo' | null;
    /** DARF do tributo, quando há (Tributos a Pagar abre direto nele). */
    darfId: string | null;
}

export interface LinhaDaView {
    id: string;
    organization_id: string;
    project_id: string | null;
    direction: 'CREDIT' | 'DEBIT';
    status: string;
    transaction_date: string;
    competencia_date: string | null;
    category: string | null;
    category_id_dre: string | null;
    amount_dre: number;
    parte_juros: boolean;
}

export interface CategoriaDoPlano {
    id: string;
    name: string;
    organization_id: string | null;
    dre_group: string | null;
}

/** De onde o lançamento veio — o texto que a pessoa reconhece, não o código. */
export const ORIGEM_DO_LANCAMENTO: Record<string, string> = {
    BOLETO: 'Boleto',
    LABOR: 'Folha',
    PROLABORE: 'Pró-labore',
    PURCHASE_ORDER: 'Pedido de compra',
    MANUAL: 'Lançamento manual',
    ASSET_MAINTENANCE: 'Manutenção de ativo',
    CONTRACT_AVISTA: 'Contrato',
    NFE: 'NF-e',
};

/**
 * Mesma regra do LEFT JOIN de fn_dre_summary: categoria pelo id da view OU, sem id,
 * pelo NOME na organização do lançamento; grupo ausente = SEM_CLASSIFICACAO.
 * Devolve só o que cai em Sem Classificação, com o motivo.
 */
export function separarSemClassificacao(
    linhas: LinhaDaView[],
    categorias: CategoriaDoPlano[],
    regime: RegimeContabil,
): Omit<LancamentoSemClassificacao, 'descricao' | 'origem' | 'titulo' | 'darfId'>[] {
    const porId = new Map(categorias.map(c => [c.id, c]));
    const porNome = new Map(categorias
        .filter(c => c.organization_id)
        .map(c => [`${c.organization_id}|${c.name.trim().toLowerCase()}`, c]));

    const fora: Omit<LancamentoSemClassificacao, 'descricao' | 'origem' | 'titulo' | 'darfId'>[] = [];
    for (const l of linhas) {
        if (l.status === 'CANCELLED') continue;
        const nome = l.category?.trim() || null;
        const cat = l.category_id_dre
            ? porId.get(l.category_id_dre)
            : nome ? porNome.get(`${l.organization_id}|${nome.toLowerCase()}`) : undefined;
        const grupo = cat?.dre_group ?? 'SEM_CLASSIFICACAO';
        if (grupo !== 'SEM_CLASSIFICACAO') continue;

        const motivo: MotivoSemClassificacao = cat
            ? 'categoria_sem_grupo'
            : nome ? 'categoria_inexistente' : 'sem_categoria';
        const status = l.status === 'CONCILIATED' ? 'CONCILIATED' : 'PENDING';
        const valor = (l.direction === 'CREDIT' ? 1 : -1) * Number(l.amount_dre || 0);
        fora.push({
            chave: `${l.id}${l.parte_juros ? ':juros' : ''}`,
            id: l.id,
            data: regime === 'COMPETENCIA' ? (l.competencia_date ?? l.transaction_date) : l.transaction_date,
            categoria: cat?.name ?? nome,
            motivo,
            valor,
            status,
            realizado: regime === 'COMPETENCIA' ? true : status === 'CONCILIATED',
        });
    }
    return fora.sort((a, b) => b.data.localeCompare(a.data));
}

/** Contas a Pagar lista todo DÉBITO não cancelado e Contas a Receber todo CRÉDITO,
 *  menos a contrapartida (filtro de vw_payables/vw_receivables) — e Contas a Pagar
 *  ainda esconde o tributo que não está num DARF enviado (`motivoForaDeContasAPagar`,
 *  a MESMA régua da tela; sem ela o atalho prometia 65 títulos e mostrava 49). */
export function tituloDoLancamento(
    valor: number, entryType: string | null, foraDeContasAPagar = false,
): 'pagar' | 'receber' | 'tributo' | null {
    if (entryType === 'CONTRA') return null;
    if (valor >= 0) return 'receber';
    return foraDeContasAPagar ? 'tributo' : 'pagar';
}

const PAGINA = 1000;

/** Lista os lançamentos que a DRE põe em "Sem Classificação" no recorte dado. */
export async function listarSemClassificacao(opts: {
    organizationId: string | null;
    de: string;
    ate: string;
    regime: RegimeContabil;
    obraId?: string;
}): Promise<LancamentoSemClassificacao[]> {
    const { organizationId, de, ate, regime, obraId } = opts;

    // Todas as categorias VISÍVEIS (a RLS recorta), sem filtro de organização: a DRE
    // acha a categoria pelo id sem olhar a organização, e aqui tem de achar igual.
    const { data: cats, error: errCats } = await supabase
        .from('financial_categories').select('id, name, organization_id, dre_group');
    if (errCats) throw errCats;

    const linhas: LinhaDaView[] = [];
    for (let desde = 0; ; desde += PAGINA) {
        let q = supabase
            .from('v_internal_transactions_dre')
            .select('id, organization_id, project_id, direction, status, transaction_date, competencia_date, category, category_id_dre, amount_dre, parte_juros')
            .neq('status', 'CANCELLED')
            .order('id', { ascending: true })
            .order('parte_juros', { ascending: true })
            .range(desde, desde + PAGINA - 1);
        if (organizationId) q = q.eq('organization_id', organizationId);
        if (obraId) q = q.eq('project_id', obraId);
        q = regime === 'COMPETENCIA'
            // COALESCE(competencia_date, transaction_date) BETWEEN de AND ate
            ? q.or(`and(competencia_date.gte.${de},competencia_date.lte.${ate}),and(competencia_date.is.null,transaction_date.gte.${de},transaction_date.lte.${ate})`)
            : q.gte('transaction_date', de).lte('transaction_date', ate);
        const { data, error } = await q;
        if (error) throw error;
        const pagina = (data ?? []) as LinhaDaView[];
        linhas.push(...pagina);
        if (pagina.length < PAGINA) break;
    }

    const fora = separarSemClassificacao(linhas, (cats ?? []) as CategoriaDoPlano[], regime);
    if (fora.length === 0) return [];

    // Descrição e origem só dos que ficaram de fora (poucos), em lotes.
    const ids = [...new Set(fora.map(f => f.id))];
    const detalhe = new Map<string, { description: string | null; source_system: string | null; entry_type: string | null }>();
    for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select('id, description, source_system, entry_type')
            .in('id', ids.slice(i, i + 200));
        if (error) throw error;
        for (const d of (data ?? []) as { id: string; description: string | null; source_system: string | null; entry_type: string | null }[]) {
            detalhe.set(d.id, d);
        }
    }

    // Das saídas, quais Contas a Pagar esconde (tributo fora de DARF enviado).
    type TituloAPagar = { id: string; status: string | null; business_status: string | null; party_name: string | null; party_type: string | null; darf_id: string | null; approval_status: string | null };
    const aPagar = new Map<string, TituloAPagar>();
    const saidas = [...new Set(fora.filter(f => f.valor < 0).map(f => f.id))];
    for (let i = 0; i < saidas.length; i += 200) {
        const { data, error } = await supabase
            .from('vw_payables')
            .select('id, status, business_status, party_name, party_type, darf_id, approval_status')
            .in('id', saidas.slice(i, i + 200));
        if (error) throw error;
        for (const t of (data ?? []) as TituloAPagar[]) aPagar.set(t.id, t);
    }

    return fora.map(f => {
        const d = detalhe.get(f.id);
        const t = aPagar.get(f.id);
        const src = d?.source_system ?? '';
        return {
            ...f,
            descricao: d?.description?.trim() || '(sem descrição)',
            origem: ORIGEM_DO_LANCAMENTO[src] ?? (src ? src : 'Sem origem'),
            titulo: tituloDoLancamento(f.valor, d?.entry_type ?? null, !!t && motivoForaDeContasAPagar(t) !== null),
            darfId: t?.darf_id ?? null,
        };
    });
}
