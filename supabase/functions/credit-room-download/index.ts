// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
// @ts-ignore
import { PDFDocument, StandardFonts, degrees, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { exigirUsuario } from '../_shared/auth.ts';

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

/**
 * Download de documento do Data Room do Credit Room (Portal de Crédito).
 *
 * Irmã de `portal-ged-download`, com uma diferença que é o ponto inteiro: aqui
 * o chamador é um USUÁRIO LOGADO (o analista do banco), não um token de
 * portal. Então:
 *
 *   1. o JWT é validado com a chave anon (`exigirUsuario`) — a chave pública
 *      sozinha não passa, precisa de sessão real (REGRA #7, Pergunta 3: gate
 *      no CÓDIGO, não só no `verify_jwt` do gateway);
 *   2. o vínculo é conferido de novo aqui, com service_role, porque a policy
 *      de storage do bucket `opura-docs` só vale para membro da org — e o
 *      credor não é membro de org nenhuma;
 *   3. o path pedido tem de ser a versão ATIVA de um documento compartilhado
 *      com ESTE room (`opura_document_portal_shares.audience='credor'`) — não
 *      se assina path arbitrário;
 *   4. cada download vira uma linha em `credit_room_access_log`, com IP e
 *      user-agent, que o cliente não tem como gravar (PRD §88);
 *   5. se for PDF, o arquivo sai com MARCA D'ÁGUA de quem baixou (§84) — ver
 *      `marcarDagua` abaixo.
 *
 * Prova depois do deploy (CLAUDE.md, REGRA #7):
 *   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/functions/v1/credit-room-download" -d '{}'
 *   → tem de dar 401.
 */

/**
 * Marca d'água de rastreabilidade — PRD §84.
 *
 * Carimba em cada página quem baixou, quando e de qual operação. Não é
 * proteção criptográfica: é dissuasão e rastreio. Um PDF que vaza carrega no
 * corpo o e-mail de quem o baixou, e isso muda o comportamento de quem recebe
 * um documento sob NDA.
 *
 * ── Três decisões, e o motivo de cada uma ───────────────────────────────────
 *
 * 1. **Só PDF.** Carimbar .xlsx ou .dwg exigiria reescrever formatos
 *    proprietários; um "carimbo" que corrompe a planilha do banco é pior que
 *    não ter. O que não é PDF sai como antes, e a tela diz isso.
 *
 * 2. **Teto de tamanho.** A Edge Function carrega o arquivo inteiro em
 *    memória. Acima do teto, o download volta ao link assinado em vez de
 *    estourar a função — degradar é melhor que falhar.
 *
 * 3. **Qualquer erro cai no link assinado.** O download é o caminho crítico do
 *    portal: um PDF com estrutura incomum não pode impedir o analista de ler o
 *    documento. O log registra que a marca não foi aplicada.
 */
const TETO_MARCA_BYTES = 20 * 1024 * 1024;   // 20 MB

async function marcarDagua(
    bytes: Uint8Array,
    linhas: string[],
): Promise<Uint8Array> {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const fonte = await pdf.embedFont(StandardFonts.Helvetica);
    const texto = linhas.join('   ·   ');

    for (const pagina of pdf.getPages()) {
        const { width, height } = pagina.getSize();

        // Diagonal, no meio da página: some com o recorte da margem, que é
        // como um carimbo de rodapé costuma ser removido.
        const tamanho = Math.max(10, Math.min(22, width / (texto.length * 0.42)));
        pagina.drawText(texto, {
            x: width * 0.08,
            y: height * 0.35,
            size: tamanho,
            font: fonte,
            color: rgb(0.55, 0.55, 0.6),
            opacity: 0.28,
            rotate: degrees(38),
        });

        // E de novo no rodapé, legível: a diagonal dissuade, esta identifica.
        pagina.drawText(texto, {
            x: 24,
            y: 14,
            size: 7,
            font: fonte,
            color: rgb(0.45, 0.45, 0.5),
            opacity: 0.75,
        });
    }

    return await pdf.save();
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return json({ error: usuario.erro }, usuario.status);

    let body: { creditRoomId?: string; storagePath?: string } = {};
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Corpo inválido' }, 400);
    }
    const { creditRoomId, storagePath } = body;
    if (!creditRoomId || !storagePath) {
        return json({ error: 'creditRoomId e storagePath são obrigatórios' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1. O room existe? (403 e não 404: não confirmar existência a quem não tem acesso)
    const { data: room } = await admin
        .from('credit_rooms')
        .select('id, organization_id, code, name')   // code/name entram na marca d'água (§84)
        .eq('id', creditRoomId)
        .maybeSingle();
    if (!room) return json({ error: 'Sem acesso a este Credit Room.' }, 403);

    // ── 2. Quem é o chamador nesta operação: participante ativo, ou interno da org dona.
    const agora = new Date().toISOString();
    const { data: membro } = await admin
        .from('credit_room_members')
        .select('id, side, permissions, revoked_at, expires_at, user_id, email')
        .eq('credit_room_id', creditRoomId)
        .or(`user_id.eq.${usuario.userId},email.eq.${usuario.email}`)
        .is('revoked_at', null)
        .maybeSingle();

    let side: 'TOMADOR' | 'CREDOR' | null = null;
    if (membro && (!membro.expires_at || membro.expires_at > agora)) {
        side = membro.side;
        const perms = (membro.permissions ?? {}) as { download?: boolean };
        if (perms.download === false) {
            return json({ error: 'Seu acesso a este Credit Room não permite download.' }, 403);
        }
    } else {
        const { data: interno } = await admin
            .from('organization_members')
            .select('id')
            .eq('organization_id', room.organization_id)
            .eq('email', usuario.email)
            .maybeSingle();
        if (interno) side = 'TOMADOR';
    }
    if (!side) return json({ error: 'Sem acesso a este Credit Room.' }, 403);

    // ── 3. O path é a versão ativa de um documento compartilhado com este room?
    const { data: shares, error: sharesError } = await admin
        .from('opura_document_portal_shares')
        .select('document_id, document:opura_documents!inner(organization_id, active_version:opura_document_versions!fk_active_version(storage_path))')
        .eq('audience', 'credor')
        .eq('credit_room_id', creditRoomId);

    if (sharesError) {
        console.error('[credit-room-download] erro ao validar vínculo:', sharesError);
        return json({ error: 'Erro ao validar acesso ao documento' }, 500);
    }

    const alvo = (shares || []).find((row: any) =>
        row.document?.active_version?.storage_path === storagePath
        && row.document?.organization_id === room.organization_id,
    );
    if (!alvo) return json({ error: 'Documento não compartilhado com este Credit Room' }, 403);

    // ── 4. Marca d'água (§84) quando for PDF; senão, link assinado.
    const ehPdf = storagePath.toLowerCase().endsWith('.pdf');
    let marcado: Uint8Array | null = null;
    let motivoSemMarca: string | null = ehPdf ? null : 'nao_e_pdf';

    if (ehPdf) {
        try {
            const { data: blob, error: baixaErro } = await admin.storage
                .from('opura-docs')
                .download(storagePath);
            if (baixaErro || !blob) throw baixaErro ?? new Error('download vazio');

            const bruto = new Uint8Array(await blob.arrayBuffer());
            if (bruto.byteLength > TETO_MARCA_BYTES) {
                motivoSemMarca = 'acima_do_teto';
            } else {
                const carimbo = [
                    `${room.code} · ${room.name}`,
                    usuario.email,
                    new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
                    'Documento confidencial · uso restrito à análise desta operação',
                ];
                marcado = await marcarDagua(bruto, carimbo);
            }
        } catch (e) {
            // Não bloqueia o download: o analista precisa ler o documento.
            console.error('[credit-room-download] marca d\'água não aplicada:', e);
            motivoSemMarca = 'erro_ao_marcar';
        }
    }

    let signedUrl: string | null = null;
    if (!marcado) {
        const { data: signed, error: signError } = await admin.storage
            .from('opura-docs')
            .createSignedUrl(storagePath, 60 * 15);
        if (signError || !signed) {
            console.error('[credit-room-download] erro ao assinar URL:', signError);
            return json({ error: 'Erro ao gerar link de acesso' }, 500);
        }
        signedUrl = signed.signedUrl;
    }

    const { error: logError } = await admin.from('credit_room_access_log').insert({
        organization_id: room.organization_id,
        credit_room_id: creditRoomId,
        actor_user_id: usuario.userId,
        actor_email: usuario.email,
        actor_side: side,
        action: 'DOWNLOAD',
        resource_type: 'document',
        resource_id: alvo.document_id,
        metadata: {
            storage_path: storagePath,
            // O log tem de dizer se a cópia que saiu está marcada — sem isso,
            // um PDF sem carimbo aparecendo por aí não teria explicação.
            marca_dagua: marcado != null,
            ...(motivoSemMarca ? { marca_dagua_motivo: motivoSemMarca } : {}),
        },
        ip: req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? null,
        user_agent: req.headers.get('user-agent') ?? null,
    });
    if (logError) console.error('[credit-room-download] log não gravado:', logError);

    if (marcado) {
        const nome = storagePath.split('/').pop() || 'documento.pdf';
        return new Response(marcado, {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${nome}"`,
                // A tela lê isto para poder dizer ao analista que a cópia dele
                // está identificada — e o cabeçalho sobrevive ao proxy do SDK.
                'X-Marca-Dagua': 'aplicada',
            },
        });
    }

    return json({ signedUrl, marcaDagua: false, marcaDaguaMotivo: motivoSemMarca });
});
