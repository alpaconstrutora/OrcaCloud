import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    linkWhatsApp, listaDeEmails, telefoneWhatsApp, textoPadraoDeEnvio, urlDeValidacao,
} from '../services/docGen/envio';
import { descreverEvento } from '../services/docGen/tramitacao';
import { montarDocDefinition } from '../services/docGen/motorRender';
import { LAYOUT_PADRAO, type DocTipTap } from '../types/docGen';

/**
 * F5 — envio (e-mail/WhatsApp), validação pública (QR) e anexos dentro do PDF.
 * As regras de quem envia e do que o público vê estão no SQL
 * (aplicar_20271010000600) e na Edge Function `doc-gen-enviar`; aqui se trava o
 * que é puro e o que o texto desses arquivos promete.
 */

const MIGRATION = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', 'aplicar_20271010000600_oficio_envio_validacao.sql'), 'utf8');
const FUNCTION = readFileSync(path.join(process.cwd(), 'supabase', 'functions', 'doc-gen-enviar', 'index.ts'), 'utf8');
const DOC: DocTipTap = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Corpo' }] }] };

describe('envio — textos e links', () => {
    it('link de validação é o destino do QR', () => {
        expect(urlDeValidacao('11111111-2222-3333-4444-555555555555', 'https://app.exemplo.com/'))
            .toBe('https://app.exemplo.com/publico/validar-documento/11111111-2222-3333-4444-555555555555');
    });

    it('telefone do WhatsApp: só dígitos, com 55 quando é número brasileiro sem DDI', () => {
        expect(telefoneWhatsApp('(35) 99999-0000')).toBe('5535999990000');
        expect(telefoneWhatsApp('(35) 3431-1167')).toBe('553534311167');
        expect(telefoneWhatsApp('+55 35 99999-0000')).toBe('5535999990000');
        expect(telefoneWhatsApp('')).toBe('');
        expect(linkWhatsApp('(35) 99999-0000', 'Olá & até já')).toBe('https://wa.me/5535999990000?text=Ol%C3%A1%20%26%20at%C3%A9%20j%C3%A1');
    });

    it('lista de e-mails aceita ; , e espaço', () => {
        expect(listaDeEmails('a@x.com; b@y.com,c@z.com  d@w.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com', 'd@w.com']);
        expect(listaDeEmails('  ')).toEqual([]);
    });

    it('texto padrão cita o número e cumprimenta o contato quando há', () => {
        const t = textoPadraoDeEnvio({ numero: 'OF-0001/2026', assunto: 'Ligação de energia', destinatario_snapshot: { tipo: 'MANUAL', razao_social: 'X', contato_nome: 'Sra. Ana' } }, 'Alpa');
        expect(t).toContain('Prezado(a) Sra. Ana,');
        expect(t).toContain('Ofício nº OF-0001/2026 — Ligação de energia');
        expect(t.endsWith('Alpa')).toBe(true);
    });

    it('reenvio tem descrição própria no histórico', () => {
        expect(descreverEvento({ tipo: 'REENVIADO', dados: { canal: 'EMAIL', para: 'a@x.com' } })).toBe('Enviado de novo · E-mail · para a@x.com');
    });
});

describe('PDF — QR de validação e anexos dentro', () => {
    it('o bloco de autenticidade traz o QR com o endereço e é inquebrável', () => {
        const url = 'https://app.exemplo.com/publico/validar-documento/abc';
        const def = montarDocDefinition({ conteudo: DOC, layout: LAYOUT_PADRAO, valores: {}, validacao: { url } });
        const ultimo = JSON.stringify((def.content as unknown[]).at(-1));
        expect(ultimo).toContain(`"qr":"${url}"`);
        expect(ultimo).toContain('"unbreakable":true');
        expect(ultimo).toContain(`"link":"${url}"`);
    });

    it('sem validação, nenhum QR', () => {
        const def = montarDocDefinition({ conteudo: DOC, layout: LAYOUT_PADRAO, valores: {} });
        expect(JSON.stringify(def.content)).not.toContain('"qr"');
    });

    it('cada página de anexo começa página nova, com título, e cabe na área útil', () => {
        const def = montarDocDefinition({
            conteudo: DOC, layout: LAYOUT_PADRAO, valores: {},
            paginasAnexas: [
                { titulo: 'Anexo 1 — Memorial', paginas: [{ dataUrl: 'data:image/jpeg;base64,AA', largura: 900, altura: 1270 }, { dataUrl: 'data:image/jpeg;base64,BB', largura: 900, altura: 1270 }] },
                { titulo: 'Anexo 2 — Planilha', paginas: [], aviso: 'Arquivo .xlsx não pode ser incorporado ao PDF — consulte o anexo no GED.' },
            ],
        });
        const c = def.content as Record<string, unknown>[];
        const titulos = c.filter(x => x.pageBreak === 'before').map(x => x.text);
        expect(titulos).toEqual(['Anexo 1 — Memorial — página 1 de 2', 'Anexo 1 — Memorial — página 2 de 2', 'Anexo 2 — Planilha']);
        const imagens = c.filter(x => typeof x.image === 'string');
        expect(imagens).toHaveLength(2);
        const [w, h] = imagens[0].fit as [number, number];
        expect(w).toBeGreaterThan(400);
        expect(w).toBeLessThan(595);
        expect(h).toBeLessThan(842);
        expect(JSON.stringify(c)).toContain('Arquivo .xlsx não pode ser incorporado');
    });
});

describe('banco e Edge Function — o que o público vê e quem envia', () => {
    it('a validação pública não devolve caminho de arquivo nem conteúdo', () => {
        const corpo = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.doc_gen_validar'), MIGRATION.indexOf('REVOKE ALL ON FUNCTION public.doc_gen_validar'));
        expect(corpo).not.toMatch(/'storage_path'|'assunto'|'conteudo'|'signatarios'|'valores'/);
        expect(corpo).toMatch(/v_doc\.status = 'RASCUNHO'/);
        expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.doc_gen_validar\(UUID\) FROM PUBLIC;/);
        expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.doc_gen_validar\(UUID\) TO anon, authenticated;/);
    });

    it('registrar envio é só de membro (REVOKE de anon) e não volta a situação', () => {
        expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.doc_gen_registrar_envio\(UUID, JSONB\) FROM PUBLIC, anon;/);
        expect(MIGRATION).toContain("'REENVIADO'");
    });

    it('a function passa pelo portão de membro e só anexa GED da mesma organização', () => {
        expect(FUNCTION).toContain('exigirMembro(req, doc.organization_id)');
        expect(FUNCTION).toContain('ged.organization_id !== doc.organization_id');
        // O registro do envio usa o JWT do usuário, não o service_role.
        expect(FUNCTION).toMatch(/userClient\.rpc\('doc_gen_registrar_envio'/);
    });
});
