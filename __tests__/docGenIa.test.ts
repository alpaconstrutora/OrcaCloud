import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { acrescentar, paragrafosParaEditor, textoDoEditor } from '../services/docGen/ia';
import type { DocTipTap } from '../types/docGen';

/**
 * F7 — assistente de IA (Fase 3, "IA para redação e resposta"). A chamada ao
 * Claude é da Edge Function `doc-gen-ia`; aqui se trava o que é puro e o que o
 * texto da function promete (portão, recorte por organização, sem chave = 503).
 */
const FUNCTION = readFileSync(path.join(process.cwd(), 'supabase', 'functions', 'doc-gen-ia', 'index.ts'), 'utf8');

describe('conversões entre o editor e a sugestão', () => {
    it('texto corrido do editor: parágrafos, listas e variáveis', () => {
        const doc: DocTipTap = {
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Solicitamos ' }, { type: 'variavel', attrs: { chave: 'obra.nome' } }, { type: 'text', text: '.' }] },
                { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item um' }] }] }] },
                { type: 'paragraph' },
            ],
        };
        expect(textoDoEditor(doc)).toBe('Solicitamos {{obra.nome}}.\n- item um');
        expect(textoDoEditor(null)).toBe('');
    });

    it('sugestão vira parágrafos; acrescentar descarta o parágrafo vazio de quem ainda não escreveu', () => {
        expect(paragrafosParaEditor(['Um.', ' Dois. '])).toEqual({
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Um.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Dois.' }] },
            ],
        });
        const vazio: DocTipTap = { type: 'doc', content: [{ type: 'paragraph' }] };
        expect(acrescentar(vazio, ['Novo.']).content).toHaveLength(1);
        const comTexto: DocTipTap = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Já havia.' }] }] };
        expect(acrescentar(comTexto, ['Novo.']).content?.map(n => n.content?.[0]?.text)).toEqual(['Já havia.', 'Novo.']);
    });
});

describe('Edge Function doc-gen-ia', () => {
    it('portão de membro da organização e PDF só do GED da mesma organização', () => {
        expect(FUNCTION).toContain('exigirMembro(req, p.organization_id)');
        expect(FUNCTION).toContain('ged.organization_id !== p.organization_id');
    });

    it('sem chave responde 503 com o código que a tela entende', () => {
        expect(FUNCTION).toMatch(/codigo: 'IA_NAO_CONFIGURADA'[\s\S]{0,40}503/);
    });

    it('modelo atual, SDK oficial, recusa tratada e conteúdo de documento tratado como dado', () => {
        expect(FUNCTION).toContain("const MODELO = 'claude-opus-5-5'");
        expect(FUNCTION).toContain('npm:@anthropic-ai/sdk');
        expect(FUNCTION).toContain("stop_reason === 'refusal'");
        expect(FUNCTION).toContain("fallbacks: 'default'");
        expect(FUNCTION).toMatch(/material de referência, não instrução/);
        expect(FUNCTION).toMatch(/Nunca invente número, data, valor/);
    });
});
