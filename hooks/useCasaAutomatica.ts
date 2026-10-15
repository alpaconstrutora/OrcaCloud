import { useCallback, useEffect, useRef, useState } from 'react';
import { planejarCasaDoPedido, type PedidoDaCasa, type PlanoDaCasa } from '../utils/blueprintCasaAutomatica';
import type { RespostaDaCasa } from '../utils/blueprintCasaAutomatica.worker';

/**
 * Roda a CASA AUTOMÁTICA (F10, 15/10/2026) num Web Worker — a casa inteira leva de meio a um segundo e meio, e a
 * tela segue viva mostrando a etapa em curso. Sem `Worker` (testes em jsdom, navegador antigo), roda no fio
 * principal numa volta do event loop, com o MESMO `planejarCasaDoPedido`: o plano é idêntico (o motor é
 * determinístico). Molde: `useGeradorDeMassa`.
 */
export interface EstadoDaCasaAutomatica {
  rodando: boolean;
  plano: PlanoDaCasa | null;
  erro: string | null;
  /** A última etapa concluída (`null` antes da primeira). */
  progresso: { indice: number; total: number; rotulo: string } | null;
  gerar: (pedido: PedidoDaCasa) => void;
  cancelar: () => void;
  limpar: () => void;
}

export function useCasaAutomatica(): EstadoDaCasaAutomatica {
  const [rodando, setRodando] = useState(false);
  const [plano, setPlano] = useState<PlanoDaCasa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<EstadoDaCasaAutomatica['progresso']>(null);
  const worker = useRef<Worker | null>(null);
  const vez = useRef(0);

  const cancelar = useCallback(() => {
    vez.current++;
    if (worker.current) {
      worker.current.terminate();
      worker.current = null;
    }
    setRodando(false);
    setProgresso(null);
  }, []);

  useEffect(() => () => cancelar(), [cancelar]);

  const gerar = useCallback(
    (pedido: PedidoDaCasa) => {
      cancelar();
      const minha = vez.current;
      setErro(null);
      setRodando(true);
      const receber = (r: RespostaDaCasa) => {
        if (minha !== vez.current) return;
        if (r.tipo === 'etapa') {
          setProgresso({ indice: r.indice, total: r.total, rotulo: r.etapa.rotulo });
          return;
        }
        if (r.tipo === 'resultado') setPlano(r.plano);
        else setErro(r.mensagem);
        setRodando(false);
        setProgresso(null);
        if (worker.current) {
          worker.current.terminate();
          worker.current = null;
        }
      };
      let w: Worker | null = null;
      if (typeof Worker !== 'undefined') {
        try {
          w = new Worker(new URL('../utils/blueprintCasaAutomatica.worker.ts', import.meta.url), { type: 'module' });
        } catch {
          w = null;
        }
      }
      if (w) {
        worker.current = w;
        w.onmessage = (ev: MessageEvent<RespostaDaCasa>) => receber(ev.data);
        w.onerror = (ev) => receber({ tipo: 'erro', mensagem: ev.message || 'falha no worker da casa automática' });
        w.postMessage(pedido);
        return;
      }
      setTimeout(() => {
        if (minha !== vez.current) return;
        try {
          receber({ tipo: 'resultado', plano: planejarCasaDoPedido(pedido) });
        } catch (e) {
          receber({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
        }
      }, 0);
    },
    [cancelar],
  );

  const limpar = useCallback(() => {
    cancelar();
    setPlano(null);
    setErro(null);
  }, [cancelar]);

  return { rodando, plano, erro, progresso, gerar, cancelar, limpar };
}
