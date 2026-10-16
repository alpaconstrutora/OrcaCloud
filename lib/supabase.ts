import { createClient } from '@supabase/supabase-js';
// Precisa ser avaliado ANTES do createClient: ele apaga o #type=invite|recovery
// da URL na inicialização. Ver lib/linkDeAcesso.ts.
import './linkDeAcesso';
import { tempoLimiteDaRequisicao } from './tempoLimiteRequisicao';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key are required');
}

// Timeout de rede: sem isto, se o backend (Postgres/PostgREST) travar, as
// requisições ficam pendentes indefinidamente e a UI fica presa em
// "Sincronizando..." sem nunca cair no catch. Um AbortController aborta a
// chamada após o tempo limite, transformando o travamento num erro
// tratável (que o overlay do App transforma em tela de "Falha de conexão").
// 20 s para o banco; 150 s para Edge Function — ver lib/tempoLimiteRequisicao.ts.
const fetchWithTimeout: typeof fetch = (input, init) => {
    // Respeita um AbortSignal já existente (ex.: cancelamento do supabase-js)
    // combinando-o com o nosso timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), tempoLimiteDaRequisicao(input));

    const externalSignal = init?.signal;
    if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    return fetch(input, { ...init, signal: controller.signal })
        .finally(() => clearTimeout(timer));
};

/** Para chamadas que precisam de corte de tempo PRÓPRIO, fora do client global —
 *  o motor de conciliação na Edge (180 s; 26–61 s na Alpa) e o import do ÒPURA
 *  Market. Edge Function chamada pelo client já espera 150 s (16/10/2026). */
export const SUPABASE_URL: string = supabaseUrl;
export const SUPABASE_ANON_KEY: string = supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: fetchWithTimeout },
});
