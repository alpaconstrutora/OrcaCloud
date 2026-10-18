// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

import { processarEventoAsaas } from "../_shared/asaasProcessar.ts"
import { confirmarNaAsaas } from "../_shared/asaasConfirmar.ts"
import type { PayloadAsaas } from "../../../utils/asaasEventos.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Compara dois segredos em tempo constante.
 *
 * O `!==` sai no primeiro byte diferente, então o tempo de resposta revela
 * quantos caracteres o palpite acertou — dá para descobrir o token byte a byte.
 * Aqui o laço percorre o comprimento inteiro sempre, acumulando as diferenças
 * em XOR. A diferença de tamanho é tratada antes, e vazá-la é inofensivo.
 */
function comparaSegredo(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diferenca = 0;
    for (let i = 0; i < a.length; i++) {
        diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diferenca === 0;
}

serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
    const webhookToken   = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';

    // Achado C3-04 — a guarda era `if (webhookToken && incoming !== webhookToken)`.
    // Começando por `webhookToken &&`, ela CURTO-CIRCUITAVA quando a variável de
    // ambiente não estava definida (ou estava vazia, ou sumia numa troca de
    // ambiente): a validação inteira era pulada e a function aceitava qualquer
    // POST anônimo. Daí em diante o corpo era processado com service_role —
    // PAYMENT_RECEIVED dá baixa em recebível, BILL_PAID marca boleto como pago.
    // O modo inseguro era o default, e silencioso.
    //
    // Agora falha FECHADO: sem segredo configurado, ninguém passa.
    if (!webhookToken) {
        console.error('[asaas-webhook] ASAAS_WEBHOOK_TOKEN não configurada — recusando tudo.');
        return json({ error: 'Webhook não configurado no servidor.' }, 503);
    }

    const incoming = req.headers.get('asaas-access-token') ?? '';

    // Comparação em tempo constante: comparar segredo com `!==` vaza, pelo tempo
    // de resposta, quantos caracteres iniciais o palpite acertou.
    if (!comparaSegredo(incoming, webhookToken)) {
        // Sem mask() do token esperado: a versão anterior logava prefixo, sufixo
        // e comprimento do segredo a cada requisição — inclusive nas do atacante,
        // que assim recebia o gabarito parcial pelos logs.
        console.warn('[asaas-webhook] token inválido; requisição recusada.');
        return json({ error: 'Invalid webhook token' }, 401);
    }

    const payload = await req.json().catch(() => null) as PayloadAsaas | null;

    if (!payload?.event) {
        return json({ error: 'Payload inválido' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Todo evento autenticado responde 200, inclusive os que não tratamos
    // (TRANSFER_* antes da Fase 3, eventos de conta): a Asaas trata 4xx/5xx
    // como falha, reenvia e, depois de várias, PAUSA a fila de webhooks da
    // conta inteira. Antes, payload sem `payment.id` devolvia 400.
    // O corpo do aviso NÃO é confiável (token vazado = aviso forjado): só o id vale. O
    // objeto é conferido na Asaas e o evento sai do status real (item 5 da segurança,
    // docs/planos/2026-10-18-asaas-seguranca-chaves-pix.md).
    try {
        const c = await confirmarNaAsaas(admin, payload);
        if (c.tipo === 'desconhecido') return json({ ok: true, action: 'ignorado', detail: 'evento_ou_registro_desconhecido' });
        if (c.tipo === 'sem_mudanca') return json({ ok: true, action: 'sem_mudanca', detail: c.status });
        if (c.tipo === 'nao_confirmado') {
            console.error('[asaas-webhook] não confirmado na Asaas:', payload.event, c.motivo);
            // Transitório (Asaas fora do ar): 503 para reenviar. Permanente (chave
            // recusada, registro sem conta): 200 — reenviar não resolve e várias falhas
            // seguidas pausariam a fila de webhooks da conta. A consulta automática cobre.
            return c.transitorio
                ? json({ error: 'Não foi possível confirmar na Asaas agora.' }, 503)
                : json({ ok: true, action: 'nao_confirmado', detail: c.motivo });
        }
        const r = await processarEventoAsaas(admin, c.payload);
        return json({ ok: true, action: r.acao, detail: r.detalhe ?? null, confirmado: c.payload.event });
    } catch (e) {
        // Erro de gravação de verdade: 500 de propósito, para a Asaas reenviar.
        console.error('[asaas-webhook] falha ao processar', payload.event, e);
        return json({ error: 'Falha ao processar evento' }, 500);
    }
});
