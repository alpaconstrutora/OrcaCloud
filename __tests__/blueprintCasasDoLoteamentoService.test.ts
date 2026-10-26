/**
 * Casas do loteamento › gravar a planta de um lote (26/10/2026, etapa 2 de
 * docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md): estudo novo → rascunho com a casa → zona copiada →
 * premissas com o lote de origem; falha no meio arquiva o estudo daquele lote.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ordem: [] as string[],
  falharEm: null as string | null,
  contexto: null as Record<string, unknown> | null,
}));
const passo = (nome: string, valor: unknown = undefined) => {
  m.ordem.push(nome);
  if (m.falharEm === nome) throw new Error(`falhou: ${nome}`);
  return valor;
};
vi.mock('../services/blueprintService', () => ({
  createStudy: vi.fn(async (i: { name: string }) => passo('createStudy', { study: { id: 'estudo-novo', name: i.name }, branch: { id: 'ramo-novo' } })),
  saveDraft: vi.fn(async () => passo('saveDraft', 'hash')),
  archiveStudy: vi.fn(async () => passo('archiveStudy')),
}));
vi.mock('../services/blueprintCasaService', () => ({
  blueprintCasaService: { save: vi.fn(async (_s: string, _o: string, h: unknown) => passo('casa.save', h)) },
}));
vi.mock('../services/blueprintUrbanContextService', () => ({
  blueprintUrbanContextService: {
    get: vi.fn(async () => passo('ctx.get', m.contexto)),
    save: vi.fn(async (_s: string, _o: string, c: unknown) => passo('ctx.save', c)),
  },
}));
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { criarPlantaDaCasaDoLote } from '../services/blueprintCasasDoLoteamentoService';
import { blueprintCasaService } from '../services/blueprintCasaService';
import { blueprintUrbanContextService } from '../services/blueprintUrbanContextService';
import { PREMISSAS_DA_CASA_PADRAO } from '../utils/blueprintPremissasDaCasa';
import { emptyModel } from '../utils/blueprintKernel';

const pedido = () => ({
  loteamento: { studyId: 'loteamento-1', organizationId: 'org-1', projectId: null, nome: 'Residencial ZZ' },
  loteUid: 'lote-uid-2',
  rotulo: 'Quadra A · Lote 2',
  modelo: emptyModel(),
  premissas: PREMISSAS_DA_CASA_PADRAO,
});

describe('criarPlantaDaCasaDoLote', () => {
  beforeEach(() => {
    m.ordem = [];
    m.falharEm = null;
    m.contexto = { id: 'x', study_id: 'loteamento-1', organization_id: 'org-1', created_at: 'c', updated_at: 'u', zona_rotulo: 'ZR-2', recuo_frente_mm: 5000 };
    vi.clearAllMocks();
  });

  it('cria, grava o rascunho, copia a zona sem os ids e grava as premissas com o lote de origem', async () => {
    const r = await criarPlantaDaCasaDoLote(pedido());
    expect(r).toEqual({ studyId: 'estudo-novo', nome: 'Residencial ZZ · Quadra A · Lote 2 — Casa' });
    expect(m.ordem).toEqual(['createStudy', 'saveDraft', 'ctx.get', 'ctx.save', 'casa.save']);
    expect(vi.mocked(blueprintUrbanContextService.save).mock.calls[0]).toEqual(['estudo-novo', 'org-1', { zona_rotulo: 'ZR-2', recuo_frente_mm: 5000 }]);
    expect(vi.mocked(blueprintCasaService.save).mock.calls[0][2]).toMatchObject({ loteDeOrigem: { estudoId: 'loteamento-1', loteUid: 'lote-uid-2' } });
  });

  it('sem zona no loteamento: não grava contexto', async () => {
    m.contexto = null;
    await criarPlantaDaCasaDoLote(pedido());
    expect(m.ordem).toEqual(['createStudy', 'saveDraft', 'ctx.get', 'casa.save']);
  });

  it('falha no meio: arquiva o estudo daquele lote e repassa o erro', async () => {
    m.falharEm = 'saveDraft';
    await expect(criarPlantaDaCasaDoLote(pedido())).rejects.toThrow('falhou: saveDraft');
    expect(m.ordem).toEqual(['createStudy', 'saveDraft', 'archiveStudy']);
  });
});
