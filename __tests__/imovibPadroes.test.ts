import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Padrão de premissa mora em constants/imovibDefaults.ts (item 0.5 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): número de padrão
 * escrito direto no motor é folga que o usuário não vê nem altera.
 *
 * `?? 0`, `|| 0` e `|| 1` ficam de fora: são guarda de campo vazio (área, preço,
 * pavimentos = 1), não padrão de premissa.
 */

const UTILS = resolve(__dirname, '../utils');
const PADRAO_ESCONDIDO = /(\?\?|\|\|)\s*(-?\d*\.\d+|-?[2-9]\d*|-?1\d+|-1)\b/g;

describe('0.5 — padrões num lugar só', () => {
    it('nenhum arquivo utils/imovib*.ts tem número de padrão depois de ?? ou ||', () => {
        const arquivos = readdirSync(UTILS).filter(f => /^imovib.*\.ts$/.test(f));
        expect(arquivos).toContain('imovibMotor.ts');
        const achados: string[] = [];
        for (const f of arquivos) {
            readFileSync(resolve(UTILS, f), 'utf-8').split(/\r?\n/).forEach((linha, i) => {
                if (linha.trim().startsWith('//') || linha.trim().startsWith('*')) return;
                for (const m of linha.matchAll(PADRAO_ESCONDIDO)) achados.push(`${f}:${i + 1}: ${m[0]}`);
            });
        }
        expect(achados).toEqual([]);
    });

    it('a guarda acha o padrão escondido', () => {
        const casos = ['x ?? 4', 'x || 0.4', 'x ?? 12', 'x || -1', 'x ?? 10'];
        for (const c of casos) expect(c.match(PADRAO_ESCONDIDO), c).not.toBeNull();
        for (const c of ['x ?? 0', 'x || 0', 'u.pavimentos || 1']) expect(c.match(PADRAO_ESCONDIDO), c).toBeNull();
    });
});
