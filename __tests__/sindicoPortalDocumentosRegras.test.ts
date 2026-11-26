import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import {
    BUCKET,
    MIME_PERMITIDOS,
    TAMANHO_MAXIMO_BYTES,
    MAX_TITULO,
    validarPedido,
    extensaoDe,
    caminhoDoDocumento,
    TETO_DO_CORPO_BYTES,
    recusaPeloTamanhoDoCorpo,
    descricaoDoEnvio,
} from '../supabase/functions/sindico-portal-documentos/regras';
import {
    BUCKET_DOCUMENTOS,
    MIME_PERMITIDOS as MIME_DO_SERVICO,
    TAMANHO_MAXIMO_BYTES as TETO_DO_SERVICO,
} from '../services/condominioComunicacaoService';

// Edge `sindico-portal-documentos` — regras puras (docs/planos/2026-11-25-condominio-
// assembleias-votacoes.md, Fase B, Task B1). A autorização é do banco; aqui, a forma.

const ORG = '3f2a1c4e-9b7d-4e21-8a55-0c1d2e3f4a5b';
const EMP = '11111111-2222-4333-8444-555555555555';
const CLI = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ID = '99999999-8888-4777-8666-555555555555';
const pdf = { name: 'ata-2026-12-10.pdf', type: 'application/pdf', size: 1024 };
const campos = { clientId: CLI, empreendimentoId: EMP, categoria: 'ATA', titulo: ' Ata da AGE — Obras ', visivelPortal: 'true' };

describe('sindico-portal-documentos · mesmo bucket, tipos e teto do app', () => {
    it('espelha condominioComunicacaoService (= o bucket)', () => {
        expect(BUCKET).toBe(BUCKET_DOCUMENTOS);
        expect([...MIME_PERMITIDOS]).toEqual([...MIME_DO_SERVICO]);
        expect(TAMANHO_MAXIMO_BYTES).toBe(TETO_DO_SERVICO);
    });
});

describe('sindico-portal-documentos · validarPedido', () => {
    it('ata do síndico logado: título aparado, visível no portal', () => {
        expect(validarPedido(campos, pdf)).toEqual({
            ok: true,
            pedido: {
                token: null, clientId: CLI, empreendimentoId: EMP, categoria: 'ATA',
                titulo: 'Ata da AGE — Obras', visivelPortal: true, tipo: 'application/pdf',
            },
        });
    });

    it('procuração (OUTRO) fora do portal; categoria em minúsculas aceita', () => {
        const r = validarPedido({ ...campos, categoria: 'outro', visivelPortal: 'false' }, { ...pdf, type: 'image/JPEG' });
        expect(r.ok && r.pedido.categoria).toBe('OUTRO');
        expect(r.ok && r.pedido.visivelPortal).toBe(false);
        expect(r.ok && r.pedido.tipo).toBe('image/jpeg');
    });

    it('pelo link, o clientId não vai ao banco (como o sindico-portal-financeiro)', () => {
        const r = validarPedido({ ...campos, token: 'abc-token' }, pdf);
        expect(r.ok && r.pedido.token).toBe('abc-token');
        expect(r.ok && r.pedido.clientId).toBeNull();
    });

    it('recusa: sem acesso, sem condomínio, clientId inválido', () => {
        expect(validarPedido({ ...campos, clientId: '' }, pdf)).toMatchObject({ ok: false, status: 400 });
        expect(validarPedido({ ...campos, empreendimentoId: '../outro' }, pdf)).toMatchObject({ ok: false, status: 400 });
        expect(validarPedido({ ...campos, clientId: 'não-é-uuid' }, pdf)).toMatchObject({ ok: false, status: 400 });
    });

    it('recusa categoria fora de ATA/OUTRO e título vazio ou longo', () => {
        expect(validarPedido({ ...campos, categoria: 'CONVENCAO' }, pdf)).toMatchObject({ ok: false, status: 400 });
        expect(validarPedido({ ...campos, titulo: '   ' }, pdf)).toMatchObject({ ok: false, status: 400 });
        expect(validarPedido({ ...campos, titulo: 'x'.repeat(MAX_TITULO + 1) }, pdf)).toMatchObject({ ok: false, status: 400 });
    });

    it('recusa sem arquivo (400), tipo fora da lista (415) e acima do teto (413)', () => {
        expect(validarPedido(campos, null)).toMatchObject({ ok: false, status: 400 });
        expect(validarPedido(campos, { ...pdf, size: 0 })).toMatchObject({ ok: false, status: 400 });
        expect(validarPedido(campos, { ...pdf, type: 'text/html' })).toMatchObject({ ok: false, status: 415 });
        expect(validarPedido(campos, { ...pdf, type: '' })).toMatchObject({ ok: false, status: 415 });
        expect(validarPedido(campos, { ...pdf, size: TAMANHO_MAXIMO_BYTES + 1 })).toMatchObject({ ok: false, status: 413 });
    });
});

describe('sindico-portal-documentos · procuração nunca no portal (M1)', () => {
    it('OUTRO com visivelPortal=true: o servidor força false (o pedido não decide)', () => {
        for (const v of ['true', '1', 'on', 'sim']) {
            const r = validarPedido({ ...campos, categoria: 'OUTRO', visivelPortal: v }, pdf);
            expect(r.ok && r.pedido.visivelPortal).toBe(false);
        }
        expect(validarPedido({ ...campos, categoria: 'outro', visivelPortal: 'true' }, pdf))
            .toMatchObject({ ok: true, pedido: { categoria: 'OUTRO', visivelPortal: false } });
    });

    it('a ATA continua obedecendo o pedido', () => {
        const ligada = validarPedido({ ...campos, categoria: 'ATA', visivelPortal: 'true' }, pdf);
        const desligada = validarPedido({ ...campos, categoria: 'ATA', visivelPortal: 'false' }, pdf);
        expect(ligada.ok && ligada.pedido.visivelPortal).toBe(true);
        expect(desligada.ok && desligada.pedido.visivelPortal).toBe(false);
    });
});

describe('sindico-portal-documentos · corpo grande recusado antes de ler (M2)', () => {
    it('teto do corpo = 50 MB do arquivo + 1 MB de folga (campos e fronteiras do multipart)', () => {
        expect(TETO_DO_CORPO_BYTES).toBe(TAMANHO_MAXIMO_BYTES + 1048576);
    });

    it('Content-Length acima do teto → 413 em português', () => {
        const r = recusaPeloTamanhoDoCorpo(String(TETO_DO_CORPO_BYTES + 1));
        expect(r).toEqual({ status: 413, erro: 'O arquivo passa do limite de 50 MB.' });
    });

    it('no teto, abaixo dele, sem Content-Length ou com lixo: segue (o arquivo é conferido depois)', () => {
        expect(recusaPeloTamanhoDoCorpo(String(TETO_DO_CORPO_BYTES))).toBeNull();
        expect(recusaPeloTamanhoDoCorpo('1024')).toBeNull();
        expect(recusaPeloTamanhoDoCorpo(null)).toBeNull();
        expect(recusaPeloTamanhoDoCorpo('')).toBeNull();
        expect(recusaPeloTamanhoDoCorpo('abc')).toBeNull();
    });
});

describe('sindico-portal-documentos · autor do envio na descrição (M3)', () => {
    it('nome do síndico e data/hora de Brasília (22:05 UTC = 19:05 do mesmo dia)', () => {
        expect(descricaoDoEnvio('  Maria Síndica ', new Date('2026-12-10T22:05:00Z')))
            .toBe('Enviado pelo síndico Maria Síndica pelo Portal do Síndico em 10/12/2026 às 19:05 (horário de Brasília)');
    });

    it('fuso: 02:30 UTC do dia 11 ainda é 23:30 do dia 10 em Brasília', () => {
        expect(descricaoDoEnvio('Maria', new Date('2026-12-11T02:30:00Z')))
            .toBe('Enviado pelo síndico Maria pelo Portal do Síndico em 10/12/2026 às 23:30 (horário de Brasília)');
    });

    it('sem nome (cadastro não achado): a frase continua sem buraco', () => {
        expect(descricaoDoEnvio(null, new Date('2026-12-10T22:05:00Z')))
            .toBe('Enviado pelo síndico pelo Portal do Síndico em 10/12/2026 às 19:05 (horário de Brasília)');
        expect(descricaoDoEnvio('   ', new Date('2026-12-10T22:05:00Z')))
            .toBe('Enviado pelo síndico pelo Portal do Síndico em 10/12/2026 às 19:05 (horário de Brasília)');
    });
});

describe('sindico-portal-documentos · caminho no bucket', () => {
    it('{org}/{empreendimento}/{uuid}.{ext}, como uploadDocumento', () => {
        expect(caminhoDoDocumento(ORG, EMP, ID, 'Procuração 101.PDF')).toBe(`${ORG}/${EMP}/${ID}.pdf`);
        expect(caminhoDoDocumento(ORG, EMP, ID, 'sem-extensao')).toBe(`${ORG}/${EMP}/${ID}`);
    });

    it('o nome do arquivo só entra como extensão saneada (sem travessia)', () => {
        expect(extensaoDe('x.p/../df')).toBe('df');
        expect(caminhoDoDocumento(ORG, EMP, ID, '../../outra-org/a.p..df')).toBe(`${ORG}/${EMP}/${ID}.df`);
        expect(() => caminhoDoDocumento('../x', EMP, ID, 'a.pdf')).toThrow();
    });
});

describe('sindico-portal-documentos · o portão está no código (REGRA #7, pergunta 3)', () => {
    const fonte = readFileSync(
        path.join(process.cwd(), 'supabase', 'functions', 'sindico-portal-documentos', 'index.ts'), 'utf8');

    it('exigirUsuario e a RPC de autorização vêm ANTES de qualquer escrita da service_role', () => {
        const usuario = fonte.indexOf('await exigirUsuario(req)');
        const rpc = fonte.indexOf("rpc('sindico_portal_assembleia_autorizar_documento'");
        const admin = fonte.indexOf('createClient(supabaseUrl, serviceRoleKey');
        const upload = fonte.indexOf('.upload(');
        const insert = fonte.indexOf(".from('condominio_documentos').insert(");
        expect(usuario).toBeGreaterThan(0);
        expect(rpc).toBeGreaterThan(usuario);
        expect(admin).toBeGreaterThan(rpc);
        expect(upload).toBeGreaterThan(admin);
        expect(insert).toBeGreaterThan(upload);
    });

    it('o Content-Length é conferido ANTES de ler o formulário (M2)', () => {
        const recusa = fonte.indexOf("recusaPeloTamanhoDoCorpo(req.headers.get('content-length'))");
        expect(recusa).toBeGreaterThan(0);
        expect(fonte.indexOf('await req.formData()')).toBeGreaterThan(recusa);
    });

    it('a linha grava o autor na descrição, com o nome do cadastro do síndico (M3)', () => {
        expect(fonte).toMatch(/\.from\('clients'\)\.select\('name'\)\.eq\('id', auth\.clientId\)/);
        expect(fonte).toMatch(/descricao: descricaoDoEnvio\(/);
    });

    it('a RPC roda com a credencial de quem chamou, e a falha da linha apaga o arquivo', () => {
        expect(fonte).toMatch(/comoChamador = createClient\(supabaseUrl, anonKey, \{\s*global: \{ headers: \{ Authorization: req\.headers\.get\('Authorization'\)/);
        expect(fonte).toMatch(/comoChamador\.rpc\('sindico_portal_assembleia_autorizar_documento'/);
        expect(fonte).toMatch(/\.remove\(\[caminho\]\)/);
    });
});
