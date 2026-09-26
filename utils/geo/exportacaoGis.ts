/**
 * A3 — a topografia e o lote SAINDO em Shapefile (e o KML em KMZ).
 *
 * Com georreferência, as coordenadas saem em SIRGAS 2000 / UTM do fuso do lote
 * (é o que CAR, prefeitura e QGIS esperam), com o `.prj`. Sem ela, saem em
 * METROS LOCAIS do desenho e SEM `.prj` — e o nome do arquivo diz "local", para
 * ninguém abrir no QGIS achando que está no lugar certo.
 */
import type { Georreferencia, Point } from '../blueprintKernel';
import { localParaGeo } from '../blueprintTopografia';
import { geoParaProjetado } from './projecao';
import { prjSirgasUtm, type CamadaShp } from './shapefile';

export interface TopografiaParaShp {
  curvas: { cotaM: number; mestra: boolean; pontos: Point[] }[];
  pontos: { x: number; y: number; cotaM: number; nome?: string; codigo?: string; descricao?: string }[];
  anel: Point[] | null;
  drenagem?: { nome: string; tipo: string; pontos: Point[] }[];
  lotes?: { quadra: string; numero: string; areaM2: number; pontos: Point[] }[];
}

export function camadasDaTopografia(t: TopografiaParaShp, geo: Georreferencia | null): { camadas: CamadaShp[]; georreferenciado: boolean; crs: string | null } {
  let paraSaida: (p: Point) => { x: number; y: number };
  let prj: string | null = null;
  let crs: string | null = null;
  if (geo) {
    const zona = geoParaProjetado({ lat: geo.latitude, lon: geo.longitude }).valor.crs;
    prj = prjSirgasUtm(zona.zona!);
    crs = zona.codigo;
    paraSaida = (p) => {
      const ll = localParaGeo(p, geo);
      const e = geoParaProjetado({ lat: ll.lat, lon: ll.lon }, zona).valor;
      return { x: e.este, y: e.norte };
    };
  } else {
    paraSaida = (p) => ({ x: p.x / 1000, y: p.y / 1000 });
  }
  const v = (p: Point, z?: number) => ({ ...paraSaida(p), ...(z !== undefined ? { z } : {}) });
  const camadas: CamadaShp[] = [
    {
      nome: 'curvas_de_nivel',
      tipo: 'LINHA',
      prj,
      feicoes: t.curvas.filter((c) => c.pontos.length >= 2).map((c) => ({ partes: [c.pontos.map((p) => v(p, c.cotaM))], atributos: { cota: c.cotaM, mestra: c.mestra ? 'sim' : 'nao' } })),
    },
    {
      nome: 'pontos_cotados',
      tipo: 'PONTO',
      prj,
      feicoes: t.pontos.map((p, i) => ({ partes: [[v(p, p.cotaM)]], atributos: { nome: p.nome ?? String(i + 1), codigo: p.codigo ?? '', descricao: p.descricao ?? '', cota: p.cotaM } })),
    },
    {
      nome: 'lote',
      tipo: 'POLIGONO',
      prj,
      feicoes: t.anel && t.anel.length >= 3 ? [{ partes: [t.anel.map((p) => v(p))], atributos: { nome: 'lote', area_m2: Math.abs(areaMm2(t.anel)) / 1e6 } }] : [],
    },
    {
      nome: 'drenagem',
      tipo: 'LINHA',
      prj,
      feicoes: (t.drenagem ?? []).filter((d) => d.pontos.length >= 2).map((d) => ({ partes: [d.pontos.map((p) => v(p))], atributos: { nome: d.nome, tipo: d.tipo } })),
    },
    {
      nome: 'lotes',
      tipo: 'POLIGONO',
      prj,
      feicoes: (t.lotes ?? []).filter((l) => l.pontos.length >= 3).map((l) => ({ partes: [l.pontos.map((p) => v(p))], atributos: { quadra: l.quadra, lote: l.numero, area_m2: l.areaM2 } })),
    },
  ];
  return { camadas: camadas.filter((c) => c.feicoes.length > 0), georreferenciado: !!geo, crs };
}

function areaMm2(anel: Point[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}
