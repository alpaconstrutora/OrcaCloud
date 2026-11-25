// utils/empreendimentoObjetivo.ts
//
// Objetivo do empreendimento (21/11/2026): Vendas, Locação, Misto, Serviço ou Imobilizado. Decide
// quais abas de espelho a ficha mostra — docs/planos/2026-11-21-empreendimento-visao-geral-objetivo.md;
// o Serviço (nenhum espelho) veio em docs/planos/2026-11-21-empreendimentos-objetivo-servico-agrupar.md
// e o Imobilizado (nenhum espelho) em docs/planos/2026-11-25-empreendimento-objetivo-imobilizado.md.
import type { EmpreendimentoObjetivo } from '../types/empreendimento';

export const OBJETIVOS: EmpreendimentoObjetivo[] = ['VENDAS', 'LOCACAO', 'MISTO', 'SERVICO', 'IMOBILIZADO'];

export const ROTULO_DO_OBJETIVO: Record<EmpreendimentoObjetivo, string> = {
  VENDAS: 'Vendas',
  LOCACAO: 'Locação',
  MISTO: 'Misto (venda e locação)',
  SERVICO: 'Serviço',
  IMOBILIZADO: 'Imobilizado',
};

/** Valor que a tela usa: nulo ou desconhecido (registro anterior à coluna) conta como Misto. */
export function objetivoDe(valor: string | null | undefined): EmpreendimentoObjetivo {
  return (OBJETIVOS as string[]).includes(valor ?? '') ? (valor as EmpreendimentoObjetivo) : 'MISTO';
}

/** Quais espelhos o objetivo mostra: Vendas esconde Locações, Locação esconde Vendas, Misto mostra
 *  os dois; Serviço (obra/prestação para terceiro) e Imobilizado (imóvel que a empresa mantém no
 *  ativo) não mostram nenhum — nada à venda nem para locar. */
export function espelhosDoObjetivo(valor: string | null | undefined): { vendas: boolean; locacoes: boolean } {
  const o = objetivoDe(valor);
  return { vendas: o === 'VENDAS' || o === 'MISTO', locacoes: o === 'LOCACAO' || o === 'MISTO' };
}
