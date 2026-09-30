/**
 * AS FASES DE UM CIRCUITO no quadro trifásico (E6.1, 29/09/2026).
 *
 * O modelo guarda UMA fase por circuito (`Circuito.fase`: R, S ou T). Até a
 * E6.1 ela só valia em F-N; o F-F ficava fora do balanceamento. Sem mudar o
 * modelo (sem bump), o F-F passa a ler a fase gravada como a PRIMEIRA do par,
 * no sentido R → S → T → R:
 *
 *   F-N  fase R → R          F-F  fase R → R-S
 *        fase S → S               fase S → S-T
 *        fase T → T               fase T → T-R
 *   F-F-F (qualquer)  → R, S e T, um terço em cada
 *
 * Qualquer par de duas fases é um desses três — então todo F-F cabe na
 * convenção. Este módulo é a ÚNICA leitura disso: o dimensionamento (carga
 * por fase, desequilíbrio), o balanceamento, a tabela, o quadro de cargas e o
 * unifilar passam por aqui.
 */
import { FASES_DO_CIRCUITO, type FaseDoCircuito, type LigacaoDoCircuito } from './blueprintKernel';

export interface CargaPorFase {
  R: number;
  S: number;
  T: number;
}

/** A fase seguinte no sentido R → S → T → R — o par do F-F é (fase, seguinte). */
const SEGUINTE: Record<FaseDoCircuito, FaseDoCircuito> = { R: 'S', S: 'T', T: 'R' };

/** As fases que o circuito ocupa; `[]` = F-N ou F-F sem fase declarada. */
export function fasesOcupadas(ligacao: LigacaoDoCircuito | null | undefined, fase: FaseDoCircuito | null | undefined): FaseDoCircuito[] {
  const lig = ligacao ?? 'FN';
  if (lig === 'FFF') return [...FASES_DO_CIRCUITO];
  if (!fase) return [];
  return lig === 'FF' ? [fase, SEGUINTE[fase]] : [fase];
}

/** "R" / "R-S" / "RST" — `null` quando o circuito não tem fase a mostrar. */
export function rotuloDaFase(ligacao: LigacaoDoCircuito | null | undefined, fase: FaseDoCircuito | null | undefined): string | null {
  const f = fasesOcupadas(ligacao, fase);
  if (f.length === 3) return 'RST';
  return f.length ? f.join('-') : null;
}

/** As opções do select de fase: F-N escolhe uma fase, F-F um par (gravado pela primeira). */
export function opcoesDeFase(ligacao: LigacaoDoCircuito | null | undefined): { valor: FaseDoCircuito; rotulo: string }[] {
  const lig = ligacao ?? 'FN';
  if (lig === 'FFF') return [];
  return FASES_DO_CIRCUITO.map((f) => ({ valor: f, rotulo: rotuloDaFase(lig, f) as string }));
}

export interface ItemDeFase {
  nome: string;
  ligacao: LigacaoDoCircuito | null | undefined;
  fase: FaseDoCircuito | null | undefined;
  sVA: number;
}

/**
 * A carga por fase: F-N inteira na sua fase, F-F metade em cada fase do par,
 * F-F-F um terço em cada. `semFase` = quem ficou de fora (F-N e F-F sem fase).
 */
export function somarPorFase(itens: readonly ItemDeFase[]): { fases: CargaPorFase; semFase: string[] } {
  const fases: CargaPorFase = { R: 0, S: 0, T: 0 };
  const semFase: string[] = [];
  for (const it of itens) {
    const ocupadas = fasesOcupadas(it.ligacao, it.fase);
    if (ocupadas.length === 0) {
      semFase.push((it.ligacao ?? 'FN') === 'FF' ? `${it.nome} (F-F)` : it.nome);
      continue;
    }
    for (const f of ocupadas) fases[f] += it.sVA / ocupadas.length;
  }
  return { fases, semFase };
}

/** (maior − menor) / maior, em %; `null` sem carga. A mesma conta do aviso do quadro. */
export function desequilibrioDasFases(fases: CargaPorFase): number | null {
  const valores = [fases.R, fases.S, fases.T];
  const max = Math.max(...valores);
  return max > 0 ? ((max - Math.min(...valores)) / max) * 100 : null;
}
