/**
 * CLIMATIZAÇÃO E0.1 (04/10/2026): o leitor da coluna `hipoteses` de
 * `blueprint_study_climatizacao` — JSON parcial vira premissa completa, e nada
 * de tipo errado ou fora da faixa passa.
 */
import { describe, expect, it } from 'vitest';
import {
  HIPOTESES_CLIMATIZACAO_PADRAO,
  LIMITES_DE_CONFORTO,
  hipotesesClimatizacaoDaColuna,
} from '../utils/blueprintClimatizacao';

describe('premissas gravadas', () => {
  it('coluna vazia = padrão', () => {
    expect(hipotesesClimatizacaoDaColuna(null)).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
    expect(hipotesesClimatizacaoDaColuna({})).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
    expect(hipotesesClimatizacaoDaColuna('lixo')).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
  });

  it('valor declarado dentro da faixa vence; parcial é completado', () => {
    const h = hipotesesClimatizacaoDaColuna({ conforto: { temperaturaInternaC: 22 } });
    expect(h.conforto).toEqual({ temperaturaInternaC: 22, umidadeRelativaPct: HIPOTESES_CLIMATIZACAO_PADRAO.conforto.umidadeRelativaPct });
  });

  it('tipo errado e fora da faixa viram o padrão — nunca passam', () => {
    const h = hipotesesClimatizacaoDaColuna({ conforto: { temperaturaInternaC: 'quente', umidadeRelativaPct: 95 } });
    expect(h).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
    const fria = hipotesesClimatizacaoDaColuna({ conforto: { temperaturaInternaC: LIMITES_DE_CONFORTO.temperaturaInternaC.min - 1 } });
    expect(fria.conforto.temperaturaInternaC).toBe(HIPOTESES_CLIMATIZACAO_PADRAO.conforto.temperaturaInternaC);
    expect(hipotesesClimatizacaoDaColuna({ conforto: { temperaturaInternaC: Number.NaN } })).toEqual(HIPOTESES_CLIMATIZACAO_PADRAO);
  });

  it('os limites aceitam as pontas', () => {
    const { min, max } = LIMITES_DE_CONFORTO.umidadeRelativaPct;
    expect(hipotesesClimatizacaoDaColuna({ conforto: { umidadeRelativaPct: min } }).conforto.umidadeRelativaPct).toBe(min);
    expect(hipotesesClimatizacaoDaColuna({ conforto: { umidadeRelativaPct: max } }).conforto.umidadeRelativaPct).toBe(max);
  });
});
