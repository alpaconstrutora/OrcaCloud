import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { computeImovibMath } from '../utils/imovibMotor';
import { estudoComPrazoDoPortal } from '../utils/imovibVariacoes';
import { calcularIndicadores } from '../utils/imovibIndicadores';
import { baseStudy } from './fixtures/imovibEstudos';

/**
 * Portal do Investidor por link calcula o mesmo número do app (item 10.6 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Desde 15/11/2026 (plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 2) o portal recebe o
 * SNAPSHOT da versão publicada — o estudo como o app o carregou —, e não mais o estudo vivo
 * remontado no portal (`montarEstudoDoPortal` saiu).
 */

describe('10.6 — o portal calcula o mesmo número do app', () => {
    it('sem mexer no prazo: VGV líquido, TIR e prazo iguais aos do Resumo (mesmo com as durações vazias)', () => {
        const estudo = baseStudy({ construction_duration_months: null, sales_duration_months: null });
        const app = computeImovibMath(estudo);
        const portal = computeImovibMath(estudoComPrazoDoPortal(estudo, 0));
        expect(portal.netVgvTotal).toBe(app.netVgvTotal);
        expect(portal.annualIrr).toBe(app.annualIrr);
        expect(portal.duration).toBe(app.duration);
    });

    it('atrasar o prazo vale também quando a duração está vazia (antes o controle não fazia nada)', () => {
        const estudo = baseStudy({ construction_duration_months: null, sales_duration_months: null });
        expect(computeImovibMath(estudoComPrazoDoPortal(estudo, 6)).duration).toBeGreaterThan(computeImovibMath(estudo).duration);
    });

    it('payback e múltiplo do portal são os do app', () => {
        const estudo = baseStudy();
        const r = computeImovibMath(estudoComPrazoDoPortal(estudo, 0));
        const app = calcularIndicadores(computeImovibMath(estudo), 12);
        const portal = calcularIndicadores(r, 12);
        expect(portal.paybackSimplesMes).toBe(app.paybackSimplesMes);
        expect(portal.multiploDoCapital).toBe(app.multiploDoCapital);
    });
});

describe('contrato com a função publicada (versão publicada, plano 2026-11-15)', () => {
    // A definição que vale é a da migration mais recente que recria a função.
    const pasta = resolve(__dirname, '../supabase/migrations');
    const ultima = readdirSync(pasta)
        .filter(f => f.endsWith('.sql') && /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_investor_portal_get_study/i.test(readFileSync(`${pasta}/${f}`, 'utf-8')))
        .sort((a, b) => (a.match(/\d{14}/)?.[0] ?? '').localeCompare(b.match(/\d{14}/)?.[0] ?? ''))
        .pop()!;
    const sql = readFileSync(`${pasta}/${ultima}`, 'utf-8');
    const chave = (k: string) => new RegExp(`'${k}'\\s*,`).test(sql);

    it('serve o snapshot da versão publicada na oportunidade, não o estudo vivo', () => {
        expect(sql).toMatch(/imovib_version_id/);
        expect(sql).toMatch(/FROM public\.imovib_study_versions/);
        expect(sql).not.toMatch(/FROM public\.imovib_studies/);
        expect(sql).toMatch(/"error":"sem_versao"/);
    });

    it('devolve as chaves que getVersaoPublicadaByToken consome', () => {
        for (const k of ['study', 'cenarios', 'relatorio', 'versao', 'organizacao', 'label', 'created_at', 'logo_url']) {
            expect(chave(k), k).toBe(true);
        }
    });

    it('tira do link toda coluna interna de governança (parecer, notas, mínimos) e as listas penduradas', () => {
        const fora = /snapshot\s*-\s*ARRAY\[([^\]]*)\]/i.exec(sql)?.[1] ?? '';
        for (const k of ['premise_notes', 'recommendation', 'recommendation_notes', 'recommended_by', 'recommended_at', 'recommended_by_user_id',
            'recommendation_snapshot', 'hurdle_irr_spread', 'hurdle_margin_percent', 'hurdle_max_exposure', 'cenarios', 'relatorio']) {
            expect(fora, k).toContain(`'${k}'`);
        }
    });
});
