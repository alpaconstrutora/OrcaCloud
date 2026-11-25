/**
 * Pede à Edge Function `cobertura-do-solo` a grade do ESA WorldCover para a caixa do terreno — as
 * ÁRVORES da Maquete (25/11/2026). Só pede com caixa (o editor a dá com o estilo Maquete ligado e o
 * estudo georreferenciado com relevo) e guarda em memória por caixa.
 *
 * Falha vira `erro` com o motivo em português, para o 3D dizer por que as árvores não vieram.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { gradeDaResposta, type CaixaGeografica, type GradeDeCobertura, type RespostaDaCobertura } from '../utils/geo/coberturaDoSolo';

export type EstadoDaCobertura =
  | { estado: 'ocioso' }
  | { estado: 'carregando' }
  | { estado: 'pronto'; grade: GradeDeCobertura }
  | { estado: 'erro'; motivo: string };

const grades = new Map<string, GradeDeCobertura>();
const chaveDe = (c: CaixaGeografica) => [c.sul, c.oeste, c.norte, c.leste].map((n) => n.toFixed(6)).join(',');

export function useCoberturaDaMaquete(caixa: CaixaGeografica | null): EstadoDaCobertura {
  const chave = caixa ? chaveDe(caixa) : null;
  const [estado, setEstado] = useState<EstadoDaCobertura>({ estado: 'ocioso' });
  useEffect(() => {
    if (!chave || !caixa) {
      setEstado({ estado: 'ocioso' });
      return;
    }
    const guardada = grades.get(chave);
    if (guardada) {
      setEstado({ estado: 'pronto', grade: guardada });
      return;
    }
    let vivo = true;
    setEstado({ estado: 'carregando' });
    supabase.functions
      .invoke('cobertura-do-solo', { body: { caixa } })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error || !data) {
          setEstado({ estado: 'erro', motivo: 'o mapa de cobertura do solo (ESA WorldCover) não respondeu — as árvores ficam de fora' });
          return;
        }
        const grade = gradeDaResposta(data as RespostaDaCobertura);
        grades.set(chave, grade);
        setEstado({ estado: 'pronto', grade });
      })
      .catch(() => {
        if (vivo) setEstado({ estado: 'erro', motivo: 'sem conexão com o mapa de cobertura do solo (ESA WorldCover)' });
      });
    return () => {
      vivo = false;
    };
    // `caixa` entra pela chave: o mesmo valor em outro objeto não pede de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return estado;
}
