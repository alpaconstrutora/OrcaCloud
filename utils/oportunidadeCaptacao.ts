/**
 * Captação da oportunidade a partir do dinheiro real (plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 4). Antes: meta e "já captado"
 * digitados. Agora:
 *  - meta          = Σ fontes 'investidor'/'scp' da VERSÃO do estudo; sem elas, a exposição máxima
 *                    congelada (o capital próprio que o projeto exige);
 *  - chamado       = Σ capital chamado dos sócios da SPE;
 *  - integralizado = Σ capital pago dos sócios da SPE.
 * A mesma regra no banco: fn_oportunidade_na_vitrine ('captacao'), aplicar_20271121980000.
 * Testes: __tests__/oportunidadeCaptacao.test.ts.
 */
export interface CaptacaoBruta {
    fontes_de_investidor?: number | null;
    exposicao_maxima?: number | null;
    chamado?: number | null;
    integralizado?: number | null;
    com_spe?: boolean;
}

export interface Captacao {
    meta: number | null;
    origemDaMeta: 'fontes' | 'exposicao' | null;
    chamado: number;
    integralizado: number;
    /** 0–100; null sem meta. */
    pctIntegralizado: number | null;
    comSpe: boolean;
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function captacaoDaVitrine(c: CaptacaoBruta | null | undefined): Captacao {
    const fontes = num(c?.fontes_de_investidor);
    const exposicao = num(c?.exposicao_maxima);
    const meta = fontes != null && fontes > 0 ? fontes : exposicao != null && exposicao > 0 ? exposicao : null;
    const integralizado = Math.max(0, num(c?.integralizado) ?? 0);
    return {
        meta,
        origemDaMeta: meta == null ? null : fontes != null && fontes > 0 ? 'fontes' : 'exposicao',
        chamado: Math.max(0, num(c?.chamado) ?? 0),
        integralizado,
        pctIntegralizado: meta ? Math.min(100, (integralizado / meta) * 100) : null,
        comSpe: !!c?.com_spe,
    };
}

export const ROTULO_DA_ORIGEM_DA_META: Record<NonNullable<Captacao['origemDaMeta']>, string> = {
    fontes: 'fontes de investidores e SCP do estudo',
    exposicao: 'capital próprio máximo exigido pelo estudo',
};
