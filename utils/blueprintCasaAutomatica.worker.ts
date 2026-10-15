/**
 * Web Worker da CASA AUTOMÁTICA (F10, 15/10/2026): recebe o pedido (o desenho, a entrada sem o leitor do terreno,
 * a grade da topografia e as hipóteses), avisa cada etapa concluída e devolve o plano. O motor é puro; aqui só há a
 * ponte de mensagens. Sem Worker (jsdom), o hook roda o mesmo `planejarCasaDoPedido` no fio principal — ver
 * `hooks/useCasaAutomatica.ts`.
 */
import { planejarCasaDoPedido, type EtapaDaCasa, type PedidoDaCasa, type PlanoDaCasa } from './blueprintCasaAutomatica';

export type RespostaDaCasa =
  | { tipo: 'etapa'; etapa: EtapaDaCasa; indice: number; total: number }
  | { tipo: 'resultado'; plano: PlanoDaCasa }
  | { tipo: 'erro'; mensagem: string };

const enviar = (r: RespostaDaCasa) => (self as unknown as Worker).postMessage(r);

self.onmessage = (ev: MessageEvent<PedidoDaCasa>) => {
  try {
    const plano = planejarCasaDoPedido(ev.data, { aoConcluirEtapa: (etapa, indice, total) => enviar({ tipo: 'etapa', etapa, indice, total }) });
    enviar({ tipo: 'resultado', plano });
  } catch (e) {
    enviar({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
  }
};
