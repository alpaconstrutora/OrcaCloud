import { supabase } from '../lib/supabase';
import { contractIndexService, normalizeIndexName } from './contractIndexService';
import {
    aniversarioDoReajuste, valorAposReajuste, entraNaFilaDeReajuste, motivoDaDataDeReajuste,
    AniversarioReajuste, DecisaoReajuste,
} from '../utils/reajusteAniversario';

/**
 * Reajuste de LOCAÇÃO pelo aniversário — plano
 * docs/planos/2026-11-24-locacoes-reajustes-separados-das-renovacoes.md (Fase 2).
 *
 * Cada aniversário dentro da vigência é decidido uma vez, em ordem: 100% do
 * índice (índice do mês do aniversário ÷ índice da data-base), outro percentual,
 * valor digitado, ou não aplicar. Aplicar muda o aluguel do contrato e as
 * parcelas EM ABERTO com vencimento a partir do aniversário (pagas, conciliadas
 * e com valor alterado à mão ficam); a data-base passa a ser o aniversário e o
 * próximo é este + periodicidade. Tudo fica em `contract_reajustes`.
 */

const AVISO_PADRAO_DIAS = 30;

const COLUNAS_CONTRATO =
    'id, organization_id, number, title, client_id, deal_id, domain, status, is_recurring, start_date, end_date, '
    + 'current_value, original_value, reajuste_index, reajuste_data_base, reajuste_proximo, '
    + 'reajuste_periodicidade_meses, reajuste_aviso_dias';

export interface ContratoReajustavel {
    id: string;
    organization_id: string;
    number: string;
    title: string;
    client_id: string | null;
    deal_id: string | null;
    domain: string | null;
    status: string;
    is_recurring: boolean | null;
    start_date: string | null;
    end_date: string | null;
    current_value: number | null;
    original_value: number | null;
    reajuste_index: string | null;
    reajuste_data_base: string | null;
    reajuste_proximo: string | null;
    reajuste_periodicidade_meses: number | null;
    reajuste_aviso_dias: number | null;
}

/** Linha da fila (o contrato + o aniversário calculado + o aviso efetivo). */
export interface LinhaDeReajuste extends ContratoReajustavel {
    aniversario: AniversarioReajuste;
    avisoDias: number;
}

export interface PreviaReajuste {
    contrato: ContratoReajustavel;
    aniversario: AniversarioReajuste;
    valorAtual: number;
    indice: string | null;
    /** Índice da data-base e do aniversário, quando cadastrados. */
    base: { mes: string; valor: number } | null;
    atual: { mes: string; valor: number } | null;
    /** índice do aniversário ÷ índice da data-base; null sem os dois. */
    fatorIndice: number | null;
    /** Parcelas em aberto (sem valor manual) com vencimento a partir do aniversário. */
    parcelasEmAberto: number;
}

export interface RegistroDeReajuste {
    id: string;
    aniversario: string;
    data_base: string;
    indice: string | null;
    indice_mes_base: string | null;
    indice_mes_atual: string | null;
    percentual_indice: number | null;
    decisao: DecisaoReajuste['tipo'];
    percentual_aplicado: number;
    valor_anterior: number;
    valor_novo: number;
    parcelas_atualizadas: number;
    observacao: string | null;
    criado_por: string | null;
    created_at: string;
}

const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function buscarContrato(contractId: string): Promise<ContratoReajustavel> {
    const { data, error } = await supabase.from('contracts').select(COLUNAS_CONTRATO).eq('id', contractId).single();
    if (error) throw error;
    return data as unknown as ContratoReajustavel;
}

/** Filtro das parcelas do aluguel: as do contrato e, na locação original, as da negociação. */
function filtroDasParcelas(c: ContratoReajustavel): string {
    const doContrato = `reference_id.like.${c.id}%`;
    return c.deal_id ? `${doContrato},reference_id.like.tx-${c.deal_id}-%` : doContrato;
}

async function parcelasEmAbertoDesde(c: ContratoReajustavel, desde: string): Promise<{ id: string; amount: number }[]> {
    const { data, error } = await supabase
        .from('internal_transactions')
        .select('id, amount')
        .eq('organization_id', c.organization_id)
        .eq('status', 'PENDING')
        .eq('valor_manual', false)
        .gte('due_date', desde)
        .or(filtroDasParcelas(c));
    if (error) throw error;
    return (data ?? []) as { id: string; amount: number }[];
}

async function avisoPadraoDasOrgs(orgIds: string[]): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();
    if (orgIds.length === 0) return mapa;
    const { data } = await supabase.from('organizations').select('id, settings').in('id', orgIds);
    for (const o of (data ?? []) as { id: string; settings?: { reajuste_aviso_dias?: number } | null }[]) {
        const dias = Number(o.settings?.reajuste_aviso_dias);
        if (Number.isFinite(dias) && dias >= 0) mapa.set(o.id, dias);
    }
    return mapa;
}

export const reajusteLocacaoService = {
    AVISO_PADRAO_DIAS,

    /**
     * Fila de Locações › Reajustes: locações ativas com índice cujo aniversário
     * está dentro da vigência e a até N dias (N = aviso do contrato → da
     * organização → 30). Vencido continua na fila até alguém decidir.
     * REGRA #5: `organizationId` nulo ("Todas") não filtra — a RLS recorta.
     */
    listarFila: async (organizationId: string | null): Promise<LinhaDeReajuste[]> => {
        const ate = new Date();
        ate.setDate(ate.getDate() + 366);
        let q = supabase
            .from('contracts')
            .select(COLUNAS_CONTRATO)
            .eq('domain', 'LOCACAO')
            .in('status', ['Ativo', 'Assinado'])
            .not('reajuste_index', 'is', null)
            .not('reajuste_proximo', 'is', null)
            .lte('reajuste_proximo', ate.toISOString().slice(0, 10))
            .order('reajuste_proximo', { ascending: true })
            .order('id', { ascending: true });
        if (organizationId) q = q.eq('organization_id', organizationId);
        const { data, error } = await q;
        if (error) throw error;
        const contratos = ((data ?? []) as unknown as ContratoReajustavel[])
            .filter(c => c.reajuste_index && c.reajuste_index !== 'Sem Reajuste');
        const padroes = await avisoPadraoDasOrgs([...new Set(contratos.map(c => c.organization_id))]);
        const hoje = hojeISO();
        const linhas: LinhaDeReajuste[] = [];
        for (const c of contratos) {
            const avisoDias = c.reajuste_aviso_dias ?? padroes.get(c.organization_id) ?? AVISO_PADRAO_DIAS;
            const aniversario = aniversarioDoReajuste(c);
            if (aniversario && entraNaFilaDeReajuste(c, avisoDias, hoje)) linhas.push({ ...c, aniversario, avisoDias });
        }
        return linhas;
    },

    /**
     * O que a decisão vai mexer — índices, fator, parcelas afetadas. Não grava nada.
     * `dataReajuste` = a data escolhida na gaveta (vazia = a calculada).
     */
    previa: async (contractId: string, dataReajuste?: string | null): Promise<PreviaReajuste> => {
        const contrato = await buscarContrato(contractId);
        const aniversario = aniversarioDoReajuste(contrato, dataReajuste);
        if (!aniversario) throw new Error(`Contrato ${contrato.number} sem data-base de reajuste nem início de vigência.`);
        const indice = normalizeIndexName(contrato.reajuste_index) ?? null;
        let base: PreviaReajuste['base'] = null;
        let atual: PreviaReajuste['atual'] = null;
        if (indice && indice !== 'OUTROS') {
            const [b, a] = await Promise.all([
                contractIndexService.getClosestTo(indice, aniversario.dataBase, contrato.organization_id),
                contractIndexService.getClosestTo(indice, aniversario.aniversario, contrato.organization_id),
            ]);
            if (b && b.value > 0) base = { mes: b.reference_month, valor: b.value };
            if (a && a.value > 0) atual = { mes: a.reference_month, valor: a.value };
        }
        const parcelas = await parcelasEmAbertoDesde(contrato, aniversario.aniversario);
        return {
            contrato,
            aniversario,
            valorAtual: Number(contrato.current_value ?? contrato.original_value ?? 0),
            indice,
            base,
            atual,
            // Mesmo mês nos dois lados = índice do aniversário ainda não cadastrado.
            fatorIndice: base && atual && base.mes !== atual.mes ? atual.valor / base.valor : null,
            parcelasEmAberto: parcelas.length,
        };
    },

    /**
     * Decide o aniversário atual do contrato e avança para o próximo.
     * `dataReajuste` = a data escolhida na gaveta (vazia = a calculada).
     */
    decidir: async (contractId: string, decisao: DecisaoReajuste, observacao?: string, dataReajuste?: string | null): Promise<{
        contrato: ContratoReajustavel; registro: RegistroDeReajuste;
    }> => {
        const p = await reajusteLocacaoService.previa(contractId, dataReajuste);
        const c = p.contrato;
        if (dataReajuste) {
            const motivo = motivoDaDataDeReajuste(c, dataReajuste);
            if (motivo) throw new Error(motivo);
        }
        if (c.domain !== 'LOCACAO' || !c.is_recurring) {
            throw new Error('O reajuste por aniversário vale para contrato de locação recorrente.');
        }
        if (!['Ativo', 'Assinado'].includes(c.status)) {
            throw new Error(`Não é possível reajustar um contrato "${c.status}". O contrato deve estar Ativo ou Assinado.`);
        }
        if (!p.aniversario.dentroDaVigencia) {
            throw new Error(`O aniversário de ${p.aniversario.aniversario.split('-').reverse().join('/')} é depois do fim da vigência — o caso é de renovação, não de reajuste.`);
        }
        const { valorNovo, percentualAplicado } = valorAposReajuste(p.valorAtual, p.fatorIndice, decisao);
        const mudaValor = Math.abs(valorNovo - p.valorAtual) >= 0.01;

        // Parcelas remanescentes: cada uma pela mesma proporção (a 1ª, pró-rata,
        // continua pró-rata). Lidas de novo aqui, não reaproveitadas da prévia.
        let parcelasAtualizadas = 0;
        if (mudaValor && p.valorAtual > 0) {
            const razao = valorNovo / p.valorAtual;
            const parcelas = await parcelasEmAbertoDesde(c, p.aniversario.aniversario);
            for (const parcela of parcelas) {
                const { error } = await supabase
                    .from('internal_transactions')
                    .update({ amount: Math.round(Number(parcela.amount) * razao * 100) / 100 })
                    .eq('id', parcela.id)
                    .eq('status', 'PENDING');
                if (error) throw error;
                parcelasAtualizadas += 1;
            }
        }

        const { data: atualizado, error: errC } = await supabase
            .from('contracts')
            .update({
                ...(mudaValor ? { current_value: valorNovo } : {}),
                reajuste_data_base: p.aniversario.aniversario,
                reajuste_proximo: p.aniversario.proximo,
            })
            .eq('id', c.id)
            .select(COLUNAS_CONTRATO)
            .single();
        if (errC) throw errC;

        const { data: registro, error: errR } = await supabase
            .from('contract_reajustes')
            .insert({
                organization_id: c.organization_id,
                contract_id: c.id,
                aniversario: p.aniversario.aniversario,
                data_base: p.aniversario.dataBase,
                indice: p.indice,
                indice_mes_base: p.base?.mes ?? null,
                indice_valor_base: p.base?.valor ?? null,
                indice_mes_atual: p.atual?.mes ?? null,
                indice_valor_atual: p.atual?.valor ?? null,
                percentual_indice: p.fatorIndice ? Math.round((p.fatorIndice - 1) * 10000) / 100 : null,
                decisao: decisao.tipo,
                percentual_aplicado: percentualAplicado,
                valor_anterior: p.valorAtual,
                valor_novo: valorNovo,
                parcelas_atualizadas: parcelasAtualizadas,
                observacao: observacao?.trim() || null,
            })
            .select('*')
            .single();
        if (errR) throw errR;

        return { contrato: atualizado as unknown as ContratoReajustavel, registro: registro as RegistroDeReajuste };
    },

    historico: async (contractId: string): Promise<RegistroDeReajuste[]> => {
        const { data, error } = await supabase
            .from('contract_reajustes')
            .select('id, aniversario, data_base, indice, indice_mes_base, indice_mes_atual, percentual_indice, decisao, percentual_aplicado, valor_anterior, valor_novo, parcelas_atualizadas, observacao, criado_por, created_at')
            .eq('contract_id', contractId)
            .order('aniversario', { ascending: false });
        if (error) throw error;
        return (data ?? []) as RegistroDeReajuste[];
    },

    /** Padrão da organização (Configurações do Sistema). null = não definido (30). */
    avisoPadraoDaOrg: async (organizationId: string): Promise<number | null> => {
        const mapa = await avisoPadraoDasOrgs([organizationId]);
        return mapa.get(organizationId) ?? null;
    },

    definirAvisoPadraoDaOrg: async (organizationId: string, dias: number | null): Promise<void> => {
        const { error } = await supabase.rpc('fn_definir_aviso_reajuste_org', { p_org: organizationId, p_dias: dias });
        if (error) throw error;
    },
};
