// utils/empreendimentoUnidadeUnica.ts
//
// Empreendimento de UNIDADE ÚNICA (09/11/2026) — pedido: "quando o empreendimento for um lote a
// unidade é o próprio lote"; Chácara e Casa Residencial seguem a mesma regra. A unidade mora numa
// torre implícita (o resto do sistema lê unidade dentro de torre). Regras puras; a tela é
// components/empreendimento/UnidadeUnicaEditor.tsx. Plano: docs/planos/2026-11-09-empreendimento-unidade-unica.md.
import type { EmpreendimentoUnitUpdate } from '../types';
import type { EstruturaDoTipo } from './empreendimentoTipos';

/** Unidade única é LOTE ou IMOVEL_UNICO; TORRES é o de sempre. */
export const ehUnidadeUnica = (e: EstruturaDoTipo): e is 'LOTE' | 'IMOVEL_UNICO' => e !== 'TORRES';

/**
 * Mais de uma torre ou mais de uma unidade: o tipo mudou depois do cadastro. A tela mostra Torres &
 * Unidades como antes (com o motivo) — nunca escolhe uma nem apaga as outras.
 */
export const foraDoMolde = (qtdTorres: number, qtdUnidades: number) => qtdTorres > 1 || qtdUnidades > 1;

/** Nome da torre implícita: o do tipo ("Lote", "Chácara", "Casa Residencial"). */
export function nomeDaTorreImplicita(estrutura: 'LOTE' | 'IMOVEL_UNICO', nomeDoTipo?: string | null): string {
  return nomeDoTipo?.trim() || (estrutura === 'LOTE' ? 'Lote' : 'Imóvel');
}

/**
 * No LOTE a unidade É o terreno: área privativa = área total = área do terreno, testada = frente.
 * Terreno vazio limpa (null), para a unidade não ficar com um número que a ficha já não tem.
 */
export function camposDoLote(t: { terreno_area?: number | null; terreno_frente?: number | null }): EmpreendimentoUnitUpdate {
  const area = t.terreno_area ?? null;
  return {
    // As colunas aceitam NULL; o tipo do registro não declara (mesma nota do salvar terreno).
    private_area: area as number | undefined,
    total_area: area as number | undefined,
    common_area: null as unknown as number | undefined,
    testada_m: t.terreno_frente ?? null,
  };
}
