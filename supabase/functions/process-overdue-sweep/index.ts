// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamadaDeCron } from "../_shared/auth.ts";
// O MESMO motor do navegador e da reconciliation-engine — não uma cópia.
import { criarMotor } from "../../../services/processMotor.ts";

/**
 * Varredura de títulos vencidos → processo (plano 2026-10-16-torre-fluxo-financeiro, item H.4).
 *
 * Chamada só pelo cron do banco (`process-overdue-sweep`, minuto 7 de cada hora, e só
 * quando há candidato). Os candidatos vêm de `fn_titulos_vencidos_para_processo`: título
 * aberto, vencido, de org com modelo ativo para o evento, dentro do valor mínimo e sem
 * processo daquele modelo. Para cada um, `triggerForFinancialTitle` com
 * `payable.overdue` / `receivable.overdue` — o motor abre UMA vez por título
 * (`EVENTOS_UMA_VEZ_POR_TITULO`), então rodar de novo não duplica.
 *
 * Autorização: SÓ `chamadaDeCron` (CRON_SECRET), como a asaas-status-sync — sem caminho
 * de usuário. Publicada com `--no-verify-jwt` (o segredo do cron não é JWT); a prova de
 * fora é sem credencial → 401 (REGRA #7, pergunta 3).
 */

declare const Deno: { env: { get(key: string): string | undefined } };

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Títulos por execução: ~8 consultas cada, dentro do teto de 150 s do pg_net. O estoque escoa de hora em hora. */
const LOTE = 150;

serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!chamadaDeCron(req)) return json({ error: 'Não autorizado' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const motor = criarMotor(admin);
    const inicio = Date.now();

    const { data, error } = await admin.rpc('fn_titulos_vencidos_para_processo', { p_limite: LOTE });
    if (error) return json({ error: error.message, code: error.code ?? null }, 500);

    const candidatos = (data ?? []) as { titulo_id: string; evento: 'payable.overdue' | 'receivable.overdue' }[];
    let processados = 0;
    const erros: string[] = [];
    for (const c of candidatos) {
        try {
            // O motor nunca lança (best-effort); o try é para não perder o lote por um imprevisto.
            await motor.triggerForFinancialTitle(c.titulo_id, c.evento);
            processados++;
        } catch (e) {
            erros.push(`${c.titulo_id}: ${(e as Error)?.message ?? String(e)}`);
        }
    }

    return json({ ok: true, candidatos: candidatos.length, processados, erros: erros.slice(0, 10), duration_ms: Date.now() - inicio });
});
