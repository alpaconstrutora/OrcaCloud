import type { EstruturaDoTipo } from './empreendimentoTipos';

/**
 * Colunas da Tabela de Preços (Venda de Ativos / Locações) que não fazem sentido para a
 * estrutura do empreendimento do prédio. No LOTE a unidade é o terreno: não tem vaga,
 * banheiro, pavimento nem posição, mas tem quadra e nº do lote. Nos demais, quadra/lote
 * não existem. Plano: docs/planos/2026-11-10-tabela-precos-colunas-do-lote.md.
 */
const SO_DE_EDIFICACAO = ['parking', 'bathrooms', 'floor', 'position'];
const SO_DE_LOTE = ['quadra', 'lote'];

export function colunasForaDaTabelaDePrecos(estrutura: EstruturaDoTipo): Set<string> {
  return new Set(estrutura === 'LOTE' ? SO_DE_EDIFICACAO : SO_DE_LOTE);
}
