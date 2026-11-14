/**
 * Regras de cálculo do módulo ÒPURA Riscos — funções puras, uma fonte só.
 * O banco calcula o mesmo (gatilho `risk_evaluations_preparar`, coluna gerada
 * `pontuacao`/`valor_esperado`); a tela usa estas funções para mostrar ANTES de
 * gravar e para classificar com as faixas da organização.
 * Plano: docs/planos/2026-11-13-modulo-riscos.md (F1.3).
 */
import type { ProjectRisk, RiskDimensao, RiskMatrixConfig, RiskNivel } from '../types/risk';

/** Faixas da especificação (seção 3.3, Método A): 1–4 baixo · 5–10 médio · 12–16 alto · 20–25 crítico. */
export const RISK_MATRIZ_PADRAO: RiskMatrixConfig = { limite_medio: 5, limite_alto: 12, limite_critico: 20 };

/** Probabilidade × impacto (1–25). Fora de 1–5 é erro de programação, não dado. */
export function pontuacao(probabilidade: number, impacto: number): number {
    for (const [nome, v] of [['probabilidade', probabilidade], ['impacto', impacto]] as const) {
        if (!Number.isInteger(v) || v < 1 || v > 5) throw new RangeError(`${nome} deve ser inteiro de 1 a 5 (veio ${v})`);
    }
    return probabilidade * impacto;
}

/** Nível pela pontuação e pelas faixas da organização. */
export function nivelDaPontuacao(p: number, faixas: RiskMatrixConfig = RISK_MATRIZ_PADRAO): RiskNivel {
    if (p >= faixas.limite_critico) return 'critico';
    if (p >= faixas.limite_alto) return 'alto';
    if (p >= faixas.limite_medio) return 'medio';
    return 'baixo';
}

/**
 * Impacto consolidado do Método B = MÁXIMO das dimensões avaliadas.
 * Nunca média: a média diluiria dano grave à vida ou à estabilidade (seção 3.3).
 * `null` quando nenhuma dimensão foi avaliada.
 */
export function impactoConsolidado(impactos: Partial<Record<RiskDimensao, number | null | undefined>>): number | null {
    const notas = Object.values(impactos).filter((v): v is number => typeof v === 'number');
    return notas.length ? Math.max(...notas) : null;
}

/** Valor monetário esperado: probabilidade (%) × perda condicional. CA13: 30% × 200.000 = 60.000. */
export function valorEsperado(probabilidadePct: number | null | undefined, perda: number | null | undefined): number | null {
    if (probabilidadePct == null || perda == null) return null;
    return Math.round((probabilidadePct / 100) * perda * 100) / 100;
}

/** Pontuação que vale para o risco hoje: a residual, se já houve; senão a inerente. */
export function pontuacaoVigente(r: Pick<ProjectRisk, 'residual_pontuacao' | 'inerente_pontuacao'>): number | null {
    return r.residual_pontuacao ?? r.inerente_pontuacao ?? null;
}

/**
 * Nível que a tela mostra e o painel conta. O gatilho crítico (CA04) ESCALA para
 * crítico independentemente da cor: segurança grave, obrigação legal e colapso
 * não ficam "baixos" só porque a probabilidade é baixa.
 * `null` = ainda não avaliado e sem gatilho.
 */
export function nivelDoRisco(
    r: Pick<ProjectRisk, 'residual_pontuacao' | 'inerente_pontuacao' | 'gatilho_critico'>,
    faixas: RiskMatrixConfig = RISK_MATRIZ_PADRAO,
): RiskNivel | null {
    if (r.gatilho_critico) return 'critico';
    const p = pontuacaoVigente(r);
    return p == null ? null : nivelDaPontuacao(p, faixas);
}

/** Risco ativo = ainda pede gestão (não materializado nem encerrado). */
export function riscoAtivo(r: Pick<ProjectRisk, 'status'>): boolean {
    return r.status !== 'materializado' && r.status !== 'encerrado';
}

/** Cor de TEXTO por nível (§8 do guia: texto colorido, sem pílula). */
export const COR_TEXTO_NIVEL: Record<RiskNivel, string> = {
    baixo: 'text-emerald-700',
    medio: 'text-amber-700',
    alto: 'text-orange-700',
    critico: 'text-red-700',
};

/** Fundo da célula do mapa de calor por nível (mesmas cores da especificação). */
export const COR_CELULA_NIVEL: Record<RiskNivel, string> = {
    baixo: 'bg-emerald-50',
    medio: 'bg-amber-50',
    alto: 'bg-orange-100',
    critico: 'bg-red-100',
};
