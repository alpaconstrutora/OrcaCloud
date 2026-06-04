import { supabase } from '../lib/supabase';

// =============================================================================
// Master Data — Fase 1
// Tabelas globais (read-only para usuários). Cache em memória durante a sessão.
// =============================================================================

export interface MasterCountry {
  id: string;
  iso2: string;
  iso3: string;
  name: string;
  name_pt: string;
  ddi?: string;
  currency_code?: string;
  language?: string;
  is_active: boolean;
}

export interface MasterState {
  id: string;
  country_id: string;
  code: string;            // UF: 'SP'
  name: string;
  ibge_code?: number;
  region?: string;
  is_active: boolean;
}

export interface MasterCity {
  id: string;
  state_id: string;
  name: string;
  ibge_code?: number;
  latitude?: number;
  longitude?: number;
  is_capital: boolean;
  is_active: boolean;
}

export interface MasterBank {
  id: string;
  code: string;            // COMPE: '341'
  ispb?: string;
  name: string;
  short_name?: string;
  pix_enabled: boolean;
  is_active: boolean;
}

export interface MasterUnit {
  id: string;
  symbol: string;          // 'm²', 'kg'
  name: string;
  category: string;
  base_factor?: number;
  base_symbol?: string;
  is_active: boolean;
}

// Cache simples em memória — invalidado ao recarregar página.
const cache = {
  countries: null as MasterCountry[] | null,
  states: null as MasterState[] | null,
  banks: null as MasterBank[] | null,
  units: null as MasterUnit[] | null,
  citiesByState: new Map<string, MasterCity[]>(),
};

export const masterDataService = {
  async listCountries(): Promise<MasterCountry[]> {
    if (cache.countries) return cache.countries;
    const { data, error } = await supabase
      .from('master_countries')
      .select('id, iso2, iso3, name, name_pt, ddi, currency_code, language, is_active')
      .eq('is_active', true)
      .order('name_pt');
    if (error) throw error;
    cache.countries = (data || []) as MasterCountry[];
    return cache.countries;
  },

  async listStates(countryIso2 = 'BR'): Promise<MasterState[]> {
    if (cache.states) return cache.states.filter(s => true); // simples: cache só BR
    const countries = await this.listCountries();
    const country = countries.find(c => c.iso2 === countryIso2);
    if (!country) return [];
    const { data, error } = await supabase
      .from('master_states')
      .select('id, country_id, code, name, ibge_code, region, is_active')
      .eq('country_id', country.id)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    cache.states = (data || []) as MasterState[];
    return cache.states;
  },

  async listCities(stateId: string): Promise<MasterCity[]> {
    const cached = cache.citiesByState.get(stateId);
    if (cached) return cached;
    const { data, error } = await supabase
      .from('master_cities')
      .select('id, state_id, name, ibge_code, latitude, longitude, is_capital, is_active')
      .eq('state_id', stateId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    const cities = (data || []) as MasterCity[];
    cache.citiesByState.set(stateId, cities);
    return cities;
  },

  // Busca textual em todas as cidades (usa pg_trgm)
  async searchCities(query: string, limit = 20): Promise<(MasterCity & { state_code?: string })[]> {
    if (query.trim().length < 2) return [];
    const { data, error } = await supabase
      .from('master_cities')
      .select('id, state_id, name, ibge_code, latitude, longitude, is_capital, is_active, master_states(code)')
      .ilike('name', `%${query}%`)
      .eq('is_active', true)
      .limit(limit);
    if (error) throw error;
    return (data || []).map((c: any) => ({
      ...c,
      state_code: c.master_states?.code,
    }));
  },

  async listBanks(): Promise<MasterBank[]> {
    if (cache.banks) return cache.banks;
    const { data, error } = await supabase
      .from('master_banks')
      .select('id, code, ispb, name, short_name, pix_enabled, is_active')
      .eq('is_active', true)
      .order('code');
    if (error) throw error;
    cache.banks = (data || []) as MasterBank[];
    return cache.banks;
  },

  async listUnits(category?: string): Promise<MasterUnit[]> {
    if (!cache.units) {
      const { data, error } = await supabase
        .from('master_units_of_measure')
        .select('id, symbol, name, category, base_factor, base_symbol, is_active')
        .eq('is_active', true)
        .order('category')
        .order('symbol');
      if (error) throw error;
      cache.units = (data || []) as MasterUnit[];
    }
    return category ? cache.units.filter(u => u.category === category) : cache.units;
  },

  // Para forçar recarga (útil após import em massa, futuro)
  invalidateCache() {
    cache.countries = null;
    cache.states = null;
    cache.banks = null;
    cache.units = null;
    cache.citiesByState.clear();
  },
};
