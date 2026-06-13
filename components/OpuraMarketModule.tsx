import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { opuraMarketService } from '../services/opuraMarketService';
import { supabase } from '../lib/supabase';
import {
  OpuraMarketCity,
  OpuraMarketNeighborhood,
  OpuraMarketTerrainStudy,
  OpuraMarketListing,
  OpuraMarketNeighborhoodHistory
} from '../types';
import { ImportListingsModal } from './ImportListingsModal';

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
  
  // Estado para o histórico do bairro
  const [neighHistory, setNeighHistory] = React.useState<OpuraMarketNeighborhoodHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  // Carrega anúncios da cidade selecionada
  const loadListings = async (cityId: string) => {
    try {
      const data = await opuraMarketService.listListings(cityId);
      setListings(data);
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
  };
  
  // Estados do mapa e filtros
  const [activeLayer, setActiveLayer] = React.useState<'preco' | 'saturacao' | 'concorrencia' | 'oportunidade'>('preco');
  const [terrainPin, setTerrainPin] = React.useState<{ lat: number; lng: number } | null>(null);
  
  // Estados para simulação de Análise de Terreno
  const [studyName, setStudyName] = React.useState('');
  const [terrainArea, setTerrainArea] = React.useState('1500');
  const [analysisRadius, setAnalysisRadius] = React.useState('1000');
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<any | null>(null);
  
  // Estudos salvos
  const [savedStudies, setSavedStudies] = React.useState<OpuraMarketTerrainStudy[]>([]);
  const [loadingStudies, setLoadingStudies] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'analise' | 'estudos'>('analise');
  
  const radiusMeters = analysisRadius;

  // Coordenadas centrais de Cambuí - MG (Cidade Piloto)
  const CAMBUI_LAT = -22.6122;
  const CAMBUI_LNG = -46.0578;

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
      }
    } catch (err) {
      console.error('Erro ao carregar cidades do ÒPURA Market:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  React.useEffect(() => {
    loadInitialData();
    loadSavedStudies();
  }, [loadInitialData, loadSavedStudies]);

  // Referência atualizada dos bairros para uso no evento de clique
  const neighborhoodsRef = React.useRef(neighborhoods);
  React.useEffect(() => {
    neighborhoodsRef.current = neighborhoods;
  }, [neighborhoods]);

  // Carrega o histórico de evolução do bairro selecionado
  React.useEffect(() => {
    const loadHistory = async () => {
      if (!selectedNeighborhood) return;
      try {
        setLoadingHistory(true);
        const history = await opuraMarketService.listNeighborhoodHistory(selectedNeighborhood.id);
        setNeighHistory(history);
      } catch (err) {
        console.error('Erro ao buscar histórico do bairro:', err);
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, [selectedNeighborhood]);

  // Inicializar o mapa Leaflet quando o loading for concluído e o contêiner estiver no DOM
  React.useEffect(() => {
    if (loading || !mapContainerRef.current || mapInstanceRef.current) return;

    // Inicializa o mapa com as coordenadas de Cambuí - MG
    const map = L.map(mapContainerRef.current, {
      center: [CAMBUI_LAT, CAMBUI_LNG],
      zoom: 15,
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

    // Evento de clique no mapa para selecionar o terreno
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setTerrainPin({ lat, lng });
      setAnalysisResult(null); // Limpa resultados anteriores
      setStudyName(`Estudo Terreno - ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
      
      const currentNeighborhoods = neighborhoodsRef.current;
      if (currentNeighborhoods.length > 0) {
        let closestBairro = currentNeighborhoods[0];
        let minDistance = Infinity;

        currentNeighborhoods.forEach(n => {
          const nLat = n.name === 'Centro' ? -22.6120 : n.name === 'Jardim das Colinas' ? -22.6070 : n.name === 'Vila Santo Antônio' ? -22.6190 : -22.6150;
          const nLng = n.name === 'Centro' ? -46.0580 : n.name === 'Jardim das Colinas' ? -46.0510 : n.name === 'Vila Santo Antônio' ? -46.0650 : -46.0500;
          
          const dist = Math.sqrt(Math.pow(lat - nLat, 2) + Math.pow(lng - nLng, 2));
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
  }, [loading]);

  // Atualizar marcadores e heatmaps sobre o Leaflet reativamente
  React.useEffect(() => {
    const map = mapInstance;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    // Limpa os marcadores existentes
    markersLayer.clearLayers();

    // 1. Desenhar Bairros e suas estatísticas de Heatmap
    neighborhoods.forEach(bairro => {
      const bLat = bairro.name === 'Centro' ? -22.6120 : bairro.name === 'Jardim das Colinas' ? -22.6070 : bairro.name === 'Vila Santo Antônio' ? -22.6190 : -22.6150;
      const bLng = bairro.name === 'Centro' ? -46.0580 : bairro.name === 'Jardim das Colinas' ? -46.0510 : bairro.name === 'Vila Santo Antônio' ? -46.0650 : -46.0500;
      
      let layerColor = '#3B82F6'; // Azul padrão (Centro/Médio)
      let radius = 250;

      if (activeLayer === 'preco') {
        layerColor = bairro.name === 'Jardim das Colinas' ? '#EC4899' : bairro.name === 'Vila Santo Antônio' ? '#64748B' : '#3B82F6';
      } else if (activeLayer === 'saturacao') {
        layerColor = bairro.saturationLevel === 'Saturado' ? '#EF4444' : bairro.saturationLevel === 'Atenção' ? '#F59E0B' : '#10B981';
      } else if (activeLayer === 'oportunidade') {
        layerColor = bairro.name === 'Jardim das Colinas' ? '#10B981' : '#3B82F6';
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
      .bindTooltip(`<b>${bairro.name}</b><br/>Score: ${bairro.bairroScore}/100<br/>R$ ${bairro.pricePerM2Medio}/m²`, { permanent: false, direction: 'top' })
      .addTo(markersLayer);

      // Adiciona um DivIcon com o nome do bairro
      const textIcon = L.divIcon({
        html: `<div class="text-[9px] font-black uppercase tracking-wider text-slate-200 text-center drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.8)]">${bairro.name}</div>`,
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

        // Se o anúncio pertencer à organização atual (importado por ela), usa verde. Senão, vermelho (global)
        const isPrivate = l.organizationId === organizationId;
        const colorClass = isPrivate ? 'bg-emerald-500' : 'bg-rose-500';
        const label = `<b>${l.propertyType}</b> - ${l.address || 'Endereço não geocodificado'}<br/>R$ ${l.price.toLocaleString('pt-BR')} (${l.areaPrivate}m² | ${l.bedrooms}D)`;

        const competitorIcon = L.divIcon({
          html: `<div class="w-3.5 h-3.5 rounded-full ${colorClass} border border-white shadow-md flex items-center justify-center text-[7px] text-white font-bold">🏢</div>`,
          className: 'border-0 bg-transparent',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        L.marker([l.latitude, l.longitude], { icon: competitorIcon })
          .bindTooltip(label, { direction: 'top' })
          .addTo(markersLayer);
      });
    }

    // 3. Desenhar o Pino do Terreno selecionado
    if (terrainPin) {
      const pinIcon = L.divIcon({
        html: `<div class="relative flex items-center justify-center">
                 <div class="absolute w-8 h-8 rounded-full bg-blue-500/20 border border-blue-400 animate-ping"></div>
                 <div class="w-7 h-7 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-lg text-[12px]">📍</div>
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
  }, [mapInstance, neighborhoods, listings, activeLayer, terrainPin, radiusMeters]);

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

      let recStandard: 'Econômico' | 'Médio' | 'Médio-Alto' | 'Alto Padrão' | 'Luxo' = 'Médio';
      let productMix = { tipologias: [] as any[], ticketSugerido: 0 };
      
      const avgPricePerM2 = stats.pricePerM2Avg > 0 ? stats.pricePerM2Avg : 3500;
      const areaTerreno = parseFloat(terrainArea);

      if (avgPricePerM2 < 3200) {
        recStandard = 'Econômico';
        productMix = {
          tipologias: [
            { tipo: '2 Dorms (Minha Casa Minha Vida)', area: 52, mix: 75 },
            { tipo: '1 Dorm / Studio', area: 38, mix: 25 }
          ],
          ticketSugerido: avgPricePerM2 * 52
        };
      } else if (avgPricePerM2 >= 3200 && avgPricePerM2 < 4300) {
        recStandard = 'Médio';
        productMix = {
          tipologias: [
            { tipo: '2 Dorms c/ Suíte', area: 65, mix: 60 },
            { tipo: '3 Dorms c/ Suíte', area: 80, mix: 40 }
          ],
          ticketSugerido: avgPricePerM2 * 68
        };
      } else {
        recStandard = 'Alto Padrão';
        productMix = {
          tipologias: [
            { tipo: '3 Suítes Premium', area: 120, mix: 70 },
            { tipo: '4 Suítes Duplex', area: 180, mix: 30 }
          ],
          ticketSugerido: avgPricePerM2 * 130
        };
      }

      const coefAproveitamento = 4; 
      const areaConstruivelPotencial = areaTerreno * coefAproveitamento;
      const areaVendaPotencial = areaConstruivelPotencial * 0.82; 
      
      const vgvEstimado = areaVendaPotencial * avgPricePerM2;
      const velocidadeVendas = avgPricePerM2 > 4500 ? 6.5 : 8.2; 
      const scoreRisco = Math.min(Math.max(Math.round(100 - (stats.totalListings * 4) - (avgPricePerM2 / 120)), 15), 95);

      setAnalysisResult({
        stats,
        recStandard,
        productMix,
        estimatedVgv: vgvEstimado,
        estimatedAbsorptionVelocity: velocidadeVendas,
        riskScore: scoreRisco,
        areaConstruivel: areaConstruivelPotencial,
        areaVenda: areaVendaPotencial
      });
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
        address: selectedNeighborhood ? `Bairro ${selectedNeighborhood.name}, Cambuí - MG` : 'Cambuí - MG',
        terrainArea: parseFloat(terrainArea),
        coefficientsZone: { zone: 'ZUM', ca: 4.0, to: 0.6 },
        analysisRadiusMeters: parseInt(radiusMeters),
        latitude: terrainPin.lat,
        longitude: terrainPin.lng,
        recommendedProductMix: analysisResult.productMix,
        recommendedStandard: analysisResult.recStandard,
        estimatedVgv: analysisResult.estimatedVgv,
        estimatedAbsorptionVelocity: analysisResult.estimatedAbsorptionVelocity,
        riskScore: analysisResult.riskScore,
        createdBy: userEmail
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
      doc.text(`Total de Concorrentes Ofertados no Entorno: ${analysisResult.stats.totalListings} unidades`, 15, 100);
      doc.text(`Preço Médio de Oferta no Entorno: R$ ${analysisResult.stats.pricePerM2Avg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/m²`, 15, 105);
      doc.text(`Ticket Médio Geral de Vendas: R$ ${analysisResult.stats.ticketAvg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 15, 110);
      doc.text(`Metragem Média Privativa: ${analysisResult.stats.areaAvg.toFixed(1)} m²`, 15, 115);
      doc.text(`Média de Dormitórios: ${analysisResult.stats.bedroomsAvg.toFixed(1)} quartos`, 15, 120);

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

    try {
      setAnalyzing(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email || 'sistema@opura.com.br';

      const { imovibService } = await import('../services/imovibService');

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
        ca_max: 4.0,
        occupancy_rate: 60,
        land_cost: 0
      };

      console.log('Criando estudo de viabilidade...', studyPayload);
      const createdStudy = await imovibService.createStudy(studyPayload);

      // 2. Criar Bloco
      const avgPricePerM2 = analysisResult.stats.pricePerM2Avg > 0 ? analysisResult.stats.pricePerM2Avg : 3800;
      const blockPayload = {
        study_id: createdStudy.id,
        name: 'Bloco Principal A',
        construction_cost_sqm: 2500,
        sales_price_sqm: avgPricePerM2
      };

      console.log('Criando bloco associado...', blockPayload);
      const createdBlock = await imovibService.createBlock(blockPayload);

      // 3. Criar Unidades do Bloco com base nas tipologias recomendadas
      const caMax = 4.0;
      const totalAreaVenda = areaTerreno * caMax * 0.82;

      console.log('Criando tipologias de unidades recomendadas pelo mix de produto...');
      for (const tip of analysisResult.productMix.tipologias) {
        const areaDedicada = totalAreaVenda * (tip.mix / 100);
        const quant = Math.max(Math.round(areaDedicada / tip.area), 1);

        const unitPayload = {
          block_id: createdBlock.id,
          name: tip.tipo,
          quantity: quant,
          private_area: tip.area,
          common_area: Math.round(tip.area * 0.25)
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

  // Carregar estudo salvo no mapa
  const handleSelectSavedStudy = (study: OpuraMarketTerrainStudy) => {
    setTerrainPin({ lat: study.latitude, lng: study.longitude });
    setStudyName(study.name);
    setTerrainArea(study.terrainArea.toString());
    setAnalysisRadius(study.analysisRadiusMeters.toString());

    // Centraliza o mapa nas coordenadas do estudo salvo
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([study.latitude, study.longitude], 15);
    }
    
    const statsMock = {
      totalListings: study.estimatedVgv ? Math.round(study.estimatedVgv / 400000) : 5,
      pricePerM2Avg: study.estimatedVgv ? study.estimatedVgv / (study.terrainArea * 4 * 0.82) : 3800,
      ticketAvg: study.recommendedProductMix?.ticketSugerido || 400000,
      areaAvg: 80,
      bedroomsAvg: 2.5,
      suitesAvg: 1.2
    };

    setAnalysisResult({
      stats: statsMock,
      recStandard: study.recommendedStandard,
      productMix: study.recommendedProductMix,
      estimatedVgv: study.estimatedVgv,
      estimatedAbsorptionVelocity: study.estimatedAbsorptionVelocity,
      riskScore: study.riskScore,
      areaConstruivel: study.terrainArea * 4,
      areaVenda: study.terrainArea * 4 * 0.82
    });

    setActiveTab('analise');
  };

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-xs active:scale-95 transition-transform hover:bg-slate-50"
            >
              ⬅
            </button>
          )}
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">🗺️ ÒPURA Market Intelligence</h1>
            <p className="text-xs font-semibold text-slate-500">Atlas Dinâmico e Recomendações de Produto Imobiliário por Inteligência Territorial</p>
          </div>
        </div>

        {/* Piloto Cambuí */}
        <div className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm">
          📍 Cambuí - MG <span className="opacity-60 text-[10px] font-semibold">(Cidade Piloto MVP)</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200/50 rounded-3xl">
          <div className="w-8 h-8 border-4 border-slate-950 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Construindo Atlas Dinâmico...</span>
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
                  <span className="text-[10px] text-slate-500 font-semibold">Selecione uma camada e clique no mapa para analisar a vocação imobiliária</span>
                </div>
                
                {/* Camadas do Mapa */}
                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
                  {(['preco', 'saturacao', 'concorrencia', 'oportunidade'] as const).map(layer => (
                    <button
                      key={layer}
                      onClick={() => setActiveLayer(layer)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        activeLayer === layer 
                          ? 'bg-white text-slate-900 shadow-xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {layer === 'preco' ? '💰 Preço/m²' :
                       layer === 'saturacao' ? '⚠️ Saturação' :
                       layer === 'concorrencia' ? '🏢 Concorrência' : '✨ Oportunidades'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contêiner do Mapa Leaflet Real */}
              <div 
                ref={mapContainerRef} 
                className="w-full h-[400px] rounded-2xl overflow-hidden border border-slate-200/80 shadow-inner z-10"
                style={{ background: '#111827' }}
              />
            </div>

            {/* DNA do Bairro Selecionado */}
            {selectedNeighborhood && (
              <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">DNA do Bairro™</h3>
                    <h2 className="text-base font-black text-slate-900 tracking-tight">🏢 Bairro: {selectedNeighborhood.name}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Bairro Score™</span>
                    <span className="text-lg font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-xl">
                      {selectedNeighborhood.bairroScore} / 100
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="block font-black text-slate-400 uppercase text-[9px]">Preço Médio / m²</span>
                    <span className="block font-black text-slate-800 text-sm">
                      R$ {selectedNeighborhood.pricePerM2Medio.toLocaleString('pt-BR')}/m²
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="block font-black text-slate-400 uppercase text-[9px]">Ticket Médio Geral</span>
                    <span className="block font-black text-slate-800 text-sm">
                      R$ {selectedNeighborhood.ticketMedio.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="block font-black text-slate-400 uppercase text-[9px]">Tipologia Dominante</span>
                    <span className="block font-black text-slate-800 truncate">
                      {selectedNeighborhood.dominantTypology || 'Não disponível'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="block font-black text-slate-400 uppercase text-[9px]">Padrão predominante</span>
                    <span className="block font-black text-slate-800">
                      {selectedNeighborhood.predominantStandard || 'Médio'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-slate-500">Saturação:</span>
                    <span className={`font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full text-[9px] ${
                      selectedNeighborhood.saturationLevel === 'Saturado' ? 'bg-red-50 text-red-600' :
                      selectedNeighborhood.saturationLevel === 'Atenção' ? 'bg-amber-50 text-amber-600' :
                      'bg-emerald-50 text-emerald-600'
                    }`}>
                      {selectedNeighborhood.saturationLevel || 'Saudável'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-slate-500">Concorrência Ativa:</span>
                    <span className="font-black text-slate-800">
                      {selectedNeighborhood.competitorsCount} Incorporações
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-slate-500">Score Potencial:</span>
                    <span className="font-black text-emerald-600">
                      {selectedNeighborhood.potentialScore}%
                    </span>
                  </div>
                </div>

                {/* Gráfico de Evolução Temporal */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="block font-black text-slate-400 uppercase text-[9px] tracking-wider">Evolução do Preço Ofertado (m²)</span>
                    <span className="text-[10px] text-slate-500 font-semibold">Últimos 6 Meses</span>
                  </div>

                  {loadingHistory ? (
                    <div className="h-40 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : neighHistory.length > 0 ? (
                    <div className="h-44 bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={neighHistory.map(h => ({
                          mes: new Date(h.recordedDate).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                          preco: h.pricePerM2Medio
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
                    <div className="h-40 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100 text-[10px] text-slate-400 font-semibold">
                      Sem histórico de dados disponível para este bairro.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Coluna 3: Painel Lateral de Análise de Terreno & Estudos */}
          <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-sm flex flex-col justify-between">
            <div className="space-y-6">
              
              {/* Abas */}
              <div className="flex border-b border-slate-100 pb-1">
                <button
                  onClick={() => setActiveTab('analise')}
                  className={`flex-1 pb-2 text-xs font-black uppercase tracking-wider border-b-2 text-center transition-all ${
                    activeTab === 'analise' 
                      ? 'border-slate-900 text-slate-900' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  🧪 Analisar Área
                </button>
                <button
                  onClick={() => setActiveTab('estudos')}
                  className={`flex-1 pb-2 text-xs font-black uppercase tracking-wider border-b-2 text-center transition-all ${
                    activeTab === 'estudos' 
                      ? 'border-slate-900 text-slate-900' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  📂 Meus Estudos ({savedStudies.length})
                </button>
              </div>

              {activeTab === 'analise' ? (
                <div className="space-y-4">
                  {/* Botão de importação de concorrência */}
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-100 rounded-xl text-xs font-black text-emerald-700 uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    📥 Importar Planilha de Concorrência
                  </button>

                  {terrainPin ? (
                    <>
                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl text-xs space-y-2">
                        <span className="block font-black text-blue-800 uppercase text-[9px] tracking-wider">Terreno Selecionado (Georreferenciado)</span>
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 font-semibold">
                          <span>Lat: {terrainPin.lat.toFixed(6)}</span>
                          <span>Lng: {terrainPin.lng.toFixed(6)}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Estudo</label>
                          <input
                            type="text"
                            required
                            value={studyName}
                            onChange={(e) => setStudyName(e.target.value)}
                            placeholder="Ex: Terreno Centro - Cambuí"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Área do Terreno (m²)</label>
                          <input
                            type="number"
                            value={terrainArea}
                            onChange={(e) => setTerrainArea(e.target.value)}
                            placeholder="Ex: 1500"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Raio de Análise de Concorrência</label>
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

                        <button
                          onClick={handleAnalyzeTerrain}
                          disabled={analyzing}
                          className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          {analyzing ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Analisando...
                            </>
                          ) : '🚀 Calcular Vocação Territorial'}
                        </button>
                      </div>

                      {/* Exibição dos resultados espaciais de vocação do produto */}
                      {analysisResult && (
                        <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-4 animate-fadeIn">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vocação e Recomendação IA</h4>
                          
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="space-y-0.5">
                              <span className="block text-[9px] text-slate-400 font-bold uppercase">Padrão Recomendado</span>
                              <span className="block font-black text-slate-800">{analysisResult.recStandard}</span>
                            </div>
                            <div className="space-y-0.5">
                              <span className="block text-[9px] text-slate-400 font-bold uppercase">Preço Estimado / m²</span>
                              <span className="block font-black text-emerald-600">R$ {analysisResult.stats.pricePerM2Avg.toLocaleString('pt-BR') || '3.500'}/m²</span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="block text-[9px] text-slate-400 font-bold uppercase">Mix de Tipologias Recomendadas</span>
                            <div className="space-y-1">
                              {analysisResult.productMix.tipologias.map((tip: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-[10px] bg-white p-2 rounded-lg border border-slate-100 font-semibold text-slate-600">
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
                              }`}>{analysisResult.riskScore}% (Score)</span>
                            </div>
                          </div>

                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <button
                              onClick={handleSaveStudy}
                              disabled={analyzing}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95"
                            >
                              💾 Salvar Estudo na Organização
                            </button>

                            <button
                              onClick={handleExportPDF}
                              disabled={analyzing}
                              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                              📄 Exportar Relatório PDF
                            </button>

                            {setActiveView && (
                              <button
                                onClick={handleCreateViability}
                                disabled={analyzing}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
                              >
                                🏗️ Criar Viabilidade (IMOVIB)
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-xs font-semibold text-center space-y-2">
                      <span>🗺️</span>
                      <span>Selecione um ponto no mapa territorial para iniciar a análise espacial.</span>
                    </div>
                  )}
                </div>
              ) : (
                /* Aba: Estudos Salvos */
                <div className="space-y-3">
                  {loadingStudies ? (
                    <div className="flex justify-center py-10">
                      <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : savedStudies.length > 0 ? (
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                      {savedStudies.map(study => (
                        <div
                          key={study.id}
                          className="p-3 bg-slate-50 border border-slate-100 hover:bg-slate-100/50 rounded-xl cursor-pointer transition-all flex items-center justify-between group"
                        >
                          <div className="flex-1 min-w-0" onClick={() => handleSelectSavedStudy(study)}>
                            <span className="block text-xs font-bold text-slate-800 truncate">{study.name}</span>
                            <span className="block text-[9px] text-slate-400 font-bold uppercase truncate">
                              Área: {study.terrainArea.toLocaleString('pt-BR')}m² | Raio: {study.analysisRadiusMeters}m
                            </span>
                            {study.estimatedVgv && (
                              <span className="block text-[9px] font-black text-emerald-600">
                                VGV: R$ {study.estimatedVgv.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                              </span>
                            )}
                          </div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteStudy(study.id);
                            }}
                            className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-rose-500 hidden group-hover:flex items-center justify-center text-[10px] active:scale-90 shadow-sm"
                            title="Deletar Estudo"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-xs font-semibold text-center space-y-2">
                      <span>📂</span>
                      <span>Nenhum estudo salvo encontrado nesta organização.</span>
                    </div>
                  )}
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
          cityName={cities.find(c => c.id === selectedCityId)?.name || 'Cambuí'}
          neighborhoods={neighborhoods}
          organizationId={organizationId}
        />
      )}
    </div>
  );
};

export default OpuraMarketModule;
