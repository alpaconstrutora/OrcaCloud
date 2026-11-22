// supabase/functions/_shared/portalAcesso.ts
//
// Garante que a pessoa tem TOKEN ativo no portal — o que o link `?token=` e o
// login por e-mail ("a experiência do link") precisam. Mesma lógica das RPCs
// `*_portal_generate_token`: token existente é reativado e renovado se estava
// revogado ou vencido; sem token, nasce com a organização informada.
//
// Usado por `portal-invite-user` (convite) e `assinatura-interna` (o e-mail de
// "documento para assinar" leva o link do portal com o token).

export type TabelaDeTokens = 'client_portal_tokens' | 'supplier_portal_tokens' | 'broker_portal_tokens' | 'sindico_portal_tokens';

const PRAZO_DIAS = 90;

/** Devolve o token ativo da pessoa (cria ou renova se preciso). Lança em erro de banco. */
export async function garantirTokenDoPortal(
    // deno-lint-ignore no-explicit-any
    admin: any,
    tabelaDeTokens: TabelaDeTokens,
    colunaDaPessoa: string,
    pessoaId: string,
    organizationId: string,
): Promise<string> {
    const { data: atual, error: erroLeitura } = await admin
        .from(tabelaDeTokens)
        .select('id, token, is_active, expires_at')
        .eq(colunaDaPessoa, pessoaId)
        .maybeSingle();
    if (erroLeitura) throw new Error(`token do portal: ${erroLeitura.message}`);

    const novoPrazo = new Date(Date.now() + PRAZO_DIAS * 24 * 60 * 60 * 1000).toISOString();
    if (atual) {
        const vencido = atual.expires_at && new Date(atual.expires_at) < new Date();
        if (atual.is_active !== false && !vencido) return atual.token as string;
        const token = crypto.randomUUID();
        const { error } = await admin
            .from(tabelaDeTokens)
            .update({ is_active: true, token, expires_at: novoPrazo, last_used_at: null })
            .eq('id', atual.id);
        if (error) throw new Error(`token do portal não renovado: ${error.message}`);
        return token;
    }

    const token = crypto.randomUUID();
    const { error } = await admin
        .from(tabelaDeTokens)
        .insert({ org_id: organizationId, [colunaDaPessoa]: pessoaId, token });
    if (error) throw new Error(`token do portal não criado: ${error.message}`);
    return token;
}
