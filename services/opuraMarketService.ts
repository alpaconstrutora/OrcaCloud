import { supabase } from '../lib/supabase';
import {
  OpuraMarketCity,
  OpuraMarketNeighborhood,
  OpuraMarketListing,
  OpuraMarketDevelopment,
  OpuraMarketTerrainStudy,
  OpuraMarketMonitoredCompetitor,
  OpuraMarketNeighborhoodHistory
} from '../types';

export const opuraMarketService = {
  // Cidades
  async listCities(): Promise<OpuraMarketCity[]> {
    const { data, error } = await supabase
      .from('opura_market_cities')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching market cities:', error);
      throw new Error(`Failed to fetch cities: ${error.message}`);
    }

    // Mapeamento snake_case para camelCase
    return (data || []).map(city => ({
      id: city.id,
      name: city.name,
      state: city.state,
      country: city.country,
      isActive: city.is_active,
      createdAt: city.created_at,
      updatedAt: city.updated_at
    }));
  },

  // Bairros
  async listNeighborhoods(cityId: string): Promise<OpuraMarketNeighborhood[]> {
    const { data, error } = await supabase
      .from('opura_market_neighborhoods')
      .select('*')
      .eq('city_id', cityId)
      .order('name', { ascending: true });

    if (error) {
      console.error(`Error fetching neighborhoods for city ${cityId}:`, error);
      throw new Error(`Failed to fetch neighborhoods: ${error.message}`);
    }

    return (data || []).map(n => ({
      id: n.id,
      cityId: n.city_id,
      name: n.name,
      bairroScore: Number(n.bairro_score || 0),
      ticketMedio: Number(n.ticket_medio || 0),
      pricePerM2Medio: Number(n.price_per_m2_medio || 0),
      areaMedia: Number(n.area_media || 0),
      dominantTypology: n.dominant_typology,
      predominantStandard: n.predominant_standard,
      saturationLevel: n.saturation_level,
      potentialScore: Number(n.potential_score || 0),
      competitorsCount: n.competitors_count || 0,
      geom: n.geom,
      createdAt: n.created_at,
      updatedAt: n.updated_at
    }));
  },

  // Anúncios de Imóveis (Listings)
  async listListings(
    cityId: string,
    filters?: {
      neighborhoodId?: string;
      propertyType?: string;
      constructionStandard?: string;
      bedrooms?: number;
    }
  ): Promise<OpuraMarketListing[]> {
    let query = supabase
      .from('opura_market_listings')
      .select('*')
      .eq('city_id', cityId)
      .eq('listing_status', 'active')
      .is('parent_listing_id', null);

    if (filters) {
      if (filters.neighborhoodId) {
        query = query.eq('neighborhood_id', filters.neighborhoodId);
      }
      if (filters.propertyType) {
        query = query.eq('property_type', filters.propertyType);
      }
      if (filters.constructionStandard) {
        query = query.eq('construction_standard', filters.constructionStandard);
      }
      if (filters.bedrooms !== undefined) {
        query = query.eq('bedrooms', filters.bedrooms);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching market listings:', error);
      throw new Error(`Failed to fetch listings: ${error.message}`);
    }

    return (data || []).map(l => ({
      id: l.id,
      cityId: l.city_id,
      neighborhoodId: l.neighborhood_id,
      source: l.source,
      sourceUrl: l.source_url,
      propertyType: l.property_type,
      address: l.address,
      zipCode: l.zip_code,
      areaPrivate: l.area_private ? Number(l.area_private) : null,
      areaTotal: l.area_total ? Number(l.area_total) : null,
      bedrooms: l.bedrooms || 0,
      suites: l.suites || 0,
      bathrooms: l.bathrooms || 0,
      parkingSpaces: l.parking_spaces || 0,
      price: Number(l.price),
      pricePerM2: l.price_per_m2 ? Number(l.price_per_m2) : null,
      condoFee: l.condo_fee ? Number(l.condo_fee) : null,
      iptu: l.iptu ? Number(l.iptu) : null,
      latitude: l.latitude ? Number(l.latitude) : null,
      longitude: l.longitude ? Number(l.longitude) : null,
      description: l.description,
      constructionStandard: l.construction_standard,
      listingStatus: l.listing_status,
      capturedAt: l.captured_at,
      lastSeenAt: l.last_seen_at,
      parentListingId: l.parent_listing_id,
      createdAt: l.created_at
    }));
  },

  // Empreendimentos (Developments)
  async listDevelopments(cityId: string): Promise<OpuraMarketDevelopment[]> {
    const { data, error } = await supabase
      .from('opura_market_developments')
      .select('*')
      .eq('city_id', cityId)
      .order('launch_date', { ascending: false });

    if (error) {
      console.error('Error fetching market developments:', error);
      throw new Error(`Failed to fetch developments: ${error.message}`);
    }

    return (data || []).map(d => ({
      id: d.id,
      cityId: d.city_id,
      neighborhoodId: d.neighborhood_id,
      name: d.name,
      developer: d.developer,
      address: d.address,
      unitsTotal: d.units_total || 0,
      areaAverage: d.area_average ? Number(d.area_average) : null,
      ticketAverage: d.ticket_average ? Number(d.ticket_average) : null,
      pricePerM2Average: d.price_per_m2_average ? Number(d.price_per_m2_average) : null,
      constructionStandard: d.construction_standard,
      launchDate: d.launch_date,
      status: d.status,
      geom: d.geom,
      createdAt: d.created_at,
      updatedAt: d.updated_at
    }));
  },

  // RPC - Estatísticas de Raio PostGIS
  async getTerrainRadiusStats(
    latitude: number,
    longitude: number,
    radiusMeters: number
  ): Promise<{
    totalListings: number;
    pricePerM2Avg: number;
    ticketAvg: number;
    areaAvg: number;
    bedroomsAvg: number;
    suitesAvg: number;
  }> {
    const { data, error } = await supabase.rpc('get_terrain_radius_statistics', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_meters: radiusMeters
    });

    if (error) {
      console.error('Error calling get_terrain_radius_statistics RPC:', error);
      throw new Error(`Failed to calculate radius statistics: ${error.message}`);
    }

    // Como a RPC retorna uma tabela de 1 linha, pegamos o primeiro item
    const stats = (data && data.length > 0) ? data[0] : null;

    return {
      totalListings: stats ? stats.total_listings : 0,
      pricePerM2Avg: stats ? Number(stats.price_per_m2_avg || 0) : 0,
      ticketAvg: stats ? Number(stats.ticket_avg || 0) : 0,
      areaAvg: stats ? Number(stats.area_avg || 0) : 0,
      bedroomsAvg: stats ? Number(stats.bedrooms_avg || 0) : 0,
      suitesAvg: stats ? Number(stats.suites_avg || 0) : 0
    };
  },

  // Estudos de Terrenos Privados (Com base na Regra 1 - sem travar leitura caso organizationId seja indefinido)
  async listTerrainStudies(organizationId?: string): Promise<OpuraMarketTerrainStudy[]> {
    let query = supabase
      .from('opura_market_terrain_studies')
      .select('*')
      .order('created_at', { ascending: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching terrain studies:', error);
      throw new Error(`Failed to fetch terrain studies: ${error.message}`);
    }

    return (data || []).map(s => ({
      id: s.id,
      organizationId: s.organization_id,
      name: s.name,
      address: s.address,
      terrainArea: Number(s.terrain_area),
      coefficientsZone: s.coefficients_zone,
      analysisRadiusMeters: s.analysis_radius_meters,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      recommendedProductMix: s.recommended_product_mix,
      recommendedStandard: s.recommended_standard,
      estimatedVgv: s.estimated_vgv ? Number(s.estimated_vgv) : null,
      estimatedAbsorptionVelocity: s.estimated_absorption_velocity ? Number(s.estimated_absorption_velocity) : null,
      riskScore: s.risk_score ? Number(s.risk_score) : null,
      createdBy: s.created_by,
      createdAt: s.created_at,
      updatedAt: s.updated_at
    }));
  },

  // Criar Estudo de Terreno Privado
  async createTerrainStudy(
    study: Omit<OpuraMarketTerrainStudy, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<OpuraMarketTerrainStudy> {
    // PostGIS exige a coluna geom formatada em WKT (Well-Known Text) ou GeoJSON
    // Inserimos como POINT(longitude latitude)
    const dbPayload = {
      organization_id: study.organizationId,
      name: study.name,
      address: study.address,
      terrain_area: study.terrainArea,
      coefficients_zone: study.coefficientsZone,
      analysis_radius_meters: study.analysisRadiusMeters,
      latitude: study.latitude,
      longitude: study.longitude,
      geom: `SRID=4326;POINT(${study.longitude} ${study.latitude})`,
      recommended_product_mix: study.recommendedProductMix,
      recommended_standard: study.recommendedStandard,
      estimated_vgv: study.estimatedVgv,
      estimated_absorption_velocity: study.estimatedAbsorptionVelocity,
      risk_score: study.riskScore,
      created_by: study.createdBy
    };

    const { data, error } = await supabase
      .from('opura_market_terrain_studies')
      .insert(dbPayload)
      .select()
      .single();

    if (error) {
      console.error('Error creating terrain study:', error);
      throw new Error(`Failed to create terrain study: ${error.message}`);
    }

    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      address: data.address,
      terrainArea: Number(data.terrain_area),
      coefficientsZone: data.coefficients_zone,
      analysisRadiusMeters: data.analysis_radius_meters,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      recommendedProductMix: data.recommended_product_mix,
      recommendedStandard: data.recommended_standard,
      estimatedVgv: data.estimated_vgv ? Number(data.estimated_vgv) : null,
      estimatedAbsorptionVelocity: data.estimated_absorption_velocity ? Number(data.estimated_absorption_velocity) : null,
      riskScore: data.risk_score ? Number(data.risk_score) : null,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },

  // Deletar Estudo de Terreno Privado
  async deleteTerrainStudy(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_market_terrain_studies')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Error deleting terrain study ${id}:`, error);
      throw new Error(`Failed to delete terrain study: ${error.message}`);
    }
  },

  // Geocodificação de endereços usando a API Nominatim (OpenStreetMap)
  async geocodeAddress(address: string, cityName: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const query = encodeURIComponent(`${address}, ${cityName}`);
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'OpuraMarketIntel/1.0 (contato@opura.com.br)'
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
      return null;
    } catch (err) {
      console.error('Erro ao geocodificar endereço:', err);
      return null;
    }
  },

  // Importação em lote de anúncios
  async importListingsInBatch(
    listings: Omit<OpuraMarketListing, 'id' | 'createdAt' | 'pricePerM2'>[]
  ): Promise<void> {
    const dbPayload = listings.map(l => ({
      city_id: l.cityId,
      neighborhood_id: l.neighborhoodId,
      organization_id: l.organizationId,
      source: l.source,
      source_url: l.sourceUrl,
      property_type: l.propertyType,
      address: l.address,
      zip_code: l.zipCode,
      area_private: l.areaPrivate,
      area_total: l.areaTotal,
      bedrooms: l.bedrooms,
      suites: l.suites,
      bathrooms: l.bathrooms,
      parking_spaces: l.parkingSpaces,
      price: l.price,
      condo_fee: l.condoFee,
      iptu: l.iptu,
      latitude: l.latitude,
      longitude: l.longitude,
      geom: (l.latitude && l.longitude) ? `SRID=4326;POINT(${l.longitude} ${l.latitude})` : null,
      description: l.description,
      construction_standard: l.constructionStandard,
      listing_status: l.listingStatus,
      captured_at: l.capturedAt,
      last_seen_at: l.lastSeenAt
    }));

    const { error } = await supabase
      .from('opura_market_listings')
      .insert(dbPayload);

    if (error) {
      console.error('Error importing listings in batch:', error);
      throw new Error(`Failed to import listings: ${error.message}`);
    }
  },

  // Histórico de Bairros (Série Temporal)
  async listNeighborhoodHistory(neighborhoodId: string): Promise<OpuraMarketNeighborhoodHistory[]> {
    const { data, error } = await supabase
      .from('opura_market_neighborhood_history')
      .select('*')
      .eq('neighborhood_id', neighborhoodId)
      .order('recorded_date', { ascending: true });

    if (error) {
      console.error(`Error fetching neighborhood history for ${neighborhoodId}:`, error);
      throw new Error(`Failed to fetch neighborhood history: ${error.message}`);
    }

    return (data || []).map(h => ({
      id: h.id,
      neighborhoodId: h.neighborhood_id,
      recordedDate: h.recorded_date,
      pricePerM2Medio: Number(h.price_per_m2_medio),
      ticketMedio: Number(h.ticket_medio),
      competitorsCount: h.competitors_count,
      createdAt: h.created_at
    }));
  }
};
