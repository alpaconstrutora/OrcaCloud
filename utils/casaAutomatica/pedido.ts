/**
 * Casa automática — parte `pedido` do motor (etapa D2, 11/11/2026: `utils/blueprintCasaAutomatica.ts` dividido sem mudar
 * o que gera; o marco das casas de referência prova). Ver o cabeçalho de `orquestrador.ts`.
 */
import { applyBatch, snapshotHash, stableStringify } from '../blueprintKernel';
import type { BlueprintModel } from '../blueprintKernel';
import { amostradorDaGrade } from '../blueprintTopografia';
import type { GradeDeElevacao } from '../blueprintTopografia';
import type { EntradaDaCasa, HipotesesDaCasa, PlanoDaCasa, OpcoesDoPlanoDaCasa } from './hipoteses';
import { motivoParaNaoGerar } from './escolhaEShaft';
import { planejarCasa } from './orquestrador';

/** Trava antes de gravar: o lote reaplicado no desenho ATUAL cria os mesmos ids e o mesmo modelo da prévia. */
export function conferirPlanoDaCasa(original: BlueprintModel, plano: PlanoDaCasa): { ok: true } | { ok: false; motivo: string } {
  if (!plano.comandos.length) return { ok: false, motivo: 'O plano não tem nada a lançar.' };
  const impedimento = motivoParaNaoGerar(original, plano.levelId);
  if (impedimento) return { ok: false, motivo: impedimento };
  try {
    const r = applyBatch(original, plano.comandos);
    const iguais = r.diff.created.length === plano.criados.length && r.diff.created.every((id, i) => id === plano.criados[i]);
    if (!iguais || snapshotHash(r.model) !== snapshotHash(plano.resultado)) return { ok: false, motivo: 'O desenho mudou desde a prévia — gere de novo.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: `O desenho mudou desde a prévia — gere de novo (${e instanceof Error ? e.message : String(e)}).` };
  }
}

// ─── F10: o pedido que atravessa o Web Worker ───────────────────────────────

/**
 * O que a tela manda ao worker: tudo CLONÁVEL. O leitor do terreno é uma função e não atravessa — vai a GRADE da
 * topografia (e a cota zero), e o leitor é remontado do lado de lá (`amostradorDaGrade`).
 */
export interface PedidoDaCasa {
  original: BlueprintModel;
  entrada: Omit<EntradaDaCasa, 'leitorDoTerreno'>;
  terreno: { grade: GradeDeElevacao; cotaZeroM: number } | null;
  hip: Partial<HipotesesDaCasa>;
}

/** O pedido → o plano. O mesmo no worker e no fio principal (sem `Worker`, nos testes): o motor é determinístico. */
export function planejarCasaDoPedido(pedido: PedidoDaCasa, opcoes: OpcoesDoPlanoDaCasa = {}): PlanoDaCasa {
  const leitorDoTerreno = pedido.terreno ? { cotaEmM: amostradorDaGrade(pedido.terreno.grade), cotaZeroM: pedido.terreno.cotaZeroM } : null;
  return planejarCasa(pedido.original, { ...pedido.entrada, leitorDoTerreno, gradeDoTerreno: pedido.terreno?.grade ?? null }, pedido.hip, opcoes);
}

/**
 * A ASSINATURA do pedido (11/11/2026): tudo o que a casa lê FORA do desenho — programa, hipóteses, zona, premissas das
 * disciplinas, chuva, catálogo de evaporadoras, materiais, topografia. A prévia gerada com uma assinatura e a tela com
 * outra = prévia VELHA: as premissas mudaram depois de gerar, e lançar gravaria a casa das premissas antigas. O desenho
 * (o modelo, o lote, o pavimento) fica de fora: quem o confere é `conferirPlanoDaCasa`, pelo hash do resultado. Chaves
 * em ordem (`stableStringify`): a mesma premissa relida do banco em outra ordem não vira "mudou".
 */
export function assinaturaDoPedidoDaCasa(pedido: PedidoDaCasa): string {
  const { levelId: _nivel, ctx, ...entrada } = pedido.entrada;
  const { terreno: _terreno, limites: _limites, ...zona } = ctx;
  return stableStringify({ entrada, zona, hip: pedido.hip, terreno: pedido.terreno });
}
