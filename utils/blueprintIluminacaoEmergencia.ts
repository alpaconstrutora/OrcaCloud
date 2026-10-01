/**
 * ILUMINAÇÃO DE EMERGÊNCIA (01/10/2026, E7.3 do roadmap de incêndio).
 *
 * Sobre as rotas de fuga da E6.3:
 *  - PONTOS OBRIGATÓRIOS: cada mudança de direção, cada saída e cada boca de
 *    escada pede uma luminária a até 2 m;
 *  - ESPAÇAMENTO: nenhum ponto da rota (amostrado a cada 1 m) pode ficar a mais
 *    de MEIO espaçamento máximo da luminária mais próxima do pavimento — o que
 *    equivale a luminárias a no máximo um espaçamento umas das outras;
 *  - AUTONOMIA: a declarada (ou a da ficha) contra a mínima.
 * A PROPOSTA põe primeiro os pontos obrigatórios e depois preenche ao longo
 * das rotas (cada luminária nova meio espaçamento ADIANTE do primeiro ponto
 * descoberto, para cobrir para trás e para a frente), num lote só.
 *
 * ⚠️ NORMA (CONFERIR NA NBR 10898): espaçamento máximo de 15 m e autonomia
 * mínima de 60 min, transcritos de memória.
 */
import type { BlueprintModel, Command, Escada, ObjectId, Point } from './blueprintKernel';
import type { PercursoDeFuga } from './blueprintRotaDeFuga';
import { pontosDeSinalizacaoDaRota } from './blueprintSinalizacao';

export const FONTE_ILUMINACAO = 'NBR 10898 — CONFERIR NA NORMA (transcrito de memória)';
export const ESPACAMENTO_MAXIMO_PADRAO_M = 15;
export const AUTONOMIA_MINIMA_MIN = 60;
export const COTA_DA_LUMINARIA_MM = 2200;
/** Ponto obrigatório atendido por luminária a até isto, mm. */
const RAIO_DO_PONTO_OBRIGATORIO_MM = 2000;
/** Folga para dentro do raio ao posicionar (o arredondamento a mm não pode jogar a luminária fora). */
const FOLGA_DO_RAIO_MM = 100;
const PASSO_DA_AMOSTRA_MM = 1000;
const RAIO_DA_MESMA_MM = 1500;

export interface HipotesesDeIluminacao {
  /** Declarado vence o da norma (15 m). */
  espacamentoMaximoM: number | null;
}
export const HIPOTESES_ILUMINACAO_PADRAO: HipotesesDeIluminacao = { espacamentoMaximoM: null };
export function hipotesesDeIluminacaoDaColuna(raw: unknown): HipotesesDeIluminacao {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const x = r.espacamentoMaximoM;
  return { espacamentoMaximoM: typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null };
}

export type TipoDePontoDeLuz = 'MUDANCA' | 'SAIDA' | 'ESCADA';
export interface PontoObrigatorio {
  levelId: ObjectId;
  at: Point;
  tipo: TipoDePontoDeLuz;
  coberto: boolean;
}

export interface AnaliseDeIluminacao {
  espacamentoM: number;
  luminarias: number;
  pontosObrigatorios: PontoObrigatorio[];
  /** Os trechos da rota longe demais de qualquer luminária (um ponto a cada 1,5 m, no máximo). */
  trechosSemLuz: { levelId: ObjectId; at: Point }[];
  /** Luminárias com autonomia abaixo da mínima. */
  autonomiaCurta: ObjectId[];
  fonte: string;
}

const d2 = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** As bocas das escadas: o começo do eixo na partida e o fim em cada pavimento acima que ela serve. */
function bocasDasEscadas(model: BlueprintModel): { levelId: ObjectId; at: Point }[] {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm || a.id.localeCompare(b.id));
  const bocas: { levelId: ObjectId; at: Point }[] = [];
  for (const e of (model.stairs ?? []) as Escada[]) {
    const i = niveis.findIndex((l) => l.id === e.levelId);
    if (i < 0) continue;
    const j = e.ateLevelId ? niveis.findIndex((l) => l.id === e.ateLevelId) : i + 1;
    bocas.push({ levelId: e.levelId, at: e.pontos[0] });
    for (let k = i + 1; k <= Math.min(j, niveis.length - 1); k++) bocas.push({ levelId: niveis[k].id, at: e.pontos[e.pontos.length - 1] });
  }
  return bocas;
}

/** Amostras ao longo de uma polilinha, a cada `passo` (e o fim), com a posição (arco) de cada uma. */
function amostrar(pontos: Point[], passo: number): { at: Point; s: number }[] {
  const L = pontos.slice(1).reduce((t, q, i) => t + d2(pontos[i], q), 0);
  const r: { at: Point; s: number }[] = [];
  for (let s = 0; s < L; s += passo) r.push({ at: noArco(pontos, s), s });
  r.push({ at: pontos[pontos.length - 1], s: L });
  return r;
}

/** O ponto a `s` mm do começo da polilinha. */
function noArco(pontos: Point[], s: number): Point {
  let resto = s;
  for (let i = 1; i < pontos.length; i++) {
    const L = d2(pontos[i - 1], pontos[i]);
    if (resto <= L) return { x: pontos[i - 1].x + ((pontos[i].x - pontos[i - 1].x) * resto) / (L || 1), y: pontos[i - 1].y + ((pontos[i].y - pontos[i - 1].y) * resto) / (L || 1) };
    resto -= L;
  }
  return pontos[pontos.length - 1];
}

function pontosObrigatorios(model: BlueprintModel, percurso: PercursoDeFuga, descargaLevelId: ObjectId | null): Omit<PontoObrigatorio, 'coberto'>[] {
  const lista: Omit<PontoObrigatorio, 'coberto'>[] = [];
  const somar = (p: Omit<PontoObrigatorio, 'coberto'>) => {
    if (!lista.some((q) => q.levelId === p.levelId && d2(q.at, p.at) < RAIO_DA_MESMA_MM)) lista.push(p);
  };
  for (const p of pontosDeSinalizacaoDaRota(percurso, descargaLevelId)) somar({ levelId: p.levelId, at: p.at, tipo: p.codigo === 'S12' ? 'SAIDA' : 'MUDANCA' });
  for (const b of bocasDasEscadas(model)) somar({ levelId: b.levelId, at: { x: Math.round(b.at.x), y: Math.round(b.at.y) }, tipo: 'ESCADA' });
  return lista;
}

export function analisarIluminacao(model: BlueprintModel, percurso: PercursoDeFuga | null, descargaLevelId: ObjectId | null, hip: HipotesesDeIluminacao): AnaliseDeIluminacao {
  const espacamentoM = hip.espacamentoMaximoM ?? ESPACAMENTO_MAXIMO_PADRAO_M;
  const R = (espacamentoM * 1000) / 2;
  const lums = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'LUMINARIA_EMERGENCIA');
  const perto = (levelId: ObjectId, p: Point, raio: number) => lums.some((l) => l.levelId === levelId && d2(l.at, p) <= raio + 1e-6);
  const obrig = percurso ? pontosObrigatorios(model, percurso, descargaLevelId).map((p) => ({ ...p, coberto: perto(p.levelId, p.at, RAIO_DO_PONTO_OBRIGATORIO_MM) })) : [];
  const trechosSemLuz: { levelId: ObjectId; at: Point }[] = [];
  for (const a of percurso?.ambientes ?? []) {
    for (const r of a.rota) {
      for (const am of amostrar(r.pontos, PASSO_DA_AMOSTRA_MM)) {
        if (perto(r.levelId, am.at, R)) continue;
        if (!trechosSemLuz.some((q) => q.levelId === r.levelId && d2(q.at, am.at) < RAIO_DA_MESMA_MM)) trechosSemLuz.push({ levelId: r.levelId, at: { x: Math.round(am.at.x), y: Math.round(am.at.y) } });
      }
    }
  }
  const autonomiaCurta = lums.filter((l) => (l.autonomiaMin ?? AUTONOMIA_MINIMA_MIN) < AUTONOMIA_MINIMA_MIN).map((l) => l.id);
  return { espacamentoM, luminarias: lums.length, pontosObrigatorios: obrig, trechosSemLuz, autonomiaCurta, fonte: FONTE_ILUMINACAO };
}

/** A proposta: os pontos obrigatórios descobertos e o preenchimento das rotas — um lote. */
export function proporIluminacao(model: BlueprintModel, percurso: PercursoDeFuga | null, a: AnaliseDeIluminacao): Command[] {
  const R = (a.espacamentoM * 1000) / 2;
  const existentes = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'LUMINARIA_EMERGENCIA').map((t) => ({ levelId: t.levelId, at: t.at }));
  const novas: { levelId: ObjectId; at: Point }[] = [];
  const todas = () => [...existentes, ...novas];
  const perto = (levelId: ObjectId, p: Point, raio: number) => todas().some((l) => l.levelId === levelId && d2(l.at, p) <= raio + 1e-6);
  for (const p of a.pontosObrigatorios) if (!perto(p.levelId, p.at, RAIO_DO_PONTO_OBRIGATORIO_MM)) novas.push({ levelId: p.levelId, at: { ...p.at } });
  for (const amb of percurso?.ambientes ?? []) {
    for (const r of amb.rota) {
      const L = r.pontos.slice(1).reduce((t, q, i) => t + d2(r.pontos[i], q), 0);
      for (const am of amostrar(r.pontos, PASSO_DA_AMOSTRA_MM)) {
        if (perto(r.levelId, am.at, R)) continue;
        // ⚠️ E10 (o gerador de PPCI pegou): a luminária EXATAMENTE a R do ponto descoberto, com a
        // coordenada arredondada, caía a 7.500,27 mm — fora do raio. A análise seguia acusando e cada
        // nova proposta empilhava outra no MESMO lugar. A folga de 10 cm a põe dentro.
        const q = noArco(r.pontos, Math.min(am.s + R - FOLGA_DO_RAIO_MM, L));
        novas.push({ levelId: r.levelId, at: { x: Math.round(q.x), y: Math.round(q.y) } });
      }
    }
  }
  return novas.map((n) => ({ type: 'AddTerminal', levelId: n.levelId, disciplina: 'INCENDIO', tipo: 'LUMINARIA_EMERGENCIA', tipoHidraulico: 'LUMINARIA_EMERGENCIA', at: n.at, cotaMm: COTA_DA_LUMINARIA_MM }) as Command);
}
