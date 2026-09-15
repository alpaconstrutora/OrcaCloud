/**
 * Simbologia dos condutores no eletroduto (NBR 5444, 15/09/2026): *"simbologia
 * dos circuitos elétricos nos eletrodutos"*. A contagem do trecho é decomposta
 * pela ligação do circuito; o que passa da base é retorno.
 */
import { describe, expect, it } from 'vitest';
import { condutoresDoTrecho, numeroDoCircuito, tracosDoCondutor } from '../utils/blueprintCondutores';

describe('condutoresDoTrecho — a contagem vira fase / neutro / retorno / terra', () => {
  it('FN com 3 = fase, neutro, terra; FF com 3 = fase, fase, terra; FFF com 4 = três fases e terra', () => {
    expect(condutoresDoTrecho({ condutores: 3 }, { ligacao: 'FN' })).toEqual(['FASE', 'NEUTRO', 'TERRA']);
    expect(condutoresDoTrecho({ condutores: 3 }, { ligacao: 'FF' })).toEqual(['FASE', 'FASE', 'TERRA']);
    expect(condutoresDoTrecho({ condutores: 4 }, { ligacao: 'FFF' })).toEqual(['FASE', 'FASE', 'FASE', 'TERRA']);
  });

  it('acima da base é RETORNO, antes do terra: FN com 4 = fase, neutro, retorno, terra; com 5, dois retornos', () => {
    expect(condutoresDoTrecho({ condutores: 4 }, { ligacao: 'FN' })).toEqual(['FASE', 'NEUTRO', 'RETORNO', 'TERRA']);
    expect(condutoresDoTrecho({ condutores: 5 }, { ligacao: 'FN' })).toEqual(['FASE', 'NEUTRO', 'RETORNO', 'RETORNO', 'TERRA']);
  });

  it('abaixo da base tira de trás para a frente: FN com 2 = fase, neutro; com 1 = fase; 0 = nada', () => {
    expect(condutoresDoTrecho({ condutores: 2 }, { ligacao: 'FN' })).toEqual(['FASE', 'NEUTRO']);
    expect(condutoresDoTrecho({ condutores: 1 }, { ligacao: 'FN' })).toEqual(['FASE']);
    expect(condutoresDoTrecho({ condutores: 0 }, { ligacao: 'FN' })).toEqual([]);
    expect(condutoresDoTrecho({ condutores: null }, { ligacao: 'FN' })).toEqual([]);
  });

  it('sem circuito, ou circuito sem ligação declarada, assume FN', () => {
    expect(condutoresDoTrecho({ condutores: 3 }, null)).toEqual(['FASE', 'NEUTRO', 'TERRA']);
    expect(condutoresDoTrecho({ condutores: 3 }, { ligacao: null })).toEqual(['FASE', 'NEUTRO', 'TERRA']);
  });
});

describe('numeroDoCircuito — o rótulo em cima do grupo', () => {
  it('"C12 — TUG Cozinha" → "12"; "c3" → "3"; nome fora do padrão volta curto; sem circuito "?"', () => {
    expect(numeroDoCircuito('C12 — TUG Cozinha')).toBe('12');
    expect(numeroDoCircuito('c3')).toBe('3');
    expect(numeroDoCircuito('Chuveiro — suíte')).toBe('Chuvei');
    expect(numeroDoCircuito(null)).toBe('?');
    expect(numeroDoCircuito('')).toBe('?');
  });
});

describe('tracosDoCondutor — a forma de cada símbolo (relativa: t ao longo, s perpendicular; −1 = topo)', () => {
  it('fase cruza; neutro cruza e tem o pé no topo para a frente; retorno só do topo ao centro; terra cruza com a barra centrada no topo', () => {
    expect(tracosDoCondutor('FASE')).toEqual([{ de: { t: 0, s: -1 }, ate: { t: 0, s: 1 } }]);
    expect(tracosDoCondutor('NEUTRO')).toEqual([
      { de: { t: 0, s: -1 }, ate: { t: 0, s: 1 } },
      { de: { t: 0, s: -1 }, ate: { t: 0.6, s: -1 } },
    ]);
    expect(tracosDoCondutor('RETORNO')).toEqual([{ de: { t: 0, s: -1 }, ate: { t: 0, s: 0 } }]);
    expect(tracosDoCondutor('TERRA')).toEqual([
      { de: { t: 0, s: -1 }, ate: { t: 0, s: 1 } },
      { de: { t: -0.6, s: -1 }, ate: { t: 0.6, s: -1 } },
    ]);
  });
});
