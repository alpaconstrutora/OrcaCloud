import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '../utils/blueprintKernel';
import {
  blueprintTerraplenagemService,
  type PremissaDeTerraplenagem,
} from '../services/blueprintTerraplenagemService';
import {
  PARAMETROS_PADRAO,
  type LinhaDeDrenagem,
  type ParametrosDeTerraplenagem,
  type TipoDeDrenagem,
} from '../utils/blueprintTopografiaAnalises';
import {
  ESTRUTURA_PADRAO,
  HIDRAULICA_PADRAO,
  type ParametrosEstruturais,
  type ParametrosHidraulicos,
} from '../utils/blueprintTopografiaDimensionamento';

export type BaseDoPlato = 'ENVELOPE' | 'LOTE';

/**
 * A premissa de terraplenagem do estudo: base e cota do platô; talude,
 * empolamento e contração (fase 3); banqueta, via de serviço, talude por
 * aresta e as linhas desenhadas do perfil (fases 4 e 5); muro por aresta e
 * a drenagem traçada (fase 6).
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
  /** A drenagem traçada (fase 6), no sentido do escoamento. */
  drenagem: LinhaDeDrenagem[];
  /** Acrescenta uma linha e devolve o id dela (`null` com menos de 2 pontos). */
  adicionarDrenagem: (pontos: Point[], tipo?: TipoDeDrenagem, nome?: string) => string | null;
  /** Acrescenta várias de uma vez (as geradas do platô). */
  adicionarDrenagens: (linhas: LinhaDeDrenagem[]) => void;
  alterarDrenagem: (id: string, patch: Partial<Pick<LinhaDeDrenagem, 'nome' | 'tipo' | 'areaContribuinteM2'>>) => void;
  removerDrenagem: (id: string) => void;
  /** Hipóteses do pré-dimensionamento (fase 7), já completas com os padrões. */
  hidraulica: ParametrosHidraulicos;
  setHidraulica: (patch: Partial<ParametrosHidraulicos>) => void;
  estrutura: ParametrosEstruturais;
  setEstrutura: (patch: Partial<ParametrosEstruturais>) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

/** O JSON parcial gravado, completado com o padrão (e sem chaves estranhas). */
export function hidraulicaDaColuna(raw: unknown): ParametrosHidraulicos {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ParametrosHidraulicos>;
  const n = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
  const idf = (r.idf && typeof r.idf === 'object' ? r.idf : {}) as Partial<ParametrosHidraulicos['idf']>;
  return {
    coeficienteDeEscoamento: n(r.coeficienteDeEscoamento, HIDRAULICA_PADRAO.coeficienteDeEscoamento),
    tempoDeRetornoAnos: n(r.tempoDeRetornoAnos, HIDRAULICA_PADRAO.tempoDeRetornoAnos),
    tempoDeConcentracaoMin: n(r.tempoDeConcentracaoMin, HIDRAULICA_PADRAO.tempoDeConcentracaoMin),
    idf: {
      k: n(idf.k, HIDRAULICA_PADRAO.idf.k),
      a: n(idf.a, HIDRAULICA_PADRAO.idf.a),
      b: n(idf.b, HIDRAULICA_PADRAO.idf.b),
      c: n(idf.c, HIDRAULICA_PADRAO.idf.c),
    },
    intensidadeMmH: typeof r.intensidadeMmH === 'number' && r.intensidadeMmH > 0 ? r.intensidadeMmH : null,
    manningN: n(r.manningN, HIDRAULICA_PADRAO.manningN),
    laminaMax: n(r.laminaMax, HIDRAULICA_PADRAO.laminaMax),
  };
}

export function estruturaDaColuna(raw: unknown): ParametrosEstruturais {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ParametrosEstruturais>;
  const n = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
  return {
    tipo: r.tipo === 'GRAVIDADE' || r.tipo === 'FLEXAO' ? r.tipo : 'AUTO',
    pesoDoSoloKNm3: n(r.pesoDoSoloKNm3, ESTRUTURA_PADRAO.pesoDoSoloKNm3),
    anguloDeAtritoGraus: n(r.anguloDeAtritoGraus, ESTRUTURA_PADRAO.anguloDeAtritoGraus),
    sobrecargaKNm2: n(r.sobrecargaKNm2, ESTRUTURA_PADRAO.sobrecargaKNm2),
    tensaoAdmissivelKPa: n(r.tensaoAdmissivelKPa, ESTRUTURA_PADRAO.tensaoAdmissivelKPa),
    pesoDoConcretoKNm3: n(r.pesoDoConcretoKNm3, ESTRUTURA_PADRAO.pesoDoConcretoKNm3),
    pesoDoCiclopicoKNm3: n(r.pesoDoCiclopicoKNm3, ESTRUTURA_PADRAO.pesoDoCiclopicoKNm3),
    embutimentoM: n(r.embutimentoM, ESTRUTURA_PADRAO.embutimentoM),
    taxaDeArmaduraKgM3: n(r.taxaDeArmaduraKgM3, ESTRUTURA_PADRAO.taxaDeArmaduraKgM3),
  };
}

/** Linha anterior às fases 3/4/6 vem sem as colunas: caem nos padrões. */
function parametrosDaLinha(row: {
  talude_corte_h?: number | null;
  talude_aterro_h?: number | null;
  empolamento_pct?: number | null;
  contracao_pct?: number | null;
  altura_do_lance_m?: number | null;
  largura_da_banqueta_m?: number | null;
  largura_da_via_m?: number | null;
  talude_por_aresta?: ParametrosDeTerraplenagem['taludePorAresta'] | null;
  caimento_min_pct?: number | null;
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
    caimentoMinPct: n(row.caimento_min_pct, PARAMETROS_PADRAO.caimentoMinPct ?? 0.5),
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

const TIPOS: TipoDeDrenagem[] = ['CANALETA', 'DESCIDA', 'TUBO'];

/** O que está gravado em `drenagem`: só linhas bem formadas, com ≥ 2 pontos. */
export function drenagemDaColuna(raw: unknown): LinhaDeDrenagem[] {
  if (!Array.isArray(raw)) return [];
  const saida: LinhaDeDrenagem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const l = item as Partial<LinhaDeDrenagem>;
    if (typeof l.id !== 'string' || !Array.isArray(l.pontos) || l.pontos.length < 2 || !l.pontos.every(ehPonto)) continue;
    saida.push({
      id: l.id,
      nome: typeof l.nome === 'string' && l.nome.trim() ? l.nome : `Canaleta ${saida.length + 1}`,
      tipo: TIPOS.includes(l.tipo as TipoDeDrenagem) ? (l.tipo as TipoDeDrenagem) : 'CANALETA',
      pontos: l.pontos.map((p) => ({ x: p.x, y: p.y })),
      areaContribuinteM2:
        typeof l.areaContribuinteM2 === 'number' && Number.isFinite(l.areaContribuinteM2) && l.areaContribuinteM2 >= 0
          ? l.areaContribuinteM2
          : null,
    });
  }
  return saida;
}

export function novoIdDeDrenagem(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useBlueprintTerraplenagem(studyId: string, organizationId: string): Terraplenagem {
  const [base, setBaseLocal] = useState<BaseDoPlato>('ENVELOPE');
  const [cotaPlatoM, setCotaLocal] = useState<number | null>(null);
  const [parametros, setParametrosLocal] = useState<ParametrosDeTerraplenagem>(PARAMETROS_PADRAO);
  const [linhasDoPerfil, setLinhasLocal] = useState<Point[][]>([]);
  const [drenagem, setDrenagemLocal] = useState<LinhaDeDrenagem[]>([]);
  const [hidraulica, setHidraulicaLocal] = useState<ParametrosHidraulicos>(HIDRAULICA_PADRAO);
  const [estrutura, setEstruturaLocal] = useState<ParametrosEstruturais>(ESTRUTURA_PADRAO);
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
          setDrenagemLocal(drenagemDaColuna(row.drenagem));
          setHidraulicaLocal(hidraulicaDaColuna(row.hidraulica));
          setEstruturaLocal(estruturaDaColuna(row.estrutura));
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

  // As hipóteses do pré-dimensionamento vão por ref: mudam raramente e não
  // precisam entrar nas deps de todos os setters.
  const hidraulicaRef = useRef(hidraulica);
  hidraulicaRef.current = hidraulica;
  const estruturaRef = useRef(estrutura);
  estruturaRef.current = estrutura;

  const premissa = useCallback(
    (
      b: BaseDoPlato,
      cota: number | null,
      p: ParametrosDeTerraplenagem,
      linhas: Point[][],
      dren: LinhaDeDrenagem[],
    ): PremissaDeTerraplenagem => ({
      hidraulica: hidraulicaRef.current,
      estrutura: estruturaRef.current,
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
      drenagem: dren,
      caimento_min_pct: p.caimentoMinPct ?? 0.5,
    }),
    [],
  );

  const setBase = useCallback(
    (b: BaseDoPlato) => {
      setBaseLocal(b);
      persistir(premissa(b, cotaPlatoM, parametros, linhasDoPerfil, drenagem));
    },
    [persistir, premissa, cotaPlatoM, parametros, linhasDoPerfil, drenagem],
  );

  const setCotaPlatoM = useCallback(
    (v: number | null) => {
      setCotaLocal(v);
      persistir(premissa(base, v, parametros, linhasDoPerfil, drenagem));
    },
    [persistir, premissa, base, parametros, linhasDoPerfil, drenagem],
  );

  const setParametros = useCallback(
    (patch: Partial<ParametrosDeTerraplenagem>) => {
      const proximo = { ...parametros, ...patch };
      setParametrosLocal(proximo);
      persistir(premissa(base, cotaPlatoM, proximo, linhasDoPerfil, drenagem));
    },
    [persistir, premissa, base, cotaPlatoM, parametros, linhasDoPerfil, drenagem],
  );

  const adicionarLinhaDoPerfil = useCallback(
    (pontos: Point[]) => {
      if (pontos.length < 2) return -1;
      const linhas = [...linhasDoPerfil, pontos.map((p) => ({ x: p.x, y: p.y }))];
      setLinhasLocal(linhas);
      persistir(premissa(base, cotaPlatoM, parametros, linhas, drenagem));
      return linhas.length - 1;
    },
    [persistir, premissa, base, cotaPlatoM, parametros, linhasDoPerfil, drenagem],
  );

  const removerLinhaDoPerfil = useCallback(
    (indice: number) => {
      if (indice < 0 || indice >= linhasDoPerfil.length) return;
      const linhas = linhasDoPerfil.filter((_, i) => i !== indice);
      setLinhasLocal(linhas);
      persistir(premissa(base, cotaPlatoM, parametros, linhas, drenagem));
    },
    [persistir, premissa, base, cotaPlatoM, parametros, linhasDoPerfil, drenagem],
  );

  const gravarDrenagem = useCallback(
    (dren: LinhaDeDrenagem[]) => {
      setDrenagemLocal(dren);
      persistir(premissa(base, cotaPlatoM, parametros, linhasDoPerfil, dren));
    },
    [persistir, premissa, base, cotaPlatoM, parametros, linhasDoPerfil],
  );

  const adicionarDrenagem = useCallback(
    (pontos: Point[], tipo: TipoDeDrenagem = 'CANALETA', nome?: string) => {
      if (pontos.length < 2) return null;
      const id = novoIdDeDrenagem();
      gravarDrenagem([
        ...drenagem,
        { id, nome: nome ?? `Canaleta ${drenagem.length + 1}`, tipo, pontos: pontos.map((p) => ({ x: p.x, y: p.y })) },
      ]);
      return id;
    },
    [gravarDrenagem, drenagem],
  );

  const adicionarDrenagens = useCallback(
    (linhas: LinhaDeDrenagem[]) => {
      if (linhas.length === 0) return;
      gravarDrenagem([...drenagem, ...linhas]);
    },
    [gravarDrenagem, drenagem],
  );

  const setHidraulica = useCallback(
    (patch: Partial<ParametrosHidraulicos>) => {
      const proximo = { ...hidraulica, ...patch, idf: { ...hidraulica.idf, ...(patch.idf ?? {}) } };
      setHidraulicaLocal(proximo);
      hidraulicaRef.current = proximo;
      persistir(premissa(base, cotaPlatoM, parametros, linhasDoPerfil, drenagem));
    },
    [hidraulica, persistir, premissa, base, cotaPlatoM, parametros, linhasDoPerfil, drenagem],
  );

  const setEstrutura = useCallback(
    (patch: Partial<ParametrosEstruturais>) => {
      const proximo = { ...estrutura, ...patch };
      setEstruturaLocal(proximo);
      estruturaRef.current = proximo;
      persistir(premissa(base, cotaPlatoM, parametros, linhasDoPerfil, drenagem));
    },
    [estrutura, persistir, premissa, base, cotaPlatoM, parametros, linhasDoPerfil, drenagem],
  );

  const alterarDrenagem = useCallback(
    (id: string, patch: Partial<Pick<LinhaDeDrenagem, 'nome' | 'tipo' | 'areaContribuinteM2'>>) => {
      if (!drenagem.some((l) => l.id === id)) return;
      gravarDrenagem(drenagem.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    [gravarDrenagem, drenagem],
  );

  const removerDrenagem = useCallback(
    (id: string) => {
      if (!drenagem.some((l) => l.id === id)) return;
      gravarDrenagem(drenagem.filter((l) => l.id !== id));
    },
    [gravarDrenagem, drenagem],
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
    drenagem,
    adicionarDrenagem,
    adicionarDrenagens,
    alterarDrenagem,
    removerDrenagem,
    hidraulica,
    setHidraulica,
    estrutura,
    setEstrutura,
    carregando,
    persistenciaIndisponivel,
  };
}
