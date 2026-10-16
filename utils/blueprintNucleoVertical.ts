/**
 * NÚCLEO VERTICAL (19/09/2026, E2.4) — o que a tela e os lançamentos
 * automáticos precisam do shaft/elevador e o kernel não guarda.
 *
 * FICHA DO ELEVADOR por capacidade: ordem de grandeza de catálogo residencial
 * a 1,0 m/s (NBR NM 207 / NBR 5665 como referência de cabina; caixa, poço e
 * casa de máquinas variam por fabricante — **confirmar com o fornecedor**).
 * "Aplicar ficha" COPIA os valores para a peça (valor, não vínculo — a mesma
 * decisão do tipo × instância da E1.1): o desenho não muda quando a tabela
 * for revista.
 */
import { envelopeDoTrecho, interiorPoint, pavimentosDoNucleo, type BlueprintModel, type DisciplinaDeRede, type Nucleo, type ObjectId, type Point } from './blueprintKernel';

export interface FichaDoElevador {
  capacidade: number;
  cargaKg: number;
  /** Cabina (largura × profundidade), mm. */
  cabinaMm: [number, number];
  /** Caixa (largura × profundidade), mm — é o contorno sugerido em planta. */
  caixaMm: [number, number];
  pocoMm: number;
  casaDeMaquinasMm: number;
  observacao?: string;
}

export const FICHA_DO_ELEVADOR: readonly FichaDoElevador[] = [
  { capacidade: 4, cargaKg: 320, cabinaMm: [900, 1000], caixaMm: [1500, 1400], pocoMm: 1400, casaDeMaquinasMm: 2200 },
  { capacidade: 6, cargaKg: 450, cabinaMm: [1100, 1400], caixaMm: [1600, 1800], pocoMm: 1400, casaDeMaquinasMm: 2400 },
  { capacidade: 8, cargaKg: 630, cabinaMm: [1100, 1400], caixaMm: [1800, 2100], pocoMm: 1500, casaDeMaquinasMm: 2600, observacao: 'cabina acessível (NBR 9050: 1,10 × 1,40)' },
  { capacidade: 10, cargaKg: 750, cabinaMm: [1350, 1600], caixaMm: [2000, 2300], pocoMm: 1600, casaDeMaquinasMm: 2600 },
  { capacidade: 13, cargaKg: 1000, cabinaMm: [1600, 1800], caixaMm: [2400, 2500], pocoMm: 1700, casaDeMaquinasMm: 2800, observacao: 'cabe maca (NBR 5665)' },
];

export function fichaPorCapacidade(capacidade: number | null | undefined): FichaDoElevador | null {
  return FICHA_DO_ELEVADOR.find((f) => f.capacidade === capacidade) ?? null;
}

/** "Elevador E1 · 8 pass." / "Shaft S2" */
export function rotuloDoNucleo(n: Pick<Nucleo, 'tipo' | 'rotulo' | 'capacidade'>): string {
  const base = n.rotulo?.trim() || (n.tipo === 'ELEVADOR' ? 'Elevador' : 'Shaft');
  return n.tipo === 'ELEVADOR' && n.capacidade ? `${base} · ${n.capacidade} pass.` : base;
}

/** Centro (interior) do contorno, em mm inteiro. */
export function centroDoNucleo(n: Pick<Nucleo, 'ring'>): Point {
  const p = interiorPoint(n.ring, []);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** Caixa envolvente do contorno. */
export function caixaDoNucleo(n: Pick<Nucleo, 'ring'>): { larguraMm: number; profundidadeMm: number } {
  const xs = n.ring.map((p) => p.x);
  const ys = n.ring.map((p) => p.y);
  return { larguraMm: Math.max(...xs) - Math.min(...xs), profundidadeMm: Math.max(...ys) - Math.min(...ys) };
}

/**
 * O SHAFT mais próximo de `ponto`, entre os que atravessam `levelId`, a até
 * `raioMm` — é onde a coluna de água ou o tubo de queda devem subir. `null` =
 * nenhum ao alcance; o lançamento segue na posição do ponto, como antes.
 */
/** F14a da casa automática: no shaft, a FAIXA de cada rede vale 1,5× (o tubo de queda DN 100 não encosta na coluna de água do centro). */
export const FAIXA_NO_SHAFT = 1.5;

export function shaftPreferido(model: BlueprintModel, ponto: Point, levelId: ObjectId, raioMm: number): Point | null {
  let melhor: { centro: Point; d: number } | null = null;
  for (const n of model.nucleos ?? []) {
    if (n.tipo !== 'SHAFT') continue;
    if (!pavimentosDoNucleo(model, n).some((l) => l.id === levelId)) continue;
    const centro = centroDoNucleo(n);
    const d = Math.hypot(centro.x - ponto.x, centro.y - ponto.y);
    if (d <= raioMm && (!melhor || d < melhor.d)) melhor = { centro, d };
  }
  return melhor?.centro ?? null;
}

/**
 * F14c da casa automática: o lugar da prumada de `disciplina` no shaft (centro `centro`) — a faixa dela (× 1,5); se
 * já passa tubo de OUTRA rede ali (em qualquer cota dos pavimentos `levelIds`: a prumada atravessa todos), as outras
 * três posições, girando a faixa de 90°. O barrilete da fria chega ao centro do shaft por cima do telhado e passava
 * justo sobre o tubo de queda e a ventilação (sobrado, 0° e 30°). Nenhuma livre: a de maior folga.
 */
export function lugarNoShaft(model: BlueprintModel, centro: Point, faixa: { x: number; y: number } | null, disciplina: DisciplinaDeRede, raioMm: number, levelIds: readonly ObjectId[]): Point {
  const fx = (faixa?.x ?? 0) * FAIXA_NO_SHAFT;
  const fy = (faixa?.y ?? 0) * FAIXA_NO_SHAFT;
  const posicoes = [{ x: fx, y: fy }, { x: -fy, y: fx }, { x: -fx, y: -fy }, { x: fy, y: -fx }].map((d) => ({ x: Math.round(centro.x + d.x), y: Math.round(centro.y + d.y) }) as Point);
  if (!fx && !fy) return posicoes[0];
  const niveis = new Set(levelIds);
  const outros = (model.trechos ?? []).filter((t) => t.disciplina !== disciplina && niveis.has(t.levelId));
  // A folga da posição: a menor distância livre (entre as paredes dos tubos) a um tubo de outra rede.
  const folga = (q: Point) =>
    Math.min(
      Infinity,
      ...outros.map((t) => {
        const dx = t.b.x - t.a.x;
        const dy = t.b.y - t.a.y;
        const L2 = dx * dx + dy * dy;
        const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - t.a.x) * dx + (q.y - t.a.y) * dy) / L2));
        const env = envelopeDoTrecho(t);
        return Math.hypot(q.x - (t.a.x + u * dx), q.y - (t.a.y + u * dy)) - raioMm - Math.max(env.raioPlantaMm, env.raioVerticalMm);
      }),
    );
  const folgas = posicoes.map(folga);
  const i = folgas.findIndex((f) => f > FOLGA_NO_SHAFT_MM);
  // Nenhuma livre: a de MAIOR folga (o shaft cheio de tubos — a menos ruim).
  return posicoes[i >= 0 ? i : folgas.indexOf(Math.max(...folgas))];
}

/** F14c: a folga entre a prumada e o tubo de outra rede no shaft, além dos dois raios, mm. */
const FOLGA_NO_SHAFT_MM = 20;

/** Os nucleos visíveis num pavimento (atravessam-no). */
export function nucleosDoNivel(model: BlueprintModel, levelId: ObjectId | null): Nucleo[] {
  if (!levelId) return model.nucleos ?? [];
  return (model.nucleos ?? []).filter((n) => pavimentosDoNucleo(model, n).some((l) => l.id === levelId));
}
