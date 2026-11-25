/**
 * O serviço da terraplenagem com o banco ANTIGO (25/11/2026, revisão do platô desenhado): se a migration
 * `aplicar_20271125100000` ainda não foi aplicada, a coluna `anel_desenhado` não existe (Postgres 42703). Ler e
 * gravar NÃO podem quebrar para todos os estudos: o serviço repete sem a coluna. A ordem entre o deploy e a
 * migration deixa de importar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chamadas: { op: string; cols?: string; payload?: Record<string, unknown> }[] = [];
let semColuna = true;
const erroSemColuna = { code: '42703', message: 'column blueprint_study_terraplenagem.anel_desenhado does not exist' };

vi.mock('../lib/supabase', () => {
  const resposta = (cols: string, payload?: Record<string, unknown>) =>
    semColuna && (cols.includes('anel_desenhado') || (payload && 'anel_desenhado' in payload))
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

describe('blueprintTerraplenagemService sem a coluna anel_desenhado', () => {
  beforeEach(() => {
    chamadas.length = 0;
    semColuna = true;
  });

  it('get: a 1ª leitura falha por 42703 e a 2ª, sem a coluna, devolve a linha', async () => {
    const row = await blueprintTerraplenagemService.get('st1');
    expect(row).toMatchObject({ base: 'LOTE' });
    expect(chamadas.map((c) => c.cols?.includes('anel_desenhado'))).toEqual([true, false]);
  });

  it('save: grava sem anel_desenhado quando a coluna não existe', async () => {
    const premissa = { base: 'LOTE', anel_plato: null, anel_desenhado: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } as never;
    await blueprintTerraplenagemService.save('st1', 'org1', premissa);
    expect(chamadas).toHaveLength(2);
    expect('anel_desenhado' in chamadas[1].payload!).toBe(false);
  });

  it('com a coluna (migration aplicada): uma chamada só, com anel_desenhado', async () => {
    semColuna = false;
    await blueprintTerraplenagemService.get('st1');
    await blueprintTerraplenagemService.save('st1', 'org1', { base: 'LOTE', anel_desenhado: null } as never);
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0].cols).toContain('anel_desenhado');
    expect('anel_desenhado' in chamadas[1].payload!).toBe(true);
  });
});
