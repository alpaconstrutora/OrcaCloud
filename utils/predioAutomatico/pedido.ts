/**
 * Prédio automático — o pedido que atravessa o Web Worker, a assinatura da prévia e a trava antes de gravar (PA2 do plano
 * docs/planos/2026-11-12-predio-automatico.md). Molde: `utils/casaAutomatica/pedido.ts`.
 */
import { snapshotHash, stableStringify } from '../blueprintKernel';
import type { BlueprintModel } from '../blueprintKernel';
import type { HipotesesDoPredio, OpcoesDoPlanoDoPredio, PlanoDoPredio } from './hipoteses';
import { motivoParaNaoGerarPredio, planejarPredio, type EntradaDoPredio } from './orquestrador';

/** O que a tela manda ao worker: tudo CLONÁVEL (o desenho, a entrada e as hipóteses — o motor não lê nada de fora). */
export interface PedidoDoPredio {
  original: BlueprintModel;
  entrada: EntradaDoPredio;
  hip: Partial<HipotesesDoPredio>;
}

/** O pedido → o plano. O mesmo no worker e no fio principal (sem `Worker`, nos testes): o motor é determinístico. */
export function planejarPredioDoPedido(pedido: PedidoDoPredio, opcoes: OpcoesDoPlanoDoPredio = {}): PlanoDoPredio {
  return planejarPredio(pedido.original, pedido.entrada, pedido.hip, opcoes);
}

/**
 * A ASSINATURA do pedido: o que o prédio lê FORA do desenho — o produto, a distribuição dele no bloco, o norte e as
 * hipóteses. Prévia gerada com uma assinatura e a tela com outra = prévia VELHA. O desenho fica de fora: quem o confere é
 * `conferirPlanoDoPredio`, pelo hash do desenho de onde a prévia saiu.
 */
export function assinaturaDoPedidoDoPredio(pedido: PedidoDoPredio): string {
  return stableStringify({ entrada: pedido.entrada, hip: pedido.hip });
}

/**
 * Trava antes de gravar: o desenho de AGORA é o de onde a prévia saiu. PA5 (14/11/2026): pelo hash do original, não
 * reaplicando o lote — com a elétrica, o R8 passa de mil comandos, e a reaplicação travava a tela segundos a cada vez que
 * a prévia chegava. O motor é determinístico (o teste do motor reaplica e confere os ids e o hash), e a assinatura do
 * pedido (`assinaturaDoPedidoDoPredio`) cobre o que vem de fora do desenho.
 */
export function conferirPlanoDoPredio(original: BlueprintModel, plano: PlanoDoPredio, entrada: EntradaDoPredio): { ok: true } | { ok: false; motivo: string } {
  if (!plano.comandos.length) return { ok: false, motivo: 'O plano não tem nada a lançar.' };
  const impedimento = motivoParaNaoGerarPredio(original, entrada);
  if (impedimento) return { ok: false, motivo: impedimento };
  if (snapshotHash(original) !== plano.hashDoOriginal) return { ok: false, motivo: 'O desenho mudou desde a prévia — gere de novo.' };
  return { ok: true };
}
