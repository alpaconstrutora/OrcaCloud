// @vitest-environment jsdom
/**
 * Aba Acompanhamento — viabilidade × realizado (item 10.4 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const realizado = vi.hoisted(() => ({ doEstudo: vi.fn() }));
const svc = vi.hoisted(() => ({ listarVersoes: vi.fn(), snapshotDaVersao: vi.fn() }));
vi.mock('../../services/imovibRealizadoService', () => ({ imovibRealizadoService: realizado }));
vi.mock('../../services/imovibService', () => ({ imovibService: svc }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import ImovibAcompanhamentoTab from '../../components/ImovibAcompanhamentoTab';
import { baseStudy } from '../fixtures/imovibEstudos';
import userEvent from '@testing-library/user-event';

const vinculado = { origem: 'empreendimento' as const, empreendimento_id: 'emp-1', empreendimento_nome: 'Residencial', blueprint_study_id: null, torres: 1, unidades: 40, blocos_fora_do_calculo: [] };
const tela = (over: Record<string, unknown> = {}) =>
    render(<ImovibAcompanhamentoTab study={{ ...baseStudy({ estrutura: vinculado, ...over }), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never} />);

beforeEach(() => {
    realizado.doEstudo.mockReset();
    svc.listarVersoes.mockReset().mockResolvedValue([]);
    svc.snapshotDaVersao.mockReset();
});

// Fase 7.4 (plano 2026-11-21-imovib-oportunidades-consolidacao): o realizado traz o VGV do espelho.
const ESPELHO = {
    vendido: { count: 2, value: 1_400_000 }, vendidasSemNegociacao: 0, reservado: { count: 1, value: 600_000 },
    disponivel: { count: 3, value: 1_800_000 }, permutado: { count: 1, value: 500_000 }, naoVendaveis: 4, vgvTotal: 3_800_000,
};

describe('10.4 — aba Acompanhamento', () => {
    // Plano 2026-11-19-imovib-versoes-editar-excluir, F3.4: com versão em edição, o "previsto" do estudo
    // é o da versão até a edição terminar — a aba avisa.
    it('estudo em edição de versão: avisa que o previsto é o da versão', async () => {
        realizado.doEstudo.mockResolvedValue({ obras: [], obrasDeOutraOrganizacao: [], financeiro: [], aConciliar: { entradas: 0, saidas: 0 }, vendas: [], vendidasSemNegociacao: 0, espelho: ESPELHO });
        tela({ base_date: '2026-01', edicao_versao: { version_id: 'v1', version_label: 'Cenário banco', started_by: 'u1', started_by_name: 'Ana', started_at: '2026-11-19T17:05:00Z' } });
        expect(await screen.findByText(/Estudo em edição da versão «Cenário banco» por «Ana»/)).toBeTruthy();
    });

    it('sem data-base: pede a data-base em vez de alinhar por conta própria', async () => {
        tela({ base_date: null });
        expect(await screen.findByText(/informe a data-base/i)).toBeTruthy();
        expect(realizado.doEstudo).not.toHaveBeenCalled();
    });

    it('com obra: tabela mensal com previsto, realizado e desvio; mês sem lançamento fica "—"', async () => {
        realizado.doEstudo.mockResolvedValue({
            obras: [{ id: 'o1', nome: 'Obra Garden' }],
            obrasDeOutraOrganizacao: [],
            financeiro: [{ mes: '2026-02', entradas: 0, saidas: 120_000 }],
            aConciliar: { entradas: 0, saidas: 0 },
            vendas: [{ mes: '2026-01', unidades: 2, valor: 1_400_000 }],
            vendidasSemNegociacao: 0, espelho: ESPELHO,
        });
        tela({ base_date: '2026-01' });
        const tabela = await screen.findByRole('region', { name: 'Mês a mês' });
        expect(within(tabela).getAllByText('jan/26').length).toBeGreaterThan(0);
        expect(within(tabela).getAllByText('—').length).toBeGreaterThan(0);
        expect(screen.getByText(/Obra Garden/)).toBeTruthy();
        expect(screen.getByText('Receita e custo acumulados')).toBeTruthy();
        expect(screen.getByText('Vendas acumuladas')).toBeTruthy();
    });

    it('VGV: estudo × espelho × vendido, com o espelho pela regra única (Fase 7.4)', async () => {
        realizado.doEstudo.mockResolvedValue({ obras: [], obrasDeOutraOrganizacao: [], financeiro: [], aConciliar: { entradas: 0, saidas: 0 }, vendas: [], vendidasSemNegociacao: 0, espelho: ESPELHO });
        tela({ base_date: '2026-01' });
        const quadro = await screen.findByRole('region', { name: 'VGV do estudo, do espelho e vendido' });
        expect(quadro.textContent).toContain('VGV do espelho');
        expect(quadro.textContent).toMatch(/3\.800\.000/);
        expect(quadro.textContent).toMatch(/1\.400\.000/);
        expect(quadro.textContent).toMatch(/2\.400\.000/);
        expect(quadro.textContent).toContain('1 permutada(s) fora do VGV');
    });

    it('diz que o realizado é só o conciliado, mostra o lançado a conciliar, a obra de outra organização e as vendas sem data', async () => {
        realizado.doEstudo.mockResolvedValue({
            obras: [{ id: 'o1', nome: 'Obra Garden' }],
            obrasDeOutraOrganizacao: ['Obra Vizinha'],
            financeiro: [{ mes: '2026-02', entradas: 0, saidas: 62 }],
            aConciliar: { entradas: 0, saidas: 198_756 },
            vendas: [],
            vendidasSemNegociacao: 4, espelho: ESPELHO,
        });
        tela({ base_date: '2026-01' });
        expect(await screen.findByText(/só lançamentos conciliados/i)).toBeTruthy();
        expect(screen.getByText(/198\.756/)).toBeTruthy();
        expect(screen.getByText(/Obra Vizinha/)).toBeTruthy();
        expect(screen.getByText(/4 unidades vendidas sem negociação/i)).toBeTruthy();
    });

    it('realizado de antes da data-base: a tela diz que entra no primeiro mês', async () => {
        realizado.doEstudo.mockResolvedValue({
            obras: [{ id: 'o1', nome: 'Obra Garden' }], obrasDeOutraOrganizacao: [],
            financeiro: [{ mes: '2025-11', entradas: 0, saidas: 50_000 }], aConciliar: { entradas: 0, saidas: 0 },
            vendas: [], vendidasSemNegociacao: 0, espelho: ESPELHO,
        });
        tela({ base_date: '2026-01' });
        expect(await screen.findByText(/realizado de antes da data-base/i)).toBeTruthy();
    });

    it('sem obra vinculada: mostra só as vendas e diz por quê', async () => {
        realizado.doEstudo.mockResolvedValue({ obras: [], obrasDeOutraOrganizacao: [], financeiro: [], aConciliar: { entradas: 0, saidas: 0 }, vendas: [{ mes: '2026-01', unidades: 1, valor: 700_000 }], vendidasSemNegociacao: 0, espelho: ESPELHO });
        tela({ base_date: '2026-01' });
        expect(await screen.findByText(/não tem obra vinculada/i)).toBeTruthy();
        expect(screen.queryByText('Receita e custo acumulados')).toBeNull();
        expect(screen.getByText('Vendas acumuladas')).toBeTruthy();
    });

    it('erro ao ler o realizado aparece, sem quebrar a aba', async () => {
        realizado.doEstudo.mockRejectedValue(new Error('rede caiu'));
        tela({ base_date: '2026-01' });
        expect(await screen.findByText(/rede caiu/)).toBeTruthy();
    });
});

/** Deixado para depois na revisão das pendências: o gráfico usava a data-base do estudo atual. */
describe('previsto de versão com outra data-base', () => {
    it('os gráficos usam a data-base da versão escolhida (nome acessível com o período)', async () => {
        const user = userEvent.setup();
        realizado.doEstudo.mockResolvedValue({
            obras: [{ id: 'o1', nome: 'Obra Garden' }], obrasDeOutraOrganizacao: [],
            financeiro: [], aConciliar: { entradas: 0, saidas: 0 }, vendas: [], vendidasSemNegociacao: 0, espelho: ESPELHO,
        });
        svc.listarVersoes.mockResolvedValue([{ id: 'v1', study_id: 'estudo-teste', label: 'Comitê de março', notes: null, results: {}, created_at: '2025-03-01', created_by: null }]);
        svc.snapshotDaVersao.mockResolvedValue({ ...baseStudy(), base_date: '2025-03' });
        tela({ base_date: '2026-01' });
        await user.selectOptions(await screen.findByLabelText('Previsto de'), 'v1');
        const fig = await screen.findByRole('img', { name: /Vendas acumuladas de mar\/25/ });
        expect(fig).toBeTruthy();
        expect(screen.getByRole('img', { name: /Receita e custo acumulados de mar\/25/ })).toBeTruthy();
    });
});
