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
        const { email, name, organizationId, role = 'member' } = await req.json();

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

        const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
            data: { full_name: name, invited_org_id: organizationId, invited_role: role },
            redirectTo: frontendUrl ? `${frontendUrl}/?org=${organizationId}` : undefined,
        });

        if (inviteError) {
            const msg = inviteError.message.toLowerCase();
            // User already has an account — treat as success (membership was already added)
            if (msg.includes('already') || msg.includes('registered')) {
                return json({ success: true, alreadyRegistered: true });
            }
            // Return the actual Supabase error message instead of throwing
            return json({ error: inviteError.message }, 422);
        }

        return json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno';
        console.error('[invite-member]', message);
        return json({ error: message }, 500);
    }
});
