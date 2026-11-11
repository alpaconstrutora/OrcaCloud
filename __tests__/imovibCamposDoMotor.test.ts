import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeImovibMath, CAMPOS_DO_MOTOR } from '../utils/imovibMotor';
import { COLUNAS_DA_LISTAGEM } from '../services/imovibService';
import { ESTUDOS_DE_REGRESSAO } from './fixtures/imovibEstudos';

/**
 * Uma lista só dos campos do estudo que o motor lê (item 0.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). A listagem
 * seleciona colunas pelo nome: campo que o motor lê e a listagem não traz
 * calcula outro número na listagem, sem erro nenhum.
 */

// Montados em memória pelo imovibService (getStudyById e getStudiesWithMetrics),
// não são colunas de imovib_studies.
const ESTRUTURA = ['blocks', 'capex_items', 'unit_instances', 'estrutura', 'funding_sources'];

const soOQueOMotorLe = (s: any) => {
    const copia: any = {};
    for (const k of [...CAMPOS_DO_MOTOR, ...ESTRUTURA]) if (k in s) copia[k] = s[k];
    return copia;
};

describe('0.4 — campos do motor', () => {
    it('todo campo do estudo lido no motor está em CAMPOS_DO_MOTOR', () => {
        const fonte = readFileSync(resolve(__dirname, '../utils/imovibMotor.ts'), 'utf-8');
        const lidos = new Set([...fonte.matchAll(/\bstudy\.([a-z_]+)/g)].map(m => m[1]));
        const fora = [...lidos].filter(c => !CAMPOS_DO_MOTOR.includes(c as any) && !ESTRUTURA.includes(c));
        expect(fora).toEqual([]);
        expect(lidos.size).toBeGreaterThan(10); // o regex achou as leituras
    });

    it('a listagem seleciona todos os campos do motor', () => {
        const colunas = COLUNAS_DA_LISTAGEM.split(',').map(c => c.trim());
        expect(CAMPOS_DO_MOTOR.filter(c => !colunas.includes(c))).toEqual([]);
        expect(new Set(colunas).size).toBe(colunas.length);
    });

    for (const [nome, estudo] of Object.entries(ESTUDOS_DE_REGRESSAO)) {
        it(`${nome}: o estudo só com os campos do motor calcula igual ao estudo inteiro`, () => {
            const inteiro = { ...estudo(), organization_id: 'org', version: '1.0', swot_analysis: { risks: 'x' }, location_score: 9, vso_regional_percent: 5 };
            const a = computeImovibMath(inteiro);
            const b = computeImovibMath(soOQueOMotorLe(inteiro));
            expect(b.vpl).toBe(a.vpl);
            expect(b.monthlyFlows.map(f => f.net)).toEqual(a.monthlyFlows.map(f => f.net));
        });
    }
});
