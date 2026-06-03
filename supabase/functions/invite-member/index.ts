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

const ALLOWED_ROLES = ['admin', 'owner'];

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    try {
        const { email, name, organizationId, role = 'member', resend = false } = await req.json();

        if (!email || !organizationId) {
            return json({ error: 'email e organizationId são obrigatórios' }, 400);
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        // Verify requesting user via their JWT
        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user?.email) {
            return json({ error: 'Token inválido' }, 401);
        }

        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        // Verify caller has admin or owner role in this org
        const { data: callerMember } = await adminClient
            .from('organization_members')
            .select('role')
            .eq('organization_id', organizationId)
            .eq('email', user.email.toLowerCase())
            .maybeSingle();

        if (!callerMember || !ALLOWED_ROLES.includes(callerMember.role)) {
            return json({ error: 'Somente administradores ou proprietários podem convidar membros' }, 403);
        }

        const frontendUrl = Deno.env.get('FRONTEND_URL') ?? '';
        const inviteOptions = {
            data: { full_name: name, invited_org_id: organizationId, invited_role: role },
            redirectTo: frontendUrl ? `${frontendUrl}/?org=${organizationId}` : undefined,
        };

        const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);

        if (inviteError) {
            const msg = inviteError.message.toLowerCase();

            if (msg.includes('already') || msg.includes('registered')) {
                if (resend) {
                    // Find the unconfirmed user and delete so we can re-send the invite email
                    const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
                    const existing = listData?.users?.find(
                        (u: { email?: string; email_confirmed_at?: string | null }) =>
                            u.email?.toLowerCase() === email.toLowerCase()
                    );

                    if (existing && !existing.email_confirmed_at) {
                        const { error: deleteError } = await adminClient.auth.admin.deleteUser(existing.id);
                        if (deleteError) {
                            return json({ error: 'Não foi possível reenviar: ' + deleteError.message }, 422);
                        }

                        const { error: reinviteError } = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);
                        if (reinviteError) {
                            return json({ error: reinviteError.message }, 422);
                        }

                        return json({ success: true });
                    }

                    // User is already confirmed — they have an active account
                    return json({ success: true, alreadyConfirmed: true });
                }

                // New invite for existing user — treat as success (membership was already added)
                return json({ success: true, alreadyRegistered: true });
            }

            return json({ error: inviteError.message }, 422);
        }

        return json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno';
        console.error('[invite-member]', message);
        return json({ error: message }, 500);
    }
});
