import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opuraMarketService } from '../services/opuraMarketService';

/**
 * Deduplicação do lote de anúncios (`importListingsInBatch`).
 *
 * O mock do Supabase é uma tabela falsa filtrada pelos filtros que o serviço
 * REALMENTE encadeia (`eq` / `is`). Assim o teste prova também a consulta: se o
 * serviço esquecer o filtro de organização, a tabela falsa devolve anúncios de
 * outra origem e os casos de "mesma origem" quebram.
 *
 * Regra (igual ao gatilho fn_deduplicate_market_listing desde a Fase 1,
 * aplicar_20271007000100): só se compara anúncio da MESMA origem — mesma
 * organização, ou os dois globais.
 */
const h = vi.hoisted(() => ({
  linhas: [] as Record<string, unknown>[],
  erroSelect: null as null | { message: string },
  filtrosUsados: [] as Record<string, unknown>[],
  insert: vi.fn(),
}));

vi.mock('../lib/supabase', () => {
  const consulta = () => {
    const filtros: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (col: string, val: unknown) => { filtros[col] = val; return b; };
    b.is = (col: string, val: unknown) => { filtros[col] = val; return b; };
    b.insert = (payload: unknown) => h.insert(payload);
    b.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => {
      h.filtrosUsados.push({ ...filtros });
      const data = h.erroSelect
        ? null
        : h.linhas.filter(r => Object.entries(filtros).every(([k, v]) => (r[k] ?? null) === v));
      return Promise.resolve({ data, error: h.erroSelect }).then(ok, falha);
    };
    return b;
  };
  return { supabase: { from: vi.fn(() => consulta()), rpc: vi.fn() } };
});

type Importavel = Parameters<typeof opuraMarketService.importListingsInBatch>[0][number];

const anuncio = (over: Partial<Importavel> = {}): Importavel => ({
  cityId: 'city-1',
  neighborhoodId: 'neigh-1',
  organizationId: 'org-1',
  source: 'Imobiliária A',
  sourceUrl: null,
  propertyType: 'Apartamento',
  address: 'Rua do Comércio, 100, Centro',
  zipCode: null,
  areaPrivate: 80,
  areaTotal: 80,
  bedrooms: 3,
  suites: 1,
  bathrooms: 2,
  parkingSpaces: 1,
  price: 450000,
  condoFee: null,
  iptu: null,
  latitude: -22.6122,
  longitude: -46.0578,
  description: null,
  constructionStandard: 'Médio',
  listingStatus: 'active',
  capturedAt: '2026-10-07T00:00:00.000Z',
  lastSeenAt: '2026-10-07T00:00:00.000Z',
  ...over,
});

const existente = (over: Record<string, unknown> = {}) => ({
  id: 'db-1',
  city_id: 'city-1',
  neighborhood_id: 'neigh-1',
  organization_id: 'org-1',
  listing_status: 'active',
  parent_listing_id: null,
  latitude: -22.6122,
  longitude: -46.0578,
  bedrooms: 3,
  area_private: 80,
  ...over,
});

const inseridos = (): Record<string, unknown>[] => (h.insert.mock.calls[0]?.[0] as Record<string, unknown>[]) ?? [];

describe('Deduplicação de anúncios no lote importado', () => {
  beforeEach(() => {
    h.linhas = [];
    h.erroSelect = null;
    h.filtrosUsados = [];
    h.insert.mockReset();
    h.insert.mockResolvedValue({ data: null, error: null });
  });

  it('remove duplicados do mesmo lote e contra o banco, dentro da mesma organização', async () => {
    h.linhas = [existente()];

    const result = await opuraMarketService.importListingsInBatch([
      anuncio({ source: 'Imobiliária A' }),                                         // idêntico ao do banco
      anuncio({ source: 'Imobiliária B', areaPrivate: 81, latitude: -22.6123 }),    // 1,25 % e ~11 m do banco
      anuncio({ source: 'Imobiliária A', areaPrivate: 120, bedrooms: 4, latitude: -22.6125, longitude: -46.0575 }), // novo
      anuncio({ source: 'Imobiliária C', areaPrivate: 120, bedrooms: 4, latitude: -22.6125, longitude: -46.0575 }), // repete o novo
    ]);

    expect(result).toEqual({ importedCount: 1, deduplicatedCount: 3 });
    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(inseridos()).toHaveLength(1);
    expect(inseridos()[0]).toMatchObject({ area_private: 120, bedrooms: 4, organization_id: 'org-1' });
  });

  it('anúncio privado igual a um GLOBAL é importado, não descartado', async () => {
    h.linhas = [existente({ id: 'global-1', organization_id: null })];

    const result = await opuraMarketService.importListingsInBatch([anuncio()]);

    expect(result).toEqual({ importedCount: 1, deduplicatedCount: 0 });
    expect(inseridos()[0]).toMatchObject({ organization_id: 'org-1' });
  });

  it('anúncio privado igual a um de OUTRA organização é importado', async () => {
    h.linhas = [existente({ id: 'org2-1', organization_id: 'org-2' })];

    const result = await opuraMarketService.importListingsInBatch([anuncio()]);

    expect(result).toEqual({ importedCount: 1, deduplicatedCount: 0 });
  });

  it('no mesmo lote, anúncios iguais de organizações diferentes entram os dois', async () => {
    const result = await opuraMarketService.importListingsInBatch([
      anuncio({ organizationId: 'org-1' }),
      anuncio({ organizationId: 'org-2' }),
    ]);

    expect(result).toEqual({ importedCount: 2, deduplicatedCount: 0 });
    expect(inseridos().map(r => r.organization_id)).toEqual(['org-1', 'org-2']);
  });

  it('busca os existentes por cidade + origem, só ativos e não duplicados — nunca a string "null"', async () => {
    await opuraMarketService.importListingsInBatch([
      anuncio({ neighborhoodId: null }),
      anuncio({ organizationId: '', areaPrivate: 200 }),   // string vazia = global
    ]);

    expect(h.filtrosUsados).toEqual([
      { city_id: 'city-1', listing_status: 'active', parent_listing_id: null, organization_id: 'org-1' },
      { city_id: 'city-1', listing_status: 'active', parent_listing_id: null, organization_id: null },
    ]);
    expect(JSON.stringify(h.filtrosUsados)).not.toContain('"null"');
    expect(inseridos()[0].neighborhood_id).toBeNull();
    expect(inseridos()[1].organization_id).toBeNull();
  });

  it('bairro nulo não impede a deduplicação contra o banco', async () => {
    h.linhas = [existente({ neighborhood_id: null })];

    const result = await opuraMarketService.importListingsInBatch([anuncio({ neighborhoodId: null })]);

    expect(result).toEqual({ importedCount: 0, deduplicatedCount: 1 });
  });

  it('sem coordenada, só junta anúncios parecidos do MESMO bairro', async () => {
    const semCoord = { latitude: null, longitude: null };
    h.linhas = [existente({ ...semCoord, neighborhood_id: 'neigh-1' })];

    const result = await opuraMarketService.importListingsInBatch([
      anuncio({ ...semCoord, neighborhoodId: 'neigh-2' }),   // outro bairro → entra
      anuncio({ ...semCoord, neighborhoodId: 'neigh-1' }),   // mesmo bairro do banco → duplicado
    ]);

    expect(result).toEqual({ importedCount: 1, deduplicatedCount: 1 });
    expect(inseridos()[0]).toMatchObject({ neighborhood_id: 'neigh-2' });
  });

  it('erro ao buscar os existentes interrompe a importação em vez de gravar às cegas', async () => {
    h.erroSelect = { message: 'statement timeout' };

    await expect(opuraMarketService.importListingsInBatch([anuncio()]))
      .rejects.toThrow('Falha ao buscar anúncios existentes para deduplicar: statement timeout');
    expect(h.insert).not.toHaveBeenCalled();
  });
});
