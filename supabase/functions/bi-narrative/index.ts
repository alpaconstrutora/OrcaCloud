// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirMembro, exigirUsuario, respostaDeErro } from "../_shared/auth.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

// ── Limites do que entra no prompt (a chave da IA é da plataforma) ───────────
// Os rótulos reais do DRE são 13, o maior com 31 caracteres (fn_dre_summary).
const MAX_LINHAS_DRE   = 20;
const MAX_ROTULO_DRE   = 60;
const MAX_NOME_EMPRESA = 120;
// O que a tela mandava com o topo em "Todas as organizações".
const NOME_TODAS = 'Todas as Organizações';

/** Só número finito passa; o resto vira null (o prompt mostra N/D). */
const numero = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Texto livre (rótulo do DRE, nome da organização): cada sequência de espaço ou
 * caractere de controle vira UM espaço, e o resultado é cortado em `max`. Uma
 * passada só (linear). Texto real, sem quebra de linha nem espaço duplo, sai igual.
 */
function texto(v: unknown, max: number): string {
    if (typeof v !== 'string') return '';
    let s = v.replace(/[\s\p{Cc}]+/gu, ' ').slice(0, max);
    // O corte não deixa meio par substituto no fim.
    const ultimo = s.charCodeAt(s.length - 1);
    if (ultimo >= 0xD800 && ultimo <= 0xDBFF) s = s.slice(0, -1);
    return s;
}

/** Data do período: só AAAA-MM-DD; o resto vira vazio. */
const dataDoPeriodo = (v: unknown): string =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';

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
function kpisToText(kpisBrutos: unknown, dateFrom: string, dateTo: string): string {
    const kpis = (kpisBrutos && typeof kpisBrutos === 'object' ? kpisBrutos : {}) as Record<string, unknown>;
    const dre = Array.isArray(kpis.dre) ? (kpis.dre as unknown[]) : [];
    const comercial = kpis.comercial as Record<string, unknown> | null;
    const rh        = kpis.rh        as Record<string, unknown> | null;
    const supply    = kpis.supply    as Record<string, unknown> | null;
    const operacional = kpis.operacional as Record<string, unknown> | null;

    const brl = (v: unknown) => { const n = numero(v); return n != null ? `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : 'N/D'; };
    const pct = (v: unknown) => { const n = numero(v); return n != null ? `${n.toFixed(1)}%` : 'N/D'; };
    const qtd = (v: unknown) => numero(v) ?? 'N/D';

    const dreLines = dre
        .filter((d): d is Record<string, unknown> =>
            !!d && typeof d === 'object' && (d as Record<string, unknown>).realizado != null)
        .slice(0, MAX_LINHAS_DRE)
        .map(d => `  ${texto(d.linha, MAX_ROTULO_DRE)}: ${brl(d.realizado)}`)
        .join('\n');

    return `Período analisado: ${dateFrom} a ${dateTo}

DRE:
${dreLines || '  (sem dados)'}

Comercial:
  Deals fechados: ${qtd(comercial?.deals_fechados)}
  VGV fechado: ${brl(comercial?.vgv_fechado)}
  Taxa de conversão: ${pct(comercial?.taxa_conversao_pct)}
  Ticket médio: ${brl(comercial?.ticket_medio)}

Operacional:
  Obras ativas: ${qtd(operacional?.obras_ativas)}
  NCs abertas: ${qtd(operacional?.ncs_abertas)}

Suprimentos:
  Taxa de divergência: ${pct(supply?.taxa_divergencia_pct)}
  Lead time médio: ${qtd(supply?.lead_time_medio_dias)} dias

RH:
  Headcount ativo: ${qtd((rh?.headcount as Record<string, unknown> | null)?.ativos)}
  Turnover: ${pct((rh?.periodo as Record<string, unknown> | null)?.turnover_pct)}
  Custo MO no período: ${brl((rh?.custos as Record<string, unknown> | null)?.custo_mes)}`;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    if (!anthropicKey) {
        return json({ error: 'IA não configurada. Configure ANTHROPIC_API_KEY nas variáveis de ambiente do Supabase.' }, 503);
    }

    let corpo: Record<string, unknown>;
    try {
        const lido = await req.json();
        if (!lido || typeof lido !== 'object' || Array.isArray(lido)) return json({ error: 'Corpo inválido.' }, 400);
        corpo = lido as Record<string, unknown>;
    } catch {
        return json({ error: 'Corpo inválido.' }, 400);
    }

    const orgBruta = corpo.organization_id;
    if (orgBruta != null && typeof orgBruta !== 'string') return json({ error: 'organization_id inválido.' }, 400);
    const organizationId = (orgBruta as string | null | undefined) || null;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Quem pode: membro da organização pedida; em "Todas as organizações", membro
    // de pelo menos uma. O nome da empresa vem do banco — nunca do corpo.
    let userId: string;
    let nomeEmpresa: string;
    if (organizationId) {
        const vinculo = await exigirMembro(req, organizationId);
        if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
        userId = vinculo.userId;

        const { data: org, error: errOrg } = await admin
            .from('organizations').select('name').eq('id', organizationId).maybeSingle();
        if (errOrg) console.error('[bi-narrative] nome da organização:', errOrg);
        nomeEmpresa = texto((org as { name?: string | null } | null)?.name ?? '', MAX_NOME_EMPRESA);
    } else {
        const usuario = await exigirUsuario(req);
        if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);
        userId = usuario.userId;

        const { data: membros, error: errMembro } = await admin
            .from('organization_members').select('organization_id').eq('email', usuario.email).limit(1);
        if (errMembro) {
            console.error('[bi-narrative] vínculo:', errMembro);
            return json({ error: 'Falha ao conferir o acesso. Tente de novo.' }, 500);
        }
        if (!membros || membros.length === 0) return json({ error: 'Sem acesso a nenhuma organização.' }, 403);
        nomeEmpresa = NOME_TODAS;
    }

    // Limite diário de uso (por usuário e por organização), contado no banco.
    const { error: errCota } = await admin.rpc('_bi_narrative_cota', { p_user: userId, p_org: organizationId });
    if (errCota) {
        if (errCota.code === '54000') {
            return json({ error: errCota.message || 'Limite diário de narrativas de IA atingido — tente de novo amanhã.' }, 429);
        }
        console.error('[bi-narrative] limite de uso:', errCota);
        return json({ error: 'Falha ao conferir o limite de uso. Tente de novo.' }, 500);
    }

    const kpiText = kpisToText(corpo.kpis, dataDoPeriodo(corpo.dateFrom), dataDoPeriodo(corpo.dateTo));

    const systemPrompt = `Você é um analista financeiro sênior especializado em construtoras e incorporadoras brasileiras.
Sua tarefa é gerar um resumo executivo conciso e perspicaz em português (pt-BR) com base nos dados reais fornecidos.

Regras:
- Máximo 250 palavras.
- Destaque 2–3 pontos fortes e 1–2 pontos de atenção.
- Use linguagem executiva — números reais, percentuais, tendências.
- Não invente dados não presentes. Se um dado for N/D, ignore-o.
- Termine com 1 recomendação estratégica prioritária.
- NÃO use listas com marcadores. Escreva em parágrafos fluidos.`;

    const userPrompt = `Empresa: ${nomeEmpresa}

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
