// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

// ── Formata os KPIs em texto estruturado para o prompt ───────────────────────
function kpisToText(kpis: Record<string, unknown>, dateFrom: string, dateTo: string): string {
    const dre = (kpis.dre as Array<{ linha: string; realizado: number | null }> | null) ?? [];
    const comercial = kpis.comercial as Record<string, unknown> | null;
    const rh        = kpis.rh        as Record<string, unknown> | null;
    const supply    = kpis.supply    as Record<string, unknown> | null;
    const operacional = kpis.operacional as Record<string, unknown> | null;

    const brl = (v: number | null) => v != null ? `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : 'N/D';
    const pct = (v: number | null) => v != null ? `${v.toFixed(1)}%` : 'N/D';

    const dreLines = dre
        .filter(d => d.realizado != null)
        .map(d => `  ${d.linha}: ${brl(d.realizado)}`)
        .join('\n');

    return `Período analisado: ${dateFrom} a ${dateTo}

DRE:
${dreLines || '  (sem dados)'}

Comercial:
  Deals fechados: ${comercial?.deals_fechados ?? 'N/D'}
  VGV fechado: ${brl(comercial?.vgv_fechado as number | null)}
  Taxa de conversão: ${pct(comercial?.taxa_conversao_pct as number | null)}
  Ticket médio: ${brl(comercial?.ticket_medio as number | null)}

Operacional:
  Obras ativas: ${operacional?.obras_ativas ?? 'N/D'}
  NCs abertas: ${operacional?.ncs_abertas ?? 'N/D'}

Suprimentos:
  Taxa de divergência: ${pct(supply?.taxa_divergencia_pct as number | null)}
  Lead time médio: ${supply?.lead_time_medio_dias ?? 'N/D'} dias

RH:
  Headcount ativo: ${(rh?.headcount as Record<string, unknown> | null)?.ativos ?? 'N/D'}
  Turnover: ${pct((rh?.periodo as Record<string, unknown> | null)?.turnover_pct as number | null)}
  Custo MO no período: ${brl((rh?.custos as Record<string, unknown> | null)?.custo_mes as number | null)}`;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    if (!anthropicKey) {
        return json({ error: 'IA não configurada. Configure ANTHROPIC_API_KEY nas variáveis de ambiente do Supabase.' }, 503);
    }

    // Valida o usuário
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Token inválido' }, 401);

    const { kpis, dateFrom, dateTo, organizationName } = await req.json() as {
        kpis: Record<string, unknown>;
        dateFrom: string;
        dateTo: string;
        organizationName?: string;
    };

    const kpiText = kpisToText(kpis, dateFrom, dateTo);

    const systemPrompt = `Você é um analista financeiro sênior especializado em construtoras e incorporadoras brasileiras.
Sua tarefa é gerar um resumo executivo conciso e perspicaz em português (pt-BR) com base nos dados reais fornecidos.

Regras:
- Máximo 250 palavras.
- Destaque 2–3 pontos fortes e 1–2 pontos de atenção.
- Use linguagem executiva — números reais, percentuais, tendências.
- Não invente dados não presentes. Se um dado for N/D, ignore-o.
- Termine com 1 recomendação estratégica prioritária.
- NÃO use listas com marcadores. Escreva em parágrafos fluidos.`;

    const userPrompt = `Empresa: ${organizationName ?? 'Construtora'}

${kpiText}

Gere o resumo executivo:`;

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 400,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            return json({ error: `Anthropic API: ${err}` }, 502);
        }

        const data = await res.json() as { content: Array<{ text: string }> };
        const narrative = data.content?.[0]?.text ?? '';

        return json({ narrative });
    } catch (err) {
        return json({ error: String(err) }, 500);
    }
});
