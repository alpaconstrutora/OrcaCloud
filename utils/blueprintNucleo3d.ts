// utils/blueprintNucleo3d.ts
//
// NÚCLEO VERTICAL NO 3D (20/09/2026, backlog P2 — P2.6): o que se desenha por
// núcleo, em números — o viewer só constrói geometria a partir daqui. Puro,
// para o teste conferir alturas e cotas sem WebGL.
//
// SHAFT: um prisma translúcido do piso de partida ao teto do último pavimento,
// na cor da disciplina (verde-azulado se mecânico, cinza se geral).
// ELEVADOR: a caixa translúcida (mesma altura), o POÇO abaixo do piso de
// partida, a CASA DE MÁQUINAS acima do último teto (medidas da ficha, E2.4) e
// a CABINE opaca de 2,20 m no pavimento de partida, recuada 100 mm das paredes
// da caixa. Tudo translúcido menos a cabine: é vazio de projeto, não massa.

import type { BlueprintModel, Nucleo, Point } from './blueprintKernel';
import { pavimentosDoNucleo } from './blueprintKernel';

export interface PrismaDoNucleo {
  nucleoId: string;
  /** `caixa` | `poco` | `casa-de-maquinas` | `shaft` | `cabine` */
  parte: 'caixa' | 'poco' | 'casa-de-maquinas' | 'shaft' | 'cabine';
  /** Contorno em planta (mm). Na cabine, o retângulo recuado. */
  anel: Point[];
  /** Cota da base (mm, absoluta) e altura (mm). */
  baseMm: number;
  alturaMm: number;
  cor: string;
  opacidade: number;
  arestas: string;
}

export const ALTURA_DA_CABINE_MM = 2200;
export const RECUO_DA_CABINE_MM = 100;

export function prismasDoNucleo(model: BlueprintModel, n: Nucleo): PrismaDoNucleo[] {
  if (n.ring.length < 3) return [];
  const pavimentos = pavimentosDoNucleo(model, n);
  if (pavimentos.length === 0) return [];
  const base = pavimentos[0].elevationMm;
  const ultimo = pavimentos[pavimentos.length - 1];
  const topo = ultimo.elevationMm + ultimo.defaultHeightMm;
  const out: PrismaDoNucleo[] = [];
  const prisma = (parte: PrismaDoNucleo['parte'], baseMm: number, alturaMm: number, cor: string, opacidade: number, arestas: string) => {
    if (alturaMm > 0) out.push({ nucleoId: n.id, parte, anel: n.ring.map((p) => ({ x: p.x, y: p.y })), baseMm, alturaMm, cor, opacidade, arestas });
  };
  if (n.tipo === 'ELEVADOR') {
    prisma('caixa', base, topo - base, '#94a3b8', 0.18, '#475569');
    if ((n.pocoMm ?? 0) > 0) prisma('poco', base - n.pocoMm!, n.pocoMm!, '#475569', 0.35, '#1e293b');
    if ((n.casaDeMaquinasMm ?? 0) > 0) prisma('casa-de-maquinas', topo, n.casaDeMaquinasMm!, '#64748b', 0.35, '#334155');
    const xs = n.ring.map((p) => p.x);
    const ys = n.ring.map((p) => p.y);
    const x0 = Math.min(...xs) + RECUO_DA_CABINE_MM;
    const x1 = Math.max(...xs) - RECUO_DA_CABINE_MM;
    const y0 = Math.min(...ys) + RECUO_DA_CABINE_MM;
    const y1 = Math.max(...ys) - RECUO_DA_CABINE_MM;
    if (x1 - x0 > 200 && y1 - y0 > 200) {
      out.push({ nucleoId: n.id, parte: 'cabine', anel: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], baseMm: base, alturaMm: ALTURA_DA_CABINE_MM, cor: '#cbd5e1', opacidade: 1, arestas: '#64748b' });
    }
  } else {
    const mecanico = n.disciplina === 'MECANICA';
    prisma('shaft', base, topo - base, mecanico ? '#0d9488' : '#94a3b8', 0.16, mecanico ? '#0f766e' : '#475569');
  }
  return out;
}
