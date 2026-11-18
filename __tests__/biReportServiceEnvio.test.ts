/**
 * O app não manda mais assunto nem HTML para a send-bi-report (F11/F55): manda
 * QUAL relatório (organização, período, destinatários, id da narrativa guardada).
 * E a recusa do servidor ("não é membro") chega à tela com quem foi recusado, em
 * vez de "Edge Function returned a non-2xx status code".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { FunctionsHttpError } from '@supabase/supabase-js';
import { biReportService } from '../services/biReportService';
import type { BIExecutiveSummary } from '../types/bi';

beforeEach(() => invoke.mockReset());

describe('biReportService · envio do relatório de BI', () => {
    it('sendNow manda só a identificação do relatório — sem subject, sem htmlBody', async () => {
        invoke.mockResolvedValue({ data: { success: true, recipients: ['ana@alpa.com.br'], incluiuResumo: true }, error: null });
        const r = await biReportService.sendNow({
            organizationId: 'org-1',
            recipients: ['ana@alpa.com.br'],
            dateFrom: '2026-01-01',
            dateTo: '2026-12-31',
            narrativeId: 'narr-1',
            scheduleId: 'sch-1',
        });
        expect(invoke).toHaveBeenCalledTimes(1);
        const [nome, opcoes] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
        expect(nome).toBe('send-bi-report');
        expect(opcoes.body).toEqual({
            organizationId: 'org-1',
            recipients: ['ana@alpa.com.br'],
            dateFrom: '2026-01-01',
            dateTo: '2026-12-31',
            narrativeId: 'narr-1',
            scheduleId: 'sch-1',
        });
        expect(r).toEqual({ recipients: ['ana@alpa.com.br'], incluiuResumo: true });
    });

    it('recusa do servidor chega com a mensagem e os recusados', async () => {
        const resposta = new Response(JSON.stringify({
            error: 'Só membros da organização, com e-mail confirmado, recebem o relatório.',
            recusados: ['vitima@gmail.com'],
        }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(resposta) });
        await expect(biReportService.sendNow({
            organizationId: 'org-1', recipients: ['vitima@gmail.com'], dateFrom: '2026-01-01', dateTo: '2026-12-31',
        })).rejects.toThrow('Só membros da organização, com e-mail confirmado, recebem o relatório. Recusados: vitima@gmail.com.');
    });

    it('generateNarrative devolve o texto e o id guardado, com o período pedido', async () => {
        invoke.mockResolvedValue({ data: { narrative: 'Resumo.', narrativeId: 'narr-9' }, error: null });
        const n = await biReportService.generateNarrative({} as BIExecutiveSummary['kpis'], '2026-01-01', '2026-06-30', 'org-1');
        expect(n).toEqual({ id: 'narr-9', texto: 'Resumo.', organizationId: 'org-1', dateFrom: '2026-01-01', dateTo: '2026-06-30' });

        invoke.mockResolvedValue({ data: { narrative: 'Resumo.' }, error: null });
        expect((await biReportService.generateNarrative({} as BIExecutiveSummary['kpis'], '2026-01-01', '2026-06-30')).id).toBeNull();
    });

    it('"Baixar HTML" usa o mesmo molde escapado do e-mail', () => {
        const html = biReportService.generateReportHtml(
            { kpis: { dre: [] }, trend: [], vsTargets: [] } as unknown as BIExecutiveSummary,
            '2026-01-01', '2026-12-31', '<script>x</script>', 'a<b',
        );
        expect(html).not.toContain('<script>x</script>');
        expect(html).toContain('&lt;script&gt;x&lt;/script&gt; — Relatório Executivo BI');
        expect(html).toContain('<div class="narrative">a&lt;b</div>');
    });
});
