// @vitest-environment jsdom
/**
 * O painel de zona lembra a escolha EM ANDAMENTO quando o editor reabre
 * (11/10/2026, atalho para o Mapa Regulatório — plano
 * docs/planos/2026-10-11-planta-atalho-mapa-regulatorio.md).
 *
 * Duas metades, e a segunda é a que importa: (1) cidade e mapa escolhidos sem
 * aplicar sobrevivem a fechar e reabrir o editor; (2) abrir e fechar SEM mexer
 * não guarda nada — senão os valores padrão passariam por cima da zona aplicada.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const ctxSalvo = { current: null as null | Record<string, unknown> };
vi.mock('../services/blueprintUrbanContextService', () => ({
  blueprintUrbanContextService: { get: vi.fn(async () => ctxSalvo.current), upsert: vi.fn() },
}));
vi.mock('../services/regulatoryMapService', () => ({
  regulatoryMapService: { listByCity: vi.fn(async () => []), listZones: vi.fn(async () => []) },
}));
vi.mock('../services/empreendimentoService', () => ({
  empreendimentoService: { listRegulatoryZones: vi.fn(async () => []) },
}));

import { useBlueprintZonaUrbanistica } from '../hooks/useBlueprintZonaUrbanistica';
import { blueprintUrbanContextService } from '../services/blueprintUrbanContextService';

const montar = (studyId: string) => renderHook(() => useBlueprintZonaUrbanistica(studyId, 'o1', null));
const carregou = async () => waitFor(() => expect(blueprintUrbanContextService.get).toHaveBeenCalled());

describe('escolha em andamento da zona', () => {
  beforeEach(() => {
    ctxSalvo.current = null;
    vi.mocked(blueprintUrbanContextService.get).mockClear();
  });

  it('cidade e mapa escolhidos sem aplicar voltam ao reabrir o editor', async () => {
    const a = montar('estudo-A');
    await carregou();
    act(() => {
      a.result.current.setOrigemDaZona('CATALOGO');
      a.result.current.setCidade({ id: 'c1', name: 'Campinas', state_code: 'SP' } as never);
      a.result.current.setMapaId('m1');
    });
    a.unmount();

    const b = montar('estudo-A');
    expect(b.result.current.origemDaZona).toBe('CATALOGO');
    expect(b.result.current.cidade?.id).toBe('c1');
    expect(b.result.current.mapaId).toBe('m1');
  });

  it('abrir e fechar sem mexer não guarda nada: a zona aplicada no banco continua mandando', async () => {
    ctxSalvo.current = { zona_origem: 'CATALOGO', regulatory_map_id: 'm-salvo' };
    const a = montar('estudo-B');
    await waitFor(() => expect(a.result.current.mapaId).toBe('m-salvo'));
    a.unmount();

    const b = montar('estudo-B');
    // Sem retomada, nasce no padrão e o salvo chega pelo banco — não o contrário.
    await waitFor(() => expect(b.result.current.mapaId).toBe('m-salvo'));
    expect(b.result.current.origemDaZona).toBe('CATALOGO');
  });

  it('cada estudo tem a sua escolha', async () => {
    const c = montar('estudo-C');
    await carregou();
    act(() => { c.result.current.setOrigemDaZona('CATALOGO'); c.result.current.setMapaId('m-c'); });
    c.unmount();
    const d = montar('estudo-D');
    expect(d.result.current.mapaId).toBe('');
  });
});
