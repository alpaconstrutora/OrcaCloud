import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '../utils/blueprintKernel';
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
 * A premissa de terraplenagem do estudo: base e cota do platô; talude,
 * empolamento e contração (fase 3); banqueta, via de serviço, talude por
 * aresta e as linhas desenhadas do perfil (fases 4 e 5).
 *
 * Mesmo desenho de `useBlueprintZonaUrbanistica`: estado local que responde na
 * hora, gravação atrás com respiro, e degradação sem a migration
 * (`persistenciaIndisponivel`). A CONTA não mora aqui.
 */
export interface Terraplenagem {
  base: BaseDoPlato;
  setBase: (b: BaseDoPlato) => void;
  /** `null` = usar a cota de equilíbrio. */
  cotaPlatoM: number | null;
  setCotaPlatoM: (v: number | null) => void;
  parametros: ParametrosDeTerraplenagem;
  setParametros: (patch: Partial<ParametrosDeTerraplenagem>) => void;
  /** As linhas desenhadas do perfil (fase 5: várias por estudo), cada uma com ≥ 2 pontos. */
  linhasDoPerfil: Point[][];
  /** Acrescenta uma linha e devolve o índice dela. Menos de 2 pontos não entra (−1). */
  adicionarLinhaDoPerfil: (pontos: Point[]) => number;
  removerLinhaDoPerfil: (indice: number) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

/** Linha anterior às fases 3/4 vem sem as colunas: caem nos padrões. */
function parametrosDaLinha(row: {
  talude_corte_h?: number | null;
  talude_aterro_h?: number | null;
  empolamento_pct?: number | null;
  contracao_pct?: number | null;
  altura_do_lance_m?: number | null;
  largura_da_banqueta_m?: number | null;
  largura_da_via_m?: number | null;
  talude_por_aresta?: ParametrosDeTerraplenagem['taludePorAresta'] | null;
}): ParametrosDeTerraplenagem {
  const n = (v: number | null | undefined, padrao: number) => (v === null || v === undefined ? padrao : Number(v));
  return {
    taludeCorteH: n(row.talude_corte_h, PARAMETROS_PADRAO.taludeCorteH),
    taludeAterroH: n(row.talude_aterro_h, PARAMETROS_PADRAO.taludeAterroH),
    empolamentoPct: n(row.empolamento_pct, PARAMETROS_PADRAO.empolamentoPct),
    contracaoPct: n(row.contracao_pct, PARAMETROS_PADRAO.contracaoPct),
    alturaDoLanceM: n(row.altura_do_lance_m, PARAMETROS_PADRAO.alturaDoLanceM ?? 6),
    larguraDaBanquetaM: n(row.largura_da_banqueta_m, PARAMETROS_PADRAO.larguraDaBanquetaM ?? 2),
    larguraDaViaM: n(row.largura_da_via_m, PARAMETROS_PADRAO.larguraDaViaM ?? 0),
    taludePorAresta: Array.isArray(row.talude_por_aresta) ? row.talude_por_aresta : [],
  };
}

function ehPonto(v: unknown): v is Point {
  return !!v && typeof v === 'object' && typeof (v as Point).x === 'number' && typeof (v as Point).y === 'number';
}

/**
 * O que está gravado em `perfil_polilinha`: a fase 4 guardava UMA linha
 * (`[{x,y}, …]`); a fase 5 guarda a lista (`[[{x,y}, …], …]`). Lê as duas
 * formas e devolve sempre a lista, sem linha com menos de 2 pontos.
 */
export function linhasDoPerfilDaColuna(raw: unknown): Point[][] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const listas: unknown[] = ehPonto(raw[0]) ? [raw] : raw;
  return listas
    .filter((l): l is Point[] => Array.isArray(l) && l.length >= 2 && l.every(ehPonto))
    .map((l) => l.map((p) => ({ x: p.x, y: p.y })));
}

export function useBlueprintTerraplenagem(studyId: string, organizationId: string): Terraplenagem {
  const [base, setBaseLocal] = useState<BaseDoPlato>('ENVELOPE');
  const [cotaPlatoM, setCotaLocal] = useState<number | null>(null);
  const [parametros, setParametrosLocal] = useState<ParametrosDeTerraplenagem>(PARAMETROS_PADRAO);
  const [linhasDoPerfil, setLinhasLocal] = useState<Point[][]>([]);
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
          setParametrosLocal(parametrosDaLinha(row));
          setLinhasLocal(linhasDoPerfilDaColuna(row.perfil_polilinha));
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
    (b: BaseDoPlato, cota: number | null, p: ParametrosDeTerraplenagem, linhas: Point[][]): PremissaDeTerraplenagem => ({
      base: b,
      cota_plato_m: cota,
      talude_corte_h: p.taludeCorteH,
      talude_aterro_h: p.taludeAterroH,
      empolamento_pct: p.empolamentoPct,
      contracao_pct: p.contracaoPct,
      altura_do_lance_m: p.alturaDoLanceM ?? 6,
      largura_da_banqueta_m: p.larguraDaBanquetaM ?? 2,
      largura_da_via_m: p.larguraDaViaM ?? 0,
      talude_por_aresta: p.taludePorAresta ?? [],
      perfil_polilinha: linhas.length > 0 ? linhas : null,
    }),
    [],
  );

  const setBase = useCallback(
    (b: BaseDoPlato) => {
      setBaseLocal(b);
      persistir(premissa(b, cotaPlatoM, parametros, linhasDoPerfil));
    },
    [persistir, premissa, cotaPlatoM, parametros, linhasDoPerfil],
  );

  const setCotaPlatoM = useCallback(
    (v: number | null) => {
      setCotaLocal(v);
      persistir(premissa(base, v, parametros, linhasDoPerfil));
    },
    [persistir, premissa, base, parametros, linhasDoPerfil],
  );

  const setParametros = useCallback(
    (patch: Partial<ParametrosDeTerraplenagem>) => {
      const proximo = { ...parametros, ...patch };
      setParametrosLocal(proximo);
      persistir(premissa(base, cotaPlatoM, proximo, linhasDoPerfil));
    },
    [persistir, premissa, base, cotaPlatoM, parametros, linhasDoPerfil],
  );

  const adicionarLinhaDoPerfil = useCallback(
    (pontos: Point[]) => {
      if (pontos.length < 2) return -1;
      const linhas = [...linhasDoPerfil, pontos.map((p) => ({ x: p.x, y: p.y }))];
      setLinhasLocal(linhas);
      persistir(premissa(base, cotaPlatoM, parametros, linhas));
      return linhas.length - 1;
    },
    [persistir, premissa, base, cotaPlatoM, parametros, linhasDoPerfil],
  );

  const removerLinhaDoPerfil = useCallback(
    (indice: number) => {
      if (indice < 0 || indice >= linhasDoPerfil.length) return;
      const linhas = linhasDoPerfil.filter((_, i) => i !== indice);
      setLinhasLocal(linhas);
      persistir(premissa(base, cotaPlatoM, parametros, linhas));
    },
    [persistir, premissa, base, cotaPlatoM, parametros, linhasDoPerfil],
  );

  return {
    base,
    setBase,
    cotaPlatoM,
    setCotaPlatoM,
    parametros,
    setParametros,
    linhasDoPerfil,
    adicionarLinhaDoPerfil,
    removerLinhaDoPerfil,
    carregando,
    persistenciaIndisponivel,
  };
}
