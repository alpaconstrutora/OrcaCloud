import React from 'react';
import { opuraMarketService } from '../services/opuraMarketService';
import { supabase } from '../lib/supabase';
import { useToast } from './useToast';
import { useConfirm } from '../components/ui/confirm';
import type { OpuraMarketRadiusStats, OpuraMarketRule, OpuraMarketTerrainStudy } from '../types';
import {
  calcularVocacao,
  validarHipoteses,
  hipotesesDoEstudo,
  HIPOTESES_PADRAO,
  DESCRICAO_HIPOTESES,
  type HipotesesVocacao,
  type ResultadoVocacao,
} from '../utils/opuraMarketVocacao';

/**
 * Resultado exibido no painel de estudo. `stats` é null só para estudo salvo
 * antes de 07/10/2026, quando as estatísticas do raio não eram guardadas.
 */
export type ResultadoNaTela = Omit<ResultadoVocacao, 'stats'> & { stats: OpuraMarketRadiusStats | null };

export type Ponto = { lat: number; lng: number };

const carimbo = () =>
  `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

/**
 * Estado do estudo de vocação do ÒPURA Market: ponto ou lote desenhado, área,
 * raio, hipóteses (Fase 5), resultado e estudos salvos da organização. Saiu de
 * OpuraMarketModule.tsx na Fase 6 do plano 2026-10-07-opura-market-intelligence.md.
 */
export function useMarketVocacao(organizationId: string, regrasDaPraca: OpuraMarketRule[] | null | undefined) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [terrainPin, setTerrainPin] = React.useState<Ponto | null>(null);
  const [isDrawingPolygon, setIsDrawingPolygon] = React.useState(false);
  const [drawingPoints, setDrawingPoints] = React.useState<[number, number][]>([]);
  const [polygonPoints, setPolygonPoints] = React.useState<[number, number][] | null>(null);

  const [studyName, setStudyName] = React.useState('');
  const [terrainArea, setTerrainArea] = React.useState('1500');
  const [analysisRadius, setAnalysisRadius] = React.useState('1000');
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<ResultadoNaTela | null>(null);

  // Folgas do cálculo, editáveis na tela (Fase 5). Padrão = os números que antes
  // eram constantes no código.
  const [hipoteses, setHipoteses] = React.useState<HipotesesVocacao>(HIPOTESES_PADRAO);
  const errosHipoteses = validarHipoteses(hipoteses);
  const hipotesesAlteradas = DESCRICAO_HIPOTESES.filter(d => hipoteses[d.chave] !== HIPOTESES_PADRAO[d.chave]).length;

  const [savedStudies, setSavedStudies] = React.useState<OpuraMarketTerrainStudy[]>([]);
  const [loadingStudies, setLoadingStudies] = React.useState(false);

  // Mudou hipótese, área ou regra da praça: refaz o cálculo sobre as MESMAS
  // estatísticas do raio, sem nova consulta.
  React.useEffect(() => {
    setAnalysisResult(prev => {
      if (!prev?.stats || validarHipoteses(hipoteses).length > 0) return prev;
      const area = parseFloat(terrainArea);
      if (!(area > 0)) return prev;
      return calcularVocacao(prev.stats, area, regrasDaPraca, hipoteses);
    });
  }, [hipoteses, terrainArea, regrasDaPraca]);

  const loadSavedStudies = React.useCallback(async () => {
    try {
      setLoadingStudies(true);
      setSavedStudies(await opuraMarketService.listTerrainStudies(organizationId));
    } catch (err) {
      console.error('Erro ao buscar estudos salvos:', err);
    } finally {
      setLoadingStudies(false);
    }
  }, [organizationId]);

  React.useEffect(() => { loadSavedStudies(); }, [loadSavedStudies]);

  /** Clique no mapa fora do modo de desenho. */
  const marcarPonto = React.useCallback((p: Ponto) => {
    setTerrainPin(p);
    setAnalysisResult(null);
    setStudyName(`Estudo Terreno - ${carimbo()}`);
  }, []);

  const iniciarDesenho = () => {
    setIsDrawingPolygon(true);
    setDrawingPoints([]);
    setPolygonPoints(null);
    setTerrainPin(null);
    setAnalysisResult(null);
  };

  const cancelarDesenho = () => {
    setIsDrawingPolygon(false);
    setDrawingPoints([]);
  };

  const adicionarVertice = React.useCallback((p: Ponto) => {
    setDrawingPoints(prev => [...prev, [p.lat, p.lng]]);
  }, []);

  /** Fecha o polígono, mede a área no PostGIS e devolve o centroide (ou null se falhou). */
  const concluirDesenho = async (): Promise<Ponto | null> => {
    if (drawingPoints.length < 3) {
      showToast('Desenhe pelo menos 3 pontos no mapa para formar o polígono do terreno.', 'error');
      return null;
    }
    try {
      setAnalyzing(true);
      // GeoJSON usa [lng, lat] e o anel fecha no primeiro ponto.
      const anel = drawingPoints.map(p => [p[1], p[0]]);
      anel.push([drawingPoints[0][1], drawingPoints[0][0]]);
      const area = await opuraMarketService.calculatePolygonArea({ type: 'Polygon', coordinates: [anel] });

      setTerrainArea(area.toString());
      setPolygonPoints(drawingPoints);
      const centro = {
        lat: drawingPoints.reduce((s, p) => s + p[0], 0) / drawingPoints.length,
        lng: drawingPoints.reduce((s, p) => s + p[1], 0) / drawingPoints.length,
      };
      setTerrainPin(centro);
      setIsDrawingPolygon(false);
      setDrawingPoints([]);
      setStudyName(`Estudo Terreno - Polígono ${carimbo()}`);
      return centro;
    } catch (err: any) {
      console.error('Erro ao calcular a área do polígono:', err);
      showToast('Não foi possível calcular a área do polígono: ' + err.message, 'error');
      return null;
    } finally {
      setAnalyzing(false);
    }
  };

  /** Análise de raio no PostGIS + cálculo de vocação com as hipóteses da tela. */
  const analisar = async () => {
    if (!terrainPin) {
      showToast('Selecione uma área no mapa primeiro clicando em qualquer ponto.', 'error');
      return;
    }
    if (errosHipoteses.length > 0) {
      showToast('Corrija as hipóteses do cálculo: ' + errosHipoteses.join(' '), 'error');
      return;
    }
    const areaTerreno = parseFloat(terrainArea);
    if (!(areaTerreno > 0)) {
      showToast('Informe a área do terreno.', 'error');
      return;
    }
    try {
      setAnalyzing(true);
      const stats = await opuraMarketService.getTerrainRadiusStats(terrainPin.lat, terrainPin.lng, parseInt(analysisRadius));
      if (!stats || stats.totalListings === 0 || stats.pricePerM2Avg <= 0) {
        showToast('Não foram encontrados anúncios concorrentes nesta região para o raio selecionado. Importe anúncios para esta área ou aumente o raio de busca.', 'error');
        setAnalysisResult(null);
        return;
      }
      setAnalysisResult(calcularVocacao(stats, areaTerreno, regrasDaPraca, hipoteses));
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao realizar análise espacial: ' + err.message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const salvar = async (endereco: string | null) => {
    if (!terrainPin || !analysisResult || !studyName.trim() || !organizationId) return;
    try {
      setAnalyzing(true);
      const { data: { user } } = await supabase.auth.getUser();
      const h = analysisResult.hipoteses;
      await opuraMarketService.createTerrainStudy({
        organizationId,
        name: studyName,
        address: endereco,
        terrainArea: parseFloat(terrainArea),
        // As hipóteses usadas no cálculo vão junto: reabrir o estudo refaz a mesma conta.
        coefficientsZone: { zone: 'ZUM', ca: h.coeficienteAproveitamento, to: h.taxaOcupacao / 100, hipoteses: h },
        analysisRadiusMeters: parseInt(analysisRadius),
        latitude: terrainPin.lat,
        longitude: terrainPin.lng,
        recommendedProductMix: analysisResult.productMix,
        recommendedStandard: analysisResult.recStandard,
        estimatedVgv: analysisResult.estimatedVgv,
        estimatedAbsorptionVelocity: analysisResult.estimatedAbsorptionVelocity,
        riskScore: analysisResult.riskScore,
        createdBy: user?.email || 'sistema@opura.com.br',
        polygonGeom: polygonPoints ? polygonPoints.map(p => [p[1], p[0]] as [number, number]) : null,
        radiusStats: analysisResult.stats ?? null,
      });
      showToast('Estudo territorial salvo na organização.');
      loadSavedStudies();
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao salvar estudo: ' + err.message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const excluirEstudo = async (study: OpuraMarketTerrainStudy) => {
    const ok = await confirm({
      title: 'Excluir estudo?',
      message: `O estudo "${study.name}" será excluído da organização.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await opuraMarketService.deleteTerrainStudy(study.id);
      showToast('Estudo excluído.');
      loadSavedStudies();
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao excluir estudo: ' + err.message, 'error');
    }
  };

  /** Reabre um estudo salvo: ponto, lote, área, raio e as hipóteses gravadas nele. */
  const abrirEstudo = (study: OpuraMarketTerrainStudy) => {
    setTerrainPin({ lat: study.latitude, lng: study.longitude });
    setStudyName(study.name);
    setTerrainArea(study.terrainArea.toString());
    setAnalysisRadius(study.analysisRadiusMeters.toString());
    setPolygonPoints(study.polygonGeom && study.polygonGeom.length >= 3
      ? study.polygonGeom.map(p => [p[1], p[0]] as [number, number])
      : null);

    // Estatísticas do entorno: as GRAVADAS na análise. Estudo antigo (antes de
    // 07/10/2026) não as tem e a tela diz "não guardadas". Hipóteses: as gravadas
    // no estudo (estudo antigo: só CA e TO).
    const hEstudo = hipotesesDoEstudo(study.coefficientsZone);
    setHipoteses(hEstudo);
    setAnalysisResult(study.radiusStats
      ? calcularVocacao(study.radiusStats, study.terrainArea, regrasDaPraca, hEstudo)
      : {
          stats: null,
          recStandard: study.recommendedStandard ?? 'Médio',
          productMix: study.recommendedProductMix ?? { tipologias: [], ticketSugerido: 0 },
          estimatedVgv: study.estimatedVgv ?? 0,
          estimatedAbsorptionVelocity: study.estimatedAbsorptionVelocity ?? 0,
          riskScore: study.riskScore ?? 0,
          areaConstruivel: study.terrainArea * hEstudo.coeficienteAproveitamento,
          areaVenda: study.terrainArea * hEstudo.coeficienteAproveitamento * hEstudo.eficienciaVenda,
          hipoteses: hEstudo,
        });
  };

  return {
    terrainPin, isDrawingPolygon, drawingPoints, polygonPoints,
    studyName, setStudyName, terrainArea, setTerrainArea, analysisRadius, setAnalysisRadius,
    analyzing, setAnalyzing, analysisResult, setAnalysisResult,
    hipoteses, setHipoteses, errosHipoteses, hipotesesAlteradas,
    savedStudies, loadingStudies,
    marcarPonto, iniciarDesenho, cancelarDesenho, adicionarVertice, concluirDesenho,
    analisar, salvar, excluirEstudo, abrirEstudo,
  };
}

export type MarketVocacao = ReturnType<typeof useMarketVocacao>;
