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

const vinculado = { origem: 'empreendimento' as const, empreendimento_id: 'emp-1', empreendimento_nome: 'Residencial', blueprint_study_id: null, torres: 1, unidades: 40, blocos_fora_do_calculo: [] };
const tela = (over: Record<string, unknown> = {}) =>
    render(<ImovibAcompanhamentoTab study={{ ...baseStudy({ estrutura: vinculado, ...over }), organization_id: 'org', version: '1.0', created_at: '', updated_at: '' } as never} />);

beforeEach(() => {
    realizado.doEstudo.mockReset();
    svc.listarVersoes.mockReset().mockResolvedValue([]);
    svc.snapshotDaVersao.mockReset();
});

describe('10.4 — aba Acompanhamento', () => {
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
            vendidasSemNegociacao: 0,
        });
        tela({ base_date: '2026-01' });
        const tabela = await screen.findByRole('region', { name: 'Mês a mês' });
        expect(within(tabela).getAllByText('jan/26').length).toBeGreaterThan(0);
        expect(within(tabela).getAllByText('—').length).toBeGreaterThan(0);
        expect(screen.getByText(/Obra Garden/)).toBeTruthy();
        expect(screen.getByText('Receita e custo acumulados')).toBeTruthy();
        expect(screen.getByText('Vendas acumuladas')).toBeTruthy();
    });

    it('diz que o realizado é só o conciliado, mostra o lançado a conciliar, a obra de outra organização e as vendas sem data', async () => {
        realizado.doEstudo.mockResolvedValue({
            obras: [{ id: 'o1', nome: 'Obra Garden' }],
            obrasDeOutraOrganizacao: ['Obra Vizinha'],
            financeiro: [{ mes: '2026-02', entradas: 0, saidas: 62 }],
            aConciliar: { entradas: 0, saidas: 198_756 },
            vendas: [],
            vendidasSemNegociacao: 4,
        });
        tela({ base_date: '2026-01' });
        expect(await screen.findByText(/só lançamentos conciliados/i)).toBeTruthy();
        expect(screen.getByText(/198\.756/)).toBeTruthy();
        expect(screen.getByText(/Obra Vizinha/)).toBeTruthy();
        expect(screen.getByText(/4 unidades vendidas sem negociação/i)).toBeTruthy();
    });

    it('sem obra vinculada: mostra só as vendas e diz por quê', async () => {
        realizado.doEstudo.mockResolvedValue({ obras: [], obrasDeOutraOrganizacao: [], financeiro: [], aConciliar: { entradas: 0, saidas: 0 }, vendas: [{ mes: '2026-01', unidades: 1, valor: 700_000 }], vendidasSemNegociacao: 0 });
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
