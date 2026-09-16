import { intersectSegments, pointInPolygon, type BlueprintModel, type Point, type Structural } from './blueprintKernel';
import { secaoTValida } from './blueprintKernel/secaoT';
import { getCobrimentoNominalCm } from './structuralMath';
import type { ArmaduraDaPeca, CamadaDeArmadura, HipotesesDeArmadura } from './blueprintArmadura';

/**
 * ARMADURA DESENHADA — a geometria das barras do esquema (16/09/2026).
 *
 * Pedido: *"implementar exibição gráfica das armaduras"*. O esquema de
 * `blueprintArmadura.ts` diz QUANTAS barras, de QUE bitola e a QUE espaçamento;
 * aqui isso vira segmentos em coordenadas do modelo (mm; z = cota absoluta,
 * elevação do pavimento somada), que o 3D desenha como linhas e o painel da
 * peça desenha como seção. É desenho do PRÉ-QUANTITATIVO — sem dobras, sem
 * ancoragem detalhada, sem emenda por posição: a barra vai de ponta a ponta e o
 * estribo é um retângulo no cobrimento. Serve para VER onde e quanto aço o
 * mínimo põe, não para executar.
 *
 * A mesma distribuição de barras na seção (`posicoesNoRetangulo`,
 * `posicoesNoCirculo`) alimenta o 3D e o SVG da seção — uma regra só, para a
 * seção do painel ser um corte do que se vê na cena.
 */

export interface Ponto3 {
  x: number;
  y: number;
  z: number;
}

export interface SegmentoDeArmadura {
  a: Ponto3;
  b: Ponto3;
  /** 'longitudinal' | 'superior' | 'estribo' | 'malha' | 'espiral' */
  papel: string;
  bitolaMm: number;
  structuralId: string;
}

/** Barra longitudinal ou transversal, por papel — para cor e legenda. */
export const ehTransversal = (papel: string) => papel === 'estribo' || papel === 'espiral';

/**
 * Posições (u, v) de `n` barras no PERÍMETRO de um retângulo `largura × altura`
 * centrado na origem: primeiro os quatro cantos, depois as sobras distribuídas
 * alternando lados (as maiores primeiro). É a distribuição corrente de pilar e
 * bloco. n < 4 (nunca no pilar) cai em linha no eixo.
 */
export function posicoesNoRetangulo(n: number, largura: number, altura: number): Point[] {
  const hu = largura / 2;
  const hv = altura / 2;
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];
  if (n === 2) return [{ x: -hu, y: 0 }, { x: hu, y: 0 }];
  if (n === 3) return [{ x: -hu, y: 0 }, { x: 0, y: 0 }, { x: hu, y: 0 }];
  const cantos: Point[] = [{ x: -hu, y: -hv }, { x: hu, y: -hv }, { x: hu, y: hv }, { x: -hu, y: hv }];
  const sobra = n - 4;
  // Reparte a sobra entre os lados proporcionalmente ao comprimento (pares, para simetria).
  const lados = [
    { chave: 'baixo', comprimento: largura },
    { chave: 'cima', comprimento: largura },
    { chave: 'esq', comprimento: altura },
    { chave: 'dir', comprimento: altura },
  ];
  const porLado: Record<string, number> = { baixo: 0, cima: 0, esq: 0, dir: 0 };
  // Distribui de dois em dois (lado e o oposto) para manter a simetria; o ímpar restante vai ao par maior.
  let restante = sobra;
  const pares: [string, string, number][] = [
    ['baixo', 'cima', largura],
    ['esq', 'dir', altura],
  ].sort((p, q) => (q[2] as number) - (p[2] as number)) as [string, string, number][];
  while (restante > 0) {
    for (const [a, b] of pares) {
      if (restante <= 0) break;
      porLado[a]++;
      restante--;
      if (restante <= 0) break;
      porLado[b]++;
      restante--;
    }
  }
  void lados;
  const pts: Point[] = [...cantos];
  const entre = (k: number, de: Point, ate: Point) => {
    for (let i = 1; i <= k; i++) {
      const t = i / (k + 1);
      pts.push({ x: de.x + (ate.x - de.x) * t, y: de.y + (ate.y - de.y) * t });
    }
  };
  entre(porLado.baixo, cantos[0], cantos[1]);
  entre(porLado.cima, cantos[3], cantos[2]);
  entre(porLado.esq, cantos[0], cantos[3]);
  entre(porLado.dir, cantos[1], cantos[2]);
  return pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/** `n` barras igualmente espaçadas num círculo de raio `r`, a primeira no eixo +u. */
export function posicoesNoCirculo(n: number, r: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    pts.push({ x: Math.round(r * Math.cos(t)), y: Math.round(r * Math.sin(t)) });
  }
  return pts;
}

/** `n` barras numa linha de `−meia` a `+meia` (uma camada de viga): extremos ocupados. */
export function posicoesNaLinha(n: number, meia: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.round(-meia + (2 * meia * i) / (n - 1)));
  return out;
}

const camada = (a: ArmaduraDaPeca, papel: string): CamadaDeArmadura | undefined => a.camadas.find((c) => c.papel === papel);
const camadas = (a: ArmaduraDaPeca, papel: string): CamadaDeArmadura[] => a.camadas.filter((c) => c.papel === papel);

/** Cobrimento nominal em mm para a peça, pela CAA. */
export function cobrimentoMm(kind: Structural['kind'], hip: HipotesesDeArmadura): number {
  const tipo = kind === 'LAJE' ? 'laje' : kind === 'PILAR' ? 'pilar' : kind === 'VIGA' ? 'viga' : kind === 'VIGA_FUNDACAO' ? 'viga' : 'sapata';
  return getCobrimentoNominalCm(hip.caa, tipo) * 10;
}

interface Base {
  u: Point; // versor ao longo
  v: Point; // versor transversal (u girado 90°)
}
const baseDe = (rotacaoDeg: number): Base => {
  const r = (rotacaoDeg * Math.PI) / 180;
  const u = { x: Math.cos(r), y: Math.sin(r) };
  return { u, v: { x: -u.y, y: u.x } };
};
const noPlano = (c: Point, b: Base, du: number, dv: number): Point => ({ x: c.x + b.u.x * du + b.v.x * dv, y: c.y + b.u.y * du + b.v.y * dv });

/** Retângulo fechado (4 segmentos) no plano da seção, dado o centro e os versores. */
function anelRetangular(
  centroZ: (du: number, dv: number) => Ponto3,
  meiaU: number,
  meiaV: number,
): [Ponto3, Ponto3][] {
  const p = [centroZ(-meiaU, -meiaV), centroZ(meiaU, -meiaV), centroZ(meiaU, meiaV), centroZ(-meiaU, meiaV)];
  return [
    [p[0], p[1]],
    [p[1], p[2]],
    [p[2], p[3]],
    [p[3], p[0]],
  ];
}

/** Recorta o segmento a→b ao polígono (anel), devolvendo os trechos internos. */
export function recortarAoPoligono(a: Point, b: Point, anel: Point[]): [Point, Point][] {
  const ts: number[] = [0, 1];
  for (let i = 0; i < anel.length; i++) {
    const r = intersectSegments({ a, b }, { a: anel[i], b: anel[(i + 1) % anel.length] });
    if (r.kind === 'point' && r.at) {
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (len2 > 0) ts.push(((r.at.x - a.x) * (b.x - a.x) + (r.at.y - a.y) * (b.y - a.y)) / len2);
    }
  }
  const ordenados = [...new Set(ts.map((t) => Math.min(1, Math.max(0, t))))].sort((p, q) => p - q);
  const out: [Point, Point][] = [];
  for (let i = 0; i + 1 < ordenados.length; i++) {
    const t0 = ordenados[i];
    const t1 = ordenados[i + 1];
    if (t1 - t0 < 1e-6) continue;
    const meio = { x: a.x + (b.x - a.x) * ((t0 + t1) / 2), y: a.y + (b.y - a.y) * ((t0 + t1) / 2) };
    if (pointInPolygon(anel, meio)) {
      out.push([
        { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
        { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 },
      ]);
    }
  }
  return out;
}

/**
 * Os segmentos de UMA peça. `elevacaoMm` é a cota do pavimento (a peça guarda
 * `baseMm` relativa a ela).
 */
export function segmentosDaArmadura(s: Structural, a: ArmaduraDaPeca, hip: HipotesesDeArmadura, elevacaoMm: number): SegmentoDeArmadura[] {
  const out: SegmentoDeArmadura[] = [];
  const c = cobrimentoMm(s.kind, hip);
  const z0 = elevacaoMm + s.baseMm;
  const push = (papel: string, bitolaMm: number, pa: Ponto3, pb: Ponto3) => out.push({ a: pa, b: pb, papel, bitolaMm, structuralId: s.id });
  const seg3 = (p: Point, z: number): Ponto3 => ({ x: p.x, y: p.y, z });

  if (s.kind === 'PILAR' || s.kind === 'ESTACA') {
    const long = camada(a, 'longitudinal');
    const trans = camada(a, 'estribo') ?? camada(a, 'espiral');
    if (!long) return out;
    const centro = s.pontos[0];
    const b = baseDe(s.rotacaoDeg);
    const bt = trans?.bitolaMm ?? 5;
    const inset = c + bt + long.bitolaMm / 2;
    const topo = z0 + s.alturaMm;
    // Estaca: só o trecho armado, medido do topo; o arranque sobe 40 Ø acima.
    const trechoM = long.comprimentoUnitM - (40 * long.bitolaMm) / 1000;
    const zIni = s.kind === 'ESTACA' ? topo - trechoM * 1000 : z0;
    const zFim = s.kind === 'ESTACA' ? topo + (40 * long.bitolaMm) : topo;
    const posicoes = s.circular
      ? posicoesNoCirculo(long.n, s.larguraMm / 2 - inset)
      : posicoesNoRetangulo(long.n, Math.max(0, s.larguraMm - 2 * inset), Math.max(0, s.profundidadeMm - 2 * inset));
    for (const p of posicoes) {
      const q = noPlano(centro, b, p.x, p.y);
      push('longitudinal', long.bitolaMm, seg3(q, zIni), seg3(q, zFim));
    }
    if (trans && trans.espacamentoCm) {
      const passo = trans.espacamentoCm * 10;
      const zA = s.kind === 'ESTACA' ? zIni : z0 + 50;
      const zB = s.kind === 'ESTACA' ? topo : topo - 50;
      if (s.circular) {
        const r = s.larguraMm / 2 - c - bt / 2;
        if (s.kind === 'ESTACA') {
          // Espiral: hélice contínua, 24 lados por volta.
          const voltas = (zB - zA) / passo;
          const passos = Math.max(1, Math.ceil(voltas * 24));
          let ant: Ponto3 | null = null;
          for (let i = 0; i <= passos; i++) {
            const t = i / 24; // voltas
            const ang = 2 * Math.PI * t;
            const z = Math.min(zB, zA + t * passo);
            const p = seg3(noPlano(centro, b, r * Math.cos(ang), r * Math.sin(ang)), z);
            if (ant) push('espiral', bt, ant, p);
            ant = p;
            if (z >= zB) break;
          }
        } else {
          for (let z = zA; z <= zB + 1e-6; z += passo) {
            const anel = posicoesNoCirculo(16, r).map((p) => seg3(noPlano(centro, b, p.x, p.y), z));
            for (let i = 0; i < anel.length; i++) push('estribo', bt, anel[i], anel[(i + 1) % anel.length]);
          }
        }
      } else {
        const mu = s.larguraMm / 2 - c - bt / 2;
        const mv = s.profundidadeMm / 2 - c - bt / 2;
        for (let z = zA; z <= zB + 1e-6; z += passo) {
          for (const [pa, pb] of anelRetangular((du, dv) => seg3(noPlano(centro, b, du, dv), z), mu, mv)) push('estribo', bt, pa, pb);
        }
      }
    }
    return out;
  }

  if (s.kind === 'VIGA' || s.kind === 'VIGA_FUNDACAO') {
    const [pa, pb] = s.pontos;
    const L = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (L <= 0) return out;
    const u = { x: (pb.x - pa.x) / L, y: (pb.y - pa.y) / L };
    const v = { x: -u.y, y: u.x };
    const t = secaoTValida(s);
    const largura = t ? t.almaLarguraMm : s.larguraMm;
    const h = s.alturaMm;
    const inf = camada(a, 'longitudinal');
    const sup = camada(a, 'superior');
    const est = camada(a, 'estribo');
    const bt = est?.bitolaMm ?? 5;
    const no = (du: number, dv: number, z: number): Ponto3 => ({ x: pa.x + u.x * du + v.x * dv, y: pa.y + u.y * du + v.y * dv, z });
    const linha = (cam: CamadaDeArmadura | undefined, papel: string, z: number) => {
      if (!cam) return;
      const meia = largura / 2 - c - bt - cam.bitolaMm / 2;
      for (const dv of posicoesNaLinha(cam.n, Math.max(0, meia))) push(papel, cam.bitolaMm, no(0, dv, z), no(L, dv, z));
    };
    linha(inf, 'longitudinal', z0 + c + bt + (inf?.bitolaMm ?? 10) / 2);
    linha(sup, 'superior', z0 + h - c - bt - (sup?.bitolaMm ?? 10) / 2);
    if (est && est.espacamentoCm) {
      const passo = est.espacamentoCm * 10;
      const mv = largura / 2 - c - bt / 2;
      const mz = h / 2 - c - bt / 2;
      for (let du = 50; du <= L - 50 + 1e-6; du += passo) {
        for (const [qa, qb] of anelRetangular((dv, dz) => no(du, dv, z0 + h / 2 + dz), mv, mz)) push('estribo', bt, qa, qb);
      }
    }
    return out;
  }

  if (s.kind === 'LAJE') {
    const malha = camada(a, 'malha');
    if (!malha || !malha.espacamentoCm) return out;
    const anel = s.pontos;
    const passo = malha.espacamentoCm * 10;
    const xs = anel.map((p) => p.x);
    const ys = anel.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const zInf = z0 + c + malha.bitolaMm / 2;
    for (let y = y0 + passo / 2; y < y1; y += passo) {
      for (const [p, q] of recortarAoPoligono({ x: x0 - 1, y }, { x: x1 + 1, y }, anel)) push('malha', malha.bitolaMm, seg3(p, zInf), seg3(q, zInf));
    }
    for (let x = x0 + passo / 2; x < x1; x += passo) {
      for (const [p, q] of recortarAoPoligono({ x, y: y0 - 1 }, { x, y: y1 + 1 }, anel)) push('malha', malha.bitolaMm, seg3(p, zInf + malha.bitolaMm), seg3(q, zInf + malha.bitolaMm));
    }
    return out;
  }

  if (s.kind === 'BLOCO_COROAMENTO') {
    const [m1, m2] = camadas(a, 'malha');
    const est = camada(a, 'estribo');
    const centro = s.pontos[0];
    const b = baseDe(s.rotacaoDeg);
    const largura = s.larguraMm;
    const prof = s.circular ? s.larguraMm : s.profundidadeMm;
    const zInf = z0 + c + (m1?.bitolaMm ?? 12.5) / 2;
    const noZ = (du: number, dv: number, z: number): Ponto3 => seg3(noPlano(centro, b, du, dv), z);
    if (m1) {
      // Barras ao longo de u, espalhadas em v.
      for (const dv of posicoesNaLinha(m1.n, prof / 2 - c - m1.bitolaMm)) push('malha', m1.bitolaMm, noZ(-largura / 2 + c, dv, zInf), noZ(largura / 2 - c, dv, zInf));
    }
    if (m2) {
      for (const du of posicoesNaLinha(m2.n, largura / 2 - c - m2.bitolaMm)) push('malha', m2.bitolaMm, noZ(du, -prof / 2 + c, zInf + m2.bitolaMm), noZ(du, prof / 2 - c, zInf + m2.bitolaMm));
    }
    if (est && est.espacamentoCm) {
      const passo = est.espacamentoCm * 10;
      // Estribos verticais no plano (v, z), distribuídos ao longo de u.
      const mv = prof / 2 - c - est.bitolaMm / 2;
      const mz = s.alturaMm / 2 - c - est.bitolaMm / 2;
      for (let du = -largura / 2 + c + 50; du <= largura / 2 - c - 50 + 1e-6; du += passo) {
        for (const [qa, qb] of anelRetangular((dv, dz) => noZ(du, dv, z0 + s.alturaMm / 2 + dz), mv, mz)) push('estribo', est.bitolaMm, qa, qb);
      }
    }
    return out;
  }
  return out;
}

/** Todas as peças visíveis: `pecas` já filtradas por quem chama (pavimento, ocultos). */
export function segmentosDaArmaduraDoModelo(
  model: BlueprintModel,
  pecas: readonly ArmaduraDaPeca[],
  hip: HipotesesDeArmadura,
  filtro?: (s: Structural) => boolean,
): SegmentoDeArmadura[] {
  const porId = new Map((model.structures ?? []).map((s) => [s.id, s]));
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const out: SegmentoDeArmadura[] = [];
  for (const p of pecas) {
    const s = porId.get(p.structuralId);
    if (!s || (filtro && !filtro(s))) continue;
    out.push(...segmentosDaArmadura(s, p, hip, elev.get(s.levelId) ?? 0));
  }
  return out;
}
