/**
 * VISTAS DE PLANTA além da planta baixa — situação, implantação e cobertura
 * (18/09/2026, roadmap E0.3: *"Planta de situação · implantação · cobertura —
 * P0/P1"*).
 *
 * ─── SÃO A MESMA PLANTA COM OUTRO RECORTE ───────────────────────────────────
 *
 * Nenhuma delas é geometria nova: é o mesmo canvas da planta baixa com (a) um
 * PAVIMENTO escolhido pela vista e não pelo usuário, (b) famílias escondidas e
 * (c) as anotações desligadas ou ligadas conforme a convenção da prancha. Por
 * isso este módulo só devolve DECISÕES — que nível, que ids esconder, que
 * botões forçar — e o editor as aplica por cima do estado que a pessoa tem.
 *
 * - **Situação**: o lote no entorno. Térreo, só o CONTORNO da edificação
 *   (paredes externas, sem esquadria), divisas e curvas; sem cota, sem
 *   envelope, sem rótulo. É a planta que o município lê primeiro.
 * - **Implantação**: a edificação no lote. Térreo, contorno + telhado + divisas,
 *   COM o envelope dos recuos e a cadeia de cotas — é onde se confere o recuo.
 * - **Cobertura**: vista de cima. O pavimento mais alto que tem telhado (senão
 *   o mais alto), águas + contorno externo, com cotas; sem interiores.
 *
 * ⚠️ Os ids escondidos são os do PAVIMENTO da vista. Parede "interna" é a que
 * não está sobre nenhuma aresta do contorno externo (`contornoExternoDoNivel`,
 * que devolve o anel pelo eixo) — ver `paredesExternasDoNivel`.
 */
import { contornoExternoDoNivel, type BlueprintModel, type Level, type Point, type Wall } from './blueprintKernel';
import { idsOcultosNaPlantaDeForro } from './blueprintPlantaDeForro';

export const VISTAS_DE_PLANTA = ['situacao', 'implantacao', 'cobertura', 'forro', 'departamentos'] as const;
export type VistaDePlanta = (typeof VISTAS_DE_PLANTA)[number];

export const ehVistaDePlanta = (v: string): v is VistaDePlanta => (VISTAS_DE_PLANTA as readonly string[]).includes(v);

export interface AjusteDaVista {
  rotulo: string;
  /** Uma frase para a faixa de aviso da vista — o que ela mostra e o que esconde. */
  descricao: string;
  /** `ATUAL` (planta de forro, P2.14): o pavimento que o usuário está editando. */
  nivel: 'MAIS_BAIXO' | 'MAIS_ALTO_COM_TELHADO' | 'ATUAL';
  mostrarCotas: boolean;
  mostrarEnvelope: boolean;
  /** Esconde também as paredes internas (fica o contorno). */
  soContorno: boolean;
}

export const AJUSTE_DA_VISTA: Record<VistaDePlanta, AjusteDaVista> = {
  situacao: {
    rotulo: 'Situação',
    descricao: 'Lote, divisas, curvas de nível e o contorno da edificação no térreo — sem interiores, cotas ou instalações.',
    nivel: 'MAIS_BAIXO',
    mostrarCotas: false,
    mostrarEnvelope: false,
    soContorno: true,
  },
  implantacao: {
    rotulo: 'Implantação',
    descricao: 'Edificação no lote, com o envelope dos recuos, o telhado e as cotas — sem interiores nem instalações.',
    nivel: 'MAIS_BAIXO',
    mostrarCotas: true,
    mostrarEnvelope: true,
    soContorno: true,
  },
  cobertura: {
    rotulo: 'Cobertura',
    descricao: 'Vista de cima: águas do telhado e o contorno do pavimento mais alto, com cotas — sem interiores nem instalações.',
    nivel: 'MAIS_ALTO_COM_TELHADO',
    mostrarCotas: true,
    mostrarEnvelope: false,
    soContorno: true,
  },
  // PLANTA DE FORRO (P2.14): o pavimento atual visto de baixo — forro por ambiente, luminárias de teto, dutos e difusores; sem o que está no chão.
  forro: {
    rotulo: 'Planta de forro',
    descricao: 'O pavimento visto de baixo: forro declarado por ambiente (material, rebaixo, pé-direito útil), luminárias de teto, eletrodutos altos, dutos e difusores — sem mobiliário, tomadas, hidráulica, escadas e vagas.',
    nivel: 'ATUAL',
    mostrarCotas: false,
    mostrarEnvelope: false,
    soContorno: false,
  },
  // PLANTA DE DEPARTAMENTOS (P2.22): o pavimento atual com cada ambiente pintado pelo setor e a legenda; sem instalações nem estrutura.
  departamentos: {
    rotulo: 'Departamentos',
    descricao: 'Setorização do pavimento: cada ambiente pintado pela cor do departamento (social, íntimo, serviço, circulação…), com a legenda e o quadro de áreas por setor — sem instalações nem estrutura.',
    nivel: 'ATUAL',
    mostrarCotas: false,
    mostrarEnvelope: false,
    soContorno: false,
  },
};

/** O pavimento que a vista mostra. `null` só num modelo sem pavimento. */
export function nivelDaVista(model: BlueprintModel, vista: VistaDePlanta): Level | null {
  if (model.levels.length === 0) return null;
  // `ATUAL`: quem sabe o pavimento é o editor; aqui não há "o" pavimento.
  if (AJUSTE_DA_VISTA[vista].nivel === 'ATUAL') return null;
  const porCota = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  if (AJUSTE_DA_VISTA[vista].nivel === 'MAIS_BAIXO') return porCota[0];
  const comTelhado = new Set((model.roofs ?? []).map((r) => r.levelId));
  const maisAltoComTelhado = [...porCota].reverse().find((l) => comTelhado.has(l.id));
  return maisAltoComTelhado ?? porCota[porCota.length - 1];
}

const TOL_MM = 1;

/** `p` está sobre o segmento `a→b` (colinear e dentro), com 1 mm de folga. */
function sobreOSegmento(p: Point, a: Point, b: Point): boolean {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const comp = Math.hypot(vx, vy);
  if (comp === 0) return Math.hypot(p.x - a.x, p.y - a.y) <= TOL_MM;
  const cruz = Math.abs((p.x - a.x) * vy - (p.y - a.y) * vx) / comp;
  if (cruz > TOL_MM) return false;
  const ao = ((p.x - a.x) * vx + (p.y - a.y) * vy) / comp;
  return ao >= -TOL_MM && ao <= comp + TOL_MM;
}

/**
 * As paredes do nível que estão sobre o contorno externo — as que a situação
 * mantém. O anel tem vértice em toda junção (inclusive onde uma parede interna
 * encosta por fora), então uma parede externa pode cobrir DUAS arestas
 * colineares do anel: o teste é o PONTO MÉDIO sobre uma aresta paralela, não as
 * duas pontas na mesma aresta.
 */
export function paredesExternasDoNivel(model: BlueprintModel, level: Level): Set<string> {
  const aneis = contornoExternoDoNivel(model, level);
  const externas = new Set<string>();
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  const naAresta = (w: Wall) => {
    const meio = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const wx = w.b.x - w.a.x;
    const wy = w.b.y - w.a.y;
    const wc = Math.hypot(wx, wy) || 1;
    return aneis.some((anel) =>
      anel.some((a, i) => {
        const b = anel[(i + 1) % anel.length];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const ec = Math.hypot(ex, ey) || 1;
        const paralela = Math.abs((wx * ey - wy * ex) / (wc * ec)) < 1e-6;
        return paralela && sobreOSegmento(meio, a, b);
      }),
    );
  };
  for (const w of paredes) if (naAresta(w)) externas.add(w.id);
  return externas;
}

/**
 * Tudo que a vista ESCONDE no pavimento dela: instalações, estrutura, escadas,
 * cortes, esquadrias e — quando `soContorno` — as paredes internas. Divisas,
 * telhado e curvas ficam. Um conjunto de ids, para somar ao "olho" do usuário.
 */
export function idsOcultosNaVista(model: BlueprintModel, vista: VistaDePlanta, level: Level | null): Set<string> {
  const ocultos = new Set<string>();
  if (!level) return ocultos;
  // PLANTA DE FORRO (P2.14): regra própria — fica o que está no teto.
  if (vista === 'forro') return idsOcultosNaPlantaDeForro(model, level);
  // PLANTA DE DEPARTAMENTOS (P2.22): ficam paredes, esquadrias, escadas e mobiliário; saem instalações e estrutura.
  if (vista === 'departamentos') {
    for (const fam of [model.trechos, model.terminais, model.quadros, model.structures] as const) for (const x of fam ?? []) if (x.levelId === level.id) ocultos.add(x.id);
    return ocultos;
  }
  const doNivel = <T extends { id: string; levelId: string }>(xs: readonly T[] | undefined) =>
    (xs ?? []).filter((x) => x.levelId === level.id).forEach((x) => ocultos.add(x.id));
  doNivel(model.trechos);
  doNivel(model.terminais);
  doNivel(model.quadros);
  doNivel(model.structures);
  doNivel(model.stairs);
  for (const c of model.sections ?? []) ocultos.add(c.id);
  const paredesDoNivel = model.walls.filter((w) => w.levelId === level.id);
  const idsDeParede = new Set(paredesDoNivel.map((w) => w.id));
  for (const o of model.openings) if (idsDeParede.has(o.wallId)) ocultos.add(o.id);
  if (AJUSTE_DA_VISTA[vista].soContorno) {
    const externas = paredesExternasDoNivel(model, level);
    for (const w of paredesDoNivel) if (!externas.has(w.id)) ocultos.add(w.id);
  }
  return ocultos;
}
