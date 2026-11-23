/**
 * WhatsApp pelo OpenWA — o núcleo puro do worker da máquina (infra/openwa/worker/nucleo.mjs).
 *
 * O que trava:
 *   1. `requisicaoDeEnvio`: URL do send-text do OpenWA na rede do Compose, `Idempotency-Key`
 *      = `comando_id` (retentativa não duplica), `linkPreview: false`, chave no `X-API-Key`.
 *   2. `resultadoDoEnvio`: o que o worker manda no `reportar` — `ECONNREFUSED` → `recusada`,
 *      abort/timeout → `timeout`, `201 { messageId }` → aceita com o id; erro de rede que
 *      pode ter saído (reset no meio) → sem status e sem erro (a Edge Function marca incerta).
 *   3. `criarCoalescedor`: a campainha e a varredura nunca rodam dois `pegar` ao mesmo
 *      tempo; toque(s) durante um ciclo agendam exatamente UM ciclo a mais.
 *   4. `idDaSessaoPorNome` / `leituraDaSessao` / `podeEnviar`: o OpenWA endereça a sessão
 *      pelo id (UUID), não pelo nome; só pega a fila com a sessão `ready`.
 */
import { describe, expect, it } from 'vitest';
// @ts-ignore — módulo .mjs sem tipos (roda no Node do container, fora do tsc do app)
import * as nucleo from '../infra/openwa/worker/nucleo.mjs';

const {
    requisicaoDeEnvio, resultadoDoEnvio, criarCoalescedor, idDaSessaoPorNome, leituraDaSessao, podeEnviar,
} = nucleo as Record<string, any>;

const ITEM = {
    id: '11111111-2222-4333-8444-555555555555',
    chat_id: '5565999990000@c.us',
    texto: 'Pedido 123 — confira em https://exemplo.com',
    comando_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
};
const SESSAO = '8f3c2b1a-9d4e-4c7a-8b2f-1e6d5a4c3b2a';

describe('requisicaoDeEnvio', () => {
    const req = requisicaoDeEnvio(ITEM, SESSAO, 'owa_k1_chave');

    it('aponta para o send-text da sessão no OpenWA da rede do Compose', () => {
        expect(req.url).toBe(`http://openwa:2785/api/sessions/${SESSAO}/messages/send-text`);
    });

    it('Idempotency-Key = comando_id (retentativa não manda duas vezes)', () => {
        expect(req.headers['Idempotency-Key']).toBe(ITEM.comando_id);
    });

    it('manda a chave no X-API-Key e o corpo como JSON', () => {
        expect(req.headers['X-API-Key']).toBe('owa_k1_chave');
        expect(req.headers['Content-Type']).toBe('application/json');
    });

    it('corpo: chatId, text e linkPreview false — nada além disso (o OpenWA recusa campo a mais)', () => {
        expect(req.corpo).toEqual({ chatId: ITEM.chat_id, text: ITEM.texto, linkPreview: false });
    });

    it('codifica o id da sessão na URL', () => {
        expect(requisicaoDeEnvio(ITEM, 'a/b', 'k').url).toBe('http://openwa:2785/api/sessions/a%2Fb/messages/send-text');
    });

    it('aceita outra base (OPENWA_URL) sem barra dupla', () => {
        expect(requisicaoDeEnvio(ITEM, SESSAO, 'k', 'http://127.0.0.1:2785/').url)
            .toBe(`http://127.0.0.1:2785/api/sessions/${SESSAO}/messages/send-text`);
    });
});

describe('resultadoDoEnvio', () => {
    it('201 { messageId } → aceita com o id', () => {
        expect(resultadoDoEnvio({ status: 201, corpo: { messageId: 'x', timestamp: 1 } }))
            .toEqual({ httpStatus: 201, erro: null, messageId: 'x' });
    });

    it('201 sem corpo legível → status sem messageId', () => {
        expect(resultadoDoEnvio({ status: 201, corpo: null })).toEqual({ httpStatus: 201, erro: null, messageId: null });
    });

    it('4xx/5xx → só o status (quem decide é a Edge Function)', () => {
        expect(resultadoDoEnvio({ status: 429, corpo: { code: 'SEND_PACING_LIMITED' } }))
            .toEqual({ httpStatus: 429, erro: null, messageId: null });
        expect(resultadoDoEnvio({ status: 400, corpo: { messageId: 'nao-vale' } }))
            .toEqual({ httpStatus: 400, erro: null, messageId: null });
    });

    it('ECONNREFUSED (no erro ou na causa do fetch) → recusada', () => {
        const direto = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        const doFetch = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
        for (const erro of [direto, doFetch]) {
            expect(resultadoDoEnvio({ erro })).toEqual({ httpStatus: null, erro: 'recusada', messageId: null });
        }
    });

    it('nome do OpenWA que não resolve (ENOTFOUND) → recusada: o pedido não chegou a sair', () => {
        const erro = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
        expect(resultadoDoEnvio({ erro })).toEqual({ httpStatus: null, erro: 'recusada', messageId: null });
    });

    it('AbortError e TimeoutError → timeout', () => {
        const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
        const tempo = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
        expect(resultadoDoEnvio({ erro: abort })).toEqual({ httpStatus: null, erro: 'timeout', messageId: null });
        expect(resultadoDoEnvio({ erro: tempo })).toEqual({ httpStatus: null, erro: 'timeout', messageId: null });
    });

    it('conexão caída no meio (ECONNRESET) → sem status nem erro: pode ter saído', () => {
        const erro = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
        expect(resultadoDoEnvio({ erro })).toEqual({ httpStatus: null, erro: null, messageId: null });
    });
});

describe('criarCoalescedor', () => {
    function adiado() {
        let soltar!: () => void;
        const p = new Promise<void>((r) => { soltar = r; });
        return { p, soltar };
    }

    it('um toque sem ciclo rodando → um ciclo', async () => {
        let n = 0;
        const c = criarCoalescedor(async () => { n++; });
        await c.tocar();
        expect(n).toBe(1);
    });

    it('vários toques durante um ciclo → exatamente UM ciclo a mais, nunca dois ao mesmo tempo', async () => {
        const portoes = [adiado(), adiado(), adiado()];
        let n = 0;
        let simultaneos = 0;
        let maxSimultaneos = 0;
        const c = criarCoalescedor(async () => {
            const meu = portoes[n++];
            simultaneos++;
            maxSimultaneos = Math.max(maxSimultaneos, simultaneos);
            await meu.p;
            simultaneos--;
        });
        const fim = c.tocar();
        c.tocar();
        c.tocar();
        c.tocar();
        expect(n).toBe(1);
        portoes[0].soltar();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
        expect(n).toBe(2);
        portoes[1].soltar();
        await fim;
        expect(n).toBe(2);
        expect(maxSimultaneos).toBe(1);
        expect(c.rodando()).toBe(false);
    });

    it('ciclo que pede "de novo" (fila cheia) roda outra vez sem toque', async () => {
        let n = 0;
        const c = criarCoalescedor(async () => { n++; return n < 3 ? 'de_novo' : undefined; });
        await c.tocar();
        expect(n).toBe(3);
    });

    it('ciclo que falha não trava o coalescedor', async () => {
        let n = 0;
        const erros: unknown[] = [];
        const c = criarCoalescedor(async () => { n++; if (n === 1) throw new Error('falhou'); }, (e: unknown) => erros.push(e));
        await c.tocar();
        await c.tocar();
        expect(n).toBe(2);
        expect(erros).toHaveLength(1);
        expect(c.rodando()).toBe(false);
    });

    it('a promessa do toque durante um ciclo termina junto com o ciclo extra', async () => {
        const g = adiado();
        let n = 0;
        const c = criarCoalescedor(async () => { n++; if (n === 1) await g.p; });
        c.tocar();
        const segundo = c.tocar();
        g.soltar();
        await segundo;
        expect(n).toBe(2);
    });
});

describe('sessão do OpenWA', () => {
    const lista = [
        { id: 'id-outra', name: 'opura-teste', status: 'ready' },
        { id: SESSAO, name: 'opura', status: 'ready', phone: '5565999990000' },
    ];

    it('idDaSessaoPorNome acha pelo nome exato (o OpenWA endereça pelo id)', () => {
        expect(idDaSessaoPorNome(lista, 'opura')).toBe(SESSAO);
        expect(idDaSessaoPorNome(lista, 'OPURA')).toBeNull();
        expect(idDaSessaoPorNome([], 'opura')).toBeNull();
        expect(idDaSessaoPorNome(null, 'opura')).toBeNull();
    });

    it('leituraDaSessao: estado bruto = status; número com + só quando é dígito', () => {
        expect(leituraDaSessao({ status: 'ready', phone: '5565999990000' }))
            .toEqual({ estado_bruto: 'ready', numero: '+5565999990000' });
        expect(leituraDaSessao({ status: 'qr_ready', phone: null })).toEqual({ estado_bruto: 'qr_ready', numero: null });
        expect(leituraDaSessao({ status: 'ready', phone: 'abc' })).toEqual({ estado_bruto: 'ready', numero: null });
        expect(leituraDaSessao(null)).toEqual({ estado_bruto: null, numero: null });
    });

    it('podeEnviar só com status ready (sessão fora daria 400 = falha definitiva)', () => {
        expect(podeEnviar('ready')).toBe(true);
        for (const s of ['qr_ready', 'disconnected', 'initializing', 'failed', null, undefined, 'READY ']) {
            expect(podeEnviar(s)).toBe(false);
        }
    });
});
