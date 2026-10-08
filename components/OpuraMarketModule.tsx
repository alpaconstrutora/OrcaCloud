import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { opuraMarketService, ResultadoImportacaoMercado } from '../services/opuraMarketService';
import { imovibService } from '../services/imovibService';
import { supabase } from '../lib/supabase';
import {
  OpuraMarketCity,
  OpuraMarketNeighborhood,
  OpuraMarketTerrainStudy,
  OpuraMarketListing,
  OpuraMarketNeighborhoodStats,
  OpuraMarketNeighborhoodSerie,
  OpuraMarketCityConfig
} from '../types';
import { ImportListingsModal } from './ImportListingsModal';
import MarketPracaSheet from './market/MarketPracaSheet';
import {
  calcularVocacao,
  validarHipoteses,
  hipotesesDoEstudo,
  HIPOTESES_PADRAO,
  DESCRICAO_HIPOTESES,
  type HipotesesVocacao,
} from '../utils/opuraMarketVocacao';

/**
 * Texto que entra em HTML do Leaflet (tooltip, divIcon). Nome de bairro e
 * endereço podem vir de feed de terceiros (Fase 3): sem escapar, um feed
 * conseguiria injetar HTML na tela. O check-xss-sinks.sh não enxerga esse caso
 * porque quem interpreta a string é o Leaflet.
 */
const escHtml = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
import { CityRulesModal } from './CityRulesModal';
import Button from './ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import { useTableColumns, ColumnConfigButton, SortableHeader, ColumnConfig } from './ui/TableUtils';

const CONCORRENCIA_COLUMNS: ColumnConfig[] = [
  { key: 'propertyType', label: 'Tipo', sortable: true },
  { key: 'neighborhood', label: 'Bairro', sortable: true },
  { key: 'price', label: 'Preço (R$)', sortable: true },
  { key: 'pricePerM2', label: 'R$/m²', sortable: true },
  { key: 'areaPrivate', label: 'Área Priv. (m²)', sortable: true },
  { key: 'bedrooms', label: 'Dormitórios', sortable: true },
  { key: 'suites', label: 'Suítes', sortable: true },
  { key: 'bathrooms', label: 'Banheiros', sortable: true },
  { key: 'parkingSpaces', label: 'Vagas', sortable: true },
  { key: 'source', label: 'Fonte', sortable: true },
  { key: 'constructionStandard', label: 'Padrão', sortable: true },
];

// Header (label/sortable/className) por chave — as duas tabelas de Concorrência
// (anúncios importados e resultados do scraper) compartilham as mesmas colunas.
const CONCORRENCIA_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> =
  Object.fromEntries(CONCORRENCIA_COLUMNS.map(col => [col.key, {
    label: col.label,
    sortable: col.sortable,
    className: 'px-5 py-3 text-xs font-bold text-slate-500 text-left border-r border-gray-100 last:border-r-0',
  }]));

// Conteúdo de cada célula da tabela de Concorrência, extraído do <td> original
// (compartilhado pelas duas tabelas — anúncios importados e scraper).
function renderConcorrenciaCell(key: string, l: OpuraMarketListing, neighborhoods: OpuraMarketNeighborhood[]): React.ReactNode {
  switch (key) {
    case 'propertyType':
      return <span className="text-sm font-normal text-gray-700 truncate">{l.propertyType}</span>;
    case 'neighborhood':
      return <span className="text-sm font-normal text-gray-700 truncate">{neighborhoods.find(n => n.id === l.neighborhoodId)?.name || l.neighborhoodNameRaw || 'Não informado'}</span>;
    case 'price':
      return <span className="text-sm font-medium text-gray-800">R$ {l.price.toLocaleString('pt-BR')}</span>;
    case 'pricePerM2':
      return <span className="text-sm font-medium text-gray-800">{l.pricePerM2 ? `R$ ${Math.round(l.pricePerM2).toLocaleString('pt-BR')}/m²` : '-'}</span>;
    case 'areaPrivate':
      return <span className="text-sm font-normal text-gray-600">{l.areaPrivate ? `${l.areaPrivate}m²` : '-'}</span>;
    case 'bedrooms':
      return <span className="text-sm font-normal text-gray-600">{l.bedrooms || '-'}</span>;
    case 'suites':
      return <span className="text-sm font-normal text-gray-600">{l.suites || '-'}</span>;
    case 'bathrooms':
      return <span className="text-sm font-normal text-gray-600">{l.bathrooms || '-'}</span>;
    case 'parkingSpaces':
      return <span className="text-sm font-normal text-gray-600">{l.parkingSpaces || '-'}</span>;
    case 'source':
      return (
        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-bold rounded uppercase">
          {l.source}
        </span>
      );
    case 'constructionStandard':
      return l.constructionStandard ? (
        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold rounded uppercase">
          {l.constructionStandard}
        </span>
      ) : <span className="text-sm font-normal text-gray-600">-</span>;
    default:
      return null;
  }
}

interface OpuraMarketModuleProps {
  organizationId: string;
  onBack?: () => void;
  setActiveView?: (view: string) => void;
}

const OpuraMarketModule: React.FC<OpuraMarketModuleProps> = ({
  organizationId,
  onBack,
  setActiveView
}) => {
  // Referência para o container DOM do mapa Leaflet
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<L.Map | null>(null);
  const markersLayerRef = React.useRef<L.FeatureGroup | null>(null);

  // Estado reativo para a instância do mapa do Leaflet
  const [mapInstance, setMapInstance] = React.useState<L.Map | null>(null);

  // Estados de dados
  const [loading, setLoading] = React.useState(true);
  const [cities, setCities] = React.useState<OpuraMarketCity[]>([]);
  const [selectedCityId, setSelectedCityId] = React.useState<string>('');
  const [neighborhoods, setNeighborhoods] = React.useState<OpuraMarketNeighborhood[]>([]);
  const [selectedNeighborhood, setSelectedNeighborhood] = React.useState<OpuraMarketNeighborhood | null>(null);
  
  // Estado para os anúncios (pesquisas de concorrência)
  const [listings, setListings] = React.useState<OpuraMarketListing[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [selectedDetailedListing, setSelectedDetailedListing] = React.useState<OpuraMarketListing | null>(null);
  
  // Estado para o histórico do bairro
  const [serieDoBairro, setSerieDoBairro] = React.useState<OpuraMarketNeighborhoodSerie[]>([]);
  // DNA do bairro calculado na leitura (Fase 4.5), por id do bairro.
  const [statsPorBairro, setStatsPorBairro] = React.useState<Record<string, OpuraMarketNeighborhoodStats>>({});
  // Cadastro de praça (Fase 4.4): só o superadministrador da plataforma.
  const [ehSuperadmin, setEhSuperadmin] = React.useState(false);
  const [pracaAberta, setPracaAberta] = React.useState(false);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  // Configurações e regras personalizadas da praça/cidade
  const [cityConfig, setCityConfig] = React.useState<OpuraMarketCityConfig | null>(null);
  const [loadingCityConfig, setLoadingCityConfig] = React.useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = React.useState(false);
  const [activeViewMode, setActiveViewMode] = React.useState<'map' | 'table' | 'feed' | 'studies'>('map');
  // Importação por feed XML (decisão D7 do plano 2026-10-07): substitui o robô.
  const [feedUrl, setFeedUrl] = React.useState('');
  const [feedArquivo, setFeedArquivo] = React.useState<File | null>(null);
  const [importandoFeed, setImportandoFeed] = React.useState(false);
  const [localizando, setLocalizando] = React.useState(false);
  const [resultadoFeed, setResultadoFeed] = React.useState<string | null>(null);
  const tableColumns = useTableColumns(CONCORRENCIA_COLUMNS, 'opuraMarketConcorrenciaTable');

  // Carrega configurações da praça selecionada
  const loadCityRules = React.useCallback(async (cityId: string) => {
    if (!cityId || !organizationId) {
      setCityConfig(null);
      return;
    }
    try {
      setLoadingCityConfig(true);
      const config = await opuraMarketService.getCityConfig(organizationId, cityId);
      setCityConfig(config);
    } catch (err) {
      console.error('Erro ao buscar configurações da cidade:', err);
    } finally {
      setLoadingCityConfig(false);
    }
  }, [organizationId]);

  // Carrega anúncios da cidade selecionada
  const loadListings = async (cityId: string) => {
    try {
      const [data, stats] = await Promise.all([
        opuraMarketService.listListings(cityId),
        opuraMarketService.getNeighborhoodStats(cityId),
      ]);
      setListings(data);
      setStatsPorBairro(Object.fromEntries(stats.map(s => [s.neighborhoodId, s])));
    } catch (err) {
      console.error('Erro ao buscar anúncios reais:', err);
    }
  };

  // Callback após importação de planilha com sucesso
  const handleImportSuccess = async () => {
    if (selectedCityId) {
      await loadNeighborhoods(selectedCityId);
      await loadListings(selectedCityId);
    }
    setTerrainPin(null);
    setAnalysisResult(null);
    setActiveLayer('concorrencia'); // Altera para a camada de concorrência para exibir os pins imediatamente
  };
  
  // Estados do mapa e filtros
  const [activeLayer, setActiveLayer] = React.useState<'preco' | 'saturacao' | 'concorrencia' | 'oportunidade'>('preco');
  const [terrainPin, setTerrainPin] = React.useState<{ lat: number; lng: number } | null>(null);
  
  // Estados para desenho de polígono de terreno
  const [isDrawingPolygon, setIsDrawingPolygon] = React.useState(false);
  const [drawingPoints, setDrawingPoints] = React.useState<[number, number][]>([]);
  const [polygonPoints, setPolygonPoints] = React.useState<[number, number][] | null>(null);
  
  // Estados para simulação de Análise de Terreno
  const [studyName, setStudyName] = React.useState('');
  const [terrainArea, setTerrainArea] = React.useState('1500');
  const [analysisRadius, setAnalysisRadius] = React.useState('1000');
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<any | null>(null);
  // Folgas do cálculo de vocação, editáveis na tela (Fase 5). Padrão = os números
  // que antes eram constantes no código.
  const [hipoteses, setHipoteses] = React.useState<HipotesesVocacao>(HIPOTESES_PADRAO);
  const errosHipoteses = validarHipoteses(hipoteses);
  const hipotesesAlteradas = DESCRICAO_HIPOTESES.filter(d => hipoteses[d.chave] !== HIPOTESES_PADRAO[d.chave]).length;
  // Hipóteses de um resultado: as que ele carrega, ou as da tela.
  const hipotesesDoResultado = (r: any): HipotesesVocacao => r?.hipoteses ?? hipoteses;

  // Mudou hipótese, área ou regra da praça: refaz o cálculo sobre as MESMAS
  // estatísticas do raio, sem nova consulta.
  React.useEffect(() => {
    setAnalysisResult((prev: any) => {
      if (!prev?.stats || validarHipoteses(hipoteses).length > 0) return prev;
      const area = parseFloat(terrainArea);
      if (!(area > 0)) return prev;
      return calcularVocacao(prev.stats, area, cityConfig?.rules, hipoteses);
    });
  }, [hipoteses, terrainArea, cityConfig]);
  
  // Estudos salvos
  const [savedStudies, setSavedStudies] = React.useState<OpuraMarketTerrainStudy[]>([]);
  const [loadingStudies, setLoadingStudies] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'analise' | 'estudos' | 'anuncios'>('analise');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterSource, setFilterSource] = React.useState('Todos');
  
  const radiusMeters = analysisRadius;

  // Cidade escolhida no seletor. Antes o módulo tinha o centro da cidade piloto,
  // escrito no código (a Fase 4 do plano tirou isso).
  const cidadeAtual = cities.find(c => c.id === selectedCityId) ?? null;
  const nomeDaCidade = cidadeAtual ? `${cidadeAtual.name} - ${cidadeAtual.state}` : '';

  // Carregar cidades e bairros iniciais (Estritamente Leitura - Seed delegado à migração SQL)
  const loadInitialData = React.useCallback(async () => {
    try {
      setLoading(true);
      const citiesList = await opuraMarketService.listCities();
      setCities(citiesList);

      if (citiesList.length > 0) {
        const defaultCity = citiesList[0];
        setSelectedCityId(defaultCity.id);
        await loadNeighborhoods(defaultCity.id);
        await loadListings(defaultCity.id);
        await loadCityRules(defaultCity.id);
      }
    } catch (err) {
      console.error('Erro ao carregar cidades do ÒPURA Market:', err);
    } finally {
      setLoading(false);
    }
  }, [loadCityRules]);

  // Carrega bairros da cidade selecionada
  const loadNeighborhoods = async (cityId: string) => {
    try {
      const neighData = await opuraMarketService.listNeighborhoods(cityId);
      setNeighborhoods(neighData);
      if (neighData.length > 0) {
        setSelectedNeighborhood(neighData[0]);
      }
    } catch (err) {
      console.error('Erro ao buscar bairros:', err);
    }
  };

  // Carregar estudos privados de terrenos
  const loadSavedStudies = React.useCallback(async () => {
    try {
      setLoadingStudies(true);
      const studies = await opuraMarketService.listTerrainStudies(organizationId);
      setSavedStudies(studies);
    } catch (err) {
      console.error('Erro ao buscar estudos salvos:', err);
    } finally {
      setLoadingStudies(false);
    }
  }, [organizationId]);

  // Importação por feed XML (decisão D7 do plano 2026-10-07-opura-market-intelligence.md).
  // O robô antigo lia o portal de UMA imobiliária no navegador, por proxies de CORS de
  // terceiros, e parou de achar anúncios quando o portal mudou. Agora a Edge Function
  // opura-market-import lê o feed, geocodifica pelo endereço e grava no servidor.
  const descreverResultado = (r: ResultadoImportacaoMercado): string => {
    const partes = [`Anúncios novos: ${r.novos}`];
    if (r.atualizados) partes.push(`já importados, com preço atualizado: ${r.atualizados}`);
    if (r.duplicados) partes.push(`repetidos de anúncios que já existiam: ${r.duplicados}`);
    if (r.semLocalizacao) partes.push(`endereço não encontrado: ${r.semLocalizacao}`);
    if (r.pendentes) partes.push(`ainda sem localização por limite de tempo: ${r.pendentes} (use "Localizar anúncios sem coordenada")`);
    const ignorados = Object.entries(r.ignorados ?? {}).map(([motivo, n]) => `${n} ${motivo}`);
    if (ignorados.length) partes.push(`ignorados: ${ignorados.join(', ')}`);
    return partes.join(' · ');
  };

  const handleImportarFeed = async () => {
    if (!organizationId) {
      alert('Selecione uma organização no topo da tela: os anúncios são gravados nela.');
      return;
    }
    if (!selectedCityId) {
      alert('Selecione a cidade.');
      return;
    }
    if (!feedArquivo && !feedUrl.trim()) {
      alert('Informe o link do feed ou escolha o arquivo .xml.');
      return;
    }
    setImportandoFeed(true);
    setResultadoFeed(null);
    try {
      const origem = feedArquivo ? { feedXml: await feedArquivo.text() } : { feedUrl: feedUrl.trim() };
      const r = await opuraMarketService.importarFeed(organizationId, selectedCityId, origem);
      setResultadoFeed(descreverResultado(r));
      await loadListings(selectedCityId);
    } catch (err: any) {
      console.error('Falha ao importar o feed:', err);
      setResultadoFeed(`Erro: ${err.message || 'falha inesperada'}`);
    } finally {
      setImportandoFeed(false);
    }
  };

  const handleLocalizarPendentes = async () => {
    if (!organizationId || !selectedCityId) return;
    setLocalizando(true);
    setResultadoFeed(null);
    try {
      const r = await opuraMarketService.localizarPendentes(organizationId, selectedCityId);
      const partes = [`Localizados: ${r.localizados}`, `endereço não encontrado: ${r.naoEncontrados}`];
      if (r.restantes) partes.push(`restantes, rode de novo: ${r.restantes}`);
      setResultadoFeed(partes.join(' · '));
      await loadListings(selectedCityId);
    } catch (err: any) {
      console.error('Falha ao localizar anúncios:', err);
      setResultadoFeed(`Erro: ${err.message || 'falha inesperada'}`);
    } finally {
      setLocalizando(false);
    }
  };

  // Anúncios da organização nesta cidade sem coordenada e sem tentativa registrada.
  const pendentesDeLocalizacao = listings.filter(
    l => l.organizationId === organizationId && l.latitude == null && !l.geoPrecision
  ).length;

  const startDrawing = () => {
    setIsDrawingPolygon(true);
    setDrawingPoints([]);
    setPolygonPoints(null);
    setTerrainPin(null);
    setAnalysisResult(null);
  };

  const cancelDrawing = () => {
    setIsDrawingPolygon(false);
    setDrawingPoints([]);
  };

  const completeDrawing = async () => {
    if (drawingPoints.length < 3) {
      alert('Desenhe pelo menos 3 pontos no mapa para formar o polígono do terreno.');
      return;
    }

    try {
      setAnalyzing(true);
      
      // Converte a lista de pontos [lat, lng] (Leaflet) para GeoJSON Polygon [[[lng, lat], [lng, lat], ...]]
      // PostGIS e a RPC exigem o formato [lng, lat]
      const geojsonCoords = drawingPoints.map(p => [p[1], p[0]]);
      // Fecha o polígono no GeoJSON (o primeiro e o último elemento devem ser idênticos)
      geojsonCoords.push([drawingPoints[0][1], drawingPoints[0][0]]);

      const geojson = {
        type: "Polygon",
        coordinates: [geojsonCoords]
      };

      console.log('Enviando GeoJSON para a RPC de cálculo de área:', geojson);
      const calculatedArea = await opuraMarketService.calculatePolygonArea(geojson);
      
      setTerrainArea(calculatedArea.toString());
      setPolygonPoints(drawingPoints);

      // Calcula o centroide médio do polígono para servir como o pino de análise (terrainPin)
      let totalLat = 0;
      let totalLng = 0;
      drawingPoints.forEach(p => {
        totalLat += p[0];
        totalLng += p[1];
      });
      const centerLat = totalLat / drawingPoints.length;
      const centerLng = totalLng / drawingPoints.length;
      setTerrainPin({ lat: centerLat, lng: centerLng });
      
      // Limpa estado de desenho
      setIsDrawingPolygon(false);
      setDrawingPoints([]);

      setStudyName(`Estudo Terreno - Polígono ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);

      // Centraliza o mapa no centroide
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([centerLat, centerLng], 16);
      }

      // Redireciona o usuário de volta para a tela de Estudos após 1 segundo
      setTimeout(() => {
        setActiveViewMode('studies');
      }, 1000);
    } catch (err: any) {
      console.error('Erro ao calcular a área do polígono:', err);
      alert('Não foi possível calcular a área do polígono: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  React.useEffect(() => {
    loadInitialData();
    loadSavedStudies();
  }, [loadInitialData, loadSavedStudies]);

  // Referência atualizada dos bairros para uso no evento de clique
  const neighborhoodsRef = React.useRef(neighborhoods);
  React.useEffect(() => {
    neighborhoodsRef.current = neighborhoods;
  }, [neighborhoods]);

  // Superadministrador da plataforma vê "Cadastrar praça" (Fase 4.4). O botão é
  // só conveniência: quem barra a escrita é a policy com is_superadmin().
  React.useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => opuraMarketService.ehSuperadmin(data.user?.email))
      .then(setEhSuperadmin)
      .catch(() => setEhSuperadmin(false));
  }, []);

  // Carrega a evolução de preço do bairro selecionado (mês a mês, pela captura)
  React.useEffect(() => {
    const loadHistory = async () => {
      if (!selectedNeighborhood) return;
      try {
        setLoadingHistory(true);
        const serie = await opuraMarketService.getNeighborhoodSeries(selectedNeighborhood.id);
        setSerieDoBairro(serie);
      } catch (err) {
        console.error('Erro ao buscar histórico do bairro:', err);
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, [selectedNeighborhood]);

  const isDrawingPolygonRef = React.useRef(isDrawingPolygon);
  const drawingPointsRef = React.useRef(drawingPoints);

  React.useEffect(() => {
    isDrawingPolygonRef.current = isDrawingPolygon;
  }, [isDrawingPolygon]);

  React.useEffect(() => {
    drawingPointsRef.current = drawingPoints;
  }, [drawingPoints]);

  // Inicializar o mapa Leaflet quando o loading for concluído e o contêiner estiver no DOM
  React.useEffect(() => {
    if (loading || !mapContainerRef.current || mapInstanceRef.current) return;

    // Abre no centro do Brasil; o efeito "enquadrar a cidade" leva à praça escolhida.
    const map = L.map(mapContainerRef.current, {
      center: [-15.78, -47.93],
      zoom: 4,
      zoomControl: true
    });

    mapInstanceRef.current = map;
    setMapInstance(map);

    // Camada base do OpenStreetMap Padrão (Ultra estável e livre de CORS)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // FeatureGroup para armazenar todos os pins e camadas reativas
    const markersLayer = L.featureGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    // Evento de clique no mapa para selecionar o terreno ou desenhar polígono
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      if (isDrawingPolygonRef.current) {
        setDrawingPoints(prev => [...prev, [lat, lng]]);
        return;
      }

      setTerrainPin({ lat, lng });
      setAnalysisResult(null); // Limpa resultados anteriores
      setStudyName(`Estudo Terreno - ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
      
      const currentNeighborhoods = neighborhoodsRef.current;
      if (currentNeighborhoods.length > 0) {
        let closestBairro = currentNeighborhoods[0];
        let minDistance = Infinity;

        currentNeighborhoods.forEach(n => {
          if (n.centroidLat == null || n.centroidLng == null) return; // bairro sem ponto
          // posição do bairro vem do banco (centroid_lat/centroid_lng), não do nome
          
          const dist = Math.sqrt(Math.pow(lat - n.centroidLat, 2) + Math.pow(lng - n.centroidLng, 2));
          if (dist < minDistance) {
            minDistance = dist;
            closestBairro = n;
          }
        });
        setSelectedNeighborhood(closestBairro);
      }
    });

    // Força o Leaflet a recalcular o tamanho e desenhar os tiles corretamente
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      setMapInstance(null);
      markersLayerRef.current = null;
    };
  }, [loading, activeViewMode]);

  // Atualizar marcadores e heatmaps sobre o Leaflet reativamente
  React.useEffect(() => {
    const map = mapInstance;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    // Limpa os marcadores existentes
    markersLayer.clearLayers();

    // 1. Desenhar Bairros e suas estatísticas de Heatmap
    neighborhoods.forEach(bairro => {
      if (bairro.centroidLat == null || bairro.centroidLng == null) return; // bairro sem ponto não vai ao mapa
      const bLat = bairro.centroidLat;
      const bLng = bairro.centroidLng;
      
      let layerColor = '#3B82F6'; // Azul padrão (Centro/Médio)
      let radius = 250;

      // Sem indicador calculado o bairro fica cinza. Antes, "Preço" e
      // "Oportunidades" pintavam pelo NOME do bairro (Jardim das Colinas sempre
      // verde) e "Saturação" pintava o vazio como saudável.
      const SEM_DADO = '#94A3B8';
      if (activeLayer === 'preco') {
        layerColor = statsPorBairro[bairro.id]?.pricePerM2Avg == null ? SEM_DADO : '#3B82F6';
      } else if (activeLayer === 'saturacao') {
        layerColor = bairro.saturationLevel === 'Saturado' ? '#EF4444'
          : bairro.saturationLevel === 'Atenção' ? '#F59E0B'
          : bairro.saturationLevel ? '#10B981' : SEM_DADO;
      } else if (activeLayer === 'oportunidade') {
        layerColor = bairro.potentialScore == null ? SEM_DADO : '#10B981';
      }

      // Adiciona o círculo de Heatmap
      L.circle([bLat, bLng], {
        color: layerColor,
        fillColor: layerColor,
        fillOpacity: 0.25,
        radius: radius,
        stroke: true,
        weight: 1.5,
        dashArray: '3, 4'
      })
      .bindTooltip((() => {
        const st = statsPorBairro[bairro.id];
        return st?.pricePerM2Avg == null
          ? `<b>${escHtml(bairro.name)}</b><br/>Sem anúncio ativo vinculado`
          : `<b>${escHtml(bairro.name)}</b><br/>R$ ${Math.round(st.pricePerM2Avg).toLocaleString('pt-BR')}/m² · ${st.total} anúncios`;
      })(), { permanent: false, direction: 'top' })
      .addTo(markersLayer);

      // Adiciona um DivIcon com o nome do bairro
      const textIcon = L.divIcon({
        html: `<div class="text-[9px] font-black uppercase tracking-wider text-slate-200 text-center drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.8)]">${escHtml(bairro.name)}</div>`,
        className: 'border-0 bg-transparent',
        iconSize: [80, 20],
        iconAnchor: [40, 10]
      });
      L.marker([bLat, bLng], { icon: textIcon, interactive: false }).addTo(markersLayer);
    });

    // 2. Se a camada for Concorrência, exibe pequenos pins vermelhos para anúncios mapeados
    if (activeLayer === 'concorrencia') {
      listings.forEach(l => {
        if (!l.latitude || !l.longitude) return;

        // Anúncio com dono (importado por uma organização) é verde; sem dono (global) é
        // vermelho. Comparar com a organização do topo errava em "Todas", onde ela é vazia.
        const isPrivate = l.organizationId != null;
        const colorClass = isPrivate ? 'bg-emerald-500' : 'bg-rose-500';
        const label = `<b>${escHtml(l.propertyType)}</b> - ${escHtml(l.address || 'Endereço não informado')}<br/>R$ ${l.price.toLocaleString('pt-BR')} (${l.areaPrivate}m² | ${l.bedrooms}D)`;

        const competitorIcon = L.divIcon({
          html: `<div class="w-3.5 h-3.5 rounded-full ${colorClass} border border-white shadow-md flex items-center justify-center text-[10px] text-white font-bold">🏢</div>`,
          className: 'border-0 bg-transparent',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        L.marker([l.latitude, l.longitude], { icon: competitorIcon })
          .bindTooltip(label, { direction: 'top' })
          .addTo(markersLayer);
      });
    }

    // 3. Desenhar o Pino do Terreno selecionado (ou centroide)
    if (terrainPin) {
      const pinIcon = L.divIcon({
        html: `<div class="relative flex items-center justify-center">
                 <div class="absolute w-8 h-8 rounded-full bg-blue-500/20 border border-blue-400 animate-ping"></div>
                 <div class="w-7 h-7 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-lg text-xs">📍</div>
               </div>`,
        className: 'border-0 bg-transparent',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      L.marker([terrainPin.lat, terrainPin.lng], { icon: pinIcon }).addTo(markersLayer);

      // Círculo de Raio de Análise
      L.circle([terrainPin.lat, terrainPin.lng], {
        color: '#2563EB',
        fillColor: '#3B82F6',
        fillOpacity: 0.08,
        radius: parseInt(radiusMeters),
        weight: 1.5,
        dashArray: '5, 5'
      }).addTo(markersLayer);
    }

    // 4. Desenhar polígono em modo de desenho
    if (isDrawingPolygon && drawingPoints.length > 0) {
      drawingPoints.forEach((p, idx) => {
        L.circleMarker(p, {
          radius: 5,
          color: '#4F46E5',
          fillColor: '#FFFFFF',
          fillOpacity: 1,
          weight: 2
        })
        .bindTooltip(`Vértice ${idx + 1}`, { permanent: false })
        .addTo(markersLayer);
      });

      if (drawingPoints.length >= 3) {
        L.polygon(drawingPoints, {
          color: '#4F46E5',
          fillColor: '#6366F1',
          fillOpacity: 0.3,
          weight: 2,
          dashArray: '3, 3'
        }).addTo(markersLayer);
      } else if (drawingPoints.length === 2) {
        L.polyline(drawingPoints, {
          color: '#4F46E5',
          weight: 2,
          dashArray: '3, 3'
        }).addTo(markersLayer);
      }
    }

    // 5. Desenhar o polígono definitivo do lote selecionado
    if (!isDrawingPolygon && polygonPoints && polygonPoints.length >= 3) {
      L.polygon(polygonPoints, {
        color: '#1E3A8A',
        fillColor: '#3B82F6',
        fillOpacity: 0.25,
        weight: 2.5
      })
      .bindTooltip('Área do Terreno Desenhorada', { direction: 'top' })
      .addTo(markersLayer);
    }
  }, [mapInstance, neighborhoods, listings, activeLayer, terrainPin, radiusMeters, isDrawingPolygon, drawingPoints, polygonPoints, statsPorBairro]);

  // Enquadra a cidade escolhida: os bairros com ponto, ou o centro marcado no
  // cadastro de praça. Roda ao trocar de cidade ou recarregar os bairros.
  React.useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    const pontos: [number, number][] = neighborhoods
      .filter(n => n.centroidLat != null && n.centroidLng != null)
      .map(n => [n.centroidLat as number, n.centroidLng as number]);
    if (pontos.length >= 2) {
      map.fitBounds(L.latLngBounds(pontos).pad(0.25), { maxZoom: 15 });
    } else if (cidadeAtual?.centerLat != null && cidadeAtual?.centerLng != null) {
      map.setView([cidadeAtual.centerLat, cidadeAtual.centerLng], 14);
    } else if (pontos.length === 1) {
      map.setView(pontos[0], 15);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstance, selectedCityId, neighborhoods]);

  // Executar a análise de raio PostGIS
  const handleAnalyzeTerrain = async () => {
    if (!terrainPin) {
      alert('Selecione uma área no mapa primeiro clicando em qualquer ponto.');
      return;
    }

    try {
      setAnalyzing(true);
      const radius = parseInt(radiusMeters);
      const stats = await opuraMarketService.getTerrainRadiusStats(
        terrainPin.lat,
        terrainPin.lng,
        radius
      );

      if (!stats || stats.totalListings === 0 || stats.pricePerM2Avg <= 0) {
        alert('Não foram encontrados valores de referência (anúncios concorrentes) nesta região para o raio selecionado. Importe anúncios para esta área ou aumente o raio de busca.');
        setAnalysisResult(null);
        return;
      }

      if (errosHipoteses.length > 0) {
        alert('Corrija as hipóteses do cálculo:\n' + errosHipoteses.join('\n'));
        setAnalysisResult(null);
        return;
      }
      const areaTerreno = parseFloat(terrainArea);
      if (!(areaTerreno > 0)) {
        alert('Informe a área do terreno.');
        return;
      }
      // Toda a conta mora em utils/opuraMarketVocacao.ts, com as hipóteses da tela.
      setAnalysisResult(calcularVocacao(stats, areaTerreno, cityConfig?.rules, hipoteses));
    } catch (err: any) {
      console.error(err);
      alert('Erro ao realizar análise espacial: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Salvar estudo no Supabase
  const handleSaveStudy = async () => {
    if (!terrainPin || !analysisResult || !studyName.trim()) return;

    try {
      setAnalyzing(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email || 'sistema@opura.com.br';

      await opuraMarketService.createTerrainStudy({
        organizationId,
        name: studyName,
        address: selectedNeighborhood ? `Bairro ${selectedNeighborhood.name}, ${nomeDaCidade}` : (nomeDaCidade || null),
        terrainArea: parseFloat(terrainArea),
        // As hipóteses usadas no cálculo vão junto: reabrir o estudo refaz a mesma conta.
        coefficientsZone: {
          zone: 'ZUM',
          ca: (analysisResult.hipoteses ?? hipoteses).coeficienteAproveitamento,
          to: (analysisResult.hipoteses ?? hipoteses).taxaOcupacao / 100,
          hipoteses: analysisResult.hipoteses ?? hipoteses,
        },
        analysisRadiusMeters: parseInt(radiusMeters),
        latitude: terrainPin.lat,
        longitude: terrainPin.lng,
        recommendedProductMix: analysisResult.productMix,
        recommendedStandard: analysisResult.recStandard,
        estimatedVgv: analysisResult.estimatedVgv,
        estimatedAbsorptionVelocity: analysisResult.estimatedAbsorptionVelocity,
        riskScore: analysisResult.riskScore,
        createdBy: userEmail,
        polygonGeom: polygonPoints ? polygonPoints.map(p => [p[1], p[0]] as [number, number]) : null,
        radiusStats: analysisResult.stats ?? null
      });

      alert('Estudo territorial salvo com sucesso na sua organização!');
      loadSavedStudies();
      setActiveTab('estudos');
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar estudo: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Exportar relatório de vocação em formato PDF Premium
  const handleExportPDF = async () => {
    if (!terrainPin || !analysisResult) return;
    try {
      setAnalyzing(true);
      
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;
      
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Cabeçalho Premium - Slate 900
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('ÓPURA MARKET INTELLIGENCE', 15, 18);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Relatório Executivo de Vocação e Inteligência Territorial', 15, 25);
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 70, 18);
      doc.text(`Organização: ${organizationId}`, pageWidth - 70, 25);

      // Seção 1
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('1. Identificação do Terreno e Área de Influência', 15, 52);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Estudo: ${studyName}`, 15, 60);
      doc.text(`Bairro Predominante: ${selectedNeighborhood?.name || 'Centro'}`, 15, 65);
      doc.text(`Coordenadas do Ponto: Lat ${terrainPin.lat.toFixed(6)} | Lng ${terrainPin.lng.toFixed(6)}`, 15, 70);
      doc.text(`Área do Terreno Informada: ${parseFloat(terrainArea).toLocaleString('pt-BR')} m²`, 15, 75);
      doc.text(`Raio de Análise de Concorrência: ${analysisRadius} metros`, 15, 80);

      // Seção 2
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('2. Estatísticas Espaciais do Entorno (PostGIS)', 15, 92);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      if (analysisResult.stats) {
        doc.text(`Total de Concorrentes Ofertados no Entorno: ${analysisResult.stats.totalListings} unidades`, 15, 100);
        doc.text(`Preço Médio de Oferta no Entorno: R$ ${analysisResult.stats.pricePerM2Avg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/m²`, 15, 105);
        doc.text(`Ticket Médio Geral de Vendas: R$ ${analysisResult.stats.ticketAvg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 15, 110);
        doc.text(`Metragem Média Privativa: ${analysisResult.stats.areaAvg.toFixed(1)} m²`, 15, 115);
        doc.text(`Média de Dormitórios: ${analysisResult.stats.bedroomsAvg.toFixed(1)} quartos`, 15, 120);
      } else {
        doc.text('Estatísticas do entorno não guardadas: estudo salvo antes de 07/10/2026.', 15, 100);
        doc.text('Recalcule a vocação territorial para obter os números medidos.', 15, 105);
      }

      // Seção 3
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('3. Vocação do Terreno e Recomendação do Produto IA', 15, 132);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Padrão do Empreendimento Recomendado: ${analysisResult.recStandard}`, 15, 140);
      doc.text(`VGV Potencial Estimado (Coeficiente Aproveitamento): R$ ${analysisResult.estimatedVgv.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`, 15, 145);
      doc.text(`Grau de Risco do Empreendimento: ${analysisResult.riskScore}% (Score de Viabilidade)`, 15, 150);
      doc.text(`Velocidade de Venda Estimada (Absorção): ${analysisResult.estimatedAbsorptionVelocity}% ao mês`, 15, 155);

      // Mix
      doc.setFont('helvetica', 'bold');
      doc.text('Sugestão de Mix de Tipologias Recomendadas:', 15, 165);
      let mixY = 172;
      doc.setFont('helvetica', 'normal');
      analysisResult.productMix.tipologias.forEach((t: any) => {
        doc.text(`- ${t.tipo} (Área Privativa: ${t.area}m²): ${t.mix}% do VGV`, 20, mixY);
        mixY += 6;
      });

      // Captura do mapa com contorno para Tailwind CSS oklch/oklab
      if (mapContainerRef.current) {
        try {
          const sheets = Array.from(document.styleSheets);
          const disabledSheets: CSSStyleSheet[] = [];
          sheets.forEach(sheet => {
            try {
              if (sheet.href && sheet.href.includes('leaflet')) return;
              
              const rules = sheet.cssRules || sheet.rules;
              let shouldDisable = false;
              if (!rules) {
                shouldDisable = true;
              } else {
                for (let i = 0; i < rules.length; i++) {
                  const ruleText = rules[i].cssText;
                  if (ruleText.includes('oklch') || ruleText.includes('oklab')) {
                    shouldDisable = true;
                    break;
                  }
                }
              }
              if (shouldDisable) {
                sheet.disabled = true;
                disabledSheets.push(sheet);
              }
            } catch (e) {
              try {
                sheet.disabled = true;
                disabledSheets.push(sheet);
              } catch (err) {}
            }
          });

          const canvas = await html2canvas(mapContainerRef.current, {
            useCORS: true,
            allowTaint: false,
            logging: false
          });
          const imgData = canvas.toDataURL('image/png');
          
          // Reabilitar as folhas de estilo desabilitadas
          disabledSheets.forEach(sheet => {
            try {
              sheet.disabled = false;
            } catch (err) {}
          });

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.text('4. Visualização de Localização Georreferenciada', 15, 202);
          doc.addImage(imgData, 'PNG', 15, 207, pageWidth - 30, 75);
        } catch (mapErr) {
          console.error('Erro ao renderizar imagem do mapa no PDF:', mapErr);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.text('4. Visualização de Localização Georreferenciada', 15, 202);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.text('(Visualização do mapa indisponível neste relatório devido a limitações gráficas do CSS)', 15, 212);
        }
      }

      // Hipóteses usadas no cálculo (Fase 5): o leitor do relatório vê de onde vem o número.
      const hipotesesDoRelatorio: HipotesesVocacao = analysisResult.hipoteses ?? hipoteses;
      doc.addPage();
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('5. Hipóteses do cálculo', 15, 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      let yHip = 30;
      DESCRICAO_HIPOTESES.forEach(d => {
        const alterada = hipotesesDoRelatorio[d.chave] !== HIPOTESES_PADRAO[d.chave];
        doc.text(`${d.rotulo}: ${hipotesesDoRelatorio[d.chave].toLocaleString('pt-BR')} ${d.unidade}${alterada ? `  (padrão: ${HIPOTESES_PADRAO[d.chave].toLocaleString('pt-BR')})` : ''}`, 15, yHip);
        yHip += 6;
      });

      // Rodapé
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('ÓPURA Market Intelligence | OrçaCloud SaaS', 15, 290);
      doc.text('Confidencial - Para uso exclusivo do analista', pageWidth - 85, 290);

      doc.save(`Relatorio_Vocacao_${studyName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar relatório em PDF:', err);
      alert('Erro ao gerar relatório. Verifique as permissões de rede do navegador.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Cria estudo de viabilidade real no banco de dados e redireciona para o módulo IMOVIB
  const handleCreateViability = async () => {
    if (!terrainPin || !analysisResult) return;
    if (!organizationId) {
      alert('Organização ativa não localizada.');
      return;
    }
    // O preço de venda do bloco no IMOVIB vem do preço medido no raio. Antes, sem
    // ele, o código usava R$ 3.800/m² inventado. Sem medição, não cria o estudo.
    if (!analysisResult.stats || !(analysisResult.stats.pricePerM2Avg > 0)) {
      alert('Este estudo não tem o preço por m² medido no raio (foi salvo antes de 07/10/2026). Clique em "Calcular Vocação Territorial" e tente de novo.');
      return;
    }

    try {
      setAnalyzing(true);

      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email || 'sistema@opura.com.br';

      // 1. Criar Estudo no banco
      const areaTerreno = parseFloat(terrainArea);
      const studyPayload = {
        organization_id: organizationId,
        name: `${studyName} - Viabilidade`,
        cnpj: '',
        developer: 'Ópura Inteligência Territorial',
        manager: userEmail.split('@')[0],
        version: '1.0',
        segment: 'Residencial',
        sub_classification: analysisResult.recStandard === 'Alto Padrão' ? 'Alto' : 
                            analysisResult.recStandard === 'Luxo' ? 'Luxo' :
                            analysisResult.recStandard === 'Econômico' ? 'Econômico' : 'Médio',
        phase: 'Greenfield',
        development_modality: 'Incorporação Própria',
        zoning: selectedNeighborhood ? `ZM - Bairro ${selectedNeighborhood.name}` : 'ZM',
        needs_eiv: false,
        ca_basic: 1.0,
        ca_max: hipotesesDoResultado(analysisResult).coeficienteAproveitamento,
        occupancy_rate: hipotesesDoResultado(analysisResult).taxaOcupacao,
        land_cost: 0
      };

      console.log('Criando estudo de viabilidade...', studyPayload);
      const createdStudy = await imovibService.createStudy(studyPayload);

      // 2. Criar Bloco
      const avgPricePerM2 = analysisResult.stats.pricePerM2Avg;
      const blockPayload = {
        study_id: createdStudy.id,
        name: 'Bloco Principal A',
        construction_cost_sqm: hipotesesDoResultado(analysisResult).custoObraM2,
        sales_price_sqm: avgPricePerM2
      };

      console.log('Criando bloco associado...', blockPayload);
      const createdBlock = await imovibService.createBlock(blockPayload);

      // 3. Criar Unidades do Bloco com base nas tipologias recomendadas
      const hImovib = hipotesesDoResultado(analysisResult);
      const totalAreaVenda = areaTerreno * hImovib.coeficienteAproveitamento * hImovib.eficienciaVenda;

      console.log('Criando tipologias de unidades recomendadas pelo mix de produto...');
      for (const tip of analysisResult.productMix.tipologias) {
        const areaDedicada = totalAreaVenda * (tip.mix / 100);
        const quant = Math.max(Math.round(areaDedicada / tip.area), 1);

        const unitPayload = {
          block_id: createdBlock.id,
          name: tip.tipo,
          quantity: quant,
          private_area: tip.area,
          common_area: Math.round(tip.area * hImovib.areaComumFator)
        };

        await imovibService.createUnit(unitPayload);
      }

      alert('Estudo de viabilidade imobiliária (IMOVIB) inicializado com sucesso com as premissas territoriais!');
      
      // 4. Redirecionamento
      if (setActiveView) {
        setActiveView('imovib');
      }
    } catch (err: any) {
      console.error('Erro ao integrar com o IMOVIB:', err);
      alert('Erro ao criar viabilidade no banco: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Deletar estudo
  const handleDeleteStudy = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta análise de terreno?')) return;
    try {
      await opuraMarketService.deleteTerrainStudy(id);
      loadSavedStudies();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao deletar: ' + err.message);
    }
  };

  // Deletar anúncio/ocorrência individual
  const handleDeleteListing = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este anúncio de concorrência?')) return;
    try {
      await opuraMarketService.deleteListing(id);
      if (selectedCityId) {
        await loadListings(selectedCityId);
      }
    } catch (err: any) {
      console.error(err);
      alert('Erro ao deletar anúncio: ' + err.message);
    }
  };

  // Focar no mapa ao clicar no anúncio
  const handleFocusListing = (l: OpuraMarketListing) => {
    if (l.latitude && l.longitude && mapInstanceRef.current) {
      mapInstanceRef.current.setView([l.latitude, l.longitude], 17);
      if (activeLayer !== 'concorrencia') {
        setActiveLayer('concorrencia');
      }
    }
  };

  // Lista única de fontes
  const sources = React.useMemo(() => {
    const set = new Set<string>();
    listings.forEach(l => {
      if (l.source) set.add(l.source);
    });
    return Array.from(set);
  }, [listings]);

  // Filtragem dos anúncios
  const filteredListings = React.useMemo(() => {
    return listings.filter(l => {
      const matchesSearch = !searchTerm.trim() || 
        (l.address && l.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.propertyType && l.propertyType.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.description && l.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.source && l.source.toLowerCase().includes(searchTerm.toLowerCase()));
         
      const matchesSource = filterSource === 'Todos' || l.source === filterSource;
      return matchesSearch && matchesSource;
    });
  }, [listings, searchTerm, filterSource]);

  // Ordenação dos anúncios baseada no hook tableColumns (§6.3)
  const sortedListings = React.useMemo(() => {
    if (!tableColumns.sortColumn) return filteredListings;
    
    return [...filteredListings].sort((a, b) => {
      let val1: any = a[tableColumns.sortColumn as keyof OpuraMarketListing];
      let val2: any = b[tableColumns.sortColumn as keyof OpuraMarketListing];
      
      // Caso especial: Bairro
      if (tableColumns.sortColumn === 'neighborhood') {
        val1 = neighborhoods.find(n => n.id === a.neighborhoodId)?.name || '';
        val2 = neighborhoods.find(n => n.id === b.neighborhoodId)?.name || '';
      }
      
      if (val1 === null || val1 === undefined) return 1;
      if (val2 === null || val2 === undefined) return -1;
      
      if (typeof val1 === 'string') {
        return tableColumns.sortDirection === 'asc'
          ? val1.localeCompare(val2)
          : val2.localeCompare(val1);
      }
      if (typeof val1 === 'number') {
        return tableColumns.sortDirection === 'asc'
          ? val1 - val2
          : val2 - val1;
      }
      return 0;
    });
  }, [filteredListings, tableColumns.sortColumn, tableColumns.sortDirection, neighborhoods]);

  // Carregar estudo salvo no mapa
  const handleSelectSavedStudy = (study: OpuraMarketTerrainStudy) => {
    setTerrainPin({ lat: study.latitude, lng: study.longitude });
    setStudyName(study.name);
    setTerrainArea(study.terrainArea.toString());
    setAnalysisRadius(study.analysisRadiusMeters.toString());

    if (study.polygonGeom && study.polygonGeom.length >= 3) {
      setPolygonPoints(study.polygonGeom.map(p => [p[1], p[0]] as [number, number]));
    } else {
      setPolygonPoints(null);
    }

    // Centraliza o mapa nas coordenadas do estudo salvo
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([study.latitude, study.longitude], 15);
    }
    
    // As estatísticas do entorno vêm do que foi GRAVADO na análise. Estudo salvo
    // antes de 07/10/2026 não as tem: fica null e a tela diz "não guardadas".
    // Antes, este trecho inventava números (total = VGV ÷ 400 mil, área 80 m²…)
    // e os exibia como se fossem medidos.
    // As hipóteses gravadas no estudo voltam para a tela (estudo antigo: só CA e TO).
    const hEstudo = hipotesesDoEstudo(study.coefficientsZone);
    setHipoteses(hEstudo);
    setAnalysisResult(study.radiusStats
      ? calcularVocacao(study.radiusStats, study.terrainArea, cityConfig?.rules, hEstudo)
      : {
          stats: null,
          recStandard: study.recommendedStandard,
          productMix: study.recommendedProductMix,
          estimatedVgv: study.estimatedVgv,
          estimatedAbsorptionVelocity: study.estimatedAbsorptionVelocity,
          riskScore: study.riskScore,
          areaConstruivel: study.terrainArea * hEstudo.coeficienteAproveitamento,
          areaVenda: study.terrainArea * hEstudo.coeficienteAproveitamento * hEstudo.eficienciaVenda,
          hipoteses: hEstudo,
        });

    setActiveTab('analise');
  };

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              variant="secondary"
              size="icon"
              onClick={onBack}
              className="w-9 h-9 rounded-xl shadow-sm text-button active:scale-95 transition-transform"
            >
              ⬅
            </Button>
          )}
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">🗺️ ÒPURA Market Intelligence</h1>
            <p className="text-xs font-semibold text-slate-500">Atlas Dinâmico e Recomendações de Produto Imobiliário por Inteligência Territorial</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Seletor Dinâmico de Cidades */}
          {cities.length > 0 && (
            <select
              value={selectedCityId}
              onChange={async (e) => {
                const cityId = e.target.value;
                setSelectedCityId(cityId);
                await loadNeighborhoods(cityId);
                await loadListings(cityId);
                await loadCityRules(cityId);
              }}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-form-input font-bold uppercase tracking-wider shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-500 cursor-pointer"
            >
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  📍 {city.name} - {city.state}
                </option>
              ))}
            </select>
          )}

          {/* Botão de regras */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsRulesModalOpen(true)}
            className="rounded-xl text-button font-black uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5"
            title="Configurar regras de padrão construtivo e tipologias da praça ativa"
          >
            ⚙️ Regras da Praça
          </Button>

          {ehSuperadmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPracaAberta(true)}
              className="rounded-xl text-button font-black uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5"
              title="Cadastrar cidades e bairros. Vale para todas as organizações: só o superadministrador da plataforma vê este botão."
            >
              📍 Cadastrar praça
            </Button>
          )}
        </div>
      </div>

      {/* Navegação de Abas Unificada (§19 e §16) */}
      {!loading && (
        <div className="flex bg-white p-1 rounded-[10px] border border-slate-200 shadow-xs gap-1 shrink-0 w-fit">
          <button
            onClick={() => setActiveViewMode('map')}
            className={`px-3 py-1.5 rounded-[6px] text-[13px] font-bold transition-all ${
              activeViewMode === 'map' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            🗺️ Mapa de Inteligência
          </button>
          <button
            onClick={() => setActiveViewMode('table')}
            className={`px-3 py-1.5 rounded-[6px] text-[13px] font-bold transition-all ${
              activeViewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            📋 Tabela de Ocorrências
          </button>
          <button
            onClick={() => setActiveViewMode('feed')}
            className={`px-3 py-1.5 rounded-[6px] text-[13px] font-bold transition-all ${
              activeViewMode === 'feed' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            📡 Feed XML
          </button>
          <button
            onClick={() => setActiveViewMode('studies')}
            className={`px-3 py-1.5 rounded-[6px] text-[13px] font-bold transition-all ${
              activeViewMode === 'studies' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            📊 Estudos & Análise
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200/50 rounded-3xl">
          <div className="w-8 h-8 border-4 border-slate-950 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Construindo Atlas Dinâmico...</span>
        </div>
      ) : activeViewMode === 'table' ? (
        <div className="bg-white rounded-[10px] border border-slate-200/60 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>📋</span> Tabela de Ocorrências
              </h2>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Visualizando todos os {sortedListings.length} anúncios de concorrência da praça ativa.
              </p>
            </div>
          </div>

          {/* Painel de busca e config de colunas superior (§5.1) */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex-1 relative w-full max-w-md">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar nesta tabela..."
                className="w-full h-9 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="h-9 px-3 bg-white border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-600 focus:outline-none"
              >
                <option value="Todos">Todas as Fontes</option>
                {sources.map(src => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
              <ColumnConfigButton
                columns={CONCORRENCIA_COLUMNS}
                visibleColumns={tableColumns.visibleColumns}
                showColumnConfig={tableColumns.showColumnConfig}
                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                onToggleColumn={tableColumns.toggleColumn}
                onReset={tableColumns.resetColumns}
              />
            </div>
          </div>

          {/* Tabela Scrollável (§6.5) */}
          <div className="overflow-x-auto max-h-[70vh] border border-gray-100 rounded-[10px]">
            <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
              <thead className="sticky top-0 bg-slate-50 border-b border-gray-200 z-10">
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                  {tableColumns.orderedVisibleColumns.map(key => {
                    const def = CONCORRENCIA_COLUMN_HEADERS[key];
                    if (!def) return null;
                    return (
                      <SortableHeader
                        key={key}
                        label={def.label}
                        colKey={key}
                        sortable={def.sortable}
                        sortColumn={tableColumns.sortColumn || undefined}
                        sortDirection={tableColumns.sortDirection}
                        onSort={tableColumns.handleColumnSort}
                        onMoveColumn={tableColumns.moveColumn}
                        className={def.className}
                        uppercase={false}
                      />
                    );
                  })}
                  <th className="px-5 py-3 text-right text-xs font-bold text-slate-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {sortedListings.length > 0 ? (
                  sortedListings.map(l => {
                    return (
                      <tr
                        key={l.id}
                        onClick={() => {
                          handleFocusListing(l);
                          setActiveViewMode('map');
                        }}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                      >
                        {tableColumns.orderedVisibleColumns.map(key => (
                          <td key={key} className="px-5 py-2.5 border-r border-gray-100 last:border-r-0">
                            {renderConcorrenciaCell(key, l, neighborhoods)}
                          </td>
                        ))}
                        <td className="px-5 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              handleFocusListing(l);
                              setActiveViewMode('map');
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            Ver no Mapa
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={tableColumns.visibleColumns.length + 1} className="text-center py-12 text-slate-400 font-bold bg-white rounded-b-[10px]">
                      <div className="text-center">
                        <span className="text-3xl block mb-2">📂</span>
                        <h3 className="text-sm font-bold text-gray-900 mb-1">Nenhum anúncio encontrado</h3>
                        <p className="text-xs text-gray-500">Tente ajustar seus filtros de busca ou fonte.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeViewMode === 'feed' ? (
        <div className="bg-white rounded-[10px] border border-slate-200/60 p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>📡</span> Importar Feed XML
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Feed no padrão VRSync, o mesmo que as imobiliárias enviam para ZAP, VivaReal e OLX. Peça o link à imobiliária parceira ou use o arquivo .xml.
              Entram só os anúncios de venda da cidade selecionada, e reimportar o mesmo feed atualiza os preços em vez de duplicar.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className="flex-1 w-full">
              <input
                type="text"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                disabled={!!feedArquivo}
                placeholder="https://imobiliaria.com.br/feed-vrsync.xml"
                className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                title={feedArquivo ? 'Um arquivo foi escolhido: o link é ignorado. Remova o arquivo para usar o link.' : undefined}
              />
            </div>
            <label className="h-9 px-3 flex items-center gap-1.5 bg-white border border-slate-200 rounded-[6px] text-[13px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0">
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                className="hidden"
                onChange={(e) => setFeedArquivo(e.target.files?.[0] ?? null)}
              />
              {feedArquivo ? `📄 ${feedArquivo.name}` : 'Ou escolher arquivo .xml'}
            </label>
            {feedArquivo && (
              <button
                onClick={() => setFeedArquivo(null)}
                className="h-9 px-3 text-[13px] font-medium text-slate-500 hover:text-slate-800 shrink-0"
              >
                Remover arquivo
              </button>
            )}
            <button
              onClick={handleImportarFeed}
              disabled={importandoFeed || localizando || !organizationId}
              title={!organizationId ? 'Selecione uma organização no topo da tela: os anúncios são gravados nela.' : undefined}
              className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0"
            >
              {importandoFeed ? 'Importando…' : 'Importar feed'}
            </button>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-[10px] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-semibold">
              {pendentesDeLocalizacao > 0
                ? `${pendentesDeLocalizacao} anúncios da sua organização nesta cidade ainda não têm coordenada.`
                : 'Todos os anúncios da sua organização nesta cidade já passaram pela localização.'}
              <span className="block text-slate-400 mt-0.5">
                A localização usa rua, número, bairro e cidade. Cada rodada trabalha por até cerca de dois minutos.
              </span>
            </div>
            <button
              onClick={handleLocalizarPendentes}
              disabled={localizando || importandoFeed || pendentesDeLocalizacao === 0 || !organizationId}
              title={
                !organizationId ? 'Selecione uma organização no topo da tela.'
                  : pendentesDeLocalizacao === 0 ? 'Não há anúncio pendente de localização nesta cidade.'
                  : undefined
              }
              className="h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0"
            >
              {localizando ? 'Localizando…' : 'Localizar anúncios sem coordenada'}
            </button>
          </div>

          {(importandoFeed || localizando) && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-[10px] text-xs text-blue-800 font-semibold">
              Trabalhando no servidor. Os endereços são localizados a cerca de um por segundo.
            </div>
          )}

          {resultadoFeed && (
            <div className={`p-4 rounded-[10px] border text-xs font-semibold ${
              resultadoFeed.startsWith('Erro') ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-emerald-50 border-emerald-100 text-emerald-800'
            }`}>
              {resultadoFeed}
            </div>
          )}
        </div>
      ) : activeViewMode === 'studies' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Lado Esquerdo: Vocação do Lote */}
          <div className="lg:col-span-1 bg-white rounded-[24px] border border-slate-200/60 p-6 shadow-sm flex flex-col justify-between h-fit animate-fadeIn">
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  🧪 Vocação Territorial & IA
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold mt-1">
                  Calcule o mix de tipologia, VGV e recomendação construtiva baseada no lote selecionado.
                </p>
              </div>

              {!terrainPin ? (
                <div className="py-12 text-center space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl mx-auto animate-pulse">
                    📐
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Nenhum lote selecionado</h4>
                    <p className="text-[11px] text-slate-500 font-semibold max-w-xs mx-auto">
                      Para rodar a análise de vocação, desenhe as dimensões do terreno diretamente sobre a praça do mapa.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveViewMode('map');
                      startDrawing();
                    }}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 text-xs shadow-md"
                  >
                    📐 Desenhar Lote no Mapa
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="block font-black text-indigo-800 uppercase text-[9px] tracking-wider">Terreno Georreferenciado</span>
                      <button
                        onClick={() => {
                          setActiveViewMode('map');
                          startDrawing();
                        }}
                        className="text-[9px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline bg-transparent border-0 cursor-pointer"
                      >
                        Redesenhar
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-semibold font-mono">
                      <span>Lat: {terrainPin.lat.toFixed(6)}</span>
                      <span>Lng: {terrainPin.lng.toFixed(6)}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Nome do Estudo</label>
                      <input
                        type="text"
                        required
                        value={studyName}
                        onChange={(e) => setStudyName(e.target.value)}
                        placeholder="Ex: Terreno do Centro"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Área do Terreno (m²)</label>
                      <input
                        type="number"
                        value={terrainArea}
                        onChange={(e) => setTerrainArea(e.target.value)}
                        placeholder="Ex: 1500"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Raio de Análise</label>
                      <select
                        value={analysisRadius}
                        onChange={(e) => setAnalysisRadius(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                      >
                        <option value="500">500m (Entorno Direto)</option>
                        <option value="1000">1km (Raio Principal)</option>
                        <option value="3000">3km (Região de Influência)</option>
                        <option value="5000">5km (Macro Região)</option>
                      </select>
                    </div>

                    <details className="border border-slate-100 rounded-xl bg-slate-50/50" open={errosHipoteses.length > 0 || undefined}>
                      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600">
                        Hipóteses do cálculo{hipotesesAlteradas > 0 ? ` · ${hipotesesAlteradas} alterada(s)` : ' · padrão'}
                      </summary>
                      <div className="px-3 pb-3 space-y-3">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                          {DESCRICAO_HIPOTESES.map(d => (
                            <div key={d.chave} className="space-y-1.5" title={d.explicacao}>
                              <label className="block text-[11px] font-semibold text-slate-500 leading-tight">
                                {d.rotulo} <span className="font-normal text-slate-400">({d.unidade})</span>
                              </label>
                              <input
                                type="number"
                                step={d.passo}
                                min={d.min}
                                max={d.max}
                                value={Number.isFinite(hipoteses[d.chave]) ? hipoteses[d.chave] : ''}
                                onChange={(e) => setHipoteses(h => ({ ...h, [d.chave]: e.target.value === '' ? Number.NaN : Number(e.target.value) }))}
                                className={`w-full px-2 h-8 bg-white border rounded-[6px] text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500 ${hipoteses[d.chave] !== HIPOTESES_PADRAO[d.chave] ? 'border-amber-300' : 'border-slate-200'}`}
                              />
                            </div>
                          ))}
                        </div>
                        {errosHipoteses.length > 0 && (
                          <ul className="text-xs text-rose-600 space-y-0.5">
                            {errosHipoteses.map(e => <li key={e}>{e}</li>)}
                          </ul>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400">Passe o mouse sobre um campo para ver o efeito. Mudou, o resultado é refeito.</span>
                          <button
                            type="button"
                            onClick={() => setHipoteses(HIPOTESES_PADRAO)}
                            disabled={hipotesesAlteradas === 0}
                            title={hipotesesAlteradas === 0 ? 'Todas as hipóteses já estão no padrão.' : undefined}
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:text-slate-300 disabled:cursor-not-allowed shrink-0"
                          >
                            Restaurar padrões
                          </button>
                        </div>
                      </div>
                    </details>

                    <button
                      onClick={handleAnalyzeTerrain}
                      disabled={analyzing || errosHipoteses.length > 0}
                      title={errosHipoteses.length > 0 ? 'Corrija as hipóteses do cálculo antes de calcular.' : undefined}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      {analyzing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Analisando...
                        </>
                      ) : '🚀 Calcular Vocação Territorial'}
                    </button>
                  </div>

                  {analysisResult && (
                    <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-4 animate-fadeIn">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Vocação e Recomendação IA</h4>
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="space-y-0.5">
                          <span className="block text-[9px] text-slate-400 font-bold uppercase">Padrão Recomendado</span>
                          <span className="block font-black text-slate-800">{analysisResult.recStandard}</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="block text-[9px] text-slate-400 font-bold uppercase">Preço Estimado / m²</span>
                          {analysisResult.stats ? (
                            <span className="block font-black text-emerald-600">R$ {analysisResult.stats.pricePerM2Avg.toLocaleString('pt-BR')}/m²</span>
                          ) : (
                            <span className="block font-semibold text-slate-500" title="Este estudo foi salvo antes de 07/10/2026, quando as estatísticas do raio não eram guardadas. Clique em Calcular Vocação Territorial para medir de novo.">Estatísticas não guardadas</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Mix de Tipologias Recomendadas</span>
                        <div className="space-y-1">
                          {analysisResult.productMix.tipologias.map((tip: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-xs bg-white p-2 rounded-lg border border-slate-100 font-semibold text-slate-600">
                              <span>{tip.tipo} ({tip.area}m²)</span>
                              <span className="text-slate-800 font-bold">{tip.mix}% do VGV</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-3 text-xs font-semibold">
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase">VGV Potencial</span>
                          <span className="block font-black text-slate-800 text-sm">R$ {(analysisResult.estimatedVgv || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-slate-400 font-bold uppercase">Risco do Produto</span>
                          <span className={`block font-black text-sm ${
                            analysisResult.riskScore > 70 ? 'text-rose-600' :
                            analysisResult.riskScore > 40 ? 'text-amber-600' : 'text-emerald-600'
                          }`}>{analysisResult.riskScore}%</span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={handleSaveStudy}
                          disabled={analyzing}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95"
                        >
                          💾 Salvar Estudo na Organização
                        </button>

                        <button
                          onClick={handleExportPDF}
                          disabled={analyzing}
                          className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          📄 Exportar Relatório PDF
                        </button>

                        {setActiveView && (
                          <Button
                            variant="primary"
                            size="md"
                            onClick={handleCreateViability}
                            disabled={analyzing}
                            className="w-full rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
                          >
                            🏗️ Criar Viabilidade (IMOVIB)
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Lado Direito: Estudos Salvos */}
          <div className="lg:col-span-2 bg-white rounded-[24px] border border-slate-200/60 p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-6 flex-1 flex flex-col">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  📂 Estudos Salvos da Organização
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold mt-1">
                  Lista histórica de terrenos e estimativas de vocação computadas por sua organização.
                </p>
              </div>

              {loadingStudies ? (
                <div className="flex flex-col items-center justify-center py-20 flex-1">
                  <div className="w-8 h-8 border-4 border-slate-950 border-t-transparent rounded-full animate-spin mb-3" />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Buscando Estudos...</span>
                </div>
              ) : savedStudies.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-1 flex-1">
                  {savedStudies.map(study => (
                    <div
                      key={study.id}
                      className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl transition-all flex flex-col justify-between group relative hover:border-slate-200"
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate max-w-[200px]" title={study.name}>
                            {study.name}
                          </h4>
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                            {study.createdAt ? new Date(study.createdAt).toLocaleDateString('pt-BR') : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600 font-semibold">
                          <span>Área: <strong className="text-slate-800">{study.terrainArea.toLocaleString('pt-BR')}m²</strong></span>
                          <span>Raio: <strong className="text-slate-800">{study.analysisRadiusMeters}m</strong></span>
                          {study.estimatedVgv && (
                            <span className="col-span-2 text-emerald-600 font-black">
                              VGV: R$ {study.estimatedVgv.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100/60">
                        <button
                          onClick={() => handleSelectSavedStudy(study)}
                          className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100/30 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-wider text-center transition-all active:scale-95"
                        >
                          🗺️ Ver no Mapa
                        </button>
                        <button
                          onClick={() => handleDeleteStudy(study.id)}
                          className="p-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-lg text-xs transition-all active:scale-95"
                          title="Excluir Estudo"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 border border-dashed border-slate-200 rounded-3xl flex-1 text-center space-y-3">
                  <span className="text-3xl block">📂</span>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Nenhum estudo localizado</h4>
                    <p className="text-[11px] text-slate-500 font-semibold max-w-xs mx-auto">
                      Os estudos da sua organização serão listados aqui assim que salvos no painel lateral de vocação.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna 1 e 2: Mapa e Controles de Camadas */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Mapa Interativo */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Market Map™</h3>
                  <span className="text-xs text-slate-500 font-semibold">Selecione uma camada e clique no mapa para analisar a vocação imobiliária</span>
                </div>
                
                {/* Camadas do Mapa ou Controles de Desenho */}
                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
                  {isDrawingPolygon ? (
                    <div className="flex items-center gap-3 px-2">
                      <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5 animate-fadeIn">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        Desenho Ativo
                      </span>
                      
                      <div className="flex items-center gap-2 bg-white px-2 py-0.5 rounded border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500">Vértices:</span>
                        <span className="text-xs font-extrabold text-indigo-600">{drawingPoints.length}</span>
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={completeDrawing}
                          disabled={drawingPoints.length < 3 || analyzing}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white rounded text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm"
                        >
                          {analyzing ? '...' : 'Concluir'}
                        </button>
                        <button
                          onClick={cancelDrawing}
                          disabled={analyzing}
                          className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    (['preco', 'saturacao', 'concorrencia', 'oportunidade'] as const).map(layer => (
                      <button
                        key={layer}
                        onClick={() => setActiveLayer(layer)}
                        className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                          activeLayer === layer 
                            ? 'bg-white text-slate-900 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {layer === 'preco' ? '💰 Preço/m²' :
                         layer === 'saturacao' ? '⚠️ Saturação' :
                         layer === 'concorrencia' ? '🏢 Concorrência' : '✨ Oportunidades'}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Contêiner do Mapa Leaflet Real envolto em Wrapper Relativo para Flutuantes */}
              <div className="relative w-full h-[400px] rounded-2xl overflow-hidden shadow-inner border border-slate-200/80">
                {/* Overlay de Desenho foi movido para o Header acima do mapa para evitar obstrução visual */}
                
                {/* Overlay pós-desenho caso o usuário continue na aba do mapa */}
                {!isDrawingPolygon && terrainPin && activeViewMode === 'map' && (
                  <div className="absolute top-4 right-4 z-[1000] animate-fadeIn">
                    <button
                      onClick={() => setActiveViewMode('studies')}
                      className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 shadow-xl flex items-center gap-2 border border-emerald-400 font-sans"
                    >
                      🚀 Ver Estudo da IA
                    </button>
                  </div>
                )}

                {/* Mapa */}
                <div 
                  ref={mapContainerRef} 
                  className="w-full h-full z-10 relative"
                  style={{ background: '#111827' }}
                />
              </div>
            </div>

            {/* DNA do Bairro Selecionado */}
            {selectedNeighborhood && (
              <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">DNA do Bairro™</h3>
                    <h2 className="text-base font-black text-slate-900 tracking-tight">🏢 Bairro: {selectedNeighborhood.name}</h2>
                  </div>
                  {selectedNeighborhood.bairroScore != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 uppercase">Bairro Score™</span>
                      <span className="text-lg font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-xl">
                        {selectedNeighborhood.bairroScore} / 100
                      </span>
                    </div>
                  )}
                </div>

                {(() => {
                  // DNA calculado na leitura (Fase 4.5): só o que a RLS libera a quem vê.
                  const st = statsPorBairro[selectedNeighborhood.id];
                  if (!st) {
                    return (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 font-semibold leading-relaxed">
                        Nenhum anúncio ativo vinculado a este bairro. Os anúncios se vinculam pelo nome do bairro de origem quando ele está cadastrado na praça.
                      </div>
                    );
                  }
                  const NAO = 'Não calculado';
                  const semRegra = 'Ainda sem regra de cálculo definida (decisão D3 do plano).';
                  const celula = (rotulo: string, valor: React.ReactNode, titulo?: string) => (
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1" title={titulo}>
                      <span className="block font-black text-slate-400 uppercase text-[9px]">{rotulo}</span>
                      <span className="block font-black text-slate-800 text-sm truncate">{valor}</span>
                    </div>
                  );
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      {celula('Preço Médio / m²', st.pricePerM2Avg == null ? NAO : `R$ ${Math.round(st.pricePerM2Avg).toLocaleString('pt-BR')}/m²`)}
                      {celula('Ticket Médio', st.ticketAvg == null ? NAO : `R$ ${Math.round(st.ticketAvg).toLocaleString('pt-BR')}`)}
                      {celula('Área Média', st.areaAvg == null ? NAO : `${Math.round(st.areaAvg).toLocaleString('pt-BR')} m²`)}
                      {celula('Mais Anunciado', st.tipologia ?? NAO)}
                      {celula('Anúncios Ativos', st.total.toLocaleString('pt-BR'))}
                      {celula('Saturação', NAO, semRegra)}
                      {celula('Score Potencial', NAO, semRegra)}
                    </div>
                  );
                })()}

                {/* Gráfico de Evolução Temporal */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="block font-black text-slate-400 uppercase text-[9px] tracking-wider">Evolução do Preço Ofertado (m²)</span>
                    <span className="text-xs text-slate-500 font-semibold">Mês a mês, pela data de captura</span>
                  </div>

                  {loadingHistory ? (
                    <div className="h-40 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : serieDoBairro.length > 0 ? (
                    <div className="h-44 bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={serieDoBairro.map(h => ({
                          mes: new Date(`${h.mes}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                          preco: h.pricePerM2Avg == null ? null : Math.round(h.pricePerM2Avg)
                        }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorPreco" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="mes" tickLine={false} axisLine={false} style={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} />
                          <YAxis tickLine={false} axisLine={false} style={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} domain={['auto', 'auto']} />
                          <Tooltip 
                            contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 12, padding: '8px 12px' }}
                            labelStyle={{ color: '#94A3B8', fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}
                            itemStyle={{ color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}
                            formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR')}/m²`, 'Preço Médio']}
                          />
                          <Area type="monotone" dataKey="preco" stroke="#3B82F6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPreco)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-40 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-400 font-semibold">
                      Sem anúncio com preço por m² vinculado a este bairro.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Coluna 3: Painel Lateral de Concorrência Imobiliária */}
          <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-sm flex flex-col justify-between h-fit min-h-[500px]">
            <div className="space-y-6">
              
              {/* Cabeçalho do Painel */}
              <div className="border-b border-slate-100 pb-3 flex justify-between items-center gap-2">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Ofertas da Praça</h3>
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5 mt-0.5 font-sans">
                    🏢 Concorrência ({listings.length})
                  </h2>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1 shadow-sm font-sans"
                    title="Importar Planilha de Concorrência"
                  >
                    📥 Importar
                  </button>
                </div>
              </div>

              {(
                /* Aba: Anúncios / Concorrência */
                <div className="space-y-4 flex flex-col flex-1 min-h-[450px]">
                  {/* Busca e Filtros */}
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="🔍 Buscar por endereço, tipo, fonte..."
                      className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                    
                    <div className="flex gap-2">
                      <select
                        value={filterSource}
                        onChange={(e) => setFilterSource(e.target.value)}
                        className="flex-1 h-9 px-3 bg-slate-50 border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500"
                      >
                        <option value="Todos">Todas as Fontes</option>
                        {sources.map(src => (
                          <option key={src} value={src}>{src}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setActiveViewMode('table')}
                        className="flex items-center gap-1 h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0"
                      >
                        <span>📋 Tabela</span>
                      </button>
                    </div>
                  </div>

                  {/* Listagem */}
                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 flex-1">
                    {filteredListings.length > 0 ? (
                      filteredListings.map(l => {
                        // Com dono = privado; sem dono = global (ver o mesmo teste no mapa).
                        const isPrivate = l.organizationId != null;
                        return (
                          <div
                            key={l.id}
                            onClick={() => handleFocusListing(l)}
                            className="p-3 bg-slate-50 border border-slate-100 hover:bg-slate-100/50 rounded-xl cursor-pointer transition-all space-y-2 relative group"
                          >
                            {/* Badges superiores */}
                            <div className="flex items-center justify-between gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                isPrivate ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {isPrivate ? 'Privado (Importado)' : 'Global'}
                              </span>
                              <span className="text-xs font-black text-slate-400 uppercase tracking-widest truncate max-w-[120px]">
                                {l.source}
                              </span>
                            </div>

                            {/* Detalhes de Preço e Endereço */}
                            <div className="space-y-0.5">
                              <span className="block font-black text-slate-900 text-sm">
                                R$ {l.price.toLocaleString('pt-BR')}
                              </span>
                              <span className="block text-xs text-slate-500 font-semibold truncate leading-normal" title={l.address || ''}>
                                📍 {l.address || 'Endereço não geocodificado'}
                              </span>
                            </div>

                            {/* Características físicas do imóvel */}
                            <div className="flex flex-wrap gap-1.5 text-xs font-bold text-slate-500">
                              <span className="bg-white px-2 py-0.5 rounded border border-slate-100">{l.propertyType}</span>
                              {l.areaPrivate && <span className="bg-white px-2 py-0.5 rounded border border-slate-100">📐 {l.areaPrivate}m²</span>}
                              {l.bedrooms > 0 && <span className="bg-white px-2 py-0.5 rounded border border-slate-100">🛏️ {l.bedrooms}D</span>}
                              {l.suites > 0 && <span className="bg-white px-2 py-0.5 rounded border border-slate-100">✨ {l.suites}S</span>}
                              {l.parkingSpaces > 0 && <span className="bg-white px-2 py-0.5 rounded border border-slate-100">🚗 {l.parkingSpaces}V</span>}
                              {l.constructionStandard && <span className="bg-white px-2 py-0.5 rounded border border-slate-100 text-slate-600">{l.constructionStandard}</span>}
                            </div>

                            {/* Descrição, se houver */}
                            {l.description && (
                              <p className="text-[9px] text-slate-400 font-semibold italic line-clamp-1 border-t border-slate-100/60 pt-1.5 mt-1">
                                "{l.description}"
                              </p>
                            )}

                            {/* Barra de ações inferior do card */}
                            <div className="flex justify-between items-center pt-2 border-t border-slate-100/60 mt-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDetailedListing(l);
                                }}
                                className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-700 bg-white border border-slate-200 rounded-[6px] hover:bg-slate-50 transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                              >
                                🔍 Ver Detalhes
                              </button>
                              
                              <span className="text-[9px] text-slate-400 font-semibold font-mono">
                                {l.capturedAt ? new Date(l.capturedAt).toLocaleDateString('pt-BR') : ''}
                              </span>
                            </div>

                            {/* Botão de Excluir (somente se for privado da org) */}
                            {isPrivate && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteListing(l.id);
                                }}
                                className="absolute right-3 top-3 w-6 h-6 rounded-lg bg-white border border-slate-200 text-rose-500 hidden group-hover:flex items-center justify-center text-xs active:scale-90 shadow-sm transition-all"
                                title="Excluir Ocorrência"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-xs font-semibold text-center space-y-2">
                        <span>🏢</span>
                        <span>Nenhum anúncio encontrado com estes filtros.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
      {isImportModalOpen && (
        <ImportListingsModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={handleImportSuccess}
          cityId={selectedCityId}
          organizationId={organizationId}
        />
      )}
      <MarketPracaSheet
        open={pracaAberta}
        onClose={() => setPracaAberta(false)}
        cidades={cities}
        cidadeInicialId={selectedCityId || null}
        onSalvo={async (cidadeId) => {
          const lista = await opuraMarketService.listCities();
          setCities(lista);
          setSelectedCityId(cidadeId);
          await loadNeighborhoods(cidadeId);
          await loadListings(cidadeId);
          await loadCityRules(cidadeId);
        }}
      />
      {isRulesModalOpen && (
        <CityRulesModal
          isOpen={isRulesModalOpen}
          onClose={() => setIsRulesModalOpen(false)}
          onSave={async (config) => {
            try {
              const saved = await opuraMarketService.saveCityConfig(config);
              setCityConfig(saved);
              alert('Configurações da praça salvas com sucesso!');
            } catch (err: any) {
              console.error(err);
              alert('Erro ao salvar configurações da praça: ' + err.message);
            }
          }}
          organizationId={organizationId}
          cityId={selectedCityId}
          cityName={cidadeAtual?.name ?? ''}
          initialConfig={cityConfig}
        />
      )}

      {selectedDetailedListing && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col animate-scaleUp">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="block text-[9px] font-black text-indigo-600 uppercase tracking-widest">Detalhes do Anúncio</span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mt-1 truncate max-w-[340px]">
                  {selectedDetailedListing.propertyType} em {cities.find(c => c.id === selectedDetailedListing.cityId)?.name ?? 'cidade não informada'}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedDetailedListing(null)}
                className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center font-bold transition-all active:scale-90"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
              {/* Preço Principal */}
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Preço de Venda</span>
                  <span className="block font-black text-slate-900 text-lg">
                    R$ {selectedDetailedListing.price.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Fonte do Anúncio</span>
                  <span className="block font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg text-xs mt-0.5">
                    {selectedDetailedListing.source}
                  </span>
                </div>
              </div>

              {/* Localização detalhada */}
              <div className="space-y-3">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Localização</span>
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="block text-[9px] text-slate-400 font-bold uppercase">Cidade</span>
                      <span className="block font-extrabold text-slate-700 mt-0.5">
                        {(() => { const c = cities.find(x => x.id === selectedDetailedListing.cityId); return c ? `${c.name} - ${c.state}` : 'Não informada'; })()}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-slate-400 font-bold uppercase">Bairro</span>
                      <span className="block font-extrabold text-slate-700 mt-0.5">
                        {neighborhoods.find(n => n.id === selectedDetailedListing.neighborhoodId)?.name || selectedDetailedListing.neighborhoodNameRaw || 'Não informado'}
                      </span>
                    </div>
                  </div>
                  {selectedDetailedListing.address && (
                    <div className="border-t border-slate-100/70 pt-2">
                      <span className="block text-[9px] text-slate-400 font-bold uppercase">Endereço</span>
                      <span className="block text-xs font-semibold text-slate-600 mt-0.5 leading-normal">
                        📍 {selectedDetailedListing.address}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-slate-100/70 pt-2">
                    <span className="block text-[9px] text-slate-400 font-bold uppercase">Posição no mapa</span>
                    <span className="block text-xs font-semibold text-slate-600 mt-0.5 leading-normal">
                      {selectedDetailedListing.geoPrecision === 'fonte' ? 'Informada pela origem do anúncio'
                        : selectedDetailedListing.geoPrecision === 'endereco' ? 'Localizada pelo endereço'
                        : selectedDetailedListing.geoPrecision === 'bairro' ? 'Aproximada: só o bairro era conhecido'
                        : selectedDetailedListing.geoPrecision === 'nao_encontrado' ? 'Endereço não encontrado: fora do mapa e da análise de raio'
                        : selectedDetailedListing.latitude != null ? 'Origem da posição não registrada'
                        : 'Ainda não localizado'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ficha Técnica / Características */}
              <div className="space-y-2">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Ficha Técnica</span>
                <div className="grid grid-cols-2 gap-3">
                  {selectedDetailedListing.areaPrivate && (
                    <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Área Privativa</span>
                      <span className="text-xs font-extrabold text-slate-800 mt-1">📐 {selectedDetailedListing.areaPrivate} m²</span>
                    </div>
                  )}
                  {selectedDetailedListing.constructionStandard && (
                    <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Padrão Construtivo</span>
                      <span className="text-xs font-extrabold text-slate-800 mt-1">✨ {selectedDetailedListing.constructionStandard}</span>
                    </div>
                  )}
                  <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Dormitórios</span>
                    <span className="text-xs font-extrabold text-slate-800 mt-1">🛏️ {selectedDetailedListing.bedrooms || 0} Dormitório(s)</span>
                  </div>
                  <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Banheiros</span>
                    <span className="text-xs font-extrabold text-slate-800 mt-1">🚿 {selectedDetailedListing.bathrooms || 0} Banheiro(s)</span>
                  </div>
                  {selectedDetailedListing.suites !== null && selectedDetailedListing.suites !== undefined && (
                    <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Suítes</span>
                      <span className="text-xs font-extrabold text-slate-800 mt-1">🔑 {selectedDetailedListing.suites} Suíte(s)</span>
                    </div>
                  )}
                  {selectedDetailedListing.parkingSpaces !== null && selectedDetailedListing.parkingSpaces !== undefined && (
                    <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Vagas de Garagem</span>
                      <span className="text-xs font-extrabold text-slate-800 mt-1">🚗 {selectedDetailedListing.parkingSpaces} Vaga(s)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Descrição Completa */}
              {selectedDetailedListing.description && (
                <div className="space-y-1">
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrição do Anúncio</span>
                  <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl max-h-[120px] overflow-y-auto">
                    <p className="text-[11px] text-slate-600 font-semibold leading-relaxed whitespace-pre-line italic">
                      "{selectedDetailedListing.description}"
                    </p>
                  </div>
                </div>
              )}

              {/* Histórico/Datas */}
              <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-400 font-bold bg-slate-50 p-3 rounded-xl border border-slate-100/60">
                <div>
                  <span className="block text-[8px] uppercase tracking-wider">Capturado em</span>
                  <span className="text-slate-600 font-extrabold">
                    {selectedDetailedListing.capturedAt ? new Date(selectedDetailedListing.capturedAt).toLocaleString('pt-BR') : 'Sem data'}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase tracking-wider">Última Atualização</span>
                  <span className="text-slate-600 font-extrabold">
                    {selectedDetailedListing.lastSeenAt ? new Date(selectedDetailedListing.lastSeenAt).toLocaleString('pt-BR') : 'Sem data'}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
              <button
                onClick={() => setSelectedDetailedListing(null)}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-button font-black uppercase tracking-wider transition-all"
              >
                Fechar
              </button>
              {selectedDetailedListing.sourceUrl && (
                <a
                  href={selectedDetailedListing.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all shadow-md text-center flex items-center justify-center gap-1.5"
                >
                  🔗 Acessar Link Original
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpuraMarketModule;
