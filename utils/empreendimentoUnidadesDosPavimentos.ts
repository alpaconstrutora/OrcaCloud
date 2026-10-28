// utils/empreendimentoUnidadesDosPavimentos.ts
//
// As unidades que o cadastro de pavimentos descreve ("Gerar a partir dos pavimentos", Torres e Unidades). Era o laço
// de `empreendimentoService.generateUnitsFromFloors`; saiu para cá (28/10/2026) para a tela mostrar a PRÉVIA com a
// mesma conta que grava.
//
// Número inicial (28/10/2026, *"o botão de gerar a partir do pavimento inicia a numeração sequencial a partir de 01.
// implemente opção de escolher iniciar de um número que o usuário decidir"*): a numeração de CADA andar começa no
// número escolhido (5 → 105, 106…; a Torre B do Garden é 05–08). Plano:
// docs/planos/2026-10-28-gerar-unidades-numero-inicial.md. Puro.

import type { EmpreendimentoFloor, EmpreendimentoTower, EmpreendimentoUnitInsert } from '../types/empreendimento';

export const NUMERO_INICIAL_PADRAO = 1;
export const NUMERO_INICIAL_MAX = 99;

/** "5" → 5; vazio → 1 (o de sempre); fora de 0–99 ou não inteiro → null. É o número da unidade NO andar (2 dígitos). */
export function lerNumeroInicial(texto: string): number | null {
  const t = texto.trim();
  if (!t) return NUMERO_INICIAL_PADRAO;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= NUMERO_INICIAL_MAX ? n : null;
}

/** O rótulo do andar no nome da unidade: SS1 (subsolo), TR (térreo), 1, 2… */
function rotuloDoAndar(n: number): string {
  if (n < 0) return `SS${Math.abs(n)}`;
  return n === 0 ? 'TR' : String(n);
}

/**
 * As unidades dos pavimentos, na ordem do cadastro (repetição expandida), com `numeroInicial` como a 1ª de cada andar.
 * Acima de 99 o número só cresce (199, 1100) — não corta.
 */
export function unidadesDosPavimentos(
  tower: Pick<EmpreendimentoTower, 'id' | 'units_per_floor'>,
  floors: readonly EmpreendimentoFloor[],
  numeroInicial: number = NUMERO_INICIAL_PADRAO,
): EmpreendimentoUnitInsert[] {
  const out: EmpreendimentoUnitInsert[] = [];
  for (const fl of floors) {
    const upf = fl.units_per_floor ?? tower.units_per_floor ?? 1;
    for (let rep = 0; rep < fl.repeat_count; rep++) {
      const floorNum = fl.floor_number + rep;
      const pre = fl.prefix ? `${fl.prefix}-` : '';
      for (let u = 0; u < upf; u++) {
        out.push({
          tower_id: tower.id,
          floor_id: fl.id,
          floor_tipo: fl.tipo,
          name: `${pre}${rotuloDoAndar(floorNum)}${String(numeroInicial + u).padStart(2, '0')}`,
          floor: floorNum,
          status: 'DISPONIVEL',
          is_vendavel: true,
          sort_order: out.length,
        });
      }
    }
  }
  return out;
}

export interface FaixaDoAndar {
  andar: number;
  de: string;
  ate: string;
  quantas: number;
}

/** A prévia: a primeira e a última unidade de cada andar, de baixo para cima. */
export function faixasPorAndar(unidades: readonly Pick<EmpreendimentoUnitInsert, 'name' | 'floor'>[]): FaixaDoAndar[] {
  const porAndar = new Map<number, FaixaDoAndar>();
  for (const u of unidades) {
    const andar = u.floor ?? 0;
    const f = porAndar.get(andar);
    if (f) {
      f.ate = u.name;
      f.quantas += 1;
    } else porAndar.set(andar, { andar, de: u.name, ate: u.name, quantas: 1 });
  }
  return [...porAndar.values()].sort((a, b) => a.andar - b.andar);
}
