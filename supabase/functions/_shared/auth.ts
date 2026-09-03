// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(key: string): string | undefined } };

/**
 * Autorização compartilhada das Edge Functions.
 *
 * ─── O problema que este módulo resolve ──────────────────────────────────────
 *
 * Achados C2-01, C2-02, C2-03 e C3-03 da auditoria de 2026-09-01. O padrão
 * dominante nas functions era:
 *
 *     const { data: { user } } = await userClient.auth.getUser();
 *     if (!user) return json({ error: 'Token inválido' }, 401);
 *     const admin = createClient(url, SERVICE_ROLE_KEY);   // ← ignora a RLS
 *     const { organization_id } = body;                    // ← vem do cliente
 *     ...admin.from('x').eq('organization_id', organization_id)
 *
 * Isso confunde AUTENTICAÇÃO com AUTORIZAÇÃO. Confirma-se que existe um
 * usuário; nunca que aquele usuário pode agir sobre aquela organização. O
 * `.eq()` dá aparência de escopo, mas o escopo é o que o atacante escolheu.
 * E como o cliente é o service_role, a RLS não está lá para servir de rede.
 *
 * Resultado prático: um usuário do tenant A emitia cobrança real no Asaas
 * contra o recebível do tenant B, cancelava cobranças alheias e recebia a
 * segunda via do boleto no próprio e-mail.
 *
 * ─── O padrão correto já existia ─────────────────────────────────────────────
 *
 * `invite-member/index.ts:41-60` era o único ponto do sistema que fazia o ciclo
 * completo — validar o JWT, consultar `organization_members` pela organização E
 * pelo e-mail, e exigir papel. Este módulo é aquele bloco extraído, para que
 * "fazer certo" custe uma linha e deixe de depender de alguém lembrar.
 *
 * Uso:
 *
 *     import { exigirMembro, respostaDeErro } from '../_shared/auth.ts';
 *
 *     const vinculo = await exigirMembro(req, organization_id);
 *     if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
 *     // a partir daqui: vinculo.email, vinculo.papel, vinculo.userId
 */

export interface Vinculo {
    ok: true;
    userId: string;
    email: string;
    /** 'owner' | 'admin' | 'member' | ... — o papel na organização pedida. */
    papel: string;
}

export interface FalhaAuth {
    ok: false;
    status: 401 | 403 | 400;
    erro: string;
}

export type ResultadoAuth = Vinculo | FalhaAuth;

/** Papéis que podem executar operação administrativa da organização. */
export const PAPEIS_GESTORES = ['owner', 'admin'];

function clientes() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    return { supabaseUrl, anonKey, serviceRoleKey };
}

/**
 * Valida o JWT do chamador e confirma que ele é membro de `organizationId`.
 *
 * O JWT é validado com um cliente ANON — de propósito. A chave anon é pública
 * (vai no bundle do frontend), então ela sozinha NÃO satisfaz `getUser()`:
 * é preciso um access token de usuário de verdade. Usar o service_role aqui
 * derrotaria a checagem.
 */
export async function exigirMembro(req: Request, organizationId?: string | null): Promise<ResultadoAuth> {
    if (!organizationId) {
        return { ok: false, status: 400, erro: 'organization_id é obrigatório.' };
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return { ok: false, status: 401, erro: 'Unauthorized' };
    }

    const { supabaseUrl, anonKey, serviceRoleKey } = clientes();

    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user?.email) {
        return { ok: false, status: 401, erro: 'Token inválido' };
    }

    // A consulta do vínculo precisa do service_role: `organization_members` tem
    // RLS, e o objetivo aqui é justamente decidir o que o usuário pode ver.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: membro } = await admin
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('email', user.email.toLowerCase())
        .maybeSingle();

    if (!membro) {
        // 403 e não 404: o usuário existe e está autenticado, só não tem acesso.
        // A mensagem não confirma nem nega que a organização exista.
        return { ok: false, status: 403, erro: 'Sem acesso a esta organização.' };
    }

    return { ok: true, userId: user.id, email: user.email.toLowerCase(), papel: membro.role };
}

/** Como `exigirMembro`, mas só aceita owner/admin. */
export async function exigirGestor(req: Request, organizationId?: string | null): Promise<ResultadoAuth> {
    const vinculo = await exigirMembro(req, organizationId);
    if (!vinculo.ok) return vinculo;

    if (!PAPEIS_GESTORES.includes(vinculo.papel)) {
        return {
            ok: false,
            status: 403,
            erro: 'Somente administradores ou proprietários podem executar esta operação.',
        };
    }
    return vinculo;
}

/**
 * Valida o JWT sem exigir organização, e devolve o e-mail.
 * Para operações que não são de uma organização específica — mas note que
 * "não é de nenhuma organização" quase sempre significa que falta um escopo,
 * não que não exista um. Prefira `exigirMembro` quando houver.
 */
export async function exigirUsuario(req: Request): Promise<ResultadoAuth> {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return { ok: false, status: 401, erro: 'Unauthorized' };

    const { supabaseUrl, anonKey } = clientes();
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user?.email) return { ok: false, status: 401, erro: 'Token inválido' };

    return { ok: true, userId: user.id, email: user.email.toLowerCase(), papel: '' };
}

/**
 * O chamador é gestor de ALGUMA organização? Para operações sobre dado GLOBAL,
 * sem organização dona — o caso do `sinapi-import`, que grava na tabela de
 * preços usada por todos os tenants.
 */
export async function exigirGestorDeQualquerOrg(req: Request): Promise<ResultadoAuth> {
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return usuario;

    const { supabaseUrl, serviceRoleKey } = clientes();
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: membros } = await admin
        .from('organization_members')
        .select('role')
        .eq('email', usuario.email)
        .in('role', PAPEIS_GESTORES)
        .limit(1);

    if (!membros || membros.length === 0) {
        return {
            ok: false,
            status: 403,
            erro: 'Operação restrita a administradores ou proprietários.',
        };
    }
    return { ...usuario, papel: membros[0].role };
}

/** Converte a falha em Response, preservando os headers de CORS da function. */
export function respostaDeErro(falha: FalhaAuth, corsHeaders: Record<string, string>): Response {
    return new Response(JSON.stringify({ error: falha.erro }), {
        status: falha.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

/**
 * A chamada veio do cron do banco (pg_net → esta function)?
 *
 * Compara com `CRON_SECRET`, um segredo dedicado — não com a service_role key.
 * Duas razões, ambas vindas do diagnóstico de 2026-09-02:
 *
 *  1. **Formato.** O projeto migrou para as chaves novas (`sb_secret_…`), que
 *     não são JWT. Isso criou um impasse insolúvel: função com `verify_jwt:
 *     true` exige JWT no gateway, e o gate interno exigia a chave nova. Nenhum
 *     valor único satisfazia os dois. Um segredo próprio não tem formato a
 *     respeitar e encerra o impasse.
 *  2. **Raio de alcance.** A service_role key ignora TODA a RLS. Ela não
 *     precisa trafegar em header a cada minuto para o cron provar quem é.
 *
 * ⚠️ A guarda de comprimento não é zelo excessivo. Sem ela, `CRON_SECRET`
 * ausente faz `esperado` virar `''`, e a comparação passa a aceitar o header
 * literal `"Bearer "` — qualquer um na internet. Esse é exatamente o formato
 * do defeito que deixou a `task-alert-notifier` aberta (gate ausente do bundle
 * publicado, `verify_jwt` desligado): a falha de configuração vira permissão.
 */
export function chamadaDeCron(req: Request): boolean {
    const esperado = Deno.env.get('CRON_SECRET') ?? '';
    if (esperado.length < 32) return false;

    const enviado = req.headers.get('Authorization') ?? '';
    const alvo    = `Bearer ${esperado}`;
    if (enviado.length !== alvo.length) return false;

    // Comparação de tempo constante: sai sempre no mesmo número de passos,
    // independente de onde o primeiro byte diverge.
    let diferenca = 0;
    for (let i = 0; i < alvo.length; i++) {
        diferenca |= enviado.charCodeAt(i) ^ alvo.charCodeAt(i);
    }
    return diferenca === 0;
}
