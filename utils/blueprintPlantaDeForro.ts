/**
 * PLANTA DE FORRO (20/09/2026, backlog P2 — P2.14): a "reflected ceiling plan".
 *
 * É uma VISTA, não um desenho novo: o pavimento visto de baixo para cima, com
 * o que está no teto — forro declarado por ambiente (E7.2), luminárias de teto,
 * eletrodutos altos, dutos e difusores da mecânica — e sem o que está no chão:
 * mobiliário, tomadas, pontos hidráulicos, escadas, vagas. Paredes e vãos
 * ficam (são o que situa o forro), e o rótulo do ambiente passa a dizer o
 * forro em vez da área: material, rebaixo e pé-direito útil — o mesmo número
 * do quantitativo (P2.8), calculado do mesmo jeito.
 *
 * Tudo aqui é derivação pura sobre o modelo: nada é gravado e nenhum
 * quantitativo muda.
 */
import { acabamentosDoAmbiente, type BlueprintModel, type Level, type Space } from './blueprintKernel';

/** Eletroduto com as duas cotas acima disto é "de teto" e aparece na planta de forro. */
export const COTA_MINIMA_DE_TETO_MM = 1800;

export interface ForroDoAmbiente {
  spaceId: string;
  nome: string;
  /** Descrição da camada de acabamento do forro (a mais baixa), ou null = sem forro declarado. */
  material: string | null;
  rebaixoMm: number | null;
  /** Pé-direito do pavimento menos o rebaixo (P2.8). */
  peDireitoUtilMm: number;
  /** Linhas do rótulo no lugar de nome/área/perímetro. */
  linhas: string[];
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

/** O forro de cada ambiente do pavimento, como o rótulo da planta de forro escreve. */
export function forrosDoNivel(model: BlueprintModel, level: Level): ForroDoAmbiente[] {
  return model.spaces
    .filter((s) => s.levelId === level.id && s.ring.length >= 3)
    .map((s) => forroDoAmbiente(model, level, s));
}

export function forroDoAmbiente(model: BlueprintModel, level: Level, s: Space): ForroDoAmbiente {
  const acab = acabamentosDoAmbiente(model, s);
  const forro = acab?.forro ?? null;
  // A camada de acabamento é a ÚLTIMA (de cima para baixo) — a que se vê.
  const camada = forro?.camadas[forro.camadas.length - 1] ?? null;
  const material = camada ? camada.descricao || camada.itemCode || 'forro' : null;
  const rebaixoMm = forro ? forro.rebaixoMm : null;
  const peDireitoUtilMm = Math.max(0, level.defaultHeightMm - (rebaixoMm ?? 0));
  const nome = s.name?.trim() || 'Ambiente';
  const linhas = forro
    ? [nome, `Forro: ${material}`, `${rebaixoMm === 0 ? 'colado à laje' : `rebaixo ${m(rebaixoMm!)} m`} · PD ${m(peDireitoUtilMm)} m`]
    : [nome, 'Laje aparente (sem forro declarado)', `PD ${m(peDireitoUtilMm)} m`];
  return { spaceId: s.id, nome, material, rebaixoMm, peDireitoUtilMm, linhas };
}

/**
 * O que a planta de forro ESCONDE no pavimento: o que está no chão ou na
 * parede baixa. Paredes, vãos, estrutura, núcleos e divisas ficam.
 */
export function idsOcultosNaPlantaDeForro(model: BlueprintModel, level: Level): Set<string> {
  const ocultos = new Set<string>();
  const doNivel = <T extends { levelId: string }>(xs: readonly T[] | undefined) => (xs ?? []).filter((x) => x.levelId === level.id);
  for (const t of doNivel(model.terminais)) {
    const noTeto =
      (t.disciplina === 'ELETRICA' && (t.tipoEletrico === 'ILUMINACAO_TETO' || t.tipoEletrico === 'INTERRUPTOR')) ||
      t.disciplina === 'MECANICA';
    if (!noTeto) ocultos.add(t.id);
  }
  for (const t of doNivel(model.trechos)) {
    const noTeto = t.disciplina === 'MECANICA' || (t.disciplina === 'ELETRICA' && t.cotaAMm >= COTA_MINIMA_DE_TETO_MM && t.cotaBMm >= COTA_MINIMA_DE_TETO_MM);
    if (!noTeto) ocultos.add(t.id);
  }
  for (const q of doNivel(model.quadros)) ocultos.add(q.id);
  for (const c of doNivel(model.componentes)) if (c.familia !== 'CLIMATIZACAO') ocultos.add(c.id);
  for (const e of doNivel(model.stairs)) ocultos.add(e.id);
  for (const v of doNivel(model.vagas)) ocultos.add(v.id);
  for (const g of doNivel(model.guardaCorpos)) ocultos.add(g.id);
  for (const c of model.sections ?? []) ocultos.add(c.id);
  return ocultos;
}

export interface ResumoDoForro {
  ambientes: number;
  comForro: number;
  luminarias: number;
  difusores: number;
}

/** Os números da faixa da vista. */
export function resumoDaPlantaDeForro(model: BlueprintModel, level: Level): ResumoDoForro {
  const forros = forrosDoNivel(model, level);
  const terminais = (model.terminais ?? []).filter((t) => t.levelId === level.id);
  return {
    ambientes: forros.length,
    comForro: forros.filter((f) => f.material !== null).length,
    luminarias: terminais.filter((t) => t.disciplina === 'ELETRICA' && t.tipoEletrico === 'ILUMINACAO_TETO').length,
    difusores: terminais.filter((t) => t.disciplina === 'MECANICA').length,
  };
}
