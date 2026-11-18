// O cache de navegação do Service Worker não pode guardar token de portal
// (`?token=`, `/pedido/<uuid>`): nem na CHAVE, nem na `url` da resposta guardada.
// Código: lib/cacheDeNavegacao.ts, ligado em vite.config.ts (runtimeCaching).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    CACHE_NAVEGACAO, CACHE_NAVEGACAO_LEGADO, chaveDoCacheDeNavegacao, respostaSemUrl,
} from '../lib/cacheDeNavegacao';

const ORIGEM = 'https://orcacloud.vercel.app';
const TOKEN = '6f1c2a9e-5b3d-4e7f-8a1b-2c3d4e5f6a7b';
const chave = (url: string) => chaveDoCacheDeNavegacao({ request: new Request(url) });

/** Como o workbox-build põe a função no sw.js: só o TEXTO dela, sem o módulo em volta. */
function recriadaDoTexto<T extends (...a: never[]) => unknown>(fn: T): T {
    return new Function(`return (${fn.toString()})`)() as T;
}

describe('cache de navegação · chave sem token', () => {
    it('tira a query de toda entrada de portal com ?token=', async () => {
        for (const rota of ['/portal', '/portal-cliente', '/portal-sindico', '/portal-parceiro',
            '/portal-fornecedor', '/portal-corretor', '/portal-investidor', '/celular']) {
            const k = await chave(`${ORIGEM}${rota}?token=${TOKEN}&aba=financeiro#x`);
            expect(k).toBe(`${ORIGEM}${rota}`);
            expect(k).not.toContain(TOKEN);
        }
    });

    it('troca segmento-UUID do caminho (token de compartilhamento) por :id', async () => {
        expect(await chave(`${ORIGEM}/pedido/${TOKEN}`)).toBe(`${ORIGEM}/pedido/:id`);
        expect(await chave(`${ORIGEM}/proposta/${TOKEN.toUpperCase()}/`)).toBe(`${ORIGEM}/proposta/:id/`);
        expect(await chave(`${ORIGEM}/publico/validar-planta/${TOKEN}`)).toBe(`${ORIGEM}/publico/validar-planta/:id`);
    });

    it('mantém o caminho do resto (o HTML é o mesmo; a chave só não carrega credencial)', async () => {
        expect(await chave(`${ORIGEM}/`)).toBe(`${ORIGEM}/`);
        expect(await chave(`${ORIGEM}/?utm_source=pwa`)).toBe(`${ORIGEM}/`);
        expect(await chave(`${ORIGEM}/m/meu-empreendimento`)).toBe(`${ORIGEM}/m/meu-empreendimento`);
        // parece UUID mas não é o segmento inteiro: fica
        expect(await chave(`${ORIGEM}/x/${TOKEN}-copia`)).toBe(`${ORIGEM}/x/${TOKEN}-copia`);
    });
});

describe('cache de navegação · resposta guardada sem url', () => {
    const resposta = (o: Partial<Response> & { corpo?: string }) => ({
        status: 200, statusText: 'OK', type: 'basic', url: `${ORIGEM}/portal-cliente?token=${TOKEN}`,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        body: new Response(o.corpo ?? '<!doctype html><title>Opura</title>').body,
        ...o,
    }) as unknown as Response;

    it('regrava a 200 da própria origem: mesmo corpo e cabeçalhos, sem a url com o token', async () => {
        const r = await respostaSemUrl({ response: resposta({}) });
        expect(r).not.toBeNull();
        expect(r!.url).toBe('');
        expect(r!.status).toBe(200);
        expect(r!.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(await r!.text()).toBe('<!doctype html><title>Opura</title>');
    });

    it('não guarda redirect opaco, erro nem resposta de outra origem', async () => {
        expect(await respostaSemUrl({ response: resposta({ status: 0, type: 'opaqueredirect' }) })).toBeNull();
        expect(await respostaSemUrl({ response: resposta({ status: 500 }) })).toBeNull();
        expect(await respostaSemUrl({ response: resposta({ status: 200, type: 'opaque' }) })).toBeNull();
        expect(await respostaSemUrl({ response: null as unknown as Response })).toBeNull();
    });
});

describe('cache de navegação · cabe no sw.js', () => {
    it('as duas funções rodam recriadas só do próprio texto (o workbox-build as serializa)', async () => {
        const k = recriadaDoTexto(chaveDoCacheDeNavegacao);
        expect(await k({ request: new Request(`${ORIGEM}/pedido/${TOKEN}?token=${TOKEN}`) })).toBe(`${ORIGEM}/pedido/:id`);
        const r = recriadaDoTexto(respostaSemUrl);
        const saida = await r({
            response: Object.assign(new Response('ok', { status: 200 }), {}) as Response,
        });
        // `new Response` é do tipo 'default', não 'basic': não guarda — e não lança.
        expect(saida).toBeNull();
    });

    it('vite.config.ts usa o cache novo com os dois plugins; index.tsx apaga o antigo', () => {
        const vite = readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');
        expect(vite).toMatch(/cacheName:\s*CACHE_NAVEGACAO,/);
        expect(vite).toMatch(/cacheKeyWillBeUsed:\s*chaveDoCacheDeNavegacao/);
        expect(vite).toMatch(/cacheWillUpdate:\s*respostaSemUrl/);
        expect(vite).not.toMatch(/cacheName:\s*'navigation-cache'/);
        const boot = readFileSync(path.join(process.cwd(), 'index.tsx'), 'utf8');
        expect(boot).toMatch(/caches\.delete\(CACHE_NAVEGACAO_LEGADO\)/);
        expect(CACHE_NAVEGACAO).not.toBe(CACHE_NAVEGACAO_LEGADO);
    });
});
