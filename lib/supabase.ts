import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key are required');
}

// Timeout de rede: sem isto, se o backend (Postgres/PostgREST) travar, as
// requisições ficam pendentes indefinidamente e a UI fica presa em
// "Sincronizando..." sem nunca cair no catch. Um AbortController aborta a
// chamada após REQUEST_TIMEOUT_MS, transformando o travamento num erro
// tratável (que o overlay do App transforma em tela de "Falha de conexão").
const REQUEST_TIMEOUT_MS = 20000;

const fetchWithTimeout: typeof fetch = (input, init) => {
    // Respeita um AbortSignal já existente (ex.: cancelamento do supabase-js)
    // combinando-o com o nosso timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const externalSignal = init?.signal;
    if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    return fetch(input, { ...init, signal: controller.signal })
        .finally(() => clearTimeout(timer));
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: fetchWithTimeout },
});
