import { describe, expect, it } from 'vitest';
import { rotaDaDependencia, DEGRAU_PX, ALTURA_LINHA_PX, COMPRIMENTO_SETA_PX, DEGRAU_CHEGADA_PX } from '../utils/ganttDependencias';

/** Converte o `d` ("M x y H x V y H x") em pontos absolutos. */
function pontos(d: string): Array<[number, number]> {
    const t = d.trim().split(/\s+/);
    const out: Array<[number, number]> = [];
    let x = 0, y = 0;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (c === 'M') { x = +t[++i]; y = +t[++i]; out.push([x, y]); }
        else if (c === 'H') { x = +t[++i]; out.push([x, y]); }
        else if (c === 'V') { y = +t[++i]; out.push([x, y]); }
    }
    return out;
}

const linha = (n: number) => n * ALTURA_LINHA_PX + 18;

describe('rotaDaDependencia', () => {
    it('FS em sequência: sai COLADO no fim da origem, desce logo ali e a seta encosta no início do destino', () => {
        const p = pontos(rotaDaDependencia({ left: 100, right: 200, y: linha(0) }, { left: 300, right: 360, y: linha(1) }, 'FS'));
        expect(p[0]).toEqual([200, linha(0)]);                 // borda direita da origem — sem espaço
        expect(p[1]).toEqual([200 + DEGRAU_PX, linha(0)]);     // degrau curto
        expect(p[2]).toEqual([200 + DEGRAU_PX, linha(1)]);     // desce colado na origem (não no meio)
        expect(p[p.length - 1]).toEqual([300, linha(1)]);      // termina NA borda esquerda do destino
        expect(p).toHaveLength(4);
    });

    it('FS com sobreposição (destino começa antes do fim da origem): contorna pela divisa e entra pela esquerda', () => {
        const p = pontos(rotaDaDependencia({ left: 100, right: 300, y: linha(0) }, { left: 150, right: 260, y: linha(1) }, 'FS'));
        expect(p[0]).toEqual([300, linha(0)]);
        expect(p[2][1]).toBe(linha(0) + ALTURA_LINHA_PX / 2);  // divisa entre as linhas
        const [penultimo, ultimo] = p.slice(-2);
        expect(ultimo).toEqual([150, linha(1)]);
        expect(penultimo[0]).toBe(150 - DEGRAU_CHEGADA_PX);     // chega andando para a DIREITA (seta certa)
    });

    it('SS: sai do início da origem para a esquerda e entra no início do destino', () => {
        const p = pontos(rotaDaDependencia({ left: 100, right: 200, y: linha(0) }, { left: 140, right: 220, y: linha(2) }, 'SS'));
        expect(p[0]).toEqual([100, linha(0)]);
        expect(p[1][0]).toBe(100 - DEGRAU_PX);
        expect(p[p.length - 1]).toEqual([140, linha(2)]);
    });

    it('FF: entra pelo FIM do destino, andando para a esquerda', () => {
        const p = pontos(rotaDaDependencia({ left: 100, right: 200, y: linha(0) }, { left: 120, right: 180, y: linha(1) }, 'FF'));
        const [penultimo, ultimo] = p.slice(-2);
        expect(ultimo).toEqual([180, linha(1)]);
        expect(penultimo[0]).toBeGreaterThan(180);
    });

    it('subindo (destino acima da origem): a divisa fica acima', () => {
        const p = pontos(rotaDaDependencia({ left: 100, right: 300, y: linha(3) }, { left: 150, right: 260, y: linha(1) }, 'FS'));
        expect(p[2][1]).toBe(linha(3) - ALTURA_LINHA_PX / 2);
        expect(p[p.length - 1]).toEqual([150, linha(1)]);
    });

    it('a seta assenta num trecho reto MAIOR que ela — o traço chega pela base, não pela lateral', () => {
        // varre o destino em volta da origem: sequência, quase colada, sobreposta, SS/FF/SF
        for (const tipo of ['FS', 'SS', 'FF', 'SF'] as const) {
            for (let esquerda = 60; esquerda <= 360; esquerda += 3) {
                const p = pontos(rotaDaDependencia({ left: 100, right: 200, y: linha(0) }, { left: esquerda, right: esquerda + 80, y: linha(1) }, tipo));
                const [penultimo, ultimo] = p.slice(-2);
                expect(penultimo[1]).toBe(ultimo[1]);                                   // último trecho é horizontal
                expect(Math.abs(ultimo[0] - penultimo[0])).toBeGreaterThan(COMPRIMENTO_SETA_PX);
            }
        }
    });

    it('caso do print: destino 10px depois do degrau de saída não desce direto (a seta não caberia)', () => {
        const p = pontos(rotaDaDependencia({ left: 100, right: 200, y: linha(0) }, { left: 200 + DEGRAU_PX + 10, right: 300, y: linha(1) }, 'FS'));
        const [penultimo, ultimo] = p.slice(-2);
        expect(ultimo[0] - penultimo[0]).toBeGreaterThanOrEqual(DEGRAU_CHEGADA_PX);
    });

    it('todo segmento é horizontal ou vertical (nada de diagonal)', () => {
        for (const tipo of ['FS', 'SS', 'FF', 'SF'] as const) {
            const p = pontos(rotaDaDependencia({ left: 100, right: 300, y: linha(0) }, { left: 150, right: 260, y: linha(2) }, tipo));
            for (let i = 1; i < p.length; i++) expect(p[i][0] === p[i - 1][0] || p[i][1] === p[i - 1][1]).toBe(true);
        }
    });
});
