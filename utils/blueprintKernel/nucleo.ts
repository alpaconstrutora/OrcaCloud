/**
 * NÚCLEO VERTICAL (19/09/2026, E2.4): o que se deriva de um shaft/elevador.
 *
 * `furosDoNucleo` é o irmão de `furosDaEscada`: a laje cuja cota está entre o
 * piso de partida (exclusive) e o de chegada (inclusive) perde a área comum
 * com o contorno. A laje de piso da partida fica inteira — o núcleo apoia
 * nela ou nasce dela (o poço do elevador é abaixo, fora do desconto: é
 * escavação, não laje).
 */
import { polygonArea, type Point } from './geom';
import { pavimentosDoNucleo, type BlueprintModel, type Nucleo, type ObjectId } from './model';
import { contornoEmPlanta } from './model';
import { recorteComum } from './sobreposicao';

export interface FuroDoNucleo {
  nucleoId: ObjectId;
  structuralId: ObjectId;
  areaMm2: number;
  contorno: Point[];
}

export function furosDoNucleo(model: BlueprintModel): FuroDoNucleo[] {
  const lajes = (model.structures ?? []).filter((s) => s.kind === 'LAJE');
  if (lajes.length === 0) return [];
  const cotaDoNivel = (levelId: ObjectId): number | null => model.levels.find((l) => l.id === levelId)?.elevationMm ?? null;
  const saida: FuroDoNucleo[] = [];
  for (const n of model.nucleos ?? []) {
    const pavimentos = pavimentosDoNucleo(model, n);
    if (pavimentos.length === 0) continue;
    const partida = pavimentos[0].elevationMm;
    const topoDoUltimo = pavimentos[pavimentos.length - 1];
    // Até o TETO do último pavimento: o núcleo atravessa a laje de cobertura
    // dele também (o elevador sobe à casa de máquinas; o shaft ventila).
    const chegada = topoDoUltimo.elevationMm + topoDoUltimo.defaultHeightMm;
    for (const laje of lajes) {
      const base = cotaDoNivel(laje.levelId);
      if (base === null) continue;
      const cotaDaLaje = base + laje.baseMm;
      if (cotaDaLaje <= partida || cotaDaLaje > chegada) continue;
      const contorno = recorteComum(n.ring, contornoEmPlanta(laje));
      if (contorno.length < 3) continue;
      const areaMm2 = Math.round(Math.abs(polygonArea(contorno)));
      if (areaMm2 <= 0) continue;
      saida.push({ nucleoId: n.id, structuralId: laje.id, areaMm2, contorno });
    }
  }
  return saida;
}

export interface MedidaDoNucleo {
  areaMm2: number;
  /** Pavimentos atravessados, da partida à chegada. */
  pavimentos: number;
  /** Do piso de partida ao teto do último pavimento, mm. */
  alturaMm: number;
  /** Elevador: poço + altura + casa de máquinas. Shaft: = altura. */
  alturaTotalMm: number;
  lajesFuradas: number;
}

export function medirNucleo(model: BlueprintModel, n: Nucleo): MedidaDoNucleo {
  const pavimentos = pavimentosDoNucleo(model, n);
  const partida = pavimentos[0]?.elevationMm ?? 0;
  const ultimo = pavimentos[pavimentos.length - 1];
  const alturaMm = ultimo ? ultimo.elevationMm + ultimo.defaultHeightMm - partida : 0;
  const extra = n.tipo === 'ELEVADOR' ? (n.pocoMm ?? 0) + (n.casaDeMaquinasMm ?? 0) : 0;
  return {
    areaMm2: Math.round(Math.abs(polygonArea(n.ring))),
    pavimentos: pavimentos.length,
    alturaMm,
    alturaTotalMm: alturaMm + extra,
    lajesFuradas: furosDoNucleo(model).filter((f) => f.nucleoId === n.id).length,
  };
}
