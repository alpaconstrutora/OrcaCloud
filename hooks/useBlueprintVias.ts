import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '../utils/blueprintKernel';
import { blueprintViasService } from '../services/blueprintViasService';
import type { BlueprintViaRow } from '../types/blueprint';
import { PASSO_PADRAO_M, SECAO_TIPO_PADRAO, secaoDaViaDoLoteamento, type Greide, type SecaoTipo, type ViaDoLoteamento } from '../utils/blueprintVias';

/**
 * Uma via de projeto na tela (C2): o que se grava, já normalizado. `greide`
 * `null` = greide de partida (reta do terreno no início ao terreno no fim),
 * calculado na tela.
 */
export interface ViaDeProjeto {
  id: string;
  nome: string;
  viaUid: string | null;
  eixo: Point[];
  passoM: number;
  greide: Greide | null;
  secaoTipo: SecaoTipo;
  topografiaId: string | null;
}

export interface Vias {
  vias: ViaDeProjeto[];
  ativaId: string | null;
  setAtiva: (id: string | null) => void;
  /** Acrescenta uma via com o eixo traçado e devolve o id (`null` com menos de 2 pontos). */
  adicionar: (eixo: Point[], nome?: string) => string | null;
  /** C3: projeta uma Via do loteamento — ligada pelo `uid`; eixo, nome e seção acompanham o desenho. */
  adicionarDoLoteamento: (v: ViaDoLoteamento) => string | null;
  alterar: (id: string, patch: Partial<Omit<ViaDeProjeto, 'id'>>) => void;
  remover: (id: string) => void;
  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

function novoId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ehPonto(v: unknown): v is Point {
  return !!v && typeof v === 'object' && typeof (v as Point).x === 'number' && typeof (v as Point).y === 'number';
}

/** Linha do banco → via da tela, tolerante a coluna vazia ou torta. */
export function viaDaLinha(row: BlueprintViaRow): ViaDeProjeto {
  const eixo = Array.isArray(row.eixo) ? row.eixo.filter(ehPonto).map((p) => ({ x: p.x, y: p.y })) : [];
  const g = row.greide;
  const greide: Greide | null =
    g && typeof g === 'object' && Array.isArray((g as Greide).pontos)
      ? {
          pontos: (g as Greide).pontos
            .filter((p) => p && Number.isFinite(p.distM) && Number.isFinite(p.cotaM))
            .map((p) => ({ distM: Number(p.distM), cotaM: Number(p.cotaM), ...(p.curvaM ? { curvaM: Number(p.curvaM) } : {}) })),
        }
      : null;
  const s = (row.secao_tipo ?? {}) as Partial<SecaoTipo>;
  const n = (v: number | null | undefined, padrao: number) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? padrao : Number(v));
  return {
    id: row.id,
    nome: row.nome || 'Via',
    viaUid: row.via_uid ?? null,
    eixo,
    passoM: n(row.passo_m, PASSO_PADRAO_M),
    greide,
    secaoTipo: {
      pistaM: n(s.pistaM, SECAO_TIPO_PADRAO.pistaM),
      calcadaM: n(s.calcadaM, SECAO_TIPO_PADRAO.calcadaM),
      taludeCorteH: n(s.taludeCorteH, SECAO_TIPO_PADRAO.taludeCorteH),
      taludeAterroH: n(s.taludeAterroH, SECAO_TIPO_PADRAO.taludeAterroH),
    },
    topografiaId: row.topografia_id ?? null,
  };
}

/**
 * As vias de projeto do estudo. Mesmo desenho de `useBlueprintTerraplenagem`:
 * estado local que responde na hora, gravação atrás com respiro (por via), e
 * degradação sem a migration (`persistenciaIndisponivel`). A CONTA não mora aqui.
 */
export function useBlueprintVias(studyId: string, organizationId: string): Vias {
  const [vias, setVias] = useState<ViaDeProjeto[]>([]);
  const [ativaId, setAtiva] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);
  const gravacoes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const rows = await blueprintViasService.list(studyId);
        if (!vivo) return;
        setVias(rows.map(viaDaLinha));
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[vias] persistência indisponível:', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  const persistir = useCallback(
    (via: ViaDeProjeto) => {
      if (persistenciaIndisponivel) return;
      const pendente = gravacoes.current.get(via.id);
      if (pendente) clearTimeout(pendente);
      gravacoes.current.set(
        via.id,
        setTimeout(() => {
          gravacoes.current.delete(via.id);
          blueprintViasService
            .save(studyId, organizationId, {
              id: via.id,
              nome: via.nome,
              via_uid: via.viaUid,
              eixo: via.eixo,
              passo_m: via.passoM,
              greide: via.greide,
              secao_tipo: via.secaoTipo,
              topografia_id: via.topografiaId,
            })
            .catch((e) => console.warn('[vias] não gravou:', e));
        }, 500),
      );
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  const adicionar = useCallback(
    (eixo: Point[], nome?: string) => {
      if (eixo.length < 2) return null;
      const via: ViaDeProjeto = {
        id: novoId(),
        nome: nome ?? `Via ${vias.length + 1}`,
        viaUid: null,
        eixo: eixo.map((p) => ({ x: p.x, y: p.y })),
        passoM: PASSO_PADRAO_M,
        greide: null,
        secaoTipo: { ...SECAO_TIPO_PADRAO },
        topografiaId: null,
      };
      setVias((v) => [...v, via]);
      setAtiva(via.id);
      persistir(via);
      return via.id;
    },
    [vias.length, persistir],
  );

  const adicionarDoLoteamento = useCallback(
    (k: ViaDoLoteamento) => {
      if (k.eixo.length < 2) return null;
      const via: ViaDeProjeto = {
        id: novoId(),
        nome: k.nome,
        viaUid: k.uid,
        eixo: k.eixo.map((p) => ({ x: p.x, y: p.y })),
        passoM: PASSO_PADRAO_M,
        greide: null,
        secaoTipo: secaoDaViaDoLoteamento(k),
        topografiaId: null,
      };
      setVias((v) => [...v, via]);
      setAtiva(via.id);
      persistir(via);
      return via.id;
    },
    [persistir],
  );

  const alterar = useCallback(
    (id: string, patch: Partial<Omit<ViaDeProjeto, 'id'>>) => {
      setVias((lista) => {
        const atual = lista.find((v) => v.id === id);
        if (!atual) return lista;
        const proxima = { ...atual, ...patch };
        persistir(proxima);
        return lista.map((v) => (v.id === id ? proxima : v));
      });
    },
    [persistir],
  );

  const remover = useCallback(
    (id: string) => {
      setVias((lista) => lista.filter((v) => v.id !== id));
      setAtiva((a) => (a === id ? null : a));
      const pendente = gravacoes.current.get(id);
      if (pendente) clearTimeout(pendente);
      if (!persistenciaIndisponivel) blueprintViasService.remove(id).catch((e) => console.warn('[vias] não apagou:', e));
    },
    [persistenciaIndisponivel],
  );

  return { vias, ativaId, setAtiva, adicionar, adicionarDoLoteamento, alterar, remover, carregando, persistenciaIndisponivel };
}
