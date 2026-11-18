/**
 * Regras de entrada da `send-bi-report` — PURAS (sem rede, sem Deno), testadas no
 * Vitest (`__tests__/sendBiReportRelatorio.test.ts`).
 *
 * ─── Quem recebe (decisão do usuário, 18/11/2026: "só membros") ──────────────
 *
 * Achados F11/F55. Antes, o destinatário valia se estivesse em
 * `bi_report_schedules.recipients` — tabela que QUALQUER membro grava. Bastava
 * gravar um endereço de fora num agendamento e mandar o e-mail para ele. Agora a
 * lista que o cliente manda é só um PEDIDO: cada endereço é conferido, na hora
 * do envio, contra os membros da organização que o banco devolve
 * (`_bi_relatorio_destinatarios`: conta de verdade, e-mail confirmado). A lista
 * salva no agendamento virou só preferência de quem recebe.
 */

/** A Resend aceita no máximo 50 destinatários por e-mail. */
export const MAX_DESTINATARIOS = 50;
/** RFC 5321: 254 caracteres; folga para não recusar por pouco. */
const MAX_EMAIL = 320;

export type ResultadoDestinatarios =
    | { ok: true; destinatarios: string[] }
    | { ok: false; status: 400 | 403; erro: string; recusados?: string[] };

export const normalizarEmail = (v: string): string => v.trim().toLowerCase();

/**
 * Confere o pedido de destinatários contra os membros da organização.
 * Tudo ou nada: se um endereço não é membro, nada é enviado e a resposta lista
 * quais foram recusados (o mesmo contrato 403 de antes).
 */
export function conferirDestinatarios(
    pedidos: unknown,
    membros: Iterable<string>,
    max: number = MAX_DESTINATARIOS,
): ResultadoDestinatarios {
    if (!Array.isArray(pedidos)) {
        return { ok: false, status: 400, erro: 'Nenhum destinatário informado.' };
    }
    const unicos: string[] = [];
    for (const p of pedidos) {
        if (typeof p !== 'string' || p.length > MAX_EMAIL) {
            return { ok: false, status: 400, erro: 'Destinatário inválido.' };
        }
        const e = normalizarEmail(p);
        if (e && !unicos.includes(e)) unicos.push(e);
    }
    if (unicos.length === 0) return { ok: false, status: 400, erro: 'Nenhum destinatário informado.' };
    if (unicos.length > max) {
        return { ok: false, status: 400, erro: `No máximo ${max} destinatários por envio.` };
    }

    const permitidos = new Set<string>();
    for (const m of membros) if (typeof m === 'string' && m.trim()) permitidos.add(normalizarEmail(m));

    const recusados = unicos.filter(e => !permitidos.has(e));
    if (recusados.length > 0) {
        return {
            ok: false,
            status: 403,
            erro: 'Só membros da organização, com e-mail confirmado, recebem o relatório.',
            recusados,
        };
    }
    return { ok: true, destinatarios: unicos };
}

/** AAAA-MM-DD que existe no calendário (2026-02-31 não passa); o resto vira null. */
export function dataValida(v: unknown): string | null {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const t = Date.parse(`${v}T00:00:00Z`);
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString().slice(0, 10) === v ? v : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `undefined`/`null`/'' → null (não informado); uuid → ele mesmo; o resto → 'invalido'. */
export function uuidOpcional(v: unknown): string | null | 'invalido' {
    if (v === undefined || v === null || v === '') return null;
    return typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : 'invalido';
}
