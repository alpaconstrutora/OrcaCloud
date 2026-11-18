/**
 * Limpeza do token do WhatsApp que ficava no localStorage (achado F75, 18/11/2026).
 *
 * O que trava:
 *   1. o token antigo some do navegador no boot e o conteúdo dele não vai para
 *      lugar nenhum — nem rede, nem outra chave (o aviso guarda só uma data);
 *   2. o aviso "este navegador tinha um token" nasce só se havia token de verdade;
 *   3. JSON ilegível também é apagado;
 *   4. sem nada guardado, nada acontece; storage bloqueado não derruba o boot;
 *   5. o aviso sobrevive ao "Sair" (o logout apaga só `sb-*` e `orca_*`).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    CHAVE_AVISO_TOKEN_LEGADO, CHAVE_TOKEN_LEGADO,
    avisoDeTokenLegado, descartarAvisoDeTokenLegado, limparTokenWhatsappLegado,
} from '../lib/whatsappLegado';

function memoria(inicial: Record<string, string> = {}) {
    const m = new Map(Object.entries(inicial));
    return {
        m,
        getItem: vi.fn((k: string) => m.get(k) ?? null),
        setItem: vi.fn((k: string, v: string) => { m.set(k, v); }),
        removeItem: vi.fn((k: string) => { m.delete(k); }),
    };
}

describe('limparTokenWhatsappLegado', () => {
    it('apaga o token antigo e deixa só um aviso com a data — sem o token em lugar nenhum', () => {
        const fetchEspiao = vi.fn();
        vi.stubGlobal('fetch', fetchEspiao);
        const s = memoria({ [CHAVE_TOKEN_LEGADO]: JSON.stringify({ phoneNumberId: '123456789', accessToken: 'EAAG-SEGREDO' }) });

        expect(limparTokenWhatsappLegado(s)).toBe(true);

        expect(s.m.has(CHAVE_TOKEN_LEGADO)).toBe(false);
        const aviso = s.m.get(CHAVE_AVISO_TOKEN_LEGADO);
        expect(aviso).toBeTruthy();
        expect(Number.isNaN(Date.parse(aviso!))).toBe(false);
        // Nada do conteúdo antigo sobrevive em chave nenhuma, nem o phone number id.
        expect([...s.m.values()].join('|')).not.toMatch(/EAAG|123456789/);
        expect(s.setItem).toHaveBeenCalledTimes(1);
        expect(fetchEspiao).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('objeto sem token (ou token vazio) é apagado sem aviso', () => {
        const s = memoria({ [CHAVE_TOKEN_LEGADO]: JSON.stringify({ phoneNumberId: '1', accessToken: '  ' }) });
        expect(limparTokenWhatsappLegado(s)).toBe(true);
        expect(s.m.size).toBe(0);
    });

    it('JSON ilegível também é apagado (e avisa: pode ter sido um token)', () => {
        const s = memoria({ [CHAVE_TOKEN_LEGADO]: '{quebrado' });
        expect(limparTokenWhatsappLegado(s)).toBe(true);
        expect(s.m.has(CHAVE_TOKEN_LEGADO)).toBe(false);
        expect(s.m.has(CHAVE_AVISO_TOKEN_LEGADO)).toBe(true);
    });

    it('sem nada guardado, não mexe em nada', () => {
        const s = memoria({ outra: 'x' });
        expect(limparTokenWhatsappLegado(s)).toBe(false);
        expect(s.removeItem).not.toHaveBeenCalled();
        expect(s.setItem).not.toHaveBeenCalled();
    });

    it('storage bloqueado (navegação privada) não derruba o boot', () => {
        const quebrado = {
            getItem: () => { throw new Error('SecurityError'); },
            setItem: () => { throw new Error('SecurityError'); },
            removeItem: () => { throw new Error('SecurityError'); },
        };
        expect(() => limparTokenWhatsappLegado(quebrado)).not.toThrow();
        expect(limparTokenWhatsappLegado(null)).toBe(false);
        expect(avisoDeTokenLegado(quebrado)).toBeNull();
        expect(() => descartarAvisoDeTokenLegado(quebrado)).not.toThrow();
    });

    it('o aviso não usa prefixo que o "Sair" apaga, e some ao ser descartado', () => {
        expect(CHAVE_AVISO_TOKEN_LEGADO.startsWith('sb-')).toBe(false);
        expect(CHAVE_AVISO_TOKEN_LEGADO.startsWith('orca_')).toBe(false);
        const s = memoria({ [CHAVE_AVISO_TOKEN_LEGADO]: '2026-11-18T12:00:00.000Z' });
        expect(avisoDeTokenLegado(s)).toBe('2026-11-18T12:00:00.000Z');
        descartarAvisoDeTokenLegado(s);
        expect(avisoDeTokenLegado(s)).toBeNull();
    });

    it('o boot (index.tsx) chama a limpeza antes de montar a aplicação', async () => {
        const { readFileSync } = await import('node:fs');
        const indice = readFileSync('index.tsx', 'utf8');
        const chamada = indice.indexOf('limparTokenWhatsappLegado();');
        const render = indice.indexOf('root.render(');
        expect(chamada).toBeGreaterThan(-1);
        expect(chamada).toBeLessThan(render);
    });
});
