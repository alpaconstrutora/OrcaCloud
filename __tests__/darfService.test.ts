/**
 * darfService — plano docs/planos/2026-10-21-agrupar-tributos-em-darf.md.
 * Toda escrita passa pelas RPCs fn_darf_*; aqui se confere o que o cliente faz
 * em volta delas: anexo antes (e removido se a RPC recusar), a frase do banco
 * repassada ao usuário, a categoria dos encargos e a costura de Processos
 * depois da baixa — membro a membro, como `payableService.darBaixa`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
    rpc: vi.fn(),
    upload: vi.fn(async () => ({})),
    remove: vi.fn(async () => undefined),
    paid: vi.fn(async () => undefined),
    settled: vi.fn(async () => undefined),
    categoria: vi.fn(async () => ({ category_id: 'cat-1', category: 'Multa e Juros de Mora' })),
}));
vi.mock('../lib/supabase', () => ({ supabase: { rpc: m.rpc, from: vi.fn() } }));
vi.mock('../services/storageService', () => ({ storageService: { uploadFile: m.upload, remove: m.remove, createSignedUrl: vi.fn() } }));
vi.mock('../services/processService', () => ({ processService: { triggerForTransaction: m.paid, triggerForFinancialTitle: m.settled } }));
vi.mock('../services/financialCategoryResolver', () => ({ resolverCategoriaPorNomes: m.categoria, resolverCategoriaPorId: vi.fn() }));
vi.mock('../services/propertyExpenseService', () => ({ propertyExpenseService: {} }));
vi.mock('../services/financialApprovalService', () => ({ financialApprovalService: {} }));

import { darfService } from '../services/darfService';
import type { Darf } from '../types/financial';

const form = { dueDate: '2026-10-30', multa: 0, juros: 0, codigoBarras: '', numeroDocumento: ' 07.1 ', observacao: '' };

describe('darfService.criar', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sobe o anexo no caminho do DARF e chama a RPC com os dados normalizados', async () => {
        m.rpc.mockResolvedValueOnce({ data: null, error: null });
        const arquivo = new File(['x'], 'Guia DARF.pdf', { type: 'application/pdf' });
        const id = await darfService.criar('org1', ['t1', 't2'], form, arquivo);
        const path = (m.upload.mock.calls[0] as unknown[])[1] as string;
        expect(path).toMatch(new RegExp(`^org1/darf/${id}/`));
        expect(m.rpc).toHaveBeenCalledWith('fn_darf_criar', expect.objectContaining({
            p_darf_id: id, p_tributo_ids: ['t1', 't2'], p_due_date: '2026-10-30', p_multa: 0, p_juros: 0,
            p_dados: expect.objectContaining({ numero_documento: '07.1', codigo_barras: null, documento_path: path, documento_nome: 'Guia DARF.pdf' }),
            p_categoria_encargos: {},
        }));
        expect(m.categoria).not.toHaveBeenCalled();
    });

    it('com multa/juros resolve a categoria "Multa e Juros de Mora"', async () => {
        m.rpc.mockResolvedValueOnce({ data: null, error: null });
        await darfService.criar('org1', ['t1'], { ...form, multa: 10 });
        expect(m.categoria).toHaveBeenCalledWith('org1', ['Multa e Juros de Mora']);
        expect(m.rpc).toHaveBeenCalledWith('fn_darf_criar', expect.objectContaining({
            p_multa: 10, p_categoria_encargos: { category_id: 'cat-1', category: 'Multa e Juros de Mora' },
        }));
    });

    it('RPC recusou: apaga o anexo enviado e repassa a frase do banco', async () => {
        m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Um DARF só junta tributos da mesma competência.' } });
        const arquivo = new File(['x'], 'g.pdf');
        await expect(darfService.criar('org1', ['t1', 't2'], form, arquivo)).rejects.toThrow('Um DARF só junta tributos da mesma competência.');
        expect(m.remove).toHaveBeenCalledTimes(1);
    });

    it('código de barras inválido nem sobe o anexo', async () => {
        await expect(darfService.criar('org1', ['t1', 't2'], { ...form, codigoBarras: '123' }, new File(['x'], 'g.pdf')))
            .rejects.toThrow(/44 dígitos/);
        expect(m.upload).not.toHaveBeenCalled();
        expect(m.rpc).not.toHaveBeenCalled();
    });
});

describe('darfService.darBaixa', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uma RPC para o DARF inteiro e Processos para cada membro', async () => {
        m.rpc.mockResolvedValueOnce({ data: ['a', 'b', 'c'], error: null });
        const ids = await darfService.darBaixa('D1', { paymentDate: '2026-10-21', paymentType: 'PIX' });
        expect(m.rpc).toHaveBeenCalledWith('fn_darf_dar_baixa', { p_darf_id: 'D1', p_payment_date: '2026-10-21', p_payment_type: 'PIX' });
        expect(ids).toEqual(['a', 'b', 'c']);
        expect(m.paid).toHaveBeenCalledTimes(3);
        expect(m.settled).toHaveBeenCalledWith('c', 'payable.settled');
    });

    it('a recusa da alçada chega com o texto do banco, igual', async () => {
        const motivo = 'Aguardando aprovação na alçada — aprove em Financeiro › Aprovações antes de dar baixa. A conciliação com o extrato continua liberada.';
        m.rpc.mockResolvedValueOnce({ data: null, error: { message: motivo } });
        await expect(darfService.darBaixa('D1', { paymentDate: '2026-10-21', paymentType: null })).rejects.toThrow(motivo);
        expect(m.paid).not.toHaveBeenCalled();
    });

    it('falha de Processos não desfaz a baixa (best-effort, como darBaixa)', async () => {
        m.rpc.mockResolvedValueOnce({ data: ['a'], error: null });
        m.paid.mockRejectedValueOnce(new Error('motor fora'));
        await expect(darfService.darBaixa('D1', { paymentDate: '2026-10-21', paymentType: null })).resolves.toEqual(['a']);
    });
});

describe('darfService.editar / desagrupar', () => {
    beforeEach(() => vi.clearAllMocks());
    const darf = { id: 'D1', organization_id: 'org1', documento_path: 'org1/darf/D1/antigo.pdf', documento_nome: 'antigo.pdf' } as Darf;

    it('trocar o anexo sobe o novo (caminho versionado) e apaga o antigo só depois da RPC', async () => {
        m.rpc.mockResolvedValueOnce({ data: null, error: null });
        await darfService.editar(darf, form, { arquivo: new File(['x'], 'antigo.pdf') });
        const novo = (m.upload.mock.calls[0] as unknown[])[1] as string;
        expect(novo).not.toBe(darf.documento_path);
        expect(m.remove).toHaveBeenCalledWith('financeiro-anexos', ['org1/darf/D1/antigo.pdf']);
    });

    it('desagrupar apaga o anexo devolvido pela RPC', async () => {
        m.rpc.mockResolvedValueOnce({ data: { documento_path: 'org1/darf/D1/g.pdf' }, error: null });
        await darfService.desagrupar('D1');
        expect(m.remove).toHaveBeenCalledWith('financeiro-anexos', ['org1/darf/D1/g.pdf']);
    });
});
