/**
 * Regras puras da Edge `celular-diario-midia` (Diário pelo link do celular).
 * A Edge só roteia: validar o pedido e montar o path ficam em `regras.ts`, sem
 * Deno nem import por URL, para o Vitest conseguir importar.
 */
import { describe, it, expect } from 'vitest';
import {
    validarPedido,
    montarPath,
    respostaDoErroDaRpc,
    EXTENSOES_PERMITIDAS,
    MAX_PATHS,
    MAX_TAMANHO_PATH,
} from '../supabase/functions/celular-diario-midia/regras';

const PROJETO = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';

describe('validarPedido — pedido inválido', () => {
    it('recusa corpo que não é objeto', () => {
        for (const corpo of [null, undefined, 'x', 7, [], true]) {
            expect(validarPedido(corpo).ok).toBe(false);
        }
    });

    it('recusa ação desconhecida ou ausente', () => {
        expect(validarPedido({ acao: 'apagar', token: 't' }).ok).toBe(false);
        expect(validarPedido({ token: 't' }).ok).toBe(false);
    });

    it('recusa token vazio, só espaços ou que não é string', () => {
        expect(validarPedido({ acao: 'assinar', token: '', paths: ['a'] }).ok).toBe(false);
        expect(validarPedido({ acao: 'assinar', token: '   ', paths: ['a'] }).ok).toBe(false);
        expect(validarPedido({ acao: 'assinar', token: 42, paths: ['a'] }).ok).toBe(false);
        expect(validarPedido({ acao: 'assinar', paths: ['a'] }).ok).toBe(false);
    });

    it('subir: recusa project_id que não é uuid', () => {
        expect(validarPedido({ acao: 'subir', token: 't', project_id: 'abc', ext: 'jpg' }).ok).toBe(false);
        expect(validarPedido({ acao: 'subir', token: 't', ext: 'jpg' }).ok).toBe(false);
    });

    it('subir: recusa extensão fora da lista, com caixa alta ou com espaço', () => {
        for (const ext of ['html', 'svg', 'exe', 'JPG ', 'JPG', ' jpg', '', 'jpg/../x', 7]) {
            expect(validarPedido({ acao: 'subir', token: 't', project_id: PROJETO, ext }).ok).toBe(false);
        }
    });

    it('assinar/remover: recusa paths vazio, que não é array ou com item vazio/não string', () => {
        expect(validarPedido({ acao: 'assinar', token: 't', paths: [] }).ok).toBe(false);
        expect(validarPedido({ acao: 'assinar', token: 't', paths: 'a' }).ok).toBe(false);
        expect(validarPedido({ acao: 'assinar', token: 't' }).ok).toBe(false);
        expect(validarPedido({ acao: 'assinar', token: 't', paths: ['a', ''] }).ok).toBe(false);
        expect(validarPedido({ acao: 'assinar', token: 't', paths: ['a', 3] }).ok).toBe(false);
        expect(validarPedido({ acao: 'remover', token: 't', project_id: PROJETO, paths: [] }).ok).toBe(false);
    });

    it('assinar/remover: aceita 100 paths e recusa 101', () => {
        const cem = Array.from({ length: MAX_PATHS }, (_, i) => `o/p/${i}.jpg`);
        expect(MAX_PATHS).toBe(100);
        expect(validarPedido({ acao: 'assinar', token: 't', paths: cem }).ok).toBe(true);
        expect(validarPedido({ acao: 'assinar', token: 't', paths: [...cem, 'o/p/x.jpg'] }).ok).toBe(false);
        expect(validarPedido({ acao: 'remover', token: 't', project_id: PROJETO, paths: [...cem, 'o/p/x.jpg'] }).ok).toBe(false);
    });

    it('remover: recusa project_id que não é uuid', () => {
        expect(validarPedido({ acao: 'remover', token: 't', project_id: 'x', paths: ['a'] }).ok).toBe(false);
    });
});

describe('validarPedido — pedido válido', () => {
    it('subir', () => {
        const r = validarPedido({ acao: 'subir', token: 't', project_id: PROJETO, ext: 'jpg' });
        expect(r).toEqual({ ok: true, pedido: { acao: 'subir', token: 't', project_id: PROJETO, ext: 'jpg' } });
    });

    it('a lista de extensões é exatamente a do link: só imagem', () => {
        expect([...EXTENSOES_PERMITIDAS]).toEqual(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);
        for (const ext of ['pdf', 'mp4', 'mov', 'webm', 'doc', 'docx', 'xls', 'xlsx', 'bin']) {
            expect(validarPedido({ acao: 'subir', token: 't', project_id: PROJETO, ext }).ok).toBe(false);
        }
    });

    it('subir e remover guardam o project_id em minúscula (o banco compara com uuid::text)', () => {
        const maiusculo = PROJETO.toUpperCase();
        const s = validarPedido({ acao: 'subir', token: 't', project_id: maiusculo, ext: 'png' });
        expect(s.ok && s.pedido.acao === 'subir' && s.pedido.project_id).toBe(PROJETO);
        const r = validarPedido({ acao: 'remover', token: 't', project_id: maiusculo, paths: ['a'] });
        expect(r.ok && r.pedido.acao === 'remover' && r.pedido.project_id).toBe(PROJETO);
    });

    it('recusa path maior que o teto de tamanho', () => {
        expect(MAX_TAMANHO_PATH).toBe(300);
        const noLimite = 'a'.repeat(MAX_TAMANHO_PATH);
        const acima = 'a'.repeat(MAX_TAMANHO_PATH + 1);
        expect(validarPedido({ acao: 'assinar', token: 't', paths: [noLimite] }).ok).toBe(true);
        expect(validarPedido({ acao: 'assinar', token: 't', paths: [acima] }).ok).toBe(false);
        expect(validarPedido({ acao: 'remover', token: 't', project_id: PROJETO, paths: ['a', acima] }).ok).toBe(false);
    });

    it('subir aceita toda extensão da lista', () => {
        for (const ext of EXTENSOES_PERMITIDAS) {
            expect(validarPedido({ acao: 'subir', token: 't', project_id: PROJETO, ext }).ok).toBe(true);
        }
        expect(EXTENSOES_PERMITIDAS).not.toContain('html');
        expect(EXTENSOES_PERMITIDAS).not.toContain('svg');
    });

    it('assinar não exige project_id', () => {
        const r = validarPedido({ acao: 'assinar', token: 't', paths: ['o/p/a.jpg'] });
        expect(r).toEqual({ ok: true, pedido: { acao: 'assinar', token: 't', paths: ['o/p/a.jpg'] } });
    });

    it('remover', () => {
        const r = validarPedido({ acao: 'remover', token: 't', project_id: PROJETO, paths: ['o/p/a.jpg'] });
        expect(r).toEqual({ ok: true, pedido: { acao: 'remover', token: 't', project_id: PROJETO, paths: ['o/p/a.jpg'] } });
    });

    it('não repassa campos que o pedido não declara', () => {
        const r = validarPedido({ acao: 'assinar', token: 't', paths: ['a'], org: 'outra', extra: 1 });
        expect(r.ok && Object.keys(r.pedido).sort()).toEqual(['acao', 'paths', 'token']);
    });
});

describe('montarPath', () => {
    it('junta org/projeto/uuid.ext', () => {
        expect(montarPath('o', 'p', 'u', 'jpg')).toBe('o/p/u.jpg');
    });
});

describe('respostaDoErroDaRpc — erro da RPC vira resposta HTTP', () => {
    const LIMITE = 'Limite de uso do link atingido — tente de novo na próxima hora.';

    it('54000 (limite de uso do link) → 429 com a mensagem do banco, sem log', () => {
        expect(respostaDoErroDaRpc({ code: '54000', message: LIMITE }))
            .toEqual({ status: 429, corpo: { error: LIMITE }, logar: false });
    });

    it('54000 sem mensagem → 429 com texto padrão', () => {
        expect(respostaDoErroDaRpc({ code: '54000' }).status).toBe(429);
        expect(respostaDoErroDaRpc({ code: '54000', message: '' }).corpo.error).toBe('Limite de uso do link atingido — tente de novo na próxima hora.');
    });

    it('42501 → 403 e 22023 → 400, com a mensagem do banco', () => {
        expect(respostaDoErroDaRpc({ code: '42501', message: 'link inválido ou vencido' }))
            .toEqual({ status: 403, corpo: { error: 'link inválido ou vencido' }, logar: false });
        expect(respostaDoErroDaRpc({ code: '22023', message: 'no máximo 100 arquivos por pedido' }))
            .toEqual({ status: 400, corpo: { error: 'no máximo 100 arquivos por pedido' }, logar: false });
        expect(respostaDoErroDaRpc({ code: '42501' }).corpo.error).toBe('Acesso negado');
        expect(respostaDoErroDaRpc({ code: '22023' }).corpo.error).toBe('Pedido inválido');
    });

    it('qualquer outro erro → 500 genérico (a mensagem do banco não vaza) e logar', () => {
        for (const erro of [{ code: 'XX000', message: 'detalhe interno' }, { message: 'sem código' }, {}]) {
            expect(respostaDoErroDaRpc(erro)).toEqual({ status: 500, corpo: { error: 'Erro ao processar o pedido' }, logar: true });
        }
    });
});
