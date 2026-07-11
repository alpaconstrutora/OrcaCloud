import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// 1. Carrega variáveis de ambiente do .env
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://oxedkknreghxrgenyjiu.supabase.co';
// Usamos a chave anon padrão se a env VITE_SUPABASE_ANON_KEY não estiver no processo
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IgIC72BIXClNix4ARLo0QA_0UGDrnzW';

const supabase = createClient(supabaseUrl, supabaseKey);

// Configurações
const CITY_NAME = 'Cambuí';
const BASE_URL = 'https://conexao381.com.br';
const TARGET_URL = `${BASE_URL}/imoveis/a-venda/cambui-mg`;
const IMOBILIARIA_NAME = 'Conexão 381';

// Função auxiliar de delay para respeitar rate limits (Nominatim e requisições no portal)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Função de geocodificação via Nominatim OpenStreetMap
async function geocode(neighborhood, city) {
  try {
    const query = encodeURIComponent(`${neighborhood}, ${city}, Minas Gerais, Brazil`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'OpuraMarketScraper/1.0 (contato@opura.com.br)'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
    return null;
  } catch (err) {
    console.error(`[GEOCODE ERROR] Falha ao geocodificar ${neighborhood}:`, err.message);
    return null;
  }
}

// Lógica de verificação de duplicatas por proximidade, quartos e área
const isDuplicate = (lat1, lng1, lat2, lng2, bed1, bed2, area1, area2) => {
  const a1 = Number(area1 || 0);
  const a2 = Number(area2 || 0);

  if (!lat1 || !lng1 || !lat2 || !lng2) {
    return bed1 === bed2 && Math.abs(a1 - a2) / Math.max(a1, a2, 1) <= 0.01;
  }

  if (bed1 !== bed2) return false;

  const areaDiffPct = Math.abs(a1 - a2) / Math.max(a1, a2, 1);
  if (areaDiffPct > 0.02) return false;

  const dLat = lat1 - lat2;
  const dLng = lng1 - lng2;
  const distanceMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111000;

  return distanceMeters < 50;
};

async function main() {
  console.log(`[SCRAPER] Iniciando Web Scraping de ${IMOBILIARIA_NAME} em ${CITY_NAME}...`);

  // 1. Efetuar Login de Desenvolvimento
  console.log('[SUPABASE] Autenticando usuário...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'altair.rosa@alpaconstrutora.com.br',
    password: 'coiote'
  });

  if (authError) {
    console.error('[SUPABASE ERROR] Erro ao autenticar:', authError.message);
    return;
  }
  console.log('[SUPABASE] Autenticado com sucesso!');

  // 2. Buscar Organização
  const { data: memberData } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('email', 'altair.rosa@alpaconstrutora.com.br')
    .limit(1);

  if (!memberData || memberData.length === 0) {
    console.error('[SUPABASE ERROR] Organização do usuário não encontrada.');
    return;
  }
  const organizationId = memberData[0].organization_id;

  // 3. Buscar Cidade (Cambuí)
  const { data: cityData } = await supabase
    .from('opura_market_cities')
    .select('id')
    .eq('name', CITY_NAME)
    .limit(1);

  if (!cityData || cityData.length === 0) {
    console.error(`[SUPABASE ERROR] Cidade ${CITY_NAME} não encontrada nas tabelas do Market.`);
    return;
  }
  const cityId = cityData[0].id;

  // 4. Buscar Bairros de Cambuí cadastrados no banco
  const { data: neighborhoods } = await supabase
    .from('opura_market_neighborhoods')
    .select('id, name')
    .eq('city_id', cityId);

  const neighborhoodsMap = new Map(neighborhoods.map((n) => [n.name.toLowerCase().trim(), n.id]));
  console.log(`[SUPABASE] Carregados ${neighborhoods.length} bairros para associação.`);

  // 5. Iniciar crawling de páginas (MVP: limitamos a 2 páginas para teste demonstrativo)
  const listingsBatch = [];
  const maxPages = 2;

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = `${TARGET_URL}?pagina=${page}`;
    console.log(`[CRAWLER] Baixando página ${page}: ${pageUrl}`);
    
    try {
      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        console.error(`[CRAWLER ERROR] Erro HTTP ${response.status} na página ${page}`);
        break;
      }

      const html = await response.text();
      console.log(`[CRAWLER] Tamanho do HTML recebido: ${html.length} bytes`);
      
      // Higieniza quebras de linha literais em valores de string JSON
      const sanitizeJsonString = (rawJson) => {
        return rawJson.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (m, p1) => {
          return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
        });
      };

      // Encontra todos os blocos JSON-LD de tipologia Schema.org de forma extremamente flexível
      const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']\s*[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      let pageCount = 0;

      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const rawText = match[1].trim();
          let json;
          try {
            json = JSON.parse(rawText);
          } catch (pe) {
            // Tenta o parsing com higienização de quebras de linha brutas
            json = JSON.parse(sanitizeJsonString(rawText));
          }
          
          // Verifica se o JSON é um imóvel estruturado
          const isProperty = json && (
            json['@type'] === 'Product' || 
            (Array.isArray(json['@type']) && json['@type'].includes('Product')) ||
            (typeof json['@type'] === 'string' && json['@type'].includes('Product')) ||
            json.offers
          );

          if (isProperty) {
            // Extrai as variáveis
            const title = json.name || '';
            const price = json.offers?.price ? Number(json.offers.price) : null;
            const url = json.offers?.url || '';
            const bedrooms = json.numberOfBedrooms ? Number(json.numberOfBedrooms) : 0;
            const bathrooms = json.numberOfBathroomsTotal ? Number(json.numberOfBathroomsTotal) : 0;
            const description = json.description || '';

            // Determinar o Bairro
            let rawAddress = json.address?.streetAddress || '';
            let neighborhoodName = 'Centro'; // Fallback padrão
            if (rawAddress.includes(',')) {
              neighborhoodName = rawAddress.split(',')[0].trim();
            } else {
              neighborhoodName = rawAddress.replace('-MG', '').replace('Cambuí', '').trim();
            }

            // Determinar a área em m² via URL
            const areaMatch = url.match(/-(\d+)m2-/);
            const areaPrivate = areaMatch ? Number(areaMatch[1]) : null;

            // Determinar o tipo de imóvel com base na URL
            let propertyType = 'Casa';
            if (url.includes('apartamento')) propertyType = 'Apartamento';
            else if (url.includes('terreno') || url.includes('lote')) propertyType = 'Terreno';
            else if (url.includes('sobrado')) propertyType = 'Casa';
            else if (url.includes('comercial') || url.includes('sala')) propertyType = 'Comercial';

            // Determinar padrão construtivo básico pela descrição
            let constructionStandard = 'Médio';
            const descLower = description.toLowerCase();
            if (descLower.includes('alto padrão') || descLower.includes('luxo') || descLower.includes('fino acabamento')) {
              constructionStandard = 'Alto Padrão';
            } else if (descLower.includes('popular') || descLower.includes('minha casa minha vida') || descLower.includes('mcmv')) {
              constructionStandard = 'Econômico';
            }

            listingsBatch.push({
              title,
              price,
              url,
              bedrooms,
              bathrooms,
              description,
              neighborhoodName,
              areaPrivate,
              propertyType,
              constructionStandard,
              rawAddress
            });
            pageCount++;
          }
        } catch (e) {
          // Ignora outros blocos JSON-LD que não possuem a estrutura de imóveis
        }
      }

      console.log(`[CRAWLER] Localizados ${pageCount} imóveis na página ${page}.`);
      if (pageCount === 0) break; // Sem anúncios na página, encerra o crawler
    } catch (err) {
      console.error(`[CRAWLER ERROR] Falha ao ler página ${page}:`, err.message);
      break;
    }

    // Delay curto entre páginas
    await sleep(800);
  }

  console.log(`\n[SCRAPER] Total de anúncios capturados para processamento: ${listingsBatch.length}`);

  // 6. Geocodificação e Associação de Bairros
  const processedListings = [];
  
  for (let i = 0; i < listingsBatch.length; i++) {
    const item = listingsBatch[i];
    console.log(`[GEOCODING] (${i + 1}/${listingsBatch.length}) Processando: ${item.title}`);

    // Mapear ou cadastrar bairro no banco
    let neighborhoodId = neighborhoodsMap.get(item.neighborhoodName.toLowerCase().trim());
    
    if (!neighborhoodId) {
      // Cria o novo bairro dinamicamente
      console.log(`[SUPABASE] Bairro "${item.neighborhoodName}" não cadastrado. Criando...`);
      const { data: newNeigh, error: neighError } = await supabase
        .from('opura_market_neighborhoods')
        .insert({
          city_id: cityId,
          name: item.neighborhoodName,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (!neighError && newNeigh) {
        neighborhoodId = newNeigh.id;
        neighborhoodsMap.set(item.neighborhoodName.toLowerCase().trim(), neighborhoodId);
      } else {
        // Fallback para o primeiro bairro disponível ou Centro
        neighborhoodId = neighborhoods[0]?.id;
      }
    }

    // Geocodificação reativa via Nominatim
    console.log(`[NOMINATIM] Geocodificando bairro: ${item.neighborhoodName}`);
    const geo = await geocode(item.neighborhoodName, CITY_NAME);
    
    // Respeita rate limit da API gratuita do Nominatim (1 req/s)
    await sleep(1100);

    processedListings.push({
      cityId,
      neighborhoodId,
      organizationId,
      source: IMOBILIARIA_NAME,
      sourceUrl: item.url,
      propertyType: item.propertyType,
      address: item.rawAddress,
      zipCode: null,
      areaPrivate: item.areaPrivate,
      areaTotal: item.areaPrivate,
      bedrooms: item.bedrooms,
      suites: null,
      bathrooms: item.bathrooms,
      parkingSpaces: null,
      price: item.price,
      condoFee: null,
      iptu: null,
      latitude: geo ? geo.lat : null,
      longitude: geo ? geo.lng : null,
      description: item.description,
      constructionStandard: item.constructionStandard,
      listingStatus: 'active',
      capturedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    });
  }

  // 7. Salvar e Deduplicar contra o Banco de Dados
  console.log(`\n[SUPABASE] Iniciando inserção e deduplicação de ${processedListings.length} anúncios...`);

  // Busca os anúncios existentes desse bairro/cidade
  const { data: existingDbListings } = await supabase
    .from('opura_market_listings')
    .select('id, latitude, longitude, bedrooms, area_private, price')
    .eq('city_id', cityId);

  const uniqueListingsPayload = [];
  let deduplicatedCount = 0;
  let ignoredCount = 0;

  for (const l of processedListings) {
    // Ignorar anúncios que não possuem preço de venda explícito
    if (!l.price || l.price <= 0) {
      ignoredCount++;
      continue;
    }

    // Verificar duplicatas no lote atual
    const existsInPayload = uniqueListingsPayload.some((ul) =>
      isDuplicate(
        l.latitude, l.longitude,
        ul.latitude, ul.longitude,
        l.bedrooms, ul.bedrooms,
        l.areaPrivate, ul.areaPrivate
      )
    );

    if (existsInPayload) {
      deduplicatedCount++;
      continue;
    }

    // Verificar duplicatas contra o banco
    const existsInDb = (existingDbListings || []).some((el) =>
      isDuplicate(
        l.latitude, l.longitude,
        el.latitude ? Number(el.latitude) : null,
        el.longitude ? Number(el.longitude) : null,
        l.bedrooms, el.bedrooms,
        el.area_private ? Number(el.area_private) : 0,
        l.areaPrivate
      )
    );

    if (existsInDb) {
      deduplicatedCount++;
      continue;
    }

    uniqueListingsPayload.push({
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
      description: l.description,
      construction_standard: l.constructionStandard,
      listing_status: l.listingStatus,
      captured_at: l.capturedAt,
      last_seen_at: l.lastSeenAt
    });
  }

  console.log(`[SUPABASE] Total final após deduplicação:`);
  console.log(`- Novos anúncios a serem inseridos: ${uniqueListingsPayload.length}`);
  console.log(`- Anúncios duplicados detectados e ignorados: ${deduplicatedCount}`);
  console.log(`- Anúncios sem preço ignorados: ${ignoredCount}`);

  if (uniqueListingsPayload.length > 0) {
    const { error: insertError } = await supabase
      .from('opura_market_listings')
      .insert(uniqueListingsPayload);

    if (insertError) {
      console.error('[SUPABASE ERROR] Falha ao inserir anúncios no banco:', insertError.message);
    } else {
      console.log('🟢 SUCESSO: Anúncios importados com sucesso!');
    }
  } else {
    console.log('🟡 AVISO: Nenhum anúncio novo para inserir (todos eram duplicados).');
  }
}

main();
