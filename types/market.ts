export interface OpuraMarketCity {
  id: string;
  name: string;
  state: string;
  country: string;
  isActive: boolean;
  /** Onde o mapa abre quando a cidade é escolhida (cadastro de praça, Fase 4). */
  centerLat: number | null;
  centerLng: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpuraMarketNeighborhood {
  id: string;
  cityId: string;
  name: string;
  // Indicadores do "DNA do Bairro". null = não calculado: os valores da seed de
  // junho/2026 eram fictícios e foram apagados em 07/10/2026; o cálculo real
  // volta depois do cadastro de bairros (plano 2026-10-07, item 2.4).
  bairroScore: number | null;
  ticketMedio: number | null;
  pricePerM2Medio: number | null;
  areaMedia: number | null;
  dominantTypology: string | null;
  predominantStandard: 'Econômico' | 'Médio' | 'Médio-Alto' | 'Alto Padrão' | 'Luxo' | null;
  saturationLevel: 'Escassez' | 'Saudável' | 'Atenção' | 'Saturado' | null;
  potentialScore: number | null;
  competitorsCount: number | null;
  geom: any; // WKB hexadecimal vindo do PostgREST — a tela usa centroidLat/centroidLng
  /** Centro do bairro, gerado do geom no banco. null = bairro sem ponto. */
  centroidLat: number | null;
  centroidLng: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpuraMarketListing {
  id: string;
  cityId: string;
  neighborhoodId: string | null;
  organizationId?: string | null;
  parentListingId?: string | null;
  /** Nome do bairro como veio da origem; neighborhoodId só existe quando casa exato com um cadastrado. */
  neighborhoodNameRaw?: string | null;
  /** De onde veio a coordenada: fonte (feed), endereco (rua), bairro, nao_encontrado; null sem coordenada = pendente. */
  /** 'manual' = posição marcada por um usuário no mapa (plano 2026-10-10, item 2). */
  geoPrecision?: 'fonte' | 'manual' | 'endereco' | 'rua' | 'bairro' | 'nao_encontrado' | null;
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

/** Saída de get_terrain_radius_statistics, como o service a devolve. */
export interface OpuraMarketRadiusStats {
  totalListings: number;
  pricePerM2Avg: number;
  ticketAvg: number;
  areaAvg: number;
  bedroomsAvg: number;
  suitesAvg: number;
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
  polygonGeom?: [number, number][] | null;
  /** Estatísticas reais do raio no momento da análise. null = estudo salvo antes de 07/10/2026. */
  radiusStats?: OpuraMarketRadiusStats | null;
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


/** DNA do bairro calculado na leitura (get_market_neighborhood_stats, Fase 4.5). */
export interface OpuraMarketNeighborhoodStats {
  neighborhoodId: string;
  total: number;
  pricePerM2Avg: number | null;
  ticketAvg: number | null;
  areaAvg: number | null;
  /** Tipo + dormitórios mais anunciado, ex.: "Apartamento 2 dorm.". */
  tipologia: string | null;
}

/** Um mês da série de preço ofertado do bairro (get_market_neighborhood_series). */
export interface OpuraMarketNeighborhoodSerie {
  mes: string;
  pricePerM2Avg: number | null;
  total: number;
}
