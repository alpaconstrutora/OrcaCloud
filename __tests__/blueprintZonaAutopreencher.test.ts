// @vitest-environment jsdom
/**
 * Zona urbanística preenchida pelo empreendimento vinculado (plano
 * docs/planos/2026-10-21-planta-empreendimento-vinculado-autopreencher.md, item 2).
 *
 * Pedido: "ao selecionar o emprendimento o usuário deve que selecionar o empreendimento
 * manualmente. este é um exemplo onde o app ja pode preencher automaticamente". O hook recebe
 * a sugestão (vínculo → obra), mostra que veio dela e, havendo UMA zona só, já a aplica.
 * Nunca passa por cima do que foi salvo, escolhido ou digitado.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const ctxSalvo = { current: null as null | Record<string, unknown> };
const zonasDo = { current: {} as Record<string, unknown[]> };
vi.mock('../services/blueprintUrbanContextService', () => ({
  blueprintUrbanContextService: {
    get: vi.fn(async () => ctxSalvo.current),
    save: vi.fn(async (_s: string, _o: string, patch: Record<string, unknown>) => ({ ...patch })),
    clear: vi.fn(async () => undefined),
  },
}));
vi.mock('../services/regulatoryMapService', () => ({
  regulatoryMapService: { list: vi.fn(async () => []), listZones: vi.fn(async () => []) },
}));
vi.mock('../services/empreendimentoService', () => ({
  empreendimentoService: { listRegulatoryZones: vi.fn(async (id: string) => zonasDo.current[id] ?? []) },
}));

import { useBlueprintZonaUrbanistica } from '../hooks/useBlueprintZonaUrbanistica';
import { blueprintUrbanContextService } from '../services/blueprintUrbanContextService';

const ZONA_UNICA = { id: 'z1', zona: 'ZR-2', recuo_frente: '5', recuo_fundos: '3', taxa_ocupacao_maxima: '60' };
const montar = (studyId: string, sugerido: string | null) =>
  renderHook(({ s }) => useBlueprintZonaUrbanistica(studyId, 'o1', s, 'o1'), { initialProps: { s: sugerido } });

describe('zona urbanística preenchida pelo empreendimento vinculado', () => {
  beforeEach(() => {
    ctxSalvo.current = null;
    zonasDo.current = { 'emp-1': [ZONA_UNICA], 'emp-2': [ZONA_UNICA, { ...ZONA_UNICA, id: 'z2', zona: 'ZC' }] };
    vi.mocked(blueprintUrbanContextService.save).mockClear();
  });

  it('sem nada salvo: o empreendimento sugerido entra sozinho e diz que foi automático', async () => {
    const h = montar('estudo-1', 'emp-1');
    await waitFor(() => expect(h.result.current.empreendimentoId).toBe('emp-1'));
    expect(h.result.current.empreendimentoAutomatico).toBe(true);
  });

  it('uma zona só: aplica sozinha, uma vez, e marca como automática', async () => {
    const h = montar('estudo-2', 'emp-1');
    await waitFor(() => expect(h.result.current.zonaAplicadaId).toBe('z1'));
    expect(h.result.current.zonaAplicadaAutomaticamente).toBe(true);
    expect(h.result.current.recuos.FRENTE).toBe(5000);
    expect(blueprintUrbanContextService.save).toHaveBeenCalledTimes(1);
    expect(vi.mocked(blueprintUrbanContextService.save).mock.calls[0][2]).toMatchObject({
      empreendimento_id: 'emp-1',
      regulatory_zone_id: 'z1',
    });
  });

  it('duas zonas: não chuta — o empreendimento entra, a zona fica para a pessoa', async () => {
    const h = montar('estudo-3', 'emp-2');
    await waitFor(() => expect(h.result.current.zonas).toHaveLength(2));
    expect(h.result.current.empreendimentoId).toBe('emp-2');
    expect(h.result.current.zonaAplicadaId).toBeNull();
    expect(blueprintUrbanContextService.save).not.toHaveBeenCalled();
  });

  it('contexto já salvo: nem o empreendimento nem a zona mudam', async () => {
    ctxSalvo.current = { zona_origem: 'EMPREENDIMENTO', empreendimento_id: 'emp-2', regulatory_zone_id: null, origem_valores: {} };
    const h = montar('estudo-4', 'emp-1');
    await waitFor(() => expect(h.result.current.empreendimentoId).toBe('emp-2'));
    await waitFor(() => expect(h.result.current.zonas).toHaveLength(2));
    expect(h.result.current.empreendimentoAutomatico).toBe(false);
    expect(blueprintUrbanContextService.save).not.toHaveBeenCalled();
  });

  it('a escolha da pessoa não é desfeita quando a sugestão chega depois', async () => {
    const h = montar('estudo-5', null);
    await waitFor(() => expect(blueprintUrbanContextService.get).toHaveBeenCalled());
    act(() => h.result.current.setEmpreendimentoId('emp-2'));
    h.rerender({ s: 'emp-1' });
    await waitFor(() => expect(h.result.current.zonas).toHaveLength(2));
    expect(h.result.current.empreendimentoId).toBe('emp-2');
    expect(h.result.current.empreendimentoAutomatico).toBe(false);
  });

  it('caminho do catálogo escolhido: a zona única do empreendimento não é aplicada por cima', async () => {
    const h = montar('estudo-6', null);
    await waitFor(() => expect(blueprintUrbanContextService.get).toHaveBeenCalled());
    act(() => h.result.current.setOrigemDaZona('CATALOGO'));
    h.rerender({ s: 'emp-1' });
    await new Promise((r) => setTimeout(r, 50));
    expect(blueprintUrbanContextService.save).not.toHaveBeenCalled();
  });
});
