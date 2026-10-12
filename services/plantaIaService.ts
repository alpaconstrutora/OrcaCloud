// services/plantaIaService.ts
//
// A ponte com a Edge Function `planta-ia` (E6.4). Devolve as mudanças
// estruturadas OU `null` com o motivo quando a IA não está disponível (sem
// chave, sem função publicada, erro de rede) — quem chama cai no intérprete
// local (`interpretarPedidoLocal`). Nunca lança por indisponibilidade.

import { supabase } from '../lib/supabase';
import { mudancasDaResposta, type MudancasDaIa } from '../utils/blueprintIa';
import { mudancasDaMassaDaResposta, type MudancasDaMassa } from '../utils/blueprintIaDaMassa';

export interface RespostaDaIa {
  mudancas: MudancasDaIa | null;
  /** Por que não veio da IA (para a tela dizer "intérprete local: …"). */
  indisponivel: string | null;
}

export async function pedirMudancasAIa(pedido: string, contexto: unknown): Promise<RespostaDaIa> {
  try {
    const { data, error } = await supabase.functions.invoke('planta-ia', { body: { pedido, contexto } });
    if (error) {
      const msg = (error as { message?: string }).message ?? String(error);
      return { mudancas: null, indisponivel: /Failed to send|Failed to fetch|non-2xx|503/i.test(msg) ? 'IA não configurada ou indisponível' : msg };
    }
    const payload = data as { mudancas?: unknown; error?: string } | null;
    if (!payload || payload.error) return { mudancas: null, indisponivel: payload?.error ?? 'resposta vazia' };
    return { mudancas: mudancasDaResposta(payload.mudancas), indisponivel: null };
  } catch (e) {
    return { mudancas: null, indisponivel: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * ESTUDO DE MASSA (M5c): o mesmo `planta-ia`, no modo "massa" — o pedido vira
 * mudanças no PRODUTO e na configuração do gerador de massa. Mesmo contrato:
 * `null` + motivo quando a IA não está disponível (quem chama usa
 * `interpretarPedidoDaMassaLocal`).
 */
export interface RespostaDaIaDaMassa {
  mudancas: MudancasDaMassa | null;
  indisponivel: string | null;
}

export async function pedirMudancasDaMassaAIa(pedido: string, contexto: unknown): Promise<RespostaDaIaDaMassa> {
  try {
    const { data, error } = await supabase.functions.invoke('planta-ia', { body: { pedido, contexto, modo: 'massa' } });
    if (error) {
      const msg = (error as { message?: string }).message ?? String(error);
      return { mudancas: null, indisponivel: /Failed to send|Failed to fetch|non-2xx|503/i.test(msg) ? 'IA não configurada ou indisponível' : msg };
    }
    const payload = data as { mudancas?: unknown; error?: string } | null;
    if (!payload || payload.error) return { mudancas: null, indisponivel: payload?.error ?? 'resposta vazia' };
    return { mudancas: mudancasDaMassaDaResposta(payload.mudancas), indisponivel: null };
  } catch (e) {
    return { mudancas: null, indisponivel: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * RASTREAR (F15, 12/10/2026): o recorte da planta de fundo vai ao `planta-ia` no modo "rastrear" (Claude com
 * visão) e volta o traçado CRU, em pixels da imagem enviada — quem saneia e confere no fundo é
 * `utils/blueprintRastrear.ts`. Mesmo contrato dos outros: `indisponivel` com o motivo em vez de lançar.
 */
export interface RespostaDoRastreio {
  tracado: unknown | null;
  modelo: string | null;
  /** A resposta passou do teto de tokens: o traçado pode estar incompleto. */
  cortado: boolean;
  indisponivel: string | null;
}

export async function rastrearPlantaComIa(imagemBase64: string, tipoDaImagem: 'image/png' | 'image/jpeg', largura: number, altura: number): Promise<RespostaDoRastreio> {
  try {
    const { data, error } = await supabase.functions.invoke('planta-ia', { body: { modo: 'rastrear', imagem: imagemBase64, tipoDaImagem, largura, altura } });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      let detalhe: string | null = null;
      try {
        detalhe = ctx && typeof ctx.json === 'function' ? ((await ctx.json()) as { error?: string })?.error ?? null : null;
      } catch {
        detalhe = null;
      }
      const msg = detalhe ?? (error as { message?: string }).message ?? String(error);
      return { tracado: null, modelo: null, cortado: false, indisponivel: /Failed to send|Failed to fetch|ANTHROPIC_API_KEY/i.test(msg) ? 'IA não configurada ou indisponível (a chave ANTHROPIC_API_KEY não está no Supabase)' : msg };
    }
    const payload = data as { tracado?: unknown; modelo?: string; cortado?: boolean; error?: string } | null;
    if (!payload || payload.error || !payload.tracado) return { tracado: null, modelo: null, cortado: false, indisponivel: payload?.error ?? 'resposta vazia' };
    return { tracado: payload.tracado, modelo: payload.modelo ?? null, cortado: !!payload.cortado, indisponivel: null };
  } catch (e) {
    return { tracado: null, modelo: null, cortado: false, indisponivel: e instanceof Error ? e.message : String(e) };
  }
}
