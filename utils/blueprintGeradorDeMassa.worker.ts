/**
 * Web Worker do gerador de massa (M5): recebe a entrada, a semente e as
 * hipóteses, devolve o resultado. O gerador é puro; aqui só há a ponte de
 * mensagens. Sem Worker (jsdom), o hook roda o mesmo `gerarMassa` no fio
 * principal — ver `hooks/useGeradorDeMassa.ts`.
 */
import { gerarMassa, type EntradaDoGeradorDeMassa, type HipotesesDoGeradorDeMassa, type ResultadoDoGeradorDeMassa } from './blueprintGeradorDeMassa';

export interface PedidoDoGeradorDeMassa {
  entrada: EntradaDoGeradorDeMassa;
  semente: number;
  hipoteses: Partial<HipotesesDoGeradorDeMassa>;
}
export type RespostaDoGeradorDeMassa = { tipo: 'resultado'; resultado: ResultadoDoGeradorDeMassa } | { tipo: 'erro'; mensagem: string };

self.onmessage = (ev: MessageEvent<PedidoDoGeradorDeMassa>) => {
  const { entrada, semente, hipoteses } = ev.data;
  try {
    (self as unknown as Worker).postMessage({ tipo: 'resultado', resultado: gerarMassa(entrada, semente, hipoteses) } satisfies RespostaDoGeradorDeMassa);
  } catch (e) {
    (self as unknown as Worker).postMessage({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) } satisfies RespostaDoGeradorDeMassa);
  }
};
