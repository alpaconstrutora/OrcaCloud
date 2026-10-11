/**
 * O LOTE DESENHADO NO MAPA (11/10/2026) — a conta, sem tela.
 *
 * Pedido: *"é possivel gerar sem uso do google earth? ... Se for possivel gerar
 * tudo sem uso de ferramenta externa seria perfeito"*. O Google Earth só servia
 * para dizer ONDE o terreno está; o mapa dentro de "Onde fica" faz isso, e este
 * módulo transforma os vértices clicados (latitude/longitude) no que o desenho
 * entende: uma georreferência e pontos em milímetros. Plano:
 * docs/planos/2026-10-11-curvas-de-nivel-sem-ferramenta-externa.md.
 *
 * ─── A ORIGEM ───────────────────────────────────────────────────────────────
 *
 * Sem georreferência, a origem do desenho vai para o CENTRO da caixa da área,
 * com o norte para cima (o mapa é norte-para-cima). Centro, e não o 1º vértice:
 * o kernel aceita ±1 km da origem (`MAX_COORD_MM`) e o plano tangente de
 * `geoParaLocal` erra menos perto da origem. Com georreferência já informada,
 * ela é MANTIDA — outras coisas do estudo (ortofoto, levantamento) dependem
 * dela, e mudar a origem as deslocaria.
 *
 * ─── AS MEDIDAS ─────────────────────────────────────────────────────────────
 *
 * O "lado menor" é o mesmo que a geração das curvas mede (`verificarResolucao`
 * sobre os pontos do desenho), para o aviso do mapa e a recusa do Gerar nunca
 * discordarem.
 */
import type { Georreferencia, Point } from './blueprintKernel';
import { isSimplePolygon, polygonArea, polygonPerimeter } from './blueprintKernel';
import { MAX_COORD_MM } from './blueprintKernel/units';
import { caixaDoAnel, geoParaLocal, verificarResolucao, type LatLon } from './blueprintTopografia';

/** Lado menor que a fonte Copernicus 30 m aceita (DR-08: 3 células). */
export const LADO_MINIMO_DO_COPERNICUS_M = 90;

/**
 * Coordenada colada ("-22,6153, -46,0426", "-22.6153 -46.0426", o que o Google
 * Maps copia). Vírgula serve de decimal quando há espaço ou `;` entre os
 * números. Devolve `null` se não forem exatamente dois números no planeta.
 */
export function lerCoordenadaColada(texto: string): LatLon | null {
  const t = texto.trim();
  if (!t) return null;
  // Um número: sinal, dígitos, e decimal por ponto ou vírgula seguida de dígito.
  const numeros = t.match(/-?\d+(?:[.,]\d+)?/g);
  if (!numeros || numeros.length !== 2) return null;
  // O que sobra entre e em volta dos números só pode ser separador.
  const resto = t.replace(/-?\d+(?:[.,]\d+)?/g, '').replace(/[\s,;°]/g, '');
  if (resto !== '') return null;
  const [lat, lon] = numeros.map((n) => Number(n.replace(',', '.')));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Georreferência nova com a origem no centro da caixa dos vértices (norte para cima). */
export function georreferenciaNoCentro(vertices: LatLon[]): Georreferencia {
  const lats = vertices.map((v) => v.lat);
  const lons = vertices.map((v) => v.lon);
  const arred = (x: number) => Math.round(x * 1e7) / 1e7; // ~1 cm
  return {
    latitude: arred((Math.min(...lats) + Math.max(...lats)) / 2),
    longitude: arred((Math.min(...lons) + Math.max(...lons)) / 2),
  };
}

export interface MedidasDaArea {
  areaM2: number;
  perimetroM: number;
  /** O mesmo "lado menor" da recusa por resolução: a caixa dos pontos no desenho. */
  ladoMenorM: number;
  /** Cabe na fonte Copernicus 30 m (lado menor ≥ 90 m). */
  serveCopernicus: boolean;
}

export type AreaParaLote =
  | {
      ok: true;
      /** A que o estudo deve ter: a nova (centro da área) ou a que já tinha. */
      georreferencia: Georreferencia;
      /** `true` = a georreferência é nova e tem de ser gravada junto do lote. */
      georreferenciaNova: boolean;
      pontosMm: Point[];
      medidas: MedidasDaArea;
    }
  | { ok: false; erro: string };

/** Vértices sem repetição consecutiva (duplo clique costuma repetir o último) nem fechamento explícito. */
function semRepeticao(vertices: LatLon[]): LatLon[] {
  const iguais = (a: LatLon, b: LatLon) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;
  const out: LatLon[] = [];
  for (const v of vertices) if (!out.length || !iguais(out[out.length - 1], v)) out.push(v);
  if (out.length > 1 && iguais(out[0], out[out.length - 1])) out.pop();
  return out;
}

export function medirPontos(pontosMm: Point[]): MedidasDaArea {
  const caixa = caixaDoAnel(pontosMm);
  const ladoMenorM = Math.min(caixa.maxX - caixa.minX, caixa.maxY - caixa.minY) / 1000;
  return {
    areaM2: polygonArea(pontosMm) / 1e6,
    perimetroM: polygonPerimeter(pontosMm) / 1000,
    ladoMenorM,
    serveCopernicus: verificarResolucao(pontosMm, 30).ok,
  };
}

/**
 * Os vértices clicados no mapa viram o contorno do lote. Recusa (com a medida
 * que falhou) o que o desenho não aceitaria: menos de 3 vértices, contorno que
 * se cruza, área nula ou vértice além de ±1 km da origem.
 */
export function areaParaLote(vertices: LatLon[], geoAtual: Georreferencia | null): AreaParaLote {
  const vs = semRepeticao(vertices);
  if (vs.length < 3) return { ok: false, erro: 'Marque ao menos três vértices no mapa.' };
  const georreferenciaNova = !geoAtual;
  const georreferencia = geoAtual ?? georreferenciaNoCentro(vs);
  const pontosMm = vs.map((v) => geoParaLocal(v, georreferencia));
  const longe = Math.max(...pontosMm.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))));
  if (longe > MAX_COORD_MM) {
    const km = (longe / 1e6).toFixed(1).replace('.', ',');
    return {
      ok: false,
      erro: georreferenciaNova
        ? `A área tem vértice a ${km} km do centro: o desenho aceita até 1 km. Desenhe uma área menor.`
        : `A área tem vértice a ${km} km da origem já informada em "Onde fica" — o desenho aceita até 1 km. Desenhe perto dela, ou use "Limpar" em "Onde fica" para a origem ir ao centro da área.`,
    };
  }
  const redondos = pontosMm.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  if (!isSimplePolygon(redondos)) return { ok: false, erro: 'O contorno se cruza. Refaça a área sem cruzar os lados.' };
  const medidas = medirPontos(redondos);
  if (medidas.areaM2 < 1) return { ok: false, erro: 'A área marcada tem menos de 1 m².' };
  return { ok: true, georreferencia, georreferenciaNova, pontosMm: redondos, medidas };
}

/** Retângulo norte-sul/leste-oeste pelos dois cantos opostos (o modo Retângulo do mapa). */
export function retanguloGeoPorCantos(a: LatLon, b: LatLon): LatLon[] {
  const norte = Math.max(a.lat, b.lat);
  const sul = Math.min(a.lat, b.lat);
  const oeste = Math.min(a.lon, b.lon);
  const leste = Math.max(a.lon, b.lon);
  return [
    { lat: norte, lon: oeste },
    { lat: norte, lon: leste },
    { lat: sul, lon: leste },
    { lat: sul, lon: oeste },
  ];
}
