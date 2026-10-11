/**
 * F8 (pendência 1) — o CATÁLOGO de tipos de esquadria guarda as folhas (coluna JSONB
 * `configuracao`). A leitura só aceita a forma do kernel; o resto vira "desenho padrão".
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { configuracaoDaColuna } from '../services/blueprintOpeningTypeService';

describe('catálogo de esquadrias — a coluna das folhas', () => {
  it('lê folhas e bandeira na forma do kernel', () => {
    const c = { folhas: [{ mecanismo: 'FIXA', larguraPct: 30 }, { mecanismo: 'ABRIR', larguraPct: 70 }], bandeira: { alturaMm: 400, mecanismo: 'MAXIM_AR' } };
    expect(configuracaoDaColuna(c)).toEqual(c);
  });

  it('NULL, lixo, mecanismo desconhecido ou % não inteiro → desenho padrão (null)', () => {
    for (const ruim of [null, 'x', {}, { folhas: [] }, { folhas: [{ mecanismo: 'GIRAFA', larguraPct: 100 }] }, { folhas: [{ mecanismo: 'FIXA', larguraPct: 50.5 }] }]) {
      expect(configuracaoDaColuna(ruim), JSON.stringify(ruim)).toBeNull();
    }
  });

  it('bandeira inválida é descartada, as folhas ficam', () => {
    expect(configuracaoDaColuna({ folhas: [{ mecanismo: 'FIXA', larguraPct: 100 }], bandeira: { alturaMm: 300, mecanismo: 'CORRER' } })).toEqual({ folhas: [{ mecanismo: 'FIXA', larguraPct: 100 }] });
  });
});
