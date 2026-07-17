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

// Structured output: a IA devolve exatamente este shape (findings pré-preenchidos).
// Sem minLength/maximum etc — restrições não suportadas por structured outputs.
const OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        registro_imovel: { type: 'string', description: 'Número da matrícula/registro, se identificável' },
        cartorio: { type: 'string', description: 'Cartório/serventia, se identificável' },
        proprietarios_atuais: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nomes dos proprietários atuais conforme o último registro vigente',
        },
        findings: {
            type: 'array',
            description: 'Cada pendência/achado da due diligence extraído da matrícula',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    category: { type: 'string', enum: ['imovel', 'proprietario', 'tecnica', 'ambiental'] },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    criticidade: { type: 'string', enum: ['baixa', 'media', 'alta', 'critica'] },
                    // A IA NUNCA sugere "conforme" — quem aprova é o jurídico.
                    suggested_status: { type: 'string', enum: ['pendente', 'em_analise', 'inconforme'] },
                    impacto: { type: 'string' },
                    source_excerpt: { type: 'string', description: 'Trecho LITERAL da matrícula que originou o achado' },
                    confidence: { type: 'number', description: 'Confiança 0..1 na extração deste item' },
                },
                required: ['category', 'title', 'description', 'criticidade', 'suggested_status', 'impacto', 'source_excerpt', 'confidence'],
            },
        },
    },
    required: ['proprietarios_atuais', 'findings'],
};

const SYSTEM_PROMPT = `Você é um assistente jurídico especializado em análise de matrículas imobiliárias brasileiras para due diligence de aquisição de terrenos.

Sua tarefa é ler a matrícula (registro geral do imóvel) e extrair achados de due diligence. A matrícula é uma sequência cronológica de REGISTROS (R.1, R.2...) e AVERBAÇÕES (Av.1, Av.2...).

REGRAS CRÍTICAS:
- Um ato pode CANCELAR outro. Ex: se "Av.9 — cancelamento da hipoteca do R.6", então a hipoteca do R.6 NÃO está mais ativa — não a reporte como ônus vigente.
- Considere apenas o ESTADO VIGENTE: percorra todos os atos e determine o que continua em vigor.
- Ônus/gravames a procurar: hipoteca, penhora, arresto, indisponibilidade, usufruto, servidão, alienação fiduciária, cláusulas de inalienabilidade/impenhorabilidade, ações reais, promessas de compra e venda não quitadas.
- Divergências: área que não bate entre registros, confrontações inconsistentes, encadeamento dominial com lacuna.
- Cada achado deve trazer no source_excerpt o trecho LITERAL da matrícula (não parafraseie).
- confidence baixo (<0.5) quando o texto estiver ilegível, ambíguo ou você não tiver certeza.
- NUNCA classifique nada como "conforme" — isso é decisão do advogado. Use apenas pendente/em_analise/inconforme.
- Se a imagem/PDF estiver ilegível ou não for uma matrícula, retorne findings vazio e um item em_analise explicando.
- Não invente dados que não estão no documento.`;

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
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

    const { fileBase64, mediaType } = await req.json() as {
        fileBase64: string;
        mediaType: string;
    };

    if (!fileBase64 || !mediaType) return json({ error: 'Arquivo (fileBase64) e mediaType são obrigatórios.' }, 400);

    // PDF vira bloco document; imagem (matrícula escaneada) vira bloco image.
    const isImage = mediaType.startsWith('image/');
    const fileBlock = isImage
        ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
        : { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-opus-4-8',
                max_tokens: 8000,
                system: SYSTEM_PROMPT,
                output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
                messages: [{
                    role: 'user',
                    content: [
                        fileBlock,
                        { type: 'text', text: 'Analise esta matrícula e extraia os achados de due diligence no formato estruturado solicitado.' },
                    ],
                }],
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            return json({ error: `Anthropic API: ${err}` }, 502);
        }

        const data = await res.json() as {
            stop_reason?: string;
            content?: Array<{ type: string; text?: string }>;
        };

        if (data.stop_reason === 'refusal') {
            return json({ error: 'A IA recusou processar este documento.' }, 422);
        }

        const textBlock = data.content?.find(b => b.type === 'text')?.text ?? '';
        let parsed: unknown;
        try {
            parsed = JSON.parse(textBlock);
        } catch {
            return json({ error: 'Resposta da IA não pôde ser interpretada.', raw: textBlock }, 502);
        }

        return json({ result: parsed });
    } catch (err) {
        return json({ error: String(err) }, 500);
    }
});
