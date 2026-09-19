// services/plantaIaService.ts
//
// A ponte com a Edge Function `planta-ia` (E6.4). Devolve as mudanças
// estruturadas OU `null` com o motivo quando a IA não está disponível (sem
// chave, sem função publicada, erro de rede) — quem chama cai no intérprete
// local (`interpretarPedidoLocal`). Nunca lança por indisponibilidade.

import { supabase } from '../lib/supabase';
import { mudancasDaResposta, type MudancasDaIa } from '../utils/blueprintIa';

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
