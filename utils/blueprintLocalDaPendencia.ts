/**
 * ONDE UMA PENDÊNCIA ACONTECE (etapa C da fase "itens 6 a 11" da casa automática, 11/11/2026 — plano
 * docs/planos/2026-11-11-casa-automatica-itens-6-a-11.md). As pendências da casa saem AGREGADAS ("3 trecho(s) passando por
 * porta"), mas a origem sabe o elemento: os conflitos (trecho × outro), as marcas da verificação de rede, as regras. Aqui
 * moram o centro de um elemento, o ponto de um conflito e a disciplina em que a planta da prévia abre — fora do motor da
 * casa para ele não crescer. Puro: sem React, sem banco.
 */
import type { BlueprintModel, Conflito, DisciplinaDeRede, ObjectId, Point } from './blueprintKernel';
import type { LocalDaPendencia } from './blueprintGeradorPpci';

/** A disciplina em que a planta da prévia desenha (as das pranchas). */
export type DisciplinaDaPrevia = 'ARQUITETURA' | 'HUMANIZADA' | 'AGUA' | 'ESGOTO' | 'ELETRICA' | 'CLIMATIZACAO';

const media = (pts: readonly Point[]): Point => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const meio = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** O pavimento e o centro de um elemento do desenho; `null` = o id não existe (ou a família não tem lugar no plano). */
export function centroDoElemento(m: BlueprintModel, id: ObjectId): { levelId: ObjectId; ponto: Point } | null {
  const parede = m.walls.find((x) => x.id === id);
  if (parede) return { levelId: parede.levelId, ponto: meio(parede.a, parede.b) };
  const abertura = m.openings.find((x) => x.id === id);
  if (abertura) {
    const w = m.walls.find((x) => x.id === abertura.wallId);
    if (!w) return null;
    const comp = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const s = abertura.offsetMm + abertura.widthMm / 2;
    return { levelId: w.levelId, ponto: { x: w.a.x + ((w.b.x - w.a.x) * s) / comp, y: w.a.y + ((w.b.y - w.a.y) * s) / comp } };
  }
  const trecho = (m.trechos ?? []).find((x) => x.id === id);
  if (trecho) return { levelId: trecho.levelId, ponto: meio(trecho.a, trecho.b) };
  const terminal = (m.terminais ?? []).find((x) => x.id === id);
  if (terminal) return { levelId: terminal.levelId, ponto: { x: terminal.at.x, y: terminal.at.y } };
  const peca = (m.structures ?? []).find((x) => x.id === id);
  if (peca && peca.pontos.length) return { levelId: peca.levelId, ponto: media(peca.pontos) };
  const ambiente = m.spaces.find((x) => x.id === id);
  if (ambiente && ambiente.ring.length) return { levelId: ambiente.levelId, ponto: media(ambiente.ring) };
  return null;
}

/** O local de um grupo de elementos: os ids que existem, o pavimento e o centro do primeiro (ou `ponto`, quando dado). */
export function localDoElemento(m: BlueprintModel, ids: readonly ObjectId[], ponto?: Point | null): LocalDaPendencia | null {
  const achados = ids.map((id) => ({ id, c: centroDoElemento(m, id) })).filter((x) => x.c);
  if (!achados.length) return null;
  return { levelId: achados[0].c!.levelId, ids: achados.map((x) => x.id), ponto: ponto ?? achados[0].c!.ponto };
}

/** O ponto do segmento ab mais perto de p. */
function maisPerto(a: Point, b: Point, p: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** O cruzamento de dois segmentos na planta, ou `null` (paralelos ou sem encontro dentro deles). */
function cruzamento(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * r.x, y: a.y + t * r.y } : null;
}

/**
 * O local de um conflito: os dois lados e o ponto — rede × rede no cruzamento das duas (se não se cruzam na planta, o ponto
 * do trecho mais perto do meio do outro); trecho × peça, porta ou equipamento, o ponto do trecho mais perto do centro dela.
 */
export function localDoConflito(m: BlueprintModel, c: Pick<Conflito, 'trechoId' | 'outroId' | 'classe'>): LocalDaPendencia | null {
  const t = (m.trechos ?? []).find((x) => x.id === c.trechoId);
  if (!t) return localDoElemento(m, [c.trechoId, c.outroId]);
  const outroTrecho = c.classe === 'REDE' ? (m.trechos ?? []).find((x) => x.id === c.outroId) : undefined;
  const alvo = outroTrecho ? meio(outroTrecho.a, outroTrecho.b) : centroDoElemento(m, c.outroId)?.ponto;
  const ponto = (outroTrecho && cruzamento(t.a, t.b, outroTrecho.a, outroTrecho.b)) ?? (alvo ? maisPerto(t.a, t.b, alvo) : meio(t.a, t.b));
  return { levelId: t.levelId, ids: [t.id, c.outroId], ponto };
}

const DA_REDE: Record<DisciplinaDeRede, DisciplinaDaPrevia> = {
  AGUA_FRIA: 'AGUA',
  AGUA_QUENTE: 'AGUA',
  ESGOTO: 'ESGOTO',
  PLUVIAL: 'ESGOTO',
  ELETRICA: 'ELETRICA',
  FRIGORIGENA: 'CLIMATIZACAO',
  DRENO_AC: 'CLIMATIZACAO',
  MECANICA: 'CLIMATIZACAO',
  INCENDIO: 'ARQUITETURA',
};

/** A disciplina da planta da prévia em que o local se vê: a do primeiro trecho ou ponto de rede; sem rede, a arquitetura. */
export function disciplinaDoLocal(m: BlueprintModel, local: LocalDaPendencia): DisciplinaDaPrevia {
  for (const id of local.ids) {
    const d = (m.trechos ?? []).find((x) => x.id === id)?.disciplina ?? (m.terminais ?? []).find((x) => x.id === id)?.disciplina;
    if (d) return DA_REDE[d];
  }
  return 'ARQUITETURA';
}
