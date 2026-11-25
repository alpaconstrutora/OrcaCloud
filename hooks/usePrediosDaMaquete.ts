/**
 * Busca os prédios do OpenStreetMap para a Maquete (25/11/2026) nos ladrilhos vetoriais do
 * OpenFreeMap — ver o porquê (Overpass instável, medido) em `utils/blueprintMaqueteOsm.ts`. Só busca
 * quando há caixa (o editor a dá com o estilo Maquete ligado e o estudo georreferenciado com relevo),
 * e guarda o resultado em memória por caixa.
 *
 * Falha (rede, CDN) vira `erro` com o motivo em português, para o 3D dizer por que os prédios não
 * vieram; a maquete continua sem eles.
 */
import { useEffect, useState } from 'react';
import { ladrilhosDaCaixa, prediosDoLadrilho, URL_OPENFREEMAP, type CaixaGeo, type PredioGeo } from '../utils/blueprintMaqueteOsm';
import { lerLadrilho } from '../utils/geo/mvt';

export type EstadoDosPredios =
  | { estado: 'ocioso' }
  | { estado: 'carregando' }
  | { estado: 'pronto'; predios: PredioGeo[] }
  | { estado: 'erro'; motivo: string };

let molde: Promise<string> | null = null;
const resultados = new Map<string, PredioGeo[]>();
const chaveDe = (c: CaixaGeo) => [c.sul, c.oeste, c.norte, c.leste].map((n) => n.toFixed(6)).join(',');

/** O molde `…/{z}/{x}/{y}.pbf` do TileJSON (a versão do planeta muda a cada semana). */
function moldeDosLadrilhos(sinal: AbortSignal): Promise<string> {
  if (!molde) {
    molde = fetch(URL_OPENFREEMAP, { signal: sinal })
      .then((r) => {
        if (!r.ok) throw new Error(`o OpenFreeMap respondeu HTTP ${r.status}`);
        return r.json();
      })
      .then((tj: { tiles?: string[] }) => {
        const t = tj.tiles?.[0];
        if (!t) throw new Error('o OpenFreeMap não informou os ladrilhos');
        return t;
      });
    // Falha não fica presa: a próxima busca tenta de novo.
    molde.catch(() => {
      molde = null;
    });
  }
  return molde;
}

export async function buscarPrediosNoOpenFreeMap(caixa: CaixaGeo, sinal: AbortSignal): Promise<PredioGeo[]> {
  const chave = chaveDe(caixa);
  const guardado = resultados.get(chave);
  if (guardado) return guardado;
  const ladrilhos = ladrilhosDaCaixa(caixa);
  if (!ladrilhos) throw new Error('o terreno é grande demais para buscar os prédios (mais de 16 ladrilhos)');
  const url = await moldeDosLadrilhos(sinal);
  const partes = await Promise.all(
    ladrilhos.map(async (t) => {
      const r = await fetch(url.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)), { signal: sinal });
      // 204/404: ladrilho vazio (mar, nada mapeado) — não é erro.
      if (r.status === 204 || r.status === 404) return [];
      if (!r.ok) throw new Error(`o OpenFreeMap respondeu HTTP ${r.status}`);
      const [camada] = lerLadrilho(new Uint8Array(await r.arrayBuffer()), ['building']);
      return camada ? prediosDoLadrilho(camada, t) : [];
    }),
  );
  const predios = partes.flat();
  resultados.set(chave, predios);
  return predios;
}

export function usePrediosDaMaquete(caixa: CaixaGeo | null): EstadoDosPredios {
  const chave = caixa ? chaveDe(caixa) : null;
  const [estado, setEstado] = useState<EstadoDosPredios>({ estado: 'ocioso' });
  useEffect(() => {
    if (!chave || !caixa) {
      setEstado({ estado: 'ocioso' });
      return;
    }
    const guardado = resultados.get(chave);
    if (guardado) {
      setEstado({ estado: 'pronto', predios: guardado });
      return;
    }
    const controle = new AbortController();
    setEstado({ estado: 'carregando' });
    buscarPrediosNoOpenFreeMap(caixa, controle.signal)
      .then((predios) => {
        if (!controle.signal.aborted) setEstado({ estado: 'pronto', predios });
      })
      .catch((e: unknown) => {
        if (controle.signal.aborted) return;
        // `fetch` sem rede rejeita com TypeError ("Failed to fetch", em inglês): diz o que houve em português.
        const motivo = e instanceof Error && e.name !== 'TypeError' ? e.message : 'sem conexão com o OpenFreeMap (prédios do OpenStreetMap)';
        setEstado({ estado: 'erro', motivo });
      });
    return () => controle.abort();
    // `caixa` entra pela chave: o mesmo valor em outro objeto não busca de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return estado;
}
