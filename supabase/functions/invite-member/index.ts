// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
    'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const { email, name, organizationId, role = 'member' } = await req.json();

        if (!email || !organizationId) {
            return new Response(JSON.stringify({ error: 'email and organizationId are required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        // Verify requesting user via their JWT
        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Use admin client to verify caller is org admin
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        const { data: callerMember } = await adminClient
            .from('organization_members')
            .select('role')
            .eq('organization_id', organizationId)
            .eq('email', user.email!.toLowerCase())
            .single();

        if (!callerMember || callerMember.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Somente administradores podem convidar membros' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const frontendUrl = Deno.env.get('FRONTEND_URL') ?? '';

        // Send Supabase Auth invite email
        const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
            data: { full_name: name, invited_org_id: organizationId, invited_role: role },
            redirectTo: frontendUrl ? `${frontendUrl}/?org=${organizationId}` : undefined,
        });

        if (inviteError) {
            // User already registered — still valid, membership was added on the client side
            if (inviteError.message.toLowerCase().includes('already registered') ||
                inviteError.message.toLowerCase().includes('already been registered')) {
                return new Response(JSON.stringify({ success: true, alreadyRegistered: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            throw inviteError;
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal error';
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
