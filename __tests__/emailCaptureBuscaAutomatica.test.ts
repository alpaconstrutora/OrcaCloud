/**
 * Buscas por período automáticas (13/11/2026, item 1 — decisão do usuário: "Os dois").
 * - Remetente novo: busca sozinho os e-mails dele dos últimos 30 dias.
 * - Varredura diária: migration aplicar_20271113100000 (aqui só conferimos que ela existe
 *   e usa a mesma janela de 30 dias).
 * Plano: docs/planos/2026-11-13-boletos-a-pagar-dez-pedidos.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { emailCaptureService, periodoDosUltimosDias, DIAS_BUSCA_AUTOMATICA } from '../services/emailCaptureService';

describe('busca automática da captura de boletos', () => {
    beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue({ data: { busca: { id: 'b1' } }, error: null }); });

    it('o período é LOCAL (depois das 21h de Brasília ainda é hoje)', () => {
        const noite = new Date(2026, 10, 13, 23, 30);
        expect(periodoDosUltimosDias(30, noite)).toEqual({ de: '2026-10-14', ate: '2026-11-13' });
    });

    it('remetente novo e ativo busca só o e-mail (ou domínio) dele, nos últimos 30 dias', async () => {
        await emailCaptureService.buscarDoRemetenteNovo({ account_id: 'c1', tipo: 'exato', email: 'cobranca@energisa.com.br', dominio: null, ativo: true });
        expect(invoke).toHaveBeenCalledTimes(1);
        const [nome, { body }] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
        expect(nome).toBe('email-capture-sync');
        expect(body).toMatchObject({ modo: 'periodo', accountId: 'c1', remetentes: ['cobranca@energisa.com.br'] });
        expect(body).toMatchObject(periodoDosUltimosDias(DIAS_BUSCA_AUTOMATICA));

        await emailCaptureService.buscarDoRemetenteNovo({ account_id: 'c1', tipo: 'dominio', email: null, dominio: 'vr.com.br', ativo: true });
        expect((invoke.mock.calls[1][1] as { body: Record<string, unknown> }).body.remetentes).toEqual(['vr.com.br']);
    });

    it('remetente inativo não busca nada', async () => {
        expect(await emailCaptureService.buscarDoRemetenteNovo({ account_id: 'c1', tipo: 'exato', email: 'x@y.com', dominio: null, ativo: false })).toBeNull();
        expect(invoke).not.toHaveBeenCalled();
    });

    it('a varredura diária no banco usa a mesma janela, só caixas ativas, e a função é só do agendador', () => {
        const sql = readFileSync(join(__dirname, '../supabase/migrations/aplicar_20271113100000_email_capture_busca_diaria.sql'), 'utf8');
        expect(sql).toContain(`v_hoje - ${DIAS_BUSCA_AUTOMATICA}`);
        expect(sql).toContain("a.status = 'ativa'");
        expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_email_capture_busca_diaria\(\) FROM PUBLIC, anon, authenticated/);
        expect(sql).toContain("cron.schedule(\n    'email-capture-busca-diaria'");
    });
});
