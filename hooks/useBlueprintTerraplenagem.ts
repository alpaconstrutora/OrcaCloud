import { useCallback, useEffect, useRef, useState } from 'react';
import { blueprintTerraplenagemService } from '../services/blueprintTerraplenagemService';

export type BaseDoPlato = 'ENVELOPE' | 'LOTE';

/**
 * A premissa de terraplenagem do estudo: base e cota do platô.
 *
 * Mesmo desenho de `useBlueprintZonaUrbanistica`: estado local que responde na
 * hora, gravação atrás, e degradação sem a migration (`persistenciaIndisponivel`)
 * — a tela continua funcionando em memória, e diz que não está gravando.
 *
 * A CONTA (corte, aterro, equilíbrio) não mora aqui: o editor a deriva da
 * versão de topografia exibida × esta premissa, com as funções puras.
 */
export interface Terraplenagem {
  base: BaseDoPlato;
  setBase: (b: BaseDoPlato) => void;
  /** `null` = usar a cota de equilíbrio. */
  cotaPlatoM: number | null;
  setCotaPlatoM: (v: number | null) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

export function useBlueprintTerraplenagem(studyId: string, organizationId: string): Terraplenagem {
  const [base, setBaseLocal] = useState<BaseDoPlato>('ENVELOPE');
  const [cotaPlatoM, setCotaLocal] = useState<number | null>(null);
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
    (proximo: { base: BaseDoPlato; cota_plato_m: number | null }) => {
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

  const setBase = useCallback(
    (b: BaseDoPlato) => {
      setBaseLocal(b);
      persistir({ base: b, cota_plato_m: cotaPlatoM });
    },
    [persistir, cotaPlatoM],
  );

  const setCotaPlatoM = useCallback(
    (v: number | null) => {
      setCotaLocal(v);
      persistir({ base, cota_plato_m: v });
    },
    [persistir, base],
  );

  return { base, setBase, cotaPlatoM, setCotaPlatoM, carregando, persistenciaIndisponivel };
}
