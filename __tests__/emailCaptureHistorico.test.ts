/**
 * Histórico da captura (16/10/2026): a tela cortava em 300 linhas sem avisar
 * (`.limit(300)` no serviço — guia §6.7). Agora o recorte é por período, pela
 * data do e-mail, e a consulta pagina com `.range()` até a página vir incompleta.
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Chamada = { tabela: string; metodo: string; args: unknown[] };
const chamadas: Chamada[] = [];
const banco = vi.hoisted(() => ({ mensagens: [] as Array<{ id: string }>, contagem: { email_capture_buscas: 0, email_capture_messages: 0 } as Record<string, number> }));

vi.mock('../lib/supabase', () => {
    const consulta = (tabela: string) => {
        let intervalo: [number, number] | null = null;
        let soContagem = false;
        const q: Record<string, unknown> = {};
        for (const metodo of ['order', 'eq', 'or', 'in']) {
            q[metodo] = (...args: unknown[]) => { chamadas.push({ tabela, metodo, args }); return q; };
        }
        q.select = (...args: unknown[]) => {
            chamadas.push({ tabela, metodo: 'select', args });
            soContagem = !!(args[1] as { head?: boolean } | undefined)?.head;
            return q;
        };
        q.range = (a: number, b: number) => { chamadas.push({ tabela, metodo: 'range', args: [a, b] }); intervalo = [a, b]; return q; };
        q.then = (ok: (r: unknown) => unknown) => ok(soContagem
            ? { count: banco.contagem[tabela] ?? 0, error: null }
            : { data: intervalo ? banco.mensagens.slice(intervalo[0], intervalo[1] + 1) : banco.mensagens, error: null });
        return q;
    };
    return { supabase: { from: consulta, rpc: vi.fn(), functions: { invoke: vi.fn() } } };
});

import { emailCaptureService, periodoDoAtalho, filtroDoPeriodo } from '../services/emailCaptureService';

beforeEach(() => {
    chamadas.length = 0;
    banco.mensagens = [];
    banco.contagem = { email_capture_buscas: 0, email_capture_messages: 0 };
});

describe('período do histórico', () => {
    it('atalhos contam dias corridos até hoje; "tudo" não recorta', () => {
        expect(periodoDoAtalho('30', '2026-10-16')).toEqual({ de: '2026-09-17', ate: '2026-10-16' });
        expect(periodoDoAtalho('7', '2026-10-16')).toEqual({ de: '2026-10-10', ate: '2026-10-16' });
        expect(periodoDoAtalho('365', '2026-03-01')).toEqual({ de: '2025-03-02', ate: '2026-03-01' });
        expect(periodoDoAtalho('tudo', '2026-10-16')).toBeNull();
    });

    it('recorta pela data do e-mail e, sem ela, pela data de leitura — até o FIM do último dia', () => {
        const ini = new Date('2026-09-01T00:00:00').toISOString();
        const fim = new Date('2026-10-01T00:00:00').toISOString();
        expect(filtroDoPeriodo({ de: '2026-09-01', ate: '2026-09-30' })).toBe(
            `and(data_email.gte."${ini}",data_email.lt."${fim}"),and(data_email.is.null,created_at.gte."${ini}",created_at.lt."${fim}")`,
        );
    });
});

describe('listarMensagens — sem teto silencioso', () => {
    it('pagina com range até a página vir incompleta', async () => {
        banco.mensagens = Array.from({ length: 2350 }, (_, i) => ({ id: `m${i}` }));
        const r = await emailCaptureService.listarMensagens('o1', { de: '2026-09-01', ate: '2026-09-30' });
        expect(r).toHaveLength(2350);
        expect(chamadas.filter(c => c.metodo === 'range').map(c => c.args)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
        expect(chamadas.some(c => c.metodo === 'or')).toBe(true);
        expect(chamadas.filter(c => c.metodo === 'eq')).toEqual(expect.arrayContaining([{ tabela: 'email_capture_messages', metodo: 'eq', args: ['organization_id', 'o1'] }]));
    });

    it('"Todas" as organizações e período "tudo": sem eq de org nem recorte de data', async () => {
        banco.mensagens = [{ id: 'a' }];
        await emailCaptureService.listarMensagens(null, null);
        expect(chamadas.some(c => c.metodo === 'eq' || c.metodo === 'or')).toBe(false);
    });
});

describe('contadores das abas', () => {
    it('buscas em andamento e falhas sem resolver, por contagem', async () => {
        banco.contagem = { email_capture_buscas: 1, email_capture_messages: 3 };
        expect(await emailCaptureService.resumoDasAbas('o1')).toEqual({ buscasEmAndamento: 1, falhas: 3 });
        expect(chamadas).toEqual(expect.arrayContaining([
            { tabela: 'email_capture_buscas', metodo: 'in', args: ['status', ['pendente', 'em_andamento']] },
            { tabela: 'email_capture_messages', metodo: 'eq', args: ['resultado', 'erro'] },
        ]));
    });
});
