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

const TTL_SEGUNDOS = 60 * 15;   // 15 min, padrão do PLANO_STORAGE_PRIVATIZACAO

// Assina mídia do bucket privado 'academy-media' para o Portal do Colaborador.
// A sessão do portal é anon (só o token do link), e a policy de storage.objects
// exige authenticated — daí a necessidade desta function com service role.
//
// Duas diferenças deliberadas em relação a labor-portal-ged-download:
//
//   1. NUNCA aceita storagePath do cliente. O path é DERIVADO no servidor a
//      partir de lessonId / materialId / certificateId. Se o corpo trouxer um
//      storagePath, ele é simplesmente ignorado — não há caminho de código
//      que o leia.
//   2. O recorte vem do TOKEN (portal_tokens), não de um employeeId cru
//      passado pelo cliente. Passar employeeId seria enumerável.
//
// Além disso confirma que existe matrícula ativa daquele colaborador na versão
// que contém o recurso pedido, antes de assinar qualquer coisa.
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    let body: { token?: string; lessonId?: string; materialId?: string; certificateId?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Corpo inválido' }, 400);
    }

    const { token, lessonId, materialId, certificateId } = body;

    if (!token) return json({ error: 'token é obrigatório' }, 400);
    if (!lessonId && !materialId && !certificateId) {
        return json({ error: 'Informe lessonId, materialId ou certificateId' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── 1. Token → colaborador ──────────────────────────────────────────
    const { data: tok, error: tokError } = await admin
        .from('portal_tokens')
        .select('employee_id, org_id, expires_at, is_active')
        .eq('token', token)
        .maybeSingle();

    if (tokError || !tok || !tok.is_active || new Date(tok.expires_at) <= new Date()) {
        return json({ error: 'Token inválido ou expirado' }, 401);
    }

    const employeeId = tok.employee_id as string;

    // Matrículas vivas do colaborador — a base de toda autorização abaixo.
    const { data: enrollments, error: enrollError } = await admin
        .from('academy_enrollments')
        .select('id, version_id, org_id')
        .eq('employee_id', employeeId)
        .not('status', 'in', '("CANCELADO","EXPIRADO")');

    if (enrollError) {
        console.error('[academy-portal-media] erro ao ler matrículas:', enrollError);
        return json({ error: 'Erro ao validar acesso' }, 500);
    }

    const versoes = new Set((enrollments || []).map((e: any) => e.version_id));
    const matriculaDaVersao = (versionId: string) =>
        (enrollments || []).find((e: any) => e.version_id === versionId);

    let storagePath: string | null = null;
    let enrollmentId: string | null = null;
    let orgId: string | null = null;
    let lessonForLog: string | null = null;

    // ── 2. Deriva o path no servidor ────────────────────────────────────
    if (lessonId) {
        const { data: lesson } = await admin
            .from('academy_lessons')
            .select('id, storage_path, version_id, org_id')
            .eq('id', lessonId)
            .maybeSingle();

        if (!lesson || !lesson.storage_path) return json({ error: 'Aula sem mídia' }, 404);
        if (!versoes.has(lesson.version_id)) {
            return json({ error: 'Sem matrícula ativa neste treinamento' }, 403);
        }
        storagePath   = lesson.storage_path;
        orgId         = lesson.org_id;
        lessonForLog  = lesson.id;
        enrollmentId  = matriculaDaVersao(lesson.version_id)?.id ?? null;

    } else if (materialId) {
        const { data: material } = await admin
            .from('academy_materials')
            .select('id, storage_path, version_id, org_id, lesson_id')
            .eq('id', materialId)
            .maybeSingle();

        if (!material || !material.storage_path) return json({ error: 'Material sem arquivo' }, 404);
        if (!versoes.has(material.version_id)) {
            return json({ error: 'Sem matrícula ativa neste treinamento' }, 403);
        }
        storagePath  = material.storage_path;
        orgId        = material.org_id;
        lessonForLog = material.lesson_id;
        enrollmentId = matriculaDaVersao(material.version_id)?.id ?? null;

    } else if (certificateId) {
        // Certificado: o dono é o próprio colaborador, não depende de matrícula viva.
        const { data: cert } = await admin
            .from('academy_certificates')
            .select('id, storage_path, employee_id, org_id, enrollment_id')
            .eq('id', certificateId)
            .maybeSingle();

        if (!cert || !cert.storage_path) return json({ error: 'Certificado sem PDF' }, 404);
        if (cert.employee_id !== employeeId) {
            return json({ error: 'Certificado de outro colaborador' }, 403);
        }
        storagePath  = cert.storage_path;
        orgId        = cert.org_id;
        enrollmentId = cert.enrollment_id;
    }

    if (!storagePath) return json({ error: 'Recurso não encontrado' }, 404);

    // ── 3. Assina ───────────────────────────────────────────────────────
    const { data: signed, error: signError } = await admin.storage
        .from('academy-media')
        .createSignedUrl(storagePath, TTL_SEGUNDOS);

    if (signError || !signed) {
        console.error('[academy-portal-media] erro ao assinar URL:', signError);
        return json({ error: 'Erro ao gerar link de acesso' }, 500);
    }

    // ── 4. Evidência: toda abertura de mídia entra no log ────────────────
    if (enrollmentId && orgId) {
        const { error: logError } = await admin.from('academy_access_logs').insert({
            org_id: orgId,
            enrollment_id: enrollmentId,
            lesson_id: lessonForLog,
            employee_id: employeeId,
            evento: materialId ? 'DOWNLOAD_MATERIAL' : 'ABERTURA',
            canal: 'PORTAL',
            user_agent: req.headers.get('user-agent'),
        });
        // Falha de log não pode derrubar a aula — só registra.
        if (logError) console.error('[academy-portal-media] falha ao registrar log:', logError);
    }

    return json({ signedUrl: signed.signedUrl, expiresIn: TTL_SEGUNDOS });
});
