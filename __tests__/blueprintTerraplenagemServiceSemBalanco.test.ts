/**
 * O serviço da terraplenagem com o banco SEM as colunas do balanço e do talude suave (25/11/2026): antes da migration
 * `…_terraplenagem_balanco_talude_suave`, `modo_do_balanco`, `forma_do_talude` e `largura_do_talude_suave_m` não
 * existem (42703). Ler e gravar repetem SEM essas três — e só elas: `anel_desenhado` já existe e continua indo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chamadas: { op: string; cols?: string; payload?: Record<string, unknown> }[] = [];
let semColuna = true;
const erroSemColuna = { code: '42703', message: 'column blueprint_study_terraplenagem.modo_do_balanco does not exist' };
const NOVAS = ['modo_do_balanco', 'forma_do_talude', 'largura_do_talude_suave_m'];

vi.mock('../lib/supabase', () => {
  const resposta = (cols: string, payload?: Record<string, unknown>) =>
    semColuna && NOVAS.some((c) => cols.includes(c) || (payload && c in payload))
      ? { data: null, error: erroSemColuna }
      : { data: { base: 'LOTE', ...(payload ?? {}) }, error: null };
  return {
    supabase: {
      from: () => ({
        select: (cols: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              chamadas.push({ op: 'get', cols });
              return resposta(cols);
            },
          }),
        }),
        upsert: (payload: Record<string, unknown>) => ({
          select: (cols: string) => ({
            single: async () => {
              chamadas.push({ op: 'save', cols, payload });
              return resposta(cols, payload);
            },
          }),
        }),
      }),
    },
  };
});

import { blueprintTerraplenagemService } from '../services/blueprintTerraplenagemService';

describe('blueprintTerraplenagemService sem as colunas do balanço e do talude suave', () => {
  beforeEach(() => {
    chamadas.length = 0;
    semColuna = true;
  });

  it('get: a 2ª leitura vai sem as 3 colunas novas, MAS com anel_desenhado', async () => {
    const row = await blueprintTerraplenagemService.get('st1');
    expect(row).toMatchObject({ base: 'LOTE' });
    expect(chamadas).toHaveLength(2);
    expect(NOVAS.every((c) => chamadas[0].cols!.includes(c))).toBe(true);
    expect(NOVAS.some((c) => chamadas[1].cols!.includes(c))).toBe(false);
    expect(chamadas[1].cols).toContain('anel_desenhado');
  });

  it('save: grava sem as 3 colunas novas e mantém o desenho', async () => {
    const premissa = { base: 'DESENHADO', anel_desenhado: [{ x: 0, y: 0 }], modo_do_balanco: 'CORTE', forma_do_talude: 'SUAVE', largura_do_talude_suave_m: 5 } as never;
    await blueprintTerraplenagemService.save('st1', 'org1', premissa);
    expect(chamadas).toHaveLength(2);
    expect(NOVAS.some((c) => c in chamadas[1].payload!)).toBe(false);
    expect('anel_desenhado' in chamadas[1].payload!).toBe(true);
  });

  it('com as colunas (migration aplicada): uma chamada só, com elas', async () => {
    semColuna = false;
    await blueprintTerraplenagemService.save('st1', 'org1', { base: 'LOTE', modo_do_balanco: 'ATERRO' } as never);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].payload!.modo_do_balanco).toBe('ATERRO');
    expect(chamadas[0].cols).toContain('modo_do_balanco');
  });
});
