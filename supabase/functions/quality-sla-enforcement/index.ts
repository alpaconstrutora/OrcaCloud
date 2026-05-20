// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: { env: { get(key: string): string | undefined } };

// ============================================================
// Edge Function: quality-sla-enforcement
// Executada via cron a cada 6 minutos.
// Responsabilidades:
//   1. Escalona contestações com SLA vencido (CONTESTED → ESCALATED)
//   2. Emite SlaBreached para planos de ação com SLA vencido (sem mudar estado)
// ============================================================

const SYSTEM_ACTOR = {
  actorId:   '00000000-0000-0000-0000-000000000000',
  actorType: 'system',
  name:      'SLA Enforcement',
  roleAtTime: 'automated',
}

serve(async (req: Request) => {
  // Autenticação via service role key (mesmo padrão das outras functions)
  const authHeader  = req.headers.get('Authorization')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!authHeader || authHeader !== `Bearer ${serviceRole}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceRole,
  )

  const results = {
    escalated:  [] as string[],
    slaBreached: [] as string[],
    errors:     [] as string[],
  }

  try {
    // ──────────────────────────────────────────────────────
    // 1. Contestações com SLA vencido → ESCALATED
    // ──────────────────────────────────────────────────────

    const today = new Date().toISOString().split('T')[0]

    const { data: overdueContestations, error: contestError } = await supabase
      .from('condition_contestations')
      .select('condition_id, organization_id')
      .eq('state', 'open')
      .lt('sla_deadline', today)

    if (contestError) {
      results.errors.push(`Fetch contestations error: ${contestError.message}`)
    } else {
      for (const c of overdueContestations ?? []) {
        try {
          // Buscar versão atual da condição para o optimistic lock
          const { data: condition, error: condErr } = await supabase
            .from('construction_conditions')
            .select('version')
            .eq('id', c.condition_id)
            .eq('organization_id', c.organization_id)
            .eq('state', 'CONTESTED')
            .single()

          if (condErr || !condition) continue

          const { error: escErr } = await supabase.rpc('escalate_condition', {
            p_condition_id:    c.condition_id,
            p_organization_id: c.organization_id,
            p_expected_version: condition.version,
            p_escalated_by:    SYSTEM_ACTOR,
          })

          if (escErr) {
            // ConcurrencyConflict: outra operação mudou o estado — skip
            if (escErr.message?.includes('ConcurrencyConflict') ||
                escErr.message?.includes('InvalidTransition')) {
              console.log(`Skip escalation ${c.condition_id}: ${escErr.message}`)
              continue
            }
            results.errors.push(`Escalate ${c.condition_id}: ${escErr.message}`)
          } else {
            results.escalated.push(c.condition_id)
            console.log(`Escalated: ${c.condition_id}`)
          }
        } catch (e: unknown) {
          results.errors.push(`Escalate exception ${c.condition_id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

    // ──────────────────────────────────────────────────────
    // 2. Planos de ação com SLA vencido → SlaBreached (evento de infra)
    //    Não muda o estado da condição — apenas notifica
    // ──────────────────────────────────────────────────────

    const { data: overdueActions, error: actionError } = await supabase
      .from('condition_action_plans')
      .select('id, condition_id, organization_id, sla_deadline, assigned_to')
      .eq('is_current', true)
      .lt('sla_deadline', today)
      .in(
        'condition_id',
        // apenas condições ainda IN_REPAIR
        supabase
          .from('construction_conditions')
          .select('id')
          .eq('state', 'IN_REPAIR')
      )

    if (actionError) {
      results.errors.push(`Fetch action plans error: ${actionError.message}`)
    } else {
      for (const plan of overdueActions ?? []) {
        try {
          // Registrar SlaBreached no audit log como evento de infra
          await supabase.from('condition_events').insert({
            organization_id:   plan.organization_id,
            condition_id:      plan.condition_id,
            event_type:        'SlaBreached',
            payload: {
              planId:      plan.id,
              slaDeadline: plan.sla_deadline,
              assignedTo:  plan.assigned_to,
              breachedAt:  new Date().toISOString(),
            },
            actor_id:          SYSTEM_ACTOR.actorId,
            // Não temos aggregate_version aqui pois não é transição de estado
            // Usamos 0 como convenção para eventos de infra
            aggregate_version: 0,
          })

          results.slaBreached.push(plan.condition_id)
          console.log(`SlaBreached: condition ${plan.condition_id}, plan ${plan.id}`)
        } catch (e: unknown) {
          results.errors.push(`SlaBreached ${plan.condition_id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

  } catch (e: unknown) {
    results.errors.push(`Top-level exception: ${e instanceof Error ? e.message : String(e)}`)
  }

  const status = results.errors.length > 0 ? 207 : 200

  console.log('SLA enforcement complete:', JSON.stringify(results))

  return new Response(JSON.stringify(results), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})
