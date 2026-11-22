// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { caminhoSemTravessia } from "../_shared/caminhoSemTravessia.ts"
import { caminhoNoBucket } from "../_shared/caminhoNoBucket.ts"

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

const BUCKET = 'documents';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// Documento do bucket `documents` (PRIVADO desde a aplicar_20271118914100)
// assinado para um PORTAL: minuta e contrato assinado no Portal do Cliente; PDF
// do contrato, versões emitidas e NF da medição no Portal do Parceiro;
// relatórios no Portal do Investidor.
//
// Existe porque nenhum desses acessos é membro da organização — a policy
// `documents_select_org` (aplicar_20271116900800) não os deixa assinar com a
// própria sessão, e o link do portal nem sessão tem.
//
// DUAS conferências, as duas obrigatórias:
//
// 1. O PORTAL MOSTRA esta referência. A autorização não é reescrita aqui — o
//    mesmo desenho da `client-portal-rateio-comprovantes`: a function chama a
//    MESMA RPC que a tela chamou, com a credencial de QUEM CHAMOU (anon + token
//    no link; JWT do parceiro logado ou do gestor na pré-visualização), e só
//    segue se o caminho pedido aparece na resposta:
//      • cliente    → fn_portal_get_contracts(token): contrato assinado e
//                     minutas emitidas;
//      • investidor → fn_investor_portal_get_reports(token): `url` do relatório; e
//                     fn_investor_portal_get_summary(token): comprovante do aporte (`receipt_url`);
//      • parceiro   → partner_portal_get_*(token) / partner_get_*(workspace):
//                     PDF do contrato, versões emitidas e NF das medições.
//
// 2. O ARQUIVO É DAQUELE REGISTRO. A referência é texto gravado em coluna, e
//    quem grava não é só a organização: o parceiro grava
//    `contract_measurements.invoice_url` (a RPC aceita qualquer texto) e, pela
//    RLS de `contract_document_versions`, também versões dos contratos que
//    enxerga (que `_syncMinutaMirror` copia para `contracts.minuta_versions`);
//    e qualquer conta cria a própria organização e o próprio contrato. Sem esta
//    conferência, gravar o caminho de um arquivo de OUTRA empresa num registro
//    seu bastaria para esta function assiná-lo. Então o caminho tem de estar na
//    pasta do registro, no mesmo layout que a policy do bucket usa:
//      • contrato → `contract-minutas|measurements|invoices/<contrato>/…`,
//                   `contract-addendums/<aditivo DESTE contrato>/…` ou
//                   `<org do contrato>/contracts/…` (parecer e PDF assinado antigos);
//      • relatório e comprovante → `reports/<org do registro>/…`.
//
// A service_role entra DEPOIS, para conferir a pasta e assinar, e o caminho
// ainda passa por `caminhoSemTravessia`. Devolve URL assinada de 15 minutos,
// nunca o caminho.

type Candidato =
    | { tipo: 'contrato'; contratoId: string }
    | { tipo: 'relatorio'; orgId: string };

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    let corpo: Record<string, unknown>;
    try {
        corpo = await req.json();
    } catch {
        return json({ error: 'Corpo inválido' }, 400);
    }

    const portal = corpo.portal;
    const token = typeof corpo.token === 'string' && corpo.token ? corpo.token : null;
    const workspaceId = ehUuid(corpo.workspaceId) ? corpo.workspaceId : null;
    const contratoId = ehUuid(corpo.contratoId) ? corpo.contratoId : null;
    const referencia = typeof corpo.referencia === 'string' && corpo.referencia.length <= 2048 ? corpo.referencia : null;

    if (portal !== 'cliente' && portal !== 'parceiro' && portal !== 'investidor') {
        return json({ error: 'Portal inválido' }, 400);
    }
    if (!referencia) return json({ error: 'referencia é obrigatória' }, 400);
    if (!token && !(portal === 'parceiro' && workspaceId)) {
        return json({ error: 'token (ou workspaceId, no parceiro logado) é obrigatório' }, 400);
    }

    const caminho = caminhoNoBucket(referencia, BUCKET);
    if (!caminho) return json({ error: 'Referência de arquivo inválida' }, 400);

    // ── 1. O portal mostra esta referência? ──────────────────────────────────
    // Cliente com a credencial de QUEM CHAMOU — nunca a service_role.
    const comoChamador = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    // Registros que apontam para o caminho pedido.
    const candidatos: Candidato[] = [];
    const considerar = (valor: unknown, candidato: Candidato) => {
        if (caminhoNoBucket(valor, BUCKET) === caminho) candidatos.push(candidato);
    };
    // Contrato: o que o portal mostra — o mesmo critério de utils/contractFileUrl.ts.
    const considerarContrato = (c: Record<string, unknown>) => {
        if (!ehUuid(c?.id)) return;
        const candidato: Candidato = { tipo: 'contrato', contratoId: c.id };
        considerar(c.signed_contract_url, candidato);
        const versoes = Array.isArray(c.minuta_versions) ? c.minuta_versions : [];
        for (const v of versoes as { url?: unknown; emitted?: unknown }[]) {
            if (v && v.emitted !== false) considerar(v.url, candidato);
        }
    };
    const considerarMedicao = (m: Record<string, unknown>) => {
        if (ehUuid(m?.contract_id)) considerar(m.invoice_url, { tipo: 'contrato', contratoId: m.contract_id });
    };
    const lista = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];

    const chamar = async (rpc: string, args: Record<string, unknown>) => {
        const { data, error } = await comoChamador.rpc(rpc, args);
        if (error) {
            console.error(`[portal-documentos-download] erro na RPC ${rpc}:`, error);
            return { erro: true as const, data: null };
        }
        return { erro: false as const, data: data as Record<string, unknown> | null };
    };

    if (portal === 'cliente') {
        const r = await chamar('fn_portal_get_contracts', { p_token: token });
        if (r.erro) return json({ error: 'Erro ao validar o acesso' }, 500);
        if (!r.data?.valid) return json({ error: 'Link inválido ou expirado' }, 403);
        for (const c of lista(r.data.data)) {
            if (contratoId && c.id !== contratoId) continue;
            considerarContrato(c);
        }
    } else if (portal === 'investidor') {
        const r = await chamar('fn_investor_portal_get_reports', { p_token: token });
        if (r.erro) return json({ error: 'Erro ao validar o acesso' }, 500);
        if (!r.data?.valid) return json({ error: 'Link inválido ou expirado' }, 403);
        for (const rel of lista(r.data.reports)) {
            if (ehUuid(rel.organization_id)) considerar(rel.url, { tipo: 'relatorio', orgId: rel.organization_id });
        }
        // Comprovante do aporte (Fase C4 do plano 2026-11-21-portal-do-investidor-consolidacao): o que o RESUMO do
        // link lista para ESTE investidor (receipt_url), na pasta `reports/<org do lançamento>/comprovantes/…`.
        if (candidatos.length === 0) {
            const s = await chamar('fn_investor_portal_get_summary', { p_token: token });
            if (s.erro) return json({ error: 'Erro ao validar o acesso' }, 500);
            if (!s.data?.valid) return json({ error: 'Link inválido ou expirado' }, 403);
            for (const c of lista(s.data.contributions)) {
                if (ehUuid(c.organization_id)) considerar(c.receipt_url, { tipo: 'relatorio', orgId: c.organization_id });
            }
        }
    } else {
        const porToken = !!token;
        const r = porToken
            ? await chamar('partner_portal_get_contracts', { p_token: token })
            : await chamar('partner_get_contracts', { p_workspace_id: workspaceId });
        if (r.erro) return json({ error: 'Erro ao validar o acesso' }, 500);
        if (!r.data?.valid) return json({ error: porToken ? 'Link inválido ou expirado' : 'Sem acesso a este parceiro' }, 403);
        for (const c of lista(r.data.data)) {
            if (contratoId && c.id !== contratoId) continue;
            considerarContrato(c);
        }

        // NF das medições (aba Financeiro e detalhe do contrato).
        if (candidatos.length === 0) {
            const f = porToken
                ? await chamar('partner_portal_get_financials', { p_token: token, p_contract_id: contratoId })
                : await chamar('partner_get_financials', { p_workspace_id: workspaceId, p_contract_id: contratoId });
            if (!f.erro && f.data?.valid) lista(f.data.measurements).forEach(considerarMedicao);
        }

        // Versões emitidas (aba Documentos do detalhe do contrato).
        if (candidatos.length === 0 && contratoId) {
            const d = porToken
                ? await chamar('partner_portal_get_contract_detail', { p_token: token, p_contract_id: contratoId })
                : await chamar('partner_get_contract_detail', { p_workspace_id: workspaceId, p_contract_id: contratoId });
            if (!d.erro && d.data?.valid) {
                for (const doc of lista(d.data.documents)) considerar(doc.url, { tipo: 'contrato', contratoId });
                lista(d.data.measurements).forEach(considerarMedicao);
            }
        }
    }

    if (candidatos.length === 0) {
        return json({ error: 'Documento não disponível para este acesso' }, 403);
    }

    // F53/F54: travessia nunca chega à service_role (caminhoNoBucket já recusa;
    // esta é a guarda que o teste assinadoresSemTravessia exige antes de assinar).
    if (!caminhoSemTravessia(caminho)) {
        return json({ error: 'Caminho de arquivo inválido' }, 400);
    }

    // ── 2. O arquivo é da pasta do registro? ─────────────────────────────────
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const [raiz, segundo] = caminho.split('/');
    const raizMin = (raiz ?? '').toLowerCase();
    const segundoMin = (segundo ?? '').toLowerCase();

    const daPastaDoRegistro = async (c: Candidato): Promise<boolean> => {
        if (c.tipo === 'relatorio') {
            return raizMin === 'reports' && segundoMin === c.orgId.toLowerCase();
        }
        const contrato = c.contratoId.toLowerCase();
        if (raizMin === 'contract-minutas' || raizMin === 'measurements' || raizMin === 'invoices') {
            return segundoMin === contrato;
        }
        if (raizMin === 'contract-addendums') {
            if (!ehUuid(segundo)) return false;
            const { data } = await admin.from('contract_addendums').select('contract_id').eq('id', segundo).maybeSingle();
            return String(data?.contract_id ?? '').toLowerCase() === contrato;
        }
        if (ehUuid(raiz) && segundo === 'contracts') {
            const { data } = await admin.from('contracts').select('organization_id').eq('id', c.contratoId).maybeSingle();
            return String(data?.organization_id ?? '').toLowerCase() === raizMin;
        }
        return false;
    };

    let vinculado = false;
    for (const c of candidatos) {
        if (await daPastaDoRegistro(c)) { vinculado = true; break; }
    }
    if (!vinculado) {
        console.error('[portal-documentos-download] caminho fora da pasta do registro recusado:', portal);
        return json({ error: 'Documento não disponível para este acesso' }, 403);
    }

    const { data: assinado, error: erroAssinatura } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(caminho, 60 * 15);
    if (erroAssinatura || !assinado?.signedUrl) {
        console.error('[portal-documentos-download] erro ao assinar:', erroAssinatura);
        return json({ error: 'Arquivo não encontrado' }, 404);
    }

    return json({ url: assinado.signedUrl });
});
