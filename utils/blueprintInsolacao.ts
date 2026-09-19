/**
 * INSOLAÇÃO E VENTILAÇÃO (19/09/2026, roadmap E5.1).
 *
 * POSIÇÃO DO SOL por latitude, dia do ano e HORA SOLAR (o meio-dia solar é
 * quando o sol cruza o meridiano do lugar — não a hora do relógio, que depende
 * de fuso e horário de verão; aqui a conta é astronômica, e a tela diz "hora
 * solar"). Declinação de Cooper (23,45° · sen(360/365 · (284 + n))), altura
 * pelo triângulo de posição, azimute a partir do NORTE no sentido horário —
 * vale nos dois hemisférios (no Brasil o sol do meio-dia fica ao norte quase o
 * ano todo, e o azimute dá isso sem caso especial).
 *
 * HORAS DE SOL POR FACHADA: varre o dia em passos de 15 min; a fachada tem sol
 * quando ele está acima do horizonte, à FRENTE dela (normal externa × direção
 * horizontal do sol > 0) e nenhum vizinho do entorno faz sombra no ponto de
 * referência (meio do trecho externo, a 1,20 m do piso do pavimento — a altura
 * de um peitoril). A sombra da própria edificação sobre si (varanda, beiral,
 * bloco em L) NÃO entra — é uma simplificação declarada; o 3D com o sol mostra
 * essas sombras de verdade. Horas do AMBIENTE = união, passo a passo, das
 * fachadas com JANELA (sol numa parede cega não ilumina nada).
 *
 * ENTORNO: os vizinhos são prismas (polígono + altura) que quem estuda declara
 * por divisa — "prédio de 12 m colado na lateral direita" — porque o desenho
 * não tem o quarteirão. A sombra é um teste de raio: do ponto de referência em
 * direção ao sol, andando em planta, até o raio passar do topo do prisma mais
 * alto; se em algum passo o ponto está dentro de um prisma abaixo do topo dele,
 * há sombra.
 *
 * VENTILAÇÃO CRUZADA: aberturas para fora em fachadas NÃO paralelas do mesmo
 * ambiente (azimutes que diferem de ≥ 30° módulo 180°). Duas janelas na mesma
 * parede não cruzam; janela e porta para fora em paredes ortogonais, sim.
 *
 * Tudo derivado. Datas de referência: 21/06 (solstício de inverno no
 * hemisfério sul — o pior sol), 21/03 (equinócio) e 21/12 (verão).
 */
import { pointInPolygon, type Boundary, type BoundaryPapel, type Point } from './blueprintKernel';
import { azimuteDaDirecao, type FachadaDoAmbiente, type GrafoEspacial, type NoEspacial, type PontoCardeal } from './blueprintGrafoEspacial';

export interface PosicaoSolar {
  /** Altura sobre o horizonte, graus (negativa = noite). */
  alturaGraus: number;
  /** A partir do norte, horário, 0–360. */
  azimuteGraus: number;
  acimaDoHorizonte: boolean;
}

export const DATAS_DE_REFERENCIA = {
  INVERNO: { dia: 172, rotulo: '21/06 · solstício de inverno', data: '2026-06-21' },
  EQUINOCIO: { dia: 80, rotulo: '21/03 · equinócio', data: '2026-03-21' },
  VERAO: { dia: 355, rotulo: '21/12 · solstício de verão', data: '2026-12-21' },
} as const;
export type DataDeReferencia = keyof typeof DATAS_DE_REFERENCIA;

/** Latitude quando o estudo não tem georreferência: Brasília (o centro do país), e a tela diz que é suposição. */
export const LATITUDE_PADRAO = -15.79;
/** Altura do ponto de referência da fachada sobre o piso do pavimento (peitoril). */
export const ALTURA_DO_PEITORIL_MM = 1200;
/** Passo da varredura do dia, em horas. */
export const PASSO_H = 0.25;
/** Abaixo disto o sol "raspa" a fachada e não conta (evita contar o nascer/pôr rasante). */
export const ALTURA_MINIMA_UTIL_GRAUS = 5;

const rad = (g: number) => (g * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function diaDoAno(data: string): number {
  const [y, m, d] = data.split('-').map(Number);
  if (!y || !m || !d) return DATAS_DE_REFERENCIA.INVERNO.dia;
  const inicio = Date.UTC(y, 0, 1);
  return Math.floor((Date.UTC(y, m - 1, d) - inicio) / 86_400_000) + 1;
}

/** Declinação solar (Cooper), graus. */
export function declinacaoSolarGraus(dia: number): number {
  return 23.45 * Math.sin(rad((360 / 365) * (284 + dia)));
}

export function posicaoSolar(latitudeGraus: number, dia: number, horaSolar: number): PosicaoSolar {
  const phi = rad(latitudeGraus);
  const delta = rad(declinacaoSolarGraus(dia));
  const H = rad(15 * (horaSolar - 12));
  const sinH = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H);
  const h = Math.asin(Math.max(-1, Math.min(1, sinH)));
  const cosAz = (Math.sin(delta) - Math.sin(h) * Math.sin(phi)) / (Math.cos(h) * Math.cos(phi) || 1e-9);
  let az = deg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  if (H > 0) az = 360 - az; // tarde: o sol está a oeste
  return { alturaGraus: Math.round(deg(h) * 10) / 10, azimuteGraus: Math.round(az * 10) / 10, acimaDoHorizonte: deg(h) > 0 };
}

/** Direção UNITÁRIA do sol no espaço do desenho (x, y em planta; z para cima), dado o norte do desenho. */
export function direcaoDoSol(pos: PosicaoSolar, rotacaoNorteDeg: number | null | undefined): { x: number; y: number; z: number } {
  const th = rad(rotacaoNorteDeg ?? 0);
  const norte = { x: Math.sin(th), y: Math.cos(th) };
  const leste = { x: Math.cos(th), y: -Math.sin(th) };
  const az = rad(pos.azimuteGraus);
  const h = rad(pos.alturaGraus);
  const hx = norte.x * Math.cos(az) + leste.x * Math.sin(az);
  const hy = norte.y * Math.cos(az) + leste.y * Math.sin(az);
  return { x: hx * Math.cos(h), y: hy * Math.cos(h), z: Math.sin(h) };
}

// ─── Entorno ─────────────────────────────────────────────────────────────────

export interface VizinhoDoEntorno {
  id: string;
  /** Em que divisa do lote ele está. */
  lado: BoundaryPapel;
  alturaM: number;
  /** Distância da divisa até a fachada do vizinho (0 = colado). */
  afastamentoM: number;
  /** Quanto ele avança para dentro do terreno vizinho (a "espessura" do bloco). */
  profundidadeM: number;
}

export interface PrismaDoEntorno {
  id: string;
  rotulo: string;
  anel: Point[];
  alturaMm: number;
}

export const ROTULO_DO_LADO: Record<BoundaryPapel, string> = { FRENTE: 'Frente (rua)', FUNDOS: 'Fundos', LATERAL_DIREITA: 'Lateral direita', LATERAL_ESQUERDA: 'Lateral esquerda' };

/** Um prisma por vizinho: retângulo ao longo da divisa, do lado de FORA do lote. */
export function prismasDoEntorno(vizinhos: readonly VizinhoDoEntorno[], limites: readonly Boundary[], loteAnel: readonly Point[] | null): PrismaDoEntorno[] {
  const out: PrismaDoEntorno[] = [];
  const centro = loteAnel && loteAnel.length ? { x: loteAnel.reduce((s, p) => s + p.x, 0) / loteAnel.length, y: loteAnel.reduce((s, p) => s + p.y, 0) / loteAnel.length } : null;
  for (const v of vizinhos) {
    const divisas = limites.filter((b) => b.kind === 'TERRENO' && b.papel === v.lado);
    divisas.forEach((d, k) => {
      const dx = d.b.x - d.a.x;
      const dy = d.b.y - d.a.y;
      const c = Math.hypot(dx, dy) || 1;
      let nx = -dy / c;
      let ny = dx / c;
      // Para fora: o lado oposto ao centro do lote.
      if (centro) {
        const mx = (d.a.x + d.b.x) / 2;
        const my = (d.a.y + d.b.y) / 2;
        if ((centro.x - mx) * nx + (centro.y - my) * ny > 0) {
          nx = -nx;
          ny = -ny;
        }
      }
      const o = v.afastamentoM * 1000;
      const p = o + v.profundidadeM * 1000;
      out.push({
        id: `${v.id}:${k}`,
        rotulo: `${ROTULO_DO_LADO[v.lado]} · ${v.alturaM} m`,
        anel: [
          { x: Math.round(d.a.x + nx * o), y: Math.round(d.a.y + ny * o) },
          { x: Math.round(d.b.x + nx * o), y: Math.round(d.b.y + ny * o) },
          { x: Math.round(d.b.x + nx * p), y: Math.round(d.b.y + ny * p) },
          { x: Math.round(d.a.x + nx * p), y: Math.round(d.a.y + ny * p) },
        ],
        alturaMm: Math.round(v.alturaM * 1000),
      });
    });
  }
  return out;
}

/** O raio do ponto ao sol encontra algum prisma? (marcha em planta, passo de 250 mm) */
export function sombreado(ponto: { x: number; y: number; zMm: number }, dir: { x: number; y: number; z: number }, prismas: readonly PrismaDoEntorno[]): boolean {
  if (prismas.length === 0 || dir.z <= 0) return false;
  const topo = Math.max(...prismas.map((p) => p.alturaMm));
  const hor = Math.hypot(dir.x, dir.y);
  if (hor < 1e-6) return false;
  const passo = 250;
  const ux = dir.x / hor;
  const uy = dir.y / hor;
  const tan = dir.z / hor;
  for (let d = passo; ; d += passo) {
    const z = ponto.zMm + d * tan;
    if (z > topo) return false;
    const q = { x: ponto.x + ux * d, y: ponto.y + uy * d };
    for (const p of prismas) if (z < p.alturaMm && pointInPolygon(p.anel, q)) return true;
    if (d > 500_000) return false;
  }
}

// ─── Horas de sol ────────────────────────────────────────────────────────────

export interface OpcoesDeInsolacao {
  latitudeGraus: number;
  rotacaoNorteDeg: number | null;
  prismas: readonly PrismaDoEntorno[];
  /** Cota do piso do pavimento (mm) — o ponto de referência fica a 1,20 m acima. */
  pisoMm: number;
}

/** Para cada passo do dia, a fachada tem sol? */
function passosDeSol(f: FachadaDoAmbiente, dia: number, o: OpcoesDeInsolacao): boolean[] {
  const out: boolean[] = [];
  for (let h = 0; h < 24; h += PASSO_H) {
    const pos = posicaoSolar(o.latitudeGraus, dia, h);
    if (pos.alturaGraus < ALTURA_MINIMA_UTIL_GRAUS) {
      out.push(false);
      continue;
    }
    const dir = direcaoDoSol(pos, o.rotacaoNorteDeg);
    const frente = f.normal.x * dir.x + f.normal.y * dir.y > 0;
    if (!frente) {
      out.push(false);
      continue;
    }
    out.push(!sombreado({ x: f.meio.x, y: f.meio.y, zMm: o.pisoMm + ALTURA_DO_PEITORIL_MM }, dir, o.prismas));
  }
  return out;
}

export function horasDeSolNaFachada(f: FachadaDoAmbiente, dia: number, o: OpcoesDeInsolacao): number {
  return Math.round(passosDeSol(f, dia, o).filter(Boolean).length * PASSO_H * 100) / 100;
}

export interface FachadaInsolada {
  orientacao: PontoCardeal;
  azimuteGraus: number;
  janelas: number;
  horas: Record<DataDeReferencia, number>;
}

export interface VentilacaoCruzada {
  cruzada: boolean;
  /** Orientações das fachadas com abertura para fora. */
  orientacoes: PontoCardeal[];
  motivo: string;
}

export interface InsolacaoDoAmbiente {
  spaceId: string;
  levelId: string;
  rotulo: string;
  etiquetaId: string | null;
  fachadas: FachadaInsolada[];
  /** União das fachadas COM JANELA, por data. */
  horas: Record<DataDeReferencia, number>;
  temJanela: boolean;
  ventilacao: VentilacaoCruzada;
  /** No instante escolhido: sol entra por alguma janela? */
  agora: 'SOL' | 'SOMBRA' | 'SEM_JANELA' | 'NOITE';
}

export function ventilacaoCruzada(no: NoEspacial): VentilacaoCruzada {
  const comAbertura = no.fachadas.filter((f) => f.aberturas.length > 0);
  const orientacoes = [...new Set(comAbertura.map((f) => f.orientacao))];
  if (comAbertura.length === 0) return { cruzada: false, orientacoes, motivo: 'sem abertura para fora' };
  if (comAbertura.length === 1) return { cruzada: false, orientacoes, motivo: `abertura só na fachada ${comAbertura[0].orientacao}` };
  for (let i = 0; i < comAbertura.length; i++) {
    for (let j = i + 1; j < comAbertura.length; j++) {
      const dif = Math.abs(comAbertura[i].azimuteGraus - comAbertura[j].azimuteGraus) % 180;
      const naoParalelas = Math.min(dif, 180 - dif) >= 30;
      if (naoParalelas) return { cruzada: true, orientacoes, motivo: `aberturas em ${comAbertura[i].orientacao} e ${comAbertura[j].orientacao}` };
    }
  }
  return { cruzada: false, orientacoes, motivo: 'aberturas só em fachadas paralelas' };
}

export interface InstanteSolar {
  dia: number;
  horaSolar: number;
}

export function analisarInsolacao(grafo: GrafoEspacial, o: OpcoesDeInsolacao, agora: InstanteSolar): InsolacaoDoAmbiente[] {
  const posAgora = posicaoSolar(o.latitudeGraus, agora.dia, agora.horaSolar);
  const dirAgora = direcaoDoSol(posAgora, o.rotacaoNorteDeg);
  const datas = Object.keys(DATAS_DE_REFERENCIA) as DataDeReferencia[];
  return grafo.nos.map((no) => {
    const passosPorData: Record<DataDeReferencia, boolean[][]> = { INVERNO: [], EQUINOCIO: [], VERAO: [] };
    const fachadas: FachadaInsolada[] = no.fachadas.map((f) => {
      const horas = { INVERNO: 0, EQUINOCIO: 0, VERAO: 0 } as Record<DataDeReferencia, number>;
      for (const d of datas) {
        const passos = passosDeSol(f, DATAS_DE_REFERENCIA[d].dia, o);
        horas[d] = Math.round(passos.filter(Boolean).length * PASSO_H * 100) / 100;
        if (f.aberturas.some((a) => a.kind === 'window')) passosPorData[d].push(passos);
      }
      return { orientacao: f.orientacao, azimuteGraus: f.azimuteGraus, janelas: f.aberturas.filter((a) => a.kind === 'window').length, horas };
    });
    const horas = { INVERNO: 0, EQUINOCIO: 0, VERAO: 0 } as Record<DataDeReferencia, number>;
    for (const d of datas) {
      const listas = passosPorData[d];
      if (listas.length === 0) continue;
      let n = 0;
      for (let i = 0; i < listas[0].length; i++) if (listas.some((l) => l[i])) n++;
      horas[d] = Math.round(n * PASSO_H * 100) / 100;
    }
    const comJanela = no.fachadas.filter((f) => f.aberturas.some((a) => a.kind === 'window'));
    let agoraEstado: InsolacaoDoAmbiente['agora'];
    if (comJanela.length === 0) agoraEstado = 'SEM_JANELA';
    else if (posAgora.alturaGraus < ALTURA_MINIMA_UTIL_GRAUS) agoraEstado = 'NOITE';
    else agoraEstado = comJanela.some((f) => f.normal.x * dirAgora.x + f.normal.y * dirAgora.y > 0 && !sombreado({ x: f.meio.x, y: f.meio.y, zMm: o.pisoMm + ALTURA_DO_PEITORIL_MM }, dirAgora, o.prismas)) ? 'SOL' : 'SOMBRA';
    return { spaceId: no.spaceId, levelId: no.levelId, rotulo: no.rotulo, etiquetaId: no.etiquetaId, fachadas, horas, temJanela: comJanela.length > 0, ventilacao: ventilacaoCruzada(no), agora: agoraEstado };
  });
}

/** Direção do sol como azimute da normal de uma fachada — para descrever "sol de nordeste". */
export function orientacaoDoSol(pos: PosicaoSolar): string {
  const idx = Math.round(pos.azimuteGraus / 45) % 8;
  return ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][idx];
}

export interface ResumoDaInsolacao {
  ambientes: number;
  comJanela: number;
  /** Ambientes com janela e menos de `minimaH` de sol no inverno (ou 0 h quando não há mínimo). */
  semSolNoInverno: InsolacaoDoAmbiente[];
  comVentilacaoCruzada: number;
  semVentilacaoCruzada: InsolacaoDoAmbiente[];
}

export function resumirInsolacao(lista: readonly InsolacaoDoAmbiente[], minimaH: number | null): ResumoDaInsolacao {
  const comJanela = lista.filter((a) => a.temJanela);
  return {
    ambientes: lista.length,
    comJanela: comJanela.length,
    semSolNoInverno: comJanela.filter((a) => (minimaH != null ? a.horas.INVERNO < minimaH : a.horas.INVERNO === 0)),
    comVentilacaoCruzada: lista.filter((a) => a.ventilacao.cruzada).length,
    semVentilacaoCruzada: lista.filter((a) => !a.ventilacao.cruzada && a.temJanela),
  };
}

/** O que o motor de regras (E3.2) recebe por ambiente. */
export function insolacaoParaRegras(lista: readonly InsolacaoDoAmbiente[]): Record<string, { horasSolInverno: number; horasSolVerao: number; ventilacaoCruzada: boolean; temJanela: boolean }> {
  const out: Record<string, { horasSolInverno: number; horasSolVerao: number; ventilacaoCruzada: boolean; temJanela: boolean }> = {};
  for (const a of lista) out[a.spaceId] = { horasSolInverno: a.horas.INVERNO, horasSolVerao: a.horas.VERAO, ventilacaoCruzada: a.ventilacao.cruzada, temJanela: a.temJanela };
  return out;
}

export { azimuteDaDirecao };
