import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintEletricaService } from '../services/blueprintEletricaService';
import {
  HIPOTESES_PADRAO,
  METODOS_DE_INSTALACAO,
  type HipotesesEletricas,
  type MetodoDeInstalacao,
} from '../utils/blueprintEletricaDimensionamento';
import { EXPOSICOES_A_RAIOS, type ExposicaoARaios } from '../utils/blueprintEletricaDimensionamento';

/**
 * As HIPÓTESES do pré-dimensionamento elétrico do estudo (F7, 13/09/2026).
 *
 * Mesmo desenho de `useBlueprintTerraplenagem`: estado local que responde na
 * hora, gravação atrás com respiro, degradação sem a migration
 * (`persistenciaIndisponivel` — aí vale só na sessão). Até aqui elas moravam
 * no `localStorage` do navegador, o que fazia duas pessoas verem cálculos
 * diferentes do mesmo estudo; a emissão executiva amarra o hash delas, então
 * precisam ser do ESTUDO.
 */
export interface EletricaDoEstudo {
  hipoteses: HipotesesEletricas;
  setHipoteses: (h: HipotesesEletricas) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

/** O JSON parcial gravado, completado com o padrão (e sem chaves estranhas). */
export function hipotesesDaColuna(raw: unknown): HipotesesEletricas {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<HipotesesEletricas>;
  const n = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
  const d = (r.demanda && typeof r.demanda === 'object' ? r.demanda : {}) as Partial<HipotesesEletricas['demanda']>;
  return {
    metodoDeInstalacao: (METODOS_DE_INSTALACAO as readonly string[]).includes(String(r.metodoDeInstalacao))
      ? (r.metodoDeInstalacao as MetodoDeInstalacao)
      : HIPOTESES_PADRAO.metodoDeInstalacao,
    temperaturaAmbienteC: n(r.temperaturaAmbienteC, HIPOTESES_PADRAO.temperaturaAmbienteC),
    circuitosAgrupados: Math.max(1, Math.floor(n(r.circuitosAgrupados, HIPOTESES_PADRAO.circuitosAgrupados))),
    rhoOhmMm2PorM: n(r.rhoOhmMm2PorM, HIPOTESES_PADRAO.rhoOhmMm2PorM),
    limiteQuedaTerminalPct: n(r.limiteQuedaTerminalPct, HIPOTESES_PADRAO.limiteQuedaTerminalPct),
    // O catálogo de disjuntores NÃO é editado pela tela: vale sempre o padrão
    // (a série comercial). Antes a coluna gravada congelava a lista antiga
    // (com 6 A) em cada estudo que já tinha salvo hipóteses — 15/09/2026.
    catalogoDeDisjuntoresA: HIPOTESES_PADRAO.catalogoDeDisjuntoresA,
    // Chave de 14/09/2026: coluna gravada antes dela não a tem — vale o padrão.
    secaoMinimaTueMm2: Math.max(0, n(r.secaoMinimaTueMm2, HIPOTESES_PADRAO.secaoMinimaTueMm2)),
    demanda: {
      nome: typeof d.nome === 'string' && d.nome.trim() ? d.nome : HIPOTESES_PADRAO.demanda.nome,
      ILUMINACAO: n(d.ILUMINACAO, 1),
      TUG: n(d.TUG, 1),
      FORCA: n(d.FORCA, 1),
      // E1.1: coluna gravada antes do grupo MOTOR não o tem — vale 1,00.
      MOTOR: n(d.MOTOR, 1),
      // E4.2: fonte e data da tabela, quando informadas.
      fonte: typeof d.fonte === 'string' && d.fonte.trim() ? d.fonte : null,
      dataISO: typeof d.dataISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.dataISO) ? d.dataISO : null,
    },
    limiteQuedaTotalPct: n(r.limiteQuedaTotalPct, HIPOTESES_PADRAO.limiteQuedaTotalPct),
    desequilibrioMaxPct: n(r.desequilibrioMaxPct, HIPOTESES_PADRAO.desequilibrioMaxPct),
    // As tabelas de catálogo (F9) não são editadas pela tela ainda: sempre o padrão.
    diametroExternoCondutorMm: HIPOTESES_PADRAO.diametroExternoCondutorMm,
    diametroInternoEletrodutoMm: HIPOTESES_PADRAO.diametroInternoEletrodutoMm,
    // E3.1: o catálogo de DR é sempre o padrão (como o de disjuntores); o máximo por grupo é editável.
    catalogoDeDrA: HIPOTESES_PADRAO.catalogoDeDrA,
    maxCircuitosPorDR: Math.max(1, Math.floor(n(r.maxCircuitosPorDR, HIPOTESES_PADRAO.maxCircuitosPorDR))),
    // E3.2: a exposição a raios é do lugar — gravada; o DPS padrão é catálogo, sempre o padrão.
    exposicaoARaios: (EXPOSICOES_A_RAIOS as readonly string[]).includes(String(r.exposicaoARaios)) ? (r.exposicaoARaios as ExposicaoARaios) : HIPOTESES_PADRAO.exposicaoARaios,
    dpsPadrao: HIPOTESES_PADRAO.dpsPadrao,
    // E3.3: a Ik presumida é do lugar — gravada.
    ikEntradaKa: Math.max(0.1, n(r.ikEntradaKa, HIPOTESES_PADRAO.ikEntradaKa)),
    // E4.2: transformador próprio — gravado.
    origemComTransformador: r.origemComTransformador === true,
  };
}

export function useBlueprintEletrica(studyId: string, organizationId: string): EletricaDoEstudo {
  const [hipoteses, setLocal] = useState<HipotesesEletricas>(HIPOTESES_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintEletricaService.get(studyId);
        if (!vivo) return;
        setLocal(row ? hipotesesDaColuna(row.hipoteses) : HIPOTESES_PADRAO);
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[elétrica] hipóteses sem persistência (migration ausente?):', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  const setHipoteses = useCallback(
    (h: HipotesesEletricas) => {
      setLocal(h);
      if (persistenciaIndisponivel) return;
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        blueprintEletricaService
          .save(studyId, organizationId, h)
          .catch((e) => console.warn('[elétrica] não gravou as hipóteses:', e));
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { hipoteses, setHipoteses, carregando, persistenciaIndisponivel };
}
