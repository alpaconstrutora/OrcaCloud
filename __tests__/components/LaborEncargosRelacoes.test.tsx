// @vitest-environment jsdom
/**
 * RH › Encargos Sociais — abas "Encargos de INSS" e "Relação por Empregado"
 * (docs/planos/2026-10-22-encargos-inss-relacao-por-empregado.md). Dados das
 * folhas FECHADAS da Alpa 06/2026 e da Garden 05/2026 como estavam no banco em
 * 22/10/2026; os totais esperados são os dos títulos em Tributos a Pagar.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { encargosPadrao } from '../../utils/folhaFinanceiro';
import type { DadosDaFolhaDoMes } from '../../utils/relacoesDaFolha';

const ALPA = 'org-alpa', GARDEN = 'org-garden', SEM_FOLHA = 'org-sem-folha';
const cfg = encargosPadrao(null);
const rubricas = [
    { code: 'SALARIO', name: 'Salário Base', organization_id: null },
    { code: 'INSS', name: 'Desconto INSS', organization_id: null },
    { code: 'ADIANTAMENTO', name: 'Adiantamento', organization_id: ALPA },
    { code: 'GRATIFICAÇÃO', name: 'GRATIFICAÇÃO', organization_id: ALPA },
    { code: 'FGTS', name: 'FGTS (Encargo)', organization_id: ALPA },
];
const res = (run: string, emp: string, gross: number, net: number) => ({ payroll_run_id: run, employee_id: emp, gross, net, base_inss: gross });
const it_ = (run: string, emp: string, code: string, type: string, amount: number) => ({ payroll_run_id: run, employee_id: emp, code, type, amount });

const FOLHAS: Record<string, { org: { id: string; name: string; cnpj: string | null }; dados: DadosDaFolhaDoMes }> = {
    [ALPA]: {
        org: { id: ALPA, name: 'Alpa Construtora e Incorporadora', cnpj: '00.000.000/0001-00' },
        dados: {
            orgId: ALPA, cfg, rubricas,
            folhas: [{ id: 'a06', type: 'mensal' }],
            resultados: [res('a06', 'claudinei', 4046, 1992.79), res('a06', 'rogerio', 1621, 1499.43), res('a06', 'altair', 0, 0), res('a06', 'ricardo', 0, 0)],
            itens: [
                it_('a06', 'claudinei', 'SALARIO', 'provento', 4046), it_('a06', 'claudinei', 'INSS', 'desconto', -374.12),
                it_('a06', 'claudinei', 'ADIANTAMENTO', 'desconto', -1679.09), it_('a06', 'claudinei', 'FGTS', 'encargo', 323.68),
                it_('a06', 'rogerio', 'SALARIO', 'provento', 1621), it_('a06', 'rogerio', 'INSS', 'desconto', -121.57),
                it_('a06', 'rogerio', 'FGTS', 'encargo', 129.68),
            ],
            colaboradores: [
                { id: 'claudinei', name: 'Claudinei da Costa Vieira', matricula: '002' },
                { id: 'rogerio', name: 'Rogério da Silva Santos', matricula: '001' },
                { id: 'altair', name: 'Altair Pereira da Rosa', matricula: null },
                { id: 'ricardo', name: 'Ricardo Fernandes', matricula: null },
            ],
        },
    },
    [GARDEN]: {
        org: { id: GARDEN, name: 'Construção do Edifício Garden Cambuhy SPE', cnpj: null },
        dados: {
            orgId: GARDEN, cfg, rubricas,
            folhas: [{ id: 'g05', type: 'mensal' }],
            resultados: [res('g05', 'clovis', 2909.54, 1680.99), res('g05', 'iago', 3000, 2751.4)],
            itens: [
                it_('g05', 'clovis', 'SALARIO', 'provento', 2477.02), it_('g05', 'clovis', 'GRATIFICAÇÃO', 'provento', 432.52),
                it_('g05', 'clovis', 'INSS', 'desconto', -237.74), it_('g05', 'clovis', 'ADIANTAMENTO', 'desconto', -990.81),
                it_('g05', 'clovis', 'FGTS', 'encargo', 232.76),
                it_('g05', 'iago', 'SALARIO', 'provento', 3000), it_('g05', 'iago', 'INSS', 'desconto', -248.6),
                it_('g05', 'iago', 'FGTS', 'encargo', 240),
            ],
            colaboradores: [
                { id: 'clovis', name: 'Clovis Mariano da Rosa', matricula: null },
                { id: 'iago', name: 'iago Marques', matricula: null },
            ],
        },
    },
    [SEM_FOLHA]: {
        org: { id: SEM_FOLHA, name: 'Organização Sem Folha', cnpj: null },
        dados: { orgId: SEM_FOLHA, cfg, rubricas, folhas: [], resultados: [], itens: [], colaboradores: [] },
    },
};

const carregar = vi.hoisted(() => vi.fn());
vi.mock('../../services/payrollService', () => ({ payrollService: { carregarFolhasFechadasDoMes: carregar } }));

import LaborEncargosINSS from '../../components/LaborEncargosINSS';
import LaborFolhaEmpregado from '../../components/LaborFolhaEmpregado';

const ORGS = [
    { id: ALPA, name: FOLHAS[ALPA].org.name },
    { id: GARDEN, name: FOLHAS[GARDEN].org.name },
    { id: SEM_FOLHA, name: FOLHAS[SEM_FOLHA].org.name },
];

beforeEach(() => {
    localStorage.clear();
    carregar.mockReset();
    carregar.mockImplementation(async (orgId: string) => FOLHAS[orgId]);
});

describe('Encargos de INSS', () => {
    it('mostra a relação da organização do topo com os totais da guia', async () => {
        render(<LaborEncargosINSS orgId={ALPA} organizations={ORGS} period="2026-06" />);
        await screen.findByText('Claudinei da Costa Vieira');
        expect(carregar).toHaveBeenCalledWith(ALPA, '2026-06');
        expect(carregar).toHaveBeenCalledTimes(1);
        expect(screen.getByText('R$ 2.127,79')).toBeInTheDocument();      // total da guia
        expect(screen.getAllByText('R$ 1.133,40').length).toBeGreaterThan(0); // CPP
        expect(screen.getAllByText('R$ 495,69').length).toBeGreaterThan(0);   // segurados
        expect(screen.getByText(/Altair Pereira da Rosa, Ricardo Fernandes/)).toBeInTheDocument();
        // colunas que eram sempre zero saíram
        expect(screen.queryByText('Excedente')).toBeNull();
        expect(screen.queryByText(/Ded\.sal\.mat/)).toBeNull();
    });

    it('em "Todas as organizações" mostra um bloco por organização, nunca a tela em branco', async () => {
        render(<LaborEncargosINSS orgId={null} organizations={ORGS} period="2026-06" />);
        await screen.findByText('Claudinei da Costa Vieira');
        expect(carregar).toHaveBeenCalledTimes(3);
        expect(screen.getByRole('heading', { name: FOLHAS[ALPA].org.name })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: FOLHAS[GARDEN].org.name })).toBeInTheDocument();
        expect(screen.getByText('iago Marques')).toBeInTheDocument();
        expect(screen.getByText(/Sem folha fechada: Organização Sem Folha/)).toBeInTheDocument();
        // a guia da Garden 05/2026, ao centavo com Tributos a Pagar
        const cabecalhoGarden = screen.getByText(/Garden/, { selector: 'h2' }).closest('div')!.parentElement!;
        expect(cabecalhoGarden.textContent!.replace(/\s/g, ' ')).toContain('Guia R$ 2.188,29');
    });

    it('sem folha fechada diz o que fazer', async () => {
        render(<LaborEncargosINSS orgId={SEM_FOLHA} organizations={ORGS} period="2026-06" />);
        expect(await screen.findByText('Nenhuma folha fechada em 06/2026')).toBeInTheDocument();
    });

    it('erro da consulta aparece, não vira tela vazia', async () => {
        carregar.mockRejectedValueOnce({ code: '42703', message: 'column employees.registration_number does not exist' });
        render(<LaborEncargosINSS orgId={ALPA} organizations={ORGS} period="2026-06" />);
        expect(await screen.findByText(/registration_number does not exist/)).toBeInTheDocument();
    });
});

describe('Relação por Empregado', () => {
    it('lista os nomes do cadastro (não o id) e fecha os totais', async () => {
        render(<LaborFolhaEmpregado orgId={GARDEN} organizations={ORGS} period="2026-05" />);
        const linha = (await screen.findByText('Clovis Mariano da Rosa')).closest('tr')!;
        expect(within(linha).getByText('R$ 1.680,99')).toBeInTheDocument();
        expect(within(linha).getByText('R$ 990,81')).toBeInTheDocument();
        expect(screen.queryByText('clovis')).toBeNull();
        expect(screen.getAllByText('R$ 4.432,39').length).toBeGreaterThan(0);   // líquido total
    });

    it('em "Todas" mostra as duas folhas e avisa quem não tem', async () => {
        render(<LaborFolhaEmpregado orgId={null} organizations={ORGS} period="2026-05" />);
        await screen.findByText('Clovis Mariano da Rosa');
        expect(screen.getByText('Rogério da Silva Santos')).toBeInTheDocument();
        expect(screen.getByText(/Sem folha fechada: Organização Sem Folha/)).toBeInTheDocument();
    });
});
