/**
 * Nomenclatura › Boletos — o documento do boleto é renomeado pela máscara.
 *
 * Casos: a extensão é preservada; renomeia uma vez só (documento_nome_original);
 * sem fornecedor, ou sem máscara salva, não mexe; falha do motor mantém o nome e
 * não lança (a Nomenclatura nunca bloqueia o salvamento); o botão "renomear
 * existentes" exige a máscara salva e conta os que renomeou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    row: null as Record<string, unknown> | null,
    lista: [] as Record<string, unknown>[],
    updates: [] as Array<{ patch: Record<string, unknown>; id: unknown; filtros: string[] }>,
    updateRows: [{ id: 'b1' }] as Array<{ id: string }>,
    temMascara: true,
    gerar: vi.fn(),
}));

vi.mock('../lib/supabase', () => {
    const fromTabela = () => ({
        select: (_cols?: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
                const q: any = {
                    eq: () => q, is: () => q, not: () => q,
                    then: (res: (v: unknown) => unknown) => Promise.resolve({ count: h.lista.length, error: null }).then(res),
                };
                return q;
            }
            const q: any = {
                eq: () => q, is: () => q, not: () => q, order: () => q,
                maybeSingle: () => Promise.resolve({ data: h.row, error: null }),
                range: (de: number) => Promise.resolve({ data: de === 0 ? h.lista : [], error: null }),
                in: () => Promise.resolve({ data: h.lista, error: null }),
            };
            return q;
        },
        update: (patch: Record<string, unknown>) => {
            const reg = { patch, id: undefined as unknown, filtros: [] as string[] };
            h.updates.push(reg);
            const q: any = {
                eq: (c: string, v: unknown) => { if (c === 'id') reg.id = v; else reg.filtros.push(`eq:${c}=${String(v)}`); return q; },
                is: (c: string) => { reg.filtros.push(`is:${c}`); return q; },
                select: () => Promise.resolve({ data: h.updateRows, error: null }),
            };
            return q;
        },
    });
    return { supabase: { from: fromTabela } };
});

vi.mock('../services/documentNumbering', () => ({
    generateDocumentNumber: (...a: unknown[]) => h.gerar(...a),
    hasSavedNumberingConfig: () => Promise.resolve(h.temMascara),
}));

import {
    montarNomeDocumento, extensaoDoNome, renomearDocumentoDoBoleto,
    renomearDocumentoDeNovo, renomearSelecionados,
} from '../services/boletoNomeDocumentoService';

const boleto = (extra: Record<string, unknown> = {}) => ({
    id: 'b1', organization_id: 'org1', documento_nome: 'download (98).pdf',
    documento_nome_original: null, supplier_id: 'f1', project_id: 'p1', cost_center_id: null, ...extra,
});

beforeEach(() => {
    h.row = boleto();
    h.lista = [];
    h.updates = [];
    h.updateRows = [{ id: 'b1' }];
    h.temMascara = true;
    h.gerar.mockReset().mockResolvedValue('BOL-FORN003-TR1-0001');
});

describe('montarNomeDocumento', () => {
    it('mantém a extensão do arquivo enviado', () => {
        expect(montarNomeDocumento('BOL-F1-0001', 'download (98).pdf')).toBe('BOL-F1-0001.pdf');
        expect(montarNomeDocumento('BOL-F1-0001', 'Boleto.PDF')).toBe('BOL-F1-0001.pdf');
        expect(montarNomeDocumento('BOL-F1-0001', 'sem-extensao')).toBe('BOL-F1-0001');
    });
    it('não deixa / nem \\ no nome', () => {
        expect(montarNomeDocumento('BOL/2026\\0001', 'a.pdf')).toBe('BOL-2026-0001.pdf');
    });
    it('extensaoDoNome ignora ponto no meio do nome', () => {
        expect(extensaoDoNome('nota.fiscal.v2.pdf')).toBe('.pdf');
        expect(extensaoDoNome('arquivo')).toBe('');
    });
});

describe('renomearDocumentoDoBoleto', () => {
    it('renomeia pela máscara e guarda o nome original', async () => {
        expect(await renomearDocumentoDoBoleto('b1')).toBe(true);
        expect(h.gerar).toHaveBeenCalledWith('BOLETO', 'org1', { supplierId: 'f1', projectId: 'p1', costCenterId: null });
        expect(h.updates).toHaveLength(1);
        expect(h.updates[0].patch).toEqual({
            documento_nome: 'BOL-FORN003-TR1-0001.pdf',
            documento_nome_original: 'download (98).pdf',
        });
    });
    it('não renomeia de novo um boleto já renomeado (sem gastar sequencial)', async () => {
        h.row = boleto({ documento_nome_original: 'download (98).pdf', documento_nome: 'BOL-X-0001.pdf' });
        expect(await renomearDocumentoDoBoleto('b1')).toBe(false);
        expect(h.gerar).not.toHaveBeenCalled();
        expect(h.updates).toHaveLength(0);
    });
    it('sem fornecedor não renomeia', async () => {
        h.row = boleto({ supplier_id: null });
        expect(await renomearDocumentoDoBoleto('b1')).toBe(false);
        expect(h.gerar).not.toHaveBeenCalled();
    });
    it('AUTOMÁTICO: sem a máscara de Boletos salva não renomeia', async () => {
        h.temMascara = false;
        expect(await renomearDocumentoDoBoleto('b1')).toBe(false);
        expect(h.gerar).not.toHaveBeenCalled();
        expect(h.updates).toHaveLength(0);
    });
    it('falha do motor mantém o nome e NÃO lança', async () => {
        h.gerar.mockRejectedValue(new Error('rpc caiu'));
        await expect(renomearDocumentoDoBoleto('b1')).resolves.toBe(false);
        expect(h.updates).toHaveLength(0);
    });
    it('perdeu a corrida (UPDATE condicional não pegou nenhuma linha) → false', async () => {
        h.updateRows = [];
        expect(await renomearDocumentoDoBoleto('b1')).toBe(false);
    });
});

describe('renomearSelecionados (barra de seleção de Boletos a Pagar)', () => {
    const comData = (id: string, created_at: string, extra: Record<string, unknown> = {}) =>
        ({ ...boleto({ id, ...extra }), created_at });

    it('renomeia só os selecionados, em ordem de criação, e devolve id → nome novo', async () => {
        h.lista = [comData('b2', '2026-10-02'), comData('b1', '2026-10-01')];
        h.gerar.mockResolvedValueOnce('BOL-A-0001').mockResolvedValueOnce('BOL-A-0002');
        const progresso: Array<[number, number]> = [];
        const r = await renomearSelecionados(['b2', 'b1'], (f, t) => progresso.push([f, t]));
        expect(r.renomeados).toEqual({ b1: 'BOL-A-0001.pdf', b2: 'BOL-A-0002.pdf' });
        expect(h.updates.map(u => u.id)).toEqual(['b1', 'b2']);
        expect(progresso.at(-1)).toEqual([2, 2]);
    });
    it('renomeia também os JÁ renomeados (quem marcou pediu), mantendo o nome de upload', async () => {
        h.lista = [comData('b1', '2026-10-01', { documento_nome: 'BOL-X-0001.pdf', documento_nome_original: 'download (98).pdf' })];
        const r = await renomearSelecionados(['b1']);
        expect(Object.keys(r.renomeados)).toEqual(['b1']);
        expect(h.updates[0].patch.documento_nome_original).toBe('download (98).pdf');
    });
    it('funciona sem a máscara salva (usa a padrão)', async () => {
        h.temMascara = false;
        h.lista = [comData('b1', '2026-10-01')];
        const r = await renomearSelecionados(['b1']);
        expect(Object.keys(r.renomeados)).toEqual(['b1']);
    });
    it('sem fornecedor é ignorado e contado; não gasta número', async () => {
        h.lista = [comData('b1', '2026-10-01', { supplier_id: null }), comData('b2', '2026-10-02')];
        const r = await renomearSelecionados(['b1', 'b2']);
        expect(r.semFornecedor).toBe(1);
        expect(Object.keys(r.renomeados)).toEqual(['b2']);
        expect(h.gerar).toHaveBeenCalledTimes(1);
    });
    it('falha num boleto não para os outros e é contada', async () => {
        h.lista = [comData('b1', '2026-10-01'), comData('b2', '2026-10-02')];
        h.gerar.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('BOL-A-0002');
        const r = await renomearSelecionados(['b1', 'b2']);
        expect(r.falhas).toBe(1);
        expect(r.renomeados).toEqual({ b2: 'BOL-A-0002.pdf' });
    });
    it('lista vazia não consulta nada', async () => {
        expect(await renomearSelecionados([])).toEqual({ renomeados: {}, semFornecedor: 0, falhas: 0 });
    });
});

describe('renomearDocumentoDeNovo (ação manual do formulário)', () => {
    const jaRenomeado = () => boleto({ documento_nome: 'BOL-202-0001.pdf', documento_nome_original: 'download (98).pdf' });

    it('renomeia mesmo já renomeado e MANTÉM o nome de upload original', async () => {
        h.row = jaRenomeado();
        h.gerar.mockResolvedValue('BOL-202-0002');
        const r = await renomearDocumentoDeNovo('b1');
        expect(r.ok).toBe(true);
        expect(h.updates).toHaveLength(1);
        expect(h.updates[0].patch).toEqual({
            documento_nome: 'BOL-202-0002.pdf',
            documento_nome_original: 'download (98).pdf',
        });
    });
    it('protege contra edição concorrente: o UPDATE compara o nome atual, não exige original nulo', async () => {
        h.row = jaRenomeado();
        await renomearDocumentoDeNovo('b1');
        expect(h.updates[0].filtros).toContain('eq:documento_nome=BOL-202-0001.pdf');
        expect(h.updates[0].filtros).not.toContain('is:documento_nome_original');
    });
    it('boleto ainda não renomeado: guarda o nome de upload como original', async () => {
        const r = await renomearDocumentoDeNovo('b1');
        expect(r.ok).toBe(true);
        expect(h.updates[0].patch.documento_nome_original).toBe('download (98).pdf');
    });
    it('explica o motivo: sem fornecedor', async () => {
        h.row = boleto({ supplier_id: null });
        expect(await renomearDocumentoDeNovo('b1')).toEqual({ ok: false, motivo: 'sem_fornecedor' });
        expect(h.gerar).not.toHaveBeenCalled();
    });
    it('funciona SEM a máscara salva (ação manual usa a padrão da tela)', async () => {
        h.temMascara = false;
        h.row = jaRenomeado();
        const r = await renomearDocumentoDeNovo('b1');
        expect(r.ok).toBe(true);
        expect(h.gerar).toHaveBeenCalledTimes(1);
    });
    it('explica o motivo: boleto inexistente', async () => {
        h.row = null;
        expect(await renomearDocumentoDeNovo('b1')).toEqual({ ok: false, motivo: 'nao_encontrado' });
    });
    it('perdeu a corrida (nome mudou no meio) → sem_mudanca', async () => {
        h.row = jaRenomeado();
        h.updateRows = [];
        expect(await renomearDocumentoDeNovo('b1')).toEqual({ ok: false, motivo: 'sem_mudanca' });
    });
    it('falha do motor: devolve erro e NÃO lança', async () => {
        h.row = jaRenomeado();
        h.gerar.mockRejectedValue(new Error('rpc caiu'));
        const r = await renomearDocumentoDeNovo('b1');
        expect(r).toMatchObject({ ok: false, motivo: 'erro' });
        expect(h.updates).toHaveLength(0);
    });
});
