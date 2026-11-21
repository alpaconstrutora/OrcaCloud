/**
 * Fase 7.9 (D8) de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md: o investidor vê a versão
 * FIXADA no compartilhamento; o gestor vê quando há versão nova no GED.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/documentService', () => ({ documentService: {} }));
vi.mock('../services/empreendimentoDocumentosService', () => ({ empreendimentoDocumentosService: {} }));

import { documentoDoCompartilhamento, temVersaoNova, type LinhaDoCompartilhamento } from '../services/opportunityDocumentsService';

const v = (n: number) => ({ id: `v${n}`, version_number: n, storage_path: `doc/v${n}.pdf`, tamanho: n * 10, mime_type: 'application/pdf' });
const linha = (fixada: ReturnType<typeof v> | null, ativa: ReturnType<typeof v>): LinhaDoCompartilhamento => ({
    shared_at: '2026-11-21T10:00:00Z',
    versao: fixada,
    document: { id: 'd1', nome: 'Matrícula', descricao: null, categoria: 'juridico', active_version: ativa },
});

describe('documentoDoCompartilhamento', () => {
    it('versão nova no GED: o arquivo continua o da versão fixada e o gestor vê a nova', () => {
        const d = documentoDoCompartilhamento(linha(v(1), v(2)))!;
        expect(d.file_path).toBe('doc/v1.pdf');
        expect(d.version_number).toBe(1);
        expect(d.versao_atual).toBe(2);
        expect(d.versao_atual_id).toBe('v2');
        expect(temVersaoNova(d)).toBe(true);
    });

    it('sem versão fixada (apagada): cai na ativa, como a RPC', () => {
        const d = documentoDoCompartilhamento(linha(null, v(3)))!;
        expect(d.file_path).toBe('doc/v3.pdf');
        expect(temVersaoNova(d)).toBe(false);
    });

    it('documento sem leitura (RLS) some da lista', () => {
        expect(documentoDoCompartilhamento({ shared_at: '', versao: null, document: null })).toBeNull();
    });
});

describe('migration 992000', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/aplicar_20271121992000_dataroom_versao_fixa.sql'), 'utf8')
        .replace(/--.*$/gm, '');
    it('a RPC do investidor lê a versão fixada, e só deste documento', () => {
        expect(sql).toMatch(/ON ver\.id = COALESCE\(sh\.version_id, doc\.active_version_id\)\s+AND ver\.document_id = doc\.id/);
    });
    it('só o investidor fixa versão; a função do gatilho não é chamável', () => {
        expect(sql).toMatch(/CHECK \(version_id IS NULL OR audience = 'investidor'\)/);
        expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_portal_share_versao_do_investidor\(\) FROM PUBLIC, anon, authenticated/);
    });
});
