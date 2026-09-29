import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintHidroService } from '../services/blueprintHidroService';
import { HIPOTESES_HIDRO_PADRAO, type HipotesesHidro } from '../utils/blueprintMemorialHidro';
import { PERIODOS_DE_RETORNO, type HipotesesPluviais } from '../utils/blueprintPluvial';
import { RUGOSIDADE_DA_CALHA } from '../utils/blueprintCalhas';
import { SECOES_DE_CALHA } from '../utils/blueprintKernel';

/**
 * As PREMISSAS hidrossanitárias do ESTUDO (E3.3, 29/09/2026) — água, pressão e
 * esgoto. Mesmo desenho de `useBlueprintEletrica`: estado local que responde
 * na hora, gravação atrás com respiro.
 *
 * Até aqui elas moravam no `localStorage` (três chaves), e o mesmo estudo
 * calculava diferente em outra máquina — o que a emissão com ART, que amarra o
 * hash delas, não pode aceitar. A passagem:
 *  - o estudo tem linha → vale a linha;
 *  - não tem → adota o que ESTE navegador já tinha ajustado (e grava no estudo);
 *  - sem a tabela (migration ausente) → segue como antes, no navegador.
 */
export interface HidroDoEstudo {
  hipoteses: HipotesesHidro;
  setHipoteses: (h: HipotesesHidro) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

/** As chaves antigas do navegador (antes de E3.3). */
export const CHAVES_DO_NAVEGADOR = { agua: 'blueprint:aguaAutomatica', pressao: 'blueprint:pressaoDaAgua', esgoto: 'blueprint:esgotoAutomatico' } as const;

/**
 * Premissas em que `null` é valor legítimo (`rotaMaximaVezes: null` = sem limite;
 * E6.1: `cidade` e `intensidadeMmH` nulas = sem cidade escolhida, usar a tabela).
 */
const ANULAVEIS = new Map<string, 'number' | 'string'>([['rotaMaximaVezes', 'number'], ['cidade', 'string'], ['intensidadeMmH', 'number']]);

/** Um grupo parcial completado com o padrão — só entra valor do MESMO tipo (sem chaves estranhas). */
function completar<T extends object>(raw: unknown, padrao: T): T {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const saida = { ...padrao } as Record<string, unknown>;
  for (const [k, v] of Object.entries(padrao)) {
    const x = r[k];
    if (x === undefined) continue;
    if (typeof v === 'number' && typeof x === 'number' && Number.isFinite(x)) saida[k] = x;
    else if (typeof v === 'boolean' && typeof x === 'boolean') saida[k] = x;
    else if (typeof v === 'string' && typeof x === 'string') saida[k] = x;
    else if (x === null && ANULAVEIS.has(k)) saida[k] = null;
    // Anulável com padrão nulo: o valor gravado vale se for do tipo da premissa (E6.1).
    else if (v === null && ANULAVEIS.get(k) === 'number' && typeof x === 'number' && Number.isFinite(x)) saida[k] = x;
    else if (v === null && ANULAVEIS.get(k) === 'string' && typeof x === 'string') saida[k] = x;
  }
  return saida as T;
}

/** O JSON gravado `{ agua, pressao, esgoto }`, completado com o padrão. */
/**
 * As premissas pluviais gravadas. Só vale o que a norma e o sistema conhecem:
 * período 1/5/25, seção de calha do kernel, material da tabela de rugosidade.
 */
function pluvialDaColuna(raw: unknown): HipotesesPluviais {
  const padrao = HIPOTESES_HIDRO_PADRAO.pluvial;
  const p = completar(raw, padrao);
  return {
    ...p,
    periodoDeRetornoAnos: (PERIODOS_DE_RETORNO as readonly number[]).includes(p.periodoDeRetornoAnos) ? p.periodoDeRetornoAnos : padrao.periodoDeRetornoAnos,
    secaoDaCalha: (SECOES_DE_CALHA as readonly string[]).includes(p.secaoDaCalha) ? p.secaoDaCalha : padrao.secaoDaCalha,
    materialDaCalha: p.materialDaCalha in RUGOSIDADE_DA_CALHA ? p.materialDaCalha : padrao.materialDaCalha,
  };
}

export function hipotesesHidroDaColuna(raw: unknown): HipotesesHidro {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    agua: completar(r.agua, HIPOTESES_HIDRO_PADRAO.agua),
    pressao: completar(r.pressao, HIPOTESES_HIDRO_PADRAO.pressao),
    esgoto: completar(r.esgoto, HIPOTESES_HIDRO_PADRAO.esgoto),
    reservatorio: completar(r.reservatorio, HIPOTESES_HIDRO_PADRAO.reservatorio),
    alimentacao: completar(r.alimentacao, HIPOTESES_HIDRO_PADRAO.alimentacao),
    recalque: completar(r.recalque, HIPOTESES_HIDRO_PADRAO.recalque),
    pluvial: pluvialDaColuna(r.pluvial),
    tratamento: completar(r.tratamento, HIPOTESES_HIDRO_PADRAO.tratamento),
  };
}

/** O que este navegador tinha nas chaves antigas; `null` se nada. */
export function hipotesesDoNavegador(): HipotesesHidro | null {
  if (typeof window === 'undefined') return null;
  const ler = (k: string) => {
    try {
      const s = localStorage.getItem(k);
      return s ? (JSON.parse(s) as unknown) : undefined;
    } catch {
      return undefined;
    }
  };
  const agua = ler(CHAVES_DO_NAVEGADOR.agua);
  const pressao = ler(CHAVES_DO_NAVEGADOR.pressao);
  const esgoto = ler(CHAVES_DO_NAVEGADOR.esgoto);
  if (agua === undefined && pressao === undefined && esgoto === undefined) return null;
  return hipotesesHidroDaColuna({ agua, pressao, esgoto });
}

function gravarNoNavegador(h: HipotesesHidro): void {
  try {
    localStorage.setItem(CHAVES_DO_NAVEGADOR.agua, JSON.stringify(h.agua));
    localStorage.setItem(CHAVES_DO_NAVEGADOR.pressao, JSON.stringify(h.pressao));
    localStorage.setItem(CHAVES_DO_NAVEGADOR.esgoto, JSON.stringify(h.esgoto));
  } catch {
    // navegador sem armazenamento: vale só na sessão
  }
}

export function useBlueprintHidro(studyId: string, organizationId: string): HidroDoEstudo {
  const [hipoteses, setLocal] = useState<HipotesesHidro>(() => hipotesesDoNavegador() ?? HIPOTESES_HIDRO_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintHidroService.get(studyId);
        if (!vivo) return;
        if (row) {
          setLocal(hipotesesHidroDaColuna(row.hipoteses));
        } else {
          // Estudo sem premissas próprias: adota as do navegador e grava no estudo.
          const doNavegador = hipotesesDoNavegador();
          setLocal(doNavegador ?? HIPOTESES_HIDRO_PADRAO);
          if (doNavegador) {
            blueprintHidroService.save(studyId, organizationId, doNavegador).catch((e) => console.warn('[hidro] não gravou as premissas adotadas:', e));
          }
        }
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[hidro] premissas sem persistência no estudo (migration ausente?) — seguem no navegador:', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId, organizationId]);

  const setHipoteses = useCallback(
    (h: HipotesesHidro) => {
      setLocal(h);
      if (persistenciaIndisponivel) {
        gravarNoNavegador(h);
        return;
      }
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        blueprintHidroService.save(studyId, organizationId, h).catch((e) => console.warn('[hidro] não gravou as premissas:', e));
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  return { hipoteses, setHipoteses, carregando, persistenciaIndisponivel };
}
