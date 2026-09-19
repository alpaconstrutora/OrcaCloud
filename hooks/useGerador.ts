import { useCallback, useEffect, useRef, useState } from 'react';
import { gerar, type EntradaDoGerador, type HipotesesDoGerador, type ResultadoDoGerador } from '../utils/blueprintGerador';
import type { PedidoDoGerador, RespostaDoGerador } from '../utils/blueprintGerador.worker';

/**
 * Roda o gerador (E6.2) num Web Worker — a interface continua respondendo
 * enquanto o recozimento anda — e devolve as alternativas conforme chegam.
 * Sem `Worker` (testes em jsdom, navegador antigo), roda no fio principal,
 * uma semente por volta do event loop, com o MESMO `gerar`: o resultado é
 * idêntico (o gerador é determinístico).
 */
export interface EstadoDoGerador {
  rodando: boolean;
  resultados: ResultadoDoGerador[];
  erros: { semente: number; mensagem: string }[];
  progresso: { feitas: number; total: number };
  gerar: (entrada: EntradaDoGerador, hipoteses: Partial<HipotesesDoGerador>, sementes: number[]) => void;
  cancelar: () => void;
  limpar: () => void;
}

export function useGerador(): EstadoDoGerador {
  const [rodando, setRodando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoDoGerador[]>([]);
  const [erros, setErros] = useState<{ semente: number; mensagem: string }[]>([]);
  const [progresso, setProgresso] = useState({ feitas: 0, total: 0 });
  const worker = useRef<Worker | null>(null);
  const cancelado = useRef(false);

  const cancelar = useCallback(() => {
    cancelado.current = true;
    if (worker.current) {
      worker.current.terminate();
      worker.current = null;
    }
    setRodando(false);
  }, []);

  useEffect(() => () => cancelar(), [cancelar]);

  const rodar = useCallback(
    (entrada: EntradaDoGerador, hipoteses: Partial<HipotesesDoGerador>, sementes: number[]) => {
      cancelar();
      cancelado.current = false;
      setResultados([]);
      setErros([]);
      setProgresso({ feitas: 0, total: sementes.length });
      setRodando(true);
      const receber = (r: RespostaDoGerador) => {
        if (cancelado.current) return;
        if (r.tipo === 'resultado') {
          setResultados((xs) => [...xs, r.resultado]);
          setProgresso((p) => ({ ...p, feitas: p.feitas + 1 }));
        } else if (r.tipo === 'erro') {
          setErros((xs) => [...xs, { semente: r.semente, mensagem: r.mensagem }]);
          setProgresso((p) => ({ ...p, feitas: p.feitas + 1 }));
        } else {
          setRodando(false);
          if (worker.current) {
            worker.current.terminate();
            worker.current = null;
          }
        }
      };
      let w: Worker | null = null;
      if (typeof Worker !== 'undefined') {
        try {
          w = new Worker(new URL('../utils/blueprintGerador.worker.ts', import.meta.url), { type: 'module' });
        } catch {
          w = null;
        }
      }
      if (w) {
        worker.current = w;
        w.onmessage = (ev: MessageEvent<RespostaDoGerador>) => receber(ev.data);
        w.onerror = (ev) => {
          receber({ tipo: 'erro', semente: 0, mensagem: ev.message || 'falha no worker' });
          receber({ tipo: 'fim' });
        };
        w.postMessage({ entrada, hipoteses, sementes } satisfies PedidoDoGerador);
        return;
      }
      // Sem Worker: uma semente por volta do event loop.
      const fila = [...sementes];
      const passo = () => {
        if (cancelado.current) return;
        const s = fila.shift();
        if (s === undefined) {
          receber({ tipo: 'fim' });
          return;
        }
        try {
          receber({ tipo: 'resultado', resultado: gerar(entrada, s, hipoteses) });
        } catch (e) {
          receber({ tipo: 'erro', semente: s, mensagem: e instanceof Error ? e.message : String(e) });
        }
        setTimeout(passo, 0);
      };
      setTimeout(passo, 0);
    },
    [cancelar],
  );

  const limpar = useCallback(() => {
    cancelar();
    setResultados([]);
    setErros([]);
    setProgresso({ feitas: 0, total: 0 });
  }, [cancelar]);

  return { rodando, resultados, erros, progresso, gerar: rodar, cancelar, limpar };
}
