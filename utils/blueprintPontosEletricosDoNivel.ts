/**
 * OS PONTOS ELÉTRICOS PELA NORMA, por ambiente e por pavimento (F9 da casa automática, 15/10/2026).
 *
 * Tomadas (NBR 5410 9.5.2.2.1 — só no ambiente com tipo) e luz de teto com interruptor (9.5.2.1 — todo
 * ambiente). Era o mesmo encadeamento em dois lugares — o "Completar pela norma" do editor e o automático
 * "tomadas e luz" do gerador E6.2 —, e a casa automática seria o terceiro: aqui fica um só.
 *
 *   conferirTomadas → distribuirAoLongo (o déficit, pelos lados de piso) → comandosParaCompletar
 *   conferirIluminacao → comandosDeIluminacao
 *
 * Por ambiente, os comandos SEM potência (quem chama aplica `aplicarPotenciaPadrao` no lote todo, com o
 * modelo de ANTES — a contagem das 3 primeiras de 600 VA é sequencial). Por pavimento, já com a potência.
 */
import type { BlueprintModel, Command, ObjectId, Point, Space } from './blueprintKernel';
import { areaRecuada, envelopeDoTrecho, pegadaEmPlanta, pointInPolygon } from './blueprintKernel';
import { comandosDeIluminacao, comandosParaCompletar, conferirIluminacao, conferirTomadas, distribuirAoLongo, etiquetaDoAmbiente, ladosDePiso } from './blueprintDistribuicao';
import { aplicarPotenciaPadrao } from './blueprintPotenciaPadrao';
import { pegadasDePilares } from './blueprintObstaculosEstruturais';

export interface OpcoesDosPontosEletricos {
  /** O pé-direito do pavimento (a luz de teto). */
  peDireitoMm: number;
  /** E6.3: uma luz de teto a cada tantos m² (null = uma por ambiente). */
  areaPorLuminariaM2?: number | null;
  /** Posições já ocupadas na parede, que as tomadas novas evitam. Ausente = nenhuma. */
  ocupados?: readonly Point[];
}

/** S1 da casa automática: a cota a partir da qual um tubo horizontal é "do forro" (acima da altura dos pontos), mm. */
const TUBO_DO_FORRO_ACIMA_DE_MM = 2000;
/** S1: o passo da amostra dos tubos do forro e a folga do eletroduto a eles, mm. */
const PASSO_DA_AMOSTRA_DO_TUBO_MM = 100;
const FOLGA_DO_PONTO_AO_TUBO_MM = 20;
/** S1: o raio do eletroduto que sobe do ponto (DN 25), mm. */
const RAIO_DO_ELETRODUTO_DO_PONTO_MM = 12.5;

/**
 * S1 da casa automática (20/10/2026): os TUBOS de outra rede que correm no forro do pavimento (horizontais acima de
 * `TUBO_DO_FORRO_ACIMA_DE_MM`), amostrados a cada `PASSO_DA_AMOSTRA_DO_TUBO_MM`, com o raio de cada um. A água é traçada
 * antes dos pontos elétricos: a tomada e o interruptor postos sob um tubo que corre rente à parede, ou a luz de teto
 * sob um tubo, faziam o eletroduto que sobe deles cruzá-lo (sobrado 10 × 30: a quente contornando a laje rebaixada).
 */
function tubosDoForro(model: BlueprintModel, levelId: ObjectId): { p: Point; r: number }[] {
  const saida: { p: Point; r: number }[] = [];
  for (const t of model.trechos ?? []) {
    if (t.levelId !== levelId || t.disciplina === 'ELETRICA' || (t.a.x === t.b.x && t.a.y === t.b.y) || Math.min(t.cotaAMm, t.cotaBMm) < TUBO_DO_FORRO_ACIMA_DE_MM) continue;
    const env = envelopeDoTrecho(t);
    const r = Math.max(env.raioPlantaMm, env.raioVerticalMm);
    const L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
    const n = Math.max(1, Math.ceil(L / PASSO_DA_AMOSTRA_DO_TUBO_MM));
    for (let k = 0; k <= n; k++) saida.push({ p: { x: Math.round(t.a.x + ((t.b.x - t.a.x) * k) / n), y: Math.round(t.a.y + ((t.b.y - t.a.y) * k) / n) } as Point, r });
  }
  return saida;
}

/** S1: a luz de teto que cairia sob um tubo do forro anda para o lado (perpendicular a ele, até 40 cm), dentro do cômodo. */
function luzForaDosTubos(at: Point, tubos: readonly { p: Point; r: number }[], space: Space): Point {
  // Meio passo a mais: o tubo corre ENTRE as amostras (andar ao longo dele caía entre duas e "escapava").
  const perto = (q: Point) => tubos.find((t) => Math.hypot(t.p.x - q.x, t.p.y - q.y) < t.r + RAIO_DO_ELETRODUTO_DO_PONTO_MM + FOLGA_DO_PONTO_AO_TUBO_MM + PASSO_DA_AMOSTRA_DO_TUBO_MM / 2);
  if (!perto(at)) return at;
  for (let d = 50; d <= 400; d += 50)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = { x: at.x + dx * d, y: at.y + dy * d } as Point;
      if (!perto(q) && pointInPolygon(space.ring, q) && !space.holes.some((h) => pointInPolygon(h, q))) return q;
    }
  return at;
}

/** O retângulo envolvente do anel, crescido de `mm`. */
function anelCrescido(anel: readonly Point[], mm: number): Point[] {
  const xs = anel.map((p) => p.x);
  const ys = anel.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - mm, Math.max(...xs) + mm, Math.min(...ys) - mm, Math.max(...ys) + mm];
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] as Point[];
}

/** S5: o passo da busca do interruptor fora da laje rebaixada, mm. */
const PASSO_DO_INTERRUPTOR_FORA_DO_REBAIXO_MM = 50;

/**
 * S5 (20/10/2026): o interruptor que cairia na parede SOB uma laje rebaixada vai ao ponto mais perto das paredes do
 * cômodo fora dela (e fora de pilar e de vão) — o eletroduto que desce até ele não tinha saída: o pilar do canto de um
 * lado, a saída da fria pela mesma parede do outro (o interruptor do serviço, sobrado 10 × 30). Nenhum livre: fica.
 */
function interruptorForaDoRebaixo(at: Point, rebaixos: readonly Point[][], space: Space, paredes: BlueprintModel['walls'], openings: BlueprintModel['openings'], pilares: readonly Point[][]): Point {
  const sob = (q: Point) => rebaixos.some((g) => pointInPolygon(g, q));
  if (!sob(at)) return at;
  let melhor: { q: Point; d: number } | null = null;
  for (const lado of ladosDePiso(space, paredes)) {
    const w = lado.wallId ? paredes.find((x) => x.id === lado.wallId) : null;
    if (!w) continue;
    const L = Math.hypot(lado.b.x - lado.a.x, lado.b.y - lado.a.y);
    const Lw = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    for (let d = 150; d <= L - 150; d += PASSO_DO_INTERRUPTOR_FORA_DO_REBAIXO_MM) {
      const q = { x: Math.round(lado.a.x + ((lado.b.x - lado.a.x) * d) / L), y: Math.round(lado.a.y + ((lado.b.y - lado.a.y) * d) / L) } as Point;
      if (sob(q) || pilares.some((g) => pointInPolygon(g, q))) continue;
      const t = ((q.x - w.a.x) * (w.b.x - w.a.x) + (q.y - w.a.y) * (w.b.y - w.a.y)) / Lw;
      if (openings.some((o) => o.wallId === w.id && t > o.offsetMm - 150 && t < o.offsetMm + o.widthMm + 150)) continue;
      const dist = Math.hypot(q.x - at.x, q.y - at.y);
      if (!melhor || dist < melhor.d) melhor = { q, d: dist };
    }
  }
  return melhor?.q ?? at;
}

/** Os comandos que completam um ambiente pela norma — sem potência. */
export function comandosDePontosDoAmbiente(model: BlueprintModel, levelId: ObjectId, space: Space, op: OpcoesDosPontosEletricos): Command[] {
  const paredes = model.walls.filter((w) => w.levelId === space.levelId);
  const terminais = model.terminais ?? [];
  const tipo = etiquetaDoAmbiente(space, model.labels)?.tipoDeAmbiente ?? null;
  const areaM2 = areaRecuada(space.ring, paredes).areaMm2 / 1e6;
  const comandos: Command[] = [];
  const tubos = tubosDoForro(model, space.levelId);
  // Rente à face de uma parede do cômodo (o anel normal do forro corre a ~10 cm dela e não conta: bloqueá-lo deixava o
  // serviço, a cozinha e o lavabo sem tomada).
  const lados = ladosDePiso(space, paredes);
  const rentes = tubos.filter(({ p, r }) =>
    lados.some((l) => {
      const dx = l.b.x - l.a.x;
      const dy = l.b.y - l.a.y;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - l.a.x) * dx + (p.y - l.a.y) * dy) / L2));
      return Math.hypot(p.x - (l.a.x + t * dx), p.y - (l.a.y + t * dy)) < r + RAIO_DO_ELETRODUTO_DO_PONTO_MM + FOLGA_DO_PONTO_AO_TUBO_MM;
    }),
  );
  const conferencia = conferirTomadas(space, tipo, paredes, terminais, areaM2);
  if (conferencia) {
    // O PILAR também ocupa a parede: a tomada não vai no concreto (casa automática F9, 15/10/2026 — a tomada caía
    // dentro do pilar do encontro e o eletroduto descia por ele). O centro dele bloqueia o trecho em volta, como
    // a tomada que já existe.
    const pilares = (model.structures ?? []).filter((x) => x.kind === 'PILAR' && x.levelId === space.levelId).map((x) => x.pontos[0]);
    // S1: e o tubo do forro colado na face da parede (bloqueia o trecho em volta).
    const pontos = distribuirAoLongo(lados, Math.max(conferencia.deficit, conferencia.deficitMedias), model.walls, model.openings, 150, [...(op.ocupados ?? []), ...pilares, ...rentes.map((t) => t.p)]);
    comandos.push(...comandosParaCompletar(levelId, pontos, conferencia));
  }
  // S1: o interruptor também foge do tubo do forro rente à parede (um quadrado em volta de cada amostra, como o pilar).
  const quadrados = rentes.map(({ p, r }) => {
    const h = r + RAIO_DO_ELETRODUTO_DO_PONTO_MM + FOLGA_DO_PONTO_AO_TUBO_MM;
    return [{ x: p.x - h, y: p.y - h }, { x: p.x + h, y: p.y - h }, { x: p.x + h, y: p.y + h }, { x: p.x - h, y: p.y + h }] as Point[];
  });
  const luzes = comandosDeIluminacao(levelId, space, model.walls, model.openings, op.peDireitoMm, conferirIluminacao(space, terminais, areaM2, tipo), terminais, op.areaPorLuminariaM2 ?? null, [...pegadasDePilares(model, space.levelId), ...quadrados]);
  // S1: e a luz de teto sai de baixo do tubo; S5: e o interruptor, de baixo da laje rebaixada.
  const nivel = model.levels.find((l) => l.id === space.levelId);
  const rebaixos = nivel ? (model.structures ?? []).filter((x) => x.kind === 'LAJE' && x.levelId === space.levelId && x.baseMm < nivel.defaultHeightMm - 1).map((x) => pegadaEmPlanta(x) as Point[]) : [];
  comandos.push(
    ...luzes.map((c) => {
      if (c.type === 'AddTerminal' && (c as { tipoEletrico?: string }).tipoEletrico === 'INTERRUPTOR' && rebaixos.length) {
        const pegadas = pegadasDePilares(model, space.levelId).map((g) => anelCrescido(g as Point[], 60));
        return { ...c, at: interruptorForaDoRebaixo((c as { at: Point }).at, rebaixos.map((g) => anelCrescido(g, RAIO_DO_ELETRODUTO_DO_PONTO_MM + FOLGA_DO_PONTO_AO_TUBO_MM)), space, model.walls.filter((w) => w.levelId === space.levelId), model.openings, pegadas) } as Command;
      }
      if (c.type !== 'AddTerminal' || (c as { tipoEletrico?: string }).tipoEletrico !== 'ILUMINACAO_TETO' || !tubos.length) return c;
      return { ...c, at: luzForaDosTubos((c as { at: Point }).at, tubos, space) } as Command;
    }),
  );
  return comandos;
}

/** Todos os ambientes do pavimento, num lote só, já com a potência padrão. */
export function comandosDePontosDoNivel(model: BlueprintModel, levelId: ObjectId, op: OpcoesDosPontosEletricos): Command[] {
  const comandos = model.spaces.filter((s) => s.levelId === levelId).flatMap((s) => comandosDePontosDoAmbiente(model, levelId, s, op));
  return aplicarPotenciaPadrao(model, comandos);
}
