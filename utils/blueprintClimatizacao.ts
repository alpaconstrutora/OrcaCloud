/**
 * CLIMATIZAÇÃO — premissas do estudo (04/10/2026, E0.1 do roadmap
 * `docs/planos/2026-10-04-climatizacao-benchmark-altoqi-e-roadmap.md`).
 *
 * Só o que o projetista DECIDE mora aqui; a carga térmica, o equipamento e a
 * rede são derivados (E2 em diante). O JSON gravado é parcial e é completado
 * com o padrão na leitura — o mesmo molde de `blueprintIncendioClassificacao`.
 *
 * ⚠️ CONFERIR NA NORMA: os valores padrão de conforto (24 °C, 50 %) são os
 * usuais de projeto para verão; a faixa normativa é a da NBR 16401-2 (conforto
 * térmico), cujo PDF não está no repositório. Até ele chegar, o padrão é
 * HIPÓTESE DECLARADA, não transcrição de tabela.
 */

/** Condições internas de projeto — valem para todos os ambientes climatizados do estudo. */
export interface HipotesesDeConforto {
  /** Temperatura interna de projeto (bulbo seco), °C. */
  temperaturaInternaC: number;
  /** Umidade relativa interna de projeto, %. */
  umidadeRelativaPct: number;
}

export interface HipotesesClimatizacao {
  conforto: HipotesesDeConforto;
}

/** Limites do que se aceita como premissa: fora disto é erro de digitação, não projeto. */
export const LIMITES_DE_CONFORTO = {
  temperaturaInternaC: { min: 16, max: 30 },
  umidadeRelativaPct: { min: 30, max: 70 },
} as const;

export const HIPOTESES_DE_CONFORTO_PADRAO: HipotesesDeConforto = { temperaturaInternaC: 24, umidadeRelativaPct: 50 };

export const HIPOTESES_CLIMATIZACAO_PADRAO: HipotesesClimatizacao = {
  conforto: HIPOTESES_DE_CONFORTO_PADRAO,
};

/** Fonte declarada de cada padrão — aparece no painel e, depois, no memorial. */
export const FONTE_DO_CONFORTO = 'Hipótese de projeto (verão). CONFERIR NA NORMA: NBR 16401-2.';

const numeroNaFaixa = (x: unknown, faixa: { min: number; max: number }, padrao: number): number =>
  typeof x === 'number' && Number.isFinite(x) && x >= faixa.min && x <= faixa.max ? x : padrao;

export function hipotesesDeConfortoDaColuna(raw: unknown): HipotesesDeConforto {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    temperaturaInternaC: numeroNaFaixa(r.temperaturaInternaC, LIMITES_DE_CONFORTO.temperaturaInternaC, HIPOTESES_DE_CONFORTO_PADRAO.temperaturaInternaC),
    umidadeRelativaPct: numeroNaFaixa(r.umidadeRelativaPct, LIMITES_DE_CONFORTO.umidadeRelativaPct, HIPOTESES_DE_CONFORTO_PADRAO.umidadeRelativaPct),
  };
}

/** O JSON gravado, completado com o padrão. Valor de tipo errado ou fora da faixa vira o padrão; nada estranho passa. */
export function hipotesesClimatizacaoDaColuna(raw: unknown): HipotesesClimatizacao {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    conforto: hipotesesDeConfortoDaColuna(r.conforto),
  };
}
