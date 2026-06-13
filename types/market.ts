export interface OpuraMarketCity {
  id: string;
  name: string;
  state: string;
  country: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OpuraMarketNeighborhood {
  id: string;
  cityId: string;
  name: string;
  bairroScore: number;
  ticketMedio: number;
  pricePerM2Medio: number;
  areaMedia: number;
  dominantTypology: string | null;
  predominantStandard: 'Econômico' | 'Médio' | 'Médio-Alto' | 'Alto Padrão' | 'Luxo' | null;
  saturationLevel: 'Escassez' | 'Saudável' | 'Atenção' | 'Saturado' | null;
  potentialScore: number;
  competitorsCount: number;
  geom: any; // GeoJSON geometry (Polígono ou Limites do Bairro)
  createdAt: string;
  updatedAt: string;
}

export interface OpuraMarketListing {
  id: string;
  cityId: string;
  neighborhoodId: string | null;
  organizationId?: string | null;
  parentListingId?: string | null;
  source: string;
  sourceUrl: string | null;
  propertyType: string;
  address: string | null;
  zipCode: string | null;
  areaPrivate: number | null;
  areaTotal: number | null;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parkingSpaces: number;
  price: number;
  pricePerM2: number | null;
  condoFee: number | null;
  iptu: number | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  constructionStandard: 'Econômico' | 'Médio' | 'Médio-Alto' | 'Alto Padrão' | 'Luxo' | null;
  listingStatus: 'active' | 'inactive' | 'sold';
  capturedAt: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface OpuraMarketDevelopment {
  id: string;
  cityId: string;
  neighborhoodId: string | null;
  name: string;
  developer: string;
  address: string | null;
  unitsTotal: number;
  areaAverage: number | null;
  ticketAverage: number | null;
  pricePerM2Average: number | null;
  constructionStandard: 'Econômico' | 'Médio' | 'Médio-Alto' | 'Alto Padrão' | 'Luxo' | null;
  launchDate: string | null;
  status: 'lancamento' | 'construcao' | 'pronto';
  geom: any; // GeoJSON Point
  createdAt: string;
  updatedAt: string;
}

export interface OpuraMarketTerrainStudy {
  id: string;
  organizationId: string;
  name: string;
  address: string | null;
  terrainArea: number;
  coefficientsZone: Record<string, any> | null;
  analysisRadiusMeters: number;
  latitude: number;
  longitude: number;
  recommendedProductMix: {
    tipologias: Array<{ tipo: string; area: number; mix: number }>;
    ticketSugerido: number;
  } | null;
  recommendedStandard: 'Econômico' | 'Médio' | 'Médio-Alto' | 'Alto Padrão' | 'Luxo' | null;
  estimatedVgv: number | null;
  estimatedAbsorptionVelocity: number | null;
  riskScore: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpuraMarketMonitoredCompetitor {
  id: string;
  organizationId: string;
  studyId: string;
  developmentId: string | null;
  listingId: string | null;
  customName: string | null;
  customPrice: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface OpuraMarketNeighborhoodHistory {
  id: string;
  neighborhoodId: string;
  recordedDate: string;
  pricePerM2Medio: number;
  ticketMedio: number;
  competitorsCount: number;
  createdAt?: string;
}

export interface OpuraMarketRule {
  standard: 'Econômico' | 'Médio' | 'Médio-Alto' | 'Alto Padrão' | 'Luxo';
  minPrice: number;
  maxPrice: number | null;
  tipologias: Array<{ tipo: string; area: number; mix: number }>;
}

export interface OpuraMarketCityConfig {
  id?: string;
  organizationId: string;
  cityId: string;
  rules: OpuraMarketRule[];
  createdAt?: string;
  updatedAt?: string;
}

