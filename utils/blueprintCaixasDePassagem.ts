/**
 * CAIXAS DE PASSAGEM AUTOMÁTICAS (E6.3, 29/09/2026) — puro.
 *
 * HIPÓTESE com fonte (NBR 5410:2004, 6.2.11.1.7 — linhas internas): o trecho
 * contínuo de eletroduto SEM caixa não passa de 15 m se for retilíneo, e o
 * limite cai 3 m a cada curva de 90°; entre duas caixas, no máximo 270° de
 * curvas (três de 90°). Os números são editáveis (`RegraDeCaixas`) — o texto
 * vigente da norma é quem manda.
 *
 * O que é um TRECHO CONTÍNUO aqui: a sequência de eletrodutos entre duas
 * "caixas" — o ponto (caixa de tomada, de interruptor, de luz), o quadro, uma
 * caixa de passagem, ou uma DERIVAÇÃO (três ou mais eletrodutos no mesmo nó).
 * Derivação sem ponto embaixo ganha caixa (um "T" de eletroduto não existe na
 * obra); derivação no teto sobre um ponto usa a caixa do ponto — e aí a descida
 * até ele (e a curva) entra na conta do trecho.
 *
 * A curva é o ângulo entre dois eletrodutos seguidos, em 3D (subir da tomada ao
 * teto e seguir pelo teto = 90°). O comprimento "equivalente" é o real + 3 m por
 * 90° de curva acumulada; passou de 15 m, uma caixa entra no ponto do trecho
 * horizontal onde o limite é atingido (ou no nó anterior, quando o trecho é
 * vertical); a 4ª curva põe a caixa no próprio nó da curva.
 */
export interface RegraDeCaixas {
  comprimentoMaximoMm: number;
  reducaoPorCurvaMm: number;
  curvasMaximasGraus: number;
}

export const REGRA_DE_CAIXAS_PADRAO: RegraDeCaixas = { comprimentoMaximoMm: 15_000, reducaoPorCurvaMm: 3_000, curvasMaximasGraus: 270 };
export const FONTE_DA_REGRA_DE_CAIXAS = 'NBR 5410 6.2.11.1.7 — 15 m retilíneos, −3 m por curva de 90°, no máximo 270° de curvas entre caixas';

export type P3 = { x: number; y: number; z: number };

export interface SegmentoDaRede {
  /** Quem chama identifica o segmento por aqui (o índice do comando). */
  id: number;
  a: P3;
  b: P3;
  /** Segmento que já existe no desenho: o trecho que o contém não é mexido. */
  fixo?: boolean;
}

export interface CaixaPrevista {
  at: P3;
  motivo: 'COMPRIMENTO' | 'CURVAS' | 'DERIVACAO';
  /** Caixa NO MEIO de um segmento (que quem chama parte em dois); `null` = no nó. */
  segmento: number | null;
}

/** Afastamento mínimo das pontas para uma caixa no meio do segmento, mm. */
const MIN_NO_SEGMENTO_MM = 100;
const EPS = 1e-6;

const k3 = (p: P3) => `${p.x},${p.y},${p.z}`;
const sub = (a: P3, b: P3) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norma = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
function angulo(u: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }): number {
  const nu = norma(u);
  const nv = norma(v);
  if (nu === 0 || nv === 0) return 0;
  const c = Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv)));
  return (Math.acos(c) * 180) / Math.PI;
}

/**
 * As caixas que faltam na rede. `caixaEm(p)`: `null` = não há caixa neste nó;
 * `{ descidaMm: 0 }` = há (ponto, quadro, caixa existente); `{ descidaMm: d }` =
 * o nó está sobre um ponto, a `d` mm dele — a caixa do ponto serve à
 * derivação, e a descida entra no trecho.
 */
export function caixasDaRede(
  segmentos: readonly SegmentoDaRede[],
  caixaEm: (p: P3) => { descidaMm: number } | null,
  regra: RegraDeCaixas = REGRA_DE_CAIXAS_PADRAO,
  /**
   * De onde medir: fronteira de prioridade MENOR primeiro (o planejador passa a
   * distância pela rede até o quadro — o trecho se mede do quadro para a ponta,
   * como se puxa o fio). Empate e ausência: a ordem das posições.
   */
  prioridade: (p: P3) => number = () => 0,
): { caixas: CaixaPrevista[]; avisos: string[] } {
  const caixas: CaixaPrevista[] = [];
  const avisos: string[] = [];
  const incidentes = new Map<string, number[]>();
  const pos = new Map<string, P3>();
  segmentos.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = k3(p);
      pos.set(k, p);
      incidentes.set(k, [...(incidentes.get(k) ?? []), i]);
    }
  });
  const caixaNoNo = new Map<string, { descidaMm: number } | null>();
  for (const [k, p] of pos) caixaNoNo.set(k, caixaEm(p));
  // Derivação sem caixa: ganha uma.
  for (const k of [...pos.keys()].sort()) {
    if ((incidentes.get(k) ?? []).length >= 3 && !caixaNoNo.get(k)) {
      caixas.push({ at: pos.get(k)!, motivo: 'DERIVACAO', segmento: null });
      caixaNoNo.set(k, { descidaMm: 0 });
    }
  }
  const limite = (accL: number, accD: number) => accL + (accD / 90) * regra.reducaoPorCurvaMm;
  const ehFronteira = (k: string) => !!caixaNoNo.get(k) || (incidentes.get(k) ?? []).length !== 2;

  const visitados = new Set<number>();
  const fronteiras = [...pos.keys()].filter(ehFronteira).sort((x, y) => prioridade(pos.get(x)!) - prioridade(pos.get(y)!) || (x < y ? -1 : x > y ? 1 : 0));
  for (const inicio of fronteiras) {
    for (const s0 of [...(incidentes.get(inicio) ?? [])].sort((x, y) => segmentos[x].id - segmentos[y].id)) {
      if (visitados.has(s0)) continue;
      // Percorre até a próxima fronteira.
      const pts: P3[] = [pos.get(inicio)!];
      const segs: number[] = [];
      let atual = inicio;
      let s = s0;
      for (;;) {
        visitados.add(s);
        segs.push(s);
        const seg = segmentos[s];
        const prox = k3(seg.a) === atual ? k3(seg.b) : k3(seg.a);
        pts.push(pos.get(prox)!);
        atual = prox;
        if (ehFronteira(atual)) break;
        const seguinte = (incidentes.get(atual) ?? []).find((x) => x !== s && !visitados.has(x));
        if (seguinte == null) break;
        s = seguinte;
      }
      if (segs.some((i) => segmentos[i].fixo)) continue;

      const descidaInicio = caixaNoNo.get(k3(pts[0]))?.descidaMm ?? 0;
      const descidaFim = caixaNoNo.get(k3(pts[pts.length - 1]))?.descidaMm ?? 0;
      let accL = descidaInicio;
      let accD = descidaInicio > 0 ? 90 : 0;
      const poeNoNo = (p: P3, motivo: CaixaPrevista['motivo']) => {
        caixas.push({ at: p, motivo, segmento: null });
        accL = 0;
        accD = 0;
      };
      for (let i = 0; i < segs.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (i > 0) {
          const ang = angulo(sub(a, pts[i - 1]), sub(b, a));
          if (accD + ang > regra.curvasMaximasGraus + EPS) poeNoNo(a, 'CURVAS');
          else accD += ang;
        }
        const L = norma(sub(b, a));
        const horizontal = a.z === b.z;
        let andado = 0; // já percorrido neste segmento
        let noInicio = true; // o cursor ainda está no nó `a`
        while (limite(accL + (L - andado), accD) > regra.comprimentoMaximoMm + EPS) {
          const cabe = regra.comprimentoMaximoMm - limite(accL, accD);
          if (horizontal && cabe >= MIN_NO_SEGMENTO_MM && L - (andado + cabe) >= MIN_NO_SEGMENTO_MM) {
            const t = (andado + cabe) / L;
            const at = { x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t), z: a.z };
            caixas.push({ at, motivo: 'COMPRIMENTO', segmento: segmentos[segs[i]].id });
            andado += cabe;
            accL = 0;
            accD = 0;
            noInicio = false;
          } else if (noInicio && (accL > 0 || accD > 0)) {
            poeNoNo(a, 'COMPRIMENTO');
            noInicio = false;
          } else {
            avisos.push(`trecho de ${((L - andado) / 1000).toFixed(1).replace('.', ',')} m sem lugar para caixa de passagem (vertical ou curto demais) — confira`);
            break;
          }
        }
        accL += L - andado;
      }
      if (descidaFim > 0) {
        const fim = pts[pts.length - 1];
        if (accD + 90 > regra.curvasMaximasGraus + EPS || limite(accL + descidaFim, accD + 90) > regra.comprimentoMaximoMm + EPS) {
          if (accL > 0 || accD > 0) poeNoNo(fim, 'COMPRIMENTO');
        }
      }
    }
  }
  // Uma caixa por posição (duas regras no mesmo nó = uma caixa).
  const unicas = new Map<string, CaixaPrevista>();
  for (const c of caixas) if (!unicas.has(k3(c.at))) unicas.set(k3(c.at), c);
  return { caixas: [...unicas.values()], avisos };
}
