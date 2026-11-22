/**
 * Contas puras da PRÉVIA do Credit Room (22/11/2026).
 *
 * As abas internas mostram a prévia ao vivo — o `VersaoPreparada` que
 * `creditRoomService.prepararVersao` monta lendo tudo e gravando nada — em vez
 * de exigir uma versão congelada; congelar vira só "Liberar para a instituição".
 * Aqui ficam as contas que a tela precisa e que não tocam o banco: embrulhar a
 * prévia como versão de tela, simular parâmetros sem reler nada e comparar a
 * prévia com a última versão liberada.
 *
 * Dado ausente ≠ zero: contagem/valor que a versão não guarda é `null`, não 0.
 * Sem `new Date('AAAA-MM-DD')`: meses e dias são sempre string.
 */
import type { CreditRoomVersion } from '../types/creditRoom';
import type { VersaoPreparada } from '../services/creditRoomService';
import type { SnapshotCapacidade } from './creditRoomSnapshot';
import { buildSchedule } from './debtAmortization';
import { round2 } from './financialMath';
import {
    capacidadeMaxima, montarMes, resumoDaCapacidade,
    type FluxosElegiveis, type ParametrosCapacidade,
} from './creditCapacity';

export const ID_DA_PREVIA = 'previa';

/**
 * Embrulha a `VersaoPreparada` como `CreditRoomVersion` de tela: versionNo 0,
 * label 'Prévia', `frozenAt` = hora da conta (não há congelamento). A prévia não
 * conhece a organização do room; quem precisar passa `organizationId`.
 */
export function versaoDaPrevia(p: VersaoPreparada, calculadaEm: string, organizationId = ''): CreditRoomVersion {
    return {
        id: ID_DA_PREVIA,
        organizationId,
        creditRoomId: p.roomId,
        versionNo: 0,
        label: 'Prévia',
        dataBase: p.dataBase,
        snapshot: p.snapshot,
        indicators: p.indicators,
        documentVersionIds: [...(p.snapshot.documentos?.version_ids ?? [])],
        frozenAt: calculadaEm,
    };
}

export const ehPrevia = (v: CreditRoomVersion | null | undefined): boolean => v?.id === ID_DA_PREVIA;

/** Agrupa as parcelas por 'AAAA-MM' do vencimento (mesma conta de `servicoNovoPorMes` no service). */
const parcelasPorMes = (linhas: { dueDate: string; total: number }[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const l of linhas) {
        const mes = String(l.dueDate).slice(0, 7);
        out[mes] = round2((out[mes] ?? 0) + (Number(l.total) || 0));
    }
    return out;
};

/**
 * Recalcula a capacidade com parâmetros simulados, sem reler o banco.
 *
 * - Série: vendas, aluguéis, despesa e serviço atual ficam como estão; só o
 *   `servico_novo` muda, e SÓ sem proposta de dívida vinculada. Com proposta o
 *   cronograma real dela já é o serviço novo — simular taxa/prazo não o refaz.
 *   Sem proposta, ele é refeito com `buildSchedule` exatamente como o
 *   congelamento faz (principal = valor pedido, 1º vencimento = dia 1 do 1º mês
 *   da série); sem valor pedido ou prazo, é zero (como o service).
 * - `capacidade_maxima` reconta com os parâmetros simulados (que valem para a
 *   dívida nova hipotética, com ou sem proposta — é a pergunta "quanto cabe").
 * - `horizonte_meses` fica o da série (ela tem aquele tamanho; não há título nem
 *   locação aqui para esticá-la). `despesa_operacional` só é registrado: a
 *   despesa já está na série e não dá para ligá-la de volta sem reler.
 * - `estoque` recalcula o valor elegível com o haircut simulado.
 *
 * `ctx.fluxos` é obrigatório (desvio documentado da assinatura do plano): a
 * série guarda o bruto das duas pernas e não dá para deduzir os fluxos dela.
 */
export function simularParametros(
    c: SnapshotCapacidade, p: ParametrosCapacidade,
    ctx: { requestedAmount: number; temProposta: boolean; fluxos: FluxosElegiveis },
): SnapshotCapacidade {
    const parametros: ParametrosCapacidade = { ...p, horizonte_meses: c.parametros.horizonte_meses };
    const primeiroVencimento = c.serie.length ? `${c.serie[0].mes}-01` : '';

    let serie = c.serie;
    if (!ctx.temProposta && c.serie.length) {
        const novo = ctx.requestedAmount > 0 && p.prazo_meses > 0
            ? parcelasPorMes(buildSchedule({
                principal: ctx.requestedAmount,
                nominalRate: p.taxa_mensal_pct,
                ratePeriod: 'MENSAL',
                system: p.sistema,
                installmentCount: p.prazo_meses,
                installmentPeriod: 'MENSAL',
                firstDueDate: primeiroVencimento,
                gracePrincipalPeriods: p.carencia_meses,
            }))
            : {};
        serie = c.serie.map(m => montarMes(
            m.mes, m.vendas, m.alugueis, m.despesa_operacional, m.servico_atual, novo[m.mes] ?? 0, ctx.fluxos,
        ));
    }

    const haircut = Math.min(100, Math.max(0, Number.isFinite(p.haircut_estoque_pct) ? p.haircut_estoque_pct : 0));
    return {
        ...c,
        parametros,
        serie,
        estoque: c.estoque
            ? { vgv_disponivel: c.estoque.vgv_disponivel, haircut_pct: haircut, valor_elegivel: round2(c.estoque.vgv_disponivel * (1 - haircut / 100)) }
            : null,
        capacidade_maxima: serie.length
            ? capacidadeMaxima(serie, parametros, primeiroVencimento)
            : { parcela_maxima: 0, valor_maximo: 0 },
    };
}

export type CampoComparado =
    'valor_maximo' | 'dscr_minimo_12m' | 'renda_liquida_media_12m' | 'n_empreendimentos' | 'n_contratos';

export interface DiferencaComLiberada {
    campo: CampoComparado;
    antes: number | null;
    depois: number | null;
}

const numerosDaVersao = (v: CreditRoomVersion): Record<CampoComparado, number | null> => {
    const cap = v.snapshot.capacidade ?? null;
    const resumo = resumoDaCapacidade(cap);
    const cents = (x: number | null | undefined): number | null => (x == null || Number.isNaN(x) ? null : round2(x));
    return {
        valor_maximo: cents(cap?.capacidade_maxima.valor_maximo),
        dscr_minimo_12m: cents(resumo?.dscr_minimo_12m),
        renda_liquida_media_12m: cents(resumo?.renda_liquida_media_12m),
        // Lista ausente (versão schema 1) = não sei, e não zero.
        n_empreendimentos: v.snapshot.empreendimentos ? v.snapshot.empreendimentos.length : null,
        n_contratos: v.snapshot.contratos ? v.snapshot.contratos.length : null,
    };
};

const CAMPOS: CampoComparado[] = [
    'valor_maximo', 'dscr_minimo_12m', 'renda_liquida_media_12m', 'n_empreendimentos', 'n_contratos',
];

/**
 * Diferença de números entre a prévia e a última liberada (aviso e "Liberar").
 * Só volta o que difere (centavos; contagens exatas). Sem liberada, todos os
 * campos voltam com `antes: null`.
 */
export function compararComLiberada(
    previa: CreditRoomVersion, liberada: CreditRoomVersion | null,
): DiferencaComLiberada[] {
    const depois = numerosDaVersao(previa);
    if (!liberada) return CAMPOS.map(campo => ({ campo, antes: null, depois: depois[campo] }));
    const antes = numerosDaVersao(liberada);
    return CAMPOS
        .filter(campo => antes[campo] !== depois[campo])
        .map(campo => ({ campo, antes: antes[campo], depois: depois[campo] }));
}
