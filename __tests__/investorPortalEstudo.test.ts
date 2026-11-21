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

describe('contrato com a função publicada (versão publicada pela oportunidade, plano 2026-11-15)', () => {
    // A definição que vale é a da migration mais recente que recria cada função.
    const pasta = resolve(__dirname, '../supabase/migrations');
    const ultimaQueDefine = (funcao: string) => readFileSync(`${pasta}/${readdirSync(pasta)
        .filter(f => f.endsWith('.sql') && new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${funcao}\\(`, 'i').test(readFileSync(`${pasta}/${f}`, 'utf-8')))
        .sort((a, b) => (a.match(/\d{14}/)?.[0] ?? '').localeCompare(b.match(/\d{14}/)?.[0] ?? ''))
        .pop()!}`, 'utf-8');
    const sql = ultimaQueDefine('fn_investor_portal_get_versao');
    const chave = (k: string) => new RegExp(`'${k}'\\s*,`).test(sql);

    it('serve o snapshot da versão publicada na oportunidade, não o estudo vivo', () => {
        expect(sql).toMatch(/imovib_version_id/);
        expect(sql).toMatch(/FROM public\.imovib_study_versions/);
        expect(sql).not.toMatch(/row_to_json\(s\)/);
        expect(sql).toMatch(/"error":"sem_versao"/);
        // Fase 7 (16/11): oportunidade de qualquer organização do investidor ("Disponível em todas");
        // o estudo tem de ser da organização da OPORTUNIDADE.
        expect(sql).toMatch(/organization_id = ANY\(v_orgs\)/);
        expect(sql).toMatch(/fn_orgs_do_investidor\(v_tok\.investor_id\)/);
        expect(sql).toMatch(/s\.organization_id = v_opp\.organization_id/);
    });

    it('a RPC antiga, por estudo, saiu (Fase 7)', () => {
        const todas = readdirSync(pasta).filter(f => f.endsWith('.sql')).map(f => readFileSync(`${pasta}/${f}`, 'utf-8')).join('\n');
        expect(todas).toMatch(/DROP FUNCTION IF EXISTS public\.fn_investor_portal_get_study\(TEXT, UUID\)/);
    });

    it('devolve as chaves que getVersaoPublicadaByToken consome', () => {
        for (const k of ['study', 'cenarios', 'relatorio', 'versao', 'organizacao', 'label', 'created_at', 'logo_url']) {
            expect(chave(k), k).toBe(true);
        }
    });

    it('as listas do relatório vão recortadas, com os mesmos campos do front', async () => {
        const { CAMPOS_PARA_O_INVESTIDOR } = await import('../utils/imovibVersoes');
        for (const [lista, campos] of Object.entries(CAMPOS_PARA_O_INVESTIDOR)) {
            expect(sql, lista).toContain(`ARRAY[${campos.map(c => `'${c}'`).join(', ')}]`);
        }
        expect(sql).not.toMatch(/'relatorio',\s*COALESCE\(v_ver\.snapshot -> 'relatorio'/);
    });

    it('tira do link toda coluna interna de governança (parecer, notas, mínimos) e as listas penduradas', async () => {
        const { CHAVES_INTERNAS_DO_ESTUDO } = await import('../utils/imovibVersoes');
        const fora = /snapshot\s*-\s*ARRAY\[([^\]]*)\]/i.exec(sql)?.[1] ?? '';
        for (const k of [...CHAVES_INTERNAS_DO_ESTUDO, 'cenarios', 'relatorio', 'calculo']) {
            expect(fora, k).toContain(`'${k}'`);
        }
    });

    it('Fase 6: o cálculo congelado vai em chave própria, só a parte do investidor', () => {
        expect(sql).toMatch(/'calculo',\s*v_ver\.snapshot -> 'calculo' -> 'investidor'/);
        expect(sql).not.toMatch(/'interno'/);
    });
});

describe('vitrine pelo link (plano 2026-11-21, Fase 2): só números da versão, nenhum campo digitado', () => {
    const pasta = resolve(__dirname, '../supabase/migrations');
    const ultima = (funcao: string) => readFileSync(`${pasta}/${readdirSync(pasta)
        .filter(f => f.endsWith('.sql') && new RegExp(String.raw`CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.${funcao}\(`, 'i').test(readFileSync(`${pasta}/${f}`, 'utf-8')))
        .sort((a, b) => (a.match(/\d{14}/)?.[0] ?? '').localeCompare(b.match(/\d{14}/)?.[0] ?? ''))
        .pop()!}`, 'utf-8').replace(/--.*$/gm, '');

    it('a lista do portal não manda a linha inteira (to_jsonb(o)) e usa a vitrine', () => {
        const sql = ultima('fn_investor_portal_get_opportunities');
        expect(sql).not.toMatch(/to_jsonb\(o\)/);
        expect(sql).toMatch(/fn_oportunidade_na_vitrine\(o\)/);
    });

    it('a vitrine tem as chaves que naVitrine lê e nenhuma coluna digitada', () => {
        const sql = ultima('fn_oportunidade_na_vitrine');
        for (const k of ['indicadores_da_versao', 'resultados_da_versao', 'local', 'ticket_min', 'imovib_version_id', 'cidade', 'uf', 'obra_id', 'duracao', 'custoObra', 'terreno']) {
            expect(sql, k).toContain(`'${k}'`);
        }
        for (const digitado of ['risks_json', 'simulation_params_json', 'cost_estimate', 'roi_pct', 'tir_pct', 'duration_months', 'location_city', 'target_funding_value', 'scenario_']) {
            expect(sql, digitado).not.toContain(digitado);
        }
    });

    it('o marketplace anônimo usa a vitrine e perde o EXECUTE de PUBLIC', () => {
        const sql = ultima('get_public_marketplace');
        expect(sql).toMatch(/fn_oportunidade_na_vitrine\(o\)/);
        expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.get_public_marketplace\(text\) FROM PUBLIC/);
        expect(sql).not.toMatch(/'cost_estimate'|'vgv',\s+o\.vgv/);
    });

    it('publicar exige estudo, versão com cálculo e parecer diferente de "reprovar"', () => {
        const sql = ultima('fn_investor_opportunity_versao_valida');
        expect(sql).toMatch(/vincule o estudo do Imovib/);
        expect(sql).toMatch(/snapshot \? 'calculo'/);
        expect(sql).toMatch(/v_parecer = 'reprovar'/);
    });
});

describe('Data Room pelo GED (plano 2026-11-21, Fase 3)', () => {
    const pasta = resolve(__dirname, '../supabase/migrations');
    const ultima = (funcao: string) => readFileSync(`${pasta}/${readdirSync(pasta)
        .filter(f => f.endsWith('.sql') && new RegExp(String.raw`CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.${funcao}\(`, 'i').test(readFileSync(`${pasta}/${f}`, 'utf-8')))
        .sort((a, b) => (a.match(/\d{14}/)?.[0] ?? '').localeCompare(b.match(/\d{14}/)?.[0] ?? ''))
        .pop()!}`, 'utf-8').replace(/--.*$/gm, '')
        // Só o corpo da função (a migration também tem guardas e DROPs que citam o que saiu).
        .split(new RegExp(String.raw`CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.${funcao}\(`, 'i'))[1].split(/\nREVOKE /)[0];

    it('o Data Room pelo link lê os compartilhamentos do GED, só da org da oportunidade', () => {
        const sql = ultima('fn_investor_portal_get_dataroom');
        expect(sql).toMatch(/opura_document_portal_shares/);
        expect(sql).toMatch(/audience = 'investidor'/);
        expect(sql).toMatch(/doc\.organization_id = v_opp\.organization_id/);
        expect(sql).toMatch(/is_published = TRUE/);
        expect(sql).not.toMatch(/opportunity_documents/);
    });

    it('a vitrine leva as fotos do empreendimento e não a galeria própria; o marketplace não lê opportunity_documents', () => {
        const vitrine = ultima('fn_oportunidade_na_vitrine');
        expect(vitrine).toContain(`'fotos'`);
        expect(vitrine).not.toContain('gallery_urls');
        expect(ultima('get_public_marketplace')).not.toMatch(/opportunity_documents/);
    });
});
