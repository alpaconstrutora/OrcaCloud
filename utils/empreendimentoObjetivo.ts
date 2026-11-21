// utils/empreendimentoObjetivo.ts
//
// Objetivo do empreendimento (21/11/2026): Vendas, Locação ou Misto. Decide quais abas de
// espelho a ficha mostra — docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md.
import type { EmpreendimentoObjetivo } from '../types/empreendimento';

export const OBJETIVOS: EmpreendimentoObjetivo[] = ['VENDAS', 'LOCACAO', 'MISTO'];

export const ROTULO_DO_OBJETIVO: Record<EmpreendimentoObjetivo, string> = {
  VENDAS: 'Vendas',
  LOCACAO: 'Locação',
  MISTO: 'Misto (venda e locação)',
};

/** Valor que a tela usa: nulo ou desconhecido (registro anterior à coluna) conta como Misto. */
export function objetivoDe(valor: string | null | undefined): EmpreendimentoObjetivo {
  return valor === 'VENDAS' || valor === 'LOCACAO' ? valor : 'MISTO';
}

/** Quais espelhos o objetivo mostra: Vendas esconde Locações, Locação esconde Vendas, Misto mostra os dois. */
export function espelhosDoObjetivo(valor: string | null | undefined): { vendas: boolean; locacoes: boolean } {
  const o = objetivoDe(valor);
  return { vendas: o !== 'LOCACAO', locacoes: o !== 'VENDAS' };
}
