import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opuraMarketService } from '../services/opuraMarketService';
import { supabase } from '../lib/supabase';

// Declara os mocks mutáveis de retorno para o Supabase
const mockInsertFn = vi.fn();
const mockSelectFn = vi.fn();

vi.mock('../lib/supabase', () => {
  // Mock encadeado que simula o comportamento fluente do Supabase Client
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockImplementation((...args) => mockInsertFn(...args))
  };

  // Garante que o select do chain retorne a nossa função mockSelectFn
  chain.eq.mockImplementation(() => {
    return {
      eq: vi.fn().mockImplementation(() => {
        return {
          then: (resolve) => resolve(mockSelectFn())
        };
      })
    };
  });

  return {
    supabase: {
      from: vi.fn().mockImplementation(() => chain),
      rpc: vi.fn()
    }
  };
});

describe('Motor de Deduplicação Automática de Anúncios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve identificar e remover duplicados do mesmo lote e contra o banco de dados', async () => {
    const mockExistingDbListings = [
      {
        id: 'db-listing-1',
        city_id: 'city-1',
        neighborhood_id: 'neigh-1',
        latitude: -22.6122,
        longitude: -46.0578,
        bedrooms: 3,
        area_private: 80,
        price: 450000
      }
    ];

    // Define o retorno para o select (anúncios existentes do banco)
    mockSelectFn.mockReturnValue({ data: mockExistingDbListings, error: null });
    // Define o retorno de sucesso para o insert
    mockInsertFn.mockResolvedValue({ data: null, error: null });

    const listingsToImport = [
      {
        cityId: 'city-1',
        neighborhoodId: 'neigh-1',
        organizationId: 'org-1',
        source: 'Imobiliária A',
        sourceUrl: 'https://imobiliariaa.com/imovel1',
        propertyType: 'Apartamento',
        address: 'Rua do Comércio, 100, Centro',
        zipCode: '37600-000',
        areaPrivate: 80, // Área idêntica ao do banco (80)
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
        description: 'Lindo apartamento de 3 dormitórios.',
        constructionStandard: 'Médio',
        listingStatus: 'active',
        capturedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      },
      {
        // Similar ao do banco: área com 1.25% de diferença (81m²), mesma tipologia de quartos e próximo (<50m)
        cityId: 'city-1',
        neighborhoodId: 'neigh-1',
        organizationId: 'org-1',
        source: 'Imobiliária B',
        sourceUrl: 'https://imobiliariab.com/imovel1-similar',
        propertyType: 'Apartamento',
        address: 'Rua do Comércio, 102, Centro',
        zipCode: '37600-000',
        areaPrivate: 81,
        areaTotal: 81,
        bedrooms: 3,
        suites: 1,
        bathrooms: 2,
        parkingSpaces: 1,
        price: 455000,
        condoFee: null,
        iptu: null,
        latitude: -22.6123,
        longitude: -46.0578,
        description: 'Apartamento 3 quartos próximo ao centro.',
        constructionStandard: 'Médio',
        listingStatus: 'active',
        capturedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      },
      {
        // Anúncio Novo e Único (4 quartos, 120m²) -> Deve ser inserido
        cityId: 'city-1',
        neighborhoodId: 'neigh-1',
        organizationId: 'org-1',
        source: 'Imobiliária A',
        sourceUrl: 'https://imobiliariaa.com/imovel2',
        propertyType: 'Apartamento',
        address: 'Rua do Comércio, 150, Centro',
        zipCode: '37600-000',
        areaPrivate: 120,
        areaTotal: 120,
        bedrooms: 4,
        suites: 2,
        bathrooms: 3,
        parkingSpaces: 2,
        price: 680000,
        condoFee: null,
        iptu: null,
        latitude: -22.6125,
        longitude: -46.0575,
        description: 'Amplo apartamento de 4 dormitórios.',
        constructionStandard: 'Alto Padrão',
        listingStatus: 'active',
        capturedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      },
      {
        // DUPLICADO INTERNO (Idêntico ao anúncio novo e único anterior) -> Deve ser ignorado
        cityId: 'city-1',
        neighborhoodId: 'neigh-1',
        organizationId: 'org-1',
        source: 'Imobiliária C',
        sourceUrl: 'https://imobiliariac.com/imovel2-rep',
        propertyType: 'Apartamento',
        address: 'Rua do Comércio, 150, Centro',
        zipCode: '37600-000',
        areaPrivate: 120,
        areaTotal: 120,
        bedrooms: 4,
        suites: 2,
        bathrooms: 3,
        parkingSpaces: 2,
        price: 685000,
        condoFee: null,
        iptu: null,
        latitude: -22.6125,
        longitude: -46.0575,
        description: 'Apartamento de 4 quartos Centro.',
        constructionStandard: 'Alto Padrão',
        listingStatus: 'active',
        capturedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      }
    ];

    const result = await opuraMarketService.importListingsInBatch(listingsToImport);

    // Validações de Deduplicação
    expect(result.importedCount).toBe(1); // Apenas o anúncio de 120m² deve ser inserido
    expect(result.deduplicatedCount).toBe(3); // 3 anúncios duplicados/similares devem ser ignorados
    expect(mockInsertFn).toHaveBeenCalledTimes(1);

    const insertedPayload = mockInsertFn.mock.calls[0][0];
    expect(insertedPayload).toHaveLength(1);
    expect(insertedPayload[0].area_private).toBe(120);
    expect(insertedPayload[0].bedrooms).toBe(4);
  });
});
