/**
 * A CABINE PRIMÁRIA (PE10 do prédio pelo Empreendimento, decisão do usuário de 19/11/2026: "Reservar a cabine de média
 * tensão"). Quando a demanda do prédio passa do padrão de baixa tensão, a entrada é em média tensão: a sala da cabine
 * (transformação e medição da concessionária) fica reservada no 1º subsolo, encostada no lado do contorno voltado para a
 * rua, fechada (paredes e porta). As vagas que ela toma saem. O projeto da cabine (o transformador, a proteção, a
 * ventilação, o acesso da concessionária) continua com a concessionária.
 *
 * ⚠️ É uma SALA, não um quadro acima do QGBT: o motor elétrico calcula a entrada (demanda, categoria, medidores por
 * unidade) no quadro sem pai (`entradaDoQuadro`) — um pai acima do QGBT tiraria essa conta de todas as telas.
 */
import { contornoDaEscada, contornoDaVaga, pointInPolygon, type Command, type ObjectId, type Point } from '../blueprintKernel';
import type { ContextoDoPredio } from './terreoECobertura';

export const NOME_DA_CABINE_PRIMARIA = 'Cabine primária';
/** A sala da cabine: 5 × 4 m (a da concessionária costuma pedir de 4 × 5 a 5 × 6 m — confira). */
export const CABINE_PRIMARIA_MM = { comprimento: 5000, fundo: 4000 };

/** Dois polígonos se cruzam: um vértice de um dentro do outro, ou dois lados que se cortam. */
export function poligonosSeCruzam(A: readonly { x: number; y: number }[], B: readonly { x: number; y: number }[]): boolean {
  if (A.some((p) => pointInPolygon(B as Point[], p as Point)) || B.some((p) => pointInPolygon(A as Point[], p as Point))) return true;
  const corta = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }, s: { x: number; y: number }) => {
    const d = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return d(p, q, r) * d(p, q, s) < 0 && d(r, s, p) * d(r, s, q) < 0;
  };
  return A.some((p, i) => B.some((r, j) => corta(p, A[(i + 1) % A.length], r, B[(j + 1) % B.length])));
}

const inteiro = (p: { x: number; y: number }): Point => ({ x: Math.round(p.x), y: Math.round(p.y) }) as Point;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export interface CabineReservada {
  comandos: number;
  anel: Point[];
  vagasCedidas: number;
}

/**
 * Reserva a cabine no pavimento `levelId` (o 1º subsolo), no contorno `contorno` (o da garagem), no lado voltado para a
 * `rua`, fugindo das escadas e rampas, dos núcleos e das áreas `evitar` (a sala técnica). `null` quando não coube.
 */
export function reservarCabinePrimaria(
  ctx: ContextoDoPredio,
  levelId: ObjectId,
  contorno: readonly Point[],
  rua: { x: number; y: number } | null,
  evitar: readonly (readonly Point[])[],
): CabineReservada | null {
  const { comprimento: C, fundo: F } = CABINE_PRIMARIA_MM;
  const m = ctx.m;
  const nivelDeBaixo = [...m.levels].filter((l) => l.elevationMm < (m.levels.find((x) => x.id === levelId)?.elevationMm ?? 0)).sort((a, b) => b.elevationMm - a.elevationMm)[0];
  const obstaculos: Point[][] = [
    ...evitar.map((x) => [...x]),
    ...m.stairs.filter((e) => e.levelId === levelId || e.levelId === nivelDeBaixo?.id || e.ateLevelId === levelId).map((e) => contornoDaEscada(e) as Point[]),
    ...(m.nucleos ?? []).map((n) => n.ring as Point[]),
  ];
  const paredesDentro = m.walls.filter((w) => w.levelId === levelId);
  const c0 = { x: contorno.reduce((s, p) => s + p.x, 0) / contorno.length, y: contorno.reduce((s, p) => s + p.y, 0) / contorno.length };
  const lados = contorno.map((a, i) => {
    const b = contorno[(i + 1) % contorno.length];
    const L = dist(a, b) || 1;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    let n = { x: u.y, y: -u.x };
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((meio.x - c0.x) * n.x + (meio.y - c0.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    return { a, L, u, n, nota: rua ? n.x * rua.x + n.y * rua.y : 0 };
  });
  const ordem = [...lados].sort((x, y) => y.nota - x.nota);
  for (const lado of ordem) {
    if (lado.L < C + 1000) continue;
    // Do canto para o meio, dos dois lados (a 50 cm do canto).
    const passos: number[] = [];
    for (let s = 500; s + C <= lado.L - 500; s += 500) passos.push(s);
    passos.sort((x, y) => Math.min(x, lado.L - x - C) - Math.min(y, lado.L - y - C));
    for (const s of passos) {
      const p = (t: number, v: number) => ({ x: lado.a.x + lado.u.x * t - lado.n.x * v, y: lado.a.y + lado.u.y * t - lado.n.y * v });
      const anel = [p(s, 0), p(s + C, 0), p(s + C, F), p(s, F)].map(inteiro);
      if (obstaculos.some((o) => poligonosSeCruzam(anel, o))) continue;
      // Nenhuma parede de outra sala atravessando (as do contorno ficam na borda: o meio delas não cai dentro).
      const encolhido = [p(s + 200, 200), p(s + C - 200, 200), p(s + C - 200, F - 200), p(s + 200, F - 200)];
      if (paredesDentro.some((w) => pointInPolygon(encolhido as Point[], { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 } as Point))) continue;
      let comandos = 0;
      const vagas = (m.vagas ?? []).filter((v) => v.levelId === levelId && poligonosSeCruzam(contornoDaVaga(v), anel));
      if (vagas.length) comandos += ctx.aplicar(vagas.map((v): Command => ({ type: 'DeleteVaga', vagaId: v.id }) as Command));
      const [A, B, Cc, D] = anel;
      const altura = m.levels.find((l) => l.id === levelId)?.defaultHeightMm ?? 3000;
      comandos += ctx.aplicar([[B, Cc], [Cc, D], [D, A]].map(([x, y]): Command => ({ type: 'AddWall', levelId, a: x, b: y, thicknessMm: 150, heightMm: altura })));
      const deDentro = ctx.m.walls.find((w) => w.levelId === levelId && dist(w.a, Cc) < 1 && dist(w.b, D) < 1);
      if (deDentro) comandos += ctx.aplicar([{ type: 'AddOpening', wallId: deDentro.id, kind: 'door', offsetMm: Math.round(C / 2 - 600), widthMm: 1200, heightMm: 2100, sillMm: 0 } as Command]);
      const centro = inteiro({ x: (A.x + Cc.x) / 2, y: (A.y + Cc.y) / 2 });
      const sala = ctx.m.spaces.find((x) => x.levelId === levelId && pointInPolygon(x.ring, centro));
      if (sala) comandos += ctx.aplicar([{ type: 'NameSpace', spaceId: sala.id, name: NOME_DA_CABINE_PRIMARIA }]);
      return { comandos, anel, vagasCedidas: vagas.length };
    }
  }
  return null;
}
