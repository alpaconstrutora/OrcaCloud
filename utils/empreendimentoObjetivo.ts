// utils/empreendimentoObjetivo.ts
//
// Objetivo do empreendimento (21/11/2026): Vendas, Locação, Misto ou Serviço. Decide quais abas de
// espelho a ficha mostra — docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md; o
// Serviço (nenhum espelho) veio em docs/planos/2026-11-21-empreendimentos-objetivo-servico-agrupar.md.
import type { EmpreendimentoObjetivo } from '../types/empreendimento';

export const OBJETIVOS: EmpreendimentoObjetivo[] = ['VENDAS', 'LOCACAO', 'MISTO', 'SERVICO'];

export const ROTULO_DO_OBJETIVO: Record<EmpreendimentoObjetivo, string> = {
  VENDAS: 'Vendas',
  LOCACAO: 'Locação',
  MISTO: 'Misto (venda e locação)',
  SERVICO: 'Serviço',
};

/** Valor que a tela usa: nulo ou desconhecido (registro anterior à coluna) conta como Misto. */
export function objetivoDe(valor: string | null | undefined): EmpreendimentoObjetivo {
  return valor === 'VENDAS' || valor === 'LOCACAO' || valor === 'SERVICO' ? valor : 'MISTO';
}

/** Quais espelhos o objetivo mostra: Vendas esconde Locações, Locação esconde Vendas, Misto mostra
 *  os dois e Serviço nenhum (obra/prestação para terceiro: nada à venda nem para locar). */
export function espelhosDoObjetivo(valor: string | null | undefined): { vendas: boolean; locacoes: boolean } {
  const o = objetivoDe(valor);
  return { vendas: o === 'VENDAS' || o === 'MISTO', locacoes: o === 'LOCACAO' || o === 'MISTO' };
}
