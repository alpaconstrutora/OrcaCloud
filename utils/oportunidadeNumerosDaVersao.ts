/**
 * VGV, ROI e TIR de uma oportunidade com versão do Imovib publicada vêm da VERSÃO, não dos campos
 * digitados à mão no formulário (pedido do usuário, 16/11/2026). A versão congelada já guarda os
 * indicadores (`snapshot.calculo.investidor.indicadores`, ver utils/imovibCalculoDaVersao.ts); a
 * lista do portal recebe esse pedaço por fn_investor_portal_get_opportunities e a do gestor pelo
 * select de investorPortalService.listOpportunities, ambos como `indicadores_da_versao`.
 *
 * ROI = "Retorno sobre o capital" do Imovib: lucro líquido ÷ exposição máxima (mesma conta de
 * `retornoSobreCapital` em utils/imovibIndicadores.ts). Sem exposição, não há ROI: null ("—").
 * Ticket mínimo e status não existem no estudo: continuam os do formulário.
 *
 * Só para EXIBIR: o objeto devolvido não vai para o formulário de edição (lá os campos manuais
 * continuam os gravados).
 */
import type { InvestorOpportunity } from '../services/investorPortalService';

const finito = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function comNumerosDaVersao<T extends InvestorOpportunity>(o: T): T {
    const ind = o.indicadores_da_versao;
    if (!ind) return o;
    const lucro = finito(ind.lucroLiquido);
    const exposicao = finito(ind.exposicaoMaxima);
    const roi = lucro != null && exposicao != null && exposicao > 0 && !ind.semExposicao
        ? (lucro / exposicao) * 100
        : null;
    return { ...o, vgv: finito(ind.vgv), tir_pct: finito(ind.tirAnual), roi_pct: roi };
}
