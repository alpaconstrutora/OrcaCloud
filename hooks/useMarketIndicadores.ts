import React from 'react';
import { opuraMarketService } from '../services/opuraMarketService';
import { useToast } from './useToast';
import type { OpuraMarketCityConfig, OpuraMarketListing } from '../types';
import { REGRAS_PADRAO } from '../utils/opuraMarketVocacao';
import {
  calcularIndicadoresDoBairro,
  hipotesesIndicadoresGravadas,
  precoMedioDaPraca,
  validarHipotesesIndicadores,
  DESCRICAO_HIPOTESES_INDICADORES,
  type DinamicaDoBairro,
  type HipotesesIndicadores,
  type IndicadoresDoBairro,
} from '../utils/opuraMarketIndicadores';

/**
 * Saturação e Score Potencial por bairro (plano 2026-10-10-opura-market-pendencias,
 * item 3): lê a dinâmica medida (RPC SECURITY INVOKER), calcula com as hipóteses
 * da praça e deixa editar e salvar as hipóteses por organização + cidade.
 */
export function useMarketIndicadores(p: {
  organizationId: string;
  cityId: string;
  cityConfig: OpuraMarketCityConfig | null;
  onConfigSalva: (c: OpuraMarketCityConfig) => void;
  /** Muda quando os anúncios são recarregados: relê a dinâmica. */
  listings: OpuraMarketListing[];
  motivoSemOrg: string;
}) {
  const { showToast } = useToast();
  const gravadas = React.useMemo(() => hipotesesIndicadoresGravadas(p.cityConfig?.hipotesesIndicadores), [p.cityConfig]);
  const [hipoteses, setHipoteses] = React.useState<HipotesesIndicadores>(gravadas);
  React.useEffect(() => { setHipoteses(gravadas); }, [gravadas]);

  const erros = validarHipotesesIndicadores(hipoteses);
  const diferentesDasGravadas = DESCRICAO_HIPOTESES_INDICADORES.some((d) => hipoteses[d.chave] !== gravadas[d.chave]);

  const [dinamica, setDinamica] = React.useState<Record<string, DinamicaDoBairro>>({});
  const janela = Number.isFinite(hipoteses.janelaMeses) && hipoteses.janelaMeses >= 1 ? Math.round(hipoteses.janelaMeses) : null;
  React.useEffect(() => {
    if (!p.cityId || janela == null) return;
    let vivo = true;
    opuraMarketService.getDinamicaDosBairros(p.cityId, janela)
      .then((d) => { if (vivo) setDinamica(d); })
      .catch((err) => console.error('Falha ao ler a dinâmica dos bairros:', err));
    return () => { vivo = false; };
  }, [p.cityId, janela, p.listings]);

  const indicadores = React.useMemo<Record<string, IndicadoresDoBairro>>(() => {
    if (erros.length > 0) return {};
    const media = precoMedioDaPraca(Object.values(dinamica));
    return Object.fromEntries(Object.entries(dinamica).map(([id, d]) => [id, calcularIndicadoresDoBairro(d, media, hipoteses)]));
    // erros é derivado de hipoteses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dinamica, hipoteses]);

  const [salvando, setSalvando] = React.useState(false);
  const motivoSalvar = !p.organizationId ? p.motivoSemOrg
    : !p.cityId ? 'Nenhuma praça selecionada.'
    : erros.length > 0 ? 'Corrija as hipóteses antes de salvar.'
    : !diferentesDasGravadas ? 'Nada mudou desde o que está salvo para esta praça.'
    : undefined;

  const salvar = async () => {
    if (motivoSalvar) return;
    setSalvando(true);
    try {
      const salva = await opuraMarketService.saveCityConfig({
        organizationId: p.organizationId,
        cityId: p.cityId,
        rules: p.cityConfig?.rules ?? REGRAS_PADRAO,
        hipotesesIndicadores: { ...hipoteses },
      });
      p.onConfigSalva(salva);
      showToast('Hipóteses dos indicadores salvas para esta praça.');
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao salvar as hipóteses: ' + err.message, 'error');
    } finally {
      setSalvando(false);
    }
  };

  return { indicadores, hipoteses, setHipoteses, gravadas, erros, salvar, salvando, motivoSalvar };
}

export type MarketIndicadores = ReturnType<typeof useMarketIndicadores>;
