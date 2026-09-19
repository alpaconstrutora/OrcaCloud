/**
 * Web Worker do gerador (E6.2): recebe a entrada e as hipóteses, devolve as
 * alternativas uma a uma (para a tela mostrar o progresso) e o "fim". O
 * gerador é puro; aqui só há a ponte de mensagens. Quem não tem Worker (jsdom)
 * usa o mesmo `gerar` no fio principal — ver `hooks/useGerador.ts`.
 */
import { gerar, type EntradaDoGerador, type HipotesesDoGerador, type ResultadoDoGerador } from './blueprintGerador';

export interface PedidoDoGerador {
  entrada: EntradaDoGerador;
  hipoteses: Partial<HipotesesDoGerador>;
  sementes: number[];
}
export type RespostaDoGerador = { tipo: 'resultado'; resultado: ResultadoDoGerador } | { tipo: 'erro'; semente: number; mensagem: string } | { tipo: 'fim' };

self.onmessage = (ev: MessageEvent<PedidoDoGerador>) => {
  const { entrada, hipoteses, sementes } = ev.data;
  for (const s of sementes) {
    try {
      const resultado = gerar(entrada, s, hipoteses);
      (self as unknown as Worker).postMessage({ tipo: 'resultado', resultado } satisfies RespostaDoGerador);
    } catch (e) {
      (self as unknown as Worker).postMessage({ tipo: 'erro', semente: s, mensagem: e instanceof Error ? e.message : String(e) } satisfies RespostaDoGerador);
    }
  }
  (self as unknown as Worker).postMessage({ tipo: 'fim' } satisfies RespostaDoGerador);
};
