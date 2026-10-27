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
  regulatoryMapService: { listByCity: vi.fn(async () => []), listZones: vi.fn(async () => []) },
}));
const cidades = { current: [] as { id: string; name: string; state_code: string }[] };
vi.mock('../services/masterDataService', () => ({
  masterDataService: { searchCities: vi.fn(async () => cidades.current) },
}));
vi.mock('../services/empreendimentoService', () => ({
  empreendimentoService: { listRegulatoryZones: vi.fn(async (id: string) => zonasDo.current[id] ?? []) },
}));

import { useBlueprintZonaUrbanistica } from '../hooks/useBlueprintZonaUrbanistica';
import { blueprintUrbanContextService } from '../services/blueprintUrbanContextService';
import { regulatoryMapService } from '../services/regulatoryMapService';

const ZONA_UNICA = { id: 'z1', zona: 'ZR-2', recuo_frente: '5', recuo_fundos: '3', taxa_ocupacao_maxima: '60' };
const montar = (studyId: string, sugerido: string | null) =>
  renderHook(({ s }) => useBlueprintZonaUrbanistica(studyId, 'o1', s), { initialProps: { s: sugerido } });

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
    expect(h.result.current.motivoDaZonaAutomatica).toBe('UNICA');
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

  // Plano docs/planos/2026-10-26-zona-aplicavel-do-empreendimento.md, item 8: o empreendimento
  // MARCA a zona que vale (175 zonas de Cambuí no Garden, uma aplicável) — a Planta não chuta,
  // usa a marcada, pela mesma regra da zona única.
  it('várias zonas e UMA marcada como aplicável no empreendimento: aplica a marcada sozinha', async () => {
    zonasDo.current['emp-3'] = [
      { ...ZONA_UNICA, id: 'za', zona: 'ZM 4' },
      { ...ZONA_UNICA, id: 'zb', zona: 'ZEPEC 2', recuo_frente: '7', aplicavel: true },
      { ...ZONA_UNICA, id: 'zc', zona: 'ZC' },
    ];
    const h = montar('estudo-8', 'emp-3');
    await waitFor(() => expect(h.result.current.zonaAplicadaId).toBe('zb'));
    expect(h.result.current.zonaAplicadaAutomaticamente).toBe(true);
    expect(h.result.current.recuos.FRENTE).toBe(7000);
    expect(h.result.current.motivoDaZonaAutomatica).toBe('APLICAVEL');
  });

  it('zona marcada no empreendimento NÃO passa por cima de zona já salva na planta', async () => {
    zonasDo.current['emp-3'] = [
      { ...ZONA_UNICA, id: 'za', zona: 'ZM 4' },
      { ...ZONA_UNICA, id: 'zb', zona: 'ZEPEC 2', aplicavel: true },
    ];
    ctxSalvo.current = { zona_origem: 'EMPREENDIMENTO', empreendimento_id: 'emp-3', regulatory_zone_id: 'za', origem_valores: {} };
    const h = montar('estudo-9', 'emp-3');
    await waitFor(() => expect(h.result.current.zonas).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.result.current.zonaAplicadaId).toBe('za');
    expect(blueprintUrbanContextService.save).not.toHaveBeenCalled();
  });

  // Plano docs/planos/2026-10-26-zona-aplicavel-chega-na-planta.md.
  it('ESCOLHER o empreendimento aplica a zona marcada nele, mesmo com contexto salvo (desligado)', async () => {
    zonasDo.current['emp-3'] = [
      { ...ZONA_UNICA, id: 'za', zona: 'ZM 4' },
      { ...ZONA_UNICA, id: 'zb', zona: 'ZEPEC 2', taxa_ocupacao_maxima: '0,9', aplicavel: true },
    ];
    ctxSalvo.current = { zona_origem: 'EMPREENDIMENTO', empreendimento_id: 'emp-2', regulatory_zone_id: null, origem_valores: {}, zona_desligada_em: '2026-10-26T23:37:00Z' };
    const h = montar('estudo-10', null);
    await waitFor(() => expect(h.result.current.empreendimentoId).toBe('emp-2'));
    act(() => h.result.current.setEmpreendimentoId('emp-3'));
    await waitFor(() => expect(h.result.current.zonaAplicadaId).toBe('zb'));
    expect(h.result.current.taxaOcupacaoMax).toBe(90);
    expect(h.result.current.motivoDaZonaAutomatica).toBe('APLICAVEL');
    expect(vi.mocked(blueprintUrbanContextService.save).mock.calls.at(-1)?.[2]).toMatchObject({ empreendimento_id: 'emp-3', regulatory_zone_id: 'zb' });
  });

  it('ESCOLHER o empreendimento com valor ajustado à mão NÃO passa por cima — a aplicável fica oferecida', async () => {
    zonasDo.current['emp-3'] = [
      { ...ZONA_UNICA, id: 'za', zona: 'ZM 4' },
      { ...ZONA_UNICA, id: 'zb', zona: 'ZEPEC 2', aplicavel: true },
    ];
    ctxSalvo.current = { zona_origem: 'EMPREENDIMENTO', empreendimento_id: 'emp-2', regulatory_zone_id: 'z2', recuo_frente_mm: 4000, origem_valores: { recuo_frente: 'MANUAL' } };
    const h = montar('estudo-11', null);
    await waitFor(() => expect(h.result.current.ajustadoAMao).toBe(true));
    act(() => h.result.current.setEmpreendimentoId('emp-3'));
    await waitFor(() => expect(h.result.current.zonaAplicavel?.id).toBe('zb'));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.result.current.zonaAplicadaId).toBe('z2');
    expect(h.result.current.recuos.FRENTE).toBe(4000);
    expect(blueprintUrbanContextService.save).not.toHaveBeenCalled();
  });

  it('zona em vigor apagada da origem (reimportação): zonaAplicadaSumiu, sem aplicar nada sozinho', async () => {
    zonasDo.current['emp-3'] = [
      { ...ZONA_UNICA, id: 'za', zona: 'ZM 4' },
      { ...ZONA_UNICA, id: 'zb', zona: 'ZEPEC 2', aplicavel: true },
    ];
    ctxSalvo.current = { zona_origem: 'EMPREENDIMENTO', empreendimento_id: 'emp-3', regulatory_zone_id: 'apagada', zona_rotulo: 'ZEPEC 2 · Urbanização Consolidada', gabarito_altura_max_m: 11.6, origem_valores: {} };
    const h = montar('estudo-12', 'emp-3');
    await waitFor(() => expect(h.result.current.zonaAplicadaSumiu).toBe(true));
    expect(h.result.current.zonaAplicavel?.id).toBe('zb');
    expect(h.result.current.gabaritoAlturaMaxM).toBe(11.6);
    expect(blueprintUrbanContextService.save).not.toHaveBeenCalled();
  });

  it('zona em vigor ainda na lista: não sumiu', async () => {
    ctxSalvo.current = { zona_origem: 'EMPREENDIMENTO', empreendimento_id: 'emp-2', regulatory_zone_id: 'z2', origem_valores: {} };
    const h = montar('estudo-13', null);
    await waitFor(() => expect(h.result.current.zonas).toHaveLength(2));
    expect(h.result.current.zonaAplicadaSumiu).toBe(false);
    expect(h.result.current.zonaAplicavel).toBeNull();
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

  it('desligar é lembrado: a linha fica zerada com a data, e reabrir NÃO reaplica a zona única (22/10/2026)', async () => {
    const a = montar('estudo-7', 'emp-1');
    await waitFor(() => expect(a.result.current.zonaAplicadaId).toBe('z1'));
    act(() => a.result.current.desligar());
    await waitFor(() => expect(blueprintUrbanContextService.save).toHaveBeenCalledTimes(2));
    const gravado = vi.mocked(blueprintUrbanContextService.save).mock.calls[1][2] as Record<string, unknown>;
    expect(gravado).toMatchObject({ regulatory_zone_id: null, recuo_frente_mm: null, origem_valores: {}, aplicado_em: null });
    expect(typeof gravado.zona_desligada_em).toBe('string');
    expect(blueprintUrbanContextService.clear).not.toHaveBeenCalled();
    a.unmount();

    ctxSalvo.current = gravado;
    vi.mocked(blueprintUrbanContextService.save).mockClear();
    const b = montar('estudo-7', 'emp-1');
    await waitFor(() => expect(b.result.current.zonas).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(b.result.current.zonaAplicadaId).toBeNull();
    expect(blueprintUrbanContextService.save).not.toHaveBeenCalled();
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

describe('cidade da ficha no caminho do catálogo (22/10/2026)', () => {
  beforeEach(() => {
    ctxSalvo.current = null;
    zonasDo.current = {};
    cidades.current = [
      { id: 'c-mg', name: 'Cambuí', state_code: 'MG' },
      { id: 'c-sp', name: 'Cambuí', state_code: 'SP' },
      { id: 'c-x', name: 'Cambuizinho', state_code: 'MG' },
    ];
  });
  const comCidade = (studyId: string, cidade: { nome: string; uf: string | null }) =>
    renderHook(() => useBlueprintZonaUrbanistica(studyId, 'o1', null, cidade));

  it('catálogo sem cidade: entra a cidade que casa nome (sem acento/caixa) e UF, marcada como automática', async () => {
    const h = comCidade('estudo-c1', { nome: 'cambui', uf: 'MG' });
    await waitFor(() => expect(blueprintUrbanContextService.get).toHaveBeenCalled());
    act(() => h.result.current.setOrigemDaZona('CATALOGO'));
    await waitFor(() => expect(h.result.current.cidade?.id).toBe('c-mg'));
    expect(h.result.current.cidadeAutomatica).toBe(true);
    act(() => h.result.current.setCidade({ id: 'outra', name: 'Outra' }));
    expect(h.result.current.cidadeAutomatica).toBe(false);
  });

  it('os mapas da cidade vêm de TODAS as organizações do usuário, não só da do estudo (26/10/2026)', async () => {
    // O mapa de Cambuí-MG mora na Alpa; a planta (e o empreendimento) na SPE. Filtrar pela
    // organização escondia a lei da cidade — a busca é só pela cidade, a RLS limita.
    const h = comCidade('estudo-c3', { nome: 'cambui', uf: 'MG' });
    await waitFor(() => expect(blueprintUrbanContextService.get).toHaveBeenCalled());
    act(() => h.result.current.setOrigemDaZona('CATALOGO'));
    await waitFor(() => expect(regulatoryMapService.listByCity).toHaveBeenCalledWith('c-mg'));
  });

  it('sem UF e duas cidades com o nome: não chuta', async () => {
    const h = comCidade('estudo-c2', { nome: 'Cambuí', uf: null });
    await waitFor(() => expect(blueprintUrbanContextService.get).toHaveBeenCalled());
    act(() => h.result.current.setOrigemDaZona('CATALOGO'));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.result.current.cidade).toBeNull();
    expect(h.result.current.cidadeAutomatica).toBe(false);
  });
});
