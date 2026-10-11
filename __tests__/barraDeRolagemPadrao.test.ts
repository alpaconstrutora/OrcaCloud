/**
 * Barra de rolagem do app (index.css) — trava e lógica de proximidade.
 *
 * 11/10/2026: a barra discreta que alarga no hover foi publicada e o usuário respondeu
 * *"a barra continua nao alterando de tamanho"*. No Gantt ela nem valia: o contêiner tinha
 * `scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent`, que o Tailwind v4
 * traduz em `scrollbar-width`/`scrollbar-color` — e no Chrome 121+ essas propriedades
 * DESLIGAM o `::-webkit-scrollbar` do elemento (barra nativa, polegar fixo de 6px, medido em
 * produção). A trava abaixo impede que essas classes (ou o estilo inline equivalente)
 * voltem a qualquer tela. `scrollbar-none`/`scrollbar-hide` (esconder a barra de propósito)
 * continuam permitidas.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { barraProxima, DISTANCIA_PX } from '../utils/barraDeRolagemProxima';

const RAIZ = join(__dirname, '..');
const PASTAS = ['components', 'hooks', 'utils', 'lib'];
const ARQUIVOS_RAIZ = ['App.tsx', 'index.tsx'];

function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return arquivos(p);
        return /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
    });
}

// Classes Tailwind v4 que viram scrollbar-width/scrollbar-color (desligam a barra do app).
const CLASSE_PROIBIDA = /(?<![\w-])scrollbar-(thin|auto|thumb-[\w/[\]-]+|track-[\w/[\]-]+|color-[\w/[\]-]+|corner-[\w/[\]-]+)(?![\w-])/g;
// O mesmo por estilo inline do React.
const INLINE_PROIBIDO = /\bscrollbar(Width|Color)\s*:/g;

describe('barra de rolagem: nada desliga a barra do app', () => {
    const todos = [...PASTAS.flatMap((d) => arquivos(join(RAIZ, d))), ...ARQUIVOS_RAIZ.map((f) => join(RAIZ, f))];
    const achados: string[] = [];
    for (const f of todos) {
        const linhas = readFileSync(f, 'utf-8').split('\n');
        linhas.forEach((linha, i) => {
            if (/^\s*(\/\/|\*)/.test(linha)) return; // comentário que EXPLICA a regra
            for (const m of linha.matchAll(CLASSE_PROIBIDA)) achados.push(`${f.slice(RAIZ.length + 1)}:${i + 1} ${m[0]}`);
            for (const m of linha.matchAll(INLINE_PROIBIDO)) achados.push(`${f.slice(RAIZ.length + 1)}:${i + 1} ${m[0]}`);
        });
    }
    it('nenhuma tela usa scrollbar-thin / -thumb-* / -track-* / -color-* nem scrollbarWidth/Color inline', () => {
        expect(achados).toEqual([]);
    });
});

describe('barraProxima', () => {
    const caixa = { left: 0, top: 0, right: 500, bottom: 300 };
    const rolaTudo = { vertical: true, horizontal: true };

    it('perto da borda direita = barra vertical; perto de baixo = horizontal', () => {
        expect(barraProxima(caixa, { x: 500 - DISTANCIA_PX, y: 100 }, rolaTudo)).toBe('v');
        expect(barraProxima(caixa, { x: 200, y: 300 - 4 }, rolaTudo)).toBe('h');
    });

    it('a distância conta de onde a BARRA começa, não da borda externa', () => {
        const barras8 = { vertical: 8, horizontal: 8 };
        // 10px antes da barra = 18px da borda externa: ainda é "perto"
        expect(barraProxima(caixa, { x: 500 - 8 - 10, y: 100 }, rolaTudo, barras8)).toBe('v');
        expect(barraProxima(caixa, { x: 500 - 8 - DISTANCIA_PX - 1, y: 100 }, rolaTudo, barras8)).toBeNull();
        expect(barraProxima(caixa, { x: 200, y: 300 - 8 - 10 }, rolaTudo, barras8)).toBe('h');
    });

    it('sobre a própria barra (dentro dos últimos px) também conta', () => {
        expect(barraProxima(caixa, { x: 497, y: 150 }, rolaTudo)).toBe('v');
    });

    it('longe das bordas, ou fora da caixa: nenhuma', () => {
        expect(barraProxima(caixa, { x: 200, y: 100 }, rolaTudo)).toBeNull();
        expect(barraProxima(caixa, { x: 600, y: 100 }, rolaTudo)).toBeNull();
    });

    it('só a barra que existe: sem rolagem vertical, a borda direita não marca', () => {
        expect(barraProxima(caixa, { x: 495, y: 100 }, { vertical: false, horizontal: true })).toBeNull();
        expect(barraProxima(caixa, { x: 495, y: 295 }, { vertical: false, horizontal: true })).toBe('h');
    });
});
