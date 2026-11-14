import { useCallback, useEffect, useRef, useState } from 'react';
import { assinaturaDoPedidoDoPredio, planejarPredioDoPedido, type PedidoDoPredio, type PlanoDoPredio } from '../utils/blueprintPredioAutomatico';
import type { RespostaDoPredio } from '../utils/blueprintPredioAutomatico.worker';

/**
 * Roda o PRÉDIO AUTOMÁTICO (PA2, 13/11/2026) num Web Worker — o R12 leva alguns segundos (as plantas das unidades), e a
 * tela segue viva mostrando a etapa em curso. Sem `Worker` (jsdom), roda no fio principal numa volta do event loop, com o
 * MESMO `planejarPredioDoPedido`. Molde: `useCasaAutomatica`.
 */
export interface EstadoDoPredioAutomatico {
  rodando: boolean;
  plano: PlanoDoPredio | null;
  /** A assinatura do pedido que gerou o `plano` — a tela compara com a de agora e, diferente, a prévia é VELHA. */
  assinatura: string | null;
  erro: string | null;
  /** A última etapa concluída (`null` antes da primeira). */
  progresso: { indice: number; total: number; rotulo: string } | null;
  gerar: (pedido: PedidoDoPredio) => void;
  cancelar: () => void;
  limpar: () => void;
}

export function usePredioAutomatico(): EstadoDoPredioAutomatico {
  const [rodando, setRodando] = useState(false);
  const [plano, setPlano] = useState<PlanoDoPredio | null>(null);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<EstadoDoPredioAutomatico['progresso']>(null);
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
    (pedido: PedidoDoPredio) => {
      cancelar();
      const minha = vez.current;
      setErro(null);
      setRodando(true);
      const deste = assinaturaDoPedidoDoPredio(pedido);
      const receber = (r: RespostaDoPredio) => {
        if (minha !== vez.current) return;
        if (r.tipo === 'etapa') {
          setProgresso({ indice: r.indice, total: r.total, rotulo: r.etapa.rotulo });
          return;
        }
        if (r.tipo === 'resultado') {
          setPlano(r.plano);
          setAssinatura(deste);
        } else setErro(r.mensagem);
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
          w = new Worker(new URL('../utils/blueprintPredioAutomatico.worker.ts', import.meta.url), { type: 'module' });
        } catch {
          w = null;
        }
      }
      if (w) {
        worker.current = w;
        w.onmessage = (ev: MessageEvent<RespostaDoPredio>) => receber(ev.data);
        w.onerror = (ev) => receber({ tipo: 'erro', mensagem: ev.message || 'falha no worker do prédio automático' });
        w.postMessage(pedido);
        return;
      }
      setTimeout(() => {
        if (minha !== vez.current) return;
        try {
          receber({ tipo: 'resultado', plano: planejarPredioDoPedido(pedido) });
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
    setAssinatura(null);
    setErro(null);
  }, [cancelar]);

  return { rodando, plano, assinatura: plano ? assinatura : null, erro, progresso, gerar, cancelar, limpar };
}
