/**
 * A3 — SHAPEFILE e DEM entrando pelo MESMO "Importar levantamento".
 *
 * Nada de um importador novo: o shapefile vira o texto de um formato que o
 * importador já lê, e o DEM vira um resultado de importação pronto.
 *
 *  - SHP com `.prj` conhecido → GeoJSON em latitude/longitude: pontos (com Z
 *    ou atributo de cota) viram pontos cotados; vértices de linhas com Z (as
 *    curvas de nível de outro software) também; o primeiro POLÍGONO vira o
 *    contorno do lote, como no GeoJSON/KML (P2.65).
 *  - SHP SEM `.prj` → CSV `ponto;norte;este;cota;codigo` em metros, como o
 *    arquivo de estação total: coordenadas locais; o polígono não vira contorno
 *    (sem sistema, não há como dizer onde ele está) e isso é DITO.
 */
import type { Georreferencia, Point } from '../blueprintKernel';
import type { ResultadoDaImportacao } from '../blueprintTopografiaImportacao';
import { converter } from './projecao';
import { SIRGAS2000_GEO } from './crs';
import { crsDoWkt, demEhPreliminar, pontosDoDem, rasterNoMundo } from './raster';
import type { CamadaShp, Vertice3 } from './shapefile';
import type { Tiff } from './tiff';

const CHAVES_DE_NOME = ['NOME', 'NAME', 'ID', 'PONTO', 'PT', 'P'];
const CHAVES_DE_CODIGO = ['CODIGO', 'COD', 'CODE', 'DESC', 'DESCRICAO', 'D'];
const CHAVES_DE_COTA = ['COTA', 'Z', 'ELEV', 'ELEVATION', 'ALT', 'ALTITUDE', 'H', 'COTA_M', 'CONTOUR', 'ELEVACAO'];

function atributo(a: Record<string, string | number | null>, chaves: string[]): string | number | null {
  for (const k of chaves) {
    const v = a[k] ?? a[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

export interface TextoDoShapefile {
  formato: 'GEOJSON' | 'TEXTO';
  texto: string;
  avisos: string[];
  /** "EPSG:31983" ou null. */
  crs: string | null;
}

export function textoDoShapefile(camadas: CamadaShp[]): TextoDoShapefile {
  const avisos: string[] = [];
  const comPrj = camadas.filter((c) => c.prj);
  const crs = comPrj.length > 0 ? crsDoWkt(comPrj[0].prj) : null;
  if (comPrj.length > 0 && !crs) {
    throw new Error('O .prj do shapefile não é de um sistema que a Planta lê (SIRGAS 2000, SAD 69, Córrego Alegre ou WGS 84, UTM ou lat/long). Reprojete para SIRGAS 2000 / UTM.');
  }
  const cotaDe = (v: Vertice3, a: Record<string, string | number | null>): number | null => {
    if (v.z !== undefined && Number.isFinite(v.z) && v.z !== 0) return v.z;
    const c = atributo(a, CHAVES_DE_COTA);
    const n = typeof c === 'number' ? c : c !== null ? Number(String(c).replace(',', '.')) : NaN;
    return Number.isFinite(n) ? n : v.z !== undefined && Number.isFinite(v.z) ? v.z : null;
  };

  if (crs) {
    const geo = (v: Vertice3) => converter(crs, SIRGAS2000_GEO, v.x, v.y).valor;
    const features: unknown[] = [];
    let contorno = false;
    for (const c of camadas) {
      for (const f of c.feicoes) {
        const nome = atributo(f.atributos, CHAVES_DE_NOME);
        const props = { name: nome === null ? undefined : String(nome) };
        if (c.tipo === 'POLIGONO') {
          if (contorno || !f.partes[0]) continue;
          contorno = true;
          features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [f.partes[0].map((v) => [geo(v).x, geo(v).y])] } });
          continue;
        }
        for (const v of f.partes.flat()) {
          const z = cotaDe(v, f.atributos);
          if (z === null) continue;
          const g = geo(v);
          features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [g.x, g.y, z] } });
        }
      }
    }
    if (camadas.filter((c) => c.tipo === 'POLIGONO').reduce((s, c) => s + c.feicoes.length, 0) > 1) avisos.push('Mais de um polígono no shapefile: só o primeiro é oferecido como contorno do lote.');
    return { formato: 'GEOJSON', texto: JSON.stringify({ type: 'FeatureCollection', features }), avisos, crs: crs.codigo };
  }

  const linhas = ['ponto;norte;este;cota;codigo'];
  let k = 0;
  for (const c of camadas) {
    if (c.tipo === 'POLIGONO') {
      avisos.push(`A camada "${c.nome}" tem polígonos, mas o shapefile não tem .prj: sem sistema de coordenadas, o polígono não vira contorno do lote.`);
      continue;
    }
    for (const f of c.feicoes) {
      const nome = atributo(f.atributos, CHAVES_DE_NOME);
      const codigo = atributo(f.atributos, CHAVES_DE_CODIGO);
      for (const v of f.partes.flat()) {
        const z = cotaDe(v, f.atributos);
        if (z === null) continue;
        k++;
        linhas.push([nome ?? `S${k}`, v.y.toFixed(3), v.x.toFixed(3), z.toFixed(3), codigo ?? ''].join(';'));
      }
    }
  }
  avisos.push('Shapefile sem .prj: as coordenadas entram como LOCAIS, em metros.');
  return { formato: 'TEXTO', texto: linhas.join('\n'), avisos, crs: null };
}

/**
 * O resultado de importação de um DEM GeoTIFF — o mesmo objeto que o
 * importador de texto devolve, para a prévia e o "Substituir/Acrescentar"
 * serem os de sempre. `preliminar` diz se a versão sai como DEM (classe
 * PRELIMINAR_REMOTO) ou como levantamento.
 */
export function resultadoDoDem(tiff: Tiff, georreferencia: Georreferencia | null, anel: Point[] | null): { resultado: ResultadoDaImportacao; preliminar: boolean; resolucaoM: number; crs: string } {
  if (!georreferencia) throw new Error('Um DEM GeoTIFF cai no desenho pela georreferência do lote: informe latitude/longitude em "Onde fica".');
  const r = rasterNoMundo(tiff);
  const d = pontosDoDem(tiff, r, georreferencia, anel, 10_000);
  const resultado: ResultadoDaImportacao = {
    formato: 'TEXTO',
    pontos: d.pontos,
    linhasDeQuebra: [],
    tinImportada: null,
    detectado: { ordem: 'NEZ', unidade: 'M', ancoragem: 'GEORREFERENCIA', linhasLidas: d.pontos.length, linhasIgnoradas: d.semValor },
    dentroDoLote: d.pontos.length,
    contorno: null,
    avisos: [`DEM de ${d.resolucaoM.toFixed(1).replace('.', ',')} m em ${r.crs.nome}.`, ...d.avisos],
  };
  return { resultado, preliminar: demEhPreliminar(d.resolucaoM), resolucaoM: d.resolucaoM, crs: r.crs.codigo };
}
