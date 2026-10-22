import { describe, it, expect } from 'vitest';
import { relacaoInss, relacaoFolhaPorEmpregado, DadosDaFolhaDoMes } from '../utils/relacoesDaFolha';
import { encargosPadrao } from '../utils/folhaFinanceiro';

const ORG = 'org-alpa';
const cfg = encargosPadrao(null); // CPP 20%, RAT 3% × FAP 1, terceiros FPAS 507 (5,8%)

const rubricas = [
    { code: 'SALARIO', name: 'Salário Base', organization_id: null },
    { code: 'GRATIFICAÇÃO', name: 'GRATIFICAÇÃO', organization_id: ORG },
    { code: 'SALFAM', name: 'Salário Família', organization_id: ORG },
    { code: 'INSS', name: 'Desconto INSS', organization_id: null },
    { code: 'IRRF', name: 'IRRF', organization_id: null },
    { code: 'ADIANTAMENTO', name: 'Adiantamento', organization_id: ORG },
    { code: 'FGTS', name: 'FGTS (Encargo)', organization_id: ORG },
    { code: 'VR', name: 'Vale Refeição (informativo)', organization_id: ORG },
];

/** Alpa 06/2026, como está no banco em 22/10/2026 (2 colaboradores com valor + 2 zerados). */
function alpa062026(): DadosDaFolhaDoMes {
    return {
        orgId: ORG,
        folhas: [{ id: 'run-06', type: 'mensal' }],
        resultados: [
            { payroll_run_id: 'run-06', employee_id: 'claudinei', gross: 4046, net: 1992.79, base_inss: 4046 },
            { payroll_run_id: 'run-06', employee_id: 'rogerio', gross: 1621, net: 1499.43, base_inss: 1621 },
            { payroll_run_id: 'run-06', employee_id: 'altair', gross: 0, net: 0, base_inss: 0 },
            { payroll_run_id: 'run-06', employee_id: 'ricardo', gross: 0, net: 0, base_inss: 0 },
        ],
        itens: [
            { payroll_run_id: 'run-06', employee_id: 'claudinei', code: 'SALARIO', type: 'provento', amount: 4046 },
            { payroll_run_id: 'run-06', employee_id: 'claudinei', code: 'INSS', type: 'desconto', amount: -374.12 },
            { payroll_run_id: 'run-06', employee_id: 'claudinei', code: 'ADIANTAMENTO', type: 'desconto', amount: -1679.09 },
            { payroll_run_id: 'run-06', employee_id: 'claudinei', code: 'FGTS', type: 'encargo', amount: 323.68 },
            { payroll_run_id: 'run-06', employee_id: 'claudinei', code: 'VR', type: 'informativa', amount: 500 },
            { payroll_run_id: 'run-06', employee_id: 'rogerio', code: 'SALARIO', type: 'provento', amount: 1621 },
            { payroll_run_id: 'run-06', employee_id: 'rogerio', code: 'INSS', type: 'desconto', amount: -121.57 },
            { payroll_run_id: 'run-06', employee_id: 'rogerio', code: 'FGTS', type: 'encargo', amount: 129.68 },
        ],
        colaboradores: [
            { id: 'claudinei', name: 'Claudinei da  Costa Vieira', matricula: '002' },
            { id: 'rogerio', name: 'Rogério da Silva Santos', matricula: '001' },
            { id: 'altair', name: 'Altair Pereira da Rosa', matricula: null },
            { id: 'ricardo', name: 'Ricardo Fernandes', matricula: null },
        ],
        rubricas,
        cfg,
    };
}

describe('relacaoInss', () => {
    it('bate com os títulos de Tributos a Pagar da Alpa 06/2026', () => {
        const r = relacaoInss(alpa062026());
        expect(r.totais.base).toBe(5667);
        expect(r.totais.segurados).toBe(495.69);
        expect(r.totais.cpp).toBe(1133.4);
        expect(r.totais.rat).toBe(170.01);
        expect(r.totais.terceiros).toBe(328.69);
        expect(r.totais.totalGuia).toBe(2127.79);
        expect(r.aliquotas).toEqual({ cpp: 0.2, rat: 0.03, terceiros: expect.closeTo(0.058, 6) });
    });

    it('lista por nome, com matrícula, e deixa os zerados fora (contados à parte)', () => {
        const r = relacaoInss(alpa062026());
        expect(r.linhas.map(l => l.nome)).toEqual(['Claudinei da  Costa Vieira', 'Rogério da Silva Santos']);
        expect(r.linhas[0]).toMatchObject({ matricula: '002', base: 4046, inss: 374.12 });
        expect(r.linhas[0].aliquotaEfetiva).toBeCloseTo(374.12 / 4046, 8);
        expect(r.semValor).toEqual(['Altair Pereira da Rosa', 'Ricardo Fernandes']);
    });

    it('soma férias/rescisão/13º do mês e ignora adiantamento (que não é fato gerador próprio)', () => {
        const d = alpa062026();
        d.folhas.push({ id: 'run-ferias', type: 'ferias' }, { id: 'run-adto', type: 'adiantamento' });
        d.resultados.push(
            { payroll_run_id: 'run-ferias', employee_id: 'rogerio', gross: 2161.33, net: 2000, base_inss: 2161.33 },
            { payroll_run_id: 'run-adto', employee_id: 'rogerio', gross: 648.4, net: 648.4, base_inss: 1621 },
        );
        d.itens.push(
            { payroll_run_id: 'run-ferias', employee_id: 'rogerio', code: 'INSS', type: 'desconto', amount: -170.9 },
            { payroll_run_id: 'run-adto', employee_id: 'rogerio', code: 'INSS', type: 'desconto', amount: -121.57 },
        );
        const r = relacaoInss(d);
        const rogerio = r.linhas.find(l => l.employeeId === 'rogerio')!;
        expect(rogerio.base).toBeCloseTo(1621 + 2161.33, 2);
        expect(rogerio.inss).toBeCloseTo(121.57 + 170.9, 2);
        expect(r.calculos).toEqual(['Folha mensal', 'Férias']);
    });

    it('INSS é o desconto de código INSS — a mesma regra dos títulos, não o nome da rubrica', () => {
        const d = alpa062026();
        d.rubricas = [...d.rubricas, { code: 'PENSAO', name: 'Pensão (base INSS)', organization_id: ORG }];
        d.itens.push({ payroll_run_id: 'run-06', employee_id: 'rogerio', code: 'PENSAO', type: 'desconto', amount: -50 });
        expect(relacaoInss(d).totais.segurados).toBe(495.69);
    });

    it('base nula cai no bruto, como no sync da folha', () => {
        const d = alpa062026();
        d.resultados[1].base_inss = null;
        expect(relacaoInss(d).totais.base).toBe(5667);
    });

    it('sem folha que entre na relação → vazia, sem quebrar', () => {
        const d = alpa062026();
        d.folhas = [{ id: 'run-06', type: 'adiantamento' }];
        const r = relacaoInss(d);
        expect(r.linhas).toEqual([]);
        expect(r.totais.totalGuia).toBe(0);
        expect(r.calculos).toEqual([]);
    });
});

describe('relacaoFolhaPorEmpregado', () => {
    it('separa salário, descontos e FGTS e fecha com o líquido', () => {
        const r = relacaoFolhaPorEmpregado(alpa062026());
        const c = r.linhas.find(l => l.employeeId === 'claudinei')!;
        expect(c).toMatchObject({
            nome: 'Claudinei da  Costa Vieira', matricula: '002',
            salario: 4046, outrosProventos: 0, salarioFamilia: 0,
            inss: 374.12, irrf: 0, outrosDescontos: 1679.09, liquido: 1992.79, fgts: 323.68,
        });
        expect(c.salario + c.outrosProventos + c.salarioFamilia - c.inss - c.irrf - c.outrosDescontos)
            .toBeCloseTo(c.liquido, 2);
        expect(r.totais.liquido).toBeCloseTo(1992.79 + 1499.43, 2);
        expect(r.totais.fgts).toBeCloseTo(453.36, 2);
    });

    it('nome vem do cadastro (nunca o id) e zerados ficam fora', () => {
        const r = relacaoFolhaPorEmpregado(alpa062026());
        expect(r.linhas.map(l => l.nome)).toEqual(['Claudinei da  Costa Vieira', 'Rogério da Silva Santos']);
        expect(r.semValor).toEqual(['Altair Pereira da Rosa', 'Ricardo Fernandes']);
    });

    it('colaborador fora do cadastro aparece com rótulo, não com o UUID', () => {
        const d = alpa062026();
        d.colaboradores = d.colaboradores.filter(c => c.id !== 'rogerio');
        const r = relacaoFolhaPorEmpregado(d);
        expect(r.linhas.map(l => l.nome)).toContain('Colaborador sem cadastro');
        expect(r.linhas.map(l => l.nome)).not.toContain('rogerio');
    });

    it('gratificação é outro provento; salário-família tem coluna própria; informativa não entra', () => {
        const d = alpa062026();
        d.itens.push(
            { payroll_run_id: 'run-06', employee_id: 'rogerio', code: 'GRATIFICAÇÃO', type: 'provento', amount: 200 },
            { payroll_run_id: 'run-06', employee_id: 'rogerio', code: 'SALFAM', type: 'provento', amount: 65 },
        );
        const r = relacaoFolhaPorEmpregado(d).linhas.find(l => l.employeeId === 'rogerio')!;
        expect(r).toMatchObject({ salario: 1621, outrosProventos: 200, salarioFamilia: 65 });
    });

    it('rubrica da organização da folha vence a de outra organização com o mesmo código', () => {
        const d = alpa062026();
        d.rubricas = [
            ...d.rubricas.filter(r => r.code !== 'SALFAM'),
            { code: 'SALFAM', name: 'Gratificação X', organization_id: 'outra-org' },
            { code: 'SALFAM', name: 'Salário Família', organization_id: ORG },
        ];
        d.itens.push({ payroll_run_id: 'run-06', employee_id: 'rogerio', code: 'SALFAM', type: 'provento', amount: 65 });
        expect(relacaoFolhaPorEmpregado(d).linhas.find(l => l.employeeId === 'rogerio')!.salarioFamilia).toBe(65);
    });

    it('só entra a folha mensal', () => {
        const d = alpa062026();
        d.folhas.push({ id: 'run-ferias', type: 'ferias' });
        d.resultados.push({ payroll_run_id: 'run-ferias', employee_id: 'rogerio', gross: 2161.33, net: 2000, base_inss: 2161.33 });
        const r = relacaoFolhaPorEmpregado(d);
        expect(r.linhas.find(l => l.employeeId === 'rogerio')!.liquido).toBe(1499.43);
    });
});
