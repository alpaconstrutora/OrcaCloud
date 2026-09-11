import { useCallback, useEffect, useRef, useState } from 'react';
import {
  blueprintTerraplenagemService,
  type PremissaDeTerraplenagem,
} from '../services/blueprintTerraplenagemService';
import {
  PARAMETROS_PADRAO,
  type ParametrosDeTerraplenagem,
} from '../utils/blueprintTopografiaAnalises';

export type BaseDoPlato = 'ENVELOPE' | 'LOTE';

/**
 * A premissa de terraplenagem do estudo: base e cota do platô, e (fase 3)
 * talude, empolamento e contração.
 *
 * Mesmo desenho de `useBlueprintZonaUrbanistica`: estado local que responde na
 * hora, gravação atrás, e degradação sem a migration (`persistenciaIndisponivel`)
 * — a tela continua funcionando em memória, e diz que não está gravando.
 *
 * A CONTA (corte, aterro, talude, balanço) não mora aqui: o editor a deriva da
 * versão de topografia exibida × esta premissa, com as funções puras.
 */
export interface Terraplenagem {
  base: BaseDoPlato;
  setBase: (b: BaseDoPlato) => void;
  /** `null` = usar a cota de equilíbrio. */
  cotaPlatoM: number | null;
  setCotaPlatoM: (v: number | null) => void;
  parametros: ParametrosDeTerraplenagem;
  setParametros: (patch: Partial<ParametrosDeTerraplenagem>) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

export function useBlueprintTerraplenagem(studyId: string, organizationId: string): Terraplenagem {
  const [base, setBaseLocal] = useState<BaseDoPlato>('ENVELOPE');
  const [cotaPlatoM, setCotaLocal] = useState<number | null>(null);
  const [parametros, setParametrosLocal] = useState<ParametrosDeTerraplenagem>(PARAMETROS_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacao = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const row = await blueprintTerraplenagemService.get(studyId);
        if (!vivo) return;
        if (row) {
          setBaseLocal(row.base);
          setCotaLocal(row.cota_plato_m);
          // Linha anterior à fase 3 vem sem as colunas: caem nos padrões.
          setParametrosLocal({
            taludeCorteH: Number(row.talude_corte_h ?? PARAMETROS_PADRAO.taludeCorteH),
            taludeAterroH: Number(row.talude_aterro_h ?? PARAMETROS_PADRAO.taludeAterroH),
            empolamentoPct: Number(row.empolamento_pct ?? PARAMETROS_PADRAO.empolamentoPct),
            contracaoPct: Number(row.contracao_pct ?? PARAMETROS_PADRAO.contracaoPct),
          });
        }
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[terraplenagem] persistência indisponível:', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  // Grava com um respiro: a cota é digitada dígito a dígito, e cada tecla
  // virar um upsert seria uma requisição por caractere.
  const persistir = useCallback(
    (proximo: PremissaDeTerraplenagem) => {
      if (persistenciaIndisponivel) return;
      if (gravacao.current) clearTimeout(gravacao.current);
      gravacao.current = setTimeout(() => {
        blueprintTerraplenagemService
          .save(studyId, organizationId, proximo)
          .catch((e) => console.warn('[terraplenagem] não gravou:', e));
      }, 500);
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  const premissa = useCallback(
    (
      b: BaseDoPlato,
      cota: number | null,
      p: ParametrosDeTerraplenagem,
    ): PremissaDeTerraplenagem => ({
      base: b,
      cota_plato_m: cota,
      talude_corte_h: p.taludeCorteH,
      talude_aterro_h: p.taludeAterroH,
      empolamento_pct: p.empolamentoPct,
      contracao_pct: p.contracaoPct,
    }),
    [],
  );

  const setBase = useCallback(
    (b: BaseDoPlato) => {
      setBaseLocal(b);
      persistir(premissa(b, cotaPlatoM, parametros));
    },
    [persistir, premissa, cotaPlatoM, parametros],
  );

  const setCotaPlatoM = useCallback(
    (v: number | null) => {
      setCotaLocal(v);
      persistir(premissa(base, v, parametros));
    },
    [persistir, premissa, base, parametros],
  );

  const setParametros = useCallback(
    (patch: Partial<ParametrosDeTerraplenagem>) => {
      const proximo = { ...parametros, ...patch };
      setParametrosLocal(proximo);
      persistir(premissa(base, cotaPlatoM, proximo));
    },
    [persistir, premissa, base, cotaPlatoM, parametros],
  );

  return {
    base,
    setBase,
    cotaPlatoM,
    setCotaPlatoM,
    parametros,
    setParametros,
    carregando,
    persistenciaIndisponivel,
  };
}
