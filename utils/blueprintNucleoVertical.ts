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
import { interiorPoint, pavimentosDoNucleo, type BlueprintModel, type Nucleo, type ObjectId, type Point } from './blueprintKernel';

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

/** Os nucleos visíveis num pavimento (atravessam-no). */
export function nucleosDoNivel(model: BlueprintModel, levelId: ObjectId | null): Nucleo[] {
  if (!levelId) return model.nucleos ?? [];
  return (model.nucleos ?? []).filter((n) => pavimentosDoNucleo(model, n).some((l) => l.id === levelId));
}
