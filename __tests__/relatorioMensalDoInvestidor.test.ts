/**
 * Relatório mensal do investidor (Fases A2 e C1 do plano docs/planos/2026-11-21-portal-do-investidor-consolidacao.md):
 * um módulo para o app e para a rotina do dia 1º (Edge Function investor-monthly-reports).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { caminhoDoRelatorioMensal, dadosDoRelatorioMensal, desenharRelatorioMensal, mesDoRelatorio } from '../utils/relatorioMensalDoInvestidor';

const raiz = join(__dirname, '..');

/** Cliente falso do Supabase: cada tabela devolve a lista dada, qualquer filtro encadeado. */
const db = (tabelas: Record<string, unknown[]>) => ({
    from: (t: string) => {
        const q: Record<string, unknown> = {};
        const fim = Promise.resolve({ data: tabelas[t] ?? [], error: null });
        for (const m of ['select', 'eq', 'in', 'not']) q[m] = () => q;
        q.then = fim.then.bind(fim);
        return q;
    },
});

describe('módulo compartilhado', () => {
    it('não importa nada (a Edge Function em Deno importa o arquivo direto)', () => {
        const src = readFileSync(join(raiz, 'utils/relatorioMensalDoInvestidor.ts'), 'utf8');
        expect(src).not.toMatch(/^import /m);
    });

    it('a rotina só aceita a chamada do cron e usa o mesmo módulo do app', () => {
        const fn = readFileSync(join(raiz, 'supabase/functions/investor-monthly-reports/index.ts'), 'utf8');
        expect(fn.indexOf('if (!chamadaDeCron(req))')).toBeGreaterThan(-1);
        expect(fn.indexOf('if (!chamadaDeCron(req))')).toBeLessThan(fn.indexOf('createClient('));
        expect(fn).toMatch(/from "\.\.\/\.\.\/\.\.\/utils\/relatorioMensalDoInvestidor\.ts"/);
        const app = readFileSync(join(raiz, 'services/pdfReportService.ts'), 'utf8');
        expect(app).toMatch(/dadosDoRelatorioMensal\(supabase/);
    });

    it('caminho por investidor, na pasta da org que o download do portal confere', () => {
        expect(caminhoDoRelatorioMensal('org', 'inv', '10/2026', 1)).toBe('reports/org/inv/1_relatorio-mensal-10-2026.pdf');
        expect(mesDoRelatorio(new Date(2026, 10, 1)).monthLabel).toBe('10/2026');
    });
});

describe('dados e desenho', () => {
    it('sem obra nem lançamento do investidor: não há relatório', async () => {
        expect(await dadosDoRelatorioMensal(db({}), 'org', { id: 'inv', name: 'Ana' })).toBeNull();
    });

    it('com obra: desenha sem erro, com o nome do investidor no cabeçalho', async () => {
        const dados = await dadosDoRelatorioMensal(db({
            investor_contributions: [{ project_id: 'o1', investor_id: 'inv', type: 'aporte', amount: 100, status: 'liquidado' }],
            projects: [{ id: 'o1', name: 'Garden', organization_id: 'org', settings: { classification: 'OBRA' } }],
        }), 'org', { id: 'inv', name: 'Ana' });
        expect(dados?.orgProjects.map(p => p.name)).toEqual(['Garden']);
        const textos: string[] = [];
        const doc = new Proxy({ internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } }, lastAutoTable: { finalY: 60 },
            text: (t: string) => { textos.push(String(t)); }, getNumberOfPages: () => 1 } as Record<string, unknown>,
            { get: (o, k) => (k in o ? o[k as string] : () => undefined) });
        desenharRelatorioMensal(doc, () => undefined, dados!);
        expect(textos).toContain('Ana');
    });
});
