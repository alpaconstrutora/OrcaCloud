import { useCallback, useEffect, useRef, useState } from 'react';
import { gerarMassa, type EntradaDoGeradorDeMassa, type HipotesesDoGeradorDeMassa, type ResultadoDoGeradorDeMassa } from '../utils/blueprintGeradorDeMassa';
import type { PedidoDoGeradorDeMassa, RespostaDoGeradorDeMassa } from '../utils/blueprintGeradorDeMassa.worker';

/**
 * Roda o gerador de massa (M5) num Web Worker — a varredura mede centenas de
 * cenários e a tela continua respondendo. Sem `Worker` (testes em jsdom,
 * navegador antigo), roda no fio principal numa volta do event loop, com o
 * MESMO `gerarMassa`: o resultado é idêntico (o gerador é determinístico).
 */
export interface EstadoDoGeradorDeMassa {
  rodando: boolean;
  resultado: ResultadoDoGeradorDeMassa | null;
  erro: string | null;
  gerar: (entrada: EntradaDoGeradorDeMassa, semente: number, hipoteses: Partial<HipotesesDoGeradorDeMassa>) => void;
  cancelar: () => void;
  limpar: () => void;
}

export function useGeradorDeMassa(): EstadoDoGeradorDeMassa {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDoGeradorDeMassa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const vez = useRef(0);

  const cancelar = useCallback(() => {
    vez.current++;
    if (worker.current) {
      worker.current.terminate();
      worker.current = null;
    }
    setRodando(false);
  }, []);

  useEffect(() => () => cancelar(), [cancelar]);

  const gerar = useCallback(
    (entrada: EntradaDoGeradorDeMassa, semente: number, hipoteses: Partial<HipotesesDoGeradorDeMassa>) => {
      cancelar();
      const minha = vez.current;
      setErro(null);
      setRodando(true);
      const receber = (r: RespostaDoGeradorDeMassa) => {
        if (minha !== vez.current) return;
        if (r.tipo === 'resultado') setResultado(r.resultado);
        else setErro(r.mensagem);
        setRodando(false);
        if (worker.current) {
          worker.current.terminate();
          worker.current = null;
        }
      };
      let w: Worker | null = null;
      if (typeof Worker !== 'undefined') {
        try {
          w = new Worker(new URL('../utils/blueprintGeradorDeMassa.worker.ts', import.meta.url), { type: 'module' });
        } catch {
          w = null;
        }
      }
      if (w) {
        worker.current = w;
        w.onmessage = (ev: MessageEvent<RespostaDoGeradorDeMassa>) => receber(ev.data);
        w.onerror = (ev) => receber({ tipo: 'erro', mensagem: ev.message || 'falha no worker do gerador de massa' });
        w.postMessage({ entrada, semente, hipoteses } satisfies PedidoDoGeradorDeMassa);
        return;
      }
      setTimeout(() => {
        if (minha !== vez.current) return;
        try {
          receber({ tipo: 'resultado', resultado: gerarMassa(entrada, semente, hipoteses) });
        } catch (e) {
          receber({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
        }
      }, 0);
    },
    [cancelar],
  );

  const limpar = useCallback(() => {
    cancelar();
    setResultado(null);
    setErro(null);
  }, [cancelar]);

  return { rodando, resultado, erro, gerar, cancelar, limpar };
}
