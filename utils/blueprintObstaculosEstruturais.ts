/**
 * E5.5 — O TRAÇADO AUTOMÁTICO DESVIA DA ESTRUTURA (29/09/2026, roadmap
 * hidrossanitário).
 *
 * O que o traçado da água (pelas paredes) passa a respeitar:
 *  - PILAR: aresta do grafo que entra na pegada de um pilar custa como 10 m de
 *    tubo a mais — a rota contorna por outras paredes quando o desvio é menor
 *    que isso e só atravessa quando não há outro caminho (os pilares costumam
 *    estar NOS encontros das paredes: proibir tornaria quase todo canto
 *    inútil). Multiplicar o comprimento não serviria: 10× de um pilar de 20 cm
 *    são 1,8 m, e o desvio de verdade é de metros. A COLUNA de água que cairia
 *    dentro de um pilar escorrega pela parede até logo fora dele.
 *  - VIGA: o barrilete desce para 10 cm abaixo do fundo da viga mais baixa do
 *    teto do pavimento, em vez de correr dentro dela.
 *
 * O que continua como verificação (marca no desenho e item da conferência): o
 * tubo que atravessa um pilar (o desvio do esgoto é backlog) e o que cruza uma
 * viga (furo em viga é decisão do projeto estrutural).
 */
import type { BlueprintModel, ObjectId, Point, Wall } from './blueprintKernel';
import { pegadaEmPlanta, pointInPolygon } from './blueprintKernel';

type P2 = { x: number; y: number };

/** O que custa, em mm de tubo, a aresta que entra num pilar. */
export const PENALIDADE_DO_PILAR_MM = 10_000;
/** Folga entre a face do pilar e o tubo que escorregou para fora dele. */
export const FOLGA_DO_PILAR_MM = 50;
/** Quanto o barrilete fica abaixo do fundo da viga mais baixa. */
export const ABAIXO_DA_VIGA_MM = 100;
/** A viga "de teto": o topo dela a menos disto do teto do pavimento. */
const VIGA_DE_TETO_MM = 200;

/** As pegadas em planta dos pilares do pavimento. */
export function pegadasDePilares(model: BlueprintModel, levelId: ObjectId): Point[][] {
  return (model.structures ?? []).filter((s) => s.kind === 'PILAR' && s.levelId === levelId).map((s) => pegadaEmPlanta(s));
}

const dentroDeAlguma = (pegadas: readonly Point[][], p: P2) => pegadas.some((g) => pointInPolygon(g, p as Point));

/** A fração (0–1) do segmento que corre DENTRO de alguma pegada (amostragem a cada ~50 mm). */
export function fracaoDentro(a: P2, b: P2, pegadas: readonly Point[][]): number {
  if (pegadas.length === 0) return 0;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.ceil(L / 50));
  let dentro = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (dentroDeAlguma(pegadas, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) dentro++;
  }
  return dentro / n;
}

/** O custo de uma aresta: o comprimento, mais `PENALIDADE_DO_PILAR_MM` se ela entra num pilar. */
export function custoComPilares(a: P2, b: P2, pegadas: readonly Point[][]): number {
  return Math.hypot(b.x - a.x, b.y - a.y) + (fracaoDentro(a, b, pegadas) > 0 ? PENALIDADE_DO_PILAR_MM : 0);
}

/**
 * O ponto `p` (sobre o eixo da parede `w`) fora de qualquer pilar: se cair
 * dentro de um, escorrega pelo eixo — para o lado mais perto — até
 * `FOLGA_DO_PILAR_MM` além da face. Sem saída dentro da parede, fica onde está.
 */
export function foraDoPilar(p: P2, w: Pick<Wall, 'a' | 'b'>, pegadas: readonly Point[][]): P2 {
  if (!dentroDeAlguma(pegadas, p)) return p;
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (L === 0) return p;
  const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  const t0 = (p.x - w.a.x) * u.x + (p.y - w.a.y) * u.y;
  const em = (s: number) => ({ x: Math.round(w.a.x + u.x * s), y: Math.round(w.a.y + u.y * s) });
  for (let d = 1; d <= L; d++) {
    for (const s of [t0 - d, t0 + d]) {
      if (s < 0 || s > L || dentroDeAlguma(pegadas, em(s))) continue;
      const comFolga = Math.max(0, Math.min(L, s + (s < t0 ? -FOLGA_DO_PILAR_MM : FOLGA_DO_PILAR_MM)));
      return dentroDeAlguma(pegadas, em(comFolga)) ? em(s) : em(comFolga);
    }
  }
  return p;
}

/**
 * O fundo da viga de teto mais baixa do pavimento (cota relativa ao piso), ou
 * `null` sem viga de teto. Viga de teto: o topo dela chega a menos de 20 cm do
 * teto — a verga baixa no meio da parede não conta.
 */
export function fundoDaVigaMaisBaixaMm(model: BlueprintModel, levelId: ObjectId, tetoMm: number): number | null {
  const vigas = (model.structures ?? []).filter((s) => s.kind === 'VIGA' && s.levelId === levelId && s.baseMm + s.alturaMm >= tetoMm - VIGA_DE_TETO_MM && s.baseMm < tetoMm);
  return vigas.length === 0 ? null : Math.min(...vigas.map((v) => v.baseMm));
}
