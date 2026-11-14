/**
 * Web Worker do PRÉDIO AUTOMÁTICO (PA2, 13/11/2026): recebe o pedido, avisa cada etapa concluída e devolve o plano. O
 * motor é puro; aqui só há a ponte de mensagens. Sem Worker (jsdom), o hook roda o mesmo `planejarPredioDoPedido` no fio
 * principal — ver `hooks/usePredioAutomatico.ts`. Molde: `blueprintCasaAutomatica.worker.ts`.
 */
import { planejarPredioDoPedido, type EtapaDoPredio, type PedidoDoPredio, type PlanoDoPredio } from './blueprintPredioAutomatico';

export type RespostaDoPredio =
  | { tipo: 'etapa'; etapa: EtapaDoPredio; indice: number; total: number }
  | { tipo: 'resultado'; plano: PlanoDoPredio }
  | { tipo: 'erro'; mensagem: string };

const enviar = (r: RespostaDoPredio) => (self as unknown as Worker).postMessage(r);

self.onmessage = (ev: MessageEvent<PedidoDoPredio>) => {
  try {
    const plano = planejarPredioDoPedido(ev.data, { aoConcluirEtapa: (etapa, indice, total) => enviar({ tipo: 'etapa', etapa, indice, total }) });
    enviar({ tipo: 'resultado', plano });
  } catch (e) {
    enviar({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
  }
};
