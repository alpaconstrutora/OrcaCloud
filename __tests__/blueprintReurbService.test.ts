/**
 * A5 — os ocupantes da REURB vêm do Empreendimento ligado ao estudo: lote ↔
 * unidade por `blueprint_lote_uid`; unidade sem lote não entra; estudo sem
 * Empreendimento devolve vazio (e o painel explica o caminho).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { estado, listByEmpreendimento } = vi.hoisted(() => ({
  estado: { empreendimentos: [] as { id: string; name: string }[] },
  listByEmpreendimento: vi.fn(async (ids: string[]) =>
    [
      { unit_id: 'u1', _client_name: 'Maria', _client_document: '111', role: 'MORADOR' },
      { unit_id: 'u1', _client_name: 'José', _client_document: null, role: 'PROPRIETARIO' },
      { unit_id: 'u3', _client_name: 'Fora', _client_document: '9', role: 'MORADOR' },
    ].filter((o) => ids.includes(o.unit_id)),
  ),
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: estado.empreendimentos, error: null }) }) }),
    }),
  },
}));
vi.mock('../services/empreendimentoService', () => ({
  empreendimentoService: {
    listAllUnitsForEmpreendimento: async () => [
      { id: 'u1', name: 'Lote 1', _tower_name: 'Quadra A', blueprint_lote_uid: 'L1' },
      { id: 'u2', name: 'Lote 2', _tower_name: 'Quadra A', blueprint_lote_uid: 'L2' },
      { id: 'u3', name: 'Casa avulsa', _tower_name: 'X', blueprint_lote_uid: null },
    ],
  },
}));
vi.mock('../services/unitOccupancyService', () => ({ unitOccupancyService: { listByEmpreendimento: (...a: unknown[]) => listByEmpreendimento(...(a as [string[]])) } }));

import { blueprintReurbService, zipDeTextos } from '../services/blueprintReurbService';

describe('blueprintReurbService', () => {
  beforeEach(() => {
    listByEmpreendimento.mockClear();
  });

  it('estudo sem Empreendimento: vazio, sem consultar ocupações', async () => {
    estado.empreendimentos = [];
    const r = await blueprintReurbService.ocupantesDoEstudo('s');
    expect(r).toEqual({ empreendimento: null, lotesComUnidade: 0, porLoteUid: {} });
    expect(listByEmpreendimento).not.toHaveBeenCalled();
  });

  it('agrupa por lote; unidade sem lote fica de fora', async () => {
    estado.empreendimentos = [{ id: 'e1', name: 'Vila' }];
    const r = await blueprintReurbService.ocupantesDoEstudo('s');
    expect(r.empreendimento).toEqual({ id: 'e1', nome: 'Vila' });
    expect(r.lotesComUnidade).toBe(2);
    expect(listByEmpreendimento.mock.calls[0][0]).toEqual(['u1', 'u2']);
    expect(r.porLoteUid).toEqual({
      L1: [
        { nome: 'Maria', documento: '111', papel: 'MORADOR' },
        { nome: 'José', documento: null, papel: 'PROPRIETARIO' },
      ],
    });
  });

  it('zipDeTextos: um arquivo por memorial', async () => {
    const zip = await zipDeTextos([{ nome: 'a.txt', texto: 'um' }, { nome: 'b.txt', texto: 'dois' }]);
    const PizZip = (await import('pizzip')).default;
    const lido = new PizZip(zip);
    expect(Object.keys(lido.files).sort()).toEqual(['a.txt', 'b.txt']);
    expect(lido.file('b.txt')!.asText()).toBe('dois');
  });
});
