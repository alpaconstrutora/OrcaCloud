/**
 * A VITRINE da oportunidade: todos os números vêm da versão congelada do Imovib, e o local e a obra, do
 * empreendimento do estudo. Nada é digitado na oportunidade (decisões D1/D2 do plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 2; antes, desde 16/11/2026, só
 * VGV/ROI/TIR vinham da versão e o resto do formulário).
 *
 * Fontes (as mesmas na lista do gestor e na do portal):
 *  - `indicadores_da_versao` = `snapshot.calculo.investidor.indicadores` (utils/imovibCalculoDaVersao.ts);
 *  - `resultados_da_versao`  = `results` da versão (prazo e custos do congelamento, utils/imovibVersoes.ts);
 *  - `local`                 = empreendimento ligado ao estudo.
 *
 * ROI = "Retorno sobre o capital" do Imovib: lucro líquido ÷ exposição máxima (a conta de
 * `retornoSobreCapital` em utils/imovibIndicadores.ts). Sem exposição, não há ROI.
 * Sem versão: todos os números são null ("—"); rascunho sem versão não mostra número nenhum.
 * Testes: __tests__/oportunidadeNumerosDaVersao.test.ts.
 */
import type { InvestorOpportunity } from '../services/investorPortalService';

export interface NumerosDaVitrine {
    vgv: number | null;
    /** % a.a.; null = sem TIR. */
    tir_pct: number | null;
    /** % sobre a exposição máxima. */
    roi_pct: number | null;
    lucro_liquido: number | null;
    exposicao_maxima: number | null;
    /** Meses do primeiro ao último fluxo do estudo. */
    prazo_meses: number | null;
    /** Obra + terreno, como na versão. */
    custo_total: number | null;
    /** TMA do estudo, % a.a. — a régua do simulador. */
    tma: number | null;
    multiplo: number | null;
    cidade: string | null;
    uf: string | null;
    obra_id: string | null;
    /** Tem versão com números congelados. */
    comVersao: boolean;
    /** Capa: a escolhida (thumbnail_url) ou a primeira foto do empreendimento. */
    capa: string | null;
}

export type OportunidadeNaVitrine = InvestorOpportunity & NumerosDaVitrine;

const finito = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function numerosDaVitrine(o: Pick<InvestorOpportunity, 'indicadores_da_versao' | 'resultados_da_versao' | 'local'> & Partial<Pick<InvestorOpportunity, 'thumbnail_url' | 'fotos'>>): NumerosDaVitrine {
    const ind = o.indicadores_da_versao ?? null;
    const res = o.resultados_da_versao ?? null;
    const lucro = finito(ind?.lucroLiquido);
    const exposicao = finito(ind?.exposicaoMaxima);
    const roi = lucro != null && exposicao != null && exposicao > 0 && !ind?.semExposicao ? (lucro / exposicao) * 100 : null;
    const obra = finito(res?.custoObra);
    const terreno = finito(res?.terreno);
    const prazo = finito(res?.duracao);
    return {
        vgv: finito(ind?.vgv),
        tir_pct: finito(ind?.tirAnual),
        roi_pct: roi,
        lucro_liquido: lucro,
        exposicao_maxima: exposicao,
        prazo_meses: prazo != null && prazo > 0 ? prazo : null,
        custo_total: obra != null || terreno != null ? (obra ?? 0) + (terreno ?? 0) : null,
        tma: finito(ind?.tma),
        multiplo: finito(ind?.multiplo),
        cidade: o.local?.cidade || null,
        uf: o.local?.uf || null,
        obra_id: o.local?.obra_id || null,
        comVersao: !!ind,
        capa: o.thumbnail_url?.trim() || o.fotos?.[0]?.url || null,
    };
}

export function naVitrine<T extends InvestorOpportunity>(o: T): T & NumerosDaVitrine {
    return { ...o, ...numerosDaVitrine(o) };
}
