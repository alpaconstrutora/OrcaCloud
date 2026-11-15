// @vitest-environment jsdom
/**
 * Fase 4 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md: o painel de
 * viabilidade do investidor mostra a VERSÃO publicada; a simulação não mexe nela; o PDF é a edição
 * do investidor do relatório completo.
 */
import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const pdf = vi.hoisted(() => ({ gerar: vi.fn(), save: vi.fn() }));
vi.mock('../../components/ImovibGraficosParaPdf', () => ({ gerarRelatorioCompleto: pdf.gerar }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;

import ImovibPainelDoInvestidor from '../../components/investor/portal/ImovibPainelDoInvestidor';
import { resultadosDoEstudo, type VersaoPublicada } from '../../utils/imovibVersoes';
import { baseStudy } from '../fixtures/imovibEstudos';

// A Testing Library normaliza o texto do elemento (espaço não separável vira espaço), não o procurado.
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/\s/g, ' ');
const vp = (): VersaoPublicada => ({
    study: baseStudy() as never,
    cenarios: [{ id: 'c1', study_id: 'e', name: 'Pessimista', kind: 'pessimista', choques: { preco: -10 }, sort_order: 0 }] as never,
    relatorio: { riscos: [] },
    versao: { id: 'v1', label: 'Comitê de novembro', created_at: '2026-11-15T13:40:00Z' },
    organizacao: { name: 'Alpa', logo_url: null },
});

beforeEach(() => {
    pdf.gerar.mockReset();
    pdf.save.mockReset();
    pdf.gerar.mockResolvedValue({ save: pdf.save });
});

describe('painel de viabilidade do investidor', () => {
    it('diz a versão e mostra os indicadores dela', () => {
        const v = vp();
        render(<ImovibPainelDoInvestidor versaoPublicada={v} study={v.study} cenarios={v.cenarios} accent="portal" />);
        expect(screen.getByText('Versão Comitê de novembro · congelada em 15/11/2026')).toBeTruthy();
        const kpis = screen.getByRole('region', { name: 'Indicadores da versão' });
        expect(within(kpis).getByText(brl(resultadosDoEstudo(v.study).vpl))).toBeTruthy();
        expect(within(kpis).getByText('TIR')).toBeTruthy();
        expect(within(kpis).getByText('Exposição máxima')).toBeTruthy();
    });

    it('a simulação muda os números dela e não os da versão', () => {
        const v = vp();
        render(<ImovibPainelDoInvestidor versaoPublicada={v} study={v.study} cenarios={v.cenarios} accent="portal" />);
        const kpis = screen.getByRole('region', { name: 'Indicadores da versão' });
        const vplDaVersao = brl(resultadosDoEstudo(v.study).vpl);
        const simulacao = screen.getByRole('region', { name: 'Simulação' });
        expect(within(simulacao).getByText('Simulação — não altera a versão publicada')).toBeTruthy();
        fireEvent.change(within(simulacao).getByLabelText('Preço de venda'), { target: { value: '10' } });
        expect(within(kpis).getByText(vplDaVersao)).toBeTruthy();
        expect(within(simulacao).queryByText(vplDaVersao)).toBeNull();
    });

    it('o PDF é a edição do investidor do relatório da versão', async () => {
        const user = userEvent.setup();
        const v = vp();
        render(<ImovibPainelDoInvestidor versaoPublicada={v} study={v.study} cenarios={v.cenarios} accent="portal" />);
        await user.click(screen.getByRole('button', { name: 'Baixar relatório (PDF)' }));
        await waitFor(() => expect(pdf.save).toHaveBeenCalledWith('Relatorio_Estudo_teste_Comitê_de_novembro.pdf'));
        const [dados, opcoes] = pdf.gerar.mock.calls[0];
        expect(dados.study.name).toBe('Estudo teste');
        expect(dados.hoje).toBe('2026-11-15');
        expect(dados.cenarios).toHaveLength(1);
        expect(opcoes).toEqual({ edicao: 'investidor', versao: v.versao, organizacao: v.organizacao });
    });

    it('prévia do gestor sem versão: sem botão de PDF, com o aviso', () => {
        render(<ImovibPainelDoInvestidor versaoPublicada={null} study={baseStudy() as never} cenarios={[]} accent="indigo"
            aviso={<p>Prévia do estudo atual.</p>} />);
        expect(screen.getByText('Prévia do estudo atual.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Baixar relatório (PDF)' })).toBeNull();
    });
});
