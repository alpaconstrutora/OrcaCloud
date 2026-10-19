/**
 * documentTemplateService.create a partir do arquivo de outro modelo (Duplicar, 19/10/2026).
 *
 * A cópia ganha o PRÓPRIO arquivo no bucket (storage.copy para um caminho novo), em vez
 * de apontar para o `file_path` do original: limpar o arquivo de um nunca quebra o outro.
 *
 * Plano: docs/planos/2026-10-19-modelos-documento-duplicar.md
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const copy = vi.fn();
const upload = vi.fn();
const insert = vi.fn();

vi.mock('../lib/supabase', () => ({
    supabase: {
        storage: { from: () => ({ copy: (...a: unknown[]) => copy(...a), upload: (...a: unknown[]) => upload(...a) }) },
        from: () => ({
            insert: (row: unknown) => {
                insert(row);
                return { select: () => ({ single: () => Promise.resolve({ data: { id: 'novo', ...(row as object) }, error: null }) }) };
            },
        }),
    },
}));

import { documentTemplateService } from '../services/documentTemplateService';

const PAYLOAD = { name: 'Contrato (cópia)', detected_tokens: ['001'], token_map: { '001': { source: 'fixed' as const, fixed: 'x' } } };

describe('documentTemplateService.create — origem do arquivo', () => {
    beforeEach(() => {
        copy.mockReset().mockResolvedValue({ data: {}, error: null });
        upload.mockReset().mockResolvedValue({ data: {}, error: null });
        insert.mockReset();
    });

    it('com { fromPath }: copia para um caminho NOVO da org e grava o nome original', async () => {
        await documentTemplateService.create('org-1', { fromPath: 'org-1/111_contrato v3.docx', fileName: 'contrato v3.docx' }, PAYLOAD);

        expect(upload).not.toHaveBeenCalled();
        expect(copy).toHaveBeenCalledTimes(1);
        const [de, para] = copy.mock.calls[0];
        expect(de).toBe('org-1/111_contrato v3.docx');
        expect(para).toMatch(/^org-1\/\d+_contrato_v3\.docx$/);
        expect(para).not.toBe(de);
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            organization_id: 'org-1', file_path: para, file_name: 'contrato v3.docx', token_map: PAYLOAD.token_map,
        }));
    });

    it('com File: continua subindo o arquivo (sem copiar)', async () => {
        await documentTemplateService.create('org-1', new File(['x'], 'novo.docx'), PAYLOAD);
        expect(copy).not.toHaveBeenCalled();
        expect(upload).toHaveBeenCalledTimes(1);
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ file_name: 'novo.docx' }));
    });

    it('cópia que falha no bucket não cria o registro', async () => {
        copy.mockResolvedValue({ data: null, error: new Error('Object not found') });
        await expect(documentTemplateService.create('org-1', { fromPath: 'x', fileName: 'x.docx' }, PAYLOAD)).rejects.toThrow('Object not found');
        expect(insert).not.toHaveBeenCalled();
    });
});
