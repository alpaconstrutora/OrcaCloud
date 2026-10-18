import { describe, it, expect } from 'vitest';
import { lerCodigoDeBarras, type ImagemRGBA } from '../utils/codigoBarrasI25';
import {
    codigoBarrasArrecadacaoToLinha48,
    dvDoCodigoDeBarrasConfere,
    linhaDoCodigoDeBarras,
    linhaDigitavelToCodigoBarras47,
    linhaDigitavelToCodigoBarras48,
    mod11,
    parseLinhaDigitavel,
} from '../utils/febrabanRules';

// O código de barras real do boleto #1486 (reaviso Energisa), lido do PDF e
// conferido na Asaas em 18/10/2026: R$ 61,65, CAIUA DISTRIB ENERGIA S A.
const ENERGISA = '83650000000616500010005096430202609703008019';
const ENERGISA_LINHA = '836500000002616500010007509643020266097030080192';

/** Bancário válido: monta 43 dígitos e calcula o DV geral (posição 5). */
function bancarioValido(): string {
    const semDv = '341' + '9' + '1234' + '0000012345' + '1090000012345678901234567';
    const dv = mod11(semDv);
    return semDv.slice(0, 4) + dv + semDv.slice(4);
}

const PADRAO: Record<string, string> = {
    '0': 'EELLE', '1': 'LEEEL', '2': 'ELEEL', '3': 'LLEEE', '4': 'EELEL',
    '5': 'LELEE', '6': 'ELLEE', '7': 'EEELL', '8': 'LEELE', '9': 'ELELE',
};

/** Larguras (em módulos) do símbolo I2of5: [preto?, módulos][]. */
function simbolo(digitos: string, largo = 2.5): [boolean, number][] {
    const els: [boolean, number][] = [[true, 1], [false, 1], [true, 1], [false, 1]];
    for (let i = 0; i < digitos.length; i += 2) {
        const b = PADRAO[digitos[i]], s = PADRAO[digitos[i + 1]];
        for (let k = 0; k < 5; k++) {
            els.push([true, b[k] === 'L' ? largo : 1]);
            els.push([false, s[k] === 'L' ? largo : 1]);
        }
    }
    els.push([true, largo], [false, 1], [true, 1]);
    return els;
}

/** Desenha uma imagem com o(s) código(s) em faixas horizontais. */
function desenhar(codigos: string[], opcoes: { modulo?: number; ruido?: boolean; girar?: boolean } = {}): ImagemRGBA {
    const modulo = opcoes.modulo ?? 3.3;          // largura não inteira: serrilhado
    const altFaixa = 30;
    const linhas: number[][] = [];
    for (const c of codigos) {
        const pixels: number[] = [];
        const pinta = (preto: boolean, larguraPx: number) => {
            for (let k = 0; k < larguraPx; k++) pixels.push(preto ? 0 : 255);
        };
        if (opcoes.ruido) { pinta(true, 7); pinta(false, 3); pinta(true, 2); pinta(false, 5); pinta(true, 9); }
        pinta(false, Math.round(12 * modulo));     // zona quieta
        let acumulado = 0, desenhado = 0;
        for (const [preto, mods] of simbolo(c)) {
            acumulado += mods * modulo;
            const ate = Math.round(acumulado);
            pinta(preto, ate - desenhado);
            desenhado = ate;
        }
        pinta(false, Math.round(12 * modulo));
        if (opcoes.ruido) { pinta(true, 4); pinta(false, 2); pinta(true, 4); }
        for (let y = 0; y < altFaixa; y++) linhas.push(opcoes.girar ? [...pixels].reverse() : pixels);
        for (let y = 0; y < 10; y++) linhas.push(new Array(pixels.length).fill(255));
    }
    const width = Math.max(...linhas.map(l => l.length));
    const height = linhas.length;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    linhas.forEach((l, y) => l.forEach((v, x) => {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
    }));
    return { width, height, data };
}

describe('febrabanRules — código de barras → linha', () => {
    it('arrecadação: o código do #1486 vira a linha que a Asaas aceitou', () => {
        expect(codigoBarrasArrecadacaoToLinha48(ENERGISA)).toBe(ENERGISA_LINHA);
        expect(linhaDoCodigoDeBarras(ENERGISA)).toBe(ENERGISA_LINHA);
        expect(linhaDigitavelToCodigoBarras48(ENERGISA_LINHA)).toBe(ENERGISA);
        const p = parseLinhaDigitavel(ENERGISA_LINHA);
        expect(p.erros).toEqual([]);
        expect(p.valor).toBe(61.65);
    });

    it('bancário: ida e volta pela linha de 47', () => {
        const cb = bancarioValido();
        const linha = linhaDoCodigoDeBarras(cb);
        expect(linha).toHaveLength(47);
        expect(linhaDigitavelToCodigoBarras47(linha)).toBe(cb);
    });

    it('DV geral: confere o certo e recusa um dígito trocado', () => {
        expect(dvDoCodigoDeBarrasConfere(ENERGISA)).toBe(true);
        expect(dvDoCodigoDeBarrasConfere(bancarioValido())).toBe(true);
        const torto = ENERGISA.slice(0, 20) + ((Number(ENERGISA[20]) + 1) % 10) + ENERGISA.slice(21);
        expect(dvDoCodigoDeBarrasConfere(torto)).toBe(false);
        expect(dvDoCodigoDeBarrasConfere('123')).toBe(false);
    });
});

describe('lerCodigoDeBarras', () => {
    it('lê o código de arrecadação desenhado', () => {
        const r = lerCodigoDeBarras(desenhar([ENERGISA]));
        expect(r.codigo).toBe(ENERGISA);
    });

    it('lê o bancário, com módulo de largura quebrada e ruído dos lados', () => {
        const cb = bancarioValido();
        expect(lerCodigoDeBarras(desenhar([cb], { modulo: 2.7, ruido: true })).codigo).toBe(cb);
        expect(lerCodigoDeBarras(desenhar([cb], { modulo: 4.6, ruido: true })).codigo).toBe(cb);
    });

    it('lê o documento girado 180°', () => {
        expect(lerCodigoDeBarras(desenhar([ENERGISA], { girar: true })).codigo).toBe(ENERGISA);
    });

    it('recusa código cujo DV não confere', () => {
        const torto = ENERGISA.slice(0, 20) + ((Number(ENERGISA[20]) + 1) % 10) + ENERGISA.slice(21);
        const r = lerCodigoDeBarras(desenhar([torto]));
        expect(r.codigo).toBeNull();
        expect(r.motivo).toBe('nenhum_codigo');
    });

    it('dois códigos diferentes na mesma imagem: não escolhe por conta própria', () => {
        const r = lerCodigoDeBarras(desenhar([ENERGISA, bancarioValido()]));
        expect(r.codigo).toBeNull();
        expect(r.motivo).toBe('mais_de_um_codigo');
        expect(r.candidatos.map(c => c.codigo).sort()).toEqual([ENERGISA, bancarioValido()].sort());
    });

    it('imagem sem código: nada', () => {
        const branca: ImagemRGBA = { width: 50, height: 10, data: new Uint8ClampedArray(50 * 10 * 4).fill(255) };
        expect(lerCodigoDeBarras(branca)).toEqual({ codigo: null, candidatos: [], motivo: 'nenhum_codigo' });
    });
});
