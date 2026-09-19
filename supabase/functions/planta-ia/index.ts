// supabase/functions/planta-ia/index.ts
//
// IA CONVERSACIONAL DA PLANTA INTELIGENTE (19/09/2026, roadmap E6.4).
//
// O pedido em linguagem natural vira MUDANÇAS ESTRUTURADAS — no programa de
// necessidades, nas hipóteses do gerador e nos pesos da avaliação — NUNCA
// geometria. O modelo é obrigado a responder pela ferramenta `emitir_mudancas`
// (esquema fechado); o cliente valida de novo (`mudancasDaResposta` +
// `aplicarMudancas` em utils/blueprintIa.ts), re-gera e mostra o delta dos
// indicadores. Sem ANTHROPIC_API_KEY → 503, e o cliente usa o intérprete local.
//
// Mesmo desenho de `bi-narrative`/`read-matricula`: CORS, usuário validado pelo
// token, chave só no servidor. Deploy: `npx supabase functions deploy planta-ia`.

// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const USOS = ['SALA', 'COZINHA', 'DORMITORIO', 'SUITE', 'BANHEIRO', 'LAVABO', 'AREA_DE_SERVICO', 'VARANDA', 'CIRCULACAO', 'GARAGEM', 'ESCRITORIO', 'DEPOSITO', 'OUTRO'];
const INDICADORES = ['programa', 'legal', 'eficiencia', 'circulacao', 'compacidade', 'insolacao', 'ventilacao', 'corredores', 'adjacencias', 'privacidade', 'acessibilidade', 'estrutura', 'modulacao', 'custo', 'paredes', 'fachada', 'shafts', 'hidraulica'];

const FERRAMENTA = {
  name: 'emitir_mudancas',
  description: 'Traduz o pedido do projetista em mudanças estruturadas no programa de necessidades, nas hipóteses do gerador e nos pesos da avaliação. Nunca geometria.',
  input_schema: {
    type: 'object',
    properties: {
      entendimento: { type: 'string', description: 'Uma frase, em português, dizendo o que foi entendido e o que será mudado.' },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['ajustar_area', 'definir_quantidade', 'adicionar', 'remover', 'exigir'] },
            alvo: { type: 'string', description: 'Nome do item do programa (ou o uso) — obrigatório fora de "adicionar".' },
            deltaM2: { type: 'number' },
            areaIdealM2: { type: 'number' },
            quantidade: { type: 'integer' },
            uso: { type: 'string', enum: USOS },
            nome: { type: 'string' },
            iluminacao: { type: 'boolean' },
            ventilacao: { type: 'boolean' },
            fachada: { type: 'boolean' },
          },
          required: ['op'],
        },
      },
      programa: { type: 'object', properties: { circulacaoMaxPct: { type: 'number' }, percursoMaxM: { type: ['number', 'null'] } } },
      gerador: {
        type: 'object',
        properties: {
          sementes: { type: 'integer' },
          iteracoes: { type: 'integer' },
          larguraCorredorMm: { type: 'integer' },
          peDireitoMm: { type: 'integer' },
          automaticos: { type: 'boolean' },
          retanguloSemEnvelope: { type: 'object', properties: { larguraMm: { type: 'integer' }, profundidadeMm: { type: 'integer' } } },
        },
      },
      pesos: { type: 'object', properties: Object.fromEntries(INDICADORES.map((k) => [k, { type: 'integer', minimum: 0, maximum: 10 }])) },
    },
    required: ['entendimento'],
  },
};

const SISTEMA = `Você é a assistente de projeto da Planta Inteligente (ÒPURA). O projetista pede mudanças em linguagem natural; você as traduz em MUDANÇAS ESTRUTURADAS pela ferramenta emitir_mudancas — no programa de necessidades (itens: uso, quantidade, área ideal em m², exigências), nas hipóteses do gerador (corredor em mm, pé-direito em mm, sementes, iterações, automáticos, retângulo sem lote em mm) e nos pesos dos indicadores (0–10). Você NUNCA desenha nem move paredes: quem re-gera a planta é o gerador determinístico, e o projetista verá o delta dos indicadores.
Regras: use os nomes dos itens exatamente como estão no programa; áreas em m² (deltaM2 para "+2 m²", areaIdealM2 para "vira 18 m²"); medidas lineares em mm; se o pedido citar algo que não existe no programa, use "adicionar" com o uso mais próximo; se não entender, devolva só o entendimento explicando a dúvida, sem mudanças. Responda sempre em português.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!anthropicKey) return json({ error: 'IA não configurada. Configure ANTHROPIC_API_KEY nas variáveis de ambiente do Supabase.', codigo: 'SEM_CHAVE' }, 503);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Token inválido' }, 401);

  let body: { pedido?: string; contexto?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido' }, 400);
  }
  const pedido = (body.pedido ?? '').toString().trim();
  if (!pedido) return json({ error: 'Pedido vazio' }, 400);
  const contexto = JSON.stringify(body.contexto ?? {}).slice(0, 20000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: SISTEMA,
        tools: [FERRAMENTA],
        tool_choice: { type: 'tool', name: 'emitir_mudancas' },
        messages: [{ role: 'user', content: `Contexto (programa atual, hipóteses, indicadores):\n${contexto}\n\nPedido do projetista:\n${pedido}` }],
      }),
    });
    if (!res.ok) return json({ error: `Anthropic API: ${await res.text()}` }, 502);
    const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: unknown; text?: string }> };
    const uso = data.content?.find((c) => c.type === 'tool_use' && c.name === 'emitir_mudancas');
    if (!uso?.input) return json({ mudancas: { entendimento: data.content?.find((c) => c.type === 'text')?.text ?? 'A IA não propôs mudanças.' } });
    return json({ mudancas: uso.input });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
