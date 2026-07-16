// Geometria paramétrica compartilhada entre a planta baixa 2D (SVG) e o modelo 3D.
// Mantém 2D e 3D concordando na distribuição de unidades, cores e núcleo.

// Paleta de cores das unidades (tailwind -200). O 3D usa a mesma sequência.
export const UNIT_COLORS = [
  '#fecaca', // red-200
  '#bbf7d0', // green-200
  '#bfdbfe', // blue-200
  '#fef08a', // yellow-200
  '#e9d5ff', // purple-200
  '#fed7aa', // orange-200
  '#a7f3d0', // emerald-200
  '#fbcfe8', // pink-200
];

export interface UnitCell {
  index: number;   // 0-based, para U-(index+1) e cor
  x: number;       // canto (metros) relativo ao prédio
  y: number;
  width: number;   // metros
  height: number;
  color: string;
}

export interface FloorLayout {
  cols: number;
  rows: number;
  units: UnitCell[];
  core: { x: number; y: number; width: number; height: number };
}

/**
 * Calcula a grade de unidades (cols x rows), a posição/dimensão de cada unidade
 * e o núcleo central (hall/circulação) para uma pegada de prédio.
 *
 * Replica exatamente a lógica que vivia inline em FloorPlanCanvas2D.
 */
export function computeFloorLayout(
  buildingWidth: number,
  buildingDepth: number,
  unitsPerFloor: number
): FloorLayout {
  const w = buildingWidth;
  const h = buildingDepth;

  let cols = 1;
  let rows = 1;

  if (unitsPerFloor > 1) {
    if (w >= h) {
      cols = Math.ceil(unitsPerFloor / 2);
      rows = 2;
    } else {
      rows = Math.ceil(unitsPerFloor / 2);
      cols = 2;
    }
  }

  const unitWidth = w / cols;
  const unitHeight = h / rows;

  const units: UnitCell[] = [];
  let unitIndex = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (unitIndex >= unitsPerFloor) break;
      units.push({
        index: unitIndex,
        x: c * unitWidth,
        y: r * unitHeight,
        width: unitWidth,
        height: unitHeight,
        color: UNIT_COLORS[unitIndex % UNIT_COLORS.length],
      });
      unitIndex++;
    }
  }

  // Núcleo (circulação / elevadores): 20% x 20% centralizado
  const coreWidth = w * 0.2;
  const coreHeight = h * 0.2;
  const core = {
    x: (w - coreWidth) / 2,
    y: (h - coreHeight) / 2,
    width: coreWidth,
    height: coreHeight,
  };

  return { cols, rows, units, core };
}
