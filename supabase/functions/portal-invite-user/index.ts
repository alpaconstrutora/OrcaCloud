// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { exigirGestor, exigirMembro, exigirUsuario, respostaDeErro } from '../_shared/auth.ts';
import { escapeHtml, urlSegura } from '../_shared/html.ts';

declare const Deno: { env: { get(key: string): string | undefined } };

/**
 * Convite por e-mail para os portais do Cliente, do Fornecedor e do Corretor.
 *
 * Pedido de 16/10/2026 ("faça portais exclusivo também para os demais portais").
 * Plano: docs/planos/2026-10-16-portais-login-exclusivo-convite.md. Molde:
 * `partner-invite-user` (03/10/2026), que continua existindo para o Parceiro.
 *
 * Corpo: { portal: 'cliente' | 'fornecedor' | 'corretor', id: uuid }
 *
 * O que faz:
 *  1. confere que há usuário de verdade (chave anon não basta) e lê o cadastro
 *     com service_role só para descobrir a organização dona;
 *  2. confere que o chamador é MEMBRO dessa organização (`exigirMembro`) — a
 *     mesma regra de quem edita o cadastro (policies de clients/suppliers/
 *     broker_profiles). Cadastro global (organization_id NULL) aceita qualquer
 *     membro de organização que o administre: a org do token vira a do chamador;
 *  3. garante que a pessoa tem TOKEN do portal (mesma lógica das RPCs
 *     `*_portal_generate_token`): o login por e-mail "entrega a experiência do
 *     link", então sem token não há portal. Token revogado (is_active=false) é
 *     reativado — convidar é liberar o acesso;
 *  4. gera o link de "criar senha" com `auth.admin.generateLink` (`invite`; se o
 *     e-mail já tem conta, `recovery`). Os dois caem na rota do portal com
 *     `#type=invite|recovery`, que o app trata abrindo a tela de criar senha;
 *  5. manda o e-mail pelo Resend, na cor do portal;
 *  6. grava `<tabela>.portal_invited_at`.
 *
 * O link nunca volta para o cliente — só vai no e-mail.
 *
 * REGRA #7, pergunta 3: o gate está no código (exigirUsuario + exigirMembro),
 * não só no `verify_jwt`.
 *
 * Síndico (20/10/2026, docs/planos/2026-10-20-portal-do-sindico.md): corpo
 * { portal: 'sindico', id: <empreendimento> } — o convite parte do CONDOMÍNIO,
 * porque é nele que mora o síndico (`sindico_client_id`) e o mandato. Três
 * desvios, só para ele: exige GESTOR (o acesso do síndico vê o prédio inteiro,
 * com contato dos condôminos — mesma régua de `sindico_portal_gerar_token`);
 * confere o mandato pela MESMA regra do banco (`fn_sindico_predios`); e grava o
 * convite em `sindico_portal_tokens.convidado_em`, não em
 * `clients.portal_invited_at` (que é do Portal do Cliente).
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Portal = 'cliente' | 'fornecedor' | 'corretor' | 'sindico';

interface DescricaoDoPortal {
    nome: string;
    rota: string;
    tabela: string;
    tabelaDeTokens: string;
    colunaDaPessoa: string;
    /** Cabeçalho e botão do e-mail (cor do cartão do portal). */
    cor: string;
    corLink: string;
    papel: string;
}

const PORTAIS: Record<Portal, DescricaoDoPortal> = {
    cliente: {
        nome: 'Portal do Cliente', rota: '/portal-cliente', tabela: 'clients',
        tabelaDeTokens: 'client_portal_tokens', colunaDaPessoa: 'client_id',
        cor: '#059669', corLink: '#047857', papel: 'cliente',
    },
    fornecedor: {
        nome: 'Portal do Fornecedor', rota: '/portal-fornecedor', tabela: 'suppliers',
        tabelaDeTokens: 'supplier_portal_tokens', colunaDaPessoa: 'supplier_id',
        cor: '#d97706', corLink: '#b45309', papel: 'fornecedor',
    },
    corretor: {
        nome: 'Portal do Corretor', rota: '/portal-corretor', tabela: 'broker_profiles',
        tabelaDeTokens: 'broker_portal_tokens', colunaDaPessoa: 'broker_id',
        cor: '#4f46e5', corLink: '#4338ca', papel: 'corretor',
    },
    sindico: {
        nome: 'Portal do Síndico', rota: '/portal-sindico', tabela: 'clients',
        tabelaDeTokens: 'sindico_portal_tokens', colunaDaPessoa: 'client_id',
        cor: '#0284c7', corLink: '#0369a1', papel: 'síndico',
    },
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
    // Usuário de verdade ANTES de olhar o banco: com a chave anon (pública) não se
    // descobre nem se um cadastro existe.
    const usuario = await exigirUsuario(req);
    if (!usuario.ok) return respostaDeErro(usuario, corsHeaders);

    let portal: Portal | undefined;
    let id: string | undefined;
    try {
        ({ portal, id } = await req.json());
    } catch {
        return json({ error: 'Corpo inválido.' }, 400);
    }
    if (!portal || !(portal in PORTAIS)) return json({ error: 'portal deve ser cliente, fornecedor, corretor ou sindico.' }, 400);
    if (!id || !UUID.test(id)) return json({ error: 'id é obrigatório.' }, 400);
    const d = PORTAIS[portal];

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Síndico: o `id` é do condomínio; dele saem a pessoa e a organização.
    let idDaPessoa = id;
    let orgDoCondominio: string | null = null;
    if (portal === 'sindico') {
        const { data: emp } = await admin.from('empreendimentos')
            .select('id, organization_id, sindico_client_id').eq('id', id).maybeSingle();
        if (!emp) return json({ error: 'Condomínio não encontrado.' }, 404);
        const gestor = await exigirGestor(req, emp.organization_id);
        if (!gestor.ok) return respostaDeErro(gestor, corsHeaders);
        if (!emp.sindico_client_id) return json({ error: 'Defina o síndico na Ficha do condomínio.' }, 400);
        const { data: predios, error: erroPredios } = await admin.rpc('fn_sindico_predios', { p_client_id: emp.sindico_client_id });
        if (erroPredios) { console.error('[portal-invite-user] fn_sindico_predios', erroPredios.message); return json({ error: 'Não foi possível conferir o mandato.' }, 500); }
        const vigente = (predios ?? []).some((p: unknown) => (typeof p === 'string' ? p : (p as { fn_sindico_predios?: string })?.fn_sindico_predios) === emp.id);
        if (!vigente) return json({ error: 'O mandato do síndico não está vigente (confira as datas na Ficha).' }, 400);
        idDaPessoa = emp.sindico_client_id;
        orgDoCondominio = emp.organization_id;
    }

    // Cadastro. Lido com service_role só para descobrir a organização dona; quem
    // decide se o chamador pode agir é exigirMembro (no síndico, exigirGestor acima).
    const colunas = portal === 'corretor'
        ? 'id, email, name, organization_id, is_active'
        : 'id, email, name, organization_id';
    const { data: cad } = await admin.from(d.tabela).select(colunas).eq('id', idDaPessoa).maybeSingle();
    if (!cad) return json({ error: `${d.nome}: cadastro não encontrado.` }, 404);

    // Cadastro com organização: o chamador tem de ser membro DELA. Cadastro
    // global: qualquer membro de organização pode convidar, e a org do token é a
    // dele (mesma regra de `supplier_portal_generate_token` para fornecedor global).
    const vinculo = await exigirMembro(req, orgDoCondominio ?? cad.organization_id ?? null);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);
    const organizationId: string | null = orgDoCondominio ?? cad.organization_id ?? (vinculo as { organizationId?: string }).organizationId ?? null;
    if (!organizationId) {
        return json({ error: 'Não foi possível determinar a organização do convite.' }, 400);
    }
    if (portal === 'corretor' && cad.is_active === false) return json({ error: 'O corretor está inativo.' }, 400);

    const email = String(cad.email || '').trim().toLowerCase();
    if (!email) return json({ error: 'O cadastro não tem e-mail. Preencha o e-mail antes de convidar.' }, 400);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return json({ error: 'Envio de e-mail não configurado (RESEND_API_KEY).' }, 500);
    const fromEmail = Deno.env.get('REPORT_FROM_EMAIL') ?? 'notificacoes@opura.com.br';
    const frontendUrl = (Deno.env.get('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    if (!frontendUrl) return json({ error: 'FRONTEND_URL não configurada.' }, 500);
    const portalUrl = `${frontendUrl}${d.rota}`;

    // Garante o token do portal (o login por e-mail abre a casca do link). Token
    // existente: reativa e renova; sem token: cria com a organização do convite.
    const { data: tokenAtual } = await admin
        .from(d.tabelaDeTokens)
        .select('id, is_active, expires_at')
        .eq(d.colunaDaPessoa, cad.id)
        .maybeSingle();
    const novoPrazo = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    if (tokenAtual) {
        const vencido = tokenAtual.expires_at && new Date(tokenAtual.expires_at) < new Date();
        if (tokenAtual.is_active === false || vencido) {
            const { error: tokErr } = await admin
                .from(d.tabelaDeTokens)
                .update({ is_active: true, token: crypto.randomUUID(), expires_at: novoPrazo, last_used_at: null })
                .eq('id', tokenAtual.id);
            if (tokErr) { console.error('[portal-invite-user] token não renovado', tokErr.message); return json({ error: 'Não foi possível liberar o acesso ao portal.' }, 500); }
        }
    } else {
        const { error: tokErr } = await admin
            .from(d.tabelaDeTokens)
            .insert({ org_id: organizationId, [d.colunaDaPessoa]: cad.id, token: crypto.randomUUID() });
        if (tokErr) { console.error('[portal-invite-user] token não criado', tokErr.message); return json({ error: 'Não foi possível liberar o acesso ao portal.' }, 500); }
    }

    // Conta nova → convite; já existe → redefinição de senha. Nenhum dos dois
    // manda e-mail pelo Auth: generateLink só devolve o link.
    let kind: 'invite' | 'recovery' = 'invite';
    let gerado = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: portalUrl, data: { name: cad.name } },
    });
    if (gerado.error && /already|registered|exists/i.test(gerado.error.message || '')) {
        kind = 'recovery';
        gerado = await admin.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: portalUrl },
        });
    }
    const actionLink: string | undefined = gerado.data?.properties?.action_link;
    if (gerado.error || !actionLink) {
        console.error('[portal-invite-user] generateLink falhou', portal, kind, gerado.error?.message);
        return json({ error: 'Não foi possível gerar o link de acesso.' }, 500);
    }

    const { data: org } = await admin.from('organizations').select('name').eq('id', organizationId).maybeSingle();
    const orgName = org?.name || 'a construtora';
    const botao = kind === 'invite' ? 'Criar minha senha' : 'Definir nova senha';
    const subject = `Acesso ao ${d.nome} — ${orgName}`;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:${d.cor};padding:28px 32px;">
              <p style="margin:0;color:rgba(255,255,255,.8);font-size:12px;font-weight:700;letter-spacing:1px;">${escapeHtml(d.nome)}</p>
              <p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;">${escapeHtml(orgName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;color:#111827;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">Olá${cad.name ? `, ${escapeHtml(cad.name)}` : ''}.</p>
              <p style="margin:0 0 16px;">
                ${kind === 'invite'
                    ? `Você foi convidado(a) para acessar o ${escapeHtml(d.nome)} de <strong>${escapeHtml(orgName)}</strong> como ${escapeHtml(d.papel)}.`
                    : `Recebemos um pedido para você acessar o ${escapeHtml(d.nome)} de <strong>${escapeHtml(orgName)}</strong>. Como seu e-mail já tem cadastro, defina uma nova senha.`}
              </p>
              <p style="margin:0 0 24px;">Seu login é o e-mail <strong>${escapeHtml(email)}</strong>.</p>
              <p style="margin:0 0 28px;">
                <a href="${urlSegura(actionLink)}" style="display:inline-block;background:${d.cor};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;">${escapeHtml(botao)}</a>
              </p>
              <p style="margin:0 0 8px;color:#4b5563;font-size:14px;">Depois de criar a senha, entre sempre por:</p>
              <p style="margin:0 0 24px;font-size:14px;"><a href="${urlSegura(portalUrl)}" style="color:${d.corLink};">${escapeHtml(portalUrl)}</a></p>
              <p style="margin:0;color:#9ca3af;font-size:12px;">Se você não esperava este convite, ignore este e-mail.</p>
            </td>
          </tr>
          <tr><td style="padding:16px 32px 28px;"></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({ from: fromEmail, to: [email], subject, html }),
    });
    if (!sendRes.ok) {
        const err = await sendRes.text();
        console.error('[portal-invite-user] Resend recusou', sendRes.status, err.slice(0, 300));
        return json({ error: 'O provedor de e-mail recusou o envio.' }, 502);
    }

    const invitedAt = new Date().toISOString();
    const { error: updErr } = portal === 'sindico'
        ? await admin.from('sindico_portal_tokens').update({ convidado_em: invitedAt }).eq('client_id', cad.id)
        : await admin.from(d.tabela).update({ portal_invited_at: invitedAt }).eq('id', cad.id);
    if (updErr) console.error('[portal-invite-user] portal_invited_at não gravado', updErr.message);

    console.log('[portal-invite-user] enviado', { portal, id: cad.id, kind, por: vinculo.email });
    return json({ ok: true, kind, invited_at: invitedAt, invited_at_saved: !updErr });
});
