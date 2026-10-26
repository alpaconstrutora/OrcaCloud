import { describe, it, expect } from 'vitest';
import {
    montarLinhasDaFolha, fatiasDoColaborador, distribuirCentavos, vencimentoDia20, diaDoMesSeguinte,
    encargosPadrao, formaDoTitulo, tituloDaFolhaPreservado, custoPorDestino, tributosDoProlabore, TERCEIROS_FPAS_507,
    type ColaboradorDaFolha, type EncargosConfig, type OpcoesDaFolha,
} from '../utils/folhaFinanceiro';

// Plano: docs/planos/2026-10-21-folha-encargos-em-tributos-a-pagar.md

const CFG: EncargosConfig = {
    cppRate: 0.20, ratRate: 0.03, fap: 1,
    terceiros: [{ code: '0079', name: 'Terceiros', rate: 0.058 }],
    origem: 'padrao', motivo: null,
};
const OP: OpcoesDaFolha = {
    individualizados: new Set(['ADIANTAMENTO']),
    repasses: { 'CONTRIBUIÇÃO ASSISTENCIAL': 'Contribuição Assistencial' },
};
const RATEIO_UNICO = [{ cost_center_id: 'cc1', plano_de_contas_id: 'pc1', share: 1 }];

/** O colaborador de 06/2026 da Alpa (folha 728260c9), com os números reais do banco. */
function colabJunho(fatias = fatiasDoColaborador([], RATEIO_UNICO)): ColaboradorDaFolha {
    return {
        employeeId: 'e1', nome: 'Fulano', bruto: 5667, baseInss: 5667,
        liquido: 5667 - 1618.40 - 495.69 - 60.69,          // 3.492,22 — o líquido JÁ desconta o adiantamento
        custoEmpregador: 5667 + 453.36,
        itens: [
            { code: 'SALARIO', type: 'provento', amount: 5667 },
            { code: 'ADIANTAMENTO', type: 'desconto', amount: 1618.40 },
            { code: 'INSS', type: 'desconto', amount: 495.69 },
            { code: 'CONTRIBUIÇÃO ASSISTENCIAL', type: 'desconto', amount: 60.69 },
            { code: 'FGTS', type: 'encargo', amount: 453.36 },
            { code: 'VA', type: 'informativa', amount: 300 },
        ],
        fatias,
    };
}
const porTipo = (linhas: ReturnType<typeof montarLinhasDaFolha>) =>
    Object.fromEntries(linhas.map(l => [l.tipo, l.valor]));

describe('montarLinhasDaFolha — cada encargo e retenção é um título próprio', () => {
    it('06/2026: FGTS 453,36 é o título do FGTS (antes virava "Encargos" de 3.988,90)', () => {
        const t = porTipo(montarLinhasDaFolha([colabJunho()], CFG, OP));
        expect(t.fgts).toBe(453.36);
        expect(t.inss).toBe(495.69);
        expect(t['rep-CONTRIBUIÇÃO ASSISTENCIAL']).toBe(60.69);
        expect(t.cpp).toBe(1133.40);        // 5.667 × 20%
        expect(t.rat).toBe(170.01);         // 5.667 × 3% × FAP 1
        expect(t['ter-0079']).toBe(328.69); // 5.667 × 5,8% — a única entidade deste CFG
        expect(t.terceiros).toBeUndefined(); // não existe mais o agregado
    });

    it('terceiros: um título POR ENTIDADE (FPAS 507), cada um com a sua alíquota (pedido 25/10/2026)', () => {
        const t = porTipo(montarLinhasDaFolha([colabJunho()], { ...CFG, terceiros: TERCEIROS_FPAS_507 }, OP));
        expect(t['ter-0001']).toBe(141.68);  // Salário-Educação 2,5%
        expect(t['ter-0002']).toBe(11.33);   // INCRA 0,2%
        expect(t['ter-0004']).toBe(56.67);   // SENAI 1,0%
        expect(t['ter-0008']).toBe(85.01);   // SESI 1,5%
        expect(t['ter-0064']).toBe(34);      // SEBRAE 0,6%
        // a soma das entidades é o que o agregado dava (5.667 × 5,8% = 328,69)
        expect(Object.entries(t).filter(([k]) => k.startsWith('ter-')).reduce((s, [, v]) => s + v, 0)).toBeCloseTo(328.69, 2);
    });

    it('adiantamento NÃO é abatido de novo do salário (o líquido já o desconta) nem vira encargo', () => {
        const linhas = montarLinhasDaFolha([colabJunho()], CFG, OP);
        expect(porTipo(linhas).salario).toBe(3492.22);
        expect(linhas.some(l => /ADIANTAMENTO/.test(l.tipo))).toBe(false);
    });

    it('desconto que não é repasse (falta, VR, dedução do 13º) não gera título', () => {
        const c = colabJunho();
        c.itens.push({ code: 'FALTA', type: 'desconto', amount: 120 }, { code: 'VR_DESCONTO', type: 'desconto', amount: 30 });
        const tipos = montarLinhasDaFolha([c], CFG, OP).map(l => l.tipo);
        expect(tipos).not.toContain('rep-FALTA');
        expect(tipos.some(t => /FALTA|VR_DESCONTO/.test(t))).toBe(false);
    });

    it('provento individualizado (pago à parte) sai do salário', () => {
        const c = colabJunho();
        c.itens.push({ code: 'ADIANTAMENTO', type: 'provento', amount: 500 });
        expect(porTipo(montarLinhasDaFolha([c], CFG, OP)).salario).toBe(2992.22);
    });

    it('IRRF e FGTS rescisório: IRRF próprio; FGTS_MULTA soma no FGTS; encargo desconhecido vira enc-', () => {
        const c = colabJunho();
        c.itens.push(
            { code: 'IRRF', type: 'desconto', amount: 87.12 },
            { code: 'FGTS_MULTA', type: 'encargo', amount: 100 },
            { code: 'SEGURO', type: 'encargo', amount: 15 },
        );
        const t = porTipo(montarLinhasDaFolha([c], CFG, OP));
        expect(t.irrf).toBe(87.12);
        expect(t.fgts).toBe(553.36);
        expect(t['enc-SEGURO']).toBe(15);
    });

    it('CPP/RAT/terceiros zerados (Simples fora do Anexo IV) não geram linha', () => {
        const tipos = montarLinhasDaFolha([colabJunho()], encargosPadrao({ regime_tributario: 'simples' }), OP).map(l => l.tipo);
        expect(tipos).not.toContain('cpp');
        expect(tipos).not.toContain('rat');
        expect(tipos.filter(t => t.startsWith('ter-'))).toEqual([]);
    });

    it('rateio entre duas obras: a soma de cada tributo bate ao centavo com o total da folha', () => {
        const fatias = fatiasDoColaborador(
            [{ project_id: 'o1', allocation_percent: 33.33, nome: 'Obra 1' }, { project_id: 'o2', allocation_percent: 33.33, nome: 'Obra 2' }],
            RATEIO_UNICO,
        );
        const linhas = montarLinhasDaFolha([colabJunho(fatias)], CFG, OP);
        for (const [tipo, total] of Object.entries(porTipo(montarLinhasDaFolha([colabJunho()], CFG, OP)))) {
            const soma = linhas.filter(l => l.tipo === tipo).reduce((s, l) => s + Math.round(l.valor * 100), 0);
            expect(soma, tipo).toBe(Math.round(total * 100));
        }
        // o que a alocação não cobre vai para o não alocado
        expect(new Set(linhas.map(l => l.destino))).toEqual(new Set(['o1', 'o2', null]));
    });

    it('vários colaboradores: CPP sobre a base TOTAL (arredonda uma vez, não por pessoa)', () => {
        const a = { ...colabJunho(), employeeId: 'a', nome: 'A', baseInss: 1000.03, itens: [] };
        const b = { ...colabJunho(), employeeId: 'b', nome: 'B', baseInss: 1000.03, itens: [] };
        const cpp = montarLinhasDaFolha([a, b], CFG, OP).filter(l => l.tipo === 'cpp');
        expect(cpp).toHaveLength(1);
        expect(cpp[0].valor).toBe(400.01);   // 2.000,06 × 20% = 400,012
        expect(cpp[0].colaboradores.sort()).toEqual(['A', 'B']);
    });
});

describe('fatiasDoColaborador', () => {
    it('alocação acima de 100% é proporcionalizada (não lança mais que o custo)', () => {
        const f = fatiasDoColaborador(
            [{ project_id: 'o1', allocation_percent: 80 }, { project_id: 'o2', allocation_percent: 80 }], RATEIO_UNICO);
        expect(f.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10);
        expect(f.some(x => x.destino === null)).toBe(false);
    });
    it('sem alocação: 100% no não alocado, multiplicado pelo rateio contábil', () => {
        const f = fatiasDoColaborador([], [
            { cost_center_id: 'a', plano_de_contas_id: null, share: 0.6 },
            { cost_center_id: 'b', plano_de_contas_id: null, share: 0.4 },
        ]);
        expect(f.map(x => [x.destino, x.share])).toEqual([[null, 0.6], [null, 0.4]]);
    });
});

describe('distribuirCentavos', () => {
    it('não perde nem cria centavo', () => {
        expect(distribuirCentavos(100, [1, 1, 1])).toEqual([34, 33, 33]);
        expect(distribuirCentavos(3, [1, 1])).toEqual([2, 1]);
        expect(distribuirCentavos(0, [1, 2])).toEqual([0, 0]);
    });
});

describe('vencimentos', () => {
    it('dia 20 do mês seguinte; sábado/domingo antecipa', () => {
        expect(vencimentoDia20('2026-06-01')).toBe('2026-07-20');   // segunda
        expect(vencimentoDia20('2026-05-01')).toBe('2026-06-19');   // 20/06 é sábado
        expect(vencimentoDia20('2026-12-01')).toBe('2027-01-20');
    });
    it('dia 05 do mês seguinte (salário, como antes)', () => {
        expect(diaDoMesSeguinte('2026-12', 5)).toBe('2027-01-05');
    });
});

describe('encargosPadrao — derivado do regime da matriz', () => {
    it('Lucro Presumido/Real: CPP 20%, RAT 3%, FAP 1, terceiros 5,8% (FPAS 507)', () => {
        const c = encargosPadrao({ regime_tributario: 'lucro_presumido' });
        expect([c.cppRate, c.ratRate, c.fap]).toEqual([0.2, 0.03, 1]);
        expect(c.terceiros.reduce((s, t) => s + t.rate, 0)).toBeCloseTo(0.058, 10);
        expect(c.terceiros.map(t => t.name)).toContain('SENAI');
    });
    it('Simples no Anexo IV paga CPP fora do DAS', () => {
        expect(encargosPadrao({ regime_tributario: 'simples', simples_anexo_iv: true }).cppRate).toBe(0.2);
    });
    it('CPRB: CPP 10% (2026) com aviso', () => {
        const c = encargosPadrao({ regime_tributario: 'lucro_real', cprb: true });
        expect(c.cppRate).toBe(0.1);
        expect(c.motivo).toMatch(/CPRB/);
    });
});

describe('formaDoTitulo', () => {
    it('terceiros: o credor é a ENTIDADE, em Contribuições de Terceiros, vencendo no dia 20', () => {
        expect(formaDoTitulo('ter-0004', { 'ter-0004': 'SENAI' })).toEqual({
            party_name: 'SENAI', party_type: 'TAX', category: 'Contribuições de Terceiros',
            rotulo: 'Contribuição de terceiros: SENAI', vencimento: 'dia20',
        });
        expect(formaDoTitulo('ter-0004').party_name).toBe('Terceiros (0004)'); // sem nome: diz o código
    });
    it('tributos vão para Tributos a Pagar (party_type TAX); salário e repasse não', () => {
        for (const t of ['inss', 'irrf', 'fgts', 'cpp', 'rat', 'ter-0004']) expect(formaDoTitulo(t).party_type, t).toBe('TAX');
        expect(formaDoTitulo('salario').party_type).toBe('EMPLOYEE');
        expect(formaDoTitulo('rep-X', { X: 'Sindicato' }).party_type).toBe('GOVERNMENT');
        expect(formaDoTitulo('rep-X', { X: 'Sindicato' }).party_name).toBe('Sindicato');
    });
    it('INSS e IRRF retidos são custo de salário (DRE em Folha de Pagamento)', () => {
        expect(formaDoTitulo('inss').category).toBe('Folha de Pagamento');
        expect(formaDoTitulo('irrf').category).toBe('Folha de Pagamento');
        expect(formaDoTitulo('fgts').category).toBe('Encargos Patronais');
    });
});

describe('tituloDaFolhaPreservado', () => {
    it('pago, conciliado, cancelado, em DARF, com vínculo no extrato ou Asaas: preservado', () => {
        expect(tituloDaFolhaPreservado({ status: 'CONCILIATED' })).toBe(true);
        expect(tituloDaFolhaPreservado({ status: 'CANCELLED' })).toBe(true);
        expect(tituloDaFolhaPreservado({ status: 'PENDING', business_status: 'PAGO' })).toBe(true);
        expect(tituloDaFolhaPreservado({ status: 'PENDING', darf_id: 'd' })).toBe(true);
        expect(tituloDaFolhaPreservado({ status: 'PENDING', conciliado: true })).toBe(true);
        expect(tituloDaFolhaPreservado({ status: 'PENDING', pagamentoAsaas: true })).toBe(true);
        expect(tituloDaFolhaPreservado({ status: 'PENDING', business_status: 'PREVISTO' })).toBe(false);
    });
});

describe('custoPorDestino', () => {
    it('custo do empregador = custo da folha + CPP + RAT + terceiros, pela fatia', () => {
        const [d] = custoPorDestino([colabJunho()], CFG);
        expect(d.destino).toBeNull();
        expect(d.custo).toBe(Math.round((5667 + 453.36 + 5667 * (0.2 + 0.03 + 0.058)) * 100) / 100);
    });
});

describe('tributosDoProlabore (22/10/2026)', () => {
    // 07/2026 da Alpa recalculado: bruto 5.000, INSS 11% = 550, CPP 20% = 1.000, IRRF 0.
    const p = { id: 'f1c50980', competence_month: '2026-07-01', inss_total: 550, irrf_total: 0, patronal_total: 1000 };

    it('INSS do sócio e cota patronal viram tributos TAX-ready, vencendo no dia 20; IRRF zerado não gera linha', () => {
        const t = tributosDoProlabore(p);
        expect(t.map(l => [l.tipo, l.amount, l.due_date])).toEqual([
            ['inss', 550, '2026-08-20'],
            ['cpp', 1000, '2026-08-20'],
        ]);
        expect(t[0]).toMatchObject({ reference_id: 'prolabore-f1c50980-inss', party_name: 'INSS (pró-labore)', transaction_date: '2026-07-01' });
        expect(t[1].description).toBe('INSS patronal (pró-labore) - Pró-labore 07/2026');
    });

    it('IRRF retido gera o seu título; competência igual à da folha do mês (pode ir no mesmo DARF)', () => {
        const t = tributosDoProlabore({ ...p, irrf_total: 87.5 });
        expect(t.find(l => l.tipo === 'irrf')).toMatchObject({ amount: 87.5, party_name: 'IRRF (pró-labore)' });
        expect(t.every(l => l.transaction_date.startsWith('2026-07'))).toBe(true);
    });

    it('vencimento no fim de semana antecipa (20/06/2026 é sábado)', () => {
        expect(tributosDoProlabore({ ...p, competence_month: '2026-05-01' })[0].due_date).toBe('2026-06-19');
    });
});

